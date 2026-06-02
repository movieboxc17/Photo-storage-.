const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '..', 'photo-storage.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      token TEXT UNIQUE NOT NULL,
      access_code TEXT,
      cover_photo_id INTEGER,
      view_count INTEGER DEFAULT 0,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  seedDefaults();
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function seedDefaults() {
  if (!getSetting('site_title')) {
    setSetting('site_title', process.env.SITE_TITLE || 'PhotoVault');
  }

  const username = getSetting('admin_username');
  const passwordHash = getSetting('admin_password_hash');

  if (!username || !passwordHash) {
    const defaultUsername = 'admin';
    const defaultPassword = 'changeme123';
    const hash = bcrypt.hashSync(defaultPassword, 12);

    setSetting('admin_username', defaultUsername);
    setSetting('admin_password_hash', hash);

    console.log('[PhotoVault] First run admin account created.');
    console.log(`[PhotoVault] Username: ${defaultUsername}`);
    console.log(`[PhotoVault] Password: ${defaultPassword}`);
    console.log('[PhotoVault] Please change these credentials from Settings immediately.');
  }
}

module.exports = {
  db,
  initSchema,
  getSetting,
  setSetting
};
