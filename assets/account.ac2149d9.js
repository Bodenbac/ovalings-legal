// Seite Anmelden und Registrieren (Luis 18.10.2026), Vorlage account.html.j2, Anmeldung über auth.js (OvalAuth). Prüft die
// Eingaben wie die App (E-Mail, Passwort ab 8 Zeichen, zweimal gleich, Geburtsjahr mit vier Ziffern und Mindestalter), Fehler
// mit den Texten der App. Nach Anmelden oder bestätigtem Link geht es zum Profil. Ohne Speicher (privates Fenster) gilt die
// Anmeldung nur, solange die Seite offen ist.
(function () {
  'use strict';
  var A = window.OvalAuth, T = A.cfg.text, R = window.OvalReferral;
  var views = document.querySelectorAll('[data-view]'), segs = document.querySelector('[data-segs]');
  var title = document.querySelector('[data-title]');
  var sentTo = '';

  function show(name) {
    for (var i = 0; i < views.length; i++) views[i].hidden = views[i].getAttribute('data-view') !== name;
    var tabbed = name === 'signin' || name === 'register';
    segs.hidden = !tabbed;
    if (tabbed) {
      segs.setAttribute('data-on', name);
      var b = segs.querySelectorAll('[data-seg]');
      for (var j = 0; j < b.length; j++) b[j].setAttribute('aria-pressed', String(b[j].getAttribute('data-seg') === name));
    }
    title.textContent = T.titles[name] || T.titles.signin;
    var v = document.querySelector('[data-view="' + name + '"]');
    var first = v && v.querySelector('input');
    if (first && document.activeElement && document.activeElement.tagName !== 'BODY') first.focus();
  }
  function errorOf(form, text) {
    var e = form.querySelector('[data-error]');
    e.textContent = text || ''; e.hidden = !text;
  }
  function message(code) { return T.errors[code] || T.errors.unknown; }
  function busy(form, on) {
    var b = form.querySelectorAll('button');
    for (var i = 0; i < b.length; i++) b[i].disabled = on;
  }
  function done(kind) {
    var d = T.done[kind] || T.done.signin;
    document.querySelector('[data-done-title]').textContent = d[0];
    document.querySelector('[data-done-text]').textContent = d[1];
    show('done');
    title.textContent = d[0];
  }
  var mail = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };

  segs.addEventListener('click', function (e) { var b = e.target.closest('[data-seg]'); if (b) show(b.getAttribute('data-seg')); });
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) show(b.getAttribute('data-go')); });

  // ----- Anmelden -----
  var signin = document.querySelector('[data-view="signin"]');
  signin.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = signin.email.value.trim(), pw = signin.password.value;
    if (!email) return errorOf(signin, T.errors.enter_email);
    if (!mail(email)) return errorOf(signin, T.errors.bad_email);
    if (!pw) return errorOf(signin, T.errors.enter_password);
    errorOf(signin, ''); busy(signin, true);
    A.signIn(email, pw, signin).then(function () { location.href = A.cfg.profile; }, function (x) {
      busy(signin, false);
      if (x.code === 'not_confirmed') { sentTo = email; document.querySelector('[data-email]').textContent = email; show('sent'); return; }
      errorOf(signin, message(x.code));
    });
  });

  // ----- Registrieren -----
  var reg = document.querySelector('[data-view="register"]');
  // Wer hat dich eingeladen? (E245): Vorschläge beim Tippen, Name aus dem Einladungslink vorgefüllt
  var inviter = reg.inviter, fromLink = reg.querySelector('[data-from-link]'), invite = R.readInvite();
  var sugg = R.attach(inviter, reg.querySelector('[data-sugg]'));
  function linkNote() {
    var on = !!(invite && invite.name && R.norm(inviter.value).toLowerCase() === invite.name.toLowerCase());
    fromLink.hidden = !on;
    if (on) fromLink.textContent = R.fill(T.ref.fromLink, { name: invite.name });
  }
  inviter.addEventListener('input', linkNote);
  inviter.addEventListener('change', linkNote);
  function prefill() {
    if (!invite) return;
    var put = function (name) { if (name && !inviter.value) { inviter.value = name; linkNote(); } };
    if (invite.name) { put(invite.name); return; }
    R.nameForCode(invite.code).then(function (name) {
      if (!name) return;
      invite.name = name; R.saveInvite(invite); put(name);
    });
  }
  // Angabe für die Metadaten: Code, solange der Name aus dem Link unverändert im Feld steht, sonst der geprüfte Name
  function referral() {
    var text = R.norm(inviter.value);
    if (!text) return Promise.resolve(null);
    if (invite && invite.name && text.toLowerCase() === invite.name.toLowerCase()) return Promise.resolve({ referred_by: invite.code });
    return R.resolve(text).then(function (name) { return { referred_by_name: name }; });
  }
  reg.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = reg.email.value.trim(), pw = reg.password.value, pw2 = reg.password2.value, y = reg.year.value.trim();
    var now = new Date().getFullYear();
    if (!email) return errorOf(reg, T.errors.enter_email);
    if (!mail(email)) return errorOf(reg, T.errors.bad_email);
    if (pw.length < 8) return errorOf(reg, T.errors.password_min);
    if (pw !== pw2) return errorOf(reg, T.errors.passwords_differ);
    if (!/^\d{4}$/.test(y) || +y < now - 120 || +y > now) return errorOf(reg, T.errors.year);
    // Wie AgeRules.canRegister: Alter aus dem Jahr allein (Jahr jetzt minus Geburtsjahr)
    if (now - +y < A.cfg.minAge) return errorOf(reg, T.errors.too_young);
    errorOf(reg, ''); busy(reg, true); sugg.clear();
    var extra = null;
    referral().then(function (r) {
      extra = r;
      inviter.removeAttribute('aria-invalid');
      return A.signUp(email, pw, +y, r, reg);
    }, function (x) { inviter.setAttribute('aria-invalid', 'true'); inviter.focus(); throw x; }).then(function (b) {
      busy(reg, false);
      if (extra && extra.referred_by) R.clearInvite();
      // Mit Sitzung (Bestätigung aus) gleich weiter, sonst Hinweis auf den Link
      if (b && b.access_token) { location.href = A.cfg.profile; return; }
      sentTo = email; document.querySelector('[data-email]').textContent = email; show('sent');
    }, function (x) { busy(reg, false); errorOf(reg, message(x.code)); });
  });

  // ----- Link erneut senden (höchstens alle 60 s) -----
  var resend = document.querySelector('[data-resend]'), sent = document.querySelector('[data-view="sent"]');
  resend.addEventListener('click', function () {
    if (!sentTo) return;
    resend.disabled = true;
    A.resend(sentTo, sent).then(function () { errorOf(sent, T.resent); }, function (x) { errorOf(sent, message(x.code)); });
    var left = 60, base = resend.textContent;
    var tick = setInterval(function () {
      left--; resend.textContent = left > 0 ? T.resendWait.replace('{seconds}', String(left)) : base;
      if (left <= 0) { clearInterval(tick); resend.disabled = false; }
    }, 1000);
  });

  // ----- Passwort vergessen -----
  var forgot = document.querySelector('[data-view="forgot"]');
  forgot.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = forgot.email.value.trim();
    if (!email) return errorOf(forgot, T.errors.enter_email);
    if (!mail(email)) return errorOf(forgot, T.errors.bad_email);
    busy(forgot, true);
    // Immer dieselbe Antwort, ob es das Konto gibt oder nicht (wie die App)
    A.recover(email, forgot).then(function () { busy(forgot, false); errorOf(forgot, ''); done('reset_sent'); },
      function (x) { busy(forgot, false); errorOf(forgot, message(x.code)); });
  });

  // ----- Neues Passwort nach dem Link -----
  var rec = document.querySelector('[data-view="recovery"]');
  rec.addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = rec.password.value, pw2 = rec.password2.value;
    if (pw.length < 8) return errorOf(rec, T.errors.password_min);
    if (pw !== pw2) return errorOf(rec, T.errors.passwords_differ);
    busy(rec, true);
    A.setPassword(pw).then(function () { busy(rec, false); done('password'); },
      function (x) { busy(rec, false); errorOf(rec, message(x.code)); });
  });

  // ----- Start: Link aus einer Mail, sonst Anmelden oder #register -----
  var want = location.hash.slice(1);
  A.takeLink().then(function (r) {
    if (r && r.error) { show('signin'); errorOf(signin, T.errors.link_expired); return; }
    if (r && r.kind === 'recovery') { show('recovery'); return; }
    if (r && r.kind === 'email_change') { done('email'); return; }
    if (r && r.kind === 'email_half') { done('email_half'); return; }
    if (r) { done('confirmed'); return; }
    if (A.signedIn()) { location.replace(A.cfg.profile); return; }
    // Einladungslink (E245, ?invite=1 von join.js) oder gemerkte Einladung: gleich Registrieren mit vorgefülltem Namen
    var invited = invite || /(^|[?&])invite=1(&|$)/.test(location.search.slice(1));
    show(want === 'register' || invited ? 'register' : 'signin');
    prefill();
    segs.classList.add('live');
  });
  // Link aus der Mail in einem schon offenen Tab (nur der Anker ändert sich): neu laden, damit takeLink ihn übernimmt
  window.addEventListener('hashchange', function () {
    if (/(^|&)(access_token|error|error_code|message)=/.test(location.hash.slice(1))) location.reload();
  });
})();
