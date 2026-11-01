// Builds the seven page files from frontend/_template.html.
// Run after you change the HTML in the template:   node tools/make-pages.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "frontend");
const tpl = fs.readFileSync(path.join(root, "_template.html"), "utf8");
const pages = [
  ["home", "", "Schedule"],
  ["calc", "calculator", "Calculator"],
  ["lb", "leaderboard", "Leaderboard"],
  ["tv", "timer", "Timer"],
  ["adm", "admin", "Admin · import schedule"],
  ["asc", "admin/scores", "Admin · scores"],
  ["aed", "admin/schedule", "Admin · schedule"],
];
for (const [page, dir, title] of pages) {
  const depth = dir ? dir.split("/").length : 0;
  const prefix = depth ? "../".repeat(depth) : "./";
  const html = tpl.split("{{R}}").join(prefix).split("{{PAGE}}").join(page).split("{{TITLE}}").join(title + " · Fast Track");
  const out = path.join(root, dir, "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log("wrote", path.relative(path.join(__dirname, ".."), out));
}
fs.writeFileSync(path.join(root, ".nojekyll"), "");
