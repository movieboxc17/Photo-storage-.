require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { initSchema, getSetting } = require('./config/database');

const adminRoutes = require('./routes/admin');
const shareRoutes = require('./routes/share');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

initSchema();

const uploadsOriginalDir = path.join(__dirname, 'uploads', 'original');
const uploadsThumbsDir = path.join(__dirname, 'uploads', 'thumbs');
fs.mkdirSync(uploadsOriginalDir, { recursive: true });
fs.mkdirSync(uploadsThumbsDir, { recursive: true });

app.locals.siteTitle = getSetting('site_title') || process.env.SITE_TITLE || 'PhotoVault';
app.locals.adminPathSegment = process.env.ADMIN_PATH_SEGMENT || 'x7k2-login';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan('dev'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.body?._csrf || req.query?._csrf || req.get('x-csrf-token');
  if (token && token === req.session.csrfToken) return next();

  return res.status(403).render('public/error', {
    siteTitle: app.locals.siteTitle,
    title: 'Request blocked',
    message: 'Invalid security token. Please refresh and try again.'
  });
});

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.status(404).render('public/error', {
    siteTitle: app.locals.siteTitle,
    title: 'Not found',
    message: 'This service only exposes private share links.'
  });
});

app.use('/admin', adminRoutes);
app.use('/share', shareRoutes);

app.use((req, res) => {
  res.status(404).render('public/error', {
    siteTitle: app.locals.siteTitle,
    title: 'Not found',
    message: 'The requested page does not exist.'
  });
});

const server = app.listen(PORT, () => {
  console.log(`[PhotoVault] Server running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`[PhotoVault] Received ${signal}. Shutting down...`);
  server.close(() => {
    console.log('[PhotoVault] HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[PhotoVault] Force exiting after shutdown timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
