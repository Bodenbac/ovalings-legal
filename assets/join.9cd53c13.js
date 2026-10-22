// Einladungslink (E245): ovalings.app/i/<code> kommt über _redirects als /invite/?code=<code> hier an. Sprache wie lang.js
// (gespeicherte Wahl, dann die Sprachen des Browsers, sonst Englisch). Mit Code: im lokalen Speicher ovalings.invite als
// {code, at} merken (bis zum Registrieren, höchstens 30 Tage, gelesen von referral.js und der Web-Fassung der App) und das
// Registrieren öffnen. Ohne Code: Event-Seite der Sprache.
(function () {
  'use strict';
  var LANGS = ['en', 'de', 'es', 'pt', 'fr', 'tr', 'ja', 'ko', 'id'];
  var pick = null;
  try {
    var saved = localStorage.getItem('ovalings.lang');
    if (LANGS.indexOf(saved) >= 0) pick = saved;
  } catch (e) { /* kein Speicher: Sprache des Browsers */ }
  if (!pick) {
    var prefs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < prefs.length && !pick; i++) {
      var p = String(prefs[i]).toLowerCase().split('-')[0];
      if (p === 'in') p = 'id';
      if (LANGS.indexOf(p) >= 0) pick = p;
    }
  }
  var lang = pick || 'en';
  var code = String(new URLSearchParams(location.search).get('code') || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (code.length >= 4 && code.length <= 16) {
    try { localStorage.setItem('ovalings.invite', JSON.stringify({ code: code, at: new Date().toISOString() })); } catch (e) { /* ohne Speicher kein Vorfüllen */ }
    location.replace('../' + lang + '/account/?invite=1#register');
    return;
  }
  location.replace('../' + lang + '/invite/');
})();
