// Profilseite (Luis 18.10.2026), Vorlage profile.html.j2, Anmeldung über auth.js (OvalAuth). Lädt Spieler und Ovalings des
// eigenen Kontos über RLS, zeigt die Ovalings mit Porträt (unsichtbarer Rahmen der 3D-Seite, Befehl portrait, der Reihe nach
// und nur, was sichtbar wird) und führt die Einstellungen des Kontos. Ändern geht nur über Supabase-Auth und die Functions der
// App (display-name, delete-account), die Website schreibt keine Tabellen selbst.
(function () {
  'use strict';
  var A = window.OvalAuth, C = A.cfg, T = C.text;
  if (!A.signedIn()) { location.replace(C.account); return; }
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var loading = $('[data-loading]'), msg = $('[data-msg]'), main = $('[data-main]'), account = $('[data-account]');
  var fill = function (s, v) { return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? String(v[k]) : m; }); };
  var num = function (n) { try { return n.toLocaleString(C.htmlLang); } catch (e) { return String(n); } };

  function fail(x) {
    loading.hidden = true;
    if (x && x.code === 'not_signed_in') { A.signOutLocal(); location.replace(C.account); return; }
    $('[data-msg-text]').textContent = T.errors[x && x.code] || T.errors.unknown;
    $('[data-retry]').hidden = false; msg.hidden = false;
  }
  $('[data-retry]').addEventListener('click', function () { msg.hidden = true; loading.hidden = false; start(); });

  function status(form, text, error) {
    var e = $('[data-error]', form);
    e.textContent = text || ''; e.hidden = !text; e.classList.toggle('error', !!error);
  }
  function busy(form, on) { var b = form.querySelectorAll('button'); for (var i = 0; i < b.length; i++) b[i].disabled = on; }

  // ---------- Daten ----------
  var player = null;
  function start() {
    var uid = A.user().id;
    Promise.all([
      A.rest('players?select=display_name,friend_code,deletion_requested_at&id=eq.' + encodeURIComponent(uid)),
      A.rest('monsters?select=id,name,rarity_id,family_id,egg_code,gene_overrides,rules_version,hatched_at&order=hatched_at.desc&limit=1000')
    ]).then(function (r) {
      player = r[0][0] || {};
      loading.hidden = true;
      showPlayer();
      showOvalings(r[1] || []);
      main.hidden = false; account.hidden = false;
    }, fail);
  }

  function showPlayer() {
    var name = player.display_name;
    $('[data-hello]').textContent = name || T.profile;
    $('[name="name"]').value = name || '';
    if (player.friend_code) { $('[data-code]').textContent = player.friend_code; $('[data-code-row]').hidden = false; }
    var u = A.user();
    $('[data-email]').textContent = u.email || '';
    var pend = $('[data-email-pending]');
    pend.hidden = !u.new_email;
    if (u.new_email) pend.textContent = fill(T.emailPending, { email: u.new_email });
    var del = $('[data-deletion]');
    if (player.deletion_requested_at) {
      var at = new Date(new Date(player.deletion_requested_at).getTime() + 30 * 864e5);
      $('[data-deletion-text]').textContent = fill(T.deletionText, { date: at.toLocaleDateString(C.htmlLang, { day: 'numeric', month: 'long', year: 'numeric' }) });
      del.hidden = false;
    } else del.hidden = true;
  }

  // ---------- Ovalings mit Porträt ----------
  var queue = [], frame = null, ready = false, waiting = {}, seq = 0;
  function showOvalings(list) {
    var ul = $('[data-list]'), count = $('[data-count]');
    ul.textContent = '';
    $('[data-empty]').hidden = list.length > 0;
    $('[data-hint]').hidden = !list.length;
    count.hidden = !list.length;
    count.textContent = fill(T.count, { count: num(list.length) });
    var seen = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { seen.unobserve(e.target); want(e.target); } });
    }, { rootMargin: '200px' }) : null;
    list.forEach(function (m) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'prtile r-' + (m.rarity_id || 'normal');
      a.href = C.viewer + '#' + m.id;
      var label = m.name || (T.rarities[m.rarity_id] || '') + ' · ' + (T.families[m.family_id] || '');
      a.setAttribute('aria-label', fill(T.open, { ovaling: label }));
      var pic = document.createElement('span'); pic.className = 'prpic';
      var img = document.createElement('img');
      img.alt = ''; img.setAttribute('aria-hidden', 'true'); img.width = 160; img.height = 160; img.decoding = 'async';
      var egg = (C.eggs[m.egg_code] || C.eggs[1]);
      img.src = egg; img.className = 'egg';
      pic.appendChild(img);
      var cap = document.createElement('span'); cap.className = 'prname'; cap.textContent = label;
      a.appendChild(pic); a.appendChild(cap); li.appendChild(a); ul.appendChild(li);
      a._m = m; a._img = img;
      var key = cacheKey(m), have = A.portraits.get(key);
      if (have) setPic(img, have);
      else if (seen) seen.observe(a);
      else want(a);
    });
  }
  function cacheKey(m) { return C.portraitVersion + ':' + m.id + ':' + JSON.stringify(m.gene_overrides || {}); }
  function setPic(img, data) { img.src = data; img.className = ''; }

  // Der Rahmen der 3D-Seite entsteht erst, wenn ein Porträt fehlt. Er zeichnet eins nach dem anderen
  function want(tile) {
    queue.push(tile);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.src = C.frame; frame.title = T.frameTitle; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true');
      $('[data-stage]').appendChild(frame);
    } else if (ready) next();
  }
  var running = false;
  function next() {
    if (running || !queue.length) return;
    running = true;
    var tile = queue.shift(), ref = 'p' + (++seq);
    waiting[ref] = tile;
    frame.contentWindow.postMessage(JSON.stringify({ kind: 'portrait', ref: ref, id: tile._m.id, genes: tile._m.gene_overrides || {}, size: 320 }), location.origin);
  }
  window.addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow || typeof e.data !== 'string') return;
    var m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.type === 'ready') { ready = true; next(); return; }
    if (m.type === 'error' && m.code === 'webgl') { queue = []; return; }
    if (m.type !== 'portrait') return;
    var tile = waiting[m.ref]; delete waiting[m.ref];
    running = false;
    if (tile && m.data) { setPic(tile._img, m.data); A.portraits.put(cacheKey(tile._m), m.data); }
    next();
  });

  // ---------- Anzeigename ----------
  var nameForm = $('[data-form="name"]');
  nameForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = nameForm.name.value.trim(), n = Array.from(v).length;
    if (n < C.nameMin || n > C.nameMax) return status(nameForm, T.errors.name_length, true);
    if (v === (player.display_name || '')) return status(nameForm, T.saved);
    busy(nameForm, true);
    A.fn('display-name', { name: v }).then(function (r) {
      busy(nameForm, false); player.display_name = (r && r.display_name) || v; showPlayer(); status(nameForm, T.saved);
    }, function (x) { busy(nameForm, false); status(nameForm, T.errors[x.code] || T.errors.unknown, true); });
  });

  // ---------- E-Mail ----------
  var mailForm = $('[data-form="email"]');
  mailForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = mailForm.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return status(mailForm, T.errors.bad_email, true);
    busy(mailForm, true);
    A.setEmail(v).then(function () {
      busy(mailForm, false); mailForm.email.value = ''; status(mailForm, ''); showPlayer();
      var pend = $('[data-email-pending]'); pend.hidden = false; pend.textContent = fill(T.emailPending, { email: v });
    }, function (x) { busy(mailForm, false); status(mailForm, T.errors[x.code] || T.errors.unknown, true); });
  });

  // ---------- Passwort ----------
  var pwForm = $('[data-form="password"]');
  pwForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var a = pwForm.password.value, b = pwForm.password2.value;
    if (a.length < 8) return status(pwForm, T.errors.password_min, true);
    if (a !== b) return status(pwForm, T.errors.passwords_differ, true);
    busy(pwForm, true);
    A.setPassword(a).then(function () { busy(pwForm, false); pwForm.reset(); status(pwForm, T.passwordDone); },
      function (x) { busy(pwForm, false); status(pwForm, T.errors[x.code] || T.errors.unknown, true); });
  });

  // ---------- Abmelden ----------
  $('[data-signout]').addEventListener('click', function () { A.signOut().then(function () { location.href = C.home; }); });

  // ---------- Löschung abbrechen ----------
  $('[data-deletion-cancel]').addEventListener('click', function (e) {
    var b = e.currentTarget; b.disabled = true;
    A.rpc('account_delete_cancel').then(function () {
      b.disabled = false; player.deletion_requested_at = null; showPlayer();
      $('[data-msg-text]').textContent = T.deletionCancelled; $('[data-retry]').hidden = true; msg.hidden = false;
    }, function (x) { b.disabled = false; fail(x); });
  });

  // ---------- Konto löschen (zwei Schritte, Glasfenster) ----------
  var dialog = $('#prdialog'), barrier = $('#prbarrier'), lastFocus = null;
  function step(n) { dialog.querySelectorAll('[data-step]').forEach(function (s) { s.hidden = s.getAttribute('data-step') !== String(n); }); }
  function open() { lastFocus = document.activeElement; step(1); status(dialog, ''); dialog.hidden = false; barrier.hidden = false; $('[data-step-next]').focus(); document.addEventListener('keydown', onKey); }
  function close() { dialog.hidden = true; barrier.hidden = true; document.removeEventListener('keydown', onKey); if (lastFocus) lastFocus.focus(); }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var list = Array.prototype.filter.call(dialog.querySelectorAll('button'), function (b) { return b.offsetParent !== null; });
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  $('[data-delete]').addEventListener('click', open);
  $('#prdialogclose').addEventListener('click', close);
  barrier.addEventListener('click', close);
  $('[data-step-next]').addEventListener('click', function () { step(2); $('[data-delete-final]').focus(); });
  $('[data-delete-final]').addEventListener('click', function (e) {
    var b = e.currentTarget; b.disabled = true;
    A.fn('delete-account', { confirm: 'delete' }).then(function () {
      // Wie die App: danach nur hier abmelden, die Sitzung gibt es auf dem Server bei Gästen nicht mehr
      A.signOutLocal(); close();
      main.hidden = true; account.hidden = true; $('[data-deletion]').hidden = true;
      $('[data-msg-text]').textContent = T.deleteDone; $('[data-retry]').hidden = true; msg.hidden = false;
    }, function (x) { b.disabled = false; status(dialog, T.errors[x.code] || T.errors.unknown, true); });
  });

  start();
})();
