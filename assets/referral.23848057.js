// Freunde werben auf der Website (E245, Luis 22.10.2026): gemeinsame Teile für Registrieren (account.js), Profil (profile.js)
// und Event-Seite (invite.js). Braucht auth.js (OvalAuth).
// - Einladungslink im lokalen Speicher ovalings.invite ({code, name, at}, höchstens 30 Tage, join.js legt ihn an)
// - Namensvorschläge beim Tippen über die Edge Function referral-search (ohne Anmeldung, Grenze je IP auf dem Server)
// - Prüfen des eingetippten Namens: nur ein vorhandener Name zählt (ohne Groß und Klein), sonst Fehler no_player
// - Link teilen (navigator.share) oder kopieren, Zahl der Einladungen als Text
(function () {
  'use strict';
  var A = window.OvalAuth, C = A.cfg, T = C.text, R = T.ref;
  var KEY = 'ovalings.invite', MIN = 3, WAIT = 300, MAX_AGE = 30 * 864e5;
  var norm = function (v) { return String(v || '').replace(/\s+/g, ' ').trim(); };
  var fill = function (s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? String(v[k]) : m; }); };

  function readInvite() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!j || typeof j !== 'object') return null;
      var code = String(j.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (code.length < 4 || code.length > 16) return null;
      if (j.at && Date.now() - new Date(j.at).getTime() > MAX_AGE) return null;
      return { code: code, name: typeof j.name === 'string' && j.name.trim() ? j.name.trim() : null, at: j.at || null };
    } catch (e) { return null; }
  }
  function saveInvite(inv) { try { localStorage.setItem(KEY, JSON.stringify(inv)); } catch (e) { /* ohne Speicher nur diese Seite */ } }
  function clearInvite() { try { localStorage.removeItem(KEY); } catch (e) { /* nichts gespeichert */ } }

  function search(q) {
    return A.publicFn('referral-search', { q: norm(q) }).then(function (r) { return (r && r.names) || []; }, function (e) {
      if (e && e.code === 'too_many') throw new A.Fail('search_too_many', 429);
      throw e;
    });
  }
  function nameForCode(code) {
    return A.publicFn('referral-search', { code: code }).then(function (r) { return (r && r.name) || null; }, function () { return null; });
  }

  // Feld mit Vorschlägen: input und eine Liste [data-sugg] direkt darunter. Klick übernimmt den Namen.
  function attach(input, list) {
    var timer = null, run = 0;
    function clear() { list.textContent = ''; list.hidden = true; }
    function show(names) {
      list.textContent = '';
      var q = norm(input.value).toLowerCase();
      names = names.filter(function (n) { return n.toLowerCase() !== q; });
      if (!names.length) { list.hidden = true; return; }
      names.forEach(function (n) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.className = 'suggbtn'; b.textContent = n;
        b.addEventListener('click', function () { input.value = n; run++; clear(); input.focus(); input.dispatchEvent(new Event('change')); });
        li.appendChild(b); list.appendChild(li);
      });
      list.hidden = false;
    }
    input.addEventListener('input', function () {
      clearTimeout(timer); run++;
      var q = norm(input.value);
      if (q.length < MIN) { clear(); return; }
      var mine = run;
      timer = setTimeout(function () {
        search(q).then(function (names) { if (mine === run) show(names); }, function () { if (mine === run) clear(); });
      }, WAIT);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') clear(); });
    return { clear: clear };
  }

  // Eingetippten Namen prüfen: leer gibt null, sonst die Schreibweise des Kontos oder Fehler no_player
  function resolve(text) {
    var q = norm(text);
    if (!q) return Promise.resolve(null);
    if (q.length < MIN) return Promise.reject(new A.Fail('no_player', 0));
    return search(q).then(function (names) {
      var hit = names.filter(function (n) { return n.toLowerCase() === q.toLowerCase(); })[0];
      if (!hit) throw new A.Fail('no_player', 0);
      return hit;
    });
  }

  function count(n) { return n === 1 ? R.one : fill(R.many, { count: n }); }
  function link(code) { return C.inviteBase + code; }

  // Teilen über das System, sonst kopieren. Ergebnis: 'shared', 'copied' oder 'failed'
  function share(url) {
    var text = fill(R.share, { link: url });
    if (navigator.share) {
      return navigator.share({ text: text }).then(function () { return 'shared'; }, function (e) {
        return e && e.name === 'AbortError' ? 'shared' : copy(url);
      });
    }
    return copy(url);
  }
  function copy(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function () { return 'copied'; }, function () { return 'failed'; });
    }
    return Promise.resolve('failed');
  }

  // Satz zum Stand des Events aus referral_status (läuft, vorbei, startet bald)
  function eventText(st) {
    st = st || {};
    if (st.ended) return R.ended;
    if (!st.open) return R.soon;
    var p = st.prizes || [], n = function (i) { try { return (p[i] || 0).toLocaleString(C.htmlLang); } catch (e) { return String(p[i] || 0); } };
    return fill(R.open, { first: n(0), second: n(1), third: n(2) });
  }

  // Nächste Einladung mit Extra-Eiern nach n qualifizierten (wie ReferralRules.nextBonusAt in der App)
  function nextBonus(n) {
    var b = C.bonus;
    for (var k = n + 1; k < n + 1000; k++) {
      if (k === b.normalAt || (k >= b.rareFrom && k % b.rareEvery === 0) || k % b.epicEvery === 0) return k;
    }
    return n + 1;
  }

  window.OvalReferral = {
    readInvite: readInvite, saveInvite: saveInvite, clearInvite: clearInvite, nameForCode: nameForCode, search: search,
    attach: attach, resolve: resolve, count: count, link: link, share: share, copy: copy, eventText: eventText,
    nextBonus: nextBonus, fill: fill, norm: norm
  };
})();
