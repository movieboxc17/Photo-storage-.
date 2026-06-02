const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { db, getSetting, setSetting } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const loginPath = `/${process.env.ADMIN_PATH_SEGMENT || 'x7k2-login'}`;
const loginUrl = `/admin${loginPath}`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 50,
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  }
});

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function getFlash(req) {
  const flash = req.session.flash;
  delete req.session.flash;
  return flash || null;
}

function getStorageStats() {
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'original');
  let totalBytes = 0;
  if (fs.existsSync(uploadsDir)) {
    for (const file of fs.readdirSync(uploadsDir)) {
      const fullPath = path.join(uploadsDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) totalBytes += stat.size;
    }
  }
  return totalBytes;
}

function bytesToHuman(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function generateAccessCode() {
  return crypto.randomInt(0, 100000).toString().padStart(5, '0');
}

router.get(loginPath, (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');

  res.render('admin/login', {
    siteTitle: req.app.locals.siteTitle,
    flash: getFlash(req)
  });
});

router.post(loginPath, async (req, res) => {
  const { username, password } = req.body;
  const savedUsername = getSetting('admin_username');
  const savedHash = getSetting('admin_password_hash');

  const ok = username === savedUsername && savedHash && (await bcrypt.compare(password || '', savedHash));
  if (!ok) {
    setFlash(req, 'error', 'Invalid credentials.');
    return res.redirect(loginUrl);
  }

  req.session.isAdmin = true;
  setFlash(req, 'success', 'Welcome back.');
  return res.redirect('/admin');
});

router.post('/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.redirect(loginUrl);
  });
});

router.get('/', requireAdmin, (req, res) => {
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM albums) AS albumCount,
      (SELECT COUNT(*) FROM photos) AS photoCount
  `).get();

  const albums = db.prepare(`
    SELECT a.*, p.filename AS cover_filename,
      (SELECT COUNT(*) FROM photos WHERE album_id = a.id) AS photo_count,
      (SELECT COALESCE(SUM(size), 0) FROM photos WHERE album_id = a.id) AS total_size
    FROM albums a
    LEFT JOIN photos p ON p.id = a.cover_photo_id
    ORDER BY a.created_at DESC
  `).all();

  res.render('admin/dashboard', {
    siteTitle: req.app.locals.siteTitle,
    flash: getFlash(req),
    albums,
    stats: {
      albums: totals.albumCount,
      photos: totals.photoCount,
      storage: bytesToHuman(getStorageStats())
    }
  });
});

router.get('/albums', requireAdmin, (req, res) => {
  const albums = db.prepare(`
    SELECT a.*, p.filename AS cover_filename,
      (SELECT COUNT(*) FROM photos WHERE album_id = a.id) AS photo_count
    FROM albums a
    LEFT JOIN photos p ON p.id = a.cover_photo_id
    ORDER BY a.created_at DESC
  `).all();

  res.render('admin/albums', {
    siteTitle: req.app.locals.siteTitle,
    flash: getFlash(req),
    albums
  });
});

router.post('/albums', requireAdmin, (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    setFlash(req, 'error', 'Album name is required.');
    return res.redirect('/admin/albums');
  }

  db.prepare('INSERT INTO albums (name, description, token) VALUES (?, ?, ?)').run(
    name.trim(),
    (description || '').trim() || null,
    uuidv4()
  );

  setFlash(req, 'success', 'Album created.');
  return res.redirect('/admin/albums');
});

router.get('/albums/:id/edit', requireAdmin, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) {
    setFlash(req, 'error', 'Album not found.');
    return res.redirect('/admin/albums');
  }

  const photos = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY created_at DESC').all(album.id);
  res.render('admin/album-edit', {
    siteTitle: req.app.locals.siteTitle,
    flash: getFlash(req),
    album,
    photos,
    codeEnabled: Boolean(album.access_code)
  });
});

router.post('/albums/:id/edit', requireAdmin, (req, res) => {
  const { name, description, expires_at } = req.body;
  db.prepare(`
    UPDATE albums
    SET name = ?, description = ?, expires_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name.trim(), (description || '').trim() || null, expires_at || null, req.params.id);

  setFlash(req, 'success', 'Album updated.');
  return res.redirect(`/admin/albums/${req.params.id}/edit`);
});

router.post('/albums/:id/delete', requireAdmin, (req, res) => {
  const albumId = Number(req.params.id);
  const photos = db.prepare('SELECT filename FROM photos WHERE album_id = ?').all(albumId);

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM albums WHERE id = ?').run(albumId);
  });
  txn();

  for (const photo of photos) {
    const original = path.join(__dirname, '..', 'uploads', 'original', photo.filename);
    const thumb = path.join(__dirname, '..', 'uploads', 'thumbs', photo.filename);
    if (fs.existsSync(original)) fs.unlinkSync(original);
    if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
  }

  setFlash(req, 'success', 'Album deleted.');
  return res.redirect('/admin/albums');
});

