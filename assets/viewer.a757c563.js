// Betrachter der Website ovalings.app (Plan docs/site/PLAN.md 4.3 bis 4.5, Paket C2, Luis 15.10.2026, 7a).
// Liest die ID aus dem Fragment (#<uuid>, ?id= wird ins Fragment verschoben), fragt die Edge Function ovaling-view und zeigt
// Name, Level, Seltenheit, Familie mit Bonus, Gene Score, Plätze, Werte mit Rechnung, Sechseck, Steckbrief und Mehr Infos. Die
// Figur baut die 3D-Seite /3d/viewer/ im iframe (Nachrichten als JSON-Zeichenkette, nur zwischen Seite und eigenem Rahmen).
// Oben schaltet ein Umschalter zwischen „Eigenes Ovaling“ (Eingabe der ID) und „Beispiel-Ovalings“ (Wunsch Luis 15.10.2026).
// Beispiele sind die Ovalings der Startseite je Familie: #example-light-<n> und #example-shadow-<n> (n ab 0, ohne Zahl das
// erste), die 3D-Seite baut sie aus der ID wie echte, ohne Server. Alte Adressen #example und #example-<n> zählen durch Licht,
// dann Schatten. Keine Speicherung der IDs im Browser.
// Texte vom Server (Beiname, Steckbrief, ID) gehen nur als textContent in die Seite, HTML kommt nur aus dem Bau der Website.
// Auf localhost schaltet ?mock=<name> den Server ab: <name>.json unter mock/ (nur der Prüfserver von shoot_site.py liefert
// diesen Ordner aus, er liegt in tool/site/mock), dazu mock=offline und mock=timeout.
(function () {
  'use strict';
  var cfgEl = document.getElementById('viewercfg');
  if (!cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent);
  var $ = function (sel) { return document.querySelector(sel); };
  var el = {
    form: $('[data-viewer-form]'), input: $('#vid'), error: $('[data-viewer-form] [data-error]'), paste: $('[data-paste]'),
    modes: $('[data-modes]'), modeBtns: Array.prototype.slice.call(document.querySelectorAll('[data-mode]')),
    fams: $('[data-fams]'), famBtns: Array.prototype.slice.call(document.querySelectorAll('[data-fam]')),
    msg: $('[data-msg]'), msgText: $('[data-msg-text]'), retry: $('[data-retry]'),
    view: $('[data-view]'), stage: $('[data-stage]'), loading: $('[data-loading]'), no3d: $('[data-no3d]'), no3dEgg: $('[data-no3d-egg]'),
    no3dText: $('[data-no3d-text]'), live: $('[data-live]'),
    name: $('[data-name]'), levelPill: $('[data-level-pill]'), full: $('[data-full]'),
    example: $('[data-example]'), exPrev: $('[data-ex-prev]'), exNext: $('[data-ex-next]'), exDots: $('[data-ex-dots]'),
    exCount: $('[data-ex-count]'),
    details: $('[data-details]'), card: $('[data-card]'), rarity: $('[data-rarity]'), family: $('[data-family]'),
    familyName: $('[data-family-name]'), bonusIcon: $('[data-bonus-icon]'), bonus: $('[data-bonus]'), score: $('[data-score]'),
    level: $('[data-level]'), xp: $('[data-xp]'), xpBar: $('[data-xp-bar]'),
    slotsPanel: $('[data-slots-panel]'), slots: $('[data-slots]'), statsPanel: $('[data-stats-panel]'), stats: $('[data-stats]'),
    hex: $('[data-hex]'), profile: $('[data-profile]'), profileText: $('[data-profile-text]'), profileEn: $('[data-profile-en]'),
    skin: $('[data-skin]'), egg: $('[data-egg]'), hatched: $('[data-hatched]'), rules: $('[data-rules]'), id: $('[data-id]'),
    copy: $('[data-copy-id]'), share: $('[data-share]'),
    dialog: $('#vdialog'), barrier: $('#vbarrier'), dialogClose: $('#vdialogclose'), dialogHead: $('[data-dialog-head]'),
    dialogBody: $('[data-dialog-body]'),
  };
  var SVG = 'http://www.w3.org/2000/svg';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var baseTitle = document.title;
  // Prüfmodus nur auf dem eigenen Rechner (Plan 11.4)
  var MOCK = (function () {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
    var m = new URLSearchParams(location.search).get('mock');
    return m && /^[a-z0-9_-]+$/i.test(m) ? m : null;
  })();

  var D = null;          // Texte, Namen und Bilder der Sprache (assets/data/viewer.<code>.<hash>.json)
  var gen = 0;           // Nummer der aktuellen Anzeige, ältere Antworten verfallen
  var routed = null;     // zuletzt gezeigtes Fragment
  var state = 'start';   // start, loading, shown, error, example
  var shown = null;      // Antwort des Servers zum gezeigten Ovaling

  // ---------- Hilfen ----------
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pic(src, size, cls) {
    var i = document.createElement('img');
    if (src) i.src = src;
    i.alt = ''; i.setAttribute('aria-hidden', 'true');
    i.width = size; i.height = size;
    if (cls) i.className = cls;
    return i;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVG, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  // Zahl im Format der Sprache (Gruppierung wie fmt() des Baus), Prozent mit schmalem Leerzeichen wie die App
  function num(n) {
    var s = String(Math.round(Math.abs(n))), out = '';
    while (s.length > 3) { out = D.num.group + s.slice(-3) + out; s = s.slice(0, -3); }
    return (n < 0 ? '-' : '') + s + out;
  }
  function pct(n) { return D.pct.replace('{n}', num(n)); }
  function fill(text, values) {
    return text.replace(/\{([A-Za-z]+)\}/g, function (m, k) { return values[k] != null ? values[k] : m; }).replace(/(\d) %/g, '$1 %');
  }
  function statValue(stat, v) { return D.stats[stat] && D.stats[stat].unit ? pct(v) : num(v); }
  function setClass(node, prefix, value) {
    Array.prototype.slice.call(node.classList).forEach(function (c) { if (c.indexOf(prefix) === 0) node.classList.remove(c); });
    if (value) node.classList.add(prefix + value);
  }
  function widthClass(node, share) {
    setClass(node, 'w', null);
    node.classList.add('w' + Math.max(0, Math.min(100, Math.round(share * 100))));
  }
  function decode(raw) {
    try { return decodeURIComponent(raw); } catch (e) { return raw; /* kaputter Anker: roher Text */ }
  }
  function rawHash() { return decode(location.hash.slice(1)).trim(); }
  function readHash() { return rawHash().toLowerCase(); }
  // Muster aus OvalingId und gültige Eicodes (wie site.js)
  var ID = /^([0-9a-f])[0-9a-f]{7}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var EXAMPLE = /^example(?:-(light|shadow))?(?:-(\d+))?$/;
  function validId(v) {
    var m = ID.exec(v);
    return !!m && D.codes.indexOf(parseInt(m[1], 16)) >= 0;
  }
  // Beispiel aus dem Fragment: Familie, Nummer und die gültige Schreibweise (#example-light, #example-shadow-3). Ohne Familie
  // (alte Adressen) zählt n durch alle Beispiele, erst Licht, dann Schatten. Zu große Nummern gelten als die letzte.
  function exampleOf(hash) {
    var m = EXAMPLE.exec(hash), groups = D.examples;
    if (!m || !groups.length) return null;
    var g = null, n = m[2] ? parseInt(m[2], 10) : 0;
    if (m[1]) {
      groups.forEach(function (x) { if (x.family === m[1]) g = x; });
    } else {
      for (var i = 0; i < groups.length && !g; i++) {
        if (n < groups[i].list.length || i === groups.length - 1) g = groups[i];
        else n -= groups[i].list.length;
      }
    }
    if (!g) { g = groups[0]; n = 0; }
    n = Math.max(0, Math.min(g.list.length - 1, n));
    return { group: g, n: n, hash: exampleHash(g.family, n) };
  }
  function exampleHash(fam, n) { return 'example-' + fam + (n ? '-' + n : ''); }
  // Sprung in der Seite (Sprunglink #main, #languages im Fuß): kein Beispiel, nichts in der Form einer ID, und es gibt ein
  // Element mit diesem Namen. Solche Fragmente ändern die Anzeige nie.
  function pageAnchor(raw) {
    if (!raw || EXAMPLE.test(raw.toLowerCase()) || /^[0-9a-f]{8}-/i.test(raw)) return null;
    return document.getElementById(raw);
  }

  // ---------- 3D (Plan 4.3) ----------
  // deviceNo3d: das Gerät zeigt kein 3D (kein WebGL oder kein ready nach 15 s), gilt, bis doch ready oder built kommt.
  // Scheitert nur eine Figur (build, bad_id, rules_version), steht der Hinweis bis zum nächsten Befehl, 3D bleibt an.
  var frame = null, ready = false, readyTimer = 0, pending = null, visible = true, deviceNo3d = false;
  var no3dText = el.no3dText.textContent;
  var origin = location.origin && location.origin !== 'null' ? location.origin : '*';
  function post(cmd) { try { frame.contentWindow.postMessage(JSON.stringify(cmd), origin); } catch (e) { /* Rahmen weg */ } }
  function ensureFrame() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.className = 'vframe';
    frame.title = D.t.frameTitle;
    frame.setAttribute('tabindex', '-1');
    frame.src = cfg.frame;
    el.stage.insertBefore(frame, el.stage.firstChild);
    // Ohne ready nach 15 s gilt das Gerät als ohne 3D, kommt ready später, erscheint die Figur doch
    readyTimer = setTimeout(function () { if (!ready) showNo3d(no3dText, true); }, 15000);
  }
  // Boden der Familie (backdropFloor) für die 3D-Seite: ohne Raum (Rundumbild nicht geladen) steht die Figur dann auf der
  // gemalten Bühne des Familienbilds hinter dem Rahmen statt mittig. Oben bleibt Platz für Name und Level.
  function withGround(cmd, fam) {
    var f = D.families[fam];
    if (f && typeof f.floor === 'number') {
      var top = el.stage.querySelector('.vtop'), hgt = el.stage.clientHeight || 1;
      cmd.ground = f.floor;
      cmd.groundTop = Math.min(0.3, Math.max(0.08, ((top ? top.offsetTop + top.offsetHeight : 56) + 8) / hgt));
    }
    return cmd;
  }
  function send3d(cmd) {
    pending = cmd;
    el.stage.classList.remove('built');
    if (!deviceNo3d) hideNo3d();
    el.loading.hidden = deviceNo3d;
    ensureFrame();
    // Erst die Karte zeichnen lassen, dann bauen: der Bau hält den Hauptthread am Handy einige Sekunden an
    if (ready) setTimeout(function () { if (pending === cmd) post(cmd); }, 60);
  }
  function active() { return visible && !document.hidden && !el.view.hidden; }
  function syncActive() { if (ready) post({ kind: 'active', on: active() }); }
  // Statt der Figur das Familienbild mit dem gemalten Ei und einem Satz, warum. Ohne Figur kein Vollbild
  function showNo3d(text, device) {
    if (device) deviceNo3d = true;
    el.no3dText.textContent = text;
    el.loading.hidden = true;
    el.no3d.hidden = false;
    el.stage.classList.remove('built');
    el.stage.classList.add('no3d');
    el.full.hidden = true;
    if (full) setFull(false);
  }
  function hideNo3d() {
    deviceNo3d = false;
    el.no3d.hidden = true;
    el.stage.classList.remove('no3d');
    el.full.hidden = !(state === 'shown' || state === 'example');
  }
  window.addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow || typeof e.data !== 'string' || e.data.charAt(0) !== '{') return;
    var m;
    try { m = JSON.parse(e.data); } catch (x) { return; }
    if (!m || m.source !== 'v') return;
    if (m.type === 'ready') {
      ready = true;
      clearTimeout(readyTimer);
      hideNo3d();
      if (pending) { el.loading.hidden = false; post(pending); }
      syncActive();
    } else if (m.type === 'built') {
      el.loading.hidden = true;
      hideNo3d();
      el.stage.classList.add('built');
    } else if (m.type === 'error') {
      // Kontextverlust: die 3D-Seite lädt sich neu und meldet ready, dann geht der letzte Befehl erneut hinaus
      if (m.code === 'context_lost') { ready = false; el.loading.hidden = false; el.stage.classList.remove('built'); }
      else if (m.code === 'webgl') showNo3d(no3dText, true);
      else if (m.code === 'rules_version') showNo3d(D.t.rulesUnknown, false);
      else showNo3d(D.t.failed3d, false);
    }
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; syncActive(); }).observe(el.stage);
  }
  document.addEventListener('visibilitychange', syncActive);

  // ---------- Vollbild ----------
  var full = false;
  function setFull(on) {
    full = on;
    el.stage.classList.toggle('full', on);
    document.documentElement.classList.toggle('vfull', on);
    el.full.textContent = el.full.getAttribute(on ? 'data-off' : 'data-on');
    if (on) {
      // Fullscreen-API, wo es sie für Elemente gibt (am iPhone nur die Klasse)
      if (el.stage.requestFullscreen) el.stage.requestFullscreen().catch(function () {});
      else if (el.stage.webkitRequestFullscreen) el.stage.webkitRequestFullscreen();
      document.addEventListener('keydown', fullKey);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      document.removeEventListener('keydown', fullKey);
    }
  }
  function fullKey(e) { if (e.key === 'Escape' && !document.fullscreenElement && el.dialog.hidden) setFull(false); }
  el.full.addEventListener('click', function () { setFull(!full); });
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (full && !document.fullscreenElement && !document.webkitFullscreenElement) setFull(false);
    });
  });

  // ---------- Glasfenster (wie das Fenster der Sprachauswahl in site.js) ----------
  var lastFocus = null;
  function focusables() { return el.dialog.querySelectorAll('a[href], button'); }
  function openDialog(head, body) {
    clear(el.dialogHead); clear(el.dialogBody);
    el.dialogHead.appendChild(head);
    if (body) el.dialogBody.appendChild(body);
    lastFocus = document.activeElement;
    el.dialog.hidden = false;
    el.barrier.hidden = false;
    el.dialogClose.focus();
    document.addEventListener('keydown', dialogKey);
  }
  function closeDialog() {
    if (el.dialog.hidden) return;
    el.dialog.hidden = true;
    el.barrier.hidden = true;
    document.removeEventListener('keydown', dialogKey);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function dialogKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); return; }
    if (e.key !== 'Tab') return;
    var list = focusables(), first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  el.dialogClose.addEventListener('click', closeDialog);
  el.barrier.addEventListener('click', closeDialog);
  function dialogHead(title, sub, art) {
    var head = h('div', 'vdhead');
    if (art) head.appendChild(art);
    var text = h('div', 'vdtitle');
    var t = h('h2', null, title);
    t.id = 'vdialogtitle';
    text.appendChild(t);
    if (sub) text.appendChild(h('p', 'sub', sub));
    head.appendChild(text);
    return head;
  }
  function rows(list) {
    var dl = h('dl', 'rows');
    list.forEach(function (r) {
      var div = h('div'), dt = h('dt', null, r[0]), dd = h('dd');
      if (r[2]) dd.className = r[2];
      if (r[1] instanceof Node) dd.appendChild(r[1]);
      else dd.innerHTML = r[1]; // HTML aus dem Bau der Website (Marken wie <atk>), nie vom Server
      div.appendChild(dt); div.appendChild(dd); dl.appendChild(div);
    });
    return dl;
  }

  // ---------- Zeichen der Plätze (wie MoveSlotBoxes, move_slots.dart) ----------
  // Pfote: großer Ballen, vier Zehen im Bogen (OvalIconKind.attack), Aura: Kern mit zwei offenen Ringen (OvalIconKind.passive)
  function pawIcon() {
    var s = svg('svg', { viewBox: '0 0 24 24', 'class': 'vicon', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svg('path', { d: 'M12 12.2C15.6 12.2 19 15.6 18.6 18.4C18.3 20.6 15.6 21 12 19.8C8.4 21 5.7 20.6 5.4 18.4C5 15.6 8.4 12.2 12 12.2Z' }));
    [[4.6, 10.4, -0.45], [8.9, 6.2, -0.15], [15.1, 6.2, 0.15], [19.4, 10.4, 0.45]].forEach(function (t) {
      s.appendChild(svg('ellipse', { cx: t[0], cy: t[1], rx: 1.95, ry: 2.5, transform: 'rotate(' + (t[2] * 180 / Math.PI).toFixed(1) + ' ' + t[0] + ' ' + t[1] + ')' }));
    });
    return s;
  }
  function arc(r, a0, a1) {
    var x0 = 12 + r * Math.cos(a0), y0 = 12 + r * Math.sin(a0), x1 = 12 + r * Math.cos(a1), y1 = 12 + r * Math.sin(a1);
    return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r + ' ' + r + ' 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }
  function auraIcon() {
    var s = svg('svg', { viewBox: '0 0 24 24', 'class': 'vicon aura', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svg('circle', { cx: 12, cy: 12, r: 3.2, 'class': 'core' }));
    [[6.6, 1.9], [10, 1.5]].forEach(function (p) {
      s.appendChild(svg('path', { d: arc(p[0], Math.PI - p[1] / 2, Math.PI + p[1] / 2), 'class': 'ring' }));
      s.appendChild(svg('path', { d: arc(p[0], -p[1] / 2, p[1] / 2), 'class': 'ring' }));
    });
    return s;
  }
  // Gesperrt: Schloss an zwei Ketten aus den oberen Ecken (zwei statt vier, sonst ein Kreuz), Glieder abwechselnd Ring und Steg
  function chains() {
    var s = svg('svg', { viewBox: '0 0 100 100', 'class': 'vchains', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
    var link = 17, lock = [50, 60];
    [[6, 6], [94, 6]].forEach(function (start) {
      var dx = lock[0] - start[0], dy = lock[1] - start[1], len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
      var n = Math.floor(len / (link * 0.78));
      for (var i = 0; i < n; i++) {
        var px = start[0] + dx * (i + 0.5) / n, py = start[1] + dy * (i + 0.5) / n;
        var g = svg('g', { transform: 'translate(' + px.toFixed(2) + ' ' + py.toFixed(2) + ') rotate(' + ang.toFixed(1) + ')' });
        if (i % 2 === 0) {
          g.appendChild(svg('rect', { x: -link / 2, y: -link * 0.31, width: link, height: link * 0.62, rx: link * 0.31, 'class': 'cd' }));
          g.appendChild(svg('rect', { x: -link / 2, y: -link * 0.31, width: link, height: link * 0.62, rx: link * 0.31, 'class': 'cl' }));
        } else {
          g.appendChild(svg('line', { x1: -link * 0.45, y1: 0, x2: link * 0.45, y2: 0, 'class': 'cd bar' }));
          g.appendChild(svg('line', { x1: -link * 0.32, y1: -1, x2: link * 0.32, y2: -1, 'class': 'cl' }));
        }
        s.appendChild(g);
      }
    });
    return s;
  }
  function lockedBox(box) {
    box.classList.add('locked');
    box.appendChild(chains());
    var lk = h('span', 'vlock');
    lk.appendChild(pic(D.art.lock, 26));
    box.appendChild(lk);
  }

  function slotTitle(i) { return D.slotTitles[i]; }
  function moveInfo(key) { return D.moves[key] || { name: key, sub: null, rows: [], lines: [], foot: [], art: null, rarity: null }; }
  function passiveInfo(key) { return D.passives[key] || { name: key, sub: null, text: '', art: null, rarity: null }; }
  function moveArt(info, rarity, size) {
    var f = h('span', 'frame r-' + rarity + ' vmoveart');
    if (info.art) f.appendChild(pic(info.art, size));
    else { f.classList.add('paw'); f.appendChild(pawIcon()); }
    return f;
  }

  function slotBox(i, s, passive) {
    var li = h('li', 'vslot' + (passive ? ' passive' : ''));
    li.appendChild(h('span', 'vslottitle' + (passive ? ' r-passive' : ''), slotTitle(i)));
    var box = h('button', 'vbox');
    box.type = 'button';
    var label = slotTitle(i) + ': ';
    if (s.state === 'locked') {
      lockedBox(box);
      label += D.t.locked;
    } else if (passive && s.state === 'filled') {
      var p = passiveInfo(s.passive);
      box.classList.add('filled', 'passiveart');
      if (p.art) box.appendChild(pic(p.art, 96));
      else { box.classList.add('r-passive', 'empty'); box.appendChild(auraIcon()); }
      label += p.name;
    } else if (passive) {
      box.classList.add('empty', 'r-passive');
      box.appendChild(auraIcon());
      label += D.t.empty;
    } else if (s.state === 'empty') {
      box.classList.add('empty');
      box.appendChild(pawIcon());
      label += D.t.empty;
    } else {
      var mv = moveInfo(s.move), rarity = s.state === 'basic' ? 'basic' : (s.rarity || mv.rarity || 'basic');
      box.classList.add('filled', 'r-' + rarity);
      if (mv.art) box.appendChild(pic(mv.art, 96));
      else box.appendChild(pawIcon());
      label += mv.name;
    }
    // Das kleine P der Passive unten auf dem Rahmen (Ausnahme der Gestaltungsregeln), nur wenn der Platz frei ist
    if (passive && s.state === 'empty') box.appendChild(h('span', 'vpmark', 'P'));
    box.setAttribute('aria-label', label);
    box.addEventListener('click', function () { openSlot(i, s, passive); });
    li.appendChild(box);
    return li;
  }

  function openSlot(i, s, passive) {
    if (s.state === 'locked' || s.state === 'empty') {
      var icon = h('span', 'vdicon');
      if (s.state === 'locked') { icon.appendChild(pic(D.art.lock, 40)); }
      else icon.appendChild(passive ? auraIcon() : pawIcon());
      var text = s.state === 'locked' ? D.t.lockedText[passive ? 'passive' : 'move' + (i + 1)] : (passive ? D.t.emptyPassiveText : D.t.emptyText);
      var body = h('p', null, text);
      openDialog(dialogHead(s.state === 'locked' ? D.t.locked : D.t.empty, slotTitle(i), icon), body);
      return;
    }
    if (passive) {
      var p = passiveInfo(s.passive);
      var art = p.art ? pic(p.art, 64, 'vdart') : null;
      var b = h('div', 'vdtext');
      b.innerHTML = p.text; // HTML aus dem Bau
      openDialog(dialogHead(p.name, p.sub, art), b);
      return;
    }
    var mv = moveInfo(s.move), rarity = s.state === 'basic' ? 'basic' : (s.rarity || mv.rarity || 'basic');
    var body2 = h('div');
    if (mv.rows.length) body2.appendChild(rows(mv.rows));
    if (mv.lines.length) {
      var ul = h('ul', 'lines');
      mv.lines.forEach(function (l) { var li = h('li'); li.innerHTML = l; ul.appendChild(li); });
      body2.appendChild(ul);
    }
    if (mv.foot.length) body2.appendChild(rows(mv.foot));
    openDialog(dialogHead(mv.name, s.state === 'basic' ? D.t.basic : mv.sub, moveArt(mv, rarity, 64)), body2);
  }

  // ---------- Werte (wie _ValueRow der Detailseite) ----------
  function statRow(st) {
    var info = D.stats[st.stat] || { name: st.stat, icon: null, unit: '' };
    var li = h('li');
    var b = h('button', 'vstat');
    b.type = 'button';
    b.appendChild(pic(info.icon, 22, 'vstaticon'));
    b.appendChild(h('span', 'vstatname', info.name));
    var bar = h('span', 'vstatbar');
    bar.setAttribute('aria-hidden', 'true');
    var span = st.max - st.min || 1;
    var base = Math.max(0.02, Math.min(1, st.position));
    var total = Math.max(0.02, Math.min(1, (st.total - st.min) / span));
    if (st.total !== st.rolled) { var bonus = h('span', 'vbonus'); widthClass(bonus, total); bar.appendChild(bonus); bar.classList.add('bonus'); }
    var fillEl = h('span', 'vbase'); widthClass(fillEl, base); bar.appendChild(fillEl);
    b.appendChild(bar);
    var val = h('span', 'vstatval' + (st.total !== st.rolled ? ' up' : ''));
    if (st.lucky) { val.appendChild(pic(D.art.lucky, 16, 'vlucky')); val.appendChild(h('span', 'sr', D.t.lucky)); }
    val.appendChild(h('span', null, statValue(st.stat, st.total)));
    b.appendChild(val);
    b.addEventListener('click', function () { openStat(st, info); });
    li.appendChild(b);
    return li;
  }
  function openStat(st, info) {
    var list = [[D.t.rolled, statValue(st.stat, st.rolled)]];
    if (st.lucky) list[0][1] = D.t.lucky + ' · ' + list[0][1];
    if (st.family_bonus_percent) list.push([D.t.familyBonus, pct(st.family_bonus_percent), 'up']);
    // Wie monsterLevel(level) in der App: „Level 50“ und daneben der Bonus, nicht „Level 98 %“
    if (st.level_percent) list.push([fill(D.t.level, { level: num(shown.level.level) }), pct(st.level_percent), 'up']);
    var body = h('div', 'vsum');
    var dl = h('dl', 'rows');
    list.concat([[D.t.total, statValue(st.stat, st.total), 'up total']]).forEach(function (r) {
      var div = h('div'), dt = h('dt', null, r[0]), dd = h('dd', r[2] || null, r[1]);
      div.appendChild(dt); div.appendChild(dd); dl.appendChild(div);
    });
    body.appendChild(dl);
    body.classList.add('r-' + shown.rarity);
    openDialog(dialogHead(info.name, null, pic(info.icon, 40, 'vdart small')), body);
  }

  // ---------- Sechseck (wie StatHexagon: außen das Maximum, innen die Lage je Wert) ----------
  // Beschriftung in höchstens zwei Zeilen (wie maxLines 2 der App): lange Namen brechen am Leerzeichen oder Bindestrich nahe der Mitte
  function labelLines(text) {
    if (text.length <= 11) return [text];
    var best = -1;
    for (var i = 1; i < text.length - 1; i++) {
      if ((text[i] === ' ' || text[i] === '-') && (best < 0 || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2))) best = i;
    }
    if (best < 0) return [text];
    return [text.slice(0, text[best] === '-' ? best + 1 : best), text.slice(best + 1)];
  }
  function hexagon(stats) {
    var W = 360, H = 270, cx = W / 2, cy = H / 2, r = Math.min(W * 0.26, H * 0.38);
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'vhexsvg', role: 'img' });
    s.setAttribute('aria-label', stats.map(function (st) { return (D.stats[st.stat] || {}).name + ' ' + statValue(st.stat, st.total); }).join(', '));
    function corner(i, k) {
      var a = -Math.PI / 2 + i * Math.PI / 3;
      return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
    }
    function ring(k) {
      return stats.map(function (st, i) { var p = corner(i, k(i)); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    }
    [1 / 3, 2 / 3].forEach(function (k) { s.appendChild(svg('polygon', { points: ring(function () { return k; }), 'class': 'grid' })); });
    for (var i = 0; i < 6; i++) { var c = corner(i, 1); s.appendChild(svg('line', { x1: cx, y1: cy, x2: c[0].toFixed(1), y2: c[1].toFixed(1), 'class': 'grid' })); }
    s.appendChild(svg('polygon', { points: ring(function () { return 1; }), 'class': 'grid outer' }));
    var at = function (j) { return Math.max(0.04, Math.min(1, stats[j].position)); };
    s.appendChild(svg('polygon', { points: ring(at), 'class': 'area' }));
    stats.forEach(function (st, j) {
      var p = corner(j, at(j));
      if (st.lucky) s.appendChild(svg('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 6.4, 'class': 'lucky' }));
      s.appendChild(svg('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 3.4, 'class': 'dot' }));
      var q = corner(j, 1.2), dx = Math.cos(-Math.PI / 2 + j * Math.PI / 3);
      var lines = labelLines((D.stats[st.stat] || {}).name || st.stat), lh = 14;
      var t = svg('text', { x: q[0].toFixed(1), y: (q[1] - (lines.length - 1) * lh / 2).toFixed(1), 'class': 'label', 'text-anchor': dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle', 'dominant-baseline': 'middle' });
      lines.forEach(function (line, k) {
        var span = svg('tspan', { x: q[0].toFixed(1), dy: k ? lh : 0 });
        span.textContent = line;
        t.appendChild(span);
      });
      s.appendChild(t);
    });
    return s;
  }

  // ---------- Anzeige ----------
  function setTitle(name) { document.title = name ? name + ' · Ovalings' : baseTitle; }
  // Name oben links auf der Bühne, ohne Namen keine leere Überschrift
  function setName(text) { el.name.textContent = text || ''; el.name.hidden = !text; }
  function setFamily(fam) { setClass(el.stage, 'fam-', fam); }
  // Umschalter oben: „own“ zeigt die Eingabe (und Meldungen, eigene Ovalings), „examples“ die Knöpfe der Familien
  var mode = 'own';
  function setMode(m) {
    mode = m;
    // Pfeile und Punkte der Beispiele liegen auf der Bühne, nur mit Beispiel zu sehen
    [el.exPrev, el.exNext, el.exDots].forEach(function (n) { n.hidden = m !== 'examples'; });
    el.modes.setAttribute('data-on', m);
    el.modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    el.form.hidden = m !== 'own';
    el.fams.hidden = m !== 'examples';
    el.view.classList.toggle('ex', m === 'examples');
  }
  function showOnly(which) {
    el.msg.hidden = which !== 'msg';
    el.view.hidden = which !== 'view';
    // Mit Ovaling oder Beispiel: Eingabe so breit wie die Bühne (viewer.css). Mit Ovaling oder Meldung ohne Maskottchen und Satz
    // über der Eingabe (die Meldung hat ihr eigenes Maskottchen)
    document.documentElement.classList.toggle('vopen', which === 'view');
    el.form.classList.toggle('compact', which !== 'start');
    if (which !== 'view' && full) setFull(false);
    if (which !== 'view') el.live.textContent = '';
    syncActive();
  }
  function showStart() {
    state = 'start'; shown = null;
    setMode('own');
    setTitle(null);
    showOnly('start');
  }
  // Wartezeit aus Retry-After: bis dahin bleibt Erneut versuchen gesperrt und Ansehen fragt nicht neu, danach sagt der
  // Hinweis, dass es wieder geht (role=status liest das vor)
  var retryTimer = 0, retryUntil = 0;
  function showMessage(text, retry, wait) {
    state = 'error'; shown = null;
    setMode('own');
    setTitle(null);
    el.msgText.textContent = text;
    clearInterval(retryTimer);
    retryUntil = 0;
    el.retry.hidden = !retry;
    el.retry.disabled = false;
    if (retry && wait > 0) {
      el.retry.disabled = true;
      retryUntil = Date.now() + wait * 1000;
      retryTimer = setInterval(function () {
        if (Date.now() < retryUntil) return;
        clearInterval(retryTimer);
        retryUntil = 0;
        el.retry.disabled = false;
        if (state === 'error') el.msgText.textContent = D.t.retryNow;
      }, 250);
    }
    showOnly('msg');
    // War die Seite weiter unten (vorher ein Ovaling), kommen Feld und Meldung zurück in den Blick
    var head = document.getElementById('top'), top = head ? head.getBoundingClientRect().bottom : 0;
    var f = el.form.getBoundingClientRect();
    if (f.top < top) window.scrollTo(0, Math.max(0, window.pageYOffset + f.top - top - 8));
  }
  // Ansicht so scrollen, dass die Bühne mit Name, Figur und Vollbild ganz zwischen Kopf und Leiste steht (nur beim Öffnen
  // einer Adresse und nach Ansehen, sobald das Ovaling da ist, nicht beim Blättern durch die Beispiele)
  function revealStage() {
    var r = el.stage.getBoundingClientRect(), head = document.getElementById('top'), bar = document.querySelector('.tabbar');
    var top = head ? head.getBoundingClientRect().bottom : 0, bottom = window.innerHeight;
    if (bar && getComputedStyle(bar).display !== 'none') bottom = Math.min(bottom, bar.getBoundingClientRect().top);
    if (r.top >= top && r.bottom <= bottom) return;
    // Nur so weit wie nötig: passt die Bühne, bleibt darüber stehen, was noch Platz hat (Umschalter, Familien, Eingabe)
    var y = window.pageYOffset + (r.top < top || r.height > bottom - top - 16 ? r.top - top - 8 : r.bottom - bottom + 8);
    // Ab 40 px wird der Kopf zu Glas (site.js): darunter stünde der Titel halb unter dem noch durchsichtigen Kopf
    if (y > 0 && y < 48) y = 48;
    try { window.scrollTo({ top: Math.max(0, y), behavior: reduced ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, Math.max(0, y)); }
  }
  // Ohne die Daten der Sprache (Laden gescheitert) lädt Erneut versuchen die ganze Seite neu
  el.retry.addEventListener('click', function () { if (D) route(true, true); else location.reload(); });

  // Zuletzt gezeigtes Beispiel je Familie und zuletzt gezeigte Familie: der Umschalter und die Knöpfe der Familien kehren dorthin
  // zurück. Nur im Speicher der Seite, nichts im Browser
  var exFam = null, exAt = {};
  function renderExample(ex, reveal) {
    var g = ex.group, n = ex.n, count = g.list.length, o = g.list[n];
    state = 'example'; shown = null;
    exFam = g.family; exAt[g.family] = n;
    setMode('examples');
    el.famBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-fam') === g.family)); });
    showOnly('view');
    el.example.hidden = false;
    el.details.hidden = true;
    el.levelPill.hidden = true;
    // Name wie bei echten Ovalings: Beiname aus der ID, ohne ihn (alter Export) „Beispiel 3 von 8“
    var counter = fill(D.t.exampleCount, { n: num(n + 1), count: num(count) }), name = o.name || counter;
    setName(name);
    setTitle(name);
    setFamily(g.family);
    el.no3dEgg.src = (D.eggs[o.egg] || D.eggs.normal || {}).art || el.no3dEgg.src;
    clear(el.exDots);
    for (var i = 0; i < count; i++) el.exDots.appendChild(h('li', i === n ? 'on' : null));
    // Die Punkte sind nur Bild, Bildschirmleser hören Name und Nummer (aria-live, auch beim Blättern)
    el.exCount.textContent = o.name ? o.name + ', ' + counter : counter;
    el.exPrev.disabled = n === 0;
    el.exNext.disabled = n === count - 1;
    el.exPrev.onclick = function () { goExample(g.family, n - 1, el.exPrev); };
    el.exNext.onclick = function () { goExample(g.family, n + 1, el.exNext); };
    el.full.hidden = deviceNo3d;
    send3d(withGround({ kind: 'ovaling', id: o.id, room: 'family', entrance: true }, g.family));
    if (reveal) revealStage();
  }
  // Blättern und Familie wechseln ersetzen den Eintrag im Verlauf (Zurück führt nicht durch jedes Beispiel)
  function goExample(fam, n, btn) {
    history.replaceState(null, '', location.pathname + location.search + '#' + exampleHash(fam, n));
    route();
    // Am Ende der Beispiele wird der Pfeil gesperrt: der Fokus geht auf den anderen statt verloren
    if (btn && btn.disabled) (btn === el.exNext ? el.exPrev : el.exNext).focus();
  }

  function render(o) {
    shown = o; state = 'shown';
    setMode('own');
    var name = (o.epithet && (cfg.lang === 'de' ? o.epithet.de : o.epithet.en)) || (o.epithet && o.epithet.en) || 'Ovaling';
    setTitle(name);
    showOnly('view');
    el.example.hidden = true;
    el.details.hidden = false;
    setFamily(o.family);
    el.no3dEgg.src = (D.eggs[o.egg] || D.eggs.normal || {}).art || el.no3dEgg.src;
    setName(name);
    el.levelPill.textContent = fill(D.t.level, { level: num(o.level.level) });
    el.levelPill.hidden = false;
    el.full.hidden = deviceNo3d;
    // Ansage für Bildschirmleser, sobald das Ovaling da ist (nach Ansehen liegt der Fokus nicht mehr im Feld)
    el.live.textContent = name + ', ' + el.levelPill.textContent;

    // Kopf der Karte: Seltenheit, Familie mit Bonus, Gene Score
    setClass(el.card, 'r-', o.rarity);
    el.rarity.className = 'chip rar r-' + o.rarity;
    el.rarity.textContent = D.rarities[o.rarity] || o.rarity;
    el.family.className = 'chip fam vfam fam-' + o.family;
    el.familyName.textContent = (D.families[o.family] || {}).name || o.family;
    var fb = o.family_bonus;
    el.family.classList.toggle('nobonus', !fb);
    if (fb) {
      var st = D.stats[fb.stat] || { name: fb.stat };
      el.bonusIcon.src = st.icon;
      el.bonus.textContent = fill(D.t.bonus, { percent: num(fb.percent), stat: st.name });
    } else {
      el.bonus.textContent = '';
    }
    el.score.textContent = num(o.gene_score);

    // Level und Fortschritt
    var lv = o.level, maxed = lv.level >= lv.max_level || !lv.need;
    el.level.textContent = fill(D.t.level, { level: num(lv.level) });
    el.xp.textContent = maxed ? D.t.levelMax : fill(D.t.xp, { have: num(lv.have), need: num(lv.need) });
    widthClass(el.xpBar, maxed ? 1 : lv.have / lv.need);

    // Plätze
    setClass(el.slotsPanel, 'r-', o.rarity);
    clear(el.slots);
    (o.slots.attacks || []).forEach(function (s, i) { el.slots.appendChild(slotBox(i, s, false)); });
    el.slots.appendChild(slotBox(3, o.slots.passive || { state: 'locked' }, true));

    // Werte, Sechseck
    setClass(el.statsPanel, 'r-', o.rarity);
    clear(el.stats);
    o.stats.forEach(function (s) { el.stats.appendChild(statRow(s)); });
    clear(el.hex);
    setClass(el.hex, 'r-', o.rarity);
    el.hex.appendChild(hexagon(o.stats));

    // Steckbrief in der Sprache der Seite, sonst Englisch mit Hinweis, sonst weg
    var pr = o.profile;
    el.profile.hidden = !(pr && pr.text);
    if (pr && pr.text) {
      el.profileText.textContent = pr.text;
      el.profileText.lang = pr.lang;
      el.profileEn.hidden = pr.lang === cfg.lang;
    }

    // Mehr Infos
    var look = o.look || {}, skin = D.skins[look.skin] || look.skin || '';
    clear(el.skin);
    var kind = look.skin === 'rare_color' && look.rare_color ? (D.rareColors[look.rare_color] || skin) : (look.skin === 'color' ? null : skin);
    if (kind) el.skin.appendChild(h('span', 'vkind', kind + ' '));
    var tier = h('span', 'vtier r-' + (look.skin_tier || 'normal'), kind ? '(' + (D.rarities[look.skin_tier] || '') + ')' : (D.rarities[look.skin_tier] || ''));
    el.skin.appendChild(tier);
    el.egg.textContent = (D.eggs[o.egg] || {}).name || o.egg;
    el.hatched.textContent = date(o.hatched_at);
    el.rules.textContent = num(o.rules_version);
    el.id.textContent = o.id;
  }
  function date(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    try { return new Intl.DateTimeFormat(D.htmlLang, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d); }
    catch (e) { return m[0]; }
  }

  // ---------- Server (Plan 4.5 und 5.4) ----------
  function mockFetch(signal) {
    if (MOCK === 'offline') return Promise.reject(new TypeError('offline'));
    if (MOCK === 'timeout') {
      return new Promise(function (res, rej) {
        if (signal) signal.addEventListener('abort', function () { var e = new Error('abort'); e.name = 'AbortError'; rej(e); });
      });
    }
    return fetch(cfg.root + 'mock/' + MOCK + '.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      var body = j._body || j, status = j._status || 200, retry = j._retry;
      return { status: status, json: function () { return Promise.resolve(body); }, headers: { get: function (k) { return k === 'Retry-After' && retry != null ? String(retry) : null; } } };
    });
  }
  function request(id) {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 10000);
    var go = MOCK ? mockFetch(ctrl && ctrl.signal) : fetch(cfg.api, {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined,
      headers: { 'Content-Type': 'application/json', apikey: cfg.key },
      body: JSON.stringify({ kind: 'ovaling', id: id, lang: cfg.lang }),
    });
    return go.then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        return { status: r.status, body: body, retry: parseInt(r.headers.get('Retry-After') || '', 10) };
      });
    }, function () { return { status: 0, body: null, retry: NaN }; }).then(function (res) { clearTimeout(timer); return res; });
  }
  function loadOvaling(id, mine, reveal) {
    state = 'loading'; shown = null;
    setMode('own');
    showOnly('view');
    el.example.hidden = true;
    el.details.hidden = true;
    el.levelPill.hidden = true;
    el.full.hidden = true;
    setName(null);
    setClass(el.stage, 'fam-', null);
    el.stage.classList.remove('built');
    // Hinweis einer gescheiterten Figur gilt nur für sie, ohne 3D am Gerät bleibt er
    if (!deviceNo3d) hideNo3d();
    el.loading.hidden = deviceNo3d;
    ensureFrame();
    request(id).then(function (res) {
      if (mine !== gen) return;
      var body = res.body || {}, err = body.error;
      if (res.status === 200 && body.id && body.stats && body.slots) {
        render(body);
        send3d(withGround({ kind: 'ovaling', id: body.id, genes: (body.look && body.look.gene_overrides) || {}, room: 'family', entrance: true }, body.family));
        // Erst mit Antwort scrollen: bei einer Meldung (nicht gefunden, warten) bleibt das Feld zum Korrigieren im Blick
        if (reveal) revealStage();
      } else if (res.status === 404 || err === 'not_found') showMessage(D.t.notFound, false);
      else if (res.status === 429 || err === 'too_many') { var s1 = res.retry > 0 ? res.retry : 60; showMessage(fill(D.t.tooMany, { seconds: num(s1) }), true, s1); }
      else if (res.status === 503 || err === 'busy') { var s2 = res.retry > 0 ? res.retry : 30; showMessage(fill(D.t.busy, { seconds: num(s2) }), true, s2); }
      else if (err === 'rules_unknown') showMessage(D.t.rulesUnknown, false);
      else if (err === 'bad_id') showMessage(D.t.badFormat, false);
      else if (res.status === 0) showMessage(D.t.offline, true);
      else showMessage(D.t.failed, true);
    });
  }

  // ---------- Ablauf ----------
  // Sprachwahl im Kopf und im Fuß: die Links nehmen das gezeigte Ovaling oder Beispiel mit (wie data-keep-query in parents.js)
  var langLinks = Array.prototype.slice.call(document.querySelectorAll('a[data-lang]'));
  langLinks.forEach(function (a) { a.setAttribute('data-href', (a.getAttribute('href') || '').split('#')[0]); });
  function syncLangLinks() {
    var keep = routed && (EXAMPLE.test(routed) || validId(routed)) ? '#' + routed : '';
    langLinks.forEach(function (a) { a.setAttribute('href', a.getAttribute('data-href') + keep); });
  }
  var lastOwn = '';      // zuletzt gezeigtes Fragment unter „Eigenes Ovaling“ (leer, ID oder ungültige Eingabe)
  // reveal: nach dem Öffnen einer Adresse, Ansehen oder Erneut versuchen die Bühne in den Blick holen
  function route(force, reveal) {
    var raw = rawHash(), hash = raw.toLowerCase();
    if (pageAnchor(raw)) {
      // Sprung in der Seite, der am Klick vorbei kam (Adresse von Hand): Anzeige bleibt, die Adresse zeigt wieder das Gezeigte
      history.replaceState(null, '', location.pathname + location.search + (routed ? '#' + routed : ''));
      if (routed !== null) return;
      hash = '';
    }
    // Beispiele in der gültigen Schreibweise: alte Adressen (#example, #example-4) und zu große Nummern ersetzen den Eintrag
    var ex = exampleOf(hash);
    if (ex && ex.hash !== hash) {
      history.replaceState(null, '', location.pathname + location.search + '#' + ex.hash);
      hash = ex.hash;
    }
    if (!force && hash === routed && state !== 'start') return;
    routed = hash;
    clearInterval(retryTimer);
    retryUntil = 0;
    closeDialog();
    gen++;
    el.error.hidden = true;
    el.input.removeAttribute('aria-invalid');
    syncLangLinks();
    if (ex) { renderExample(ex, reveal); return; }
    // Eigenes Ovaling (auch leer oder ungültig): dorthin kehrt der Umschalter zurück
    lastOwn = hash;
    if (!hash) { showStart(); return; }
    el.input.value = hash;
    if (!validId(hash)) {
      el.input.setAttribute('aria-invalid', 'true');
      el.error.hidden = false;
      showStart();
      return;
    }
    loadOvaling(hash, gen, reveal);
  }
  // Umschalter: neuer Eintrag im Verlauf (Zurück führt zur vorigen Ansicht), zurück zum zuletzt Gezeigten der Ansicht.
  // Knöpfe der Familien: wie Blättern, mit dem zuletzt gezeigten Beispiel dieser Familie
  function go(hash, push) {
    var url = location.pathname + location.search + (hash ? '#' + hash : '');
    if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
    route();
  }
  // Vor den Daten (der Umschalter steht ab dem ersten Bild da): die Wahl gleich zeigen und ins Fragment schreiben, boot() zeigt
  // dann das Gewählte. Beispiele ohne Familie im Fragment (#example) werden dort zur ersten Familie
  function goEarly(hash, push) {
    var url = location.pathname + location.search + (hash ? '#' + hash : '');
    if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
    earlyView(hash);
  }
  el.modeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var m = b.getAttribute('data-mode');
      if (m === mode) return;
      // Der Umschalter bleibt, wo er angetippt wurde, auch wenn die Seite darunter kürzer oder länger wird
      var before = el.modes.getBoundingClientRect().top;
      var fam = exFam || (D ? D.examples[0].family : null);
      var hash = m === 'own' ? lastOwn : (fam ? exampleHash(fam, exAt[fam] || 0) : 'example');
      if (D) go(hash, true); else goEarly(hash, true);
      var shift = el.modes.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 1) window.scrollBy(0, shift);
    });
  });
  el.famBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var fam = b.getAttribute('data-fam');
      if (D && state === 'example' && fam === exFam) return;
      if (D) go(exampleHash(fam, exAt[fam] || 0), false); else goEarly(exampleHash(fam, 0), false);
    });
  });
  // Sprunglink (#main) und andere Anker in der Seite: springen und fokussieren, ohne das Fragment zu ändern. Sonst hielte
  // route() „main“ für eine ID und blendete das gezeigte Ovaling aus.
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    var target = a && pageAnchor(decode(a.getAttribute('href').slice(1)).trim());
    if (!target) return;
    e.preventDefault();
    if (!target.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  });

  // Bedienung der Eingabe: site.js prüft die Form und setzt das Fragment (hashchange lädt). Dieselbe ID noch einmal: nach
  // einem Fehler neu laden (nicht während der Wartezeit aus Retry-After), sonst die Bühne in den Blick holen
  el.form.addEventListener('submit', function () {
    var v = el.input.value.trim().toLowerCase();
    if (D && validId(v)) {
      setTimeout(function () {
        if (v !== routed) return;
        if (state === 'error') { if (Date.now() >= retryUntil) route(true, true); }
        else if (state === 'shown') revealStage();
      }, 0);
      el.input.blur();
    }
  });
  if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
    el.paste.hidden = false;
    el.paste.addEventListener('click', function () {
      navigator.clipboard.readText().then(function (text) {
        el.input.value = String(text || '').trim().slice(0, 64);
        if (el.form.requestSubmit) el.form.requestSubmit();
        else el.input.focus();
      }, function () { el.input.focus(); });
    });
  }
  // ID kopieren und Link teilen (Adresse mit der ID im Fragment)
  // Beschriftung einmal merken, sonst bliebe nach zwei schnellen Klicks „Kopiert“ stehen
  function flash(btn) {
    if (!btn.hasAttribute('data-label')) btn.setAttribute('data-label', btn.textContent);
    clearTimeout(btn.flashTimer);
    btn.textContent = btn.getAttribute('data-done');
    btn.flashTimer = setTimeout(function () { btn.textContent = btn.getAttribute('data-label'); }, 2200);
  }
  var canCopy = !!(navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext);
  el.copy.hidden = !canCopy;
  el.share.hidden = !(navigator.share || canCopy);
  el.copy.addEventListener('click', function () {
    if (shown) navigator.clipboard.writeText(shown.id).then(function () { flash(el.copy); }, function () {});
  });
  el.share.addEventListener('click', function () {
    if (!shown) return;
    var url = location.origin + location.pathname + '#' + shown.id;
    if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
    else navigator.clipboard.writeText(url).then(function () { flash(el.share); }, function () {});
  });

  // ?id= ins Fragment verschieben (Plan 0). Diese erste Anfrage mit ?id= hat der Host schon gesehen, aus den Protokollen
  // bleiben nur Links mit #. Eingabe, Teilen und Sprachwahl erzeugen deshalb nur Links mit #.
  var params = new URLSearchParams(location.search), qid = params.get('id');
  if (qid) {
    params.delete('id');
    var q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + '#' + qid.trim().toLowerCase());
  }
  // Erste Ansicht schon vor den Daten (Fund der Koordination 15.10.2026): bis viewer.<code>.json da ist (rund 110 KB), steht die
  // Seite schon so, wie sie danach aussieht, und nichts springt mehr. Der Umschalter steht ab dem ersten Bild da (viewer.css) und
  // zeigt die Ansicht des Fragments. Beispiel: ohne Eingabe, Familien und Bühne mit dem Ei zum Laden. ID: Eingabe ohne
  // Maskottchen und Satz, darunter die Bühne. Anderer Text: Eingabe mit dem Hinweis zur Form wie route(). Vorher schob der
  // Umschalter die Eingabe mit den Daten um 60 px nach unten, und bei geteilten Links mit ID verschwanden Maskottchen und Satz
  // wieder. Prüfung: node tool/site/viewer_shift_check.js
  var codes = (el.form.getAttribute('data-codes') || '').split(',').map(Number);
  var failed = false;     // Daten der Sprache nicht geladen: keine erste Ansicht mehr, nur der Hinweis
  function earlyView(hash) {
    var m = ID.exec(hash), ex = EXAMPLE.test(hash), id = !!m && codes.indexOf(parseInt(m[1], 16)) >= 0;
    var bad = !!hash && !ex && !id && !pageAnchor(hash), fam = /^example-(light|shadow)/.exec(hash);
    if (failed) return;
    // Eigenes Ovaling (auch leer oder ungültig): dorthin kehrt der Umschalter zurück, wie in route()
    if (!ex && !pageAnchor(hash)) lastOwn = hash;
    setMode(ex ? 'examples' : 'own');
    // Pfeile und Punkte erst mit dem Beispiel (renderExample), gewählt ist nur eine Familie, die im Fragment steht
    [el.exPrev, el.exNext, el.exDots].forEach(function (n) { n.hidden = true; });
    el.famBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(!!fam && b.getAttribute('data-fam') === fam[1])); });
    el.form.classList.toggle('compact', id);
    if (id || bad) el.input.value = hash;
    el.error.hidden = !bad;
    if (bad) el.input.setAttribute('aria-invalid', 'true'); else el.input.removeAttribute('aria-invalid');
    el.view.hidden = !(ex || id);
    document.documentElement.classList.toggle('vopen', ex || id);
    setFamily(fam ? fam[1] : null);
  }
  earlyView(readHash());
  // Gleiten erst ab jetzt: die erste Wahl steht ohne Bewegung (Stil einmal berechnen, dann .live)
  void getComputedStyle(el.modes, '::before').transform;
  el.modes.classList.add('live');
  // Marke für Prüfwerkzeuge (viewer_shift_check.js): viewer.js läuft, die erste Ansicht steht
  document.documentElement.setAttribute('data-viewer', 'early');
  window.addEventListener('hashchange', function () { if (D) route(false, true); else earlyView(readHash()); });
  // Zurück und Vor über Einträge des Umschalters (pushState): hashchange kommt dabei nicht in jedem Browser
  window.addEventListener('popstate', function () { if (D) route(false, false); else earlyView(readHash()); });

  function boot() {
    fetch(cfg.data).then(function (r) { if (!r.ok) throw new Error('data'); return r.json(); }).then(function (data) {
      D = data;
      route(true, true);
      // Marke für Prüfwerkzeuge (shoot_viewer.py, keys_check.js): Daten geladen, erste Anzeige gewählt
      document.documentElement.setAttribute('data-viewer', 'ready');
    }, function () {
      // Ohne die Texte der Sprache kein Betrachter: Hinweis wie offline, Erneut versuchen lädt die Seite neu. Umschalter und
      // Bühne der ersten Ansicht gehen weg, ohne Daten zeigen sie nichts
      failed = true;
      el.msgText.textContent = el.msg.getAttribute('data-offline');
      el.retry.hidden = false;
      el.msg.hidden = false;
      el.modes.hidden = true;
      el.view.hidden = true;
      document.documentElement.classList.remove('vopen');
      el.form.classList.add('compact');
    });
  }
  boot();
  if (reduced) document.documentElement.classList.add('vreduced');
})();
