/* uc-page.js (WP4, round 1): chord strip, popup a11y, song-page polish.
   SPEC-round1.md decisions 10, 11, 12. Registers through window.ucEngineHooks;
   runs once per initChordDisplay() call, BEFORE ui.init(). Never throws. */
(function () {
  'use strict';

  var LS_INSTRUMENT = 'uc_instrument';
  var STRIP_ID = 'chord-strip-bar';
  var docBound = false;          // document-level listeners, once per page
  var lastOpener = null;         // element to return focus to when the popup closes
  var pendingOpener = null;      // set by a strip card just before it clicks a token
  var pad = null;                // body padding saved while the strip is open: {inline, base}
  var activeStrip = null;        // {ChordStrip, wrapper} owning the open strip

  function safe(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) { try { console.error('uc-page', e); } catch (e2) {} }
    };
  }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* ASCII # and b accidentals → ♯ ♭ (only the accidental right after a root or bass letter). */
  function glyphs(name) {
    return String(name || '').replace(/(^|[\/(\s])([A-G])([#b]+)/g, function (m, pre, l, acc) {
      return pre + l + acc.replace(/#/g, '♯').replace(/b/g, '♭');
    }).replace(/([^A-Za-z])b(?=\d)|([0-9m])b(?=\d)/g, function (m, p1, p2) { return (p1 || p2) + '♭'; });
  }
  function normName(n) { return String(n || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b'); }
  function tokenName(el) { return (el.dataset.current || el.dataset.original || el.textContent || '').trim(); }
  /* Parse "קאפו 3" (or any text) → number or null. */
  function capoNumber(text) {
    var m = /-?\d+(?:\.\d+)?/.exec(String(text || ''));
    return m ? parseFloat(m[0]) : null;
  }
  var TOKENS = '.achord-chord:not(.achord-placeholder-chord)';

  /* ───────────────────────── Strip (decision 10) ───────────────────────── */

  function syncStripTheme(strip, wrapper) {
    if (!strip || !wrapper) return;
    ['theme-conductor', 'theme-studio', 'dark-mode'].forEach(function (c) {
      strip.classList.toggle(c, wrapper.classList.contains(c));
    });
  }

  function padBody(strip) {
    var b = document.body;
    if (!b || !strip) return;
    if (!pad) {
      pad = { inline: b.style.paddingTop, base: parseFloat(getComputedStyle(b).paddingTop) || 0 };
    }
    b.style.paddingTop = (pad.base + strip.offsetHeight) + 'px';
    b.classList.add('ucd-strip-open');
  }
  function unpadBody() {
    var b = document.body;
    if (!b) return;
    if (pad) { b.style.paddingTop = pad.inline; pad = null; }
    b.classList.remove('ucd-strip-open');
  }

  function setToggleState(wrapper, open) {
    var btn = wrapper && wrapper.querySelector('#achord-chord-strip-toggle');
    if (!btn) return;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-controls', STRIP_ID);
    btn.classList.toggle('active', !!open);
  }

  function findToken(wrapper, ChordStrip, name) {
    var want = normName(name);
    var scopes = [];
    try { scopes.push(ChordStrip.activeVersion()); } catch (e) {}
    var area = wrapper.querySelector('#achord-content-area');
    if (area) scopes.push(area);
    for (var i = 0; i < scopes.length; i++) {
      if (!scopes[i] || !scopes[i].querySelectorAll) continue;
      var list = scopes[i].querySelectorAll(TOKENS);
      for (var j = 0; j < list.length; j++) {
        if (area && !area.contains(list[j])) continue;
        if (normName(tokenName(list[j])) === want) return list[j];
      }
    }
    return null;
  }

  function openFromCard(ctx, card) {
    var name = card.getAttribute('data-chord') || '';
    var tok = findToken(ctx.wrapper, ctx.ChordStrip, name);
    if (tok) {
      pendingOpener = card;
      tok.click();               // same code path as tapping the token (main.js ui.initPopup)
      pendingOpener = null;
      return;
    }
    // Fallback: no token found (should not happen). Render straight into the popup.
    var popup = ctx.wrapper.querySelector('#achord-popup');
    var diag = ctx.wrapper.querySelector('#achord-diagram');
    if (!popup || !diag) return;
    lastOpener = card;
    diag.innerHTML = '';
    if (ctx.state.instrument === 'piano') ctx.engine.renderPianoDiagram(name, diag);
    else ctx.engine.renderGuitarDiagram(name, diag);
    setPopupTitle(popup, name);
    popup.classList.remove('hidden');
  }

  function makeCreate(ctx) {
    var ChordStrip = ctx.ChordStrip, wrapper = ctx.wrapper, state = ctx.state, engine = ctx.engine;
    return safe(function () {
      var old = document.getElementById(STRIP_ID);
      if (old) old.remove();
      var chords = new Map();
      var scope = ChordStrip.activeVersion ? ChordStrip.activeVersion() : wrapper;
      scope.querySelectorAll(TOKENS).forEach(function (el) {
        var name = tokenName(el);
        if (!name) return;
        chords.set(name, (chords.get(name) || 0) + 1);
      });
      var piano = state.instrument === 'piano';
      var strip = document.createElement('div');
      strip.id = STRIP_ID;
      strip.className = 'ucd-s-bar' + (piano ? ' ucd-s-piano' : ' ucd-s-guitar');
      strip.setAttribute('role', 'region');
      strip.setAttribute('aria-label', 'פס האקורדים');
      syncStripTheme(strip, wrapper);

      var html = '<button type="button" class="ucd-s-close" aria-label="סגור את פס האקורדים">×</button>';
      html += '<div class="ucd-s-row">';
      if (!chords.size) {
        html += '<p class="ucd-s-empty">אין אקורדים בגרסה הזו</p>';
      }
      chords.forEach(function (count, chord) {
        var shown = glyphs(chord);
        var times = count === 1 ? 'פעם אחת' : count + ' פעמים';
        html += '<button type="button" class="ucd-s-card" data-chord="' + esc(chord) + '"' +
          ' aria-label="אקורד ' + esc(shown) + ', ' + times + '. פתיחת הדיאגרמה">' +
          '<span class="ucd-s-name" dir="ltr"><bdi dir="ltr">' + esc(shown) + '</bdi></span>' +
          '<span class="ucd-s-diagram" dir="ltr" aria-hidden="true"></span>' +
          '<span class="ucd-s-count" aria-hidden="true"><bdi dir="ltr">' + count + '×</bdi></span>' +
          '</button>';
      });
      html += '</div>';
      strip.innerHTML = html;
      document.body.appendChild(strip);
      activeStrip = { ChordStrip: ChordStrip, wrapper: wrapper };

      strip.querySelectorAll('.ucd-s-card').forEach(function (card) {
        var box = card.querySelector('.ucd-s-diagram');
        try {
          if (piano) engine.renderPianoDiagram(card.getAttribute('data-chord'), box);
          else engine.renderGuitarDiagram(card.getAttribute('data-chord'), box);
        } catch (e) { try { console.error('uc-page strip render', e); } catch (e2) {} }
        // Old piano renderer prints its own <h3> title; the card already names the chord.
        var h = box.querySelector('h3');
        if (h) h.remove();
      });

      strip.querySelector('.ucd-s-close').addEventListener('click', safe(function () {
        ChordStrip.close();
        var t = wrapper.querySelector('#achord-chord-strip-toggle');
        if (t) t.focus();
      }));
      strip.addEventListener('click', safe(function (e) {
        var card = e.target.closest && e.target.closest('.ucd-s-card');
        if (card && strip.contains(card)) openFromCard(ctx, card);
      }));
      strip.addEventListener('keydown', safe(function (e) {
        if (e.key === 'Escape') {
          var popup = wrapper.querySelector('#achord-popup');
          if (popup && !popup.classList.contains('hidden')) return;
          ChordStrip.close();
          var t = wrapper.querySelector('#achord-chord-strip-toggle');
          if (t) t.focus();
        }
      }));
      // Vertical wheel scrolls the card row sideways on desktop.
      var row = strip.querySelector('.ucd-s-row');
      row.addEventListener('wheel', function (e) {
        try {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && row.scrollWidth > row.clientWidth) {
            row.scrollLeft += (getComputedStyle(row).direction === 'rtl' ? -1 : 1) * e.deltaY;
            e.preventDefault();
          }
        } catch (err) {}
      }, { passive: false });

      padBody(strip);
      // Fonts or late SVG layout can change the height: measure again.
      requestAnimationFrame(function () { try { if (strip.isConnected) padBody(strip); } catch (e) {} });
      setToggleState(wrapper, true);
    });
  }

  function patchStrip(ctx) {
    var CS = ctx.ChordStrip;
    if (!CS || CS.__ucPage) return;
    CS.__ucPage = true;
    CS.create = makeCreate(ctx);
    var origClose = CS.close;
    CS.close = safe(function () {
      try { if (origClose) origClose.apply(CS, arguments); } catch (e) {}
      var s = document.getElementById(STRIP_ID);
      if (s) s.remove();
      unpadBody();
      activeStrip = null;
      setToggleState(ctx.wrapper, false);
    });
    setToggleState(ctx.wrapper, false);
  }

  /* ───────────────────────── Popup (decision 11) ───────────────────────── */

  function setPopupTitle(popup, name) {
    var t = popup.querySelector('#ucd-popup-title');
    if (t) t.textContent = name ? 'אקורד ' + glyphs(name) : 'אקורד';
  }

  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  function patchPopup(ctx) {
    var wrapper = ctx.wrapper;
    var popup = wrapper.querySelector('#achord-popup');
    if (!popup || popup.__ucPage) return;
    popup.__ucPage = true;
    var content = popup.querySelector('.achord-popup-content');
    var close = popup.querySelector('.achord-close');

    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    if (content && !popup.querySelector('#ucd-popup-title')) {
      var title = document.createElement('h2');
      title.id = 'ucd-popup-title';
      title.className = 'ucd-sr';
      title.textContent = 'אקורד';
      content.insertBefore(title, content.firstChild);
    }
    popup.setAttribute('aria-labelledby', 'ucd-popup-title');

    if (close) {
      close.setAttribute('role', 'button');
      close.setAttribute('tabindex', '0');
      if (!close.getAttribute('aria-label')) close.setAttribute('aria-label', 'סגור');
      var ic = close.querySelector('svg');
      if (ic) { ic.setAttribute('aria-hidden', 'true'); ic.setAttribute('focusable', 'false'); }
      close.addEventListener('keydown', safe(function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); close.click(); }
      }));
    }
    // Clicks inside the card never reach the backdrop handler (main.js closes on any popup click).
    // Bubble phase on the content: inner handlers still run, the close control stops propagation itself.
    if (content) {
      content.addEventListener('click', function (e) {
        try {
          if (close && close.contains(e.target)) return;
          e.stopPropagation();
        } catch (err) {}
      });
    }
    // Focus trap.
    popup.addEventListener('keydown', safe(function (e) {
      if (e.key !== 'Tab' || popup.classList.contains('hidden')) return;
      var f = focusables(popup);
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !popup.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !popup.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }));

    var wasOpen = !popup.classList.contains('hidden');
    new MutationObserver(safe(function () {
      var open = !popup.classList.contains('hidden');
      if (open === wasOpen) return;
      wasOpen = open;
      if (open) {
        popup.setAttribute('data-instrument', ctx.state.instrument === 'piano' ? 'piano' : 'guitar');
        if (lastOpener) setPopupTitle(popup, lastOpener.classList.contains('ucd-s-card') ? lastOpener.getAttribute('data-chord') : tokenName(lastOpener));
        var target = close || content;
        if (target) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
      } else {
        var back = lastOpener;
        lastOpener = null;
        var ae = document.activeElement;
        if (back && back.isConnected && (!ae || ae === document.body || popup.contains(ae))) {
          try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); }
        }
      }
    })).observe(popup, { attributes: true, attributeFilter: ['class'] });
  }

  /* ───────────────────────── Page polish (decision 12) ───────────────────────── */

  function markTokens(area) {
    if (!area) return;
    area.querySelectorAll(TOKENS).forEach(function (el) {
      if (el.getAttribute('tabindex') === null) el.setAttribute('tabindex', '0');
      if (!el.getAttribute('role')) el.setAttribute('role', 'button');
    });
  }

  function patchTokens(ctx) {
    var area = ctx.wrapper.querySelector('#achord-content-area');
    if (!area) return;
    markTokens(area);
    if (area.__ucPage) return;
    area.__ucPage = true;
    area.addEventListener('keydown', safe(function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var t = e.target;
      if (!t || !t.matches || !t.matches(TOKENS)) return;
      e.preventDefault();
      t.click();
    }));
    // Content can be re-rendered (version switch markup, personal edits): mark new tokens.
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(function () { queued = false; try { markTokens(area); } catch (e) {} }, 50);
    }).observe(area, { childList: true, subtree: true });
  }

  function patchToolbar(ctx) {
    var w = ctx.wrapper;
    var labels = {
      '#achord-scroll-down': 'האטת גלילה',
      '#achord-scroll-up': 'האצת גלילה',
      '#achord-font-decrease': 'הקטנת גופן',
      '#achord-font-increase': 'הגדלת גופן'
    };
    Object.keys(labels).forEach(function (sel) {
      var b = w.querySelector(sel);
      if (b) b.setAttribute('aria-label', labels[sel]);
    });
    ['#achord-transpose-info', '#achord-capo-info'].forEach(function (sel) {
      var el = w.querySelector(sel);
      if (el) { el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true'); }
    });
    var ti = w.querySelector('#achord-transpose-info');
    if (ti && !ti.getAttribute('aria-label')) ti.setAttribute('title', 'שינוי סולם בטונים');
  }

  function patchCapo(ctx) {
    var el = ctx.wrapper.querySelector('#achord-capo-info');
    if (!el || el.__ucPage) return;
    el.__ucPage = true;
    var apply = function () {
      var n = capoNumber(el.textContent);
      el.classList.toggle('ucd-capo-zero', n === 0);
    };
    apply();
    new MutationObserver(safe(apply)).observe(el, { childList: true, characterData: true, subtree: true });
  }

  function instrumentLabel(btn, inst) {
    if (!btn) return;
    var piano = inst === 'piano';
    btn.setAttribute('aria-label', piano ? 'החלף כלי נגינה (עכשיו פסנתר)' : 'החלף כלי נגינה (עכשיו גיטרה)');
  }

  function patchInstrument(ctx) {
    var w = ctx.wrapper, state = ctx.state;
    var btn = w.querySelector('#achord-toggle-instrument');
    if (!btn) return;
    if (!btn.__ucPage) {
      btn.__ucPage = true;
      // Runs before main.js's own listener (added later in ui.init), so read the state after it.
      btn.addEventListener('click', function () {
        setTimeout(safe(function () {
          var inst = state.instrument === 'piano' ? 'piano' : 'guitar';
          lsSet(LS_INSTRUMENT, inst);
          instrumentLabel(btn, inst);
          if (activeStrip && activeStrip.wrapper === w) activeStrip.ChordStrip.refresh();
        }), 0);
      });
    }
    // Restore after ui.init() has bound the toggle (hook runs before it). Once per wrapper.
    if (w.__ucdInstrRestored) return;
    w.__ucdInstrRestored = true;
    var restore = safe(function () {
      if (lsGet(LS_INSTRUMENT) === 'piano' && state.instrument === 'guitar') btn.click();
      else instrumentLabel(btn, state.instrument);
    });
    setTimeout(function () {
      if (window.jQuery) { try { window.jQuery(function () { setTimeout(restore, 0); }); return; } catch (e) {} }
      restore();
    }, 0);
  }

  /* Quick "hide chords" button in the always-visible bar (Arnon, 19.10.26).
     Proxies the drawer's #achord-lyrics-only-toggle, so main.js keeps owning the state. */
  var EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var EYE_OPEN = EYE + '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = EYE + '<path d="M2 12s3.6-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.6 7-10 7c-2 0-3.7-.7-5.1-1.6"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>';

  function patchQuickLyrics(ctx) {
    var w = ctx.wrapper;
    var orig = w.querySelector('#achord-lyrics-only-toggle');
    var row = w.querySelector('.achord-main-controls .scroll-controls');
    if (!orig || !row || row.querySelector('.ucd-quick-lyrics')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'control-button ucd-quick-lyrics';
    var sync = function () {
      var on = w.classList.contains('uc-lyrics-only');
      b.innerHTML = on ? EYE_OPEN : EYE_OFF;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', on ? 'הצגת אקורדים' : 'הסתרת אקורדים');
      b.title = on ? 'הצגת אקורדים' : 'הסתרת אקורדים';
      b.classList.toggle('is-on', on);
    };
    b.addEventListener('click', safe(function () { orig.click(); }));
    row.appendChild(b);
    sync();
    new MutationObserver(safe(sync)).observe(w, { attributes: true, attributeFilter: ['class'] });
  }

  function watchWrapperTheme(ctx) {
    var w = ctx.wrapper;
    if (w.__ucdThemeObs) return;
    w.__ucdThemeObs = true;
    new MutationObserver(safe(function () {
      var s = document.getElementById(STRIP_ID);
      if (s && activeStrip && activeStrip.wrapper === w) syncStripTheme(s, w);
    })).observe(w, { attributes: true, attributeFilter: ['class'] });
  }

  function bindDocument() {
    if (docBound) return;
    docBound = true;
    // Remember which token opened the popup (capture: runs before main.js's delegated handler).
    document.addEventListener('click', function (e) {
      try {
        var t = e.target && e.target.closest && e.target.closest(TOKENS);
        if (t && t.closest('#achord-content-area')) lastOpener = pendingOpener || t;
      } catch (err) {}
    }, true);
    window.addEventListener('resize', safe(function () {
      var s = document.getElementById(STRIP_ID);
      if (s && pad) padBody(s);
    }));
  }

  /* ───────────────────────── Hook ───────────────────────── */

  function hook(ctx) {
    if (!ctx || !ctx.wrapper) return;
    try { document.body.classList.add('ucd-page'); } catch (e) {}
    [bindDocument, function () { patchStrip(ctx); }, function () { patchPopup(ctx); },
     function () { patchTokens(ctx); }, function () { patchToolbar(ctx); }, function () { patchCapo(ctx); },
     function () { patchInstrument(ctx); }, function () { watchWrapperTheme(ctx); },
     function () { patchQuickLyrics(ctx); }
    ].forEach(function (f) { safe(f)(); });
  }

  try {
    (window.ucEngineHooks = window.ucEngineHooks || []).push(hook);
    // Pure helpers, exposed for tests.
    window.UCPage = { version: 'r1', glyphs: glyphs, normName: normName, capoNumber: capoNumber, esc: esc };
  } catch (e) {}
})();
