# PhotoVault

A production-ready photo library and album sharing web app built with Node.js, Express, SQLite, and EJS.

## 1) Features Overview

- Hidden admin login path (`/admin/x7k2-login` by default)
- Session-based admin auth with bcrypt password hashing
- Album creation, editing, deletion, share token regeneration
- Multi-file photo uploads (JPEG/PNG/WEBP/GIF), thumbnail generation via sharp
- Optional 5-digit access codes for shared albums
- Optional album expiry date support
- Public album gallery with lightbox + lazy loading
- Single photo download + full album ZIP download
- Admin photo management (delete, bulk delete, set cover)
- Dashboard and settings (site title, username, password, storage stats)
- Security and operations: Helmet, rate-limited code entry, morgan logging, graceful shutdown

## 2) Prerequisites

- Node.js 18+
- npm

## 3) Installation

1. Clone repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy env file:
   ```bash
   cp .env.example .env
   ```
4. Start server:
   ```bash
   node server.js
   ```

## 4) First Login Instructions

On first boot, the app seeds default credentials and prints them to console:

- Username: `admin`
- Password: `changeme123`

Open the hidden login URL (default):

- `http://localhost:3000/admin/x7k2-login`

Then change credentials immediately in **Settings**.

## 5) Deployment Tips (PM2 + Nginx)

### PM2

```bash
npm install
pm2 start server.js --name photovault
pm2 save
```

### Nginx reverse proxy example

```nginx
server {
  listen 80;
  server_name yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

Store persistent data (`photo-storage.db`, `uploads/`) on durable disk.

## 6) Folder Structure

```text
photo-storage/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── server.js
├── config/
│   └── database.js
├── middleware/
│   ├── auth.js
│   └── albumAccess.js
├── routes/
│   ├── admin.js
│   └── share.js
├── views/
│   ├── admin/
│   │   ├── login.ejs
│   │   ├── dashboard.ejs
│   │   ├── albums.ejs
│   │   ├── album-edit.ejs
│   │   ├── upload.ejs
│   │   └── settings.ejs
│   ├── public/
│   │   ├── album.ejs
│   │   ├── code-entry.ejs
│   │   └── error.ejs
│   └── partials/
│       ├── head.ejs
│       └── foot.ejs
├── public/
│   ├── css/
│   │   ├── admin.css
│   │   ├── public.css
│   │   └── placeholder.svg
│   └── js/
│       ├── admin.js
│       └── lightbox.js
└── uploads/
    ├── .gitkeep
    ├── original/.gitkeep
    └── thumbs/.gitkeep
```
