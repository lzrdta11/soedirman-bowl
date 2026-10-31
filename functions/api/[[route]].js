/**
 * Cloudflare Pages Functions - Catch-all API Handler (/api/*)
 * Automatically invoked by Cloudflare Pages for all /api/... requests.
 */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
      ...headers,
    },
  });
}

function err(message, status = 400) {
  return json({ success: false, error: message }, status);
}

const memoryStore = {
  version: 1,
  cycle: { open: false, startedAt: 0, closeAt: 0, format: "bo3", bestOf3: true },
  draftCodes: { A: "", B: "" },
  draftState: { capA: "", capB: "", first: "", started: false, picks: [] },
  players: [],
  matches: [],
  stats: [],
};

async function ensureTables(db) {
  if (!db) return;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`),
      db.prepare(`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, tier TEXT NOT NULL, ts INTEGER NOT NULL);`),
      db.prepare(`CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, date TEXT, title TEXT, status TEXT DEFAULT 'scheduled', note TEXT DEFAULT '', format TEXT DEFAULT 'bo3', ts INTEGER NOT NULL, ra TEXT DEFAULT '[]', rb TEXT DEFAULT '[]', ev TEXT DEFAULT '[]', fin TEXT DEFAULT '[]', ps TEXT DEFAULT '{}');`),
      db.prepare(`CREATE TABLE IF NOT EXISTS stats (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, cp INTEGER DEFAULT 0, ct INTEGER DEFAULT 0, td INTEGER DEFAULT 0, fp INTEGER DEFAULT 0, bw INTEGER DEFAULT 0, it INTEGER DEFAULT 0, updated_at INTEGER NOT NULL);`),
      db.prepare(`INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES ('cycle', '{"open":false,"startedAt":0,"closeAt":0,"format":"bo3","bestOf3":true}', ?);`).bind(Date.now()),
      db.prepare(`INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES ('draft_codes', '{"A":"","B":""}', ?);`).bind(Date.now()),
      db.prepare(`INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES ('draft_state', '{"capA":"","capB":"","first":"","started":false,"picks":[]}', ?);`).bind(Date.now()),
      db.prepare(`INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES ('version', '1', ?);`).bind(Date.now()),
    ]);
    try {
      await db.prepare("ALTER TABLE matches ADD COLUMN format TEXT DEFAULT 'bo3';").run();
    } catch (_) {}
  } catch (e) {
    console.error("ensureTables error:", e);
  }
}

async function bumpVersion(db) {
  if (db) {
    await db.prepare(`
      INSERT INTO meta (key, value, updated_at) VALUES ('version', '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ?
    `).bind(Date.now(), Date.now()).run();
  } else {
    memoryStore.version++;
  }
}

async function getFullState(db) {
  if (!db) {
    return {
      version: memoryStore.version,
      cycle: memoryStore.cycle,
      draftCodes: memoryStore.draftCodes,
      draftState: memoryStore.draftState,
      players: memoryStore.players,
      matches: memoryStore.matches,
      stats: memoryStore.stats,
      serverTime: Date.now(),
    };
  }

  await ensureTables(db);

  const [metaRows, playerRows, matchRows, statRows] = await Promise.all([
    db.prepare(`SELECT key, value FROM meta`).all(),
    db.prepare(`SELECT id, name, tier, ts FROM players ORDER BY ts ASC`).all(),
    db.prepare(`SELECT id, date, title, status, note, format, ts, ra, rb, ev, fin, ps FROM matches ORDER BY ts DESC`).all(),
    db.prepare(`SELECT id, name, cp, ct, td, fp, bw, it FROM stats`).all(),
  ]);

  const meta = {};
  for (const r of metaRows.results || []) {
    try {
      meta[r.key] = JSON.parse(r.value);
    } catch {
      meta[r.key] = r.value;
    }
  }

  const matches = (matchRows.results || []).map((m) => ({
    id: m.id,
    date: m.date || "",
    title: m.title || "",
    status: m.status || "scheduled",
    note: m.note || "",
    format: m.format || "bo3",
    ts: m.ts || 0,
    ra: m.ra ? JSON.parse(m.ra) : [],
    rb: m.rb ? JSON.parse(m.rb) : [],
    ev: m.ev ? JSON.parse(m.ev) : [],
    fin: m.fin ? JSON.parse(m.fin) : [],
    ps: m.ps ? JSON.parse(m.ps) : {},
  }));

  const stats = (statRows.results || []).map((s) => ({
    id: s.id,
    name: s.name,
    cp: s.cp || 0,
    ct: s.ct || 0,
    td: s.td || 0,
    fp: s.fp || 0,
    bw: s.bw || 0,
    it: s.it || 0,
  }));

  const players = (playerRows.results || []).map((p) => ({
    _id: p.id,
    name: p.name,
    tier: p.tier,
    ts: p.ts,
  }));

  return {
    version: Number(meta.version || 1),
    cycle: meta.cycle || { open: false, startedAt: 0, closeAt: 0 },
    draftCodes: meta.draft_codes || { A: "", B: "" },
    draftState: meta.draft_state || { capA: "", capB: "", first: "", started: false, picks: [] },
    players,
    matches,
    stats,
    serverTime: Date.now(),
  };
}

const slug = (n) =>
  n
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "x";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return json({}, 204);
  }

  const db = env.DB;

  // GET /api/state
  if (url.pathname === "/api/state" && request.method === "GET") {
    const state = await getFullState(db);
    return json({ success: true, ...state });
  }

  // GET /api/stream (SSE for Live Synchronization)
  if (url.pathname === "/api/stream" && request.method === "GET") {
    let lastVersion = 0;
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const sendEvent = async (data) => {
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      } catch {}
    };

    (async () => {
      try {
        const initial = await getFullState(db);
        lastVersion = initial.version;
        await sendEvent({ type: "init", state: initial });

        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            let currentVer = 0;
            if (db) {
              const vRow = await db.prepare("SELECT value FROM meta WHERE key = 'version'").first();
              currentVer = Number(vRow?.value || 1);
            } else {
              currentVer = memoryStore.version;
            }

            if (currentVer !== lastVersion) {
              const updated = await getFullState(db);
              lastVersion = updated.version;
              await sendEvent({ type: "update", state: updated });
            } else if (i % 8 === 0) {
              await writer.write(encoder.encode(": ping\n\n"));
            }
          } catch (pollErr) {}
        }
      } catch (streamErr) {
      } finally {
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // POST /api/players (Daftar)
  if (url.pathname === "/api/players" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const name = (body.name || "").trim();
    const tier = (body.tier || "Pemula / belum tahu").trim();

    if (!name) return err("Nama wajib diisi.");
    if (name.length > 40) return err("Nama maksimal 40 karakter.");

    const state = await getFullState(db);
    const isOpen = state.cycle.open && Date.now() < state.cycle.closeAt;
    const isAdmin = request.headers.get("x-admin-token") === "1";

    if (!isOpen && !isAdmin) {
      return err("Pendaftaran saat ini sedang ditutup.");
    }

    if (state.players.length >= 14) {
      return err("Pool pemain sudah penuh (maks. 14 peserta).");
    }

    const duplicate = state.players.some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      return err("Nama ini sudah terdaftar di pool.");
    }

    const id = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const ts = body.ts || Date.now();

    if (db) {
      await db.batch([
        db.prepare("INSERT INTO players (id, name, tier, ts) VALUES (?, ?, ?, ?)").bind(id, name, tier, ts),
        db.prepare(`
          INSERT INTO stats (id, name, cp, ct, td, fp, bw, it, updated_at)
          VALUES (?, ?, 0, 0, 0, 0, 0, 0, ?)
          ON CONFLICT(id) DO NOTHING
        `).bind(slug(name), name, ts),
      ]);
      await bumpVersion(db);
    } else {
      memoryStore.players.push({ _id: id, name, tier, ts });
      if (!memoryStore.stats.some((s) => s.id === slug(name))) {
        memoryStore.stats.push({ id: slug(name), name, cp: 0, ct: 0, td: 0, fp: 0, bw: 0, it: 0 });
      }
      await bumpVersion();
    }

    const updated = await getFullState(db);
    return json({ success: true, player: { _id: id, name, tier, ts }, state: updated });
  }

  // DELETE /api/players/:id
  if (url.pathname.startsWith("/api/players/") && request.method === "DELETE") {
    const id = decodeURIComponent(url.pathname.replace("/api/players/", ""));
    if (db) {
      await db.prepare("DELETE FROM players WHERE id = ? OR name = ?").bind(id, id).run();
      await bumpVersion(db);
    } else {
      memoryStore.players = memoryStore.players.filter((p) => p._id !== id && p.name !== id);
      await bumpVersion();
    }
    return json({ success: true });
  }

  // POST /api/players/clear
  if (url.pathname === "/api/players/clear" && request.method === "POST") {
    if (db) {
      await db.prepare("DELETE FROM players").run();
      await bumpVersion(db);
    } else {
      memoryStore.players = [];
      await bumpVersion();
    }
    return json({ success: true });
  }

  // POST /api/event/cycle
  if (url.pathname === "/api/event/cycle" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const cycle = {
      open: !!body.open,
      startedAt: Number(body.startedAt) || 0,
      closeAt: Number(body.closeAt) || 0,
      format: body.format === "single" ? "single" : "bo3",
      bestOf3: body.format !== "single" && body.bestOf3 !== false,
    };
    const val = JSON.stringify(cycle);

    if (db) {
      await db.prepare("INSERT INTO meta (key, value, updated_at) VALUES ('cycle', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?")
        .bind(val, Date.now(), val, Date.now()).run();
      await bumpVersion(db);
    } else {
      memoryStore.cycle = cycle;
      await bumpVersion();
    }
    return json({ success: true, cycle });
  }

  // POST /api/draft/codes
  if (url.pathname === "/api/draft/codes" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const val = JSON.stringify({
      A: body.A || "",
      B: body.B || "",
    });

    if (db) {
      await db.prepare("INSERT INTO meta (key, value, updated_at) VALUES ('draft_codes', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?")
        .bind(val, Date.now(), val, Date.now()).run();
      await bumpVersion(db);
    } else {
      memoryStore.draftCodes = JSON.parse(val);
      await bumpVersion();
    }
    return json({ success: true });
  }

  // POST /api/draft/state
  if (url.pathname === "/api/draft/state" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const draftState = {
      capA: body.capA || "",
      capB: body.capB || "",
      first: body.first || "",
      started: !!body.started,
      picks: Array.isArray(body.picks) ? body.picks : [],
    };
    const val = JSON.stringify(draftState);

    if (db) {
      await db.prepare("INSERT INTO meta (key, value, updated_at) VALUES ('draft_state', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?")
        .bind(val, Date.now(), val, Date.now()).run();
      await bumpVersion(db);
    } else {
      memoryStore.draftState = draftState;
      await bumpVersion();
    }
    return json({ success: true, draftState });
  }

  // POST /api/matches/:id
  if (url.pathname.startsWith("/api/matches/") && request.method === "POST") {
    const id = decodeURIComponent(url.pathname.replace("/api/matches/", ""));
    const body = await request.json().catch(() => ({}));
    const date = body.date || "";
    const title = (body.title || "").trim() || "Match";
    const status = body.status || "scheduled";
    const note = (body.note || "").trim();
    const format = body.format === "single" ? "single" : "bo3";
    const ts = body.ts || Date.now();
    const ra = JSON.stringify(body.ra || []);
    const rb = JSON.stringify(body.rb || []);
    const ev = JSON.stringify(body.ev || []);
    const fin = JSON.stringify(body.fin || []);
    const ps = JSON.stringify(body.ps || {});

    if (db) {
      await db.prepare(`
        INSERT INTO matches (id, date, title, status, note, format, ts, ra, rb, ev, fin, ps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          date = ?, title = ?, status = ?, note = ?, format = ?, ts = ?, ra = ?, rb = ?, ev = ?, fin = ?, ps = ?
      `).bind(id, date, title, status, note, format, ts, ra, rb, ev, fin, ps,
              date, title, status, note, format, ts, ra, rb, ev, fin, ps).run();
      await bumpVersion(db);
    } else {
      const idx = memoryStore.matches.findIndex((m) => m.id === id);
      const matchObj = { id, date, title, status, note, format, ts, ra: JSON.parse(ra), rb: JSON.parse(rb), ev: JSON.parse(ev), fin: JSON.parse(fin), ps: JSON.parse(ps) };
      if (idx < 0) memoryStore.matches.push(matchObj);
      else memoryStore.matches[idx] = matchObj;
      await bumpVersion();
    }
    return json({ success: true });
  }

  // DELETE /api/matches/:id
  if (url.pathname.startsWith("/api/matches/") && request.method === "DELETE") {
    const id = decodeURIComponent(url.pathname.replace("/api/matches/", ""));
    if (db) {
      await db.prepare("DELETE FROM matches WHERE id = ?").bind(id).run();
      await bumpVersion(db);
    } else {
      memoryStore.matches = memoryStore.matches.filter((m) => m.id !== id);
      await bumpVersion();
    }
    return json({ success: true });
  }

  // POST /api/stats/:id
  if (url.pathname.startsWith("/api/stats/") && request.method === "POST") {
    const id = decodeURIComponent(url.pathname.replace("/api/stats/", ""));
    const body = await request.json().catch(() => ({}));
    const name = (body.name || id).trim();
    const cp = Math.max(0, Number(body.cp) || 0);
    const ct = Math.max(0, Number(body.ct) || 0);
    const td = Math.max(0, Number(body.td) || 0);
    const fp = Math.max(0, Number(body.fp) || 0);
    const bw = Math.max(0, Number(body.bw) || 0);
    const it = Math.max(0, Number(body.it) || 0);

    if (db) {
      await db.prepare(`
        INSERT INTO stats (id, name, cp, ct, td, fp, bw, it, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = ?, cp = ?, ct = ?, td = ?, fp = ?, bw = ?, it = ?, updated_at = ?
      `).bind(id, name, cp, ct, td, fp, bw, it, Date.now(),
              name, cp, ct, td, fp, bw, it, Date.now()).run();
      await bumpVersion(db);
    } else {
      const idx = memoryStore.stats.findIndex((s) => s.id === id);
      const statObj = { id, name, cp, ct, td, fp, bw, it };
      if (idx < 0) memoryStore.stats.push(statObj);
      else memoryStore.stats[idx] = statObj;
      await bumpVersion();
    }
    return json({ success: true });
  }

  // DELETE /api/stats/:id
  if (url.pathname.startsWith("/api/stats/") && request.method === "DELETE") {
    const id = decodeURIComponent(url.pathname.replace("/api/stats/", ""));
    if (db) {
      await db.prepare("DELETE FROM stats WHERE id = ?").bind(id).run();
      await bumpVersion(db);
    } else {
      memoryStore.stats = memoryStore.stats.filter((s) => s.id !== id);
      await bumpVersion();
    }
    return json({ success: true });
  }

  return err("Endpoint not found", 404);
}
