"use strict";
const express = require("express");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const { COLS, PERSIST, ID_RE, level, needLevel, valid } = require("./lib");

const PORT = process.env.PORT || 3000;
const JUDGE_PIN = process.env.JUDGE_PIN;
const ADMIN_PIN = process.env.ADMIN_PIN;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
let DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL || !JUDGE_PIN || !ADMIN_PIN) {
  console.error("Missing settings. DATABASE_URL, JUDGE_PIN and ADMIN_PIN must all be set.");
  process.exit(1);
}
// Neon adds channel_binding=require, which the pg driver does not support
try { const u = new URL(DATABASE_URL); u.searchParams.delete("channel_binding"); DATABASE_URL = u.toString(); } catch (e) { }

const local = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
const pool = new Pool({ connectionString: DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, statement_timeout: 15000, });
pool.on("error", (e) => console.error("Database connection error:", e.message));

// everything lives in memory too, so reads and the live feed never wait for the database
const cache = {};
for (const c of COLS) cache[ c ] = new Map();

async function init() {
  for (let i = 1; ; i++) {
    console.log(`[DB] Attempt ${i}: connecting and loading documents...`);
    try {

      await pool.query(`create table if not exists docs(
        col text not null, id text not null, data jsonb not null,
        updated_at timestamptz not null default now(), primary key (col, id))`);
      const { rows } = await pool.query("select col, id, data from docs");
      for (const r of rows) if (cache[ r.col ]) cache[ r.col ].set(r.id, r.data);
      console.log(`Loaded ${rows.length} saved documents`);
      return;
    } catch (e) {
      console.error(`Database not ready (try ${i}): ${e.message}`);
      if (i >= 6) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

/* ---------- live feed (Server-Sent Events) ---------- */
const clients = new Set();
function emit(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const r of clients) { try { r.write(msg); } catch (e) { clients.delete(r); } }
}
const snapshot = () => {
  const o = {};
  for (const c of COLS) o[ c ] = [ ...cache[ c ] ].map(([ id, data ]) => ({ id, data }));
  return o;
};
setInterval(() => { for (const r of clients) { try { r.write(": ping\n\n"); } catch (e) { clients.delete(r); } } }, 20000);

// live documents (timers, judges, live) older than 6 hours are dropped
setInterval(() => {
  const cutoff = Date.now() - 6 * 3600 * 1000;
  for (const c of COLS) {
    if (PERSIST.has(c)) continue;
    for (const [ id, d ] of cache[ c ]) if (d && d.at && d.at < cutoff) { cache[ c ].delete(id); emit("change", { col: c, id, data: null }); }
  }
}, 10 * 60 * 1000);

/* ---------- web server ---------- */
const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  const started = Date.now();

  console.log(`[REQ] ${req.method} ${req.url}`);

  res.on("finish", () => {
    console.log(
      `[RES] ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`
    );
  });

  next();
});

app.use(express.json({ limit: "20kb" }));
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Headers": "content-type,x-judge-pin,x-admin-pin",
    "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    clients: clients.size,
    timestamp: new Date().toISOString()
  });
});

app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (e) {
    console.error("[READY] Database check failed:", e.message);
    res.status(503).json({
      ok: false,
      database: "unavailable"
    });
  }
});

app.get("/api/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 2000\n\n");
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
  clients.add(res);
  console.log(`[SSE] Connected. Clients: ${clients.size}`);

  req.on("close", () => {
    clients.delete(res);
    console.log(`[SSE] Disconnected. Clients: ${clients.size}`);
  });
});

function check(req, res) {
  const { col, id } = req.params;
  if (!cache[ col ] || !ID_RE.test(id)) { res.status(404).json({ error: "not found" }); return false; }
  const need = needLevel(col, req.method);
  if (level(req.headers, JUDGE_PIN, ADMIN_PIN) < need) { res.status(401).json({ need: need === 2 ? "admin" : "judge" }); return false; }
  return true;
}

app.put("/api/docs/:col/:id", async (req, res) => {
  try {
    if (!check(req, res)) return;
    const { col, id } = req.params;
    if (!valid(col, req.body)) return res.status(400).json({ error: "invalid data" });
    if (PERSIST.has(col))
      await pool.query(
        `insert into docs(col,id,data) values($1,$2,$3)
         on conflict (col,id) do update set data = excluded.data, updated_at = now()`,
        [ col, id, req.body ]
      );
    cache[ col ].set(id, req.body);
    emit("change", { col, id, data: req.body });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

app.delete("/api/docs/:col/:id", async (req, res) => {
  try {
    if (!check(req, res)) return;
    const { col, id } = req.params;
    if (PERSIST.has(col)) await pool.query("delete from docs where col=$1 and id=$2", [ col, id ]);
    cache[ col ].delete(id);
    emit("change", { col, id, data: null });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
});

// backup: all saved scores and the schedule as JSON (admin PIN in the x-admin-pin header)
app.get("/api/export", (req, res) => {
  if (level(req.headers, JUDGE_PIN, ADMIN_PIN) < 2) return res.status(401).json({ need: "admin" });
  const s = snapshot();
  res.set("Content-Disposition", 'attachment; filename="fast-track-backup.json"');
  res.json({ exportedAt: new Date().toISOString(), scores: s.scores, schedule: s.schedule });
});

// optional: also serve the frontend from this server (then config.js can keep API_URL = "")
const front = path.join(__dirname, "..", "frontend");
if (fs.existsSync(front)) app.use(express.static(front));

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[BOOT] Listening on ${PORT}`);

  init()
    .then(() => {
      console.log("[BOOT] Database initialization completed");
    })
    .catch((e) => {
      console.error("[BOOT] Database initialization failed:", e);
    });
});

server.on("error", (e) => {
  console.error("[BOOT] HTTP server error:", e);
});
