/* Password wall.
   The calculator needs the judges' password; the three admin pages need the admin password.
   The page stays hidden until the server (POST /api/auth) accepts a password.
   Every change to scores or the schedule is checked by the server again, so this wall is
   not the only protection: it keeps the screens out of sight. 
(function () {
  "use strict";
  var need = { calc: "judge", adm: "admin", asc: "admin", aed: "admin" }[document.body.dataset.page];
  if (!need) return;

  var body = document.body, wrap = document.querySelector(".wrap");
  var lock = document.getElementById("lock"), form = document.getElementById("lockform");
  var pin = document.getElementById("lockpin"), err = document.getElementById("lockerr");
  var note = document.getElementById("locknote"), btn = document.getElementById("lockbtn");
  var retry = 0;

  document.getElementById("locktitle").textContent = need === "admin" ? "Admin password" : "Judges’ password";
  body.classList.add("locked");
  if (wrap) wrap.style.visibility = "hidden";
  lock.hidden = false;
  note.textContent = "Checking saved password…";

  function open() {
    lock.hidden = true; body.classList.remove("locked"); if (wrap) wrap.style.visibility = "";
  }
  function show(message, info) {
    lock.hidden = false; body.classList.add("locked"); if (wrap) wrap.style.visibility = "hidden";
    err.hidden = !message; err.textContent = message || "";
    note.textContent = info || "Enter the password to continue.";
    pin.value = "";
    setTimeout(function () { pin.focus(); }, 50);
  }
  function check() {                                    // remembered password
    window.ftDB.verify(need, null).then(function (r) {
      if (r.ok) return open();
      if (r.error === "network") {                      // server may be waking up: keep trying
        note.textContent = "Waiting for the server (it may be waking up)…";
        clearTimeout(retry); retry = setTimeout(check, 5000); return;
      }
      show("", "");
    });
  }
  check();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = pin.value.trim();
    if (!v) return;
    btn.disabled = true;
    window.ftDB.verify(need, v).then(function (r) {
      btn.disabled = false;
      if (r.ok) return open();
      show(r.error === "limited" ? "Too many wrong attempts. Wait a few minutes and try again."
         : r.error === "network" ? "Can’t reach the server. It may be waking up, try again in a moment."
         : "Wrong password.");
    });
  });
  window.addEventListener("ft-locked", function () { show("The password was not accepted. Enter it again."); });
})();
