# 🏈 Soedirman Bowl — Online Cloudflare Flag Football Platform

A fully online, server-sided, real-time web platform for **Soedirman Bowl (Generals vs Commandos)** bi-weekly flag football matches, powered by **Cloudflare Pages / Workers** and **Cloudflare D1 Database**.

---

## ⚡ Architecture & Tech Stack

- **Platform / Hosting:** [Cloudflare Pages](https://pages.cloudflare.com/) or [Cloudflare Workers](https://workers.cloudflare.com/)
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (Serverless distributed SQL SQLite database)
- **Frontend / Static Assets:** Responsive Single-Page Application (HTML5, Vanilla ES6+, Canvas animations, SVG field diagram) served directly by Cloudflare Pages (`public/`)
- **Serverless API:** Cloudflare Pages Functions (`functions/api/[[route]].js`) and Workers (`src/index.js`)
- **Real-time Sync:** Server-Sent Events (`/api/stream`) + polling fallback for instantaneous live draft and match scoring across all devices
- **Authentication & Security:** SHA-256 hashed captain verification codes and admin login

---

## 📂 Project Structure

```
├── .gitignore               # Git ignore rules (node_modules, .wrangler, dist, etc.)
├── package.json             # NPM project configuration and scripts
├── wrangler.jsonc           # Cloudflare Worker & D1 binding configuration
├── schema.sql               # Cloudflare D1 SQL table definitions and initial seed
├── functions/
│   └── api/
│       └── [[route]].js     # Cloudflare Pages Functions API handler (/api/*)
├── src/
│   └── index.js             # Cloudflare Workers standalone API handler
└── public/
    ├── index.html           # Main Soedirman Bowl application (Generals vs Commandos)
    └── playbook.html        # Flag Football QB Playbook
```

---

## 🌐 Deploying to Cloudflare Pages (Recommended)

### Metode A: Lewat Dashboard Cloudflare Pages (Git Integration - Otomatis Deploy saat Push)

1. **Buka Cloudflare Dashboard**:
   - Masuk ke [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Compute (Workers & Pages)** > **Create application** > Tab **Pages**.
   - Pilih **Connect to Git** dan pilih repository GitHub Anda: `lzrdta11/soedirman-bowl`.

2. **Atur Build Settings**:
   - **Project name:** `soedirman-bowl`
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** *(kosongkan)*
   - **Build output directory:** `public`
   - Klik **Save and Deploy**.

3. **Buat & Hubungkan Cloudflare D1 Database**:
   - Di sidebar Cloudflare Dashboard, buka **Storage & Databases** > **D1 SQL Database**.
   - Klik **Create Database**, beri nama: `soedirman-bowl-db`.
   - Buka project Pages Anda > **Settings** > **Functions** > **D1 Database Bindings**.
   - Klik **Add binding**:
     - **Variable name:** `DB`
     - **D1 database:** pilih `soedirman-bowl-db`
   - Simpan (*Save*).

4. **Inisialisasi Tabel Database**:
   Jalankan perintah ini di terminal komputer Anda (hanya sekali):
   ```bash
   npx wrangler d1 execute soedirman-bowl-db --remote --file=./schema.sql
   ```

5. Selesai! Website Anda langsung aktif di `https://soedirman-bowl.pages.dev` dengan database online Cloudflare D1.

---

### Metode B: Deploy via CLI

```bash
# 1. Login Cloudflare
npx wrangler login

# 2. Buat D1 Database
npm run d1:create

# 3. Inisialisasi tabel D1 di Cloudflare
npm run d1:init:remote

# 4. Deploy ke Cloudflare Pages
npm run pages:deploy
```

---

## 💻 Menjalankan di Lokal (Development)

Untuk testing lokal dengan simulasi database Cloudflare D1:
```bash
npm run pages:dev
# atau:
npm run dev
```
Akses di browser: `http://localhost:8788` atau `http://localhost:8787`.

---

## 📋 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/state` | Returns complete current state (players, cycle, draft, matches, stats) |
| `GET` | `/api/stream` | Server-Sent Events (SSE) stream for live updates |
| `POST` | `/api/players` | Registers a new player (validates max 14 & cycle schedule) |
| `DELETE` | `/api/players/:id` | Removes a player from the pool |
| `POST` | `/api/players/clear` | Clears all players from the pool |
| `POST` | `/api/event/cycle` | Updates registration cycle timing |
| `POST` | `/api/draft/codes` | Updates captain authentication codes |
| `POST` | `/api/draft/state` | Updates live draft status (picks, captain selection, turn) |
| `POST` | `/api/matches/:id` | Creates or updates a match (scores, events, stats) |
| `DELETE` | `/api/matches/:id` | Deletes a match record |
| `POST` | `/api/stats/:id` | Updates or bumps individual player stats |
| `DELETE` | `/api/stats/:id` | Deletes a player stat entry |
