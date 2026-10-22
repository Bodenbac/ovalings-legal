// Anmeldung auf der Website (Luis 18.10.2026): dasselbe Supabase-Auth wie die App, ohne fremde Bibliothek, nur fetch gegen
// /auth/v1 (GoTrue), /rest/v1 (PostgREST mit RLS) und /functions/v1. Die Sitzung liegt im lokalen Speicher unter
// ovalings.session (für die Anmeldung nötig, § 25 Abs. 2 Nr. 2 TDDDG, Datenschutz Abschnitt 4), Porträts als Zwischenspeicher
// unter ovalings.portraits. Abmelden leert beides. Bestätigungs- und Passwort-Links kommen ohne PKCE als Anker zurück
// (#access_token=…&refresh_token=…&type=signup|recovery|email_change), takeLink() übernimmt sie. Geld, Ovalings und Belohnungen
// schreibt die Website nie, sie liest nur über RLS und ruft die Functions der App auf (display-name, delete-account).
// Konfiguration aus dem JSON-Block #authcfg (kein Inline-Skript unter der CSP).
(function () {
  'use strict';
  var KEY = 'ovalings.session', PICS = 'ovalings.portraits';
  var cfg = JSON.parse(document.getElementById('authcfg').textContent);

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) { /* ohne Speicher nur für diese Seite */ } }
  var session = load();

  // Fehler als Code: aus error_code von GoTrue, sonst aus Status und Text. Die Seiten zeigen dazu die Texte der App
  function Fail(code, status) { this.code = code; this.status = status; }
  function codeOf(status, body) {
    var c = (body && (body.error_code || body.code || body.error)) || '';
    var msg = ((body && (body.msg || body.message || body.error_description)) || '').toLowerCase();
    // Freunde werben (E245, referral_set): Hinweise der Datenbank als eigene Codes
    var hint = body && body.hint;
    if (hint === 'not_found') return 'no_player';
    if (hint === 'already' || hint === 'too_late' || hint === 'cycle' || hint === 'own_code') return hint;
    if (status === 429 || c === 'over_request_rate_limit' || c === 'over_email_send_rate_limit') return 'too_many';
    if (c === 'invalid_credentials' || msg.indexOf('invalid login') >= 0) return 'wrong_login';
    if (c === 'email_not_confirmed') return 'not_confirmed';
    if (c === 'user_already_exists' || c === 'email_exists') return 'exists';
    if (c === 'weak_password') return 'weak_password';
    if (c === 'same_password') return 'same_password';
    if (c === 'reauthentication_needed') return 'reauth';
    if (c === 'signup_disabled' || c === 'email_provider_disabled') return 'disabled';
    if (c === 'user_banned') return 'banned';
    if (c === 'email_address_invalid' || c === 'validation_failed') return 'bad_email';
    if (c === 'captcha_failed') return 'captcha_failed';
    if (msg.indexOf('age') >= 0 || (body && body.hint === 'age') || msg.indexOf('too young') >= 0) return 'too_young';
    if (c === 'name_length' || c === 'name_phone' || c === 'name_rejected' || c === 'not_signed_in') return c;
    // Eindeutige Namen und Regeln fürs Umbenennen (UX App 22, Edge Function display-name)
    if (c === 'name_taken' || c === 'name_wait' || c === 'not_enough_diamonds') return c;
    if (status === 401 || status === 403 || c === 'bad_jwt' || c === 'session_not_found') return 'not_signed_in';
    if (status >= 500 && msg.indexOf('database error saving new user') >= 0) return 'too_young';
    return 'unknown';
  }

  function request(path, opt) {
    opt = opt || {};
    var headers = { apikey: cfg.key, 'Content-Type': 'application/json' };
    if (opt.token) headers.Authorization = 'Bearer ' + opt.token;
    if (opt.headers) for (var h in opt.headers) headers[h] = opt.headers[h];
    return fetch(cfg.url + path, { method: opt.method || 'GET', headers: headers, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .catch(function () { throw new Fail('offline', 0); })
      .then(function (r) {
        return r.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
          if (!r.ok) throw new Fail(codeOf(r.status, body), r.status);
          return body;
        });
      });
  }

  function keep(body) {
    if (!body || !body.access_token) return null;
    session = { access_token: body.access_token, refresh_token: body.refresh_token,
                expires_at: body.expires_at || Math.floor(Date.now() / 1000) + (+body.expires_in || 3600),
                user: body.user ? { id: body.user.id, email: body.user.email, new_email: body.user.new_email || null } : (session && session.user) };
    save(session);
    return session;
  }

  function signOutLocal() {
    session = null; save(null);
    try { localStorage.removeItem(PICS); } catch (e) { /* nichts gespeichert */ }
    // Knopf oben rechts wieder auf Anmelden (site.js setzt ihn nur beim Laden)
    var pill = document.querySelector('[data-acct]');
    if (pill && pill.hasAttribute('data-out-href')) {
      pill.href = pill.getAttribute('data-out-href');
      pill.querySelector('[data-acct-label]').textContent = pill.getAttribute('data-out-label');
    }
  }

  // Gültiges Zugriffs-Token, eine Minute vor Ablauf erneuert. Ohne Sitzung oder mit abgelaufenem Erneuerungs-Token null
  var refreshing = null;
  function token() {
    if (!session) return Promise.resolve(null);
    if (session.expires_at - 60 > Date.now() / 1000) return Promise.resolve(session.access_token);
    if (!refreshing) {
      refreshing = request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
        .then(function (b) { refreshing = null; return keep(b) ? session.access_token : null; },
              function (e) { refreshing = null; if (e.code !== 'offline') signOutLocal(); throw e; });
    }
    return refreshing;
  }
  function authed(path, opt) {
    return token().then(function (t) {
      if (!t) throw new Fail('not_signed_in', 401);
      opt = opt || {}; opt.token = t;
      return request(path, opt);
    });
  }

  // Öffentliche Aufrufe ohne Anmeldung (E245): referral_status, referral_board, Function referral-search
  function anon(path, body) { return request(path, { method: 'POST', body: body || {} }); }

  // Captcha (Cloudflare Turnstile, E245): nur mit Sitekey beim Bauen (cfg.turnstile) und nur, solange der Server es verlangt
  // (referral_status.captcha, mit dem Start des Invite-Events). Ohne Antwort des Servers lieber mit Captcha. Das Widget steht im
  // Kasten [data-captcha] des Formulars, das Token gilt einmal und geht als gotrue_meta_security.captcha_token an Supabase.
  var tsLoad = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!tsLoad) {
      tsLoad = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = function () { resolve(window.turnstile); };
        s.onerror = function () { tsLoad = null; reject(new Fail('captcha_offline', 0)); };
        document.head.appendChild(s);
      });
    }
    return tsLoad;
  }
  function captcha(form) {
    if (!cfg.turnstile) return Promise.resolve(null);
    return anon('/rest/v1/rpc/referral_status').then(function (st) { return !!(st && st.captcha); }, function () { return true; })
      .then(function (on) {
        if (!on) return null;
        return loadTurnstile().then(function (ts) {
          return new Promise(function (resolve, reject) {
            var box = form && form.querySelector('[data-captcha]');
            if (!box) {
              box = document.createElement('div'); box.className = 'captchabox'; box.setAttribute('data-captcha', '');
              (form || document.body).appendChild(box);
            }
            box.textContent = ''; box.hidden = false;
            var slot = document.createElement('div'); box.appendChild(slot);
            var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
              (!document.documentElement.getAttribute('data-theme') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
            var done = function () { setTimeout(function () { box.hidden = true; box.textContent = ''; }, 0); };
            ts.render(slot, {
              sitekey: cfg.turnstile, language: cfg.lang, theme: dark ? 'dark' : 'light',
              callback: function (t) { done(); resolve(t); },
              'error-callback': function () { done(); reject(new Fail('captcha_failed', 0)); },
              'timeout-callback': function () { done(); reject(new Fail('captcha_failed', 0)); }
            });
          });
        });
      });
  }
  function withCaptcha(body, token) { if (token) body.gotrue_meta_security = { captcha_token: token }; return body; }

  // Ohne eigenen Anker: Supabase hängt die Sitzung als Anker an (type sagt, welcher Link es war)
  function redirect() { return '?redirect_to=' + encodeURIComponent(cfg.redirect); }

  // Anker aus einem Link der Mails: Sitzung übernehmen und den Anker aus der Adresse nehmen. Ergebnis: Art des Links
  // (signup, recovery, email_change, magiclink), ein Fehler ({ error: 'otp_expired' }) oder null
  function takeLink() {
    var h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
    var err = h.get('error_code') || q.get('error_code') || h.get('error') || q.get('error');
    var tidy = function () { try { history.replaceState(null, '', location.pathname); } catch (e) { /* alte Browser */ } };
    if (err) { tidy(); return Promise.resolve({ error: err }); }
    // Sicherer E-Mail-Wechsel: der erste von zwei Links bringt nur eine Meldung, die Sitzung kommt mit dem zweiten
    if (h.get('message') && !h.get('access_token')) { tidy(); return Promise.resolve({ kind: 'email_half' }); }
    if (!h.get('access_token')) return Promise.resolve(null);
    var kind = h.get('type') || 'signup';
    keep({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_at: +h.get('expires_at') || 0,
           expires_in: +h.get('expires_in') || 3600 });
    tidy();
    return request('/auth/v1/user', { token: session.access_token }).then(function (u) {
      session.user = { id: u.id, email: u.email, new_email: u.new_email || null }; save(session);
      return { kind: kind };
    }, function () { signOutLocal(); return { error: 'otp_expired' }; });
  }

  window.OvalAuth = {
    cfg: cfg, Fail: Fail,
    signedIn: function () { return !!session; },
    user: function () { return session && session.user; },
    takeLink: takeLink,
    // form: Formular mit dem Kasten [data-captcha] für das Captcha (E245), sonst unten auf der Seite
    signIn: function (email, password, form) {
      return captcha(form).then(function (tk) {
        return request('/auth/v1/token?grant_type=password', { method: 'POST', body: withCaptcha({ email: email, password: password }, tk) });
      }).then(keep);
    },
    // Metadaten wie die App (birth_year, locale), dazu signup_source: 'web', damit sich Konten aus der Werbephase zählen lassen.
    // extra (E245): referred_by (Code aus dem Einladungslink) oder referred_by_name (Name aus dem Feld)
    signUp: function (email, password, birthYear, extra, form) {
      var data = { birth_year: birthYear, locale: cfg.lang, signup_source: 'web' };
      if (extra) for (var k in extra) data[k] = extra[k];
      return captcha(form).then(function (tk) {
        return request('/auth/v1/signup' + redirect(), { method: 'POST', body: withCaptcha({ email: email, password: password, data: data }, tk) });
      }).then(function (b) { keep(b); return b; });
    },
    resend: function (email, form) {
      return captcha(form).then(function (tk) { return request('/auth/v1/resend' + redirect(), { method: 'POST', body: withCaptcha({ type: 'signup', email: email }, tk) }); });
    },
    recover: function (email, form) {
      return captcha(form).then(function (tk) { return request('/auth/v1/recover' + redirect(), { method: 'POST', body: withCaptcha({ email: email }, tk) }); });
    },
    setPassword: function (password) { return authed('/auth/v1/user', { method: 'PUT', body: { password: password } }); },
    // Neue E-Mail: Supabase schickt den Link (bei sicherem Wechsel an beide Adressen), gültig erst nach der Bestätigung
    setEmail: function (email) {
      return authed('/auth/v1/user' + redirect(), { method: 'PUT', body: { email: email, data: { locale: cfg.lang } } }).then(function (u) {
        if (session && u) { session.user.new_email = u.new_email || null; save(session); }
        return u;
      });
    },
    signOut: function () {
      var done = function () { signOutLocal(); };
      return authed('/auth/v1/logout?scope=local', { method: 'POST' }).then(done, done);
    },
    signOutLocal: signOutLocal,
    rest: function (path) { return authed('/rest/v1/' + path); },
    rpc: function (name, args) { return authed('/rest/v1/rpc/' + name, { method: 'POST', body: args || {} }); },
    // Öffentliche Funktion: angemeldet mit Token (dann auch der eigene Stand), sonst ohne
    publicRpc: function (name, args) {
      return session ? authed('/rest/v1/rpc/' + name, { method: 'POST', body: args || {} }).catch(function (e) {
        if (e.code === 'not_signed_in') return anon('/rest/v1/rpc/' + name, args);
        throw e;
      }) : anon('/rest/v1/rpc/' + name, args);
    },
    // Edge Function ohne Anmeldung (referral-search)
    publicFn: function (name, body) { return anon('/functions/v1/' + name, body); },
    fn: function (name, body) { return authed('/functions/v1/' + name, { method: 'POST', body: body || {} }); },
    portraits: {
      get: function (key) { try { return (JSON.parse(localStorage.getItem(PICS) || '{}'))[key] || null; } catch (e) { return null; } },
      put: function (key, data) {
        try {
          var all = JSON.parse(localStorage.getItem(PICS) || '{}'), keys = Object.keys(all);
          // höchstens 120 Bilder (je rund 10 KB), die ältesten zuerst raus
          while (keys.length >= 120) delete all[keys.shift()];
          all[key] = data; localStorage.setItem(PICS, JSON.stringify(all));
        } catch (e) { /* Speicher voll: Bild nur für diese Seite */ }
      }
    }
  };
})();
