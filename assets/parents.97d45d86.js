// Freigabe für Käufe durch Eltern (Luis 10.10.2026, A): ?t= aus der E-Mail zum Freigeben, ?r= zum Zurückziehen. Werte aus
// dem JSON-Block #cfg (Adresse, öffentlicher Schlüssel, Sprache, Texte), kein Inline-Skript (CSP der Website).
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var T = cfg.text, LANG = cfg.lang, q = new URLSearchParams(location.search), t = q.get('t'), r = q.get('r');
  var $ = function (id) { return document.getElementById(id); }, status = $('status');
  // Sprachwechsel behält den Link aus der E-Mail: Link zur anderen Sprache und alle Sprachlinks in Kopf, Fenster und Fuß
  document.querySelectorAll('a[data-keep-query], a[data-lang]').forEach(function (a) { a.href = a.href.split('?')[0] + location.search; });
  var euro = function (c) {
    return c === 0 ? T.zero : (c / 100).toLocaleString(LANG, {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});
  };
  async function call(body) {
    var res = await fetch(cfg.url + '/functions/v1/parental-consent', {
      method: 'POST', headers: {'Content-Type': 'application/json', apikey: cfg.key}, body: JSON.stringify(body)});
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || String(res.status));
    return data;
  }
  var failed = function (e) { status.textContent = e.message === 'invalid_token' ? T.invalid : T.failed; };
  var done = function (text) { $('ask').hidden = true; $('withdraw').hidden = true; status.textContent = text; };
  async function busy(f) {
    document.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    try { await f(); } catch (e) { failed(e); }
    document.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
  }
  if (t) {
    status.textContent = T.loading;
    call({action: 'lookup', token: t}).then(function (d) {
      $('name').textContent = d.display_name || '';
      [0, 500, 1000, 2000, 3000, 5000].filter(function (c) { return c <= d.max_limit_cents; }).forEach(function (c) {
        $('limit').add(new Option(euro(c), c, false, c === d.default_limit_cents));
      });
      $('ask').hidden = false;
      status.textContent = '';
    }, failed);
    $('approve').onclick = function () { busy(async function () { await call({action: 'confirm', token: t, limit_cents: Number($('limit').value)}); done(T.approved); }); };
    $('decline').onclick = function () { busy(async function () { await call({action: 'revoke', token: t}); done(T.declined); }); };
  } else if (r) {
    $('withdraw').hidden = false;
    $('revoke').onclick = function () { busy(async function () { await call({action: 'revoke', token: r}); done(T.revoked); }); };
  } else {
    status.textContent = T.missing;
  }
})();
