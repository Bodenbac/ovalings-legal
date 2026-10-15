// Kontaktformular (E57): schickt an die Edge Function contact. Werte aus dem JSON-Block #cfg (Adresse, öffentlicher
// Schlüssel, Texte), kein Inline-Skript (CSP der Website). Quelle der Texte: tool/build_legal.py.
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var f = document.getElementById('f'), status = document.getElementById('status');
  var topic = new URLSearchParams(location.search).get('topic');
  if (topic) f.topic.value = topic;
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var button = f.querySelector('button');
    button.disabled = true;
    try {
      var body = Object.fromEntries(new FormData(f));
      body.source = 'web';
      var r = await fetch(cfg.url + '/functions/v1/contact', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', apikey: cfg.key},
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(String(r.status));
      f.reset();
      status.textContent = cfg.sent;
    } catch (_) {
      status.textContent = cfg.failed;
    }
    button.disabled = false;
  });
})();
