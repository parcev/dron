/* Page loader.
   1. loads the shared layout from assets/shell.html into <body>,
   2. then starts the app (assets/app.js), which shows the screen for this page (data-page in <body>).
   The layout itself is plain HTML in shell.html: edit it there. */
(function () {
  "use strict";
  var base = document.currentScript.src.replace(/[^\/]*$/, "");   // address of the assets folder
  document.head.insertAdjacentHTML("beforeend",
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E🛸%3C/text%3E%3C/svg%3E">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">');
  fetch(base + "shell.html")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(function (html) {
      document.body.insertAdjacentHTML("afterbegin", html);
      var s = document.createElement("script");
      s.src = base + "app.js";
      document.body.appendChild(s);
    })
    .catch(function () {
      document.body.textContent = "Could not load the page. Check your connection and reload.";
    });
})();
