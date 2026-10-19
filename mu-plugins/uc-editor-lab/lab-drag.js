/*
 * UC Editor Lab — גרירת אקורדים (Round 6, בעלים: G). גלובל: UCLab.drag.
 *
 *   UCLab.drag.attach(root, ctx) → { destroy(), cancel(), isDragging() }
 *     root = .lab-chordstep (האצלה על root; שורד ציור-מחדש)
 *     ctx  = { getTokens(), commit(opsResult, message) → bool, busy() → bool }
 *   אידמפוטנטי: קריאה שנייה על אותו root מחזירה את אותה ידית (root[data-drag="1"]).
 *
 * ידית-גרירה: תווית-האקורד (.lab-cs-chord) של .lab-cs-word.has-chord בלבד. מילים לא נגררות.
 *   עכבר/עט: לחיצה + תזוזה ≥6px. שחרור לפני כן = קליק רגיל (פותח את הגיליון).
 *   מגע: לחיצה-ארוכה 350ms ואז גרירה. תזוזה >8px לפני כן = גלילה (לעולם לא נחסמת).
 *         גלילת-הדף נחסמת רק בזמן גרירה פעילה (touchmove לא-פסיבי על root).
 * יעדים (גאומטריה של המלבנים, לא caretFromPoint):
 *   מעל טקסט של חלק-מילה → אות-גבול k הקרובה (UCLab.ops.letters — ניקוד לא נפרד מהאות)
 *       0<k<n וחלק עם אקורד (ולא המקור) → {kind:'split', i, k}
 *       k==n וחלק-צמוד אחריו → {kind:'word', i:next} · אחרת → {kind:'word', i}
 *   מעל אקורד-עצמאי (♪) → {kind:'word', i}
 *   ברווח בין מילים / תחילת שורה → {kind:'insert', at: המילה שאחרי} · סוף שורה → at = ה-newline
 *   מחוץ ל-root → אין יעד (שחרור = ביטול)
 * ההטלה מחושבת לפני סגירת הרווח הפתוח (על הפריסה שהמשתמש ראה). הקליק שאחרי ההטלה נבלע.
 */
