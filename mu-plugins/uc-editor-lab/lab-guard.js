/* UC Editor Lab — lab-guard.js (owner: Agent C)
 * Safety net for the lab page: nothing on this page may write to the site.
 * Must load in <head> before any other script.
 *
 * Rules:
 *  - The only network writes allowed are POST/GET to admin-ajax.php with action ∈ ALLOW (read-only endpoints;
 *    in real mode — admin + &live=1, see REAL below — plus exactly the 6 save actions of the old editor).
 *  - Any other admin-ajax call is blocked. That includes an unknown action, a missing action, and an
 *    action in the URL query that differs from the one in the body.
 *  - Any non-GET request to anywhere else is blocked: same-origin (wp-json, admin-post, wp-comments-post,
 *    the lab URL…) and cross-origin.
 *  - Native form submission (submit event / form.submit()) is blocked unless the form has data-lab-ok
 *    AND its method is GET to a non-admin URL. JS submit handlers still run; only the browser's
 *    navigation/POST is cancelled.
 *  - Each block: console.warn('[LAB GUARD] …') + red toast + entry in window.UCLabGuard.log.
 *  - Blocked fetch resolves to a JSON Response {success:false,data:'LAB: blocked <action>'}.
 *    Blocked XHR is re-pointed at a data: URL carrying the same JSON, so callers get a normal
 *    'load' (no hung promises). Blocked sendBeacon returns false.
 */
