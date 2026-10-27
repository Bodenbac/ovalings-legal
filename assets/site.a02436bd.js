// Website ovalings.app (Plan docs/site/PLAN.md 1.3, 6.4, 6.7): Kopf als Glas beim Scrollen, Fenster der Sprachauswahl,
// Filter der Attacken, Prüfung der ID, Auftritte beim Scrollen, Sprache der 404-Seite. Ohne JavaScript bleibt alles lesbar
// (Sprachen im Fuß, alle Karten sichtbar). Jeder Zugriff auf localStorage steht in try/catch.
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LANGS = ['en', 'de', 'es', 'pt', 'fr', 'tr', 'ja', 'ko', 'id'];

  function remember(lang) {
    try { localStorage.setItem('ovalings.lang', lang); } catch (e) { /* ohne Speicher geht alles, nur die Wurzel merkt nichts */ }
  }

  // ---------- Kopf: über dem Kopfbild durchsichtig, ab 40 px Glas ----------
  var top = document.getElementById('top');
  if (top && !document.querySelector('.head, .hero')) {
    // Seiten ohne Kopfbild (Rechtsseiten): immer Glas
    top.classList.add('glass');
  } else if (top) {
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.className = 'sentinel';
    document.body.insertBefore(sentinel, document.body.firstChild);
    var glass = function (on) { top.classList.toggle('glass', on); };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { glass(!entries[0].isIntersecting); }).observe(sentinel);
    } else {
      var onScroll = function () { glass(window.scrollY > 40); };
      window.addEventListener('scroll', onScroll, {passive: true});
      onScroll();
    }
  }

  // ---------- Anmelden oder Profil (18.10.2026): nur ein Blick in den Speicher, kein Abruf ----------
  var acct = document.querySelector('[data-acct]');
  if (acct) {
    var signed = false;
    try { signed = !!localStorage.getItem('ovalings.session'); } catch (e) { /* ohne Speicher bleibt Anmelden */ }
    if (signed) {
      acct.setAttribute('data-out-href', acct.getAttribute('href'));
      acct.setAttribute('data-out-label', acct.querySelector('[data-acct-label]').textContent);
      acct.href = acct.getAttribute('data-in-href');
      acct.querySelector('[data-acct-label]').textContent = acct.getAttribute('data-in-label');
    }
  }

  // ---------- Fenster (Sprachauswahl, „Bald im Store“) ----------
  // Ein Fenster zur Zeit, eine Barriere für alle. Öffnen über die Sprachwahl oder ein Element mit data-opens="<id>"
  var pill = document.getElementById('langpill'), barrier = document.getElementById('langbarrier');
  var open = null, lastFocus = null;
  function focusables(d) { return d.querySelectorAll('a[href], button'); }
  function openDialog(d, e) {
    if (e) e.preventDefault();
    if (!d || !barrier) return;
    if (open) closeDialog();
    lastFocus = document.activeElement; open = d;
    d.hidden = false; barrier.hidden = false;
    var current = d.querySelector('a[aria-current]') || d.querySelector('a[href]') || focusables(d)[0];
    if (current) current.focus();
    document.addEventListener('keydown', onKey);
  }
  function closeDialog() {
    if (!open) return;
    open.hidden = true; barrier.hidden = true; open = null;
    document.removeEventListener('keydown', onKey);
    if (lastFocus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (e.key !== 'Tab' || !open) return;
    var list = focusables(open), first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  var langDialog = document.getElementById('langdialog');
  if (pill && langDialog) {
    pill.setAttribute('role', 'button');
    pill.addEventListener('click', function (e) { openDialog(langDialog, e); });
    pill.addEventListener('keydown', function (e) { if (e.key === ' ') openDialog(langDialog, e); });
  }
  document.querySelectorAll('[data-opens]').forEach(function (btn) {
    if (btn.hasAttribute('data-play')) return;
    btn.addEventListener('click', function (e) { openDialog(document.getElementById(btn.getAttribute('data-opens')), e); });
  });

  // ---------- Knopf Web (Luis 22.10.2026, E244): Testkonten spielen unter /play/, alle anderen sehen „Bald verfügbar“ ----------
  // Ohne Sitzung im Speicher sofort das Fenster. Mit Sitzung fragt der Klick den Server (web_play_open), ein abgelaufenes
  // Zugriffs-Token wird vorher wie in auth.js erneuert und gespeichert. Jeder Fehler zeigt das Fenster, nie das Spiel.
  document.querySelectorAll('[data-play]').forEach(function (btn) {
    var url = btn.getAttribute('data-play-url'), key = btn.getAttribute('data-play-key');
    var soon = function () { openDialog(document.getElementById(btn.getAttribute('data-opens'))); };
    function post(path, body, tok) {
      var h = { apikey: key, 'Content-Type': 'application/json' };
      if (tok) h.Authorization = 'Bearer ' + tok;
      return fetch(url + path, { method: 'POST', headers: h, body: JSON.stringify(body) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
    }
    function token(s) {
      if (s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
      return post('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }).then(function (b) {
        s.access_token = b.access_token; s.refresh_token = b.refresh_token;
        s.expires_at = b.expires_at || Math.floor(Date.now() / 1000) + (+b.expires_in || 3600);
        try { localStorage.setItem('ovalings.session', JSON.stringify(s)); } catch (e) { /* nur für diesen Klick */ }
        return s.access_token;
      });
    }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var s = null;
      try { s = JSON.parse(localStorage.getItem('ovalings.session') || 'null'); } catch (x) { s = null; }
      if (!s || !s.access_token || !url || !key) { soon(); return; }
      btn.setAttribute('aria-busy', 'true');
      token(s).then(function (tok) { return post('/rest/v1/rpc/web_play_open', {}, tok); })
        .then(function (ok) { if (ok === true) location.href = btn.getAttribute('data-play'); else soon(); }, soon)
        .then(function () { btn.removeAttribute('aria-busy'); });
    });
  });
  document.querySelectorAll('.dialog .close').forEach(function (b) { b.addEventListener('click', closeDialog); });
  if (barrier) barrier.addEventListener('click', closeDialog);
  document.querySelectorAll('a[data-lang]').forEach(function (a) {
    a.addEventListener('click', function () { remember(a.getAttribute('data-lang')); });
  });

  // ---------- Prüfung der ID (Muster aus OvalingId, Eicodes aus den Daten) ----------
  document.querySelectorAll('form.idform').forEach(function (form) {
    var codes = (form.getAttribute('data-codes') || '').split(',').filter(Boolean).map(Number);
    // Das Feld hat keinen name: ohne JavaScript geht die ID so nie als ?id= an den Server (Plan 0, Datenschutz)
    var input = form.querySelector('[data-id-input], input[name="id"]'), error = form.querySelector('[data-error]');
    if (!input || !error) return;
    var re = /^([0-9a-f])[0-9a-f]{7}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    function valid(v) {
      var m = re.exec(v);
      return !!m && codes.indexOf(parseInt(m[1], 16)) >= 0;
    }
    input.addEventListener('input', function () { input.removeAttribute('aria-invalid'); error.hidden = true; });
    form.addEventListener('submit', function (e) {
      var v = input.value.trim().toLowerCase();
      if (!valid(v)) {
        e.preventDefault();
        input.setAttribute('aria-invalid', 'true');
        error.hidden = false;
        input.focus();
        return;
      }
      // Die ID steht im Fragment, nie in der Adresse (Plan 0): kein Zugriffsprotokoll sieht sie
      e.preventDefault();
      var action = form.getAttribute('action') || './';
      location.href = action + '#' + v;
    });
  });

  // ---------- Datenbank: Suche und Filter in der Seite (Attacken, Passiven, Gegenstände) ----------
  // Leitbild Luis 15.10.2026 (wie HellHades): Pillen je Merkmal (data-filter), Auswahl für Effekte (data-filter-select),
  // Suchfeld über Name, Wirkung und Effekte (data-search). Ohne JavaScript bleibt die Leiste verborgen und alles sichtbar.
  var bar = document.querySelector('[data-db]');
  if (bar) {
    bar.hidden = false;
    var fold = function (s) {
      s = String(s || '').toLowerCase();
      return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
    };
    var cards = Array.prototype.slice.call(document.querySelectorAll('[data-card]'));
    var haystack = cards.map(function (c) { return fold(c.getAttribute('data-search')); });
    var state = {}, query = '';
    var input = bar.querySelector('[data-search-input]'), reset = bar.querySelector('[data-reset]');
    var select = bar.querySelector('[data-filter-select]');
    var apply = function () {
      var words = fold(query).split(/\s+/).filter(Boolean), total = 0;
      cards.forEach(function (card, i) {
        var ok = true;
        Object.keys(state).forEach(function (key) {
          var v = state[key];
          if (!v || !ok) return;
          if (key === 'effects') ok = (' ' + card.getAttribute('data-effects') + ' ').indexOf(' ' + v + ' ') >= 0;
          else ok = card.getAttribute('data-' + key) === v;
        });
        for (var w = 0; ok && w < words.length; w++) ok = haystack[i].indexOf(words[w]) >= 0;
        card.hidden = !ok;
        if (ok) total++;
      });
      document.querySelectorAll('[data-list]').forEach(function (list) {
        var shown = list.querySelectorAll('[data-card]:not([hidden])').length;
        var empty = document.querySelector('[data-empty="' + list.getAttribute('data-list') + '"]');
        if (empty) empty.hidden = shown > 0;
        var group = list.closest('[data-group]');
        if (group) group.hidden = shown === 0;
      });
      var all = document.querySelector('[data-empty="all"]');
      if (all) all.hidden = total > 0;
      var count = bar.querySelector('[data-count="all"]');
      if (count) count.textContent = count.getAttribute('data-template').replace('#', String(total));
      var active = !!query || Object.keys(state).some(function (k) { return state[k]; });
      if (reset) reset.hidden = !active;
    };
    bar.querySelectorAll('[data-filter]').forEach(function (group) {
      var key = group.getAttribute('data-filter');
      group.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          group.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
          state[key] = b.getAttribute('data-value');
          apply();
        });
      });
    });
    if (select) select.addEventListener('change', function () { state[select.getAttribute('data-filter-select')] = select.value; apply(); });
    if (input) input.addEventListener('input', function () { query = input.value; apply(); });
    var clear = function () {
      state = {}; query = '';
      if (input) input.value = '';
      if (select) select.value = '';
      bar.querySelectorAll('[data-filter]').forEach(function (group) {
        group.querySelectorAll('button').forEach(function (o, n) { o.setAttribute('aria-pressed', n === 0 ? 'true' : 'false'); });
      });
      apply();
    };
    if (reset) reset.addEventListener('click', function () { clear(); if (input) input.focus(); });
    // Zeigt die Adresse auf eine Karte, die gerade ausgefiltert ist, gelten wieder alle Filter nicht
    var reveal = function () {
      var id = decodeURIComponent(location.hash.slice(1));
      var el = id && document.getElementById(id);
      if (el && el.hasAttribute('data-card') && el.hidden) { clear(); el.scrollIntoView(); }
    };
    window.addEventListener('hashchange', reveal);
    // Adresse auf eine Pille der Filter (#rarity-<stufe>, Links aus der Beute der Dungeons): Filter vorwählen. Zur Pille
    // scrollt der Browser selbst, der gewählte Filter steht dann oben, die Liste darunter
    var preset = function () {
      var id = decodeURIComponent(location.hash.slice(1));
      var pill = id && document.getElementById(id);
      if (!pill || !bar.contains(pill) || !pill.closest('[data-filter]')) return;
      pill.click();
    };
    preset();
    window.addEventListener('hashchange', preset);
    // Knopf „Link kopieren“ entfällt (UX Website 38, Luis 21.10.2026), die Karten behalten ihre Anker
  }

  // ---------- Video im Kopfbild: anhalten und weiter ----------
  var video = document.getElementById('herovideo'), toggle = document.getElementById('herotoggle');
  if (video && toggle) {
    var sync = function () {
      var paused = video.paused;
      toggle.classList.toggle('paused', paused);
      toggle.setAttribute('aria-label', toggle.getAttribute(paused ? 'data-play' : 'data-pause'));
    };
    if (reduced) { video.pause(); video.removeAttribute('autoplay'); }
    toggle.addEventListener('click', function () {
      if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } else video.pause();
    });
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    sync();
  }

  // ---------- Aufklappen, wenn die Adresse auf eine Frage zeigt (#faq-id) ----------
  function openTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  openTarget();
  window.addEventListener('hashchange', openTarget);

  // ---------- Auftritte nacheinander beim Scrollen ----------
  var reveals = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      var i = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.style.transitionDelay = (i++ * 45) + 'ms';
        el.classList.add('in');
        io.unobserve(el);
      });
    }, {rootMargin: '0px 0px -8% 0px'});
    reveals.forEach(function (el) { io.observe(el); });
  }

  // ---------- Startseite: Glas der Plattform-Knöpfe zum Ausprobieren (Luis 21.10.2026) ----------
  // ?glas=a Seifenblase (Standard), ?glas=b Milchglas, ?glas=0 weiß wie vorher. Die Wahl bleibt im Browser, bis eine andere kommt
  var glassBox = document.querySelector('[data-glass]');
  if (glassBox) {
    var glassPick = (location.search.match(/[?&]glas=([ab0])\b/) || [])[1];
    try {
      if (glassPick) localStorage.setItem('ovalings.glas', glassPick);
      else glassPick = localStorage.getItem('ovalings.glas');
    } catch (e) { /* ohne Speicher gilt nur die Adresse */ }
    if (glassPick === 'b' || glassPick === '0') { glassBox.classList.remove('glass-a'); if (glassPick === 'b') glassBox.classList.add('glass-b'); }
  }

  // ---------- Startseite: 3D für Ei und Bosse (Luis 21.10.2026) ----------
  // Beide laden dieselbe 3D-Seite (3d/home/, gleiche Herkunft) als Rahmen, erst wenn der Abschnitt fast im Bild ist, und schicken ihr
  // active false, sobald er aus dem Bild ist (dann zeichnet sie nichts). Ohne WebGL meldet sie error, dann bleiben die Bilder
  function frame3d(host, cls, title, onMessage) {
    var src = host.getAttribute('data-home3d');
    if (!src || !('IntersectionObserver' in window)) return null;
    var f = null, ready = false, queue = [], visible = false;
    var api = {
      send: function (b) {
        if (!f || !ready) { queue.push(b); return; }
        try { if (f.contentWindow.ovalingsHome) { f.contentWindow.ovalingsHome(b); return; } } catch (e) { /* fremde Herkunft: Nachricht */ }
        f.contentWindow.postMessage(JSON.stringify(b), location.origin);
      }
    };
    window.addEventListener('message', function (e) {
      if (!f || e.source !== f.contentWindow || typeof e.data !== 'string' || e.data.charAt(0) !== '{') return;
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.type === 'ready') {
        ready = true; api.send({kind: 'active', on: visible});
        var q = queue; queue = []; q.forEach(api.send);
      }
      onMessage(m);
    });
    new IntersectionObserver(function (entries) {
      var hit = entries[0].isIntersecting;
      if (hit && !f) {
        f = document.createElement('iframe');
        f.className = cls; f.src = src; f.title = title || '';
        if (!title) { f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; }
        host.appendChild(f);
      }
      visible = hit;
      if (ready) api.send({kind: 'active', on: hit});
    }, {rootMargin: '300px 0px'}).observe(host);
    return api;
  }

  // Ei: Tippen bis es schlüpft wie in der App. Die Leiste wählt die Eisorte, danach „Noch ein Ei“ derselben Sorte
  var hatchPic = document.querySelector('.hatchpic[data-home3d]');
  var hatchEgg = document.querySelector('.hatchegg');
  if (hatchPic && hatchEgg) {
    var again = hatchPic.querySelector('.hatchagain');
    var tier = 'normal';
    // Die 3D-Seite zeigt die Halle der Brutkammer als ganzen Raum (Luis 23.10.2026), die Lage im Bild schickt die Website nicht mehr
    var egg3d = frame3d(hatchPic, 'hatchframe', hatchPic.getAttribute('data-title'), function (m) {
      if (m.type === 'egg') hatchPic.classList.add('live');
      else if (m.type === 'error' && (m.code === 'webgl' || m.code === 'context_lost' || m.code === 'room')) { hatchPic.classList.remove('live'); hatchPic.classList.add('no3d'); }
      else if (m.type === 'hatched' && again) again.hidden = false;
    });
    // Ohne 3D (kein IntersectionObserver) gleich das Standbild statt der Ladeanzeige
    if (!egg3d) hatchPic.classList.add('no3d');
    var showEgg = function () { if (again) again.hidden = true; if (egg3d) egg3d.send({kind: 'egg', tier: tier}); };
    showEgg();
    if (again) again.addEventListener('click', showEgg);
    document.querySelectorAll('.eggrow a[data-egg]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelectorAll('.eggrow a[data-egg]').forEach(function (o) { o.classList.remove('on'); o.removeAttribute('aria-current'); });
        a.classList.add('on'); a.setAttribute('aria-current', 'true');
        tier = a.getAttribute('data-tier') || 'normal';
        hatchEgg.src = a.getAttribute('data-egg');
        if (!hatchPic.classList.contains('live')) { hatchEgg.classList.remove('swap'); void hatchEgg.offsetWidth; hatchEgg.classList.add('swap'); }
        showEgg();
      });
    });
    hatchEgg.addEventListener('animationend', function (e) { if (e.animationName === 'eggpop') hatchEgg.classList.remove('swap'); });
  }

  // Bosse: Idle in 3D, Maus darüber spielt einen Angriff. Am Handy spielt das erste Antippen den Angriff, ein zweites Antippen
  // derselben Karte öffnet den Dungeon
  var bossTrack = document.querySelector('.bosstrack[data-home3d]');
  if (bossTrack) {
    var cards = Array.prototype.slice.call(bossTrack.querySelectorAll('.bossrow li[data-boss]'));
    var row = bossTrack.querySelector('.bossrow');
    var boss3d = frame3d(bossTrack, 'bossframe', '', function (m) {
      if (m.type === 'boss' && m.ok && cards[m.index]) cards[m.index].classList.add('live');
      else if (m.type === 'error') cards.forEach(function (c) { c.classList.remove('live'); });
    });
    if (boss3d) {
      var slots = function () {
        var base = bossTrack.getBoundingClientRect();
        return cards.map(function (c) {
          var r = c.querySelector('.bossstage').getBoundingClientRect();
          return {kind: c.getAttribute('data-boss'), x: Math.round(r.left - base.left), y: Math.round(r.top - base.top), w: Math.round(r.width), h: Math.round(r.height)};
        });
      };
      var pending = false;
      var place = function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; boss3d.send({kind: 'slots', slots: slots()}); });
      };
      place();
      window.addEventListener('resize', place);
      if (row) row.addEventListener('scroll', place, {passive: true});
      var armed = null, armedAt = 0;
      cards.forEach(function (c, i) {
        var a = c.querySelector('a');
        a.addEventListener('mouseenter', function () { boss3d.send({kind: 'act', index: i}); });
        a.addEventListener('focus', function () { boss3d.send({kind: 'act', index: i}); });
        a.addEventListener('pointerup', function (e) { a.dataset.touch = e.pointerType === 'mouse' ? '' : '1'; });
        a.addEventListener('click', function (e) {
          if (a.dataset.touch !== '1') return;
          a.dataset.touch = '';
          if (armed === a && Date.now() - armedAt < 6000) return;
          e.preventDefault(); armed = a; armedAt = Date.now();
          boss3d.send({kind: 'act', index: i});
        });
      });
    }
  }

  // Kampagne (3b): gestrichelte Route durch die Mitten der Inseln, am Handy hebt sich die Insel in der Mitte der Wischreihe
  var islandTrack = document.querySelector('.islandtrack');
  if (islandTrack) {
    var routeSvg = islandTrack.querySelector('.route');
    var routePath = routeSvg.querySelector('path');
    var isles = Array.prototype.slice.call(islandTrack.querySelectorAll('.islandrow li'));
    var drawRoute = function () {
      var ul = islandTrack.querySelector('.islandrow');
      var w = ul.scrollWidth, h = ul.offsetHeight, base = ul.getBoundingClientRect();
      routeSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      routeSvg.style.width = w + 'px'; routeSvg.style.height = h + 'px';
      routeSvg.style.left = ul.offsetLeft + 'px'; routeSvg.style.top = ul.offsetTop + 'px';
      var pts = isles.map(function (li) {
        var r = li.querySelector('img').getBoundingClientRect();
        return [r.left - base.left + ul.scrollLeft + r.width / 2, r.top - base.top + r.height * 0.62];
      });
      if (pts.length < 2) { routePath.setAttribute('d', ''); return; }
      var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
      for (var k = 1; k < pts.length; k++) {
        var p0 = pts[k - 1], p1 = pts[k], mx = (p0[0] + p1[0]) / 2;
        d += ' C' + mx.toFixed(1) + ' ' + p0[1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + p1[1].toFixed(1) + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
      }
      routePath.setAttribute('d', d);
    };
    var near = function () {
      if (islandTrack.scrollWidth <= islandTrack.clientWidth + 2) { isles.forEach(function (li) { li.classList.remove('near'); }); return; }
      var box = islandTrack.getBoundingClientRect(), mid = box.left + box.width / 2, best = null, bestD = 1e9;
      isles.forEach(function (li) { var r = li.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - mid); if (dd < bestD) { bestD = dd; best = li; } });
      isles.forEach(function (li) { li.classList.toggle('near', li === best); });
    };
    var later = function () { requestAnimationFrame(function () { drawRoute(); near(); }); };
    later();
    window.addEventListener('resize', later);
    window.addEventListener('load', later);
    isles.forEach(function (li) { var img = li.querySelector('img'); if (img && !img.complete) img.addEventListener('load', later); });
    islandTrack.addEventListener('scroll', function () { requestAnimationFrame(near); }, {passive: true});
  }

  // ---------- 404: Text in der Sprache der Adresse oder des Browsers ----------
  if (doc.getAttribute('data-page') === '404') {
    var fromPath = location.pathname.split('/')[1];
    var pick = LANGS.indexOf(fromPath) >= 0 ? fromPath : null;
    if (!pick) {
      var prefs = navigator.languages || [navigator.language || 'en'];
      for (var k = 0; k < prefs.length && !pick; k++) {
        var p = String(prefs[k]).toLowerCase().split('-')[0];
        if (p === 'in') p = 'id';
        if (LANGS.indexOf(p) >= 0) pick = p;
      }
    }
    pick = pick || 'en';
    document.querySelectorAll('.nf').forEach(function (el) { el.hidden = el.getAttribute('data-lang') !== pick; });
    var shown = document.querySelector('.nf[data-lang="' + pick + '"]');
    if (shown) doc.lang = shown.getAttribute('lang');
  }
})();
