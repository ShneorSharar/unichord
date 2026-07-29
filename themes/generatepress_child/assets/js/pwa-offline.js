/*
 * unichord — שמירת שירים לאופליין (opt-in מפורש)
 * מדבר עם ה-Service Worker דרך MessageChannel. אוסף את הנכסים שהעמוד טען
 * בפועל (performance entries) ומבקש מה-SW לשמור אותם בקאש קבוע (uc-saved).
 * חושף window.ucOffline ומחווט כפתור "שמור לאופליין" + מודאל ניהול.
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  var pageUrl = location.href.split('#')[0];

  function send(msg) {
    return new Promise(function (resolve) {
      navigator.serviceWorker.ready.then(function (reg) {
        var worker = reg.active || navigator.serviceWorker.controller;
        if (!worker) { resolve({ ok: false, error: 'no-sw' }); return; }
        var ch = new MessageChannel();
        ch.port1.onmessage = function (e) { resolve(e.data); };
        worker.postMessage(msg, [ch.port2]);
      });
    });
  }

  // אוסף את כל הנכסים מאותו origin שהעמוד טען בפועל (כולל גופנים שהוזרקו ב-JS).
  function collectAssets() {
    var origin = location.origin, urls = {};
    (performance.getEntriesByType('resource') || []).forEach(function (e) {
      try {
        var u = new URL(e.name);
        if (u.origin !== origin) return; // cross-origin (YouTube/CDN) — מדלגים
        if (/\.(css|js|mjs|woff2?|ttf|png|jpe?g|webp|svg|gif)(\?|$)/i.test(u.pathname)) urls[e.name] = 1;
      } catch (_) {}
    });
    return Object.keys(urls);
  }

  function fmtSize(bytes) {
    if (!bytes) return '0KB';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB';
    return (bytes / 1048576).toFixed(1) + 'MB';
  }

  var api = {
    save: function () {
      if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (_) {} }
      return send({ type: 'SAVE_PAGE', url: pageUrl, title: document.title, assets: collectAssets() });
    },
    remove: function (url) { return send({ type: 'REMOVE_PAGE', url: url || pageUrl }); },
    list: function () { return send({ type: 'GET_INDEX' }); },
    clear: function () { return send({ type: 'CLEAR_ALL' }); },
    isSaved: function () {
      return api.list().then(function (r) {
        return (r.items || []).some(function (i) { return i.url === pageUrl; });
      });
    }
  };
  window.ucOffline = api;

  // ── תצוגת toast קטן ──────────────────────────────────────────────
  function toast(text) {
    var t = document.createElement('div');
    t.className = 'uc-toast';
    t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-in'); });
    setTimeout(function () { t.classList.remove('is-in'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  // ── כפתורי "שמור לאופליין" + ניהול, בסרגל ליד אייקון ההדפסה ──────────
  function setSaveBtnState(btn, saved) {
    // האייקונים הם SVG מוטמע; הצגת "שמור/שמור-במכשיר" נשלטת ע"י המחלקה is-saved ב-CSS.
    btn.classList.toggle('is-saved', saved);
    btn.title = saved ? 'שמור במכשיר — הקש להסרה' : 'שמור לצפייה לא מקוונת';
  }

  function wireButtons() {
    var manage = document.getElementById('uc-offline-manage');
    if (manage) manage.addEventListener('click', openModal);
    // טריגרים מתפריט ההמבורגר "שירים לא מקוונים" — זמינים בכל עמוד באתר
    [].slice.call(document.querySelectorAll('.uc-offline-mgr-trigger')).forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
    });

    var btn = document.getElementById('uc-save-offline');
    if (!btn) return;
    api.isSaved().then(function (saved) { setSaveBtnState(btn, saved); });

    btn.addEventListener('click', function () {
      if (btn.classList.contains('is-busy')) return;
      var saved = btn.classList.contains('is-saved');
      btn.classList.add('is-busy');
      var op = saved ? api.remove() : api.save();
      op.then(function (r) {
        btn.classList.remove('is-busy');
        if (!r || r.ok === false) { setSaveBtnState(btn, saved); toast('לא הצלחנו לשמור — נסה כשיש חיבור'); return; }
        if (saved) { setSaveBtnState(btn, false); toast('השיר הוסר מהמכשיר'); }
        else {
          setSaveBtnState(btn, true);
          toast('נשמר! זמין ב"שירים לא מקוונים" בתפריט · ' + fmtSize(r.size));
        }
      });
    });
  }

  function syncSaveBtn() {
    var btn = document.getElementById('uc-save-offline');
    if (btn) api.isSaved().then(function (s) { setSaveBtnState(btn, s); });
  }

  // ── מודאל ניהול הורדות ───────────────────────────────────────────
  function openModal() {
    var modal = document.getElementById('uc-offline-modal');
    if (!modal) { modal = buildModal(); document.body.appendChild(modal); }
    renderList(modal);
    modal.classList.add('is-open');
  }
  function closeModal(modal) { modal.classList.remove('is-open'); }

  function buildModal() {
    var m = document.createElement('div');
    m.id = 'uc-offline-modal';
    m.innerHTML =
      '<div class="uc-modal-backdrop"></div>' +
      '<div class="uc-modal-card" role="dialog" aria-label="ניהול הורדות לא מקוונות">' +
        '<div class="uc-modal-head">' +
          '<h2>שירים שמורים במכשיר</h2>' +
          '<button class="uc-modal-x" aria-label="סגור">✕</button>' +
        '</div>' +
        '<div class="uc-modal-meta"></div>' +
        '<ul class="uc-modal-list"></ul>' +
        '<div class="uc-modal-foot"><button class="uc-clear-all">נקה הכל</button></div>' +
      '</div>';
    m.querySelector('.uc-modal-x').addEventListener('click', function () { closeModal(m); });
    m.querySelector('.uc-modal-backdrop').addEventListener('click', function () { closeModal(m); });
    m.querySelector('.uc-clear-all').addEventListener('click', function () {
      if (!confirm('למחוק את כל השירים השמורים מהמכשיר?')) return;
      api.clear().then(function () { renderList(m); syncSaveBtn(); toast('כל ההורדות נמחקו'); });
    });
    return m;
  }

  function syncPill() {
    var pill = document.getElementById('uc-save-offline');
    if (pill) api.isSaved().then(function (s) { setPillState(pill, s); });
  }

  function renderList(modal) {
    var listEl = modal.querySelector('.uc-modal-list');
    var metaEl = modal.querySelector('.uc-modal-meta');
    listEl.innerHTML = '<li class="uc-empty">טוען…</li>';
    api.list().then(function (r) {
      var items = (r && r.items) || [];
      metaEl.textContent = items.length
        ? items.length + ' שירים · ' + fmtSize(r.total)
        : '';
      modal.querySelector('.uc-clear-all').style.display = items.length ? '' : 'none';
      if (!items.length) { listEl.innerHTML = '<li class="uc-empty">עדיין לא שמרת שירים לאופליין.</li>'; return; }
      listEl.innerHTML = '';
      items.forEach(function (it) {
        var li = document.createElement('li');
        var title = (it.title || it.url).replace(/\s*[–|-]\s*(unichord|אקורדים).*$/i, '');
        li.innerHTML =
          '<a class="uc-item-title" href="' + it.url + '"></a>' +
          '<span class="uc-item-size">' + fmtSize(it.size) + '</span>' +
          '<button class="uc-item-remove" aria-label="הסר">הסר</button>';
        li.querySelector('.uc-item-title').textContent = title;
        li.querySelector('.uc-item-remove').addEventListener('click', function () {
          api.remove(it.url).then(function () { renderList(modal); syncSaveBtn(); });
        });
        listEl.appendChild(li);
      });
    });
  }

  // חושף פתיחת מודאל גם מבחוץ (קישור בתפריט ההמבורגר)
  window.ucOpenOfflineManager = openModal;

  // ── דף הבית במצב לא מקוון — מציג רק את השירים השמורים ────────────────
  function buildOfflineHome() {
    var el = document.getElementById('uc-offline-home');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'uc-offline-home';
    el.innerHTML =
      '<div class="uc-oh-card">' +
        '<img class="uc-oh-logo" src="/pwa-icons/icon.svg" alt="unichord">' +
        '<div class="uc-oh-badge">מצב לא מקוון</div>' +
        '<h2>השירים ששמרת</h2>' +
        '<ul class="uc-oh-list"></ul>' +
        '<button class="uc-oh-retry" type="button">נסה להתחבר מחדש</button>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('.uc-oh-retry').addEventListener('click', function () { location.reload(); });
    return el;
  }

  function renderOfflineHome() {
    var listEl = buildOfflineHome().querySelector('.uc-oh-list');
    listEl.innerHTML = '<li class="uc-oh-empty">טוען…</li>';
    api.list().then(function (r) {
      var items = (r && r.items) || [];
      if (!items.length) {
        listEl.innerHTML = '<li class="uc-oh-empty">עדיין לא שמרת שירים לצפייה לא מקוונת.<br>כשתהיה מקוון — פתח שיר ולחץ 📥.</li>';
        return;
      }
      listEl.innerHTML = '';
      items.forEach(function (it) {
        var title = (it.title || it.url).replace(/\s*[–|-]\s*(unichord|אקורדים).*$/i, '');
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = it.url; a.className = 'uc-oh-item';
        a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
        a.appendChild(document.createTextNode(title));
        li.appendChild(a);
        listEl.appendChild(li);
      });
    });
  }

  function updateOfflineHome() {
    var isHome = document.body.classList.contains('home');
    if (isHome && !navigator.onLine) {
      renderOfflineHome();
      buildOfflineHome().classList.add('is-on');
    } else {
      var el = document.getElementById('uc-offline-home');
      if (el) el.classList.remove('is-on');
    }
  }
  window.addEventListener('online', updateOfflineHome);
  window.addEventListener('offline', updateOfflineHome);

  function init() { wireButtons(); updateOfflineHome(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
