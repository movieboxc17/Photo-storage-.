const { db } = require('../config/database');

function getAlbumByToken(token) {
  return db.prepare('SELECT * FROM albums WHERE token = ?').get(token);
}

function isExpired(album) {
  return Boolean(album.expires_at && new Date(album.expires_at).getTime() < Date.now());
}

function hasUnlockedAccess(req, album) {
  if (!album.access_code) return true;
  const unlocks = req.session.albumUnlocks || {};
  const unlockedAt = unlocks[album.token];
  if (!unlockedAt) return false;
  return Date.now() - unlockedAt < 24 * 60 * 60 * 1000;
}

function enforceAlbumAccess(req, res, next) {
  const album = getAlbumByToken(req.params.token);

  if (!album || isExpired(album)) {
    return res.status(404).render('public/error', {
      siteTitle: req.app.locals.siteTitle,
      title: 'Album unavailable',
      message: 'This album link is invalid or has expired.'
    });
  }

  if (!hasUnlockedAccess(req, album)) {
    return res.redirect(`/share/${album.token}`);
  }

  req.album = album;
  next();
}

module.exports = {
  getAlbumByToken,
  isExpired,
  hasUnlockedAccess,
  enforceAlbumAccess
};