(function () {
  'use strict';
  var UCLab = window.UCLab = window.UCLab || {};

  var MOUSE_THRESHOLD = 6;      // px עד שהלחיצה הופכת לגרירה
  var HOLD_MS = 350;            // לחיצה-ארוכה במגע
  var TOUCH_SLOP = 8;           // px — תזוזה לפני ההפעלה = גלילה
  var EDGE = 64;                // px מקצה-החלון — גלילה אוטומטית
  var MAX_SPEED = 18;           // px לפריים
  var ROOT_MARGIN = 8;          // סלחנות סביב root
  var GHOST_LIFT_MOUSE = 12;    // הרוח מעל הסמן
  var GHOST_LIFT_TOUCH = 46;    // ...ומעל האצבע (שתישאר גלויה)
  var SWALLOW_MS = 300;          // הקליק שאחרי שחרור מגיע מיד (עכבר) או לא בכלל (מגע עם preventDefault)

  function isTextTok(t) { return !!t && t.type === 'word' && !!t.text; }
  function reducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function editableFocused() {
    var a = document.activeElement;
    return !!(a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
  }
  function ser(toks) { return UCLab.serialize ? UCLab.serialize(toks) : JSON.stringify(toks); }
  function lettersOf(text) {
    if (UCLab.ops && UCLab.ops.letters) return UCLab.ops.letters(text);
    return Array.from(String(text || '')).map(function (s, n) { return { s: s, at: n }; });
  }

  function attach(root, ctx) {
    if (!root || !ctx) return { destroy: function () {}, cancel: function () {}, isDragging: function () { return false; } };
    if (root.__ucDrag) return root.__ucDrag;

    var st = null;          // { type:'mouse'|'touch', mode:'pending'|'active'|'cancelled', from, chord, x0,y0, x,y, pid|tid, timer, ghost, target }
    var marker = null, overEl = null, gap = null;   // gap = { el, cls }
    var rafId = 0, swallowTimer = 0;
    var doc = document;

    /* ── עזרים ── */
    function toks() { return ctx.getTokens() || []; }
    function handleFor(node) {
      if (!node || !node.closest) return null;
      var lab = node.closest('.lab-cs-chord');
      var b = lab && lab.closest('.lab-cs-word');
      if (!b || !root.contains(b) || !b.classList.contains('has-chord') || b.dataset.i == null) return null;
      var i = +b.dataset.i, t = toks()[i];
      if (!t || t.type !== 'word' || !t.chord) return null;
      return { i: i, chord: t.chord, el: b };
    }
    function canStart() {
      try { if (ctx.busy && ctx.busy()) return false; } catch (e) { return false; }
      return !editableFocused();
    }
    function btnFor(i) { return root.querySelector('.lab-cs-word[data-i="' + i + '"]'); }
    function textNode(b) { var s = b && b.querySelector('.lab-cs-text'); var n = s && s.firstChild; return n && n.nodeType === 3 ? n : null; }
    function rectOf(node, a, z) {
      var r = doc.createRange(); r.setStart(node, a); r.setEnd(node, z);
      return r.getBoundingClientRect();
    }
    /** אזור-הטקסט של כפתור (לאקורד-עצמאי: כל הכפתור) */
    function zoneOf(b, t, br) {
      if (!isTextTok(t)) return { left: br.left, right: br.right };
      var n = textNode(b);
      if (!n || !n.data.length) return { left: br.left, right: br.right };
      var rr = rectOf(n, 0, n.data.length);
      return rr.width ? { left: rr.left, right: rr.right } : { left: br.left, right: br.right };
    }
    function lineRtl(b) {
      var l = b && b.closest('.lab-cs-line');
      try { return getComputedStyle(l || root).direction !== 'ltr'; } catch (e) { return true; }
    }

    /** שורות חזותיות (שורת-שיר עם flex-wrap יכולה להתפצל לכמה) */
    function rows() {
      var T = toks(), list = [];
      Array.prototype.forEach.call(root.querySelectorAll('.lab-cs-word[data-i]'), function (b) {
        var i = +b.dataset.i, t = T[i];
        if (!t || t.type !== 'word') return;
        var r = b.getBoundingClientRect();
        if (!r.width && !r.height) return;
        list.push({ el: b, i: i, rect: r, zone: zoneOf(b, t, r), line: b.parentNode });
      });
      list.sort(function (a, b) { return a.i - b.i; });
      var out = [];
      list.forEach(function (it) {
        var row = null;
        for (var q = out.length - 1; q >= 0; q--) {
          var R = out[q];
          if (R.line === it.line && it.rect.top < R.bottom - 2 && it.rect.bottom > R.top + 2) { row = R; break; }
        }
        if (!row) { row = { line: it.line, top: it.rect.top, bottom: it.rect.bottom, items: [] }; out.push(row); }
        row.top = Math.min(row.top, it.rect.top); row.bottom = Math.max(row.bottom, it.rect.bottom);
        row.items.push(it);
      });
      return out;
    }
    /** אחרי toks[i]: האינדקס שלפניו נכניס (מדלג על רווחים ועל המשך-מילה צמוד) */
    function nextAfter(i) {
      var T = toks(), j = i + 1;
      while (j < T.length) {
        if (T[j].type === 'space') { j++; continue; }
        if (isTextTok(T[j]) && isTextTok(T[j - 1])) { j++; continue; }
        break;
      }
      return j;
    }
    /** גבולות-אות של חלק-מילה: bx[k] = ה-X שלפני האות k, bx[n] = סוף החלק */
    function boundaries(b, t) {
      var n = textNode(b);
      if (!n) return null;
      var L = lettersOf(t.text);
      if (!L.length) return null;
      var rects = L.map(function (c) { return rectOf(n, c.at, Math.min(n.data.length, c.at + c.s.length)); });
      var rtl = rects.length > 1 ? (rects[0].left + rects[0].right) > (rects[rects.length - 1].left + rects[rects.length - 1].right) : lineRtl(b);
      var bx = rects.map(function (r) { return rtl ? r.right : r.left; });
      var last = rects[rects.length - 1];
      bx.push(rtl ? last.left : last.right);
      return bx;
    }

    /** היעד בנקודה (x,y) — או null */
    function resolve(x, y) {
      var rr = root.getBoundingClientRect();
      if (x < rr.left - ROOT_MARGIN || x > rr.right + ROOT_MARGIN || y < rr.top - ROOT_MARGIN || y > rr.bottom + ROOT_MARGIN) return null;
      var R = rows();
      if (!R.length) return null;
      var row = null, best = Infinity;
      for (var q = 0; q < R.length; q++) {
        var d = y < R[q].top ? R[q].top - y : (y > R[q].bottom ? y - R[q].bottom : 0);
        if (d < best) { best = d; row = R[q]; }
        if (!d) break;
      }
      var T = toks(), from = st.from, items = row.items;
      var geo = { top: row.top, height: row.bottom - row.top };
      // מעל מילה?
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        if (x >= it.zone.left - 0.5 && x <= it.zone.right + 0.5) return overItem(it, x, T, from, geo);
      }
      // ברווח
      var rtl = lineRtl(items[0].el);
      for (k = 0; k < items.length; k++) {
        var z = items[k].zone;
        if (rtl ? z.right < x : z.left > x) {
          return { kind: 'insert', at: items[k].i, el: items[k].el, prev: k ? items[k - 1].el : null, side: 'start', rtl: rtl, geo: geo };
        }
      }
      var lastIt = items[items.length - 1];
      return { kind: 'insert', at: nextAfter(lastIt.i), el: lastIt.el, prev: null, side: 'end', rtl: rtl, geo: geo };
    }
    function overItem(it, x, T, from, geo) {
      var t = T[it.i];
      var word = { kind: 'word', i: it.i, el: it.el, geo: geo };
      if (!isTextTok(t) || it.i === from) return word;
      var bx = boundaries(it.el, t);
      if (!bx) return word;
      var n = bx.length - 1, k = 0, bd = Infinity;
      for (var q = 0; q <= n; q++) { var d = Math.abs(x - bx[q]); if (d < bd) { bd = d; k = q; } }
      if (k > 0 && k < n && t.chord) return { kind: 'split', i: it.i, k: k, el: it.el, x: bx[k], geo: geo };
      if (k === n && isTextTok(T[it.i + 1])) {
        var nb = btnFor(it.i + 1);
        return { kind: 'word', i: it.i + 1, el: nb || it.el, geo: geo };
      }
      return word;
    }

    /* ── חיווי ── */
    function ensureMarker() {
      if (!marker) {
        marker = doc.createElement('div');
        marker.className = 'lab-drag-marker';
        marker.setAttribute('aria-hidden', 'true');
        doc.body.appendChild(marker);
      }
      return marker;
    }
    function showMarker(x, top, h, insert) {
      var m = ensureMarker();
      m.classList.toggle('lab-drag-marker--insert', !!insert);
      m.style.left = Math.round(x) + 'px';
      m.style.top = Math.round(top - 4) + 'px';
      m.style.height = Math.round(h + 8) + 'px';
      m.hidden = false;
    }
    function hideMarker() { if (marker) marker.hidden = true; }
    function setOver(el) {
      if (overEl === el) return;
      if (overEl) overEl.classList.remove('lab-drag-over');
      overEl = el || null;
      if (overEl) overEl.classList.add('lab-drag-over');
    }
    function setGap(el, cls) {
      if (gap && gap.el === el && gap.cls === cls) return;
      if (gap) gap.el.classList.remove(gap.cls);
      gap = el ? { el: el, cls: cls } : null;
      if (gap) gap.el.classList.add(cls);
    }
    function zoneNow(b) {
      var T = toks(), t = T[+b.dataset.i];
      return zoneOf(b, t, b.getBoundingClientRect());
    }
    function feedback(t) {
      if (!t) { setOver(null); setGap(null); hideMarker(); return; }
      if (t.kind === 'word') { setGap(null); hideMarker(); setOver(t.el); return; }
      setOver(null);
      if (t.kind === 'split') { setGap(null); var br = t.el.getBoundingClientRect(); showMarker(t.x, br.top, br.height, false); return; }
      // insert: פותחים רווח אמיתי לפני המילה שאחרי (לא בסוף שורה), ואז מודדים
      if (t.side === 'start') setGap(t.el, 'lab-drag-gap'); else setGap(null);
      var z = zoneNow(t.el), x;
      if (t.side === 'end') x = t.rtl ? z.left - 7 : z.right + 7;
      else if (t.prev) { var p = zoneNow(t.prev); x = t.rtl ? (p.left + z.right) / 2 : (p.right + z.left) / 2; }
      else x = t.rtl ? z.right + 7 : z.left - 7;
      var b2 = t.el.getBoundingClientRect();
      showMarker(x, b2.top, b2.height, true);
    }
    function sameTarget(a, b) {
      if (!a || !b) return a === b;
      return a.kind === b.kind && a.i === b.i && a.k === b.k && a.at === b.at;
    }

    /* ── מחזור-חיים ── */
    function placeGhost() {
      if (!st || !st.ghost) return;
      var lift = st.type === 'touch' ? GHOST_LIFT_TOUCH : GHOST_LIFT_MOUSE;
      st.ghost.style.left = Math.round(st.x) + 'px';
      st.ghost.style.top = Math.round(st.y - lift) + 'px';
    }
    function update(x, y) {
      if (!st || st.mode !== 'active') return;
      st.x = x; st.y = y;
      placeGhost();
      // החיווי עצמו משנה פריסה (רווח נפתח/נסגר) — מיישבים עד שהיעד המוצג = היעד בפריסה המוצגת
      var t = resolve(x, y);
      for (var n = 0; ; n++) {
        var diff = !sameTarget(t, st.target);
        if (diff || (t && t.kind === 'split')) feedback(t);
        st.target = t;
        if (!diff || n >= 2) break;
        var t2 = resolve(x, y);
        if (sameTarget(t2, t)) { if (t2 && t2.kind === 'split') feedback(t2); st.target = t2; break; }
        t = t2;
      }
    }
    function activate() {
      if (!st) return;
      if (!canStart()) { cancel(); return; }
      var T = toks(), t = T[st.from];
      if (!t || !t.chord) { cancel(); return; }
      st.mode = 'active';
      st.chord = t.chord;
      var g = doc.createElement('div');
      g.className = 'lab-drag-ghost' + (st.type === 'touch' ? ' lab-drag-ghost--touch' : '') + (reducedMotion() ? ' is-still' : '');
      g.setAttribute('aria-hidden', 'true');
      g.dir = 'ltr';
      g.textContent = t.chord;
      doc.body.appendChild(g);
      st.ghost = g;
      var src = btnFor(st.from);
      if (src) src.classList.add('lab-drag-src');
      root.classList.add('lab-dragging');
      doc.documentElement.classList.add('lab-drag-active');
      if (st.type === 'touch' && navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
      update(st.x, st.y);
      loop();
    }
    function teardown() {
      cancelAnimationFrame(rafId); rafId = 0;
      if (st && st.timer) { clearTimeout(st.timer); st.timer = 0; }
      if (st && st.ghost) { st.ghost.remove(); st.ghost = null; }
      setOver(null); setGap(null); hideMarker();
      Array.prototype.forEach.call(root.querySelectorAll('.lab-drag-src'), function (b) { b.classList.remove('lab-drag-src'); });
      root.classList.remove('lab-dragging');
      doc.documentElement.classList.remove('lab-drag-active');
    }
    function unlistenMouse() {
      doc.removeEventListener('pointermove', onPMove, true);
      doc.removeEventListener('pointerup', onPUp, true);
      doc.removeEventListener('pointercancel', onPCancel, true);
    }
    function unlistenTouch() {
      doc.removeEventListener('touchend', onTEnd, true);
      doc.removeEventListener('touchcancel', onTCancel, true);
    }
    /** ביטול: בלי שינוי. בעכבר פעיל — ממתינים לשחרור כדי לבלוע את הקליק שיבוא */
    function cancel() {
      if (!st) return;
      var wasActive = st.mode === 'active';
      teardown();
      if (st.type === 'mouse' && wasActive) { st.mode = 'cancelled'; return; }
      unlistenMouse(); unlistenTouch();
      if (wasActive) swallowClick();
      st = null;
    }
    function drop() {
      var s = st;
      // קריטי: היעד מחושב לפני סגירת הרווח הפתוח — על הפריסה שהמשתמש ראה
      var t = resolve(s.x, s.y);
      teardown();
      st = null;
      swallowClick();
      if (!t) return;
      var T = toks(), target = t.kind === 'word' ? { kind: 'word', i: t.i } : t.kind === 'split' ? { kind: 'split', i: t.i, k: t.k } : { kind: 'insert', at: t.at };
      var r = UCLab.ops && UCLab.ops.move ? UCLab.ops.move(T, s.from, target) : null;
      if (!r || !r.ok) return;
      if (ser(r.toks) === ser(T)) return;     // אותו מקום — בלי צעד-ביטול ובלי הודעה
      var msg;
      if (target.kind === 'insert') msg = 'האקורד ' + s.chord + ' הוזז לבין המילים';
      else if (target.kind === 'split' && !r.fallback) msg = 'האקורד ' + s.chord + ' נכנס לתוך "' + groupText(T, t.i) + '"';
      else msg = T[t.i] && T[t.i].text ? 'האקורד ' + s.chord + ' הוזז ל"' + T[t.i].text + '"' : 'האקורד ' + s.chord + ' הוזז למקום בלי מילה';
      try { ctx.commit(r, msg); } catch (e) { console.error('[UCLab.drag] commit', e); }
    }
    function groupText(T, i) {
      var s = i, e = i;
      while (s > 0 && isTextTok(T[s - 1]) && isTextTok(T[s])) s--;
      while (isTextTok(T[e + 1]) && isTextTok(T[e])) e++;
      var out = '';
      for (var q = s; q <= e; q++) out += T[q].text || '';
      return out;
    }
    /** קליק אחד (בשלב ה-capture) אחרי גרירה — נבלע, אחרת היה פותח את הגיליון */
    function onSwallow(e) {
      e.stopPropagation(); e.preventDefault();
      unSwallow();
    }
    function unSwallow() { clearTimeout(swallowTimer); swallowTimer = 0; root.removeEventListener('click', onSwallow, true); }
    function swallowClick() {
      unSwallow();
      root.addEventListener('click', onSwallow, true);
      swallowTimer = setTimeout(unSwallow, SWALLOW_MS);
    }
    /** גלילה אוטומטית ליד קצה החלון + בדיקת "נפתח גיליון" */
    function loop() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function step() {
        if (!st || st.mode !== 'active') return;
        try { if (ctx.busy && ctx.busy()) { cancel(); return; } } catch (e) {}
        var vh = window.innerHeight || doc.documentElement.clientHeight, y = st.y, v = 0;
        if (y < EDGE) v = -Math.ceil(Math.min(EDGE, EDGE - y) / EDGE * MAX_SPEED);
        else if (y > vh - EDGE) v = Math.ceil(Math.min(EDGE, y - (vh - EDGE)) / EDGE * MAX_SPEED);
        if (v) {
          var before = window.scrollY;
          window.scrollBy(0, v);
          if (window.scrollY !== before) { st.target = undefined; update(st.x, st.y); }
        }
        rafId = requestAnimationFrame(step);
      });
    }

    /* ── עכבר / עט ── */
    function onPDown(e) {
      if (st && st.mode === 'cancelled') { unlistenMouse(); st = null; }   // שחרור שלא הגיע (חלון איבד פוקוס וכו')
      if (e.pointerType === 'touch' || e.button !== 0 || st) return;
      var h = handleFor(e.target);
      if (!h || !canStart()) return;
      st = { type: 'mouse', mode: 'pending', from: h.i, chord: h.chord, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, pid: e.pointerId };
      doc.addEventListener('pointermove', onPMove, true);
      doc.addEventListener('pointerup', onPUp, true);
      doc.addEventListener('pointercancel', onPCancel, true);
    }
    function onPMove(e) {
      if (!st || st.type !== 'mouse' || e.pointerId !== st.pid) return;
      if (st.mode === 'pending') {
        var dx = e.clientX - st.x0, dy = e.clientY - st.y0;
        if (dx * dx + dy * dy < MOUSE_THRESHOLD * MOUSE_THRESHOLD) return;
        st.x = e.clientX; st.y = e.clientY;
        activate();
        return;
      }
      if (st.mode === 'active') { e.preventDefault(); update(e.clientX, e.clientY); }
    }
    function onPUp(e) {
      if (!st || st.type !== 'mouse' || e.pointerId !== st.pid) return;
      unlistenMouse();
      if (st.mode === 'pending') { st = null; return; }          // קליק רגיל → הגיליון
      if (st.mode === 'cancelled') { st = null; swallowClick(); return; }
      st.x = e.clientX; st.y = e.clientY;
      drop();
    }
    function onPCancel(e) {
      if (!st || st.type !== 'mouse' || e.pointerId !== st.pid) return;
      if (st.mode === 'active') cancel();
      unlistenMouse(); st = null;
    }

    /* ── מגע: לחיצה-ארוכה ואז גרירה ── */
    function touchById(list, id) {
      for (var q = 0; list && q < list.length; q++) if (list[q].identifier === id) return list[q];
      return null;
    }
    function onTStart(e) {
      if (st) { if (st.type === 'touch' && e.touches.length > 1) cancel(); return; }
      if (e.touches.length !== 1) return;
      var h = handleFor(e.target);
      if (!h || !canStart()) return;
      var p = e.touches[0];
      st = { type: 'touch', mode: 'pending', from: h.i, chord: h.chord, x0: p.clientX, y0: p.clientY, x: p.clientX, y: p.clientY, tid: p.identifier };
      st.timer = setTimeout(function () { if (st && st.type === 'touch' && st.mode === 'pending') { st.timer = 0; activate(); } }, HOLD_MS);
      doc.addEventListener('touchend', onTEnd, true);
      doc.addEventListener('touchcancel', onTCancel, true);
    }
    function onTMove(e) {
      if (!st || st.type !== 'touch') return;
      if (e.touches.length > 1) { cancel(); return; }
      var p = touchById(e.touches, st.tid);
      if (!p) return;
      if (st.mode === 'pending') {
        var dx = p.clientX - st.x0, dy = p.clientY - st.y0;
        if (dx * dx + dy * dy > TOUCH_SLOP * TOUCH_SLOP) cancel();   // גלילה — לא נוגעים
        return;
      }
      if (st.mode === 'active') {
        if (e.cancelable) e.preventDefault();                      // חוסם גלילה רק בזמן גרירה
        update(p.clientX, p.clientY);
      }
    }
    function onTEnd(e) {
      if (!st || st.type !== 'touch') return;
      if (touchById(e.touches, st.tid)) return;                    // אצבע אחרת הורמה
      unlistenTouch();
      if (st.mode === 'pending') { clearTimeout(st.timer); st = null; return; }   // הקשה → הגיליון
      var p = touchById(e.changedTouches, st.tid);
      if (p) { st.x = p.clientX; st.y = p.clientY; }
      if (e.cancelable) e.preventDefault();                        // בלי click/mouse מדומים
      drop();
    }
    function onTCancel() { if (st && st.type === 'touch') cancel(); }
    function onPCancelTouch(e) {
      // הדפדפן לקח את המחווה (גלילה) — אם בכל זאת קרה בזמן גרירה, מבטלים
      if (e.pointerType === 'touch' && st && st.type === 'touch' && st.mode === 'active') cancel();
    }

    /* ── שונות ── */
    function onKey(e) {
      if (!st || e.key !== 'Escape') return;
      if (st.mode === 'active' || st.mode === 'pending') {
        e.preventDefault(); e.stopPropagation();
        cancel();
      }
    }
    function onCtx(e) { if (st && st.type === 'touch') e.preventDefault(); }
    function onBlockDefault(e) { if (st && st.mode === 'active') e.preventDefault(); }
    function onBlur() { if (st) { teardown(); unlistenMouse(); unlistenTouch(); st = null; } }

    root.addEventListener('pointerdown', onPDown);
    root.addEventListener('touchstart', onTStart, { passive: true });
    root.addEventListener('touchmove', onTMove, { passive: false });
    root.addEventListener('contextmenu', onCtx);
    root.addEventListener('dragstart', onBlockDefault);
    doc.addEventListener('pointercancel', onPCancelTouch, true);
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('selectstart', onBlockDefault, true);
    window.addEventListener('blur', onBlur);
    root.setAttribute('data-drag', '1');

    var handle = {
      destroy: function () {
        if (st) { teardown(); st = null; }
        unlistenMouse(); unlistenTouch(); unSwallow();
        root.removeEventListener('pointerdown', onPDown);
        root.removeEventListener('touchstart', onTStart, { passive: true });
        root.removeEventListener('touchmove', onTMove, { passive: false });
        root.removeEventListener('contextmenu', onCtx);
        root.removeEventListener('dragstart', onBlockDefault);
        doc.removeEventListener('pointercancel', onPCancelTouch, true);
        doc.removeEventListener('keydown', onKey, true);
        doc.removeEventListener('selectstart', onBlockDefault, true);
        window.removeEventListener('blur', onBlur);
        if (marker) { marker.remove(); marker = null; }
        root.removeAttribute('data-drag');
        delete root.__ucDrag;
      },
      cancel: function () { cancel(); if (st && st.mode === 'cancelled') { unlistenMouse(); st = null; } },
      isDragging: function () { return !!st && st.mode === 'active'; }
    };
    root.__ucDrag = handle;
    return handle;
  }

  UCLab.drag = { attach: attach };
})();