(function () {
  'use strict';
  if (window.UCLabGuard) return;

  var READ_ONLY = ['achord_live_preview', 'achord_search_songs'];
  // Real mode (round 5): admins only, opt-in with &live=1. The PHP prints
  // <script id="uc-lab-guard-real">window.UC_LAB_GUARD_REAL=true</script> immediately before this file,
  // and only then. Read ONCE here and frozen: a later script setting the flag has no effect.
  var REAL_ACTIONS = ['achord_submit_song', 'achord_notebook_save_song', 'achord_notebook_publish_song',
    'achord_save_personal_version', 'achord_submit_proposal', 'achord_delete_personal_version'];
  var REAL = false;
  try {
    var me = document.currentScript, prev = me && me.previousElementSibling;
    REAL = window.UC_LAB_GUARD_REAL === true && !!prev && prev.tagName === 'SCRIPT' &&
      prev.id === 'uc-lab-guard-real' && !prev.src;
  } catch (e) { REAL = false; }
  try { Object.defineProperty(window, 'UC_LAB_GUARD_REAL', { value: REAL, writable: false, configurable: false }); } catch (e) {}
  var ALLOW = Object.freeze(READ_ONLY.concat(REAL ? REAL_ACTIONS : []));
  var LOG = [];

  /* ── helpers ─────────────────────────────────────────── */
  function toURL(u) {
    try { return new URL(String(u && u.url ? u.url : u), location.href); } catch (e) { return null; }
  }
  function isAjax(url) { return !!url && /\/admin-ajax\.php$/.test(url.pathname); }
  function isAdminish(url) {
    return !!url && (/\/wp-admin\//.test(url.pathname) || /\/wp-login\.php$/.test(url.pathname) ||
      /\/wp-json\//.test(url.pathname) || url.searchParams.has('rest_route') ||
      /\/xmlrpc\.php$/.test(url.pathname) || /\/wp-comments-post\.php$/.test(url.pathname));
  }
  function actionFromString(s) {
    s = String(s || '');
    var m = s.match(/(?:^|&)action=([^&]*)/);
    if (m) { try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; } }
    // multipart text (e.g. a Blob built by hand): name="action"\r\n\r\nvalue
    var mm = s.match(/name="action"\r?\n\r?\n([^\r\n]*)/);
    return mm ? mm[1] : '';
  }
  /** sync body → action. Returns undefined if the body can't be read synchronously (Blob/stream). */
  function actionOfSync(body) {
    if (body == null) return '';
    try {
      if (typeof FormData !== 'undefined' && body instanceof FormData) return String(body.get('action') || '');
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return String(body.get('action') || '');
      if (typeof body === 'string') return actionFromString(body);
      if (body instanceof ArrayBuffer) return actionFromString(new TextDecoder().decode(body));
      if (ArrayBuffer.isView && ArrayBuffer.isView(body)) return actionFromString(new TextDecoder().decode(body));
      if (typeof Blob !== 'undefined' && body instanceof Blob) return undefined;
      if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return undefined;
      if (typeof Document !== 'undefined' && body instanceof Document) return '';
    } catch (e) {}
    return undefined;
  }
  function actionOfAsync(body) {
    var a = actionOfSync(body);
    if (a !== undefined) return Promise.resolve(a);
    if (typeof Blob !== 'undefined' && body instanceof Blob) return body.text().then(actionFromString, function () { return '?'; });
    return Promise.resolve('?'); // stream / unknown → treated as not allowed
  }
  /** Decision. method upper-case; bodyAction = string ('' = none). Returns null if allowed, else reason. */
  function decide(method, url, bodyAction) {
    if (!url) return method === 'GET' || method === 'HEAD' ? null : 'unparseable-url';
    if (isAjax(url)) {
      var qa = url.searchParams.get('action') || '';
      var acts = [qa, bodyAction].filter(Boolean);
      if (!acts.length) return 'admin-ajax without action';
      for (var i = 0; i < acts.length; i++) if (ALLOW.indexOf(acts[i]) === -1) return acts[i];
      return null;
    }
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
    return method + ' ' + (url.origin === location.origin ? url.pathname : url.origin + url.pathname);
  }

  /* ── reporting ───────────────────────────────────────── */
  var toastQ = [];
  function toast(msg) {
    if (!document.body) { toastQ.push(msg); return; }
    var el = document.getElementById('uc-lab-guard-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uc-lab-guard-toast';
      el.setAttribute('role', 'alert');
      el.setAttribute('dir', 'rtl');
      el.style.cssText = 'position:fixed;inset-inline:12px;top:12px;z-index:2147483647;background:#b3261e;color:#fff;' +
        'font:600 15px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);' +
        'pointer-events:none;transition:opacity .25s;opacity:0';
      document.body.appendChild(el);
    }
    el.textContent = '🛑 מעבדה: בקשת-שמירה נחסמה (' + msg + '). שום דבר לא נשלח.';
    el.style.opacity = '1';
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.style.opacity = '0'; }, 3500);
  }
  document.addEventListener('DOMContentLoaded', function () {
    while (toastQ.length) toast(toastQ.shift());
  });
  function report(kind, method, url, reason) {
    var entry = { kind: kind, method: method, url: url ? url.href : '', reason: reason, t: Date.now() };
    LOG.push(entry);
    try { console.warn('[LAB GUARD] blocked ' + kind + ' ' + method + ' ' + entry.url + ' → ' + reason); } catch (e) {}
    toast(reason);
  }
  function fakeResponse(reason) {
    return new Response(JSON.stringify({ success: false, data: 'LAB: blocked ' + reason }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  /* ── fetch ───────────────────────────────────────────── */
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var args = arguments;
      var isReq = typeof Request !== 'undefined' && input instanceof Request;
      var url = toURL(isReq ? input.url : input);
      var method = String((init && init.method) || (isReq ? input.method : 'GET')).toUpperCase();
      var bodyP;
      if (init && 'body' in init) bodyP = actionOfAsync(init.body);
      else if (isReq && method !== 'GET' && method !== 'HEAD') {
        bodyP = input.clone().text().then(actionFromString, function () { return '?'; });
      } else bodyP = Promise.resolve('');
      // Fast path: GET to a non-ajax URL never needs the body.
      if ((method === 'GET' || method === 'HEAD') && !isAjax(url)) return origFetch.apply(window, args);
      return bodyP.then(function (act) {
        var reason = decide(method, url, act);
        if (reason) { report('fetch', method, url, reason); return fakeResponse(reason); }
        return origFetch.apply(window, args);
      });
    };
  }

  /* ── XMLHttpRequest (also covers jQuery.ajax) ───────── */
  var XP = window.XMLHttpRequest && XMLHttpRequest.prototype;
  if (XP) {
    var origOpen = XP.open, origSend = XP.send;
    XP.open = function (m, u) {
      this.__labMethod = String(m || 'GET').toUpperCase();
      this.__labUrl = toURL(u);
      return origOpen.apply(this, arguments);
    };
    function fakeXhr(xhr, reason) {
      var json = JSON.stringify({ success: false, data: 'LAB: blocked ' + reason });
      try { origOpen.call(xhr, 'GET', 'data:application/json;charset=utf-8,' + encodeURIComponent(json), true); origSend.call(xhr, null); }
      catch (e) { try { xhr.abort(); } catch (e2) {} }
    }
    XP.send = function (body) {
      var xhr = this, args = arguments, method = xhr.__labMethod || 'GET', url = xhr.__labUrl;
      var act = actionOfSync(body);
      if (act !== undefined) {
        var reason = decide(method, url, act);
        if (reason) { report('xhr', method, url, reason); fakeXhr(xhr, reason); return; }
        return origSend.apply(xhr, args);
      }
      // Blob/stream body: decide asynchronously, then send or abort.
      actionOfAsync(body).then(function (a) {
        var r = decide(method, url, a);
        if (r) { report('xhr', method, url, r); fakeXhr(xhr, r); return; }
        origSend.apply(xhr, args);
      });
    };
  }

  /* ── navigator.sendBeacon (always a POST) ───────────── */
  if (navigator.sendBeacon) {
    var origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, data) {
      var url = toURL(u);
      var act = actionOfSync(data);
      var reason = act === undefined ? 'beacon with unreadable body' : decide('POST', url, act);
      if (reason) { report('beacon', 'POST', url, reason); return false; }
      return origBeacon(u, data);
    };
  }

  /* ── native form submission ─────────────────────────── */
  function formVerdict(form, submitter) {
    var method = String((submitter && submitter.getAttribute && submitter.getAttribute('formmethod')) ||
      form.getAttribute('method') || 'GET').toUpperCase();
    var action = (submitter && submitter.getAttribute && submitter.getAttribute('formaction')) ||
      form.getAttribute('action') || location.href;
    var url = toURL(action);
    if (!form.hasAttribute('data-lab-ok')) return { reason: 'form submit (no data-lab-ok)', method: method, url: url };
    if (method !== 'GET' || isAjax(url) || isAdminish(url)) return { reason: 'form ' + method + ' ' + (url ? url.pathname : '?'), method: method, url: url };
    return null;
  }
  // Capture phase, registered first: cancel the browser's default only. Page handlers still run.
  document.addEventListener('submit', function (e) {
    var v = formVerdict(e.target, e.submitter);
    if (v) { e.preventDefault(); report('form', v.method, v.url, v.reason); }
  }, true);
  if (window.HTMLFormElement) {
    var origSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      var v = formVerdict(this, null);
      if (v) { report('form.submit()', v.method, v.url, v.reason); return; }
      return origSubmit.apply(this, arguments);
    };
  }

  window.UCLabGuard = Object.freeze({
    real: REAL,
    allow: Object.freeze(ALLOW.slice()),
    log: LOG,
    decide: function (method, url, action) { return decide(String(method).toUpperCase(), toURL(url), action || ''); }
  });
})();
