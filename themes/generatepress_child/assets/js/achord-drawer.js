/**
 * Achord — App Drawer Menu
 * Handles: open/close, focus trap, submenu accordion, icon decoration
 */
(function () {
  'use strict';

  var lastFocused      = null;
  var isMenuDecorated  = false;

  /* ── Helpers ── */
  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var a = arguments;
      t = setTimeout(function () { fn.apply(null, a); }, wait);
    };
  }

  function setDrawerTop() {
    var topbar = document.querySelector('.achord-topbar');
    if (!topbar) return;
    document.documentElement.style.setProperty('--achord-drawer-top', topbar.offsetHeight + 'px');
  }

  /* ── Focus trap ── */
  function trap(e) {
    if (e.key !== 'Tab') return;
    var panel = document.getElementById('achord-panel');
    if (!panel) return;
    var focusable = Array.from(
      panel.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')
    );
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }

  /* ── Toggle drawer ── */
  function toggle(open) {
    var panel    = document.getElementById('achord-panel');
    var overlay  = document.getElementById('achord-overlay');
    var btn      = document.getElementById('achord-menu-btn');
    var closeBtn = document.getElementById('achord-close-btn');
    if (!panel || !overlay) return;

    if (open) {
      lastFocused = document.activeElement;
      panel.classList.add('open');
      overlay.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (btn) { btn.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
      panel.addEventListener('keydown', trap);

      if (!isMenuDecorated) { decorateMenuOnce(); isMenuDecorated = true; }

      var focusTarget = closeBtn || panel.querySelector('a,button,[tabindex]');
      if (focusTarget) setTimeout(function () { focusTarget.focus({ preventScroll: true }); }, 50);

    } else {
      panel.classList.remove('open');
      overlay.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (btn) { btn.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
      panel.removeEventListener('keydown', trap);
      if (lastFocused) lastFocused.focus();
    }
  }

  /* ── Icon map & SVGs ── */
  var iconMap = {
    'ראשי': 'home', 'דף הבית': 'home',
    'אקורדים': 'chords',
    "כל השירים (א'-ב')": 'index', "א'-ב'": 'index',
    'שיעורים': 'lesson',
    'תווים': 'notes',
    'חיפוש מורה': 'teacher',
    'הוספת שיר': 'upload',
    'אודות': 'about',
    'יצירת קשר': 'contact',
    'דיווח זכויות יוצרים וטעויות באתר': 'copyright',
    'מדריך למשתמש': 'guide'
  };

  var svgs = {
    home:         '<svg viewBox="0 0 24 24"><path d="M12 3l9 8h-3v9h-12v-9h-3l9-8z"/></svg>',
    chords:       '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z"/></svg>',
    lesson:       '<svg viewBox="0 0 24 24"><path d="M3 4h18v14H3V4zm2 2v10h14V6H5zm-2 14h18v2H3v-2z"/></svg>',
    notes:        '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6V2zm9 1.5V9h5"/></svg>',
    teacher:      '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8v-1a6 6 0 0112 0v1H5z"/></svg>',
    index:        '<svg viewBox="0 0 24 24"><path d="M3 4h3v2H3V4zm0 5h3v2H3V9zm0 5h3v2H3v-2zm0 5h3v2H3v-2zM8 4h13v2H8V4zm0 7h13v2H8v-2zm0 7h13v2H8v-2z"/></svg>',
    upload:       '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8zm1-13h-2v4H7v2h4v4h2v-4h4v-2h-4V7z"/></svg>',
    about:        '<svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zM12 2a10 10 0 1010 10A10 10 0 0012 2z"/></svg>',
    contact:      '<svg viewBox="0 0 24 24"><path d="M21 8v8a2 2 0 01-2 2H5l-4 4V6a2 2 0 012-2h16a2 2 0 012 2z"/></svg>',
    copyright:    '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 108 8 8.01 8.01 0 00-8-8zm0 14a6 6 0 116-6 6 6 0 01-6 6zm3-4a3 3 0 11-1.06-2.29l1.06-1.06A5 5 0 1017 14z"/></svg>',
    guide:        '<svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 012-2h12v16H6a2 2 0 01-2-2V6zm4 0h8v2H8V6zm0 4h8v2H8v-2zm0 4h6v2H8v-2z"/></svg>',
    'chevron-down':'<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>',
    account:      '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
    login:        '<svg viewBox="0 0 24 24"><path d="M11 7l5 5-5 5V7zm-4 10h10v-2H7v2zM7 7h10V5H7v2z"/></svg>',
    logout:       '<svg viewBox="0 0 24 24"><path d="M13 7l-5 5 5 5V7zm4 10h-10v-2h10v2zM7 7h10V5H7v2z"/></svg>',
    register:     '<svg viewBox="0 0 24 24"><path d="M15 4v3H9V4h6zm2-2H7a2 2 0 00-2 2v3H3v10a2 2 0 002 2h14a2 2 0 002-2V7h-2V4a2 2 0 00-2-2zm-4 6h-4v4h4V8z"/></svg>'
  };

  function getIcon(label) {
    var lower = (label || '').trim().toLowerCase();
    var key   = Object.keys(iconMap).find(function (k) { return k.toLowerCase() === lower; });
    return key ? iconMap[key] : 'guide';
  }

  function prependIcon(anchor, iconName) {
    if (anchor.querySelector('.achord-icon')) return;
    var span = document.createElement('span');
    span.className = 'achord-icon';
    span.innerHTML = svgs[iconName] || svgs.guide;
    anchor.prepend(span);
  }

  /* ── Decorate menu items (runs once on first open) ── */
  function decorateMenuOnce() {
    var menu = document.querySelector('#achord-panel #primary-menu');
    if (!menu) return;

    menu.querySelectorAll(':scope > li').forEach(function (li) {
      var a = li.querySelector(':scope > a');
      if (!a) return;

      var iconName = getIcon(a.textContent);
      prependIcon(a, iconName);

      if (iconName === 'upload') {
        a.classList.add('achord-menu-button');
      }

      if (li.classList.contains('menu-item-has-children')) {
        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'achord-submenu-toggle';
        toggleBtn.setAttribute('aria-label', 'פתח תת-תפריט');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.innerHTML = svgs['chevron-down'];
        li.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var subMenu = li.querySelector('.sub-menu');
          if (!subMenu) return;
          var isOpen = toggleBtn.classList.toggle('is-open');
          toggleBtn.setAttribute('aria-expanded', String(isOpen));
          subMenu.style.display = isOpen ? 'block' : 'none';
          li.style.overflow = isOpen ? 'visible' : 'hidden';
        });

        li.querySelectorAll('.sub-menu li > a').forEach(function (subA) {
          prependIcon(subA, getIcon(subA.textContent));
        });
      }
    });

    /* User-links icons */
    var userIconMap = {
      '#achord-user-icon-account':  svgs.account,
      '#achord-user-icon-logout':   svgs.logout,
      '#achord-user-icon-login':    svgs.login,
      '#achord-user-icon-register': svgs.register
    };
    Object.keys(userIconMap).forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && !el.innerHTML) { el.innerHTML = userIconMap[sel]; }
    });
  }

  /* ── Theme sync: mirrors plugin theme class to <body> ──
     The plugin sets theme-conductor / theme-studio / dark-mode on
     .achord-song-wrapper. We mirror them to <body> so the header
     and footer (which live outside the wrapper) can respond.      */
  function applyThemeToBody(theme, dark) {
    document.body.classList.remove('theme-conductor', 'theme-studio');
    document.body.classList.add(theme);
    document.body.classList.toggle('dark-mode', dark);
  }

  /* Effective dark state:
     - explicit user choice ('enabled'/'disabled') always wins;
     - otherwise fall back to the OS/browser prefers-color-scheme setting. */
  function effectiveDark() {
    var saved = localStorage.getItem('achordDarkMode');
    if (saved === 'enabled')  return true;
    if (saved === 'disabled') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function initThemeSync() {
    // 1. Apply immediately from saved choice, or the system preference
    //    for a visitor who has never toggled the manual switch.
    var savedTheme = localStorage.getItem('achordTheme') || 'theme-conductor';
    applyThemeToBody(savedTheme, effectiveDark());

    // 2. React to live OS/browser theme changes — ONLY while there is no
    //    explicit manual choice (a saved choice must keep winning).
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onSchemeChange = function (e) {
        if (localStorage.getItem('achordDarkMode') !== null) return; // manual choice wins
        var theme = localStorage.getItem('achordTheme') || 'theme-conductor';
        applyThemeToBody(theme, e.matches);
        // Keep the song wrapper (if present) in sync so its own dark styles follow.
        var w = document.querySelector('.achord-song-wrapper');
        if (w) w.classList.toggle('dark-mode', e.matches);
      };
      if (mq.addEventListener)   mq.addEventListener('change', onSchemeChange);
      else if (mq.addListener)   mq.addListener(onSchemeChange); // legacy Safari
    }

    // 3. Watch wrapper for live changes (user switches theme/dark mode)
    var wrapper = document.querySelector('.achord-song-wrapper');
    if (!wrapper) return;

    new MutationObserver(function () {
      var isStudio = wrapper.classList.contains('theme-studio');
      var isDark   = wrapper.classList.contains('dark-mode');
      applyThemeToBody(isStudio ? 'theme-studio' : 'theme-conductor', isDark);
    }).observe(wrapper, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', function () {
    setDrawerTop();
    window.addEventListener('resize', debounce(setDrawerTop, 150));
    initThemeSync();

    var btn      = document.getElementById('achord-menu-btn');
    var panel    = document.getElementById('achord-panel');
    var closeBtn = document.getElementById('achord-close-btn');

    if (btn) {
      btn.addEventListener('click', function () {
        toggle(!(panel && panel.classList.contains('open')));
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { toggle(false); });
    }
  });

})();
