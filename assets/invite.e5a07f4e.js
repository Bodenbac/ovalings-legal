// Event-Seite des Invite-Events (E245), Vorlage invite.html.j2. Liest die Rangliste über referral_board (öffentlich, nur
// Anzeigename und Zahl, angemeldet mit eigenem Platz) und füllt Podest (Platz 1 bis 3) und Liste. Angemeldet holt sie den
// eigenen Link über referral_mine, der Knopf teilt oder kopiert ihn. Abgemeldet führt der Knopf zum Registrieren.
(function () {
  'use strict';
  var A = window.OvalAuth, R = window.OvalReferral, C = A.cfg, T = C.text;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var status = $('[data-iv-status]'), shareBtn = $('[data-iv-share]'), copyBtn = $('[data-iv-copy]'), msg = $('[data-iv-msg]');
  var podium = $('[data-podium]'), list = $('[data-list]'), mine = $('[data-mine]'), empty = $('[data-empty]'), fail = $('[data-fail]');
  var loading = $('[data-loading]');

  function note(text) { msg.textContent = text || ''; msg.hidden = !text; }

  function showBoard(b) {
    loading.hidden = true;
    var st = b.status || {};
    status.textContent = R.eventText(st) + (C.lang === 'ja' ? '' : ' ') + T.ref.count;
    var rows = b.rows || [];
    empty.hidden = rows.length > 0;
    podium.hidden = rows.length === 0;
    for (var p = 1; p <= 3; p++) {
      var place = $('[data-place="' + p + '"]', podium), row = rows[p - 1];
      place.hidden = !row;
      if (!row) continue;
      $('[data-name]', place).textContent = row.name || '';
      $('[data-score]', place).textContent = R.count(row.score);
      place.classList.toggle('me', !!row.me);
    }
    list.textContent = '';
    rows.slice(3).forEach(function (row) {
      var li = document.createElement('li');
      if (row.me) li.className = 'me';
      var rank = document.createElement('span'), name = document.createElement('span'), score = document.createElement('span');
      rank.className = 'medal small'; rank.textContent = row.rank;
      name.className = 'ivname'; name.textContent = row.name || '';
      score.className = 'ivscore'; score.textContent = R.count(row.score);
      li.appendChild(rank); li.appendChild(name); li.appendChild(score);
      list.appendChild(li);
    });
    list.hidden = rows.length <= 3;
    var me = b.me, inRows = rows.some(function (r) { return r.me; });
    mine.hidden = !me || inRows;
    if (me && !inRows) {
      $('[data-mine-rank]').textContent = me.rank;
      $('[data-mine-score]').textContent = R.count(me.score);
    }
  }

  function load() {
    A.publicRpc('referral_board', { p_limit: 100 }).then(showBoard, function () { loading.hidden = true; fail.hidden = false; });
  }

  // Angemeldet: eigener Link aus referral_mine, Knopf teilt, Link darunter kopiert. Abgemeldet bleibt der Knopf ein Link zum
  // Registrieren und der Satz „Erstelle ein Konto …“ steht da
  var guestNote = $('[data-iv-guest]');
  if (A.signedIn()) {
    guestNote.hidden = true;
    A.rpc('referral_mine').then(function (m) {
      if (!m || !m.code || m.guest) return;
      var url = R.link(m.code);
      shareBtn.removeAttribute('href');
      shareBtn.setAttribute('role', 'button');
      shareBtn.setAttribute('tabindex', '0');
      var go = function (e) {
        e.preventDefault();
        R.share(url).then(function (r) { note(r === 'copied' ? T.ref.copied : r === 'failed' ? url : ''); });
      };
      shareBtn.addEventListener('click', go);
      shareBtn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
      copyBtn.hidden = false;
      copyBtn.addEventListener('click', function () { R.copy(url).then(function (r) { note(r === 'copied' ? T.ref.copied : url); }); });
    }, function () { /* ohne Stand bleibt der Knopf ein Link zum Konto */ });
  }
  load();
})();
