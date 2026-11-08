/* Page loader.
   1. loads the language (i18n.js + assets/lang/xx.js) when the page is translated,
   2. loads the shared layout from assets/shell.html into <body> and starts the translation,
   3. then starts the password wall (gate.js) and the app (app.js), which shows the screen for this page (data-page in <body>).
   The layout itself is plain HTML in shell.html: edit it there. Admin pages are never translated. */
(function() {
  "use strict";
  var base = document.currentScript.src.replace(/[^\/]*$/, "");   // address of the assets folder
  var page = document.body.dataset.page || "home";
  var admin = page === "adm" || page === "asc" || page === "aed";

  document.head.insertAdjacentHTML("beforeend",
    '<link rel="icon" type="image/png" href="' + base + 'logoNK.png">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="' + base + 'lock.css">');

  function script(src) {                                          // never blocks the page: a missing file just means English
    return new Promise(function(done) {
      var s = document.createElement("script");
      s.src = src; s.onload = done; s.onerror = done;
      document.head.appendChild(s);
    });
  }
  var layout = fetch(base + "shell.html").then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
  var language = admin ? Promise.resolve() : script(base + "i18n.js").then(function() {
    var c = window.i18nLang;
    return c && c !== "en" ? script(base + "lang/" + c + ".js") : null;
  });

  Promise.all([ layout, language ])
    .then(function(r) {
      if (!window.t) window.t = function(k, v) { return v ? k.replace(/\{(\w+)\}/g, function(m, n) { return n in v ? v[ n ] : m; }) : k; };
      document.body.insertAdjacentHTML("afterbegin", r[ 0 ]);
      if (window.i18n) window.i18n.start(document.body);
      [ "gate.js", "app.js" ].forEach(function(name) {            // gate.js first: it locks the page that needs a password
        var s = document.createElement("script");
        s.src = base + name;
        s.async = false;                                         // run in this order
        document.body.appendChild(s);
      });
    })
    .catch(function() {
      document.body.textContent = "Could not load the page. Check your connection and reload.";
    });
})();
