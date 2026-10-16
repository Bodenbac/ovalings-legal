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

  // ---------- Sprachauswahl ----------
  var pill = document.getElementById('langpill'), dialog = document.getElementById('langdialog');
  var barrier = document.getElementById('langbarrier'), closeBtn = document.getElementById('langclose');
  var lastFocus = null;
  function focusables() { return dialog.querySelectorAll('a[href], button'); }
  function openDialog(e) {
    if (e) e.preventDefault();
    lastFocus = document.activeElement;
    dialog.hidden = false;
    barrier.hidden = false;
    var current = dialog.querySelector('a[aria-current]') || focusables()[0];
    if (current) current.focus();
    document.addEventListener('keydown', onKey);
  }
  function closeDialog() {
    dialog.hidden = true;
    barrier.hidden = true;
    document.removeEventListener('keydown', onKey);
    if (lastFocus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (e.key !== 'Tab') return;
    var list = focusables(), first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  if (pill && dialog) {
    pill.setAttribute('role', 'button');
    pill.addEventListener('click', openDialog);
    pill.addEventListener('keydown', function (e) { if (e.key === ' ') openDialog(e); });
    barrier.addEventListener('click', closeDialog);
    closeBtn.addEventListener('click', closeDialog);
  }
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
    // Link einer Karte kopieren
    if (navigator.clipboard && window.isSecureContext) {
      document.querySelectorAll('[data-copy]').forEach(function (b) {
        var label = b.textContent;
        b.hidden = false;
        b.addEventListener('click', function () {
          var url = location.href.split('#')[0] + '#' + b.getAttribute('data-copy');
          navigator.clipboard.writeText(url).then(function () {
            b.textContent = b.getAttribute('data-done');
            b.classList.add('done');
            setTimeout(function () { b.textContent = label; b.classList.remove('done'); }, 2200);
          }, function () { /* ohne Erlaubnis bleibt der Knopf, wie er ist */ });
        });
      });
    }
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

  // ---------- Startseite: Ei antippen zeigt es im Bild der Brutkammer (Luis 16.10.2026) ----------
  var hatchEgg = document.querySelector('.hatchegg');
  if (hatchEgg) {
    document.querySelectorAll('.eggrow a[data-egg]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelectorAll('.eggrow a[data-egg]').forEach(function (o) { o.classList.remove('on'); o.removeAttribute('aria-current'); });
        a.classList.add('on'); a.setAttribute('aria-current', 'true');
        hatchEgg.src = a.getAttribute('data-egg');
        hatchEgg.classList.remove('swap'); void hatchEgg.offsetWidth; hatchEgg.classList.add('swap');
      });
    });
    hatchEgg.addEventListener('animationend', function (e) { if (e.animationName === 'eggpop') hatchEgg.classList.remove('swap'); });
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
