const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const rateLimit = require('express-rate-limit');
const { db } = require('../config/database');
const { getAlbumByToken, isExpired, hasUnlockedAccess, enforceAlbumAccess } = require('../middleware/albumAccess');

const router = express.Router();

const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many code attempts. Please try again later.'
});

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

router.get('/:token', (req, res) => {
  const album = getAlbumByToken(req.params.token);

  if (!album || isExpired(album)) {
    return res.status(404).render('public/error', {
      siteTitle: req.app.locals.siteTitle,
      title: 'Album unavailable',
      message: 'This album link is invalid or has expired.'
    });
  }

  if (album.access_code && !hasUnlockedAccess(req, album)) {
    return res.render('public/code-entry', {
      siteTitle: req.app.locals.siteTitle,
      token: album.token,
      album,
      error: null
    });
  }

  db.prepare('UPDATE albums SET view_count = view_count + 1 WHERE id = ?').run(album.id);

  const photos = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY created_at ASC').all(album.id);
  const totalSize = photos.reduce((sum, p) => sum + p.size, 0);

  return res.render('public/album', {
    siteTitle: req.app.locals.siteTitle,
    album,
    photos,
    totalSize: bytesToHuman(totalSize)
  });
});

router.post('/:token/code', codeLimiter, (req, res) => {
  const album = getAlbumByToken(req.params.token);
  if (!album || isExpired(album)) {
    return res.status(404).render('public/error', {
      siteTitle: req.app.locals.siteTitle,
      title: 'Album unavailable',
      message: 'This album link is invalid or has expired.'
    });
  }

  const code = `${req.body.d1 || ''}${req.body.d2 || ''}${req.body.d3 || ''}${req.body.d4 || ''}${req.body.d5 || ''}`;
  if (code !== album.access_code) {
    return res.status(401).render('public/code-entry', {
      siteTitle: req.app.locals.siteTitle,
      token: album.token,
      album,
      error: 'Incorrect code. Please try again.'
    });
  }

  req.session.albumUnlocks = req.session.albumUnlocks || {};
  req.session.albumUnlocks[album.token] = Date.now();
  return res.redirect(`/share/${album.token}`);
});

router.get('/:token/download/:photoId', enforceAlbumAccess, (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND album_id = ?').get(req.params.photoId, req.album.id);
  if (!photo) {
    return res.status(404).render('public/error', {
      siteTitle: req.app.locals.siteTitle,
      title: 'Photo not found',
      message: 'The requested photo could not be found.'
    });
  }

  const filePath = path.join(__dirname, '..', 'uploads', 'original', photo.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).render('public/error', {
      siteTitle: req.app.locals.siteTitle,
      title: 'File missing',
      message: 'The requested photo file is missing.'
    });
  }

  return res.download(filePath, photo.original_name);
});

router.get('/:token/download-all', enforceAlbumAccess, (req, res) => {
  const photos = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY created_at ASC').all(req.album.id);
  if (!photos.length) {
    return res.status(404).render('public/error', {
      siteTitle: req.app.locals.siteTitle,
      title: 'No photos',
      message: 'There are no photos available for this album.'
    });
  }

  const safeName = req.album.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'album';
  res.attachment(`${safeName}.zip`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    res.status(500).end(err.message);
  });

  archive.pipe(res);

  for (const photo of photos) {
    const filePath = path.join(__dirname, '..', 'uploads', 'original', photo.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: photo.original_name });
    }
  }

  archive.finalize();
});

module.exports = router;
