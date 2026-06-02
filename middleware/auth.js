function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }

  const segment = req.app.locals.adminPathSegment;
  return res.redirect(`/admin/${segment}`);
}

module.exports = { requireAdmin };
