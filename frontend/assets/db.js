/* Realtime data client.
   Gives the app the small interface it uses:
     ftDB.doc("scores/abc").set(data) / .delete() / .onSnapshot(next, err)
     ftDB.collection("scores").onSnapshot(next, err)
   Data arrives live over Server-Sent Events from the backend; writes are plain HTTPS requests.
   Judge/admin PINs are asked once (prompt) and remembered in this browser. */
(function () {
  "use strict";
  var API = (window.API_URL || "").replace(/\/+$/, "");
  var EPHEMERAL = { timers: 1, judges: 1, live: 1 };      // background data: never prompts for a PIN
  var cache = {};                                          // collection -> Map(id -> data)
  var subs = [];                                           // {col, id|null, next, err}
  var ready = false, declined = {};

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k) || "";
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return ""; }
    return "";
  }
  function col(c) { return cache[c] || (cache[c] = new Map()); }
  function docSnap(id, data) {
    return { id: id, exists: data != null, data: function () { return data == null ? undefined : data; } };
  }
  function colSnap(c) {
    var docs = []; col(c).forEach(function (d, id) { docs.push(docSnap(id, d)); });
    return { docs: docs };
  }
  function deliver(s, c) {
    try {
      if (s.id === null) s.next(colSnap(c)); else s.next(docSnap(s.id, col(c).get(s.id)));
    } catch (e) { console.error(e); }
  }
  function fire(c, id) {
    subs.forEach(function (s) {
      if (s.col !== c) return;
      if (s.id === null || id === null || s.id === id) deliver(s, c);
    });
  }

  /* ---------- live connection ---------- */
  var timeout = setTimeout(function () {
    if (!ready) subs.forEach(function (s) { if (s.err) s.err({ code: "unavailable" }); });
  }, 60000);
  var es = new EventSource(API + "/api/stream");
  es.addEventListener("snapshot", function (e) {
    var all = JSON.parse(e.data);
    Object.keys(cache).forEach(function (c) { if (!(c in all)) cache[c] = new Map(); });
    Object.keys(all).forEach(function (c) {
      var m = new Map(); all[c].forEach(function (d) { m.set(d.id, d.data); }); cache[c] = m;
    });
    ready = true; clearTimeout(timeout);
    var seen = {}; subs.forEach(function (s) { if (!seen[s.col]) { seen[s.col] = 1; fire(s.col, null); } });
  });
  es.addEventListener("change", function (e) {
    var m = JSON.parse(e.data);
    if (m.data == null) col(m.col).delete(m.id); else col(m.col).set(m.id, m.data);
    fire(m.col, m.id);
  });

  function subscribe(c, id, next, err) {
    var s = { col: c, id: id, next: next, err: err };
    subs.push(s);
    if (ready) setTimeout(function () { deliver(s, c); }, 0);
    return function () { subs = subs.filter(function (x) { return x !== s; }); };
  }

  /* ---------- writes ---------- */
  function need(c, method) { return c === "schedule" || (c === "scores" && method === "DELETE") ? "admin" : "judge"; }

  async function send(method, c, id, body) {
    var quiet = !!EPHEMERAL[c];
    for (var i = 0; i < 3; i++) {
      var jp = ls("ftpin_judge"), ap = ls("ftpin_admin"), r;
      try {
        r = await fetch(API + "/api/docs/" + c + "/" + encodeURIComponent(id), {
          method: method, keepalive: method === "DELETE",
          headers: { "content-type": "application/json", "x-judge-pin": jp, "x-admin-pin": ap },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
      } catch (e) { throw { code: "unavailable" }; }
      if (r.ok) {                                       // show the change at once, the live feed confirms it
        if (method === "DELETE") col(c).delete(id); else col(c).set(id, body);
        fire(c, id);
        return;
      }
      if (r.status !== 401) throw { code: "error", status: r.status };
      if (quiet) throw { code: "invalid_argument" };
      var kind = need(c, method), now = ls("ftpin_" + kind);
      if (now && now !== (kind === "admin" ? ap : jp)) continue;   // another request already updated the PIN
      if (declined[kind] && Date.now() < declined[kind]) throw { code: "invalid_argument" };
      ls("ftpin_" + kind, null);
      var v = window.prompt(kind === "admin" ? "Enter the admin PIN" : "Enter the judges’ PIN");
      if (!v) { declined[kind] = Date.now() + 5000; throw { code: "invalid_argument" }; }
      ls("ftpin_" + kind, v.trim());
    }
    throw { code: "invalid_argument" };
  }

  function docRef(c, id) {
    return {
      set: function (data) { return send("PUT", c, id, data); },
      delete: function () { return send("DELETE", c, id); },
      onSnapshot: function (next, err) { return subscribe(c, id, next, err); }
    };
  }

  window.ftDB = {
    doc: function (path) { var i = path.indexOf("/"); return docRef(path.slice(0, i), path.slice(i + 1)); },
    collection: function (c) {
      return {
        doc: function (id) { return docRef(c, id); },
        onSnapshot: function (next, err) { return subscribe(c, null, next, err); },
        add: function (data) { return docRef(c, "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).set(data); }
      };
    },
    ensurePin: function (kind) {
      if (ls("ftpin_" + kind) || ls("ftpin_admin")) return;
      var v = window.prompt(kind === "admin" ? "Enter the admin PIN" : "Enter the judges’ PIN");
      if (v) ls("ftpin_" + kind, v.trim());
    }
  };
})();
