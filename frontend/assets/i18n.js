/* Translation engine (stage 1).
   - Language: the choice saved on this phone, otherwise DEFAULT_LANG from config.js, otherwise "en".
   - English is the source text: the language files (assets/lang/xx.js) map English text to the translation.
     A missing entry simply shows the English text.
   - The page is translated automatically: text already in the page, text app.js writes later
     (MutationObserver) and the attributes placeholder / aria-label / title / alt.
   - Entries can have placeholders:  "{n} pts": "{n} pkt".   Text joined with " · " is translated piece by piece.
   - Anything inside translate="no" (team names, times) is left alone.
   - Admin pages never load this file. */
(function() {
  "use strict";

  var LANGS = [
    { code: "pl", label: "PL", flag: "https://flagcdn.com/pl.svg" },
    { code: "lt", label: "LT", flag: "https://flagcdn.com/lt.svg" },
    { code: "en", label: "EN", flag: "https://flagcdn.com/gb.svg" }
  ];
  var KEY = "ftlang";
  function stored() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function known(c) { return LANGS.some(function(l) { return l.code === c; }); }
  var code = known(stored()) ? stored() : (known(window.DEFAULT_LANG) ? window.DEFAULT_LANG : "en");
  window.i18nLang = code;

  /* ---------- dictionary ---------- */
  var exact = {}, patterns = [], ready = false;
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function compile(dict) {
    exact = {}; patterns = [];
    Object.keys(dict || {}).forEach(function(k) {
      if (!/\{\w+\}/.test(k)) { exact[ k ] = dict[ k ]; return; }
      var names = [];
      var src = escRe(k).replace(/\\\{(\w+)\\\}/g, function(m, n) { names.push(n); return "((?:(?! · ).)+?)"; });   // a placeholder never reaches across " · "
      patterns.push({ re: new RegExp("^" + src + "$"), names: names, out: dict[ k ], len: k.length });
    });
    patterns.sort(function(a, b) { return b.len - a.len; });          // the most specific entry wins
    ready = true;
  }

  function fill(out, names, m) {
    return out.replace(/\{(\w+)\}/g, function(x, n) {
      var i = names.lastIndexOf(n);
      if (i < 0) return x;
      var v = m[ i + 1 ], t = coreTr(v);                                  // a captured piece may be translatable too
      return t === null ? v : t;
    });
  }
  function coreTr(core) {
    if (Object.prototype.hasOwnProperty.call(exact, core)) return exact[ core ];
    if (core.indexOf(" · ") > 0) return null;                          // text with " · " is translated piece by piece
    for (var i = 0; i < patterns.length; i++) {
      var m = patterns[ i ].re.exec(core);
      if (m) return fill(patterns[ i ].out, patterns[ i ].names, m);
    }
    return null;
  }
  function tr(str) {                                                    // keeps leading / trailing spaces
    var lead = /^\s*/.exec(str)[ 0 ], trail = /\s*$/.exec(str)[ 0 ];
    var core = str.slice(lead.length, str.length - trail.length);
    if (!core) return str;
    var out = coreTr(core);
    if (out === null && core.indexOf(" · ") > 0) {
      out = core.split(" · ").map(function(p) { var o = coreTr(p); return o === null ? p : o; }).join(" · ");
    }
    return out === null || out === core ? str : lead + out + trail;
  }

  /* ---------- the page ---------- */
  var ATTRS = [ "placeholder", "aria-label", "title", "alt" ];
  var doneText = typeof WeakMap === "function" ? new WeakMap() : null, doneAttr = doneText && new WeakMap();

  function noTr(el) { return !el || !!(el.closest && el.closest('[translate="no"]')); }
  function noText(el) { return noTr(el) || !!el.closest('script,style,textarea'); }

  function text(n) {
    var v = n.nodeValue;
    if (doneText.get(n) === v) return;                                  // our own change coming back: do nothing
    if (noText(n.parentElement)) return;
    var o = tr(v);
    if (o !== v) n.nodeValue = o;
    doneText.set(n, n.nodeValue);
  }
  function attrs(el) {
    if (noTr(el)) return;
    var rec = doneAttr.get(el);
    if (!rec) { rec = {}; doneAttr.set(el, rec); }
    ATTRS.forEach(function(a) {
      var v = el.getAttribute(a);
      if (v === null || rec[ a ] === v) return;
      var o = tr(v);
      if (o !== v) el.setAttribute(a, o);
      rec[ a ] = el.getAttribute(a);
    });
  }
  function walk(n) {
    if (n.nodeType === 3) return text(n);
    if (n.nodeType !== 1) return;
    attrs(n);
    for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
  }
  function observe(root) {
    new MutationObserver(function(list) {
      list.forEach(function(m) {
        if (m.type === "characterData") text(m.target);
        else if (m.type === "attributes") attrs(m.target);
        else m.addedNodes.forEach(walk);
      });
    }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /* ---------- the language button (flag + code) ---------- */
  function flag(l) { return '<img src="' + l.flag + '" alt="" width="26" height="18">'; }
  function pill(slot) {
    var cur = LANGS.filter(function(l) { return l.code === code; })[ 0 ];
    slot.innerHTML =
      '<div class="langwrap" translate="no">' +
      '<button type="button" class="langbtn" aria-haspopup="true" aria-expanded="false" aria-label="Language">' + flag(cur) +
      '<span>' + cur.label + '</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 3.5h9L6 9.5z" fill="currentColor"/></svg></button>' +
      '<div class="langmenu" hidden>' +
      LANGS.map(function(l) {
        return '<button type="button" data-lang="' + l.code + '"' + (l.code === code ? ' aria-current="true"' : "") + ">" +
          flag(l) + "<span>" + l.label + "</span></button>";
      }).join("") + "</div></div>";
    [].forEach.call(slot.querySelectorAll("img"), function(i) { i.addEventListener("error", function() { i.style.display = "none"; }); });
  }
  function choose(c) {
    if (!known(c) || c === code) return;
    try { localStorage.setItem(KEY, c); } catch (e) { }
    location.reload();
  }
  document.addEventListener("click", function(e) {
    var t = e.target, menus = document.querySelectorAll(".langmenu");
    var btn = t.closest && t.closest(".langbtn");

    if (btn) {
      var m = btn.parentNode.querySelector(".langmenu");
      var open = m.hidden;

      [].forEach.call(menus, function(x) {
        x.hidden = true;
        var b = x.parentNode.querySelector(".langbtn");
        if (b) b.setAttribute("aria-expanded", "false");
      });

      m.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      return;
    }

    var item = t.closest && t.closest(".langmenu button[data-lang]");
    if (item) return choose(item.getAttribute("data-lang"));
    [].forEach.call(menus, function(x) { x.hidden = true; });
  });

  /* ---------- public ---------- */
  function start(root) {
    root = root || document.body;
    document.documentElement.lang = code;
    if (code !== "en" && window.I18N && doneText) {
      compile(window.I18N);
      document.title = tr(document.title);
      walk(root);
      observe(root);
    }
    [].forEach.call(root.querySelectorAll("[data-lang-slot]"), pill);
  }
  // t("Saved {score} pts", { score: 5 })  - for text that is not shown in the page (prompts, page titles)
  window.t = function(key, vars) {
    var o = ready ? coreTr(key) : null, s = o === null ? key : o;
    return vars ? s.replace(/\{(\w+)\}/g, function(m, k) { return k in vars ? vars[ k ] : m; }) : s;
  };
  window.i18n = { start: start, tr: tr, compile: compile, langs: LANGS, lang: code };
})();
