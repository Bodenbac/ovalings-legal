// Wurzel der Website (Plan docs/site/PLAN.md 1.3): leitet in die gespeicherte oder die Sprache des Browsers weiter.
// 1. gespeicherte Wahl (localStorage ovalings.lang, nur einer der neun Codes), 2. navigator.languages der Reihe nach
// (erster Teil vor „-“, pt → pt, in und id → id), sonst Englisch. Ohne JavaScript bleibt die Seite eine Liste der Sprachen.
(function () {
  'use strict';
  var LANGS = ['en', 'de', 'es', 'pt', 'fr', 'tr', 'ja', 'ko', 'id'];
  var pick = null;
  try {
    var saved = localStorage.getItem('ovalings.lang');
    if (LANGS.indexOf(saved) >= 0) pick = saved;
  } catch (e) { /* kein Speicher: weiter mit der Sprache des Browsers */ }
  if (!pick) {
    var prefs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < prefs.length && !pick; i++) {
      var p = String(prefs[i]).toLowerCase().split('-')[0];
      if (p === 'in') p = 'id';
      if (LANGS.indexOf(p) >= 0) pick = p;
    }
  }
  location.replace((pick || 'en') + '/');
})();
