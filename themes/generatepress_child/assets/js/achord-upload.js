/**
 * achord-upload.js  v2
 * טופס העלאת שיר — עורך ויזואלי + ממשק יפני
 * Achord Child Theme
 *
 * תיקונים v2:
 * - Drag & drop עובר ל-canvas delegation (פותר בעיית child-element dragleave)
 * - pointer-events: none על ילדי הטוקן (ב-CSS)
 * - צבע אקורד תואם לפלאגין (--text-chord)
 * - ניקוי 199 quick-btns — library לא מוסיפה drag מראש, רק בעת פתיחה
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     initAchordEditor(cfg) — מפעל של עורך-האקורדים.
     קריאה ללא ארגומנטים = טופס העלאת-השיר המקורי (תאימות מלאה
     לאחור). cfg.mode==='embed' משמש את מודאל העריכה-האישית/הצעת-
     התיקון בעמוד השיר: מדלג על לוגיקת-השליחה של הטופס, ומחזיר API
     ‏{ setContent, getContent, focus } ש-main.js קורא לו.
     cfg.ids ממפה מזהי-DOM (ברירת-מחדל = מזהי auf-* של טופס ההעלאה);
     cfg.data מחליף את window.ACHORD_UPLOAD_DATA.
     ══════════════════════════════════════════════════════════ */
  function initAchordEditor(cfg) {
  cfg = cfg || {};
  const embed = cfg.mode === 'embed';
  const ids = Object.assign({
    form:'achord-upload-form', editorNormal:'auf-editor-normal', tokenCanvas:'auf-token-canvas',
    textMode:'auf-text-mode', chordMode:'auf-chord-mode', previewPanel:'auf-preview-panel',
    songPreview:'auf-song-preview', modeText:'auf-mode-text', modeChords:'auf-mode-chords',
    previewBtn:'auf-preview-btn', recBar:'auf-recommended-bar', editRecBtn:'auf-edit-rec-btn',
    openLibBtn:'auf-open-library-btn', libraryModal:'auf-library-modal', librarySearch:'auf-library-search',
    libraryGrid:'auf-library-grid', uploadMsg:'auf-upload-msg', submitBtn:'auf-submit-btn',
    transposeRange:'auf-transpose-range', transposeOutput:'auf-transpose-output',
    chordInput:'auf-chord-input', addChordBtn:'auf-add-chord-btn', abcPreview:'auf-abc-preview',
    editorAbc:'auf-editor-abc', undoBtn:'auf-undo-btn', redoBtn:'auf-redo-btn', publishBtn:'auf-publish-btn'
  }, cfg.ids || {});
  const g = function (id) { return document.getElementById(id); };

  /* ─── נתונים מ-PHP ─────────────────────────────────────── */
  const DATA = cfg.data || window.ACHORD_UPLOAD_DATA || {};
  const fullChordLibrary = DATA.library || {};
  const ajaxUrl = DATA.ajaxUrl || '';
  const prefill = DATA.prefill || {};

  /* ─── אלמנטים ─────────────────────────────────────────── */
  const form        = g(ids.form);
  if (!form) return null;

  const textareaEl      = g(ids.editorNormal);
  const tokenCanvas     = g(ids.tokenCanvas);
  const textPanel       = g(ids.textMode);
  const chordPanel      = g(ids.chordMode);
  const previewPanel    = g(ids.previewPanel);
  const previewEl       = g(ids.songPreview);
  const modeBtnText     = g(ids.modeText);
  const modeBtnChords   = g(ids.modeChords);
  const previewBtn      = g(ids.previewBtn);
  const recBar          = g(ids.recBar);
  const editRecBtn      = g(ids.editRecBtn);
  const openLibBtn      = g(ids.openLibBtn);
  const modal           = g(ids.libraryModal);
  const libSearch       = g(ids.librarySearch);
  const libGrid         = g(ids.libraryGrid);
  const msgEl           = g(ids.uploadMsg);
  const submitBtn       = g(ids.submitBtn);
  const transposeRange  = g(ids.transposeRange);
  const transposeOutput = g(ids.transposeOutput);
  const addChordInput   = g(ids.chordInput);
  const addChordBtn     = g(ids.addChordBtn);
  const abcPreview      = g(ids.abcPreview);
  const abcTextarea     = g(ids.editorAbc);

  /* ─── עזרי a11y / utility ─────────────────────────────────
     אזור aria-live להכרזת שינויי אקורד לקוראי-מסך (WCAG 4.1.3),
     ו-debounce לחיפוש הספרייה. */
  let aufLiveRegion = null;
  function announce(msg) {
    if (!aufLiveRegion) {
      aufLiveRegion = document.createElement('div');
      aufLiveRegion.setAttribute('aria-live', 'polite');
      aufLiveRegion.setAttribute('role', 'status');
      aufLiveRegion.className = 'auf-sr-only';
      // נראות מוסתרת ויזואלית אך זמינה לקוראי-מסך
      aufLiveRegion.style.cssText =
        'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
        'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
      (form || document.body).appendChild(aufLiveRegion);
    }
    // איפוס קצר מכריח קורא-מסך להכריז גם אם הטקסט זהה
    aufLiveRegion.textContent = '';
    requestAnimationFrame(function () { aufLiveRegion.textContent = msg; });
  }
  function debounce(fn, wait) {
    let t = null;
    return function () {
      const ctx = this, args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(ctx, args); }, wait);
    };
  }

  /* ══════════════════════════════════════════════════════════
     מודול 1: אקורדים מומלצים (localStorage)
     ══════════════════════════════════════════════════════════ */
  let recommendedChords = [];
  try {
    recommendedChords = JSON.parse(
      localStorage.getItem('achord_recommended_chords_v1') || '[]'
    );
  } catch (e) { recommendedChords = []; }

  function saveRecommended() {
    localStorage.setItem(
      'achord_recommended_chords_v1',
      JSON.stringify(recommendedChords)
    );
  }

  function renderRecommended() {
    if (!recBar) return;
    const isEditing = recBar.classList.contains('auf-rec-bar--editing');
    recBar.innerHTML = '';
    recommendedChords.forEach(function (chord) {
      const btn = makeChordSourceBtn(chord, 'auf-rec-btn');
      // אבטחה: שם האקורד מגיע מ-localStorage — בונים אותו כ-textContent ולא כ-innerHTML
      btn.innerHTML = '';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'auf-rec-btn__label';
      labelSpan.textContent = chord;
      btn.appendChild(labelSpan);
      // × מפורש ולא ★ — כוכב נקרא כ"סימון מועדף" ולא כ"הסרה", ומשתמשים
      // הסירו אקורדים בטעות. אזור-המגע גדל החוצה בלבד (ראה CSS), כך
      // שהקשה על שם האקורד לעולם לא מוחקת אותו.
      btn.insertAdjacentHTML('beforeend', isEditing
        ? '<span class="auf-rec-btn__remove" role="button" aria-label="הסר">×</span>'
        : '<span class="auf-rec-btn__x" role="button" aria-label="הסר">×</span>');
      recBar.appendChild(btn);
    });
    updateQuickStars();
  }

  function updateQuickStars() {
    form.querySelectorAll('.auf-quick-btn').forEach(function (btn) {
      btn.classList.toggle(
        'auf-quick-btn--starred',
        recommendedChords.includes(btn.dataset.chord)
      );
    });
  }

  function toggleRecommended(chord) {
    const idx = recommendedChords.indexOf(chord);
    if (idx === -1) recommendedChords.push(chord);
    else recommendedChords.splice(idx, 1);
    saveRecommended();
    renderRecommended();
  }

  function ensureRecommended(chord) {
    if (!recommendedChords.includes(chord)) {
      recommendedChords.push(chord);
      saveRecommended();
      renderRecommended();
    }
  }

  /* ══════════════════════════════════════════════════════════
     מודול 2: Drag source factory
     כפתורי אקורד — draggable, מעביר chord בdataTransfer
     ══════════════════════════════════════════════════════════ */
  let activeDragChord   = null;
  let activeMoveFromIdx = null; // index of placed-chord token being dragged (move mode)

  function makeChordSourceBtn(chord, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (extraClass) btn.className = extraClass;
    btn.dataset.chord = chord;
    btn.addEventListener('mousedown', function (e) {
      if (!isChordMode) return;
      startMouseDragPending(e, chord);
    });
    return btn;
  }

  /* ══════════════════════════════════════════════════════════
     מודול 3: Canvas-level drag delegation
     פותר בעיית child-element dragleave
     ══════════════════════════════════════════════════════════ */
  function clearDragOver() {
    if (!tokenCanvas) return;
    tokenCanvas.querySelectorAll('.auf-token--drag-over, .dnd-over').forEach(function (t) {
      t.classList.remove('auf-token--drag-over');
      t.classList.remove('dnd-over');
    });
  }

  /* ══════════════════════════════════════════════════════════
     מודול 3a: פתרון יעד-הטלה גיאומטרי
     ──────────────────────────────────────────────────────────
     מחליף את איתור-היעד דרך elementFromPoint על אלמנטי `.auf-gap`
     ברוחב 10px. הבעיות שם היו: (1) היעד היה רצועה צרה שנתלתה
     מראש-השורה, ולכן חובה היה לכוון "מעל המילים"; (2) הרצועות
     נפתחו מ-0 ל-10px בתחילת הגרירה והזיזו כל שורה עד 80px מתחת
     לסמן; (3) לא היה יעד לפני המילה הראשונה בשורה.

     כאן כל שטח ה-canvas הוא יעד: בוחרים שורה לפי Y (הקרובה
     ביותר), ובתוכה לפי X — בתוך מילה = הצמדה/פיצול, בין מילים
     או לפני/אחרי השורה = אקורד יתום.
     ══════════════════════════════════════════════════════════ */

  /** מקבץ את טוקני-המילה לשורות ויזואליות לפי Y */
  function collectRows() {
    var rows = [];
    if (!tokenCanvas) return rows;
    tokenCanvas.querySelectorAll('.auf-token').forEach(function (el) {
      var idx = parseInt(el.dataset.index, 10);
      if (isNaN(idx)) return;
      var r = el.getBoundingClientRect();
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].top - r.top) < 12) { row = rows[i]; break; }
      }
      if (!row) { row = { top: r.top, bottom: r.bottom, items: [] }; rows.push(row); }
      row.top    = Math.min(row.top, r.top);
      row.bottom = Math.max(row.bottom, r.bottom);
      row.items.push({ el: el, idx: idx, rect: r });
    });
    rows.forEach(function (row) { row.items.sort(function (a, b) { return a.idx - b.idx; }); });
    rows.sort(function (a, b) { return a.top - b.top; });
    return rows;
  }

  /** יעד ההטלה בנקודה (x,y):
   *   { kind:'token',  el, idx, top, height }
   *   { kind:'insert', at, x, top, height }   — at = אינדקס להכנסה לפניו
   *  null אם אין טוקנים בכלל. */
  function resolveDrop(x, y) {
    var rows = collectRows();
    if (!rows.length) return null;

    // השורה שמכילה את Y, אחרת הקרובה אנכית (הטלה מתחת/מעל עדיין נוחתת)
    var row = null, best = Infinity;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var d = (y < r.top) ? (r.top - y) : (y > r.bottom ? y - r.bottom : 0);
      if (d < best) { best = d; row = r; }
      if (d === 0) break;
    }
    var geom = { top: row.top, height: row.bottom - row.top };

    // בתוך מילה?
    for (var j = 0; j < row.items.length; j++) {
      var it = row.items[j];
      if (x >= it.rect.left && x <= it.rect.right) {
        return { kind: 'token', el: it.el, idx: it.idx, top: geom.top, height: geom.height };
      }
    }

    // בין מילים / לפני הראשונה / אחרי האחרונה
    var items = row.items;
    var rtl = items.length > 1
      ? items[0].rect.left > items[items.length - 1].rect.left
      : (getComputedStyle(tokenCanvas).direction === 'rtl');

    for (var k = 0; k < items.length; k++) {
      var rect = items[k].rect;
      var isBefore = rtl ? (x > rect.right) : (x < rect.left);
      if (isBefore) {
        return {
          kind: 'insert', at: items[k].idx,
          el: items[k].el, prevEl: k > 0 ? items[k - 1].el : null, side: 'start',
          rtl: rtl, top: geom.top, height: geom.height
        };
      }
    }
    var last = items[items.length - 1];
    return {
      kind: 'insert', at: last.idx + 1,
      el: last.el, prevEl: null, side: 'end',
      rtl: rtl, top: geom.top, height: geom.height
    };
  }

  /* ── פתיחת רווח אמיתי בנקודת ההכנסה ──
     הקו לבדו לא מספיק — הרווח הנפתח מראה פיזית שהאקורד נכנס *בין*
     המילים. בניגוד למנגנון ה-gaps הישן, נפתח רווח **אחד בלבד**,
     בנקודה שמרחפים מעליה, והמילים שלפניו לא זזות — ולכן אין קפיצה
     של השורה ואין ריצוד (הרווח רק גדל סביב הסמן). */
  var INSERT_GAP     = 18;
  var openedGapEl    = null;
  var openedGapSide  = null;

  function clearInsertGap() {
    if (openedGapEl) {
      openedGapEl.style.marginInlineStart = '';
      openedGapEl.style.marginInlineEnd   = '';
    }
    openedGapEl = null;
    openedGapSide = null;
  }

  function applyInsertGap(t) {
    if (openedGapEl === t.el && openedGapSide === t.side) return;
    clearInsertGap();
    if (!t.el) return;
    if (t.side === 'start') t.el.style.marginInlineStart = INSERT_GAP + 'px';
    else                    t.el.style.marginInlineEnd   = INSERT_GAP + 'px';
    openedGapEl   = t.el;
    openedGapSide = t.side;
  }

  /** מרכז הרווח שנפתח — נמדד **אחרי** ה-reflow */
  function insertGapCenter(t) {
    var r = t.el.getBoundingClientRect();
    if (t.side === 'end') return t.rtl ? r.left - INSERT_GAP / 2 : r.right + INSERT_GAP / 2;
    if (!t.prevEl)        return t.rtl ? r.right + INSERT_GAP / 2 : r.left - INSERT_GAP / 2;
    var p = t.prevEl.getBoundingClientRect();
    return t.rtl ? (p.left + r.right) / 2 : (p.right + r.left) / 2;
  }

  /* ══════════════════════════════════════════════════════════
     מודול 3b: Custom mouse drag (מחליף HTML5 DnD הבעייתי)
     עובד עם button elements + Chrome/Windows + modal
     ══════════════════════════════════════════════════════════ */
  var mouseDragChord       = null;
  var mouseDragMoveFromIdx = null;
  var mouseDragGhost       = null;
  var mouseDragActive      = false;
  var mouseDragPending     = null;
  var MOUSE_DRAG_THRESHOLD = 6;

  function startMouseDragPending(e, chord, moveFromIdx) {
    if (e.button !== 0) return;
    mouseDragPending = {
      chord:       chord,
      moveFromIdx: (moveFromIdx !== undefined && moveFromIdx !== null) ? moveFromIdx : null,
      startX:      e.clientX,
      startY:      e.clientY
    };
    document.addEventListener('mousemove', onMouseDragPendingMove);
    document.addEventListener('mouseup',   onMouseDragPendingUp, { once: true });
  }

  function onMouseDragPendingMove(e) {
    var p = mouseDragPending;
    if (!p) return;
    var dx = e.clientX - p.startX;
    var dy = e.clientY - p.startY;
    if (Math.sqrt(dx * dx + dy * dy) >= MOUSE_DRAG_THRESHOLD) {
      document.removeEventListener('mousemove', onMouseDragPendingMove);
      activateMouseDrag(e, p.chord, p.moveFromIdx);
      mouseDragPending = null;
    }
  }

  function onMouseDragPendingUp() {
    document.removeEventListener('mousemove', onMouseDragPendingMove);
    mouseDragPending = null;
  }

  function activateMouseDrag(e, chord, moveFromIdx) {
    // הסר את מאזין ה-mouseup הממתין — חצינו את סף הגרירה, ה-pending-up כבר לא רלוונטי
    document.removeEventListener('mouseup', onMouseDragPendingUp);
    mouseDragChord       = chord;
    mouseDragMoveFromIdx = moveFromIdx;
    mouseDragActive      = true;
    if (tokenCanvas) tokenCanvas.classList.add('auf-token-canvas--dragging');

    mouseDragGhost = document.createElement('div');
    mouseDragGhost.className = 'auf-drag-ghost';
    mouseDragGhost.textContent = chord;
    document.body.appendChild(mouseDragGhost);
    updateMouseDragGhost(e.clientX, e.clientY);

    document.addEventListener('mousemove', onMouseDragMove);
    document.addEventListener('mouseup',   onMouseDragUp);
  }

  function updateMouseDragGhost(x, y) {
    if (mouseDragGhost) {
      mouseDragGhost.style.left = x + 'px';
      mouseDragGhost.style.top  = y + 'px';
    }
    clearDragOver();
    updateDropFeedback(x, y);
  }

  /** חיווי חי של יעד ההטלה — משותף למאוס ולמגע */
  function updateDropFeedback(x, y) {
    if (!pointInCanvas(x, y)) { clearInsertGap(); hideSplitMarker(); return null; }
    var t = resolveDrop(x, y);
    if (!t) { clearInsertGap(); hideSplitMarker(); return null; }
    if (t.kind === 'token') {
      clearInsertGap();
      t.el.classList.add('auf-token--drag-over');
      t.el.classList.add('dnd-over');
      var sp = splitTargetFor(t.el, x);
      if (sp) showMarker(sp.x, t.top, t.height, false);
      else    hideSplitMarker();
    } else {
      applyInsertGap(t);                       // פותח רווח פיזי
      showMarker(insertGapCenter(t), t.top, t.height, true); // ...והקו במרכזו
    }
    return t;
  }

  /** האם הנקודה בתוך שטח העריכה (עם שוליים סלחניים) */
  function pointInCanvas(x, y) {
    if (!tokenCanvas) return false;
    var r = tokenCanvas.getBoundingClientRect();
    var M = 8;
    return x >= r.left - M && x <= r.right + M && y >= r.top - M && y <= r.bottom + M;
  }

  function onMouseDragMove(e) {
    if (!mouseDragActive) return;
    e.preventDefault();
    updateMouseDragGhost(e.clientX, e.clientY);
  }

  /* ══════════════════════════════════════════════════════════
     מודול 3c: פיצול-בהטלה — 2 אקורדים על מילה אחת
     ──────────────────────────────────────────────────────────
     הפלת אקורד על מילה שכבר נושאת אקורד מפצלת אותה בגבול-התו
     הקרוב לנקודת ההטלה לשני טוקנים צמודים: הראשון שומר את
     האקורד הקיים, השני מקבל את החדש → `המ[Am]רצע[Eb]`.

     אילוץ-פורמט (מאומת): פיצול שורד serialize→parse רק כאשר
     החצי הראשון נושא אקורד — אחרת `המרצע[Eb]` ממוזג חזרה למילה
     אחת. לכן פיצול מותנה ב-`tok.chord` קיים.

     גבול-התו נמדד לפי X בלבד (מלבן לכל תו), ולא דרך
     caretRangeFromPoint — בזמן גרירה הסמן נמצא בגובה שורת-
     האקורד, ושם ה-API מחזיר את ה-SPAN עם offset 0.
     ══════════════════════════════════════════════════════════ */
  var COMBINING_MARK = /[֑-ׇ̀-ͯ]/; // ניקוד/טעמים — לא גבול-פיצול חוקי

  /** מחזיר { index, x } לנקודת-הפיצול, או null אם אין פיצול אפשרי.
   *  הכלל: הקו מסמן את **תחילת** המקטע של האקורד החדש — האקורד הקיים
   *  נשאר על מה שלפני הקו. קו לפני ה-ל ב"הולך" → `הו[ישן]לך[חדש]`.
   *  קו לפני האות הראשונה = החלפת האקורד הקיים (לא פיצול). */
  function splitPointFromX(tokEl, clientX) {
    if (!tokEl) return null;
    var ws = tokEl.querySelector('.auf-token__word');
    var tn = ws && ws.firstChild;
    if (!tn || tn.nodeType !== 3) return null;
    var text = tn.data || '';
    if (text.length < 2) return null;

    // מלבן לכל תו (עובד ב-RTL וב-LTR — משווים X מסך בפועל)
    var rng = document.createRange();
    var rects = [];
    for (var i = 0; i < text.length; i++) {
      rng.setStart(tn, i); rng.setEnd(tn, i + 1);
      rects.push(rng.getBoundingClientRect());
    }
    if (!rects.length) return null;
    var rtl = rects[0].left > rects[rects.length - 1].left;

    // טבלת גבולות: boundaryX[i] = המיקום שלפני האות i (ו-[len] = סוף המילה)
    var boundaryX = [];
    for (var b = 0; b < rects.length; b++) boundaryX.push(rtl ? rects[b].right : rects[b].left);
    boundaryX.push(rtl ? rects[rects.length - 1].left : rects[rects.length - 1].right);

    // הגבול הקרוב ביותר לסמן — הקו נופל בדיוק היכן שמניחים אותו.
    // גבול שנופל בתוך רצף ניקוד אינו חוקי (מנתק אות מהניקוד שלה).
    var k = -1, bestDist = Infinity;
    for (var i2 = 0; i2 <= text.length; i2++) {
      if (i2 < text.length && COMBINING_MARK.test(text.charAt(i2))) continue;
      var d = Math.abs(clientX - boundaryX[i2]);
      if (d < bestDist) { bestDist = d; k = i2; }
    }
    // הזנב חייב להישאר לא-ריק, אחרת אין מה לפצל
    if (k < 1 || k >= text.length) return null;

    return { index: k, x: boundaryX[k] };
  }

  /** האם הטלה על טוקן זה תפצל אותו? (משמש גם לסמן-החיווי וגם לביצוע) */
  function splitTargetFor(tokEl, clientX) {
    if (!tokEl) return null;
    var idx = parseInt(tokEl.dataset.index, 10);
    var tok = tokens[idx];
    if (!tok || tok.type !== 'word' || !tok.text || !tok.chord) return null;
    var pt = splitPointFromX(tokEl, clientX);
    return pt ? { idx: idx, index: pt.index, x: pt.x } : null;
  }

  /* ── סמן-חיווי אנכי: איפה בדיוק האקורד ינחת ──
     מלא = פיצול בתוך מילה · מקווקו = אקורד יתום בין מילים */
  var splitMarker = null;
  function showMarker(x, top, height, isInsert) {
    if (!splitMarker) {
      splitMarker = document.createElement('div');
      splitMarker.className = 'auf-split-marker';
      document.body.appendChild(splitMarker);
    }
    splitMarker.classList.toggle('auf-split-marker--insert', !!isInsert);
    splitMarker.style.left   = x + 'px';
    splitMarker.style.top    = top + 'px';
    splitMarker.style.height = height + 'px';
    splitMarker.hidden = false;
  }
  function hideSplitMarker() { if (splitMarker) splitMarker.hidden = true; }

  /** מכניס אקורד יתום לפני האינדקס הנתון.
   *  קריטי: אקורד יתום חייב רווח (או תחילת שורה) לפניו — אחרת
   *  `עולם` + `[G]` נדבקים ל-`עולם[G]`, ובקריאה חוזרת האקורד
   *  נצמד למילה במקום להישאר יתום. */
  function insertStandaloneAt(at, chord) {
    var prev = tokens[at - 1];
    if (prev && prev.type === 'word' && prev.text) {
      tokens.splice(at, 0, { type: 'space', text: ' ', chord: null });
      at++;
    }
    tokens.splice(at, 0, { type: 'word', text: '', chord: chord });
    // רווח גם אחריו כשצמודה מילה — serialize מוסיף אותו ממילא, אבל בלי
    // טוקן אמיתי היתום נראה מודבק למילה עד הרענון הבא. כך מבנה הטוקנים
    // זהה לזה שהפרסר מייצר, וגם האינדקסים יציבים.
    var next = tokens[at + 1];
    if (next && next.type === 'word' && next.text) {
      tokens.splice(at + 1, 0, { type: 'space', text: ' ', chord: null });
    }
  }

  /** הטלת אקורד בין מילים / בתחילת שורה / בסופה → אקורד יתום */
  function dropChordAtInsert(at, chord, sourceIdx) {
    if (!chord) return;
    var srcTok = (sourceIdx !== null && sourceIdx !== undefined && !isNaN(sourceIdx))
      ? tokens[sourceIdx] : null;
    // עוגן לפי זהות-אובייקט: הסרת המקור עלולה להזיז אינדקסים.
    // מדלגים על רווחים — הרווח עצמו עלול להימחק יחד עם מקור יתום.
    var anchor = null;
    for (var i = at; i < tokens.length; i++) {
      if (tokens[i].type !== 'space') { anchor = tokens[i]; break; }
    }
    pushUndo();
    if (srcTok) {
      srcTok.chord = null;
      if (srcTok.text === '') removeEmptyStandalone(srcTok);
    }
    var pos = anchor ? tokens.indexOf(anchor) : -1;
    if (pos < 0) pos = tokens.length;
    insertStandaloneAt(pos, chord);
    selectedIdx = null;
    renderTokenCanvas();
    syncTextarea();
    announce('האקורד ' + chord + ' נוסף בין מילים');
  }

  /** מסיר טוקן אקורד-עצמאי שרוקן מתוכנו, יחד עם רווח צמוד אחד —
   *  אחרת נשאר טוקן-רפאים בלתי-נראה ורווח מיותם בטקסט. */
  function removeEmptyStandalone(tok) {
    var i = tokens.indexOf(tok);
    if (i < 0) return;
    var after  = tokens[i + 1];
    var before = tokens[i - 1];
    if (after && after.type === 'space')       tokens.splice(i, 2);
    else if (before && before.type === 'space') tokens.splice(i - 1, 2);
    else                                        tokens.splice(i, 1);
  }

  /** הטלת אקורד על טוקן-מילה — מפצל אם אפשר, אחרת מתנהג כמו קודם.
   *  sourceIdx = null בהעתקה מהמאגר, או אינדקס טוקן-מקור בהזזה. */
  function dropChordOnWord(targetIdx, chord, clientX, sourceIdx) {
    var tgt = tokens[targetIdx];
    if (!tgt || tgt.type !== 'word' || !chord) return;
    var srcTok = (sourceIdx !== null && sourceIdx !== undefined && !isNaN(sourceIdx))
      ? tokens[sourceIdx] : null;
    if (srcTok === tgt) return;

    var tokEl = tokenCanvas && tokenCanvas.querySelector('.auf-token[data-index="' + targetIdx + '"]');
    var split = splitTargetFor(tokEl, clientX);

    if (!split) {
      // ── ללא פיצול: התנהגות קיימת (הצמדה / החלפה) ──
      if (srcTok) {
        pushUndo();
        srcTok.chord = null;
        tgt.chord = chord;
        if (srcTok.text === '') removeEmptyStandalone(srcTok);
        renderTokenCanvas(); syncTextarea();
      } else {
        assignChord(targetIdx, chord);
      }
      return;
    }

    // ── פיצול: הקו הוא **תחילת** המקטע של האקורד החדש.
    //    האקורד הקיים נשאר במקומו על הראש, והחדש נכנס לזנב → המ[Am]רצע[Eb].
    //    (הכיוון ההפוך נוסה ונדחה: הוא *מזיז* את האקורד הקיים למקטע אחר,
    //     כלומר הטלה אחת משנה שני אקורדים.) ──
    pushUndo();
    var head = tgt.text.slice(0, split.index);
    var tail = tgt.text.slice(split.index);
    // ניקוי המקור נעשה לפני ההוספה; האינדקסים נשלפים מחדש לפי זהות-אובייקט
    var removeSrc = false;
    if (srcTok) {
      if (srcTok.text === '') removeSrc = true; else srcTok.chord = null;
    }
    tgt.text = head;                          // tgt.chord — לא נוגעים
    var at = tokens.indexOf(tgt) + 1;
    tokens.splice(at, 0, { type: 'word', text: tail, chord: chord });
    if (removeSrc) removeEmptyStandalone(srcTok);
    selectedIdx = null;
    renderTokenCanvas();
    syncTextarea();
    announce('האקורד ' + chord + ' נוסף על ' + tail);
  }

  function onMouseDragUp(e) {
    if (!mouseDragActive) return;
    mouseDragActive = false;
    if (mouseDragGhost) { mouseDragGhost.remove(); mouseDragGhost = null; }
    clearDragOver();
    hideSplitMarker();
    if (tokenCanvas) tokenCanvas.classList.remove('auf-token-canvas--dragging');
    document.removeEventListener('mousemove', onMouseDragMove);
    document.removeEventListener('mouseup',   onMouseDragUp);

    // קריטי: ההטלה מחושבת **לפני** סגירת הרווח, על אותו פריסה שהמשתמש ראה.
    // הרווח הפתוח מזיז את המילה 18px; אם סוגרים אותו קודם, ה-X שהיה במרכז
    // הרווח נבלע בתוך המילה השכנה — והאקורד "בין מילים" נדבק אליה.
    // (מסלול המגע כבר עשה זאת בסדר הנכון; רק המאוס היה הפוך.)
    applyDrop(e.clientX, e.clientY, mouseDragChord, mouseDragMoveFromIdx);
    clearInsertGap();
    mouseDragChord       = null;
    mouseDragMoveFromIdx = null;
  }

  /** ביצוע ההטלה בנקודה — משותף למאוס ולמגע.
   *  chord = האקורד הנגרר; sourceIdx = null בהעתקה, אינדקס בהזזה. */
  function applyDrop(x, y, chord, sourceIdx) {
    if (!pointInCanvas(x, y)) return;
    var isMove = (sourceIdx !== null && sourceIdx !== undefined && !isNaN(sourceIdx));
    var dragged = isMove ? (tokens[sourceIdx] && tokens[sourceIdx].chord) : chord;
    if (!dragged) return;

    var t = resolveDrop(x, y);
    if (!t) return;

    if (t.kind === 'insert') {
      dropChordAtInsert(t.at, dragged, isMove ? sourceIdx : null);
      return;
    }

    // ── יעד = מילה ──
    if (isMove && sourceIdx === t.idx) return; // גרירה על עצמו
    if (!isMove && tokens[t.idx] && tokens[t.idx].chord === dragged &&
        !splitTargetFor(t.el, x)) return;     // drop כפול ללא פיצול = no-op
    dropChordOnWord(t.idx, dragged, x, isMove ? sourceIdx : null);
  }

  /* ── Touch drag fallback ── */
  let touchDragChord      = null;
  let touchHighlight      = null;
  let touchDragSourceIdx  = null; // null = palette/rec copy; number = placed-token move
  let touchLastX          = null; // מיקום אחרון של האצבע — touchend לא נושא קואורדינטות
  let touchLastY          = null;
  // גרירת אקורד-מוצמד במגע מתחילה רק אחרי לחיצה-ארוכה (בלי תזוזה) או תזוזה
  // אופקית-בעיקר. החלקה אנכית = גלילת-דף רגילה (קודם החלקה שהתחילה על מילה
  // עם אקורד הזיזה את האקורד ומנעה גלילה). כפתורי המאגר/מועדפים — ללא שינוי.
  const TOUCH_HOLD_MS = 350;
  const TOUCH_SLOP    = 10;
  let touchPending    = null; // {chord, idx, x, y, btn, timer} — ממתין להחלטה

  function clearTouchPending() {
    if (touchPending) { clearTimeout(touchPending.timer); touchPending = null; }
  }
  function activateTouchDrag(p) {
    touchDragChord     = p.chord;
    touchDragSourceIdx = p.idx;
    p.btn.classList.add('auf-dragging');
  }

  document.addEventListener('touchstart', function (e) {
    clearTouchPending();
    const btn = e.target.closest('.auf-quick-btn[data-chord], .auf-rec-btn[data-chord], .auf-token--has-chord[data-chord]');
    if (!btn || !isChordMode) return;
    // הבחן בין token מוצמד (יש data-index) לכפתור מאגר
    const idx = btn.hasAttribute('data-index') ? parseInt(btn.dataset.index, 10) : null;
    if (idx === null) {
      activateTouchDrag({ chord: btn.dataset.chord, idx: null, btn: btn });
      return;
    }
    if (e.touches.length > 1) return;
    const t0 = e.touches[0];
    const p = { chord: btn.dataset.chord, idx: idx, x: t0.clientX, y: t0.clientY, btn: btn, timer: null };
    p.timer = setTimeout(function () {
      if (touchPending !== p) return;
      touchPending = null;
      activateTouchDrag(p);
    }, TOUCH_HOLD_MS);
    touchPending = p;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (touchPending) {
      const tp = e.touches[0];
      if (e.touches.length > 1 || !tp) { clearTouchPending(); return; }
      const dx = tp.clientX - touchPending.x;
      const dy = tp.clientY - touchPending.y;
      if (Math.abs(dx) < TOUCH_SLOP && Math.abs(dy) < TOUCH_SLOP) return; // עדיין מחליטים
      const p = touchPending;
      clearTouchPending();
      if (Math.abs(dx) <= Math.abs(dy)) return; // אנכי = גלילה, לא גרירה
      activateTouchDrag(p);                     // אופקי = גרירה
    }
    if (!touchDragChord) return;
    // מנע גלילת-דף במקביל לגרירה — אחרת התוכן זז מתחת לאצבע ו-drop נוחת ביעד שגוי
    e.preventDefault();
    if (tokenCanvas) tokenCanvas.classList.add('auf-token-canvas--dragging');
    const touch = e.touches[0];
    touchLastX = touch.clientX;
    touchLastY = touch.clientY;
    clearDragOver();
    updateDropFeedback(touch.clientX, touch.clientY);
  }, { passive: false });

  document.addEventListener('touchend', function () {
    clearTouchPending();
    if (!touchDragChord) return;
    clearDragOver();
    if (touchLastX !== null && touchLastY !== null) {
      applyDrop(touchLastX, touchLastY, touchDragChord, touchDragSourceIdx);
    }
    touchHighlight = null;
    document.querySelectorAll('.auf-dragging').forEach(function (el) {
      el.classList.remove('auf-dragging');
    });
    if (tokenCanvas) tokenCanvas.classList.remove('auf-token-canvas--dragging');
    hideSplitMarker();
    clearInsertGap();
    touchDragChord     = null;
    touchDragSourceIdx = null;
    touchLastX         = null;
    touchLastY         = null;
  });

  // ניקוי במקרה של ביטול מגע (שיחה נכנסת, מחווה מערכת וכו')
  document.addEventListener('touchcancel', function () {
    clearTouchPending();
    if (!touchDragChord) return;
    clearDragOver();
    touchHighlight = null;
    document.querySelectorAll('.auf-dragging').forEach(function (el) {
      el.classList.remove('auf-dragging');
    });
    if (tokenCanvas) tokenCanvas.classList.remove('auf-token-canvas--dragging');
    hideSplitMarker();
    clearInsertGap();
    touchDragChord     = null;
    touchDragSourceIdx = null;
    touchLastX         = null;
    touchLastY         = null;
  });

  /* ══════════════════════════════════════════════════════════
     מודול 4: עורך אקורדים ויזואלי
     ══════════════════════════════════════════════════════════ */
  let tokens    = [];
  let selectedIdx = null;
  let isChordMode = false;

  /* ── Undo / redo ── */
  let undoStack = [];
  let redoStack = [];

  function cloneTokens(toks) {
    return toks.map(function (t) { return Object.assign({}, t); });
  }

  function pushUndo() {
    undoStack.push(cloneTokens(tokens));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateUndoRedoBtns();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(cloneTokens(tokens));
    tokens = undoStack.pop();
    selectedIdx = null;
    renderTokenCanvas();
    syncTextarea();
    updateUndoRedoBtns();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(cloneTokens(tokens));
    tokens = redoStack.pop();
    selectedIdx = null;
    renderTokenCanvas();
    syncTextarea();
    updateUndoRedoBtns();
  }

  function updateUndoRedoBtns() {
    var u = g(ids.undoBtn);
    var r = g(ids.redoBtn);
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
  }

  /** פרסור טקסט → tokens
   * סדר זיהוי:
   *   group 1+2: [chord]word (ישירות, ללא רווח) — פורמט ישן לתאימות לאחור
   *   group 3:   [chord] לבדו — word[chord] (חדש) אם אחרי מילה ללא אקורד,
   *              אחרת standalone (אקורד עצמאי בין מילים)
   *   groups 4-6: שורה חדשה / מילה / רווח
   */
  function parseText(text) {
    const result = [];
    const re = /(\[[^\]]+\])([^\s\[\]\n]+)|(\[[^\]]+\])|(\n)|([^\s\[\]\n]+)|( +)/g;
    let match;

    while ((match = re.exec(text)) !== null) {
      if (match[1] && match[2]) {
        const chord = match[1].slice(1, -1);
        const last = result[result.length - 1];
        if (last && last.type === 'word' && last.text && !last.chord) {
          // פורמט רציף (אקורד-באמצע-מילה): המ[Eb]רצע — הסוגריים צמודים לטקסט
          // משני הצדדים, האקורד שייך להברה שלפניו וההמשך הוא הברה חדשה (טוקן
          // צמוד ללא רווח; serialize מחזיר בדיוק את המחרוזת המקורית)
          last.chord = chord;
          result.push({ type: 'word', text: match[2], chord: null });
        } else {
          // פורמט ישן: [chord]word בתחילת מילה — האקורד על המילה שאחריו
          result.push({ type: 'word', text: match[2], chord: chord });
        }
      } else if (match[3]) {
        // [chord] לבדו
        const chord = match[3].slice(1, -1);
        const last = result[result.length - 1];
        if (last && last.type === 'word' && !last.chord && last.text) {
          last.chord = chord; // word[chord] — פורמט חדש, צמד למילה הקודמת
        } else {
          result.push({ type: 'word', text: '', chord }); // standalone
        }
      } else if (match[4]) {
        result.push({ type: 'newline', text: '\n', chord: null });
      } else if (match[5]) {
        result.push({ type: 'word', text: match[5], chord: null });
      } else if (match[6]) {
        result.push({ type: 'space', text: match[6], chord: null });
      }
    }
    return result;
  }

  /** tokens → טקסט גולמי
   * round-trip אידמפוטנטי: אקורד-עצמאי פולט רווח-סיומת **רק** כשמילה אמיתית צמודה
   * אחריו ישירות (בלי טוקן-רווח) — אחרת `[Am]word` היה ממוזג לפורמט-ישן. לפני
   * רווח / newline / סוף-מחרוזת / standalone אחר — אין רווח, ולכן serialize→parse יציב. */
  function serializeTokens(toks) {
    return toks.map(function (t, i) {
      if (t.type === 'newline') return '\n';
      if (t.type === 'space') {
        return t.text;
      }
      if (t.type === 'word') {
        if (!t.text && t.chord) {
          const next = toks[i + 1];
          const needsSpace = next && next.type === 'word' && next.text; // מילה אמיתית צמודה
          return '[' + t.chord + ']' + (needsSpace ? ' ' : '');
        }
        return t.text + (t.chord ? '[' + t.chord + ']' : '');
      }
      return '';
    }).join('');
  }

  /** בונה canvas טוקנים — ללא per-token drag listeners (canvas מטפל) */
  function renderTokenCanvas() {
    if (!tokenCanvas) return;
    tokenCanvas.innerHTML = '';
    tokens.forEach(function (tok, idx) {
      if (tok.type === 'newline') {
        tokenCanvas.appendChild(document.createElement('br'));
        return;
      }
      if (tok.type === 'space') {
        const sp = document.createElement('span');
        sp.className = 'auf-space';
        sp.textContent = tok.text;
        tokenCanvas.appendChild(sp);
        // אין יותר אלמנטי `.auf-gap` — יעד ההטלה מחושב גיאומטרית (מודול 3a),
        // וכך הפריסה לא זזה בתחילת גרירה ואין אזורים-מתים
        return;
      }

      // word token (כולל standalone chord: tok.text === '')
      const isStandalone = (!tok.text && !!tok.chord);
      const wrap = document.createElement('span');
      wrap.className = 'auf-token' + (isStandalone ? ' auf-token--standalone' : '');

      // חצאי מילה מפוצלת (טוקני-מילה צמודים ללא רווח) — מאפסים את ה-padding
      // בצד המחובר כדי שהמילה תיראה רציפה ולא "המ רצע"
      if (tok.text) {
        const prevW = tokens[idx - 1];
        const nextW = tokens[idx + 1];
        if (prevW && prevW.type === 'word' && prevW.text) wrap.classList.add('auf-token--joined-prev');
        if (nextW && nextW.type === 'word' && nextW.text) wrap.classList.add('auf-token--joined-next');
      }
      if (tok.chord) {
        wrap.classList.add('auf-token--has-chord');
        wrap.dataset.chord = tok.chord;
        wrap.style.cursor = 'grab';
        wrap.addEventListener('mousedown', (function (capturedIdx, capturedChord) {
          return function (e) {
            if (!isChordMode) return;
            startMouseDragPending(e, capturedChord, capturedIdx);
          };
        })(idx, tok.chord));
      }
      wrap.dataset.index = idx;
      wrap.tabIndex = 0;
      wrap.setAttribute('role', 'button');
      wrap.setAttribute('aria-pressed', idx === selectedIdx ? 'true' : 'false');
      wrap.setAttribute('aria-label', (tok.chord ? tok.chord + ' ' : '') + (tok.text || ''));

      const chordSpan = document.createElement('span');
      chordSpan.className = 'auf-token__chord';
      chordSpan.textContent = tok.chord || '';
      wrap.appendChild(chordSpan);

      if (!isStandalone) {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'auf-token__word';
        wordSpan.textContent = tok.text || '\u200B';
        wrap.appendChild(wordSpan);
      }

      // click / keyboard — בחירה + מחיקה
      wrap.addEventListener('click', function (e) {
        e.stopPropagation();
        selectToken(idx);
      });
      wrap.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        if (tok.chord) removeChordFromToken(idx);
      });
      wrap.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectToken(idx); }
        if ((e.key === 'Delete' || e.key === 'Backspace') && tok.chord) {
          e.preventDefault();
          removeChordFromToken(idx);
        }
      });

      tokenCanvas.appendChild(wrap);
    });
  }

  function deselectAll() {
    if (!tokenCanvas) return;
    tokenCanvas.querySelectorAll('.auf-token--selected').forEach(function (el) {
      el.classList.remove('auf-token--selected');
      el.setAttribute('aria-pressed', 'false');
    });
    selectedIdx = null;
  }

  function selectToken(idx) {
    const wasSelected = (selectedIdx === idx);
    // בטל בחירה קודמת
    deselectAll();
    if (wasSelected) { return; } // לחיצה חוזרת על אותו טוקן = ביטול בחירה (toggle)

    selectedIdx = idx;
    const el = tokenCanvas.querySelector('[data-index="' + idx + '"]');
    if (el) {
      el.classList.add('auf-token--selected');
      el.setAttribute('aria-pressed', 'true');
      el.focus();
    }
  }

  function assignChord(idx, chord) {
    if (!tokens[idx] || tokens[idx].type !== 'word') return;
    if (tokens[idx].chord === chord) return; // מניעת drop כפול
    pushUndo();
    const targetWord = tokens[idx].text;
    tokens[idx].chord = chord;
    selectedIdx = null;
    renderTokenCanvas();
    syncTextarea();
    announce('האקורד ' + chord + ' נוסף' + (targetWord ? ' למילה ' + targetWord : ''));
    // flash animation
    requestAnimationFrame(function () {
      const el = tokenCanvas.querySelector('[data-index="' + idx + '"]');
      if (el) {
        el.classList.add('auf-token--flash');
        setTimeout(function () { el.classList.remove('auf-token--flash'); }, 500);
      }
    });
  }

  function removeChordFromToken(idx) {
    if (!tokens[idx] || tokens[idx].type !== 'word') return;
    if (!tokens[idx].chord) return;
    pushUndo();
    const removedChord = tokens[idx].chord;
    if (tokens[idx].text === '') {
      // standalone chord token — remove entirely
      tokens.splice(idx, 1);
    } else {
      tokens[idx].chord = null;
    }
    selectedIdx = null;
    renderTokenCanvas();
    syncTextarea();
    announce('האקורד ' + removedChord + ' הוסר');
  }

  function syncTextarea() {
    if (textareaEl) textareaEl.value = serializeTokens(tokens);
  }

  /* ── כניסה / יציאה ממצב אקורדים ── */
  function enterChordMode() {
    if (!textareaEl || !tokenCanvas) return;
    tokens = parseText(textareaEl.value || '');
    renderTokenCanvas();
    isChordMode = true;
    textPanel.hidden    = true;
    chordPanel.hidden   = false;
    previewPanel.hidden = true;
    modeBtnText.setAttribute('aria-pressed', 'false');
    modeBtnText.classList.remove('auf-mode-btn--active');
    modeBtnChords.setAttribute('aria-pressed', 'true');
    modeBtnChords.classList.add('auf-mode-btn--active');
    selectedIdx = null;
  }

  function exitChordMode() {
    syncTextarea();
    isChordMode = false;
    textPanel.hidden    = false;
    chordPanel.hidden   = true;
    previewPanel.hidden = true;
    modeBtnText.setAttribute('aria-pressed', 'true');
    modeBtnText.classList.add('auf-mode-btn--active');
    modeBtnChords.setAttribute('aria-pressed', 'false');
    modeBtnChords.classList.remove('auf-mode-btn--active');
  }

  modeBtnText   && modeBtnText.addEventListener('click',   function () { if (isChordMode)  exitChordMode(); });
  modeBtnChords && modeBtnChords.addEventListener('click', function () { if (!isChordMode) enterChordMode(); });

  /* ── הזרקת כפתורי Undo / Redo ── */
  (function injectUndoRedo() {
    // חכה עד שה-DOM מוכן; נוסיף ליד כפתורי mode
    var modeBar = modeBtnText && modeBtnText.parentElement;
    if (!modeBar) return;
    if (g(ids.undoBtn)) return; // כבר קיים

    var undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.id = ids.undoBtn;
    undoBtn.className = 'auf-mode-btn';
    undoBtn.title = 'ביטול (Ctrl+Z)';
    undoBtn.textContent = '↩';
    undoBtn.disabled = true;
    undoBtn.addEventListener('click', undo);

    var redoBtn = document.createElement('button');
    redoBtn.type = 'button';
    redoBtn.id = ids.redoBtn;
    redoBtn.className = 'auf-mode-btn';
    redoBtn.title = 'חזור (Ctrl+Y)';
    redoBtn.textContent = '↪';
    redoBtn.disabled = true;
    redoBtn.addEventListener('click', redo);

    modeBar.appendChild(undoBtn);
    modeBar.appendChild(redoBtn);
  })();

  /* ── קיצורי מקלדת Ctrl+Z / Ctrl+Y ── */
  document.addEventListener('keydown', function (e) {
    if (!isChordMode) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault(); redo();
    }
  });

  /* ── ביטול בחירה בלחיצה על canvas ריק ── */
  tokenCanvas && tokenCanvas.addEventListener('click', function (e) {
    if (!e.target.closest('.auf-token')) {
      deselectAll();
    }
  });

  /* ── ביטול בחירה במקש Escape (מקבילת-מקלדת) ── */
  document.addEventListener('keydown', function (e) {
    if (!isChordMode) return;
    if (e.key === 'Escape' && selectedIdx !== null) {
      e.preventDefault();
      deselectAll();
      announce('הבחירה בוטלה');
    }
  });

  /* ══════════════════════════════════════════════════════════
     מודול 5: לחיצה על אקורד → שיוך / הכנסה בטקסט
     ══════════════════════════════════════════════════════════ */
  function handleChordAction(chord, fromLibrary) {
    if (fromLibrary) {
      // מהטבלה — רק הוסף לאקורדים שנבחרו, אל תכניס לטקסט
      ensureRecommended(chord);
      return;
    }
    if (isChordMode && selectedIdx !== null) {
      assignChord(selectedIdx, chord);
    } else if (!isChordMode && textareaEl) {
      insertAtCursor(textareaEl, '[' + chord + ']');
    }
  }

  function insertAtCursor(ta, text) {
    const s = ta.selectionStart || 0;
    const e = ta.selectionEnd   || 0;
    ta.value = ta.value.substring(0, s) + text + ta.value.substring(e);
    ta.selectionStart = ta.selectionEnd = s + text.length;
    ta.focus();
  }

  /* ══════════════════════════════════════════════════════════
     מודול 6: Long-press handler (קצר=הכנס, ארוך=הכנס+רווח)
     ══════════════════════════════════════════════════════════ */
  const LONG_MS = 420;
  let pressTimer = null;
  let pressChord = null;
  let pressLong  = false;

  // האם היעד בתוך טבלת-הספרייה של *המופע הזה* (ids.libraryModal), ולא מזהה קשיח —
  // אחרת במודאל-העריכה (pe-library-modal) הקשה בטבלה דרסה את אקורד המילה הנבחרת.
  function inLibraryModal(t) { return !!(modal && t && modal.contains(t)); }

  function registerPressHandlers(container) {
    if (!container) return;

    function startP(chord) {
      pressChord = chord; pressLong = false;
      pressTimer = setTimeout(function () { pressLong = true; }, LONG_MS);
    }
    function cancelP() { clearTimeout(pressTimer); pressChord = null; }

    function endP(e, fromLib) {
      clearTimeout(pressTimer);
      if (!pressChord) return;
      const chord = pressChord; pressChord = null;

      const recBtn   = e.target.closest('.auf-rec-btn');
      const editing  = recBar && recBar.classList.contains('auf-rec-bar--editing');
      const onStar   = e.target.closest('.auf-quick-btn__star, .auf-rec-btn__x');
      const onRemove = e.target.closest('.auf-rec-btn__remove');

      if (onStar) { toggleRecommended(chord); return; }
      // הסרה ממועדפים: × מפורש, או הקשה כלשהי על כפתור-מועדף במצב-עריכה.
      // יעד-מגע מלא: במובייל קשה לפגוע בגליף ★/× הזעיר, וההחמצה נפלה בעבר
      // ל-handleChordAction שהכניס את האקורד לשיר במקום להסירו.
      if (onRemove || (recBtn && editing)) {
        const i = recommendedChords.indexOf(chord);
        if (i > -1) { recommendedChords.splice(i, 1); saveRecommended(); renderRecommended(); }
        return;
      }

      if (pressLong && !isChordMode) {
        insertAtCursor(textareaEl, ' [' + chord + ']');
      } else {
        handleChordAction(chord, fromLib);
      }
    }

    // mouse
    container.addEventListener('mousedown', function (e) {
      const btn = e.target.closest('.auf-quick-btn, .auf-rec-btn');
      if (!btn) return;
      startP(btn.dataset.chord);
    });
    container.addEventListener('mouseup', function (e) {
      const btn = e.target.closest('.auf-quick-btn, .auf-rec-btn');
      if (!btn) { cancelP(); return; }
      endP(e, inLibraryModal(e.target));
    });
    container.addEventListener('mouseleave', cancelP);

    // touch
    container.addEventListener('touchstart', function (e) {
      const btn = e.target.closest('.auf-quick-btn, .auf-rec-btn');
      if (!btn) return;
      e.preventDefault();
      startP(btn.dataset.chord);
    }, { passive: false });
    container.addEventListener('touchend', function (e) {
      const btn = e.target.closest('.auf-quick-btn, .auf-rec-btn');
      if (!btn) { cancelP(); return; }
      // כמו במאוס: לחיצה מתוך טבלת הספרייה רק מוסיפה למועדפים (לא מכניסה לשיר)
      endP(e, inLibraryModal(e.target));
    });
    container.addEventListener('touchcancel', cancelP);
  }

  registerPressHandlers(form);
  registerPressHandlers(modal);

  /* ── כפתורי quick chords בטופס (drag source) ── */
  form.querySelectorAll('.auf-quick-btn').forEach(function (btn) {
    const chord = btn.dataset.chord;
    btn.addEventListener('mousedown', function (e) {
      if (!isChordMode) return;
      startMouseDragPending(e, chord);
    });
  });

  /* ── עריכת מועדפים ── */
  editRecBtn && editRecBtn.addEventListener('click', function () {
    const editing = recBar.classList.toggle('auf-rec-bar--editing');
    editRecBtn.setAttribute('aria-pressed', editing ? 'true' : 'false');
    editRecBtn.textContent = editing ? 'סיום עריכה' : 'עריכת אקורדים';
    renderRecommended();
  });

  /* ── הוסף אקורד מותאם ── */
  function addCustomChord() {
    if (!addChordInput) return;
    const val = addChordInput.value.trim();
    if (val) { ensureRecommended(val); addChordInput.value = ''; addChordInput.focus(); }
  }
  addChordBtn   && addChordBtn.addEventListener('click', addCustomChord);
  addChordInput && addChordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addCustomChord(); }
  });

  /* ══════════════════════════════════════════════════════════
     מודול 7: ספריית אקורדים (מודאל)
     ══════════════════════════════════════════════════════════ */
  function renderLibrary(filter) {
    if (!libGrid) return;
    libGrid.innerHTML = '';
    filter = (filter || '').toLowerCase().replace(/♯/g, '#');

    Object.keys(fullChordLibrary).forEach(function (root) {
      const chords = (fullChordLibrary[root] || []).filter(function (c) {
        return !filter || c.toLowerCase().startsWith(filter) || root.toLowerCase().startsWith(filter);
      });
      if (!chords.length) return;

      const group = document.createElement('div');
      group.className = 'auf-lib-group';
      const h4 = document.createElement('h4');
      h4.className = 'auf-lib-group__title';
      h4.textContent = root;
      group.appendChild(h4);
      const wrap = document.createElement('div');
      wrap.className = 'auf-lib-group__chords';

      chords.forEach(function (chord) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'auf-quick-btn';
        btn.dataset.chord = chord;
        btn.innerHTML =
          '<span class="auf-quick-btn__label">' + chord + '</span>' +
          '<span class="auf-quick-btn__star" aria-hidden="true">' + UC_ICON('star') + '</span>';

        btn.addEventListener('mousedown', (function (c) {
          return function (e) {
            if (!isChordMode) return;
            startMouseDragPending(e, c);
          };
        })(chord));

        wrap.appendChild(btn);
      });

      group.appendChild(wrap);
      libGrid.appendChild(group);
    });
    updateQuickStars();
  }

  /* פתיחה/סגירה מרוכזות — כל נתיבי הסגירה חייבים לשחרר גם את נעילת-הגלילה */
  let prevBodyOverflow = '';
  function libraryIsOpen() { return modal && !modal.hasAttribute('hidden'); }

  function openLibrary() {
    if (!modal) return;
    modal.removeAttribute('hidden');
    renderLibrary();
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // מונע גלילת-רקע מתחת לגיליון
    if (libSearch) {
      libSearch.value = '';
      // מיקוד אוטומטי רק במכשיר עם עכבר — במגע הוא מעלה את המקלדת,
      // שמכרסמת את האזור הנראה ודוחפת את הכותרת (וה-×) מחוץ למסך
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) libSearch.focus();
    }
  }

  function closeLibrary() {
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.body.style.overflow = prevBodyOverflow;
    if (openLibBtn) openLibBtn.focus();
  }

  if (openLibBtn && modal) openLibBtn.addEventListener('click', openLibrary);
  libSearch && libSearch.addEventListener('input', debounce(function () {
    renderLibrary(libSearch.value);
  }, 200));
  if (modal) {
    const overlay = modal.querySelector('.auf-modal__overlay');
    const closeBtn = modal.querySelector('.auf-modal__close');
    overlay && overlay.addEventListener('click', closeLibrary);
    closeBtn && closeBtn.addEventListener('click', closeLibrary);
    // Escape — מוצא-חירום נוסף אם ה-× לא נגיש משום סיבה
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && libraryIsOpen()) { e.preventDefault(); closeLibrary(); }
    });
  }

  /* ══════════════════════════════════════════════════════════
     מודול 8: תצוגה מקדימה חיה
     ══════════════════════════════════════════════════════════ */
  previewBtn && previewBtn.addEventListener('click', function () {
    if (isChordMode) syncTextarea();
    const content = textareaEl ? textareaEl.value : '';
    if (!content.trim()) return;

    if (!previewPanel.hidden) {
      previewPanel.hidden = true;
      previewBtn.innerHTML = UC_ICON('eye') + ' תצוגה חיה';
      return;
    }

    previewPanel.hidden = false;
    if (previewEl) previewEl.textContent = 'טוען...';
    previewBtn.innerHTML = UC_ICON('x') + ' סגור תצוגה';

    const titleVal     = (document.getElementById('auf-title')     || {}).value || '';
    const performerVal = (document.getElementById('auf-performer') || {}).value || '';
    const fd = new FormData();
    fd.append('action',         'achord_live_preview');
    fd.append('chords_content', content);
    fd.append('song_title',     titleVal);
    fd.append('song_performer', performerVal);
    fd.append('achord_nonce',   DATA.nonce || '');
    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        if (previewEl) previewEl.innerHTML = html || '<p style="color:#c0392b">שגיאה</p>';
      })
      .catch(function () { if (previewEl) previewEl.textContent = 'שגיאת רשת'; });
  });

  /* ══════════════════════════════════════════════════════════
     מודול 9: סקשנים מתכווצים
     ══════════════════════════════════════════════════════════ */
  form.querySelectorAll('.auf-collapsible-trigger').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      const body = trigger.closest('.auf-section').querySelector('.auf-collapsible-body');
      if (!body) return;
      if (expanded) {
        body.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      } else {
        body.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        // ABC — רנדר רק בפתיחה ראשונה
        if (trigger.closest('[data-section="abc"]') && abcPreview && abcTextarea) {
          renderAbcPreview(abcTextarea.value);
        }
      }
    });
  });

  abcTextarea && abcPreview && (function () {
    let t;
    abcTextarea.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { renderAbcPreview(abcTextarea.value); }, 600);
    });
  })();

  function renderAbcPreview(code) {
    if (!abcPreview) return;
    if (!code.trim()) { abcPreview.innerHTML = ''; return; }
    if (window.ABCJS) ABCJS.renderAbc(abcPreview, code, { responsive: 'resize' });
  }

  transposeRange && transposeOutput && transposeRange.addEventListener('input', function () {
    transposeOutput.textContent = transposeRange.value;
  });

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.auf-pdf-toggle');
    if (!btn) return;
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const exp = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', exp ? 'false' : 'true');
    btn.textContent = exp ? 'הצג' : 'הסתר';
    target.style.display = exp ? 'none' : 'block';
  });

  /* ══════════════════════════════════════════════════════════
     מודול 10: מילוי מוקדם
     ══════════════════════════════════════════════════════════ */
  (function () {
    if (!prefill || !prefill.allow) return;
    function setField(name, val) {
      if (!val && val !== 0) return;
      const el = form.querySelector('[name="' + name + '"]');
      if (el && !el.value) el.value = val;
    }
    setField('title',      prefill.title);
    setField('performer',  prefill.performer);
    setField('lyrics_by',  prefill.lyrics_by);
    setField('music_by',   prefill.music_by);
    if (prefill.content && textareaEl && !textareaEl.value) {
      textareaEl.value = prefill.content;
    }
    if (prefill.capo !== undefined && prefill.capo !== '') {
      const pill = form.querySelector(
        '.auf-capo-pill input[value="' + prefill.capo + '"]'
      );
      if (pill) pill.checked = true;
    }
    if (Array.isArray(prefill.reco) && prefill.reco.length) {
      recommendedChords = prefill.reco.slice();
      saveRecommended();
    }
  })();

  /* ══════════════════════════════════════════════════════════
     מודול 11: שליחת טופס
     ══════════════════════════════════════════════════════════ */
  // שליחת הטופס. opts מאפשר override של פעולת ה-AJAX / הודעות / חובת מבצע,
  // כדי שאותו טופס ישמש גם לשמירה במחברת וגם ל"הצע לפרסום באתר".
  function submitForm(opts) {
    opts = opts || {};
    if (isChordMode) exitChordMode();

    const title     = (form.querySelector('[name="title"]')?.value || '').trim();
    const performer = (form.querySelector('[name="performer"]')?.value || '').trim();
    const content   = (textareaEl?.value || '').trim();
    const reqPerf   = ('requirePerformer' in opts) ? opts.requirePerformer
                                                   : (DATA.requirePerformer !== false);
    const missing   = [];
    if (!title)                missing.push('שם השיר');
    if (reqPerf && !performer) missing.push('מבצע/ת');
    if (!content)              missing.push('מילים ואקורדים');

    if (missing.length) {
      showMsg('error', 'יש למלא: ' + missing.join(', '));
      [['title', title], ['performer', performer]].forEach(function (p) {
        if (!p[1]) {
          const el = form.querySelector('[name="' + p[0] + '"]');
          if (el) {
            el.classList.add('auf-field-error');
            el.addEventListener('input', function () {
              el.classList.remove('auf-field-error');
            }, { once: true });
          }
        }
      });
      return;
    }

    const btn = opts.btn || submitBtn;
    if (btn) btn.disabled = true;
    showMsg('loading', opts.loadingMsg || 'שולח...');

    const fd = new FormData(form);
    fd.set('action', opts.action || DATA.submitAction || 'achord_submit_song');

    const okMsg = opts.okMsg || DATA.successMsg || 'השיר הועלה בהצלחה ונשלח לבדיקה!';

    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (btn) btn.disabled = false;
        if (d.success) {
          showMsg('success', okMsg);
          // הפניה חזרה לרשימת המחברת אחרי שמירה/שליחה
          var redirect = (d.data && d.data.redirect) || opts.redirectUrl || DATA.redirectUrl;
          if (redirect) setTimeout(function () { window.location.href = redirect; }, 900);
        } else {
          showMsg('error', d.data || 'שגיאה בשליחה');
        }
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        showMsg('error', 'שגיאת רשת — נסה שוב');
      });
  }

  // מצב embed (מודאל עריכה/הצעה): אין טופס-שליחה משלו; main.js קורא ל-getContent()
  // ושולח דרך achord_save_personal_version / achord_submit_proposal. לכן מדלגים
  // על חיווט השליחה + new FormData(form) (form הוא div בהקשר הזה).
  if (!embed) form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitForm();
  });

  // מצב-מחברת בלבד: "🌐 הצע לפרסום באתר" — שומר עותק אישי ושולח לאישור (דורש מבצע/ת)
  var publishBtn = g(ids.publishBtn);
  if (!embed && publishBtn && DATA.publishAction) {
    publishBtn.addEventListener('click', function () {
      submitForm({
        action: DATA.publishAction,
        okMsg: DATA.publishMsg || 'נשלח לאישור! הגרסה שלך שמורה במחברת.',
        requirePerformer: true,
        btn: publishBtn,
        loadingMsg: 'שולח לאישור...'
      });
    });
  }

  function showMsg(type, text) {
    if (!msgEl) return;
    msgEl.className = 'auf-msg auf-msg--' + type;
    if (type === 'success') {
      // אייקון וי מורכב כ-HTML; הטקסט עצמו תמיד מגיע מברירת-מחדל קבועה
      // או מ-DATA.successMsg/DATA.publishMsg (מוגדרים ב-PHP, לא קלט משתמש)
      msgEl.innerHTML = '';
      msgEl.insertAdjacentHTML('afterbegin', UC_ICON('check') + ' ');
      msgEl.appendChild(document.createTextNode(text));
    } else {
      msgEl.textContent = text;
    }
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── אתחול ── */
  renderRecommended();

  /* ── API למופע embed (main.js משתמש בו במודאל העריכה/הצעה) ── */
  return {
    // טוען טקסט-גלם (פורמט מילה[Am]) לעורך; אם במצב-אקורדים, מפענח ומצייר מחדש.
    setContent: function (text) {
      if (!textareaEl) return;
      textareaEl.value = text || '';
      if (isChordMode) { tokens = parseText(textareaEl.value); renderTokenCanvas(); }
    },
    // מחזיר את הטקסט המסודר; אם במצב-אקורדים, מסנכרן קודם קנבס→טקסט.
    getContent: function () {
      if (isChordMode) syncTextarea();
      return textareaEl ? textareaEl.value : '';
    },
    focus: function () { if (textareaEl) textareaEl.focus(); },
    inChordMode: function () { return isChordMode; }
  };
  } // end initAchordEditor

  // חשיפה גלובלית + הפעלה אוטומטית לטופס-ההעלאה המקורי (תאימות לאחור).
  window.initAchordEditor = initAchordEditor;
  if (document.getElementById('achord-upload-form')) initAchordEditor();

})();
