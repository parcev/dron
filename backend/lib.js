"use strict";
const crypto = require("crypto");

const COLS = ["scores", "schedule", "timers", "judges", "live"];
const PERSIST = new Set(["scores", "schedule"]);      // saved in the database; the rest is live data kept in memory
const ID_RE = /^[A-Za-z0-9_.~:@+-]{1,200}$/;

const eq = (a, b) => {
  a = Buffer.from(String(a || "")); b = Buffer.from(String(b || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// 2 = admin, 1 = judge, 0 = nobody
function level(headers, judgePin, adminPin) {
  if (adminPin && eq(headers["x-admin-pin"], adminPin)) return 2;
  if (judgePin && eq(headers["x-judge-pin"], judgePin)) return 1;
  return 0;
}

// schedule changes and deleting scores need the admin PIN; everything else needs a judge PIN
const needLevel = (col, method) => (col === "schedule" || (col === "scores" && method === "DELETE") ? 2 : 1);

function valid(col, d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  if (JSON.stringify(d).length > 4000) return false;
  if (col === "scores")
    return ["team", "auto", "pilot"].includes(d.mode) && typeof d.key === "string" && d.key.length <= 200 &&
      typeof d.team === "string" && d.team.length <= 60 &&
      Number.isInteger(d.match) && d.match >= 1 && d.match <= 8 &&
      Number.isInteger(d.score) && d.score >= 0 && d.score <= 10000 &&
      (d.attempt === undefined || [1, 2, 3].includes(d.attempt));
  if (col === "schedule")
    return ["team", "auto", "pilot"].includes(d.mission) && typeof d.start === "string" &&
      Array.isArray(d.teams) && d.teams.length >= 1 && d.teams.length <= 2 &&
      d.teams.every((t) => typeof t === "string" && t.length > 0 && t.length <= 60);
  return true;
}

module.exports = { COLS, PERSIST, ID_RE, level, needLevel, valid };
