"use strict";
/* ---- paths: every page loads this file from <site>/assets/app.js ---- */
const ROOT = new URL("../", document.currentScript.src).href;
const PAGE = document.body.dataset.page || "home";
const PATHS = { home: "", calc: "calculator/", lb: "leaderboard/", tv: "timer/", adm: "admin/", asc: "admin/scores/", aed: "admin/schedule/" };
const go = v => { location.href = ROOT + (PATHS[ v ] || "") };
function fixLinks() { document.querySelectorAll("a[data-go]").forEach(a => { a.href = ROOT + (PATHS[ a.dataset.go ] || "") }) }
const loadXlsx = () => new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = () => no(new Error("The Excel reader couldn’t load. Check your connection, or use a CSV file.")); document.head.append(s) });

const $ = q => document.querySelector(q);
const sum = a => a.reduce((x, y) => x + y, 0);
const fmt = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const TABS = { team: [ "Teamwork", 90 ], auto: [ "Autonomous", 180 ], pilot: [ "Piloting", 60 ] };
const AUTO = [ [ "off", "Take off", 5, 1 ], [ "red", "Red arch", 5, 2 ], [ "blue", "Blue arch", 5, 2 ], [ "green", "Green keyhole", 10, 2 ], [ "yellow", "Yellow keyhole", 20, 2 ], [ "cube", "Large cube", 25, 2 ], [ "m1", "Mini 1 (lowest)", 15, 2 ], [ "m2", "Mini 2 (middle)", 15, 2 ], [ "m3", "Mini 3 (top)", 15, 2 ], [ "spiral", "Spiral bonus", 10, 2 ], [ "tunnel", "Tunnel", 15, 2 ] ];
const KH = [ "Keyhole 1 (lowest)", "Keyhole 2 (middle)", "Keyhole 3 (highest)" ];
const PH = [ [ 5, [ "Red arch", "Green keyhole", "Large cube" ] ], [ 10, KH ], [ 15, [ "Blue arch", "Loop yellow keyhole", "Tunnel top→bottom", "Blue arch again" ] ], [ 10, KH ] ];
const LAND = [ [ "none", "None", 0 ], [ "pad", "Pad", 5 ], [ "cube", "Cube", 10 ], [ "bull", "Bullseye", 15 ] ];
const MAX = { team: { bags: 2, path: 2 }, auto: Object.fromEntries(AUTO.map(r => [ r[ 0 ], r[ 3 ] ])), pilot: {} };
const fresh = t => t === "team" ? { g1: 0, g2: 0, g3: 0, g4: 0, zone: 0, bags: 0, path: 0, small: 0, large: 0 }
  : t === "auto" ? Object.assign(Object.fromEntries(AUTO.map(r => [ r[ 0 ], 0 ])), { land: "none" })
    : { off: 0, p0: 0, p1: 0, p2: 0, p3: 0, s0: 0, s1: 0, s2: 0, s3: 0, land: "none" };
let S = { tab: "team" }, chg = null, armed = false, armT = 0;
try { const j = JSON.parse(localStorage.getItem("fts1") || "{}"); if (TABS[ j.tab ]) S.tab = j.tab; S.mute = !!j.mute; S.ctx = j.ctx || null; for (const t in TABS) S[ t ] = Object.assign(fresh(t), j[ t ]); S.team.small = S.team.small ? 1 : 0; S.team.large = S.team.large ? 1 : 0 }
catch (e) { for (const t in TABS) S[ t ] = fresh(t) }
const save = () => { try { localStorage.setItem("fts1", JSON.stringify(S)) } catch (e) { } };
const T = {}; for (const k in TABS) T[ k ] = { left: TABS[ k ][ 1 ], end: 0, run: false, warned: false };
const WARN = { team: 30, pilot: 15 };
let AC = null, WL = null;
function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume() } catch (e) { } }
function beep(f, at, d) { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + at; o.type = "square"; o.frequency.value = f; o.connect(g); g.connect(AC.destination); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.start(t); o.stop(t + d + 0.05) }
function sound(k) { if (S.mute || !AC) return; if (k === "warn") { beep(880, 0, .18); beep(880, .3, .18) } else { beep(660, 0, .3); beep(660, .45, .3); beep(990, .9, 1.1) } }
async function openFs() { const f = $("#fs"); f.hidden = false; try { const r = f.requestFullscreen && f.requestFullscreen(); if (r && r.catch) r.catch(() => { }) } catch (e) { } try { WL = await navigator.wakeLock.request("screen") } catch (e) { } }
function closeFs() { $("#fs").hidden = true; try { if (document.fullscreenElement) document.exitFullscreen() } catch (e) { } try { if (WL) WL.release(); WL = null } catch (e) { } }
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) closeFs() });

