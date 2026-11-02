// Seite nach dem Link aus einer Mail von Supabase Auth (Luis 15.10.2026, 3g, seit 02.11.2026 mit token_hash).
//
// Neue Links (Vorlagen aus tool/auth_mails): https://ovalings.app/confirmed?token_hash=…&type=signup|email_change|magiclink|
// recovery&from=…, Absender und Link passen so zusammen (Spam bei web.de). from sagt, wo der Link angefordert wurde:
//   app2  App ab der Fassung mit token_hash: am Handy sofort in die App (app.ovalings://login-callback?token_hash=…&type=…),
//         die App ruft selbst verifyOTP. Am Computer wie app.
//   app   alte App, Web-Fassung oder unbekannt: Knopf „Bestätigen“, erst der Klick bestätigt hier (POST /auth/v1/verify).
//   play  Web-Fassung unter /play/: Knopf „Weiter“ dorthin, die Web-Fassung bestätigt selbst.
//   en, de, …  Anmeldeseite der Website (/<sprache>/account/): Knopf „Bestätigen“, dann mit der Sitzung als Anker dorthin wie
//         früher bei Supabase (#access_token=…&type=…), auth.js übernimmt sie.
// recovery bestätigt nie hier, außer für die Website: am Computer und für die alte App geht es mit Knopf zur Web-Fassung.
// Prüfscanner der Postfächer öffnen Links vorab, deshalb bestätigt nichts beim bloßen Laden. Nur die Weiterleitung in die App
// passiert beim Laden, dort bestätigt erst die App.
//
// Alte Links (vor dem 02.11.2026 verschickt) kommen über Supabase mit ?code=… oder #error_code=… und laufen wie bisher: am
// Handy mit Code zurück in die App, am Computer der Hinweis, in der App weiterzumachen.
// Texte und Supabase aus dem JSON-Block #cfg (tool/build_legal.py), kein Inline-Skript (CSP der Website).
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var T = cfg.text;
  var langs = (navigator.languages || [navigator.language || 'en']).map(function (l) { return l.slice(0, 2).toLowerCase(); });
  var lang = langs.find(function (l) { return T[l]; }) || 'en', t = T[lang];
  var hash = new URLSearchParams(location.hash.slice(1)), query = new URLSearchParams(location.search);
  var phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var APP = 'app.ovalings://login-callback';
  var $ = function (id) { return document.getElementById(id); };
  var title = $('title'), text = $('text'), open = $('open'), hint = $('hint'), alt = $('alt');
  document.documentElement.lang = lang;

  function show(head, body) {
    title.textContent = head;
    text.textContent = body || '';
    document.title = 'Ovalings · ' + head;
  }
  function button(label, action) {
    open.textContent = label;
    open.hidden = false;
    if (typeof action === 'string') { open.href = action; open.onclick = null; } else {
      open.removeAttribute('href');
      open.setAttribute('role', 'button');
      open.tabIndex = 0;
      open.onclick = function (e) { e.preventDefault(); action(); };
      open.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); } };
    }
  }
  function busy(on) { open.setAttribute('aria-disabled', on ? 'true' : 'false'); open.classList.toggle('busy', on); }

  var tokenHash = query.get('token_hash');
  if (!tokenHash) { legacy(); return; }

  var TYPES = ['signup', 'email_change', 'magiclink', 'recovery', 'email', 'invite'];
  var type = TYPES.indexOf(query.get('type')) >= 0 ? query.get('type') : 'signup';
  var from = query.get('from') || 'app';
  var linkQuery = 'token_hash=' + encodeURIComponent(tokenHash) + '&type=' + encodeURIComponent(type);
  var siteLang = (cfg.langs || []).indexOf(from) >= 0 ? from : null;

  // Web-Fassung mit token_hash in der Adresse, sie bestätigt beim Laden selbst
  var play = (cfg.play || '/play/') + '?' + linkQuery;

  if (siteLang) {
    if (type === 'recovery') show(t.reset_title, t.reset_text); else show(t.confirm_title, t.confirm_text);
    button(t.confirm, function () { verify(toSite); });
  } else if (from === 'app2' && phone) {
    toApp();
  } else if (from === 'play' || type === 'recovery') {
    if (type === 'recovery') show(t.reset_title, t.reset_text); else show(t.confirm_title, t.confirm_text);
    button(t.next, play);
  } else {
    show(t.confirm_title, t.confirm_text);
    button(t.confirm, function () { verify(done); });
  }

  // Am Handy mit der neuen App: sofort hinein, der Knopf für den Fall, dass der Browser das Öffnen erst erlauben will.
  // Darunter ohne App weiter (App nicht installiert): recovery zur Web-Fassung, sonst hier bestätigen.
  function toApp() {
    var link = APP + '?' + linkQuery;
    show(t.app_title, t.app_text);
    button(t.open, link);
    alt.textContent = t.no_app;
    alt.hidden = false;
    if (type === 'recovery') alt.href = play; else alt.onclick = function (e) {
      e.preventDefault();
      alt.hidden = true;
      show(t.confirm_title, t.confirm_text);
      button(t.confirm, function () { verify(done); });
    };
    setTimeout(function () { location.href = link; }, 400);
  }

  var running = false;
  function verify(next) {
    if (running) return;
    running = true;
    busy(true);
    fetch(cfg.url + '/auth/v1/verify', {
      method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, token_hash: tokenHash })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) { return { status: r.status, body: body }; });
    }).then(function (res) {
      running = false;
      busy(false);
      if (res.status >= 200 && res.status < 300) { tidy(); next(res.body || {}); return; }
      // 429 und Fehler des Servers: der Link gilt noch, noch einmal versuchen
      if (res.status === 429 || res.status >= 500) { hint.textContent = t.offline; return; }
      tidy();
      failed();
    }, function () {
      running = false;
      busy(false);
      hint.textContent = t.offline;
    });
  }

  // Den Link aus der Adresse nehmen, damit Neuladen nicht einen verbrauchten Link noch einmal schickt
  function tidy() { try { history.replaceState(null, '', location.pathname); } catch (e) { /* alte Browser */ } }

  function failed() {
    show(t.bad_title, t.bad_text);
    open.hidden = true;
    alt.hidden = true;
    hint.textContent = '';
  }

  // Bestätigt für App oder Web-Fassung: die Sitzung aus der Antwort braucht dieser Browser nicht, sie wird gleich wieder
  // abgemeldet (nur diese Sitzung, scope=local). Beim sicheren E-Mail-Wechsel kommt erst mit dem zweiten Link eine Sitzung.
  function done(body) {
    open.hidden = true;
    alt.hidden = true;
    hint.textContent = '';
    if (!body.access_token) { show(t.half_title, t.half_text); return; }
    show(t.done_title, t.done_text);
    fetch(cfg.url + '/auth/v1/logout?scope=local', {
      method: 'POST', headers: { apikey: cfg.key, Authorization: 'Bearer ' + body.access_token }
    }).catch(function () { /* ohne Netz verfällt die Sitzung von selbst */ });
  }

  // Für die Website: wie früher der Rücksprung von Supabase mit der Sitzung als Anker (auth.js, takeLink)
  function toSite(body) {
    var target = '/' + siteLang + '/account/';
    if (!body.access_token) { location.href = target + '#message=' + encodeURIComponent(body.msg || 'confirm_other'); return; }
    var a = new URLSearchParams();
    a.set('access_token', body.access_token);
    a.set('refresh_token', body.refresh_token || '');
    a.set('expires_in', String(body.expires_in || 3600));
    if (body.expires_at) a.set('expires_at', String(body.expires_at));
    a.set('token_type', 'bearer');
    a.set('type', type);
    location.href = target + '#' + a.toString();
  }

  // Links aus Mails vor dem 02.11.2026: Supabase hat schon bestätigt und schickt Code oder Fehler mit
  function legacy() {
    var bad = hash.get('error') || query.get('error');
    show(bad ? t.bad_title : t.done_title, bad ? t.bad_text : t.done_text);
    var link = APP + location.search + location.hash;
    if (phone) {
      button(t.open, link);
      if (!bad) setTimeout(function () { location.href = link; }, 400);
    } else if (!bad) {
      hint.textContent = t.hint;
    }
  }
})();
