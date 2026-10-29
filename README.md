# 🏈 Soedirman Bowl — Online Cloudflare Flag Football Platform

A fully online, server-sided, real-time web platform for **Soedirman Bowl (Generals vs Commandos)** bi-weekly flag football matches, powered by **Cloudflare Workers** and **Cloudflare D1 Database**.

---

## ⚡ Architecture & Tech Stack

- **Platform / Compute:** [Cloudflare Workers](https://workers.cloudflare.com/) (Serverless edge runtime)
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (Serverless distributed SQL SQLite database)
- **Frontend / Static Assets:** Responsive Single-Page Application (HTML5, Vanilla ES6+, Canvas animations, SVG field diagram) served directly by Cloudflare Workers Static Assets (`public/`)
- **Real-time Sync:** Server-Sent Events (`/api/stream`) + polling fallback for instantaneous live draft and match scoring across all devices
- **Authentication & Security:** SHA-256 hashed captain verification codes and admin login

---

## 📂 Project Structure

```
├── .gitignore               # Git ignore rules (node_modules, .wrangler, dist, etc.)
├── package.json             # NPM project configuration and scripts
├── wrangler.jsonc           # Cloudflare Worker & D1 binding configuration
├── schema.sql               # Cloudflare D1 SQL table definitions and initial seed
├── src/
│   └── index.js             # Cloudflare Worker API router & server-side logic
└── public/
    ├── index.html           # Main Soedirman Bowl application (Generals vs Commandos)
    └── playbook.html        # Flag Football QB Playbook
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js (v18+)
- Cloudflare Wrangler CLI (installed via devDependencies)

### 2. Start Local Development Server
Run:
```bash
npm run dev
```
This runs Wrangler with a local in-memory/SQLite simulated D1 database and live-reloads on changes. Open `http://localhost:8787` in your browser.

---

## ☁️ Deploying to Cloudflare (Fully Online)

### 1. Login to Cloudflare
```bash
npx wrangler login
```

### 2. Create the Cloudflare D1 Database
```bash
npm run d1:create
```
This will print your database ID, for example:
```
database_name = "soedirman-bowl-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 3. Update `wrangler.jsonc`
Replace `"00000000-0000-0000-0000-000000000000"` in `wrangler.jsonc` with your actual `database_id`:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "soedirman-bowl-db",
    "database_id": "YOUR_DATABASE_ID_HERE"
  }
]
```

### 4. Initialize Database Tables on Cloudflare
```bash
npm run d1:init:remote
```

### 5. Deploy the Worker
```bash
npm run deploy
```
Your application will be live at `https://soedirman-bowl.<your-subdomain>.workers.dev` with online server-side database persistence!

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

---

## 🏆 Key Features

1. **Player Registration Pool:** Bi-weekly auto-closing schedule (Fridays 13:00 WIB), max 14 players, duplicate prevention.
2. **Live Snake Draft:** 5v5 selection, spin wheel for first pick, order `A -> B -> B -> A -> A -> B -> B -> A`.
3. **Captains Access:** Secure passcode authentication per team.
4. **Interactive Best-of-3 Matches:** Touchdowns (6), Extra Points (1/2), Safeties (2), real-time game status tracking.
5. **Leaderboard & Player Stats:** Automatic accumulation for CP, Catch, TD, Flag Pull, Battle Won, and Interceptions.
6. **Playbook Integration:** One-click navigation to the Flag Football QB Playbook.
