// Frage-Chat (Luis 22.10.2026): runder Knopf mit Fragezeichen auf der Startseite und Link „Frage stellen“ im Spielwissen
// öffnen das Fenster #askdialog (Öffnen, Schließen, Escape, Barriere und Fokus über site.js, data-opens). Fragen gehen an die
// Edge Function site-ask, dieselbe KI und Wissensdatenbank wie der Frage-Bot im Discord. Der Verlauf liegt nur im Speicher
// dieser Seite (kein localStorage, nichts auf dem Server), mit jeder Frage gehen die letzten 10 Paare mit, damit Nachfragen
// verstanden werden. Texte und Adresse aus dem JSON-Block #askcfg (kein Inline-Skript unter der CSP). Antworten nur als
// Text (textContent), nie als HTML.
(function () {
  'use strict';
  var cfgEl = document.getElementById('askcfg'), dialog = document.getElementById('askdialog');
  if (!cfgEl || !dialog) return;
  var cfg = JSON.parse(cfgEl.textContent), text = cfg.text;
  var form = document.getElementById('askform'), input = document.getElementById('askinput');
  var log = document.getElementById('asklog'), send = form.querySelector('button[type="submit"]');
  var history = [], busy = false;

  // Ohne JavaScript bleiben Knopf und Link verborgen, das Fenster braucht das Skript
  document.querySelectorAll('[data-ask-show]').forEach(function (el) { el.hidden = false; });
  document.querySelectorAll('[data-opens="askdialog"]').forEach(function (b) {
    // site.js öffnet das Fenster und setzt den Fokus auf das X, danach hierher ins Eingabefeld
    b.addEventListener('click', function () { setTimeout(function () { input.focus(); }, 0); });
  });

  function bubble(kind, who, body) {
    var p = document.createElement('p');
    p.className = 'askmsg ' + kind;
    var label = document.createElement('span');
    label.className = 'sr';
    label.textContent = who + ': ';
    p.appendChild(label);
    p.appendChild(document.createTextNode(body));
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
    return p;
  }

  function errorText(code) {
    if (code === 'daily') return text.daily;
    if (code === 'month') return text.month;
    return text.error;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.replace(/\s+/g, ' ').trim();
    if (!q || busy) return;
    busy = true;
    send.disabled = true;
    input.value = '';
    bubble('me', text.you, q);
    var wait = bubble('bot wait', text.bot, text.thinking);
    log.setAttribute('aria-busy', 'true');
    fetch(cfg.url + '/functions/v1/site-ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, history: history.slice(-10), lang: cfg.lang, website: form.website.value }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return {}; })
      .then(function (res) {
        wait.remove();
        log.removeAttribute('aria-busy');
        if (res && typeof res.answer === 'string' && res.answer) {
          var a = bubble('bot', text.bot, res.answer);
          if (res.lang) a.lang = res.lang;
          history.push({ q: q, a: res.answer });
          if (history.length > 10) history.shift();
        } else {
          bubble('bot fail', text.bot, errorText(res && res.error));
          // Frage zurück ins Feld, damit sie nicht neu getippt werden muss
          if (!input.value) input.value = q;
        }
        busy = false;
        send.disabled = false;
        if (!dialog.hidden) input.focus();
      });
  });
})();
