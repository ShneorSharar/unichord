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

  // מערכת האייקונים המרכזית (Phosphor, viewBox 256) — עקבי עם AMS_Icons בצד ה-PHP.
  // ה-CSS ‎.achord-icon svg‎ כופה גודל 18px ו-fill:currentColor (צבע-זהב לפי הערכה).
  var svgs = {
    home:         '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z"/></svg>',
    chords:       '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M249.66,46.34l-40-40a8,8,0,0,0-11.31,11.32L200.69,20,140.52,80.16C117.73,68.3,92.21,69.29,76.75,84.74a42.27,42.27,0,0,0-9.39,14.37A8.24,8.24,0,0,1,59.81,104c-14.59.49-27.26,5.72-36.65,15.11C11.08,131.22,6,148.6,8.74,168.07,11.4,186.7,21.07,205.15,36,220s33.34,24.56,52,27.22A71.13,71.13,0,0,0,98.1,248c15.32,0,28.83-5.23,38.76-15.16,9.39-9.39,14.62-22.06,15.11-36.65a8.24,8.24,0,0,1,4.92-7.55,42.12,42.12,0,0,0,14.37-9.39c15.45-15.46,16.44-41,4.58-63.77L236,55.31l2.34,2.34a8,8,0,1,0,11.32-11.31ZM160,167.93a26.12,26.12,0,0,1-8.95,5.83,24.24,24.24,0,0,0-15,21.89c-.36,10.46-4,19.41-10.43,25.88-8.44,8.43-21,11.95-35.36,9.89C75,229.25,59.73,221.19,47.27,208.73S26.75,181,24.58,165.81c-2-14.37,1.46-26.92,9.89-35.36C40.94,124,49.89,120.37,60.35,120h0a24.22,24.22,0,0,0,21.89-15,26.12,26.12,0,0,1,5.83-9c5.49-5.49,13-8.13,21.38-8.13a49.38,49.38,0,0,1,19.13,4.19L108.5,112.19a32,32,0,1,0,35.31,35.31l20.08-20.08C170.41,142.71,169.47,158.41,160,167.93Zm-10.4-61.48a72.9,72.9,0,0,1,5.93,6.75l-15.42,15.42a32.22,32.22,0,0,0-12.68-12.68l15.42-15.43A73,73,0,0,1,149.55,106.45ZM112,128a16,16,0,0,1,16,16h0a16,16,0,1,1-16-16Zm48.85-32.85a86.94,86.94,0,0,0-6.68-6L176,67.31,188.69,80l-21.83,21.82A86.94,86.94,0,0,0,160.86,95.14ZM200,68.68,187.32,56,212,31.31,224.69,44ZM93.66,194.33a8,8,0,0,1-11.31,11.32l-32-32a8,8,0,0,1,11.32-11.31Z"/></svg>',
    lesson:       '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z"/></svg>',
    notes:        '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M210.3,56.34l-80-24A8,8,0,0,0,120,40V148.26A48,48,0,1,0,136,184V98.75l69.7,20.91A8,8,0,0,0,216,112V64A8,8,0,0,0,210.3,56.34ZM88,216a32,32,0,1,1,32-32A32,32,0,0,1,88,216ZM200,101.25l-64-19.2V50.75L200,70Z"/></svg>',
    teacher:      '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z"/></svg>',
    index:        '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z"/></svg>',
    upload:       '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm48-88a8,8,0,0,1-8,8H136v32a8,8,0,0,1-16,0V136H88a8,8,0,0,1,0-16h32V88a8,8,0,0,1,16,0v32h32A8,8,0,0,1,176,128Z"/></svg>',
    about:        '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z"/></svg>',
    contact:      '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48Zm-96,85.15L52.57,64H203.43ZM98.71,128,40,181.81V74.19Zm11.84,10.85,12,11.05a8,8,0,0,0,10.82,0l12-11.05,58,53.15H52.57ZM157.29,128,216,74.18V181.82Z"/></svg>',
    copyright:    '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"/></svg>',
    guide:        '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>',
    'chevron-down':'<svg viewBox="0 0 256 256" fill="currentColor"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>',
    account:      '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z"/></svg>',
    login:        '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M141.66,133.66l-40,40a8,8,0,0,1-11.32-11.32L116.69,136H24a8,8,0,0,1,0-16h92.69L90.34,93.66a8,8,0,0,1,11.32-11.32l40,40A8,8,0,0,1,141.66,133.66ZM200,32H136a8,8,0,0,0,0,16h56V208H136a8,8,0,0,0,0,16h64a8,8,0,0,0,8-8V40A8,8,0,0,0,200,32Z"/></svg>',
    logout:       '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H112a8,8,0,0,0,0,16h92.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z"/></svg>',
    register:     '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M256,136a8,8,0,0,1-8,8H232v16a8,8,0,0,1-16,0V144H200a8,8,0,0,1,0-16h16V112a8,8,0,0,1,16,0v16h16A8,8,0,0,1,256,136Zm-57.87,58.85a8,8,0,0,1-12.26,10.3C165.75,181.19,138.09,168,108,168s-57.75,13.19-77.87,37.15a8,8,0,0,1-12.25-10.3c14.94-17.78,33.52-30.41,54.17-37.17a68,68,0,1,1,71.9,0C164.6,164.44,183.18,177.07,198.13,194.85ZM108,152a52,52,0,1,0-52-52A52.06,52.06,0,0,0,108,152Z"/></svg>'
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