router.post('/albums/:id/regenerate-token', requireAdmin, (req, res) => {
  db.prepare('UPDATE albums SET token = ?, updated_at = datetime(\'now\') WHERE id = ?').run(uuidv4(), req.params.id);
  setFlash(req, 'success', 'Share link token regenerated.');
  return res.redirect(`/admin/albums/${req.params.id}/edit`);
});

router.post('/albums/:id/toggle-code', requireAdmin, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) {
    setFlash(req, 'error', 'Album not found.');
    return res.redirect('/admin/albums');
  }

  if (album.access_code) {
    db.prepare('UPDATE albums SET access_code = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(album.id);
    setFlash(req, 'success', 'Access code disabled.');
  } else {
    const code = generateAccessCode();
    db.prepare('UPDATE albums SET access_code = ?, updated_at = datetime(\'now\') WHERE id = ?').run(code, album.id);
    setFlash(req, 'success', `Access code enabled: ${code}`);
  }

  return res.redirect(`/admin/albums/${req.params.id}/edit`);
});

router.post('/albums/:id/regenerate-code', requireAdmin, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album || !album.access_code) {
    setFlash(req, 'error', 'Access code is not enabled for this album.');
    return res.redirect(`/admin/albums/${req.params.id}/edit`);
  }

  const code = generateAccessCode();
  db.prepare('UPDATE albums SET access_code = ?, updated_at = datetime(\'now\') WHERE id = ?').run(code, album.id);
  setFlash(req, 'success', `Access code regenerated: ${code}`);
  return res.redirect(`/admin/albums/${req.params.id}/edit`);
});

router.get('/upload', requireAdmin, (req, res) => {
  const albums = db.prepare('SELECT id, name FROM albums ORDER BY created_at DESC').all();
  res.render('admin/upload', {
    siteTitle: req.app.locals.siteTitle,
    flash: getFlash(req),
    albums,
    uploaded: []
  });
});