function room(t, id) {
  const s = S[ t ];
  if (t === "team" && /^g\d$/.test(id)) return s.g1 + s.g2 + s.g3 + s.g4 < 40;
  return s[ id ] < (MAX[ t ][ id ] ?? Infinity)
}
const ctl = (id, n) => `<div class="ctl"><button data-a="dec" data-id="${id}" aria-label="Decrease"${n ? "" : " disabled"}>−</button><output class="${id === chg ? "pop" : ""}">${n}</output><button data-a="inc" data-id="${id}" aria-label="Increase"${room(S.tab, id) ? "" : " disabled"}>+</button></div>`;
const tile = (id, t, sub, n) => `<div class="tile"><div class="tl"><b>${t}</b><small>${sub}</small></div>${ctl(id, n)}</div>`;
const ttog = (id, t, sub, on, cls = "") => `<div class="tile ${cls}"><div class="tl"><b>${t}</b><small>${sub}</small></div><button class="box${on ? " on" : ""}" data-a="tog" data-id="${id}" role="checkbox" aria-checked="${!!on}" aria-label="${t}"></button></div>`;
const cat = (t, r) => `<div class="cat"><span>${t}</span><em>${r || ""}</em></div>`;
const grid = b => `<div class="grid">${b}</div>`;
const landRow = () => `<div class="tile full"><div class="tl"><b>Landing</b><small>final landing only</small></div><div class="seg" role="radiogroup" aria-label="Landing">` + LAND.map(([ id, n, p ]) => `<button role="radio" aria-checked="${S[ S.tab ].land === id}" data-a="land" data-id="${id}">${n}<span>${p} pts</span></button>`).join("") + `</div></div>`;
const lp = s => LAND.find(x => x[ 0 ] === s.land)[ 2 ];
const WI = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`;

function warns(s) {
  const w = [];
  for (let k = 1; k < 4; k++)if (s[ "p" + k ] > s[ "p" + (k - 1) ]) w.push(`Phase ${k + 1} has more completions than phase ${k}. Phases are flown in order (1 → 2 → 3 → 4), so double-check the counts.`);
  if (s.p0 - s.p3 > 1) w.push("Phase 1 is more than one ahead of phase 4. A new lap only starts after phase 4, so double-check the counts.");
  if (!s.off && (s.p0 || s.p1 || s.p2 || s.p3)) w.push("Phases are scored, but take off isn’t checked.");
  return w.map(t => `<div class="warn">${WI}<p>${t}</p></div>`).join("")
}

function calc() {
  const t = S.tab, s = S[ t ];
  if (t === "team") { const g = [ s.g1, s.g2, s.g3, s.g4 ]; return [ [ "Balls", 2 * sum(g) ], [ "Goal bonus", 5 * Math.min(...g) ], [ "Zone", s.zone ], [ "Bean bags", 10 * s.bags ], [ "Flight path", 10 * s.path ], [ "Landing", 20 * s.small + 15 * s.large ] ] }
  if (t === "auto") return [ [ "Take off", 5 * s.off ], [ "Tasks", sum(AUTO.filter(r => r[ 0 ] !== "off" && r[ 0 ] !== "spiral").map(r => r[ 2 ] * s[ r[ 0 ] ])) ], [ "Spiral bonus", 10 * s.spiral ], [ "Landing", lp(s) ] ];
  return [ [ "Take off", 5 * s.off ], [ "Phases", sum(PH.map((p, k) => p[ 0 ] * s[ "p" + k ])) ], [ "Landing", lp(s) ] ]
}

function render() {
  const f = document.activeElement, fk = f && f.dataset && f.dataset.a ? [ f.dataset.a, f.dataset.id, f.dataset.i ] : null;
  const t = S.tab, s = S[ t ]; let h = "";
  if (t === "team") {
    const g = [ s.g1, s.g2, s.g3, s.g4 ];
    h += cat("Goals", `bonus +${5 * Math.min(...g)} · ${sum(g)}/40 balls`) + grid([ 1, 2, 3, 4 ].map(i => tile("g" + i, "Goal " + i, "2 pts / ball", s[ "g" + i ])).join(""));
    h += cat("Field tasks") + grid(tile("zone", "Scoring zone", "1 pt / ball", s.zone) + tile("bags", "Bean bags", "10 pts · max 2", s.bags) + tile("path", "Flight path", "10 pts · last 30 s", s.path));
    h += cat("Landing", "one drone per cube") + grid(ttog("small", "Small cube", "20 pts", s.small) + ttog("large", "Large cube", "15 pts", s.large));
  } else if (t === "auto") {
    const G = (ids, title) => cat(title) + grid(ids.map(id => { const r = AUTO.find(x => x[ 0 ] === id); return tile(id, r[ 1 ], `${r[ 2 ]} pts` + (id === "spiral" ? " · 1→2→3" : ""), s[ id ]) }).join(""));
    h += G([ "red", "blue", "green", "yellow" ], "Gates · max 2 each") + G([ "m1", "m2", "m3", "spiral" ], "Mini keyholes & spiral · max 2 each") + G([ "cube", "tunnel" ], "Cube & tunnel · max 2 each");
    h += cat("Take off & landing") + grid(ttog("off", "Take off", "5 pts · once", s.off, "full") + landRow());
  } else {
    const phase = k => { const p = PH[ k ], c = s[ "s" + k ]; return `<div class="tile ph"><div class="phh"><div class="tl"><b>Phase ${k + 1}</b><small>${p[ 0 ]} pts each${k % 2 ? " · mini keyholes" : ""}</small></div>${ctl("p" + k, s[ "p" + k ])}</div>` + p[ 1 ].map((x, i) => `<button class="item${i < c ? " on" : ""}" data-a="step" data-id="${k}" data-i="${i}" role="checkbox" aria-checked="${i < c}"><span class="num">${i + 1}</span><span class="t">${x}</span><span class="box${i < c ? " on" : ""}"></span></button>`).join("") + `</div>` };
    h += warns(s) + `<div style="height:6px"></div>` + grid(ttog("off", "Take off", "5 pts · once", s.off, "full") + PH.map((p, k) => phase(k)).join("") + landRow());
    h += `<p class="hint">Check steps in order. Start each new lap by flying over the red arch gate.</p>`;
  }
  h += `<button class="confirm" data-a="confirm"${cfOk() ? "" : " disabled"}>${cfTxt()}</button>`;
  $("#app").innerHTML = h;
  document.querySelectorAll("[data-a=tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.id === t));
  const p = calc();
  $("#lbl").textContent = (PRAC() ? "Practice · " : "") + TABS[ t ][ 0 ] + " score" + (known() && S.ctx.mission === "pilot" ? " · attempt " + (S.ctx.att || 1) + "/3" : ""); paintCtx(); $("#tot").textContent = sum(p.map(x => x[ 1 ]));
  $("#parts").textContent = p.filter(x => x[ 1 ]).map(x => x[ 0 ] + " " + x[ 1 ]).join(" · ") || "Nothing scored yet";
  paintTimer();
  if (fk) { const n = document.querySelector(`[data-a="${fk[ 0 ]}"][data-id="${fk[ 1 ]}"]` + (fk[ 2 ] != null ? `[data-i="${fk[ 2 ]}"]` : "")); if (n && !n.disabled) n.focus({ preventScroll: true }) }
  chg = null
}

function paintTimer() {
  const t = T[ S.tab ], full = TABS[ S.tab ][ 1 ], w = WARN[ S.tab ] || 0;
  const lb = t.run ? "Pause" : t.left === 0 ? "Restart" : t.left < full ? "Resume" : "Start";
  $("#clock").textContent = $("#fsclk").textContent = fmt(t.left);
  $("#start").textContent = $("#fsstart").textContent = lb;
  $("#fsl").textContent = TABS[ S.tab ][ 0 ];
  $("#fs").className = t.left === 0 ? "zero" : (w && t.left <= w ? "low" : "");
  $("#snd").textContent = S.mute ? "🔇" : "🔊"; $("#snd").setAttribute("aria-label", S.mute ? "Sound off" : "Sound on");
  $("#up").hidden = t.left !== 0;
  const cb = document.querySelector(".confirm"); if (cb) { cb.disabled = !cfOk(); cb.textContent = cfTxt() }
}
setInterval(() => { let any = false; for (const k in T) { const t = T[ k ]; if (t.run) { any = true; t.left = Math.max(0, Math.ceil((t.end - Date.now()) / 1000)); if (WARN[ k ] && !t.warned && t.left > 0 && t.left <= WARN[ k ]) { t.warned = true; sound("warn") } if (!t.left) { t.run = false; sound("end"); try { navigator.vibrate && navigator.vibrate([ 200, 100, 200 ]) } catch (e) { } } } } if (any) paintTimer() }, 200);

let DB = null, DBS = "load", ALL = [], lbTab = "pilot", DM = 1, toastT = 0;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ c ]));
const slug = n => [ ...n.trim().toLowerCase() ].map(c => /[a-z0-9]/.test(c) ? c : "~" + c.codePointAt(0).toString(36)).join("");
function resetAll() { for (const k in TABS) { S[ k ] = fresh(k); Object.assign(T[ k ], { left: TABS[ k ][ 1 ], run: false, warned: false }) } }
function toast(t) { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true }, 3500) }
/*lb-start*/
function rows(mode) {
  const m = new Map(), d = new Map();
  for (const r of ALL) {
    if (r.mode !== mode) continue; const mi = (r.match | 0) - 1, ai = ((r.attempt | 0) || 1) - 1; if (mi < 0 || mi > 7 || ai < 0 || ai > 2) continue;
    const id = r.key + "|" + mi + "|" + ai, p = d.get(id); if (!p || (r.at || 0) >= (p.at || 0)) d.set(id, r)
  }
  for (const r of d.values()) {
    let e = m.get(r.key); if (!e) { e = { name: r.team, a: [], i: [], at: 0 }; m.set(r.key, e) }
    const mi = r.match - 1, ai = (r.attempt || 1) - 1; (e.a[ mi ] = e.a[ mi ] || [ null, null, null ])[ ai ] = r.score; (e.i[ mi ] = e.i[ mi ] || [])[ ai ] = r._id; if ((r.at || 0) >= e.at) { e.at = r.at || 0; e.name = r.team }
  }
  const o = [ ...m.values() ];
  o.forEach(e => { e.v = e.a.map(x => Math.max(...x.filter(y => y != null))); e.sorted = e.v.filter(x => x != null).sort((a, b) => b - a) });
  o.sort((a, b) => { for (let i = 0; i < 8; i++) { const x = a.sorted[ i ] ?? -1, y = b.sorted[ i ] ?? -1; if (x !== y) return y - x } return a.name.localeCompare(b.name) }); return o
}
function colsFor(mode, o) {
  const cnt = new Map(); let c = 0;
  for (const r of SCH) { if (r.mission !== mode || !r.teams) continue; for (const t of r.teams) { const k = slug(t), v = (cnt.get(k) || 0) + 1; cnt.set(k, v); c = Math.max(c, v) } }
  for (const e of o) c = Math.max(c, e.a.length); return Math.max(1, Math.min(c, 8))
}
/*lb-end*/
function lbHtml(mode, manage) {
  const r = rows(mode);
  if (!r.length) return `<div class="empty">${DBS === "load" ? "Loading…" : manage ? "No scores yet. Add one with the button above." : "No scores yet. Confirm a match in the calculator and it will show up here."}</div>`;
  const n = colsFor(mode, r), pil = mode === "pilot"; let pk = "", pr = 0;
  const th = Array.from({ length: n }, (_, i) => `<th>Match ${i + 1}${pil ? "<small>A1 · A2 · A3</small>" : ""}</th>`).join("");
  const one = (e, j, k, v, best) => manage ? `<button class="cell${v == null ? " empty" : v === best ? " best" : ""}" data-a="sc" data-team="${esc(e.name)}" data-m="${j + 1}" data-att="${k + 1}" data-id="${esc((e.i[ j ] && e.i[ j ][ k ]) || "")}" data-score="${v == null ? "" : v}">${v == null ? "–" : v}</button>` : `<span class="${v != null && v === best ? "best" : ""}">${v == null ? "–" : v}</span>`;
  return `<table class="${manage ? "mg" : ""}"><thead><tr><th>Team</th>${th}</tr></thead><tbody>` + r.map((e, i) => {
    const k = e.sorted.join(), rk = i && k === pk ? pr : i + 1; pk = k; pr = rk; const best = e.sorted[ 0 ];
    return `<tr><td class="nm"><span class="rk${rk === 1 ? " r1" : ""}">${rk}</span>${esc(e.name)}</td>` + Array.from({ length: n }, (_, j) => {
      const at = e.a[ j ] || [ null, null, null ];
      if (pil) return `<td class="att">` + at.map((x, q) => one(e, j, q, x, best)).join("") + `</td>`;
      return manage ? `<td class="att">${one(e, j, 0, at[ 0 ], best)}</td>` : `<td class="${at[ 0 ] != null && at[ 0 ] === best ? "best" : ""}">${at[ 0 ] == null ? "–" : at[ 0 ]}</td>`
    }).join("") + `</tr>`
  }).join("") + `</tbody></table>`
}
function renderLB() {
  document.querySelectorAll("[data-a=lbtab]").forEach(b => b.setAttribute("aria-selected", b.dataset.id === lbTab));
  $("#lbbody").innerHTML = DBS === "none" ? `<div class="empty">The leaderboard can’t load here. Check your connection and try again.</div>` : lbHtml(lbTab, false)
}
let SCH = [];
function teamsList() { $("#teams").innerHTML = [ ...new Set([ ...SCH.flatMap(r => r.teams || []), ...ALL.map(r => r.team) ]) ].filter(Boolean).map(n => `<option value="${esc(n)}">`).join("") }
const bySch = (a, b) => (a.start || "").localeCompare(b.start || "") || (a.mission || "").localeCompare(b.mission || "");
const MN = { team: "Teamwork", auto: "Autonomous", pilot: "Solo piloting" };
const nowM = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() };
let curRow = null;
const st = r => isDone(r) ? "past" : r === curRow ? "live" : "fut";
const mOrder = rows => { const first = m => Math.min(...rows.filter(r => r.mission === m).map(r => tmin(r.start))); return [ "team", "auto", "pilot" ].filter(m => rows.some(r => r.mission === m)).sort((a, b) => first(a) - first(b)) };
const LEG = `<div class="leg"><span class="p">Scored</span><span class="l">Now</span><span class="f">Upcoming</span></div>`;
let schScrolled = false;
let schUser = false;   // once the visitor scrolls by hand, the page stops moving on its own
[ "wheel", "touchmove", "keydown", "mousedown" ].forEach(ev => addEventListener(ev, () => { schUser = true }, { passive: true }));
function pinMetrics() {   // tells the CSS how tall the pinned title + buttons are
  const t = document.querySelector("#home .top");
  if (t && t.offsetHeight) document.documentElement.style.setProperty("--topH", t.offsetHeight + "px");
}
function scrollSched() {
  pinMetrics();
  if (schUser) return;
  const row = document.querySelector("#schbody tr.live") || document.querySelector("#schbody tr.fut");
  if (!row) return;
  const leg = document.querySelector("#schbody .leg"), cat = row.closest(".sec") && row.closest(".sec").querySelector(".cat");
  const top = document.querySelector("#home .top");
  const pinned = (top ? (parseFloat(getComputedStyle(top).top) || 0) + top.offsetHeight : 0) + (leg ? leg.offsetHeight : 0) + (cat ? cat.offsetHeight : 0) + 6;
  window.scrollTo(0, Math.max(0, row.getBoundingClientRect().top + window.scrollY - pinned));
}
// the page is still settling (data, fonts), so place it a few times
function placeSched() { requestAnimationFrame(scrollSched); setTimeout(scrollSched, 300); setTimeout(scrollSched, 900) }
addEventListener("resize", () => pinMetrics());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => pinMetrics());
let scoresLoaded = false;
function schHtml(rows, live) {
  curRow = [ ...rows ].sort(bySch).find(r => !isDone(r)) || null; return mOrder(rows).map(m => {
    const g = rows.filter(r => r.mission === m).sort(bySch); if (!g.length) return "";
    return `<section class="sec"><div class="cat">${MN[ m ]}</div><div class="tw"><table class="sch"><thead><tr><th>Time</th><th colspan="${m === "team" ? 2 : 1}">Team name</th></tr></thead><tbody>` + g.map(r => `<tr class="${live ? st(r, g) : ""}"><td>${esc(r.start + (r.end ? " – " + r.end : ""))}${live && st(r, g) === "live" ? `<span class="chip">Now</span>` : ""}</td>` + (m === "team" ? [ 0, 1 ].map(i => `<td class="nm">${esc(r.teams[ i ] || "")}</td>`).join("") : `<td class="nm">${esc(r.teams[ 0 ] || "")}</td>`) + `</tr>`).join("") + `</tbody></table></div></section>`
  }).join("")
}
function renderSched() {
  const b = $("#schbody");
  if (DBS === "none") { b.innerHTML = `<div class="empty">Can’t load the schedule here. Check your connection and try again.</div>`; return }
  const r = SCH.filter(x => x.mission && x.teams);
  b.innerHTML = r.length ? LEG + schHtml(r, true) : `<div class="empty">${DBS === "load" ? "Loading…" : "No schedule yet. An admin can import one on the Admin page."}</div>`; if (r.length && scoresLoaded && !schScrolled) { schScrolled = true; placeSched() } pinMetrics();
}
/*parse-start*/
const MX = /^\s*(teamwork|autonomous|piloting|solo piloting|solo)(\s+mission)?\s*$/i;
const mk = s => /team/i.test(s) ? "team" : /auto/i.test(s) ? "auto" : /pilot|solo/i.test(s) ? "pilot" : null;
const TC = /^\s*\d{1,2}[:.]\d{2}\s*(?:[–—-]\s*\d{1,2}[:.]\d{2})?\s*$/;
const hhmm = (h, m) => String(h).padStart(2, "0") + ":" + m;
function cellStr(c) {
  if (c == null) return "";
  if (typeof c === "number" && c >= 0 && c < 1) { const t = Math.round(c * 1440); return hhmm(Math.floor(t / 60) % 24, String(t % 60).padStart(2, "0")) }
  if (c instanceof Date) return hhmm(c.getHours(), String(c.getMinutes()).padStart(2, "0"));
  return String(c).replace(/\s+/g, " ").trim()
}
function parseAoA(rows, sheet) {
  let cur = mk(sheet || ""); const out = [], warn = [];
  rows.forEach((r, ri) => {
    const cells = r.map(cellStr).filter(Boolean), times = [], rest = [];
    for (const c of cells) { if (TC.test(c)) for (const m of c.matchAll(/(\d{1,2})[:.](\d{2})/g)) times.push(hhmm(+m[ 1 ], m[ 2 ])); else rest.push(c) }
    if (!times.length) { const h = rest.map(mk).find(Boolean); if (h && rest.length <= 2) cur = h; return }
    let mis = cur; if (rest.length && MX.test(rest[ 0 ])) mis = mk(rest.shift());
    if (!mis || !rest.length || rest.some(c => /pertrauka|break|pause/i.test(c))) return;
    const n = mis === "team" ? 2 : 1; if (rest.length > n) warn.push(`Row ${ri + 1}: expected ${n} team${n > 1 ? "s" : ""}, kept the first ${n}.`);
    out.push({ mission: mis, start: times[ 0 ], end: times[ 1 ] || "", teams: rest.slice(0, n) })
  });
  return { out, warn }
}
function csv(t) {
  t = t.replace(/^\ufeff/, ""); const first = t.split(/\r?\n/)[ 0 ] || "";
  const d = [ ";", "\t", "," ].sort((a, b) => first.split(b).length - first.split(a).length)[ 0 ];
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[ i ];
    if (q) { if (c === '"') { if (t[ i + 1 ] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true; else if (c === d) { row.push(f); f = "" }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[ i + 1 ] === "\n") i++; row.push(f); rows.push(row); row = []; f = "" } else f += c
  }
  row.push(f); rows.push(row); return rows
}
/*parse-end*/
/*gen-start*/
function genSchedule(names, o) {
  const mins = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ""); return m ? +m[ 1 ] * 60 + +m[ 2 ] : 0 };
  const at = x => { x = (x % 1440 + 1440) % 1440; return hhmm(Math.floor(x / 60), String(x % 60).padStart(2, "0")) };
  const out = [], seq = []; for (let r = 0; r < o.rounds; r++)seq.push(...names);
  let t = mins(o.t0);
  for (let i = 0; i < seq.length; i += 2) { out.push({ mission: "team", start: at(t), end: at(t + o.tl), teams: seq.slice(i, i + 2) }); t += o.tl }
  t = mins(o.p0);
  for (let r = 0; r < o.rounds; r++) { for (const n of names) { out.push({ mission: "pilot", start: at(t), end: at(t + o.pl), teams: [ n ] }); t += o.pl } if (r < o.rounds - 1) t += o.brk }
  return out
}
/*gen-end*/
function showPrev(out, warn, verb) {
  out.sort(bySch); PEND = out; const c = m => out.filter(r => r.mission === m).length;
  $("#prev").innerHTML = `<p class="fmt"><b>${out.length} slots ${verb || "found"}</b> · Teamwork ${c("team")} · Autonomous ${c("auto")} · Piloting ${c("pilot")}. Importing replaces the current schedule.</p>` + warn.map(w => `<p class="pw">${esc(w)}</p>`).join("") + schHtml(out);
  $("#pbtns").hidden = false; $("#prev").scrollIntoView({ behavior: "smooth", block: "nearest" })
}
function doGen() {
  clearPrev(); const er = $("#perr"), seen = new Set(), names = [];
  for (const x of $("#gnames").value.split(/[\n,;]+/)) { const n = x.trim().slice(0, 30); if (n && !seen.has(slug(n))) { seen.add(slug(n)); names.push(n) } }
  const num = (id, d) => { const v = parseInt($(id).value, 10); return v > 0 ? v : d };
  if (names.length < 2) { er.textContent = "Enter at least two team names."; return }
  if (!$("#gt0").value || !$("#gp0").value) { er.textContent = "Pick both start times."; return }
  showPrev(genSchedule(names, { t0: $("#gt0").value, p0: $("#gp0").value, tl: num("#gtl", 10), pl: num("#gpl", 5), rounds: Math.min(4, num("#gr", 2)), brk: Math.max(0, parseInt($("#gb").value, 10) || 0) }), [], "generated")
}
async function readFile(f) {
  if (/\.csv$/i.test(f.name) || f.type === "text/csv") return [ { name: "", rows: csv(await f.text()) } ];
  if (!window.XLSX) await loadXlsx();
  const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
  return wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[ n ], { header: 1, raw: true, defval: "" }) }))
}
let PEND = null;
function clearPrev() { PEND = null; $("#prev").innerHTML = ""; $("#pbtns").hidden = true; $("#sfile").value = ""; $("#perr").textContent = "" }
async function pickFile(f) {
  clearPrev(); const er = $("#perr");
  try {
    let out = [], warn = []; for (const sh of await readFile(f)) { const r = parseAoA(sh.rows, sh.name); out = out.concat(r.out); warn = warn.concat(r.warn) }
    if (!out.length) { er.textContent = "No team rows found. Check the file format below."; return }
    showPrev(out, warn)
  }
  catch (e) { er.textContent = e && e.message ? e.message : "Couldn’t read that file." }
}
async function doImport() {
  const er = $("#perr"); er.textContent = ""; if (!PEND) return;
  if (!DB) { er.textContent = "Saving isn’t available here. Check your connection and try again."; return }
  $("#pimp").disabled = true;
  try {
    const keep = new Set(), ops = PEND.map((r, i) => { const id = "s" + String(i).padStart(3, "0"); keep.add(id); return DB.doc("schedule/" + id).set(r) });
    SCH.filter(r => !keep.has(r.id)).forEach(r => ops.push(DB.doc("schedule/" + r.id).delete()));
    await Promise.all(ops); const n = PEND.length; clearPrev(); toast(`Imported ${n} slots`); setTimeout(() => go("home"), 700)
  }

  catch (e) {
    console.error("Schedule import failed:", e);

    if (e && e.code === "invalid_argument") {
      er.textContent =
        "Admin PIN was rejected or missing. Please try importing again.";
    } else if (e && e.status) {
      er.textContent =
        "Import failed (HTTP " + e.status + "): " +
        (e.message || "Server rejected the request.");
    } else {
      er.textContent =
        "Import failed (" + (e && e.code ? e.code : "unknown") + "): " +
        (e && e.message ? e.message : "Could not complete the request.");
    }
  }

  $("#pimp").disabled = false
}
const dz = $("#drop");
[ "dragenter", "dragover" ].forEach(v => dz.addEventListener(v, e => { e.preventDefault(); dz.classList.add("on") }));
[ "dragleave", "drop" ].forEach(v => dz.addEventListener(v, e => { e.preventDefault(); dz.classList.remove("on") }));
dz.addEventListener("drop", e => { const f = e.dataTransfer.files[ 0 ]; if (f) pickFile(f) });
$("#sfile").addEventListener("change", e => { const f = e.target.files[ 0 ]; if (f) pickFile(f) });
function route() {
  const v = PAGE, pk = v === "calc" && !S.ctx;
  $("#calc").hidden = v !== "calc" || pk; $("#pick").hidden = !pk; $("#lb").hidden = v !== "lb"; $("#home").hidden = v !== "home"; $("#adm").hidden = v !== "adm" || !ADMIN_OK; $("#asc").hidden = v !== "asc" || !ADMIN_OK; $("#aed").hidden = v !== "aed" || !ADMIN_OK; $("#tv").hidden = v !== "tv";
  if (v !== "calc") closeFs(); if (pk) renderPick(); if (v === "lb") renderLB(); if (v === "home") { schScrolled = false; renderSched() }
  if (v === "adm" || v === "asc" || v === "aed") paintAnav(v); if (v === "asc") renderAsc(); if (v === "aed") renderAed();
  if (v === "tv") { paintTv(); tvWake() } else tvLeave(); document.body.classList.remove("boot")
}
/*pick-start*/
const rng = r => r.start + (r.end ? " – " + r.end : "");
const tmin = v => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ""); return m ? +m[ 1 ] * 60 + +m[ 2 ] : 0 };
const endm = r => r.end ? tmin(r.end) : tmin(r.start) + 5;
const nextIdx = (rows, now) => rows.findIndex(r => endm(r) > now);
function matchNo(n, mission, id) { const k = slug(n), l = SCH.filter(r => r.mission === mission && r.teams && r.teams.some(x => slug(x) === k)).sort(bySch), i = l.findIndex(r => r.id === id); return Math.max(1, i + 1) }
const need = m => m === "pilot" ? 3 : 1;
const hasAtt = (r, a) => r.teams.every(n => ALL.some(x => x.mode === r.mission && x.key === slug(n) && x.match === matchNo(n, r.mission, r.id) && (x.attempt || 1) === a));
const isDone = r => { for (let a = 1; a <= need(r.mission); a++)if (!hasAtt(r, a)) return false; return true };
const nextAtt = r => { for (let a = 1; a <= need(r.mission); a++)if (!hasAtt(r, a)) return a; return 1 };
/*pick-end*/
let cArm = false, cT = 0;
const PRAC = () => !!(S.ctx && S.ctx.practice);
const cfOk = () => true;
const cfTxt = () => PRAC() ? "Finish practice" : "Submit score";
const known = () => !!(S.ctx && S.ctx.teams && !S.ctx.practice);
const curAtt = () => S.ctx && S.ctx.mission === "pilot" ? (S.ctx.att || 1) : 1;
function renderPick() {
  const b = $("#pickbody"), rows = SCH.filter(r => r.mission && r.teams).sort(bySch), d = new Date(), now = d.getHours() * 60 + d.getMinutes(), open = rows.filter(r => !isDone(r)), nx = open[ 0 ] || null; let h = "";
  if (nx) h += `<button class="next" data-a="slot" data-id="${esc(nx.id)}"><small>${endm(nx) <= now ? "Overdue" : tmin(nx.start) <= now ? "Now" : "Next up"} · ${esc(rng(nx))} · ${MN[ nx.mission ]}</small><b>${nx.teams.map(esc).join("<span> + </span>")}</b><em>Start scoring ›</em></button>`;
  else h += `<div class="empty">${DBS === "none" ? "The schedule can’t load here." : DBS === "load" ? "Loading…" : rows.length ? "All matches are scored." : "No schedule yet. Import one on the Admin page, or run a practice match."}</div>`;
  h += `<button class="prac" data-a="prac">Practice match</button>`;
  const rest = rows.filter(r => r !== nx);
  if (rest.length) h += `<div class="cat">All matches</div><div class="slots">` + rest.map(r => `<button class="sl${isDone(r) ? " past" : ""}" data-a="slot" data-id="${esc(r.id)}"><span class="t">${esc(r.start)}</span><span class="n">${r.teams.map(esc).join(" + ")}</span><span class="m">${MN[ r.mission ]}</span></button>`).join("") + `</div>`;
  b.innerHTML = h
}
/* ---- password gate ---- */
let ADMIN_OK = false, gateKind = "", gateDone = null;
function openGate(kind, msg, done) {
  gateKind = kind; gateDone = done;
  $("#gatet").textContent = kind === "admin" ? "Admin password" : "Judges’ password";
  $("#gatew").textContent = msg || "";
  $("#gatein").value = ""; $("#gateok").disabled = false; $("#gate").hidden = false;
  setTimeout(() => $("#gatein").focus(), 60);
}
function closeGate(ok) { $("#gate").hidden = true; const f = gateDone; gateDone = null; if (f) f(ok) }
async function submitGate() {
  const v = $("#gatein").value.trim(); if (!v) return;
  $("#gateok").disabled = true; $("#gatew").textContent = "Checking…";
  const st = await window.ftDB.verify(gateKind, v);
  $("#gateok").disabled = false;
  if (st === "ok") return closeGate(true);
  $("#gatew").textContent = st === "bad" ? "Wrong password. Try again." : st === "limited" ? "Too many wrong tries. Wait a few minutes." : "Can’t reach the server. It may be waking up; try again in a moment.";
  $("#gatein").value = ""; $("#gatein").focus();
}
// Resolves true when this phone has a password the server accepts for `kind`; asks for it when needed.
async function needPin(kind) {
  if (!window.ftDB || !$("#gate").hidden) return false;
  const st = await window.ftDB.verify(kind);
  if (st === "ok") return true;
  return new Promise(res => openGate(kind, st === "offline" ? "Can’t reach the server. Type the password to try again." : "", res));
}
async function pickSlot(id) { const r = SCH.find(x => x.id === id); if (!r) return; if (!(await needPin("judge"))) return; resetAll(); S.tab = r.mission; S.ctx = { id: r.id, mission: r.mission, teams: r.teams, start: r.start, end: r.end || "", att: nextAtt(r) }; save(); render(); route() }
function paintCtx() {
  tsync(); pushJudge(); const c = S.ctx, real = known(); $(".tabs").classList.toggle("lock", real); $("#ctx").hidden = !real;
  if (real) { $("#ctxn").textContent = c.teams.join(" + "); $("#ctxs").textContent = (c.mission === "pilot" ? "Attempt " + (c.att || 1) + "/3 · " : "") + MN[ c.mission ] + " · " + rng(c) }
}
setInterval(() => { if (!$("#pick").hidden) renderPick() }, 30000);
const names = () => known() ? S.ctx.teams.slice(0, S.tab === "team" ? 2 : 1) : [];
/*admin screens*/
function paintAnav(v) {
  const L = [ [ "adm", "adm", "Import" ], [ "asc", "asc", "Scores" ], [ "aed", "aed", "Schedule" ], [ "home", "home", "Exit" ] ];
  document.querySelectorAll(".anav").forEach(n => { n.innerHTML = L.map(([ k, h, t ]) => `<a data-go="${h}" href="#" class="${k === v ? "on" : ""}">${t}</a>`).join("") }); fixLinks()
}
let ascTab = "pilot", SM = null, EM = null, smArm = false, smT = 0, emArm = false, emT = 0;
const scoreId = (m, k, mt, a) => m + "_" + k + "_" + mt + (m === "pilot" ? "_a" + a : "");
const permMsg = e => e && e.code === "invalid_argument" ? "The PIN was missing or wrong. Try again." : "Couldn’t save. Check your connection and try again.";
function renderAsc() {
  document.querySelectorAll("[data-a=asctab]").forEach(b => b.setAttribute("aria-selected", b.dataset.id === ascTab));
  $("#ascbody").innerHTML = DBS === "none" ? `<div class="empty">Can’t load scores here. Check your connection and try again.</div>` : `<div class="tw">` + lbHtml(ascTab, true) + `</div>`
}
function fillSel(sel, n, v) { sel.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(""); sel.value = String(v) }
function openSm(o) {
  SM = { mode: ascTab, oldId: o.id || "" };
  $("#smt").textContent = (o.id ? "Change" : "Add") + " score · " + MN[ ascTab ];
  $("#smteam").value = o.team || ""; fillSel($("#smm"), 8, o.m || 1); fillSel($("#sma"), 3, o.att || 1); $("#sma_w").hidden = ascTab !== "pilot";
  $("#sms").value = o.score ?? ""; $("#smdel").hidden = !o.id; $("#smdel").textContent = "Delete"; smArm = false; $("#smw").textContent = "";
  $("#sm").hidden = false; smWarn(); setTimeout(() => (o.team ? $("#sms") : $("#smteam")).focus(), 60)
}
function closeSm() { $("#sm").hidden = true; SM = null }
function smWarn() {
  const name = $("#smteam").value.trim(), w = $("#smw"); if (!name || !SM) { w.textContent = ""; return }
  const id = scoreId(SM.mode, slug(name), +$("#smm").value, +$("#sma").value), ex = ALL.find(r => r._id === id);
  w.textContent = ex && id !== SM.oldId ? `${ex.team} already has ${ex.score} pts here. Saving replaces it.` : ""
}
async function saveSm() {
  const er = $("#smw"), name = $("#smteam").value.trim().slice(0, 30), match = +$("#smm").value, att = SM.mode === "pilot" ? +$("#sma").value : 1, raw = $("#sms").value.trim(), score = Number(raw);
  if (!name) { er.textContent = "Enter a team name."; return }
  if (raw === "" || !Number.isInteger(score) || score < 0 || score > 10000) { er.textContent = "Enter a score from 0 to 10000."; return }
  if (!DB) { er.textContent = "Saving isn’t available here. Check your connection and try again."; return }
  const key = slug(name), id = scoreId(SM.mode, key, match, att); $("#smsave").disabled = true;
  try {
    await DB.doc("scores/" + id).set({ mode: SM.mode, key, team: name, match, attempt: att, score, at: Date.now() });
    if (SM.oldId && SM.oldId !== id) await DB.doc("scores/" + SM.oldId).delete(); closeSm(); toast("Score saved")
  }
  catch (e) { er.textContent = permMsg(e) }
  $("#smsave").disabled = false
}
async function delSm(b) {
  if (!SM || !SM.oldId) return;
  if (!smArm) { smArm = true; b.textContent = "Tap again to delete"; clearTimeout(smT); smT = setTimeout(() => { smArm = false; b.textContent = "Delete" }, 3000); return }
  smArm = false; try { await DB.doc("scores/" + SM.oldId).delete(); closeSm(); toast("Score deleted") } catch (e) { $("#smw").textContent = permMsg(e) }
}
function renderAed() {
  const b = $("#aedbody");
  if (DBS === "none") { b.innerHTML = `<div class="empty">Can’t load the schedule here. Check your connection and try again.</div>`; return }
  const r = SCH.filter(x => x.mission && x.teams);
  b.innerHTML = r.length ? mOrder(r).map(m => {
    const g = r.filter(x => x.mission === m).sort(bySch); if (!g.length) return "";
    return `<div class="cat">${MN[ m ]}</div><div class="tw"><table class="sch"><thead><tr><th>Time</th><th>Teams</th><th></th></tr></thead><tbody>` + g.map(x => `<tr><td>${esc(rng(x))}</td><td class="nm">${x.teams.map(esc).join(" + ")}</td><td><button class="edb" data-a="ed" data-id="${esc(x.id)}" aria-label="Edit slot">✎</button></td></tr>`).join("") + `</tbody></table></div>`
  }).join("") : `<div class="empty">${DBS === "load" ? "Loading…" : "No schedule yet. Add a slot, or import one."}</div>`
}
const emMis = () => { $("#emt2w").hidden = $("#emm").value !== "team" };
function openEm(id) {
  const r = id ? SCH.find(x => x.id === id) : null; EM = { id: id || "" };
  $("#emt").textContent = r ? "Edit slot" : "Add slot"; $("#emm").value = r ? r.mission : "team"; $("#ems").value = r ? r.start : ""; $("#eme").value = r ? r.end || "" : "";
  $("#emt1").value = r ? r.teams[ 0 ] || "" : ""; $("#emt2").value = r ? r.teams[ 1 ] || "" : ""; $("#emdel").hidden = !r; $("#emdel").textContent = "Delete"; emArm = false; $("#emw").textContent = ""; emMis(); $("#em").hidden = false
}
function closeEm() { $("#em").hidden = true; EM = null }
async function saveEm() {
  const er = $("#emw"), mission = $("#emm").value, start = $("#ems").value, end = $("#eme").value, t1 = $("#emt1").value.trim().slice(0, 30), t2 = mission === "team" ? $("#emt2").value.trim().slice(0, 30) : "";
  if (!start || !t1) { er.textContent = "Enter a start time and at least one team."; return }
  if (t2 && slug(t2) === slug(t1)) { er.textContent = "Pick two different teams."; return }
  if (!DB) { er.textContent = "Saving isn’t available here. Check your connection and try again."; return }
  const row = { mission, start, end, teams: [ t1, t2 ].filter(Boolean) }, id = EM.id || "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  $("#emsave").disabled = true;
  try { await DB.doc("schedule/" + id).set(row); closeEm(); toast("Slot saved") } catch (e) { er.textContent = permMsg(e) }
  $("#emsave").disabled = false
}
async function delEm(b) {
  if (!EM || !EM.id) return;
  if (!emArm) { emArm = true; b.textContent = "Tap again to delete"; clearTimeout(emT); emT = setTimeout(() => { emArm = false; b.textContent = "Delete" }, 3000); return }
  emArm = false; try { await DB.doc("schedule/" + EM.id).delete(); closeEm(); toast("Slot deleted") } catch (e) { $("#emw").textContent = permMsg(e) }
}
$("#smteam").addEventListener("input", smWarn); $("#smm").addEventListener("change", smWarn); $("#sma").addEventListener("change", smWarn); $("#emm").addEventListener("change", emMis);
/*tsync-start*/
let TSUB = null, TKEY = "";
const tkey = () => known() ? S.ctx.id + (S.ctx.mission === "pilot" ? "_a" + (S.ctx.att || 1) : "") : "";
function applyTimer(d) {
  if (!d || !known() || Date.now() - (d.at || 0) > 9e5) return; const t = S.tab, m = T[ t ], w = WARN[ t ] || 0;
  if (d.run) { const left = Math.max(0, Math.ceil((d.end - Date.now()) / 1000)); m.end = d.end; m.left = left; m.run = left > 0; m.warned = left <= w }
  else { m.run = false; m.left = d.left; m.warned = d.left <= w }
  paintTimer()
}
function tsync() {
  const k = tkey(); if (k === TKEY || (k && !DB)) return; if (TKEY) dropJudge(TKEY); TKEY = k; lastJ = null;
  if (TSUB) { try { TSUB() } catch (e) { } TSUB = null }
  if (!k) return;
  try { TSUB = DB.doc("timers/" + k).onSnapshot(sn => { if (sn.exists) applyTimer(sn.data()) }, () => { }) } catch (e) { }
}
function pushTimer() {
  const k = tkey(); if (!k || !DB) return; const m = T[ S.tab ], now = Date.now();
  const d = m.run ? { run: true, end: m.end, left: Math.ceil((m.end - now) / 1000), at: now } : { run: false, left: m.left, at: now };
  const c = S.ctx, live = { ...d, key: k, mission: c.mission, teams: c.teams, matches: c.teams.map(n => matchNo(n, c.mission, c.id)), att: c.mission === "pilot" ? (c.att || 1) : 0 };
  try { Promise.resolve(DB.doc("timers/" + k).set(d)).catch(() => { }); Promise.resolve(DB.doc("live/current").set(live)).catch(() => { }) } catch (e) { }
}
let LIVE = null, TVWL = null, tvFull = false;
function paintTv() {
  const d = LIVE, tv = $("#tv");
  if (!d) { tv.className = ""; $("#tvcat").textContent = "Timer"; $("#tvclk").textContent = "--:--"; $("#tvmeta").textContent = "Waiting for a timer to start…"; $("#tvteams").innerHTML = ""; return }
  const full = TABS[ d.mission ][ 1 ], left = d.run ? Math.max(0, Math.ceil((d.end - Date.now()) / 1000)) : d.left, w = WARN[ d.mission ] || 0;
  tv.className = left === 0 ? "zero" : (w && left <= w ? "low" : "");
  $("#tvcat").textContent = MN[ d.mission ] || ""; $("#tvclk").textContent = fmt(left);
  const nums = d.matches || [], same = nums.every(x => x === nums[ 0 ]), st = d.run && left > 0 ? "" : left === 0 ? "Time’s up" : left < full ? "Paused" : "Ready";
  $("#tvmeta").textContent = [ same && nums.length ? "Match " + nums[ 0 ] : "", d.att ? "Attempt " + d.att + "/3" : "", st ].filter(Boolean).join(" · ");
  $("#tvteams").innerHTML = (d.teams || []).map((t, i) => `<div>${esc(t)}${same ? "" : `<small>Match ${nums[ i ]}</small>`}</div>`).join("")
}
async function tvWake() { try { if (!TVWL) TVWL = await navigator.wakeLock.request("screen") } catch (e) { } }
function tvLeave() { try { if (TVWL) { TVWL.release(); TVWL = null } } catch (e) { } try { if (tvFull && document.fullscreenElement) document.exitFullscreen() } catch (e) { } tvFull = false }
setInterval(() => { if (!$("#tv").hidden) paintTv() }, 100);
/*tsync-end*/
/*judges-start*/
let JD = [], JT = 0, lastJ = null;
const CID = (() => { try { let c = sessionStorage.getItem("ftcid"); if (!c) { c = Math.random().toString(36).slice(2, 8); sessionStorage.setItem("ftcid", c) } return c } catch (e) { return Math.random().toString(36).slice(2, 8) } })();
const mineScore = () => sum(calc().map(x => x[ 1 ]));
const othersNow = () => { const k = tkey(); return k ? JD.filter(x => x.k === k && x.cid !== CID && Date.now() - (x.at || 0) < 45000 && x.score > 0).sort((a, b) => a.cid.localeCompare(b.cid)) : [] };
function dropJudge(k) { if (!DB) return; try { Promise.resolve(DB.doc("judges/" + k + "_" + CID).delete()).catch(() => { }) } catch (e) { } }
function sendJudge(force) {
  const k = tkey(); if (!k || !DB) return; const sc = mineScore(), now = Date.now();
  if (!force && lastJ && lastJ.k === k && lastJ.s === sc && now - lastJ.t < 10000) return; lastJ = { k, s: sc, t: now };
  try { Promise.resolve(DB.doc("judges/" + k + "_" + CID).set({ k, cid: CID, score: sc, at: now })).catch(() => { }) } catch (e) { }
}
function pushJudge() { clearTimeout(JT); JT = setTimeout(() => sendJudge(false), 400) }
setInterval(() => { if (known() && mineScore() > 0) sendJudge(true) }, 15000);
addEventListener("pagehide", () => { if (TKEY) dropJudge(TKEY) });
/*judges-end*/
function paintJd() {
  const mine = mineScore(), o = othersNow(), same = o.every(x => x.score === mine);
  $("#jdl").innerHTML = `<div class="jdr"><span>You</span><b>${mine}</b></div>` + o.map((x, i) => `<div class="jdr"><span>Judge ${i + 2}</span><b>${x.score}</b></div>`).join("");
  $("#jdm").className = same ? "jdgood" : "jdwarn";
  $("#jdm").textContent = !o.length ? "The other judge isn’t active any more." : same ? "The scores match." : "The scores are different (" + o.map((x, i) => `Judge ${i + 2}: ${x.score}, ${x.score - mine > 0 ? "+" : ""}${x.score - mine}`).join("; ") + "). Please double-check the scoring before saving.";
  $("#jdsave").textContent = same ? `Save ${mine} pts` : `Save ${mine} pts anyway`
}
function requestSubmit() { if (known() && mineScore() > 0 && othersNow().length) { paintJd(); $("#jd").hidden = false } else submitScore() }
let saving = false;
async function submitScore() {
  if (saving || !known()) return;
  const nm = names(), mode = S.tab, score = sum(calc().map(x => x[ 1 ])), at = Date.now(), att = curAtt(), mn = n => matchNo(n, S.ctx.mission, S.ctx.id);
  if (!DB) { toast("Can’t save here. Check your connection and try again."); return }
  saving = true; const cb = document.querySelector(".confirm"); if (cb) cb.disabled = true;
  try { await Promise.all(nm.map(n => DB.doc("scores/" + mode + "_" + slug(n) + "_" + mn(n) + (mode === "pilot" ? "_a" + att : "")).set({ mode, key: slug(n), team: n, match: mn(n), attempt: att, score, at }))) }
  catch (e) { saving = false; if (cb) cb.disabled = false; toast(e && e.code === "invalid_argument" ? "The judges’ PIN was missing or wrong. Try again." : "Couldn’t save. Check your connection and try again."); return }
  saving = false; resetAll();
  if (mode === "pilot" && att < 3) { S.ctx.att = att + 1; save(); render(); toast(`Attempt ${att}/3 saved: ${score} pts. Now attempt ${att + 1}.`) }
  else { S.ctx = null; save(); render(); route(); toast(`Saved ${score} pts for ${nm.join(" + ")}`) }
}
fixLinks();
(async () => {
  DB = window.ftDB || null;
  if (!DB) { DBS = "none"; renderLB(); renderSched(); return }
  tsync();
  try { DB.collection("judges").onSnapshot(sn => { JD = sn.docs.map(d => ({ id: d.id, ...d.data() })); if (!$("#jd").hidden) paintJd() }, () => { }) } catch (e) { }
  try { DB.doc("live/current").onSnapshot(sn => { LIVE = sn.exists ? sn.data() : null; if (!$("#tv").hidden) paintTv() }, () => { }) } catch (e) { }
  try { DB.collection("schedule").onSnapshot(s => { SCH = s.docs.map(d => ({ id: d.id, ...d.data() })); renderSched(); teamsList(); if (!$("#pick").hidden) renderPick(); if (!$("#aed").hidden) renderAed() }, () => { }) } catch (e) { }
  try { DB.collection("scores").onSnapshot(s => { DBS = "ok"; ALL = s.docs.map(d => ({ ...d.data(), _id: d.id })).filter(r => r && r.mode && r.key); if (!scoresLoaded) { scoresLoaded = true; schScrolled = false } renderLB(); if (!$("#home").hidden) renderSched(); if (!$("#pick").hidden) renderPick(); if (!$("#asc").hidden) renderAsc(); if (!$("#aed").hidden) renderAed(); if (!$("#tv").hidden) paintTv(); teamsList() }, () => { DBS = "none"; renderLB() }) } catch (e) { DBS = "none"; renderLB() }
})();

document.addEventListener("click", e => {
  ac();
  if (armed && !e.target.closest("#reset")) { armed = false; clearTimeout(armT); $("#reset").textContent = "Reset" }
  const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
  const a = b.dataset.a, id = b.dataset.id, t = S.tab, s = S[ t ];
  if (a === "tab") { if (id !== t) { resetAll(); S.tab = id } }
  else if (a === "start") { const m = T[ t ]; if (m.run) { m.left = Math.max(0, Math.ceil((m.end - Date.now()) / 1000)); m.run = false } else { if (m.left === 0) m.left = TABS[ t ][ 1 ]; m.end = Date.now() + m.left * 1000; m.run = true; m.warned = m.left <= (WARN[ t ] || 0) } pushTimer() }
  else if (a === "snd") { S.mute = !S.mute; if (!S.mute) sound("warn") }
  else if (a === "fs") { openFs() }
  else if (a === "fsx") { closeFs() }
  else if (a === "lb") { go("lb") }
  else if (a === "calc") { go("calc") }
  else if (a === "home") { go("home") }
  else if (a === "pcancel") { clearPrev(); return }
  else if (a === "gen") { doGen(); return }
  else if (a === "pimp") { doImport(); return }
  else if (a === "lbtab") { lbTab = id; renderLB(); return }
  else if (a === "asctab") { ascTab = id; renderAsc(); return }
  else if (a === "clrall") { openClear(); return }
  else if (a === "cacancel") { $("#ca").hidden = true; return }
  else if (a === "cago") { clearAll(); return }
  else if (a === "sc") { openSm({ id: b.dataset.id, team: b.dataset.team, m: +b.dataset.m, att: +b.dataset.att, score: b.dataset.score }); return }
  else if (a === "smadd") { openSm({}); return }
  else if (a === "smcancel") { closeSm(); return }
  else if (a === "smsave") { saveSm(); return }
  else if (a === "smdel") { delSm(b); return }
  else if (a === "ed") { openEm(id); return }
  else if (a === "edadd") { openEm(""); return }
  else if (a === "emcancel") { closeEm(); return }
  else if (a === "emsave") { saveEm(); return }
  else if (a === "emdel") { delEm(b); return }
  else if (a === "tvfs") { if (document.fullscreenElement) { document.exitFullscreen() } else { try { const q = document.documentElement.requestFullscreen(); tvFull = true; if (q && q.catch) q.catch(() => { tvFull = false }) } catch (e) { } } return }
  else if (a === "jdcancel") { $("#jd").hidden = true; return }
  else if (a === "jdsave") { $("#jd").hidden = true; submitScore(); return }
  else if (a === "gateok") { submitGate(); return }
  else if (a === "gatecancel") { closeGate(false); return }
  else if (a === "slot") { pickSlot(id); return }
  else if (a === "prac") { resetAll(); S.ctx = { practice: true }; save(); render(); route(); return }
  else if (a === "pick") {
    const dirty = sum(calc().map(x => x[ 1 ])) > 0 || T[ t ].run || T[ t ].left < TABS[ t ][ 1 ];
    if (dirty && !cArm) { cArm = true; b.textContent = "Discard?"; clearTimeout(cT); cT = setTimeout(() => { cArm = false; b.textContent = "Change" }, 3500); return }
    cArm = false; clearTimeout(cT); resetAll(); S.ctx = null; save(); route(); return
  }
  else if (a === "confirm") { if (PRAC()) { resetAll(); S.ctx = null; save(); route(); toast("Practice finished") } else requestSubmit(); return }
  else if (a === "reset") {
    if (!armed) { armed = true; b.textContent = "Tap to confirm"; armT = setTimeout(() => { armed = false; b.textContent = "Reset" }, 4000); return }
    armed = false; clearTimeout(armT); b.textContent = "Reset"; S[ t ] = fresh(t); Object.assign(T[ t ], { left: TABS[ t ][ 1 ], run: false, warned: false }); pushTimer()
  }
  else if (a === "inc") { if (room(t, id)) { s[ id ]++; chg = id } }
  else if (a === "dec") { if (s[ id ] > 0) { s[ id ]--; chg = id } }
  else if (a === "tog") { s[ id ] = s[ id ] ? 0 : 1 }
  else if (a === "land") { s.land = id }
  else if (a === "step") {
    const k = +id, i = +b.dataset.i, c = s[ "s" + k ];
    if (i === c) { if (c + 1 === PH[ k ][ 1 ].length) { s[ "p" + k ]++; s[ "s" + k ] = 0; chg = "p" + k } else s[ "s" + k ] = c + 1 }
    else if (i < c) { s[ "s" + k ] = i }
    else { b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge"); return }
  }
  save(); render()
});
render(); route();
$("#gatein").addEventListener("keydown", e => { if (e.key === "Enter") submitGate() });
// Admin pages stay hidden until the admin password is accepted
if (PAGE === "adm" || PAGE === "asc" || PAGE === "aed") needPin("admin").then(ok => { if (ok) { ADMIN_OK = true; route() } else go("home") });
// A judge who was inside a match when the password changed has to pick the match again
if (PAGE === "calc" && known() && window.ftDB) window.ftDB.verify("judge").then(st => { if (st === "bad") { S.ctx = null; save(); render(); route(); toast("The password changed. Pick your match again.") } });
// The Admin link is shown only on phones that already have the admin password
{ const a = document.querySelector('.nav a[data-go="adm"]'); if (a && !localStorage.getItem("ftpin_admin")) a.style.display = "none" }

/* ---- admin: clear ALL scores ---- */
function openClear() {
  if (!ALL.length) { toast("There are no scores to clear."); return }
  $("#caw").textContent = `This deletes all ${ALL.length} scores in every category (Piloting, Autonomous and Teamwork) for everyone. It cannot be undone.`;
  $("#cain").value = ""; $("#caerr").textContent = ""; $("#cago").disabled = true; $("#ca").hidden = false;
  setTimeout(() => $("#cain").focus(), 60);
}
async function clearAll() {
  if ($("#cain").value.trim().toUpperCase() !== "DELETE") return;
  if (!DB) { $("#caerr").textContent = "Can’t reach the server."; return }
  const ids = ALL.map(r => r._id).filter(Boolean);
  $("#cago").disabled = true; $("#caerr").textContent = "Deleting…";
  let failed = 0;
  for (let i = 0; i < ids.length; i += 8) {   // a few at a time keeps a sleepy server happy
    const res = await Promise.allSettled(ids.slice(i, i + 8).map(id => DB.doc("scores/" + id).delete()));
    failed += res.filter(x => x.status === "rejected").length;
  }
  if (failed) { $("#caerr").textContent = failed + " of " + ids.length + " could not be deleted. Check the admin password and try again."; $("#cago").disabled = false; return }
  $("#ca").hidden = true; toast("All scores deleted");
}
$("#cain").addEventListener("input", () => { $("#cago").disabled = $("#cain").value.trim().toUpperCase() !== "DELETE" });
