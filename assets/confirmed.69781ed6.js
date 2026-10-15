// Seite nach dem Bestätigungslink (Luis 15.10.2026, 3g): zeigt in der Sprache des Browsers „E-Mail bestätigt“, am Handy mit
// Knopf zurück in die App (app.ovalings://login-callback mit Code und Fehler aus der Adresse), am Computer den Hinweis, in der
// App weiterzumachen. Fehler (abgelaufen, schon benutzt) kommen von Supabase, etwa #error_code=otp_expired. Texte aus dem
// JSON-Block #cfg, kein Inline-Skript (CSP der Website).
(function () {
  'use strict';
  var T = JSON.parse(document.getElementById('cfg').textContent).text;
  var langs = (navigator.languages || [navigator.language || 'en']).map(function (l) { return l.slice(0, 2).toLowerCase(); });
  var lang = langs.find(function (l) { return T[l]; }) || 'en', t = T[lang];
  var hash = new URLSearchParams(location.hash.slice(1)), query = new URLSearchParams(location.search);
  var failed = hash.get('error') || query.get('error');
  var phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  document.documentElement.lang = lang;
  document.getElementById('title').textContent = failed ? t[4] : t[0];
  document.getElementById('text').textContent = failed ? t[5] : t[1];
  document.title = 'Ovalings · ' + (failed ? t[4] : t[0]);
  var open = document.getElementById('open'), hint = document.getElementById('hint');
  open.textContent = t[2];
  open.href = 'app.ovalings://login-callback' + location.search + location.hash;
  if (phone) { open.hidden = false; if (!failed) setTimeout(function () { location.href = open.href; }, 400); }
  else if (!failed) { hint.textContent = t[3]; }
  if (failed && phone) open.hidden = false;
})();