router.post('/upload', requireAdmin, upload.array('photos', 50), async (req, res) => {
  const albumId = Number(req.body.album_id);
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);

  if (!album) {
    setFlash(req, 'error', 'Please select a valid album.');
    return res.redirect('/admin/upload');
  }

  if (!req.files || req.files.length === 0) {
    setFlash(req, 'error', 'No files selected.');
    return res.redirect('/admin/upload');
  }

  const uploaded = [];

  for (const file of req.files) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const filename = `${uuidv4()}${ext}`;
    const originalPath = path.join(__dirname, '..', 'uploads', 'original', filename);
    const thumbPath = path.join(__dirname, '..', 'uploads', 'thumbs', filename);

    let bufferToSave = file.buffer;
    let meta;

    if (file.mimetype === 'image/jpeg') {
      bufferToSave = await sharp(file.buffer).rotate().jpeg({ quality: 90 }).toBuffer();
      meta = await sharp(bufferToSave).metadata();
    } else {
      meta = await sharp(file.buffer).metadata();
    }

    fs.writeFileSync(originalPath, bufferToSave);

    await sharp(file.buffer)
      .rotate()
      .resize({ width: 400, withoutEnlargement: true })
      .toFile(thumbPath);

    const result = db.prepare(`
      INSERT INTO photos (album_id, filename, original_name, mime_type, size, width, height)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(albumId, filename, file.originalname, file.mimetype, bufferToSave.length, meta.width || null, meta.height || null);

    if (!album.cover_photo_id) {
      db.prepare('UPDATE albums SET cover_photo_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(result.lastInsertRowid, albumId);
      album.cover_photo_id = Number(result.lastInsertRowid);
    }

    uploaded.push({ filename, original_name: file.originalname, id: result.lastInsertRowid });
  }

  const albums = db.prepare('SELECT id, name FROM albums ORDER BY created_at DESC').all();
  return res.render('admin/upload', {
    siteTitle: req.app.locals.siteTitle,
    flash: { type: 'success', message: `${uploaded.length} photo(s) uploaded successfully.` },
    albums,
    uploaded
  });
});

router.post('/photos/:id/delete', requireAdmin, (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) {
    setFlash(req, 'error', 'Photo not found.');
    return res.redirect('/admin/albums');
  }

  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);

  const original = path.join(__dirname, '..', 'uploads', 'original', photo.filename);
  const thumb = path.join(__dirname, '..', 'uploads', 'thumbs', photo.filename);
  if (fs.existsSync(original)) fs.unlinkSync(original);
  if (fs.existsSync(thumb)) fs.unlinkSync(thumb);

  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(photo.album_id);
  if (album && Number(album.cover_photo_id) === Number(photo.id)) {
    const next = db.prepare('SELECT id FROM photos WHERE album_id = ? ORDER BY created_at ASC LIMIT 1').get(album.id);
    db.prepare('UPDATE albums SET cover_photo_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(next ? next.id : null, album.id);
  }

  setFlash(req, 'success', 'Photo deleted.');
  return res.redirect(`/admin/albums/${photo.album_id}/edit`);
});

router.post('/albums/:id/photos/bulk-delete', requireAdmin, (req, res) => {
  const albumId = Number(req.params.id);
  const photoIds = Array.isArray(req.body.photo_ids) ? req.body.photo_ids : [req.body.photo_ids].filter(Boolean);

  if (photoIds.length === 0) {
    setFlash(req, 'error', 'No photos selected.');
    return res.redirect(`/admin/albums/${albumId}/edit`);
  }

  const photos = db.prepare(`
    SELECT id, filename FROM photos
    WHERE album_id = ? AND id IN (${photoIds.map(() => '?').join(',')})
  `).all(albumId, ...photoIds);

  db.prepare(`DELETE FROM photos WHERE album_id = ? AND id IN (${photoIds.map(() => '?').join(',')})`).run(albumId, ...photoIds);

  for (const photo of photos) {
    const original = path.join(__dirname, '..', 'uploads', 'original', photo.filename);
    const thumb = path.join(__dirname, '..', 'uploads', 'thumbs', photo.filename);
    if (fs.existsSync(original)) fs.unlinkSync(original);
    if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
  }

  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
  if (album && album.cover_photo_id) {
    const exists = db.prepare('SELECT id FROM photos WHERE id = ? AND album_id = ?').get(album.cover_photo_id, albumId);
    if (!exists) {
      const next = db.prepare('SELECT id FROM photos WHERE album_id = ? ORDER BY created_at ASC LIMIT 1').get(albumId);
      db.prepare('UPDATE albums SET cover_photo_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(next ? next.id : null, albumId);
    }
  }

  setFlash(req, 'success', `${photos.length} photo(s) deleted.`);
  return res.redirect(`/admin/albums/${albumId}/edit`);
});

router.post('/albums/:id/cover/:photoId', requireAdmin, (req, res) => {
  const albumId = Number(req.params.id);
  const photoId = Number(req.params.photoId);

  const photo = db.prepare('SELECT id FROM photos WHERE id = ? AND album_id = ?').get(photoId, albumId);
  if (!photo) {
    setFlash(req, 'error', 'Photo not found in this album.');
    return res.redirect(`/admin/albums/${albumId}/edit`);
  }

  db.prepare('UPDATE albums SET cover_photo_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(photoId, albumId);
  setFlash(req, 'success', 'Album cover updated.');
  return res.redirect(`/admin/albums/${albumId}/edit`);
});

router.get('/settings', requireAdmin, (req, res) => {
  const storage = bytesToHuman(getStorageStats());
  const username = getSetting('admin_username');

  res.render('admin/settings', {
    siteTitle: req.app.locals.siteTitle,
    flash: getFlash(req),
    username,
    storage,
    photoCount: db.prepare('SELECT COUNT(*) AS count FROM photos').get().count,
    albumCount: db.prepare('SELECT COUNT(*) AS count FROM albums').get().count
  });
});

router.post('/settings/site-title', requireAdmin, (req, res) => {
  const title = (req.body.site_title || '').trim();
  if (!title) {
    setFlash(req, 'error', 'Site title cannot be empty.');
    return res.redirect('/admin/settings');
  }

  setSetting('site_title', title);
  req.app.locals.siteTitle = title;
  setFlash(req, 'success', 'Site title updated.');
  return res.redirect('/admin/settings');
});

router.post('/settings/username', requireAdmin, (req, res) => {
  const username = (req.body.username || '').trim();
  if (!username) {
    setFlash(req, 'error', 'Username cannot be empty.');
    return res.redirect('/admin/settings');
  }

  setSetting('admin_username', username);
  setFlash(req, 'success', 'Admin username updated.');
  return res.redirect('/admin/settings');
});

router.post('/settings/password', requireAdmin, async (req, res) => {
  const { current_password, new_password } = req.body;
  const hash = getSetting('admin_password_hash');
  const ok = hash && (await bcrypt.compare(current_password || '', hash));

  if (!ok) {
    setFlash(req, 'error', 'Current password is incorrect.');
    return res.redirect('/admin/settings');
  }

  if (!new_password || new_password.length < 8) {
    setFlash(req, 'error', 'New password must be at least 8 characters.');
    return res.redirect('/admin/settings');
  }

  const newHash = await bcrypt.hash(new_password, 12);
  setSetting('admin_password_hash', newHash);
  setFlash(req, 'success', 'Admin password updated.');
  return res.redirect('/admin/settings');
});

module.exports = router;
