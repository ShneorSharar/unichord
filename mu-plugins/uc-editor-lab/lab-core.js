/*
 * UC Editor Lab — ליבה משותפת (בעלים: lead). גלובל יחיד: window.UCLab.
 *
 * מה יש כאן (builders משתמשים, לא משכפלים):
 *   UCLab.data                 — UC_LAB מה-PHP (view, artists, genres, consent, song, ajaxUrl, nonce)
 *   UCLab.register(view, fn)   — fn(rootEl, UCLab, opts) נקרא ב-DOMContentLoaded אם view פעיל
 *   UCLab.mount(view, root, o) — פתיחה מאוחרת (עמוד שיר אמיתי); UCLab.isLab — רק בעמוד הבדיקה
 *   UCLab.parse / serialize    — העתק-מדויק מ-achord-upload.js (פורמט word[Am], round-trip אידמפוטנטי)
 *   UCLab.songChords(tokens)   — אקורדי-השיר לפי שכיחות
 *   UCLab.isChord(str)         — ולידציה סלחנית
 *   UCLab.sheet.open/close     — bottom-sheet יחיד
 *   UCLab.toast(msg, opts)     — הודעה עם "בטל"
 *   UCLab.hint(key, text)      — טיפ חד-פעמי (נזכר ב-localStorage)
 *   UCLab.chordPicker(opts)    — בורר-אקורד (הקלדה / באותו-שיר / נפוצים / בנה)
 *   UCLab.normChord(s)         — "f#m7" → "F#m7"; לא-תקין → null
 *   UCLab.ChordStep(el, opts)  — "הדף נראה כמו השיר; נוגעים במילה ← אקורד"
 *                                 + בטל/חזור, מקלדת, "אותם אקורדים כמו…", setRaw(raw,{undoable})
 *   UCLab._mapChordsToLine / _lineInfo / _copySources / _History — לוגיקה טהורה (נבדקת ב-node)
 *   UCLab.preview(raw,t,p)     — HTML מרונדר דרך achord_live_preview (קריאה-בלבד)
 *   UCLab.demoSubmit(kind, f)  — במקום שליחה: תצוגה + ה-payload שהיה נשלח
 *   UCLab.api.send(action, fields, opts) → Promise<Result>  — שליחה אמיתית (real) או הדגמה; לעולם לא נדחה
 *   UCLab.busy / notice / explain / noticeResult / reloadFresh — נעילת-כפתור, שורת-מצב, הסבר-שגיאה, ריענון עוקף-קאש
 *   UCLab.draft.save/load/clear(key)
 *   UCLab.el(tag, attrs, kids) — יוצר-DOM קטן
 */
(function () {
  'use strict';

  var D = window.UC_LAB || {};
  var UCLab = window.UCLab = window.UCLab || {};
  UCLab.data = D;

  /* ── DOM helper ───────────────────────────────────────── */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  UCLab.el = el;

  /* ── רישום תרחישים ───────────────────────────────────── */
  var registry = {};
  UCLab.register = function (view, fn) { registry[view] = fn; };
  function truthyD(v) { return v === true || v === 1 || v === '1' || v === 'true'; }
  /* סבב 7: true רק בעמוד הבדיקה (uc-editor-lab.php). בעמודים האמיתיים (uc-new-editor.php) — false:
     בלי מסך-כניסה, בלי "המשך בלי להתחבר", בלי טקסטים של הדגמה. */
  UCLab.isLab = truthyD(D.lab);
  /** סבב 7: UCLab.mount(view, root, opts) → handle|false. פותח תרחיש מתי שרוצים (למשל "ערוך" בעמוד השיר).
      opts: { embedded, returnFocus, … } מועבר כפרמטר שלישי ל-fn(root, UCLab, opts). אפשר לקרוא שוב אחרי סגירה. */
  UCLab.mount = function (view, root, opts) {
    var fn = registry[view];
    if (!fn || !root) return false;
    opts = opts || {};
    try {
      var h = fn(root, UCLab, opts);
      opts.handle = h || null;
      return h || true;
    } catch (e) {
      console.error('[UCLab] mount ' + view, e);
      return false;
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    var view = D.view || 'add';
    if (view === 'song') return;   // עמוד שיר אמיתי: נפתח רק בלחיצה על "ערוך" (UCLab.mount)
    var root = document.getElementById('lab-' + (view === 'notebook' ? 'add' : view) + '-root'); // מחברת = עורך ההוספה
    if (!registry[view] && view === 'notebook') view = 'add';
    if (root && registry[view]) {
      try { registry[view](root, UCLab); }
      catch (e) { console.error('[UCLab] init ' + view, e); root.textContent = 'שגיאה בטעינת התרחיש (ראו קונסול).'; }
    }
  });

  /* ══ פורמט — העתק-מדויק מ-achord-upload.js (parseText / serializeTokens) ══ */
  function parse(text) {
    var result = [];
    var re = /(\[[^\]]+\])([^\s\[\]\n]+)|(\[[^\]]+\])|(\n)|([^\s\[\]\n]+)|( +)/g;
    var match, chord, last;
    text = String(text || '').replace(/\r\n?/g, '\n');
    while ((match = re.exec(text)) !== null) {
      if (match[1] && match[2]) {
        chord = match[1].slice(1, -1);
        last = result[result.length - 1];
        if (last && last.type === 'word' && last.text && !last.chord) {
          last.chord = chord;
          result.push({ type: 'word', text: match[2], chord: null });
        } else {
          result.push({ type: 'word', text: match[2], chord: chord });
        }
      } else if (match[3]) {
        chord = match[3].slice(1, -1);
        last = result[result.length - 1];
        if (last && last.type === 'word' && !last.chord && last.text) {
          last.chord = chord;
        } else {
          result.push({ type: 'word', text: '', chord: chord });
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
  function piece(t, next) {
    if (t.type === 'newline') return '\n';
    if (t.type === 'space') return t.text;
    if (t.type === 'word') {
      if (!t.text && t.chord) {
        var needsSpace = next && next.type === 'word' && next.text;
        return '[' + t.chord + ']' + (needsSpace ? ' ' : '');
      }
      return t.text + (t.chord ? '[' + t.chord + ']' : '');
    }
    return '';
  }
  function serialize(toks) {
    return toks.map(function (t, i) { return piece(t, toks[i + 1]); }).join('');
  }
  UCLab.parse = parse;
  UCLab.serialize = serialize;
  UCLab.clone = function (toks) { return toks.map(function (t) { return { type: t.type, text: t.text, chord: t.chord }; }); };

  /* ── אקורדים ─────────────────────────────────────────── */
  UCLab.COMMON = ['G', 'C', 'D', 'Em', 'Am', 'F', 'E', 'A', 'Dm', 'Bm'];
  UCLab.ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  UCLab.QUALS = [
    { v: '', label: 'מז\'ור' }, { v: 'm', label: 'm מינור' }, { v: '7', label: '7' }, { v: 'm7', label: 'm7' },
    { v: 'maj7', label: 'maj7' }, { v: 'sus4', label: 'sus4' }, { v: 'sus2', label: 'sus2' },
    { v: 'dim', label: 'dim' }, { v: '6', label: '6' }, { v: 'add9', label: 'add9' }
  ];
  /* שורש A–G (+#/b), ואחריו רק "תווי-אקורד": ספרות, + - ( ) / ° ø ^ Δ , . # ומילות-סוג מרשימה סגורה
     (m maj min mi dim aug sus add no omit alt M b). אות A–G נוספת רק אחרי "/" (בס) או צמודה למילת-סוג (E/dimE).
     כך C-5, D6/9, Am(7-6), F#7/4-3, D6(no3) עוברים, ו-Chorus/Coda/Bridge/Fine/[פזמון] לא. בלי רווחים, עד 14 תווים,
     ובלי "---" (שורות טאבולטורה). כל שמות-האקורד באתר (1,410 שירים) עוברים — ראו qa/K-core.test.js. */
  var CHORD_BODY = /^(?:\/[A-G][#b]?|(?:maj|Maj|min|mi|dim|aug|sus|add|no|omit|alt|M|m|b|o(?![a-z]))(?:[A-G][#b]?(?![a-z]))?|[0-9#+\-()\/°øΔ^,.])*$/;
  UCLab.isChord = function (s) {
    s = String(s || '').trim();
    if (!s.length || s.length > 14 || /-{3,}/.test(s)) return false;
    var m = /^[A-G][#b]?/.exec(s);
    if (!m) return false;
    var body = s.slice(m[0].length).replace(/([0-9)])[A-G][#b]?$/, '$1');   // בס בלי "/" בסוף: D+7E
    return CHORD_BODY.test(body);
  };
  UCLab.songChords = function (toks) {
    var count = {}, order = [];
    toks.forEach(function (t) {
      if (t.chord) { if (!count[t.chord]) { count[t.chord] = 0; order.push(t.chord); } count[t.chord]++; }
    });
    return order.sort(function (a, b) { return count[b] - count[a]; });
  };

  /* ── localStorage בטוח ───────────────────────────────── */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  // סבב 7: בעמודים האמיתיים draftNs='real' — טיוטות מעמוד הבדיקה (הדגמה) לא קופצות שם
  var DRAFT = 'uc_lab_draft_' + (D.draftNs ? String(D.draftNs).replace(/[^a-z0-9]/gi, '') + '_' : '');
  UCLab.draft = {
    save: function (key, obj) { lsSet(DRAFT + key, JSON.stringify({ t: Date.now(), v: obj })); },
    load: function (key) { try { var o = JSON.parse(lsGet(DRAFT + key) || 'null'); return o ? o.v : null; } catch (e) { return null; } },
    clear: function (key) { lsDel(DRAFT + key); }
  };

  /* ══ Bottom sheet (מופע יחיד) ═══════════════════════════ */
  var sheetState = null;
  UCLab.sheet = {
    /** opts: { title: string|Node, body: Node, onClose: fn, label: string } */
    open: function (opts) {
      UCLab.sheet.close(true);
      var prevFocus = document.activeElement;
      // opts.onGone: נקרא בכל סגירה, גם שקטה (גיליון אחר החליף אותו) — כדי ש-Promise לא ייתקע
      var scrim = el('div', { class: 'uc-lab-scrim', onclick: function () { UCLab.sheet.close(); } });
      var titleNode = typeof opts.title === 'string' ? el('h3', { class: 'lab-sheet-title', id: 'lab-sheet-title', text: opts.title })
                                                     : el('div', { class: 'lab-sheet-title', id: 'lab-sheet-title' }, [opts.title]);
      var sheet = el('div', { class: 'uc-lab-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lab-sheet-title' }, [
        el('div', { class: 'lab-sheet-grip', 'aria-hidden': 'true' }),
        el('div', { class: 'lab-sheet-head' }, [
          titleNode,
          el('button', { type: 'button', class: 'lab-sheet-x', 'aria-label': 'סגירה', text: '✕', onclick: function () { UCLab.sheet.close(); } })
        ]),
        opts.body
      ]);
      function onKey(e) { if (e.key === 'Escape') UCLab.sheet.close(); }
      document.addEventListener('keydown', onKey);
      document.body.appendChild(scrim);
      document.body.appendChild(sheet);
      document.documentElement.style.overflow = 'hidden';
      sheetState = { scrim: scrim, sheet: sheet, onKey: onKey, onClose: opts.onClose, onGone: opts.onGone, prevFocus: prevFocus };
      void sheet.offsetHeight; // reflow מכריח את מצב-הפתיחה; לא תלוי ב-rAF (מושהה בטאב מוסתר)
      scrim.classList.add('is-open'); sheet.classList.add('is-open');
      var f = sheet.querySelector('[data-autofocus]') || sheet.querySelector('.lab-sheet-x');
      if (f) f.focus({ preventScroll: true });
      return sheet;
    },
    close: function (silent) {
      if (!sheetState) return;
      var s = sheetState; sheetState = null;
      document.removeEventListener('keydown', s.onKey);
      s.scrim.classList.remove('is-open'); s.sheet.classList.remove('is-open');
      document.documentElement.style.overflow = '';
      setTimeout(function () { s.scrim.remove(); s.sheet.remove(); }, 240);
      if (s.prevFocus && s.prevFocus.focus && document.contains(s.prevFocus)) s.prevFocus.focus({ preventScroll: true });
      if (!silent && typeof s.onClose === 'function') s.onClose();
      if (typeof s.onGone === 'function') { try { s.onGone(); } catch (e) { console.error('[UCLab] sheet onGone', e); } }
    },
    isOpen: function () { return !!sheetState; }
  };

  /* ══ Toast ═══════════════════════════════════════════ */
  var toastEl = null, toastTimer = null;
  /** opts: { action: 'בטל', onAction: fn, ms: 5000 } */
  UCLab.toast = function (msg, opts) {
    opts = opts || {};
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    var kids = [el('span', { text: msg })];
    if (opts.action) {
      kids.push(el('button', { type: 'button', text: opts.action, onclick: function () { hide(); if (opts.onAction) opts.onAction(); } }));
    }
    toastEl = el('div', { class: 'uc-lab-toast', role: 'status', 'aria-live': 'polite' }, kids);
    document.body.appendChild(toastEl);
    var me = toastEl;
    void me.offsetHeight; me.classList.add('is-open');
    function hide() { me.classList.remove('is-open'); setTimeout(function () { me.remove(); }, 200); if (toastEl === me) toastEl = null; }
    toastTimer = setTimeout(hide, opts.ms || 5000);
    return hide;
  };

  /* ══ Hint — טיפ אחד, במקום ובזמן, נסגר לתמיד ══════════════ */
  UCLab.hint = function (key, text, icon) {
    if (lsGet('uc_lab_hint_' + key) === '1') return null;
    var box = el('div', { class: 'uc-lab-hint', role: 'note' }, [
      el('span', { class: 'lab-hint-ico', 'aria-hidden': 'true', text: icon || '💡' }),
      el('p', { text: text }),
      el('button', { type: 'button', text: 'הבנתי', onclick: function () { lsSet('uc_lab_hint_' + key, '1'); box.remove(); } })
    ]);
    return box;
  };
  UCLab.resetHints = function () {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('uc_lab_hint_') === 0) localStorage.removeItem(k); }); } catch (e) {}
  };

  /* ══ אקורד מוקלד — נרמול + ולידציה (טהור; F3) ══════════════
     "f#m7" → "F#m7" · "[am]" → "Am" · "c/e" → "C/E" · ♯/♭ → #/b. לא-תקין → null. */
  UCLab.normChord = function (s) {
    var v = String(s == null ? '' : s).trim()
      .replace(/^\[(.*)\]$/, '$1').trim()
      .replace(/♯/g, '#').replace(/♭/g, 'b')
      .replace(/^([a-g])/, function (m) { return m.toUpperCase(); })
      .replace(/\/([a-g])/, function (m, c) { return '/' + c.toUpperCase(); });
    return UCLab.isChord(v) ? v : null;
  };

  /* ══ היסטוריה: בטל / חזור (טהור; F4) ══════════════════════
     push(state) = שינוי חדש (מנקה את מחסנית-החזור) · undo(cur)/redo(cur) מחזירים מצב או null */
  function History(limit) { this.past = []; this.future = []; this.limit = limit || 80; }
  History.prototype.push = function (s) { this.past.push(s); if (this.past.length > this.limit) this.past.shift(); this.future.length = 0; };
  History.prototype.undo = function (cur) { if (!this.past.length) return null; this.future.push(cur); return this.past.pop(); };
  History.prototype.redo = function (cur) { if (!this.future.length) return null; this.past.push(cur); return this.future.pop(); };
  History.prototype.canUndo = function () { return this.past.length > 0; };
  History.prototype.canRedo = function () { return this.future.length > 0; };
  History.prototype.clear = function () { this.past.length = 0; this.future.length = 0; };
  UCLab._History = History;

  /* ══ שורות + העתקת אקורדים משורה (טהור; F2) ═══════════════
     "קבוצה" = מילה כתובה; חלקי-מילה צמודים (אקורד באמצע מילה) = קבוצה אחת. */
  function startsGroup(line, j) {
    var t = line[j], p = line[j - 1];
    return t.type === 'word' && !!t.text && !(p && p.type === 'word' && p.text);
  }
  function lineKey(line) {
    var s = '';
    line.forEach(function (t, j) {
      if (t.type !== 'word' || !t.text) return;
      s += (startsGroup(line, j) && s ? ' ' : '') + t.text;
    });
    return s;
  }
  /** lines(toks) → [{ start, end(בלעדי), groups, chorded, header, text }] */
  function lineInfo(toks) {
    var out = [], cur = null;
    function open(i) { cur = { start: i, end: i, groups: 0, chorded: false, header: false, text: '' }; }
    function close(i) {
      cur.end = i;
      var line = toks.slice(cur.start, cur.end);
      cur.text = lineKey(line);
      cur.header = /[:׃]\s*$/.test(cur.text) && !cur.chorded;   // "פזמון:" — כותרת-קטע, לא שורת-שיר
      out.push(cur);
    }
    open(0);
    toks.forEach(function (t, i) {
      if (t.type === 'newline') { close(i); open(i + 1); return; }
      if (t.type !== 'word') return;
      if (t.chord) cur.chorded = true;
      var p = toks[i - 1];
      if (t.text && !(p && p.type === 'word' && p.text)) cur.groups++;
    });
    close(toks.length);
    return out;
  }
  UCLab._lineInfo = lineInfo;

  /** שורות-מקור אפשריות לשורה li: { best, list } — best = השורה האחרונה עם אותו מספר מילים, אחרת השורה המאוקדת הקודמת */
  function copySources(toks, li, lines) {
    lines = lines || lineInfo(toks);
    var dst = lines[li], seen = {}, list = [], best = -1, prev = -1;
    if (!dst) return { best: -1, list: [] };
    for (var k = li - 1; k >= 0; k--) {
      var L = lines[k];
      if (!L.chorded || !L.groups) continue;
      if (prev < 0) prev = k;
      if (best < 0 && L.groups === dst.groups) best = k;
      var key = serialize(toks.slice(L.start, L.end)).replace(/\s+/g, ' ').trim();
      if (seen[key]) continue;
      seen[key] = 1; list.push(k);
    }
    if (best < 0) best = prev;
    if (best >= 0 && list.indexOf(best) === -1) list.unshift(best);   // הכפילות האחרונה עם אותו מספר מילים
    if (best >= 0) { list.splice(list.indexOf(best), 1); list.unshift(best); }
    return { best: best, list: list.slice(0, 8) };
  }
  UCLab._copySources = copySources;

  /** אקורדי srcLine → על dstLine (מערכי-טוקנים של שורה אחת, בלי newline). מחזיר מערך-טוקנים חדש.
      טקסט זהה → העתק מדויק (כולל אקורד באמצע מילה). אחרת: המיקום של האקורד ה-k יחסי למילים
      (אותו מספר מילים = אותן מילים), הסדר נשמר, ואקורד שלא נכנס נוסף בסוף השורה. אף אקורד לא נזרק. */
  function mapChordsToLine(src, dst) {
    function cp(t) { return { type: t.type, text: t.text, chord: t.chord }; }
    if (lineKey(src) && lineKey(src) === lineKey(dst)) return src.map(cp);
    // יעד נקי: בלי אקורדים, בלי אקורדים-עצמאיים
    var out = [];
    dst.forEach(function (t) {
      if (t.type === 'word' && !t.text) return;
      var c = cp(t); if (c.type === 'word') c.chord = null;
      if (c.type === 'space' && out.length && out[out.length - 1].type === 'space') return;
      out.push(c);
    });
    var gd = [];
    out.forEach(function (t, j) { if (startsGroup(out, j)) gd.push(j); });
    var m = gd.length;
    // פריטי-מקור לפי הסדר: { chord, anchor = אינדקס-קבוצה, standalone }
    var items = [], g = -1;
    src.forEach(function (t, j) {
      if (t.type !== 'word') return;
      if (t.text && startsGroup(src, j)) g++;
      if (!t.chord) return;
      if (t.text) items.push({ chord: t.chord, anchor: Math.max(g, 0), standalone: false });
      else items.push({ chord: t.chord, anchor: g + 1, standalone: true });
    });
    var nt = g + 1;
    function scale(a) {
      if (a >= nt) return m;
      if (nt === m) return a;
      if (nt <= 1 || m <= 1) return 0;
      return Math.round(a * (m - 1) / (nt - 1));
    }
    var onGroup = {}, before = {}, tail = [], cursor = 0;
    items.forEach(function (it) {
      var d = Math.max(scale(it.anchor), cursor);
      if (d >= m) { tail.push(it.chord); return; }
      if (it.standalone) { (before[d] = before[d] || []).push(it.chord); cursor = d; }
      else { onGroup[d] = it.chord; cursor = d + 1; }
    });
    var res = [];
    out.forEach(function (t, j) {
      var gi = gd.indexOf(j);
      if (gi >= 0 && before[gi]) before[gi].forEach(function (c) { res.push({ type: 'word', text: '', chord: c }, { type: 'space', text: ' ', chord: null }); });
      if (gi >= 0 && onGroup[gi]) t.chord = onGroup[gi];
      res.push(t);
    });
    tail.forEach(function (c) {
      if (res.length && res[res.length - 1].type !== 'space') res.push({ type: 'space', text: ' ', chord: null });
      res.push({ type: 'word', text: '', chord: c });
    });
    return res;
  }
  UCLab._mapChordsToLine = mapChordsToLine;

  /* ══ Round 6 (lead): פעולות טהורות על טוקנים — UCLab.ops ═══════════════════════
     כל פעולה: (toks, ...) → { ok, toks, focus, why?, fallback? }
       toks  = מערך חדש ומנורמל (parse∘serialize) — הקלט לא משתנה. מה שהעורך מצייר = מה שנשמר.
       focus = אינדקס הטוקן שקיבל את האקורד (אחרי הנרמול), או -1.
       ok:false → toks = הקלט כמו שהוא, why = 'same' | 'no-chord' | 'bad-index' | 'bad-letter'.
     כלל-הפורמט (מאומת מול Shortcode_Handler ו-achord-upload.js): אקורד שייך לטקסט שלפניו —
     "המ[Eb]רצע[A]" = Eb מעל "המ", A מעל "רצע". לכן פיצול מילה באות k קיים רק כשלחלק הראשון יש
     אקורד; אחרת "המ" + "רצע[A]" מתמזגים חזרה ל"המרצע[A]". split דורש אקורד קיים (why:'no-chord'),
     ו-move עם יעד split על חלק בלי אקורד נוחת על החלק כולו (fallback:true).
     אות = אשכול (אות + ניקוד/טעמים צמודים) — לעולם לא מפרידים ניקוד מהאות שלו. */
  var MARKS = /^[֑-ׇֽֿׁׂׅׄ̀-ͯ‌‍︀-️]$/;
  function letters(text) {
    var out = [], at = 0;
    Array.from(String(text || '')).forEach(function (ch) {
      if (out.length && MARKS.test(ch)) out[out.length - 1].s += ch;
      else out.push({ s: ch, at: at });
      at += ch.length;
    });
    return out;
  }
  function cloneToks(toks) { return toks.map(function (t) { return { type: t.type, text: t.text, chord: t.chord || null }; }); }
  /** parse∘serialize, ושומר על "איזה טוקן" לפי מיקום-תו: mark = אובייקט מתוך arr (או null) */
  function normalize(arr, mark) {
    var pos = 0, off = -1, parts = arr.map(function (t, i) {
      var p = piece(t, arr[i + 1]);
      if (t === mark) off = pos;
      pos += p.length;
      return p;
    });
    var out = parse(parts.join('')), focus = -1;
    if (off >= 0) {
      pos = 0;
      for (var i = 0; i < out.length; i++) {
        var len = piece(out[i], out[i + 1]).length;
        if (pos + len > off || pos >= off) {
          for (var j = i; j < out.length; j++) if (out[j].type === 'word') { focus = j; break; }
          break;
        }
        pos += len;
      }
    }
    return { ok: true, toks: out, focus: focus };
  }
  function fail(toks, why) { return { ok: false, toks: toks, focus: -1, why: why }; }
  function isWord(t) { return !!t && t.type === 'word'; }
  function isText(t) { return isWord(t) && !!t.text; }
  /** תחילת "קבוצה" (מילה כתובה שפוצלה לחלקים צמודים) */
  function groupStartIdx(toks, i) { while (i > 0 && isText(toks[i]) && isText(toks[i - 1])) i--; return i; }
  /** מסיר אקורד-עצמאי (טקסט ריק) יחד עם רווח צמוד אחד — כמו removeEmptyStandalone בעורך הישן */
  function dropStandalone(arr, tok) {
    var i = arr.indexOf(tok);
    if (i < 0) return;
    if (arr[i + 1] && arr[i + 1].type === 'space') arr.splice(i, 2);
    else if (arr[i - 1] && arr[i - 1].type === 'space') arr.splice(i - 1, 2);
    else arr.splice(i, 1);
  }
  /** מכניס אקורד-עצמאי לפני arr[at] (אמצע-קבוצה → לתחילת הקבוצה), עם רווחים כמו שהפרסר מייצר */
  function putStandalone(arr, at, chord) {
    if (at < arr.length && isText(arr[at])) at = groupStartIdx(arr, at);
    var tok = { type: 'word', text: '', chord: chord };
    // רווח מכל צד שיש בו מילה או אקורד אחר — אחרת "[Dm6][Em]" צמודים (נקרא נכון, אבל נראה שבור בטקסט)
    if (isWord(arr[at - 1])) { arr.splice(at, 0, { type: 'space', text: ' ', chord: null }); at++; }
    arr.splice(at, 0, tok);
    if (isWord(arr[at + 1])) arr.splice(at + 1, 0, { type: 'space', text: ' ', chord: null });
    return tok;
  }

  var ops = UCLab.ops = {
    letters: letters,
    normalize: function (toks) { return normalize(cloneToks(toks), null); },
    /** האם אפשר לפצל את toks[i] (יש אקורד, ולפחות 2 אותיות) */
    canSplit: function (toks, i) { var t = toks[i]; return isText(t) && !!t.chord && letters(t.text).length >= 2; },
    place: function (toks, i, chord) {
      if (!isWord(toks[i]) || !chord) return fail(toks, 'bad-index');
      var a = cloneToks(toks); a[i].chord = chord;
      return normalize(a, a[i]);
    },
    remove: function (toks, i) {
      if (!isWord(toks[i]) || !toks[i].chord) return fail(toks, 'no-chord');
      var a = cloneToks(toks), t = a[i], next = null;
      if (!t.text) {   // הפוקוס עובר למילה הבאה בשורה (או הקודמת)
        for (var j = i + 1; j < a.length && a[j].type !== 'newline'; j++) if (isWord(a[j])) { next = a[j]; break; }
        for (j = i - 1; !next && j >= 0 && a[j].type !== 'newline'; j--) if (isWord(a[j])) { next = a[j]; break; }
        dropStandalone(a, t);
      } else { t.chord = null; next = t; }
      return normalize(a, next);
    },
    /** אקורד נוסף בתוך המילה: toks[i] = "הולך"[C], k=2 → "הו"[C] "לך"[chord]. k = אינדקס-אות (1..אותיות-1) */
    split: function (toks, i, k, chord) {
      var t = toks[i];
      if (!isText(t) || !chord) return fail(toks, 'bad-index');
      if (!t.chord) return fail(toks, 'no-chord');
      var L = letters(t.text);
      if (!(k >= 1 && k < L.length)) return fail(toks, 'bad-letter');
      var a = cloneToks(toks), at = L[k].at;
      var tail = { type: 'word', text: a[i].text.slice(at), chord: chord };
      a[i].text = a[i].text.slice(0, at);
      a.splice(i + 1, 0, tail);
      return normalize(a, tail);
    },
    /** אקורד בלי מילה לפני toks[at] (פתיחה / בין מילים). at === toks.length → בסוף */
    insertStandalone: function (toks, at, chord) {
      if (!(at >= 0 && at <= toks.length) || !chord) return fail(toks, 'bad-index');
      var a = cloneToks(toks);
      return normalize(a, putStandalone(a, at, chord));
    },
    /** הזזת האקורד של toks[from] ליעד:
        {kind:'word', i}      → על המילה (מחליף אקורד קיים, כמו בעורך הישן)
        {kind:'split', i, k}  → בתוך המילה מהאות k (אם אין לה אקורד: על כל המילה, fallback:true)
        {kind:'insert', at}   → אקורד בלי מילה לפני toks[at] */
    move: function (toks, from, target) {
      var s = toks[from];
      if (!isWord(s) || !s.chord || !target) return fail(toks, 'no-chord');
      var a = cloneToks(toks), src = a[from], chord = src.chord, fallback = false, got;
      var tgt = target.kind === 'insert' ? null : a[target.i];
      if (target.kind !== 'insert' && !isWord(tgt)) return fail(toks, 'bad-index');
      if (tgt === src) return fail(toks, 'same');
      var anchor = null;
      if (target.kind === 'insert') {
        if (!(target.at >= 0 && target.at <= a.length)) return fail(toks, 'bad-index');
        var at = target.at < a.length && isText(a[target.at]) ? groupStartIdx(a, target.at) : target.at;
        for (var q = at; q < a.length; q++) if (a[q].type !== 'space') { anchor = a[q]; break; }
        if (anchor === src) {   // "לפני עצמו" — כבר שם
          var nx = a[from + 1] && a[from + 1].type === 'space' ? from + 2 : from + 1;
          anchor = a[nx] || null;
        }
      }
      // מסירים את המקור (לפי זהות-אובייקט — האינדקסים זזים)
      if (!src.text) dropStandalone(a, src); else src.chord = null;
      if (target.kind === 'insert') {
        var pos = anchor ? a.indexOf(anchor) : a.length;
        got = putStandalone(a, pos < 0 ? a.length : pos, chord);
      } else if (target.kind === 'split') {
        var L = letters(tgt.text), k = target.k;
        if (!tgt.text || !(k >= 1 && k < L.length)) { tgt.chord = chord; got = tgt; fallback = !!tgt.text && k !== 0; }
        else if (!tgt.chord) { tgt.chord = chord; got = tgt; fallback = true; }
        else {
          got = { type: 'word', text: tgt.text.slice(L[k].at), chord: chord };
          tgt.text = tgt.text.slice(0, L[k].at);
          a.splice(a.indexOf(tgt) + 1, 0, got);
        }
      } else { tgt.chord = chord; got = tgt; }
      var r = normalize(a, got);
      if (fallback) r.fallback = true;
      return r;
    },
    /** שורת אקורדים בלי מילים (פתיחה / מעבר / סיום) לפני או אחרי שורה li. chords = ['Am','G']
        where: 'before' | 'after' | 'blank' (R9: li היא שורה ריקה בין בתים → "

Am

") */
    chordLine: function (toks, li, where, chords) {
      chords = (chords || []).filter(Boolean);
      if (!chords.length) return fail(toks, 'no-chord');
      var lines = lineInfo(toks), L = lines[li];
      if (!L) return fail(toks, 'bad-index');
      var a = cloneToks(toks), seq = [];
      chords.forEach(function (c, n) {
        if (n) seq.push({ type: 'space', text: ' ', chord: null });
        seq.push({ type: 'word', text: '', chord: c });
      });
      var first = seq[0], NL = function () { return { type: 'newline', text: '\n', chord: null }; };
      if (!a.length) { a = seq; }
      else if (where === 'before') { a.splice.apply(a, [L.start, 0].concat(seq, [NL()])); }
      else if (where === 'blank') {   // R9: בתוך שורה ריקה (בין בתים): שורה ריקה נשארת מעל ומתחת
        if (L.end > L.start) return fail(toks, 'not-empty');
        a.splice.apply(a, [L.start, 0].concat([NL()], seq, [NL()]));
      }
      else if (L.end < a.length) { a.splice.apply(a, [L.end + 1, 0].concat(seq, [NL()])); }
      else { a.push(NL()); a.push.apply(a, seq); }
      return normalize(a, first);
    },
    /** אקורד נוסף בסוף שורה li (לשורת-אקורדים: "+") */
    appendToLine: function (toks, li, chord) {
      var L = lineInfo(toks)[li];
      if (!L || !chord) return fail(toks, 'bad-index');
      var a = cloneToks(toks), at = L.end;
      while (at > L.start && a[at - 1].type === 'space') at--;
      var tok = { type: 'word', text: '', chord: chord };
      var ins = [tok];
      if (at > L.start && isWord(a[at - 1])) ins.unshift({ type: 'space', text: ' ', chord: null });
      a.splice.apply(a, [at, 0].concat(ins));
      return normalize(a, tok);
    },
    /** אקורד בלי מילה מיד אחרי toks[i] (אחרי אקורד-עצמאי, או אחרי סוף המילה הכתובה), עם רווח ביניהם */
    insertAfter: function (toks, i, chord) {
      if (!isWord(toks[i]) || !chord) return fail(toks, 'bad-index');
      var a = cloneToks(toks), j = i;
      if (a[j].text) while (isText(a[j + 1])) j++;
      var tok = { type: 'word', text: '', chord: chord };
      var sp = a[j + 1] && a[j + 1].type === 'space';
      var ins = [{ type: 'space', text: ' ', chord: null }, tok];
      if (isWord(a[j + (sp ? 2 : 1)])) ins.push({ type: 'space', text: ' ', chord: null });
      a.splice.apply(a, [j + 1, sp ? 1 : 0].concat(ins));
      return normalize(a, tok);
    },
    /** אינדקס-שורה של toks[i] */
    lineOf: function (toks, i) { var li = 0; for (var k = 0; k < i && k < toks.length; k++) if (toks[k].type === 'newline') li++; return li; },
    /** "שורת אקורדים" = יש בה אקורדים ואין בה אף מילה כתובה */
    isChordLine: function (toks, li) { var L = lineInfo(toks)[li]; return !!L && L.chorded && !L.groups; }
  };

  /* ══ Chord picker ═════════════════════════════════════
     opts: { songChords:[], current:'Am'|null, last:'G'|null, onPick(chord),
             typed: bool  — שדה "הקלידו אקורד" גלוי בראש הבורר (F3),
             prefill: 'F' — אות שהוקלדה מהמקלדת (פוקוס תמיד),
             autofocus: bool — פוקוס לשדה (במחשב בלבד; בטלפון המקלדת לא קופצת),
             compact: bool — בלי "בנו אותו" (R6: בורר קטן מתחת לשורת-האותיות),
             multi: bool + onPickMany(['Am','G']) — R6: השדה מקבל כמה אקורדים ("Am G F" / "Am, G, F");
                    אחד לא-תקין → שגיאה שמציינת אותו, ושום דבר לא נוסף }
     הקשה על צ'יפ = בחירה מיידית (2 הקשות סה"כ). "בנה" = שורש + סוג (+ בס) → "הצב". */
  var pickerSeq = 0;
  UCLab.chordPicker = function (opts) {
    var wrap = el('div', { class: 'lab-picker' + (opts.compact ? ' lab-picker--compact' : '') });
    var errId = 'lab-typed-err' + (pickerSeq++ ? '-' + pickerSeq : '');   // R6: כמה בוררים באותו גיליון — id ייחודי
    var used = {};
    function chip(ch, cls) {
      used[ch] = 1;
      return el('button', {
        type: 'button', class: 'lab-chip' + (cls ? ' ' + cls : '') + (ch === opts.current ? ' is-on' : ''),
        text: ch, 'aria-label': 'אקורד ' + ch, onclick: function () { opts.onPick(ch); }
      });
    }
    // ── F3: הקלדת שם אקורד (גלוי, למעלה) ──
    if (opts.typed) {
      var tErr = el('div', { class: 'lab-error lab-typed-err', hidden: true, role: 'alert', id: errId });
      var tIn = el('input', {
        type: 'text', class: 'lab-typed-in', dir: 'rtl', inputmode: 'text', enterkeyhint: 'done',
        autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
        placeholder: opts.multi ? 'הקלידו אקורדים, למשל Am G F' : 'הקלידו אקורד, למשל F#m7',
        'aria-label': opts.multi ? 'הקלדת אקורד אחד או כמה' : 'הקלדת שם אקורד', 'aria-describedby': errId,
        'data-autofocus': (opts.prefill || opts.autofocus) ? true : null
      });
      if (opts.prefill) tIn.value = opts.prefill;
      var tBad = function (raw) {
        tErr.textContent = '"' + raw + '" לא נראה כמו אקורד. מתחילים באות A עד G, למשל Am או F#7';
        tErr.hidden = false; tIn.setAttribute('aria-invalid', 'true');
      };
      var tGo = function () {
        var raw = tIn.value.trim();
        if (!raw) { tIn.focus(); return; }
        if (opts.multi) {
          var parts = raw.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean), list = [];
          for (var n = 0; n < parts.length; n++) {
            var c = UCLab.normChord(parts[n]);
            if (!c) { tBad(parts[n]); return; }
            list.push(c);
          }
          tIn.value = '';
          if (opts.onPickMany) opts.onPickMany(list); else list.forEach(function (x) { opts.onPick(x); });
          return;
        }
        var v = UCLab.normChord(raw);
        if (v) { opts.onPick(v); return; }
        tBad(raw);
      };
      tIn.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); tGo(); } });
      tIn.addEventListener('input', function () { tErr.hidden = true; tIn.removeAttribute('aria-invalid'); });
      wrap.appendChild(el('div', { class: 'lab-typed' }, [tIn, el('button', { type: 'button', class: 'lab-btn', text: 'הוסיפו', onclick: tGo })]));
      wrap.appendChild(tErr);
    }
    var song = (opts.songChords || []).slice(0, 12);
    if (opts.last && song.indexOf(opts.last) === -1) song.unshift(opts.last);
    if (song.length) {
      wrap.appendChild(el('h4', { text: 'מהשיר הזה' }));
      wrap.appendChild(el('div', { class: 'lab-chips' }, song.map(function (c) { return chip(c, 'is-song'); })));
    }
    var common = UCLab.COMMON.filter(function (c) { return !used[c]; });
    wrap.appendChild(el('h4', { text: song.length ? 'עוד אקורדים נפוצים' : 'אקורדים נפוצים' }));
    wrap.appendChild(el('div', { class: 'lab-chips' }, common.map(function (c) { return chip(c); })));
    if (opts.compact) return wrap;

    // ── בנאי: שורש → סוג → (בס) ──
    var b = { root: null, qual: '', bass: null, bassMode: false };
    var out = el('output', { 'aria-live': 'polite', text: '?' });
    var placeBtn = el('button', { type: 'button', class: 'lab-btn lab-btn--primary', text: 'הצב', disabled: true, onclick: function () { if (b.root) opts.onPick(built()); } });
    function built() { return b.root ? b.root + b.qual + (b.bass ? '/' + b.bass : '') : ''; }
    function sync() {
      out.textContent = built() || '?';
      placeBtn.disabled = !b.root;
      rootsBox.querySelectorAll('.lab-chip').forEach(function (n) {
        n.classList.toggle('is-on', b.bassMode ? n.dataset.v === b.bass : n.dataset.v === b.root);
      });
      qualsBox.querySelectorAll('.lab-chip').forEach(function (n) { n.classList.toggle('is-on', n.dataset.v === b.qual); });
      bassBtn.classList.toggle('is-on', b.bassMode);
      bassBtn.textContent = b.bassMode ? 'בוחרים בס… (הקישו תו)' : (b.bass ? 'בס: /' + b.bass + ' ✕' : '+ בס (/)');
    }
    var rootsBox = el('div', { class: 'lab-chips lab-chips--roots' }, UCLab.ROOTS.map(function (r) {
      return el('button', { type: 'button', class: 'lab-chip', text: r, 'data-v': r, onclick: function () {
        if (b.bassMode) { b.bass = r; b.bassMode = false; } else { b.root = r; }
        sync();
      } });
    }));
    var qualsBox = el('div', { class: 'lab-chips lab-chips--quals' }, UCLab.QUALS.map(function (q) {
      return el('button', { type: 'button', class: 'lab-chip', text: q.label, 'data-v': q.v, onclick: function () { b.qual = q.v; sync(); } });
    }));
    var bassBtn = el('button', { type: 'button', class: 'lab-chip', onclick: function () {
      if (b.bass && !b.bassMode) { b.bass = null; } else { b.bassMode = !b.bassMode; }
      sync();
    } });
    var builderKids = [
      el('summary', { class: 'lab-btn lab-btn--ghost', text: 'אקורד אחר? בנו אותו ›' }),
      el('h4', { text: '1. התו' }), rootsBox,
      el('h4', { text: '2. הסוג' }), qualsBox,
      el('div', { class: 'lab-chips', style: 'margin-top:8px' }, [bassBtn]),
      el('div', { class: 'lab-builder-out' }, [out, placeBtn])
    ];
    if (!opts.typed) {   // בלי השדה העליון: ההקלדה נשארת כאן כמו קודם
      var free = el('input', { type: 'text', dir: 'ltr', inputmode: 'text', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', placeholder: 'למשל F#m7', 'aria-label': 'הקלדת אקורד' });
      var freeErr = el('div', { class: 'lab-error', hidden: true, text: 'זה לא נראה כמו אקורד. מתחילים באות A עד G, למשל Am או F#7' });
      var freeBtn = el('button', { type: 'button', class: 'lab-btn', text: 'הצב', onclick: function () {
        var v = UCLab.normChord(free.value);
        if (v) { opts.onPick(v); } else { freeErr.hidden = false; }
      } });
      builderKids.push(el('h4', { text: 'או הקלידו' }), el('div', { class: 'lab-row' }, [free, freeBtn]), freeErr);
    }
    wrap.appendChild(el('details', { class: 'lab-builder' }, builderKids));
    sync();
    return wrap;
  };

  /* ══ ChordStep — רכיב-הייחוס ═══════════════════════════
     opts: { raw:'...', onChange(raw, tokens), hintKey:'cs', emptyText, onFirstChord() }
     מחזיר: { el, getRaw, getTokens, setRaw(raw, {undoable}), undo, redo, canUndo, canRedo,
              redoButton({class, text}), openFor(i), destroy }
     עקרונות: click בלבד (גלילה לעולם לא מזיזה אקורד) · כל שינוי = toast עם "בטל" (הצבה: עד 3 ברצף) ·
     אקורד תמיד LTR · מילה צמודה (פיצול-אמצע-מילה) מוצגת צמודה.
     מקלדת (מחשב): Ctrl/⌘+Z בטל · Ctrl+Y / Ctrl+Shift+Z חזור · חיצים בין מילים (שמאל = המילה הבאה) ·
     Delete/Backspace מוחק את האקורד · A–G פותח את הבורר עם האות מוקלדת. לא נוגע במקשים כשמקלידים בשדה.
     R6 (K6): כל שינוי עובר דרך UCLab.ops (apply) · "עוד אקורד על המילה הזו?" = שורת-אותיות (ops.split) + לפני המילה
     (ops.insertStandalone) · שורות-אקורדים: "＋ שורת אקורדים בהתחלה/בסוף", "＋" בשורת-אקורדים, "מעל/מתחת" בגיליון,
     "＋ אקורד אחריו" · גיליון-שרשרת = צעד-ביטול אחד · וו-גרירה UCLab.drag.attach(root, {getTokens, commit, busy}). */
  var quietPlace = false, placeStreak = 0;   // F5b: אחרי 3 הצבות ברצף — בלי toast להצבה (לכל העמוד)
  var COARSE = (function () { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
  var FINE = (function () { try { return window.matchMedia('(pointer: fine)').matches; } catch (e) { return false; } })();
  function editableTarget(n) {
    return !!(n && n.closest && (n.isContentEditable || n.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')));
  }

  UCLab.ChordStep = function (host, opts) {
    opts = opts || {};
    var toks = parse(opts.raw || '');
    var hist = new History(80);
    var ver = 0;                 // גרסת-מצב: toast "בטל" ישן לא מבטל פעולה אחרת
    var lastPicked = null, firstFired = false, toastHide = null, redoBtns = [];
    var dragHandle = null;       // R6 §2d: UCLab.drag.attach(root, ctx) (lab-drag.js, בעלים G)
    var root = el('div', { class: 'lab-chordstep', dir: 'rtl' });
    var live = el('div', { class: 'lab-sr', role: 'status', 'aria-live': 'polite' });
    // R8: "שימה מהירה" (מכחול) — סרגל מעל השיר. brush = האקורד הנבחר (null = כבוי)
    var brush = null, brushOrder = [], brushSeen = {}, gapsDrawn = false;
    var lineMode = false;        // R10: "＋ שורת אקורדים" בסרגל → מקומות בין כל שתי שורות (חד-פעמי: נכבה אחרי הוספה)
    var brushBar = el('div', { class: 'lab-brush', role: 'group', 'aria-label': 'שימה מהירה של אקורד' });
    host.appendChild(brushBar);
    host.appendChild(root);
    host.appendChild(live);

    function snapshot() { hist.push(serialize(toks)); }
    function syncRedo() { redoBtns.forEach(function (b) { if (b.dataset.keep) b.disabled = !hist.canRedo(); else b.hidden = !hist.canRedo(); }); }
    function changed(flashIdx, focusIdx) {
      ver++;
      render(flashIdx, focusIdx);
      syncRedo();
      if (opts.onChange) opts.onChange(serialize(toks), toks);
    }
    function firstChord() {
      if (firstFired) return; firstFired = true;
      if (typeof opts.onFirstChord === 'function') { try { opts.onFirstChord(); } catch (e) { console.error('[UCLab] onFirstChord', e); } }
    }
    function say(msg) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); }
    function dropToast() { if (toastHide) { toastHide(); toastHide = null; } }
    function notify(msg) {
      var v = ver;
      toastHide = UCLab.toast(msg, { action: 'בטל', onAction: function () { toastHide = null; if (ver === v) undo(); } });
    }
    function firstDiff(a, b) {
      var n = Math.max(a.length, b.length);
      for (var k = 0; k < n; k++) {
        var x = a[k], y = b[k];
        if (!x || !y || x.type !== y.type || x.text !== y.text || (x.chord || null) !== (y.chord || null)) return k;
      }
      return -1;
    }
    function restore(raw) {
      var before = toks;
      toks = parse(raw);
      var k = firstDiff(before, toks);
      changed(k, k);
      var b = k >= 0 && wordBtn(k);
      if (b) ensureVisible(b);
    }
    function undo() {
      var s = hist.undo(serialize(toks));
      if (s == null) return false;
      placeStreak = 0; dropToast();
      restore(s);
      say('בוטל');
      return true;
    }
    function redo() {
      var s = hist.redo(serialize(toks));
      if (s == null) return false;
      placeStreak = 0; dropToast();
      restore(s);
      say('חזרנו על הפעולה');
      return true;
    }
    function wordLabel(t) { return t.text || '(אקורד בלי מילה)'; }

    /* ── ציור ── */
    function wordBtn(i) {
      if (i == null || i < 0) return null;
      var b = root.querySelector('.lab-cs-word[data-i="' + i + '"]');
      if (b) return b;
      for (var d = 1; d < toks.length; d++) {   // האינדקס זז (מחיקת אקורד-עצמאי וכו') → המילה הקרובה
        b = root.querySelector('.lab-cs-word[data-i="' + (i + d) + '"]') || root.querySelector('.lab-cs-word[data-i="' + (i - d) + '"]');
        if (b) return b;
      }
      return null;
    }
    function ensureVisible(n) {
      var r = n.getBoundingClientRect(), vh = window.innerHeight || 800;
      if (r.top < 90 || r.bottom > vh - 110) {
        var smooth = true; try { smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
        n.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      }
    }
    function render(flashIdx, focusIdx) {
      var a = document.activeElement;
      var had = a && a !== root && root.contains(a);
      if (had && focusIdx == null && a.dataset && a.dataset.i != null) focusIdx = +a.dataset.i;
      root.innerHTML = '';
      var lines = lineInfo(toks), li = 0, anyChordAbove = false, prevReal = null;
      var line = el('div', { class: 'lab-cs-line' });
      var lineHasWord = false;
      // R6 §2c: "＋ שורת אקורדים בהתחלה" — כשיש תוכן והשורה הראשונה (שאינה ריקה) אינה כבר שורת-אקורדים
      var firstReal = -1, lastReal = -1;
      lines.forEach(function (L, n) { if (L.end > L.start) { if (firstReal < 0) firstReal = n; lastReal = n; } });
      if (toks.length && firstReal >= 0 && !(lines[firstReal].chorded && !lines[firstReal].groups)) {
        root.appendChild(addPill('top', 'שורת אקורדים בהתחלה'));
      }
      var gapOn = gapsDrawn = !!brush, lastW = -1;   // R9: בשימה מהירה, רווחים = מקום לאקורד בלי מילה
      function flush(at) {
        var L = lines[li++];
        if (!lineHasWord) line.classList.add('lab-cs-line--empty');
        if (gapOn && lineHasWord && L && !(L.chorded && !L.groups)) {
          // ה-"+" שבסוף השורה צמוד למילה האחרונה, כדי שלא ירד לבד לשורה חדשה כשהשורה ארוכה
          var g = gapBtn(at, 'אחרי ' + gapName(lastW)), lw = line.lastChild;
          if (lw && lw.classList.contains('lab-cs-word')) {
            var tail = el('span', { class: 'lab-cs-tail' });
            line.insertBefore(tail, lw); tail.appendChild(lw); tail.appendChild(g);
          } else line.appendChild(g);
        }
        if (gapOn && !lineHasWord && L && li - 1 > firstReal && li - 1 < lastReal) {   // שורה ריקה בין בתים
          line.appendChild(el('button', { type: 'button', class: 'lab-cs-addline lab-cs-addline--here', 'data-where': 'here', 'data-line': li - 1,
            'aria-label': 'שורת אקורדים חדשה כאן עם ' + brush }, [el('span', { 'aria-hidden': 'true', text: '＋ ' }), 'שורת אקורדים כאן']));
        }
        if (L && L.chorded && !L.groups) {   // שורת-אקורדים (פתיחה / מעבר / סיום): "＋" בסוף השורה
          line.classList.add('lab-cs-line--chords');
          line.appendChild(el('button', { type: 'button', class: 'lab-cs-lineplus', 'data-line': li - 1,
            'aria-label': 'הוספת אקורד לשורה הזו', title: 'הוספת אקורד לשורה הזו', text: '＋' }));
        }
        // F2: שורה בלי אקורדים, מיד אחרי שורה עם אקורדים (תחילת "פער") → פעולה קטנה אחת
        if (L && L.groups && !L.header) {
          if (!L.chorded && anyChordAbove && prevReal && prevReal.chorded) {
            line.appendChild(el('button', { type: 'button', class: 'lab-cs-copyline', 'data-line': li - 1, 'aria-label': 'לשים בשורה הזו את אותם אקורדים כמו בשורה אחרת', text: 'אותם אקורדים כמו…' }));
          }
          if (L.chorded) anyChordAbove = true;
          prevReal = L;
        }
        root.appendChild(line);
        // R10: בין שתי שורות עם תוכן (שורה ריקה כבר מקבלת "כאן" משלה)
        if (gapOn && lineMode && L && L.end > L.start && lines[li] && lines[li].end > lines[li].start) {
          var nb = el('div', { class: 'lab-cs-addrow lab-cs-addrow--between' }, [
            el('button', { type: 'button', class: 'lab-cs-addline lab-cs-addline--between', 'data-where': 'between', 'data-line': li - 1,
              'aria-label': 'שורת אקורדים חדשה עם ' + brush + ' בין השורה "' + L.text + '" לשורה הבאה' }, [el('span', { 'aria-hidden': 'true', text: '＋ ' }), 'שורת אקורדים כאן'])
          ]);
          root.appendChild(nb);
        }
        line = el('div', { class: 'lab-cs-line' }); lineHasWord = false; lastW = -1;
      }
      toks.forEach(function (t, i) {
        if (t.type === 'newline') { flush(i); return; }
        if (t.type === 'space') {
          if (gapOn && isWord(toks[i - 1]) && isWord(toks[i + 1])) line.appendChild(gapBtn(i + 1, 'בין ' + gapName(i - 1) + ' ל' + gapName(i + 1)));
          else line.appendChild(el('span', { class: 'lab-cs-space', 'aria-hidden': 'true' }));
          return;
        }
        if (gapOn && !lineHasWord) line.appendChild(gapBtn(i, 'לפני ' + gapName(i)));
        lineHasWord = true; lastW = i;
        var standalone = !t.text && t.chord;
        var pv = toks[i - 1], nx = toks[i + 1];
        var joined = (pv && pv.type === 'word' && pv.text && t.text) || (nx && nx.type === 'word' && nx.text && t.text);
        var label = (t.chord ? 'אקורד ' + t.chord + ' על ' : 'הוספת אקורד ל') + (standalone ? 'מקום בלי מילה' : '"' + t.text + '"');
        var b = el('button', {
          type: 'button',
          class: 'lab-cs-word' + (t.chord ? ' has-chord' : '') + (standalone ? ' lab-cs-word--standalone' : '') + (joined ? ' is-joined' : '') + (i === flashIdx ? ' is-flash' : ''),
          'data-i': i, 'aria-label': label
        }, [
          el('span', { class: 'lab-cs-chord', text: t.chord || ' ' }),
          el('span', { class: 'lab-cs-text', text: t.text || '♪' })
        ]);
        line.appendChild(b);
      });
      flush(toks.length);
      if (toks.length && lastReal >= 0) root.appendChild(addPill('end', 'שורת אקורדים בסוף', lastReal));
      if (!toks.length && opts.emptyText) root.appendChild(el('p', { class: 'lab-sub', text: opts.emptyText }));
      if (had) { var f = wordBtn(focusIdx); if (f) f.focus({ preventScroll: true }); }
      renderBrush();
    }

    /* ── R8: שימה מהירה ("מכחול") ──
       בוחרים אקורד בסרגל פעם אחת, וכל נגיעה במילה שמה אותו, בלי גיליון. נגיעה במילה שכבר יש עליה
       אותו אקורד מורידה אותו. "סיום" / Esc / נגיעה שנייה בצ'יפ יוצאים. כל נגיעה = צעד-ביטול אחד
       (דרך place / removeAt, כמו היום). סדר הצ'יפים יציב בזמן העבודה: לא קופצים כשהספירה משתנה. */
    /** R9: מקום בין מילים / לפני / אחרי, בשימה מהירה. at = האינדקס שלפניו נכנס אקורד-בלי-מילה (ops.insertStandalone) */
    function gapBtn(at, where) {
      return el('button', { type: 'button', class: 'lab-cs-gap', 'data-at': at, 'aria-label': 'שימת ' + brush + ' ' + where },
        [el('span', { class: 'lab-cs-gap-mark', 'aria-hidden': 'true', text: '+' })]);
    }
    function gapName(i) {
      var t = toks[i];
      if (!t || t.type !== 'word') return '';
      return t.text ? '"' + groupAt(i).text + '"' : 'האקורד ' + t.chord;
    }
    function brushGap(at) {
      if (!brush) return;
      var c = brush, nx = toks[at], name = nx && nx.type === 'word' ? gapName(at) : '';
      if (!apply(UCLab.ops.insertStandalone(toks, at, c))) return;
      lastPicked = c;
      placed('נוסף ' + c + (name ? ' לפני ' + name : ' בסוף השורה'));
      firstChord();
    }
    /** R9: שורת אקורדים חדשה עם האקורד הנבחר. where: top | end | here (שורה ריקה בין בתים) */
    function brushLine(li, where) {
      if (!brush) return;
      var c = brush, w = where === 'top' ? 'before' : where === 'here' ? 'blank' : 'after';
      var wasLM = lineMode;
      lineMode = false;              // R10: חד-פעמי; ממשיכים את השורה עם ה-"＋" שלה
      if (!apply(UCLab.ops.chordLine(toks, li, w, [c]))) { if (wasLM) render(); return; }
      lastPicked = c;
      placeStreak = 0;
      notify('נוספה שורת אקורדים: ' + c + '. ה־＋ בסוף השורה מוסיף עוד');
      firstChord();
    }
    function brushAppend(li) {
      if (!brush) return;
      var c = brush;
      if (!apply(UCLab.ops.appendToLine(toks, li, c))) return;
      lastPicked = c;
      placed('נוסף ' + c + ' לשורה');
      firstChord();
    }
    function brushChoices() {
      var song = UCLab.songChords(toks), inSong = {};
      song.forEach(function (c) { inSong[c] = 1; });
      brushOrder = brushOrder.filter(function (c) { return inSong[c] || brushSeen[c] || c === brush; });
      song.forEach(function (c) { if (brushOrder.indexOf(c) < 0) brushOrder.push(c); });
      if (!brushOrder.length) return UCLab.COMMON.slice(0, 6);   // שיר בלי אקורדים עדיין
      var list = brushOrder.slice(0, 16);
      if (brush && list.indexOf(brush) < 0) list.push(brush);
      return list;
    }
    function renderBrush() {
      var on = !!brush;
      var a = document.activeElement;
      var focusChip = a && brushBar.contains(a) ? (a.dataset.chord || a.dataset.role || null) : null;
      brushBar.innerHTML = '';
      brushBar.hidden = !toks.length;
      brushBar.classList.toggle('is-on', on);
      root.classList.toggle('is-brushing', on);
      if (gapsDrawn !== on) { render(); return; }   // R9: הרווחים מופיעים / נעלמים (render מצייר וקורא שוב ל-renderBrush)
      brushBar.appendChild(el('div', { class: 'lab-brush-head' }, [
        el('span', { class: 'lab-brush-label' }, on
          ? [lineMode ? 'בוחרים בין אילו שורות להוסיף שורת אקורדים עם ' : 'נוגעים במילה או ברווח כדי לשים ', el('bdi', { class: 'lab-brush-cur', dir: 'ltr', text: brush })]
          : ['שימה מהירה: בוחרים אקורד ונוגעים במילים']),
      ]));
      // R10: כשפעיל — שורת-כלים: "＋ שורת אקורדים בין שורות" + "סיום" (ההסבר למעלה נשאר בשורה אחת)
      if (on) brushBar.appendChild(el('div', { class: 'lab-brush-tools' }, [
        el('button', { type: 'button', class: 'lab-btn lab-btn--ghost lab-brush-lines' + (lineMode ? ' is-on' : ''), 'data-role': 'lines',
          'aria-pressed': lineMode ? 'true' : 'false', text: lineMode ? 'ביטול שורה חדשה' : '＋ שורת אקורדים בין שורות',
          onclick: function () { lineMode = !lineMode; render(); say(lineMode ? 'נוגעים ב"שורת אקורדים כאן" בין השורות' : 'בוטל'); } }),
        el('button', { type: 'button', class: 'lab-btn lab-brush-done', 'data-role': 'done', text: 'סיום', onclick: function () { setBrush(null); } })
      ]));
      var chips = el('div', { class: 'lab-brush-chips' }, brushChoices().map(function (c) {
        return el('button', {
          type: 'button', class: 'lab-chip lab-brush-chip' + (c === brush ? ' is-on' : ''), 'data-chord': c,
          'aria-pressed': c === brush ? 'true' : 'false', 'aria-label': 'שימה מהירה של ' + c, text: c,
          onclick: function () { setBrush(c === brush ? null : c); }
        });
      }));
      chips.appendChild(el('button', { type: 'button', class: 'lab-btn lab-btn--ghost lab-brush-other', 'data-role': 'other', text: 'אקורד אחר…', onclick: openBrushPicker }));
      brushBar.appendChild(chips);
      if (focusChip) {
        var n = brushBar.querySelector('[data-chord="' + focusChip.replace(/["\\]/g, '\\$&') + '"]') || brushBar.querySelector('[data-role="' + focusChip + '"]')
          || brushBar.querySelector('.lab-brush-chip');
        if (n) n.focus({ preventScroll: true });
      }
    }
    function setBrush(c) {
      brush = c || null;
      if (!brush && lineMode) { lineMode = false; render(); }
      if (brush) brushSeen[brush] = 1;
      // שיר בלי אקורדים: הצ'יפים הנפוצים נשארים בסרגל אחרי הנגיעה הראשונה (לא מצטמצמים לאקורד אחד)
      if (brush && !brushOrder.length) UCLab.COMMON.slice(0, 6).forEach(function (x) { brushSeen[x] = 1; brushOrder.push(x); });
      root.querySelectorAll('.is-sel').forEach(function (n) { n.classList.remove('is-sel'); });
      renderBrush();
      say(brush ? 'שימה מהירה: ' + brush + '. נגעו במילים כדי לשים אותו' : 'השימה המהירה הסתיימה');
    }
    function openBrushPicker() {
      var body = el('div', {}, [UCLab.chordPicker({
        songChords: UCLab.songChords(toks), current: brush, last: lastPicked, typed: true, autofocus: !COARSE,
        onPick: function (c) {
          UCLab.sheet.close(true);
          var k = brushOrder.indexOf(c);
          if (k >= 0) brushOrder.splice(k, 1);
          brushOrder.unshift(c);
          setBrush(c);
        }
      })]);
      UCLab.sheet.open({ title: 'איזה אקורד לשים בנגיעה?', body: body });
    }
    function brushAt(i) {
      var t = toks[i];
      if (!brush || !t || t.type !== 'word') return;
      if (t.chord === brush) removeAt(i);
      else place(i, brush);
    }
    function onBrushKey(e) {
      if (!root.isConnected) { document.removeEventListener('keydown', onBrushKey, true); return; }
      if (!brush || e.key !== 'Escape' || e.defaultPrevented || e.isComposing || UCLab.sheet.isOpen()) return;
      if (!root.getClientRects().length) return;               // מוסתר (מצב טקסט / מסך אחר)
      e.preventDefault();                                      // לא לסגור את העורך כולו (lab-edit בודק defaultPrevented)
      setBrush(null);
    }
    document.addEventListener('keydown', onBrushKey, true);
    function addPill(where, text, li) {
      return el('div', { class: 'lab-cs-addrow lab-cs-addrow--' + where }, [
        el('button', { type: 'button', class: 'lab-cs-addline lab-cs-addline--' + where, 'data-where': where,
          'data-line': li == null ? 0 : li }, [el('span', { 'aria-hidden': 'true', text: '＋ ' }), text])
      ]);
    }

    // האצלה: click (לא touch/pointer) → גלילה לא נחשבת הקשה
    root.addEventListener('click', function (e) {
      var c = e.target.closest('.lab-cs-copyline');
      if (c) { openCopy(+c.dataset.line, c); return; }
      var gp = e.target.closest('.lab-cs-gap');
      if (gp) { brushGap(+gp.dataset.at); return; }   // R9
      var ap = e.target.closest('.lab-cs-addline');
      if (ap) {
        if (brush) { brushLine(+ap.dataset.line, ap.dataset.where); return; }
        openChain({ li: +ap.dataset.line, where: ap.dataset.where === 'top' ? 'before' : 'after' }); return;
      }
      var lp = e.target.closest('.lab-cs-lineplus');
      if (lp) { if (brush) brushAppend(+lp.dataset.line); else openChain({ li: +lp.dataset.line, append: true }); return; }
      var b = e.target.closest('.lab-cs-word');
      if (!b) return;
      if (brush) { brushAt(+b.dataset.i); return; }   // R8: שימה מהירה, בלי גיליון
      openFor(+b.dataset.i, b);
    });

    function neighbor(i, dir) {
      for (var j = i + dir; j >= 0 && j < toks.length; j += dir) {
        if (toks[j].type === 'word' && toks[j].text) return j;
      }
      return -1;
    }

    function lineContext(i, whole) {
      // השורה של המילה, עם המילה מודגשת — הקשר למי שנוגע בפעם הראשונה
      var s = i, e = i;
      while (s > 0 && toks[s - 1].type !== 'newline') s--;
      while (e < toks.length - 1 && toks[e + 1].type !== 'newline') e++;
      var p = el('div', { class: 'lab-sheet-line' });
      for (var j = s; j <= e; j++) {
        var t = toks[j];
        if (t.type === 'space') { p.appendChild(document.createTextNode(' ')); continue; }
        if (t.type !== 'word') continue;
        if (j === i && !whole) p.appendChild(el('strong', { class: 'lab-sheet-word', text: t.text || '♪' }));
        else p.appendChild(document.createTextNode(t.text));
      }
      return p;
    }

    function placed(msg) {
      placeStreak++;
      if (quietPlace) { dropToast(); say(msg); }
      else notify(msg);
      if (placeStreak >= 3) quietPlace = true;
    }
    /* R6 §2a: כל שינוי עובר דרך UCLab.ops (מנורמל: מה שמצויר = מה שנשמר).
       apply(r) → false כש-ok:false או כשהתוצאה זהה (אין צעד-ביטול ריק); אחרת snapshot + toks חדשים + ציור. */
    function apply(r, flash) {
      if (!r || !r.ok) return false;
      if (serialize(r.toks) === serialize(toks)) return false;
      snapshot();
      toks = r.toks;
      changed(flash === null ? null : r.focus, r.focus);
      return true;
    }
    /** קבוצה = מילה כתובה (כל חלקיה הצמודים) סביב toks[i]: { s, e(כולל), text } */
    function groupAt(i) {
      var s = i, e = i;
      if (!toks[i] || !toks[i].text) return { s: i, e: i, text: '' };
      while (s > 0 && isText(toks[s - 1])) s--;
      while (e < toks.length - 1 && isText(toks[e + 1])) e++;
      var txt = '';
      for (var k = s; k <= e; k++) txt += toks[k].text;
      return { s: s, e: e, text: txt };
    }
    function place(i, chord) {
      var t = toks[i], prev = t && t.chord;
      var r = UCLab.ops.place(toks, i, chord);
      UCLab.sheet.close(true);
      if (!apply(r)) return;
      lastPicked = chord;
      placed(prev ? 'הוחלף ' + prev + ' ← ' + chord : 'נוסף ' + chord + ' על "' + wordLabel(toks[r.focus] || t) + '"');
      firstChord();
    }
    function removeAt(i) {
      var t = toks[i], prev = t && t.chord;
      if (!prev) return;
      var g = t.text ? groupAt(i) : null, oldText = t.text;
      UCLab.sheet.close(true);
      if (!apply(UCLab.ops.remove(toks, i), null)) return;
      placeStreak = 0;
      // כלל-הפורמט: בלי אקורד, החלק מתאחד עם החלק שאחריו, והאקורד שלו מתחיל עכשיו כאן. אומרים את זה (מה שרואים = מה שנשמר).
      var msg = 'האקורד ' + prev + ' נמחק';
      var now = g && g.e > g.s ? toks[i] : null;   // החלקים שלפני i לא השתנו → אותו אינדקס = אותו מקום
      if (now && now.text && now.chord && now.text.length > oldText.length) {
        msg += '. ' + now.chord + ' עכשיו ' + (now.text === g.text ? 'על כל המילה "' : 'על "') + now.text + '"';
      }
      notify(msg);
    }
    /* "→ למילה הקודמת / למילה הבאה ←". החלטת-K6: כשלשכנה יש אקורד — מחליפים ביניהם (swap) ולא דורסים.
       כפתור שאומר "הזזה" לא אמור למחוק אקורד בשקט; וכך הכפתור עבד עד עכשיו. החלפה בין שני חלקים עם אקורד
       לא משנה את מבנה הטוקנים (שני place), ולכן האינדקסים יציבים. שכנה בלי אקורד → ops.move (הזזה רגילה). */
    function moveAt(i, dir) {
      var j = neighbor(i, dir);
      if (j < 0 || !toks[i] || !toks[i].chord) return;
      var a = toks[i].chord, b = toks[j].chord, r;
      if (b) {
        var r1 = UCLab.ops.place(toks, j, a);
        r = r1.ok ? UCLab.ops.place(r1.toks, i, b) : r1;
        if (r.ok) r.focus = r1.focus;
      } else {
        r = UCLab.ops.move(toks, i, { kind: 'word', i: j });
      }
      UCLab.sheet.close(true);
      if (!apply(r)) return;
      placeStreak = 0;
      var to = toks[r.focus] || {};
      notify(b ? 'האקורד ' + a + ' הוזז ל"' + wordLabel(to) + '", והאקורד ' + b + ' עבר למקומו'
               : 'האקורד ' + a + ' הוזז ל"' + wordLabel(to) + '"');
    }
    function insertBefore(i, chord) {
      var g = groupAt(i);
      UCLab.sheet.close(true);
      if (!apply(UCLab.ops.insertStandalone(toks, g.s, chord))) return;
      lastPicked = chord;
      placed('נוסף ' + chord + ' לפני "' + (g.text || wordLabel(toks[i] || {})) + '"');
      firstChord();
    }
    /** R6 §2c: "＋ אקורד אחריו" (על אקורד בלי מילה) */
    function insertAfterAt(i, chord) {
      var prev = toks[i] && toks[i].chord;
      UCLab.sheet.close(true);
      if (!apply(UCLab.ops.insertAfter(toks, i, chord))) return;
      lastPicked = chord;
      placed('נוסף ' + chord + (prev ? ' אחרי ' + prev : ''));
      firstChord();
    }
    /** R6 §2b: אות בתוך המילה. k===0 → הצבה על החלק; אחרת פיצול (ops.split) */
    function placeAtLetter(pi, k, chord) {
      if (k === 0) { place(pi, chord); return; }
      var whole = groupAt(pi).text;
      UCLab.sheet.close(true);
      var r = UCLab.ops.split(toks, pi, k, chord);
      if (!apply(r)) return;
      lastPicked = chord;
      placeStreak = 0;
      notify('נוסף ' + chord + ' על "' + wordLabel(toks[r.focus] || {}) + '" (בתוך "' + whole + '")');
      firstChord();
    }
    function copyLine(dstLi, srcLi) {
      var lines = lineInfo(toks), D = lines[dstLi], S = lines[srcLi];
      if (!D || !S) return;
      snapshot();
      var mapped = mapChordsToLine(toks.slice(S.start, S.end), toks.slice(D.start, D.end));
      var n = mapped.filter(function (t) { return t.chord; }).length;
      toks.splice.apply(toks, [D.start, D.end - D.start].concat(mapped));
      toks = parse(serialize(toks));   // המודל = מה שעושה round-trip
      UCLab.sheet.close(true);
      var first = -1;
      for (var k = D.start; k < toks.length && toks[k].type !== 'newline'; k++) { if (toks[k].type === 'word') { first = k; break; } }
      changed(first, first);
      placeStreak = 0;
      notify(n === 1 ? 'הועתק אקורד אחד לשורה' : 'הועתקו ' + n + ' אקורדים לשורה');
      if (n) firstChord();
    }

    /* F2: גיליון "אותם אקורדים כמו…" — בחירת שורת-מקור (המומלצת ראשונה) */
    function openCopy(dstLi) {
      var lines = lineInfo(toks), D = lines[dstLi];
      var src = copySources(toks, dstLi, lines);
      if (!D || !src.list.length) return;
      var firstWord = -1;
      for (var k = D.start; k < D.end; k++) { if (toks[k].type === 'word' && toks[k].text) { firstWord = k; break; } }
      var body = el('div', { class: 'lab-copy' });
      if (firstWord >= 0) body.appendChild(lineContext(firstWord, true));
      body.appendChild(el('p', { class: 'lab-sub', text: 'בחרו שורה, והאקורדים שלה יעברו לכאן לפי סדר המילים.' }));
      src.list.forEach(function (li) {
        var L = lines[li], seq = [];
        for (var j = L.start; j < L.end; j++) if (toks[j].chord) seq.push(toks[j].chord);
        var best = li === src.best;
        body.appendChild(el('button', {
          type: 'button', class: 'lab-copy-opt' + (best ? ' is-best' : ''),
          'data-autofocus': best && !COARSE ? true : null,
          onclick: function () { copyLine(dstLi, li); }
        }, [
          el('span', { class: 'lab-copy-text', text: L.text }),
          el('span', { class: 'lab-copy-chords', text: seq.join('  ') }),
          best && el('span', { class: 'lab-copy-tag', text: 'מומלץ' })
        ]));
      });
      UCLab.sheet.open({ title: 'אותם אקורדים כמו…', body: body });
    }

    function openFor(i, btn, prefill) {
      var t = toks[i];
      if (!t || t.type !== 'word') return;
      root.querySelectorAll('.is-sel').forEach(function (n) { n.classList.remove('is-sel'); });
      if (btn) btn.classList.add('is-sel');
      var body = el('div');
      body.appendChild(lineContext(i));
      var standalone = !t.text;

      if (t.chord) {
        var prevJ = standalone ? -1 : neighbor(i, -1), nextJ = standalone ? -1 : neighbor(i, +1);
        body.appendChild(el('h4', { text: 'מה לעשות עם ' + t.chord + '?' }));
        body.appendChild(el('div', { class: 'lab-row' }, [
          el('button', { type: 'button', class: 'lab-btn lab-btn--danger', text: '🗑 מחיקה', onclick: function () { removeAt(i); } }),
          standalone && el('button', { type: 'button', class: 'lab-btn lab-cs-after', text: '＋ אקורד אחריו', onclick: function () { openAfter(i); } }),
          prevJ >= 0 && el('button', { type: 'button', class: 'lab-btn', text: '→ למילה הקודמת', onclick: function () { moveAt(i, -1); } }),
          nextJ >= 0 && el('button', { type: 'button', class: 'lab-btn', text: 'למילה הבאה ←', onclick: function () { moveAt(i, +1); } })
        ]));
        // R6: טיפ-גרירה, רק כשמודול-הגרירה באמת פעיל (אחרת זו הבטחה שלא מתקיימת)
        if (dragHandle) body.appendChild(el('p', { class: 'lab-cs-tip', text: FINE ? 'טיפ: אפשר גם לגרור את האקורד עם העכבר.' : 'טיפ: אפשר גם להחזיק את האקורד ולגרור אותו.' }));
        body.appendChild(el('h4', { text: 'או החליפו באקורד אחר:' }));
      }
      body.appendChild(UCLab.chordPicker({
        songChords: UCLab.songChords(toks), current: t.chord, last: lastPicked,
        typed: true, prefill: prefill || '', autofocus: !COARSE,
        onPick: function (c) { place(i, c); }
      }));
      if (!standalone) {
        // R6 §2b: "עוד אקורד על המילה הזו?" (1) בתוך המילה, מאות מסוימת · (2) לפני המילה, בלי מילה
        var extra = el('details', { class: 'lab-extra' }, [
          el('summary', { class: 'lab-btn lab-btn--ghost', text: 'עוד אקורד על המילה הזו? ›' }),
          el('h4', { text: 'בתוך המילה, מאיזו אות?' }),
          letterRow(i),
          el('h4', { text: 'לפני המילה, בלי מילה (למשל פתיחה)' }),
          UCLab.chordPicker({ songChords: UCLab.songChords(toks), last: lastPicked, onPick: function (c) { insertBefore(i, c); } })
        ]);
        body.appendChild(extra);
        // F2 בגיליון: מילה בשורה שאין בה אקורדים, ויש מעליה שורה עם אקורדים
        var lines = lineInfo(toks), li = 0;
        for (var k = 0; k < i; k++) if (toks[k].type === 'newline') li++;
        var L = lines[li];
        if (L && !L.chorded && L.groups && copySources(toks, li, lines).list.length) {
          body.appendChild(el('button', { type: 'button', class: 'lab-btn lab-btn--ghost lab-copy-more', text: 'אותם אקורדים כמו בשורה אחרת ›',
            onclick: function () { openCopy(li); } }));
        }
      }
      // R6 §2c: שורת אקורדים (פתיחה / מעבר / סיום) מעל או מתחת לשורה הזו
      var myLi = UCLab.ops.lineOf(toks, i);
      body.appendChild(el('div', { class: 'lab-row lab-cs-linebtns' }, [
        el('button', { type: 'button', class: 'lab-btn lab-btn--ghost', text: '＋ שורת אקורדים מעל', onclick: function () { openChain({ li: myLi, where: 'before' }); } }),
        el('button', { type: 'button', class: 'lab-btn lab-btn--ghost', text: '＋ שורת אקורדים מתחת', onclick: function () { openChain({ li: myLi, where: 'after' }); } })
      ]));
      var sh = UCLab.sheet.open({
        title: t.chord ? 'אקורד על המילה' : 'איזה אקורד לשים כאן?',
        body: body,
        onClose: function () { if (btn) btn.classList.remove('is-sel'); }
      });
      var inp = prefill && sh.querySelector('.lab-typed-in');
      if (inp) { try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {} }
    }

    /* R6 §2b: שורת-האותיות של כל המילה הכתובה (כל החלקים), בסדר הקריאה.
       אות פעילה = תחילת חלק (הצבה על החלק) או אות בתוך חלק שיש לו אקורד (פיצול). אחרת מושבתת:
       לפי כלל-הפורמט חלק בלי אקורד לא יכול להתפצל. */
    function letterRow(i) {
      var g = groupAt(i), any = false, p;
      for (p = g.s; p <= g.e; p++) if (toks[p].chord) any = true;
      if (!any) return el('p', { class: 'lab-sub lab-letters-none', text: 'קודם בחרו למעלה אקורד למילה, ואז אפשר להוסיף עוד אחד באמצע שלה.' });
      var row = el('div', { class: 'lab-letters', role: 'group', 'aria-label': 'האותיות של "' + g.text + '"' });
      var pickHost = el('div', { class: 'lab-letters-pick', hidden: true });
      var lockedFirst = null;
      function chooseLetter(b, p, k, s) {
        row.querySelectorAll('.lab-letter').forEach(function (n) { n.setAttribute('aria-pressed', n === b ? 'true' : 'false'); });
        pickHost.innerHTML = '';
        var cur = k === 0 ? toks[p].chord : null;
        pickHost.appendChild(el('p', { class: 'lab-letters-q', text: cur ? 'במקום ' + cur + ', מהאות "' + s + '":' : 'איזה אקורד מהאות "' + s + '"?' }));
        pickHost.appendChild(UCLab.chordPicker({
          songChords: UCLab.songChords(toks), current: cur, last: lastPicked, typed: true, compact: true,
          onPick: function (c) { placeAtLetter(p, k, c); }
        }));
        pickHost.hidden = false;
        try { pickHost.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }
      function addPiece(p) {
        var T = toks[p], L = UCLab.ops.letters(T.text);
        L.forEach(function (x, k) {
          var start = k === 0, can = start || !!T.chord;
          var label = start && T.chord ? 'האות ' + x.s + ', כאן מתחיל ' + T.chord
                    : start ? 'אקורד מהאות ' + x.s
                    : can ? 'אקורד נוסף מהאות ' + x.s : 'האות ' + x.s;
          if (!can && lockedFirst == null) lockedFirst = L[0].s;
          var b = el('button', {
            type: 'button', class: 'lab-letter' + (start ? ' is-start' : '') + (start && T.chord ? ' has-chord' : ''),
            'data-piece': p, 'data-k': k, 'aria-pressed': 'false', 'aria-label': label, disabled: !can
          }, [
            el('span', { class: 'lab-letter-chord', 'aria-hidden': 'true', text: start && T.chord ? T.chord : ' ' }),
            el('span', { class: 'lab-letter-s', text: x.s })
          ]);
          b.addEventListener('click', function () { chooseLetter(b, p, k, x.s); });
          row.appendChild(b);
        });
      }
      for (p = g.s; p <= g.e; p++) addPiece(p);
      return el('div', { class: 'lab-letters-wrap' }, [
        row,
        lockedFirst != null && el('p', { class: 'lab-sub lab-letters-note', text: 'כדי לבחור אות בהירה, קודם שימו אקורד על האות "' + lockedFirst + '".' }),
        pickHost
      ]);
    }

    /* R6 §2c: "＋ אקורד אחריו" על אקורד בלי מילה */
    function openAfter(i) {
      var t = toks[i];
      if (!t || !t.chord) return;
      var body = el('div', null, [
        el('p', { class: 'lab-sub', text: 'האקורד החדש יבוא מיד אחרי ' + t.chord + ', בלי מילה מתחתיו.' }),
        UCLab.chordPicker({ songChords: UCLab.songChords(toks), last: lastPicked, typed: true, autofocus: !COARSE,
          onPick: function (c) { insertAfterAt(i, c); } })
      ]);
      UCLab.sheet.open({ title: 'איזה אקורד אחרי ' + t.chord + '?', body: body });
    }

    /* R6 §2c: גיליון-שרשרת. o = { li, where:'before'|'after' } (שורה חדשה) או { li, append:true } ("＋" בשורת-אקורדים).
       כל בחירה נוספת מיד (השיר מאחור מתעדכן) והגיליון נשאר פתוח. כל השרשרת = צעד-ביטול אחד:
       snapshot פעם אחת בבחירה הראשונה. בסגירה (סיימתי / ✕ / רקע / Esc): toast אחד עם "בטל" לכל השרשרת. */
    function openChain(o) {
      var lines = lineInfo(toks);
      if (toks.length && !lines[o.li]) return;
      var picks = [], newLi = o.append ? o.li : -1, pre = [], lastFocus = -1;
      if (o.append) { var L0 = lines[o.li]; for (var q = L0.start; q < L0.end; q++) if (toks[q].chord) pre.push(toks[q].chord); }
      var chips = el('div', { class: 'lab-chain-chips', dir: 'rtl', role: 'list', 'aria-label': 'האקורדים בשורה' });
      var err = el('div', { class: 'lab-error', hidden: true, role: 'alert' });
      function drawChips() {
        chips.innerHTML = '';
        pre.forEach(function (c) { chips.appendChild(el('span', { class: 'lab-chain-chip is-old', role: 'listitem', text: c })); });
        picks.forEach(function (c) { chips.appendChild(el('span', { class: 'lab-chain-chip is-new', role: 'listitem', text: c })); });
        if (!pre.length && !picks.length) chips.appendChild(el('span', { class: 'lab-chain-empty', text: 'עוד לא נבחרו אקורדים. בחרו למטה, לפי הסדר.' }));
      }
      function add(list) {
        list = (list || []).filter(Boolean);
        if (!list.length) return;
        var r, cur = toks, first = !picks.length;
        if (first && !o.append) {
          r = UCLab.ops.chordLine(toks, o.li, o.where, list);
          if (!r.ok) return;
          newLi = UCLab.ops.lineOf(r.toks, r.focus);
          cur = r.toks;
        } else {
          for (var n = 0; n < list.length; n++) {
            r = UCLab.ops.appendToLine(cur, newLi, list[n]);
            if (!r.ok) { err.textContent = 'לא הצלחנו להוסיף את ' + list[n] + '.'; err.hidden = false; return; }
            cur = r.toks;
          }
        }
        if (first) snapshot();          // צעד-ביטול אחד לכל השרשרת
        toks = cur;
        picks = picks.concat(list);
        lastPicked = list[list.length - 1];
        err.hidden = true;
        lastFocus = r.focus;
        changed(r.focus, null);
        drawChips();
        say('נוסף ' + list.join(' '));
      }
      drawChips();
      var body = el('div', { class: 'lab-chain' }, [
        el('div', { class: 'lab-chain-head' }, [
          chips,
          el('button', { type: 'button', class: 'lab-btn lab-btn--primary lab-chain-done', text: 'סיימתי', onclick: function () { UCLab.sheet.close(); } })
        ]),
        err,
        UCLab.chordPicker({
          songChords: UCLab.songChords(toks), last: lastPicked, typed: true, multi: true, autofocus: !COARSE,
          onPick: function (c) { add([c]); }, onPickMany: add
        })
      ]);
      UCLab.sheet.open({
        title: o.append ? 'הוספת אקורדים לשורה' : 'שורת אקורדים חדשה',
        body: body,
        onGone: function () {
          if (!picks.length) return;     // סגירה בלי בחירה = שום שינוי
          placeStreak = 0;
          notify(o.append ? (picks.length === 1 ? 'נוסף ' + picks[0] + ' לשורה' : 'נוספו לשורה: ' + picks.join(' '))
                          : 'נוספה שורת אקורדים: ' + picks.join(' '));
          firstChord();
          if (!COARSE) { var fb = wordBtn(lastFocus); if (fb) fb.focus({ preventScroll: true }); }   // מקלדת: הפוקוס חוזר לשורה החדשה
        }
      });
    }

    /* ── F4: מקלדת ── */
    function onKey(e) {
      if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.defaultPrevented || e.isComposing || UCLab.sheet.isOpen()) return;
      if (editableTarget(e.target)) return;
      if (!root.getClientRects().length) return;               // מוסתר (מסך אחר)
      var mod = e.ctrlKey || e.metaKey, k = e.key || '';
      if (mod && !e.altKey && (k === 'z' || k === 'Z' || e.code === 'KeyZ')) {
        e.preventDefault(); if (e.shiftKey) redo(); else undo(); return;
      }
      if (mod && !e.altKey && !e.shiftKey && (k === 'y' || k === 'Y' || e.code === 'KeyY')) { e.preventDefault(); redo(); return; }
      if (mod || e.altKey) return;
      var a = document.activeElement;
      var w = a && root.contains(a) && a.classList && a.classList.contains('lab-cs-word') ? a : null;
      if (!w) return;
      var i = +w.dataset.i;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        // RTL: שמאל = המילה הבאה בסדר הקריאה
        var dir = (k === 'ArrowLeft') === (getComputedStyle(root).direction !== 'ltr') ? 1 : -1;
        e.preventDefault(); stepWord(i, dir); return;
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); stepLine(i, k === 'ArrowDown' ? 1 : -1); return; }
      if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        if (toks[i] && toks[i].chord) removeAt(i);
        return;
      }
      // A–G (גם במקלדת עברית: לפי המקש הפיזי)
      var letter = /^[a-gA-G]$/.test(k) ? k : (!/^[a-zA-Z]$/.test(k) && /^Key[A-G]$/.test(e.code || '') ? e.code.slice(3) : '');
      if (letter) { e.preventDefault(); openFor(i, w, letter.toUpperCase()); }
    }
    document.addEventListener('keydown', onKey);
    function focusWord(j) { var b = wordBtn(j); if (b) { b.focus({ preventScroll: true }); ensureVisible(b); } }
    function stepWord(i, dir) {
      for (var j = i + dir; j >= 0 && j < toks.length; j += dir) if (toks[j].type === 'word') { focusWord(j); return; }
    }
    function stepLine(i, dir) {
      var lines = lineInfo(toks), li = -1;
      lines.forEach(function (L, n) { if (i >= L.start && i < L.end) li = n; });
      if (li < 0) return;
      var cur = lines[li], ord = 0;
      for (var j = cur.start; j < i; j++) if (toks[j].type === 'word') ord++;
      for (var n = li + dir; n >= 0 && n < lines.length; n += dir) {
        var words = [];
        for (var q = lines[n].start; q < lines[n].end; q++) if (toks[q].type === 'word') words.push(q);
        if (words.length) { focusWord(words[Math.min(ord, words.length - 1)]); return; }
      }
    }

    render();

    /* R6 §2d: וו-הגרירה. G (lab-drag.js) קורא רק דרך ctx: getTokens (קריאה בלבד), commit(r, msg), busy().
       commit = צעד-ביטול אחד + ציור + toast עם "בטל". ok:false או בלי שינוי → false, ושום דבר לא קורה. */
    if (UCLab.drag && typeof UCLab.drag.attach === 'function') {
      try {
        dragHandle = UCLab.drag.attach(root, {
          getTokens: function () { return toks; },
          commit: function (r, msg) {
            if (!apply(r)) return false;
            placeStreak = 0;
            if (msg) notify(msg); else dropToast();
            firstChord();
            return true;
          },
          busy: function () { return UCLab.sheet.isOpen(); }
        }) || null;
      } catch (e) { console.error('[UCLab] drag.attach', e); dragHandle = null; }
    }

    return {
      el: root,
      getRaw: function () { return serialize(toks); },
      getTokens: function () { return toks; },
      /** setRaw(raw) — מחליף ומאפס היסטוריה (כמו קודם, בלי onChange).
          setRaw(raw, {undoable:true}) — צעד אחד שאפשר לבטל, עם onChange (אחרי "עריכת טקסט"). */
      setRaw: function (raw, o) {
        if (o && o.undoable) {
          if (serialize(parse(raw)) === serialize(toks)) return;
          snapshot(); placeStreak = 0; dropToast();
          var before = toks; toks = parse(raw);
          var k = firstDiff(before, toks);
          changed(k, null);
          return;
        }
        toks = parse(raw); hist.clear(); ver++; dropToast(); render(); syncRedo();
      },
      undo: undo,
      redo: redo,
      canUndo: function () { return hist.canUndo(); },
      canRedo: function () { return hist.canRedo(); },
      /** כפתור "חזור" לשים ליד "בטל". מוסתר כשאין מה להחזיר ({keepVisible:true} → disabled במקום) */
      redoButton: function (o) {
        o = o || {};
        var b = el('button', { type: 'button', class: o.class || 'lab-btn lab-cs-redo', 'aria-label': 'חזרה על מה שבוטל', title: 'חזור (Ctrl+Y)',
          onclick: function () { redo(); } }, [el('span', { 'aria-hidden': 'true', text: '↷' }), ' ' + (o.text || 'חזור')]);
        if (o.keepVisible) b.dataset.keep = '1';
        redoBtns.push(b); syncRedo();
        return b;
      },
      openFor: function (i) { openFor(i, root.querySelector('[data-i="' + i + '"]')); },
      destroy: function () {
        document.removeEventListener('keydown', onKey); document.removeEventListener('keydown', onBrushKey, true); dropToast();
        if (dragHandle && typeof dragHandle.destroy === 'function') { try { dragHandle.destroy(); } catch (e) { console.error('[UCLab] drag.destroy', e); } }
        dragHandle = null;
        root.remove(); live.remove(); brushBar.remove();
      }
    };
  };

  /* ══ Preview (קריאה-בלבד; rate-limit 60/min → לקרוא עם debounce ≥600ms) ══ */
  UCLab.preview = function (raw, title, performer) {
    var fd = new FormData();
    fd.append('action', 'achord_live_preview');
    fd.append('chords_content', raw || '');
    fd.append('song_title', title || '');
    fd.append('song_performer', performer || '');
    fd.append('achord_nonce', D.nonce || '');
    return fetch(D.ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' })
      // השרת מחזיר HTML גולמי (echo do_shortcode), או JSON {success:false} בשגיאת-nonce
      .then(function (r) { return r.text(); })
      .then(function (t) { return /^\s*\{"success":false/.test(t) ? Promise.reject(t) : t; });
  };
  UCLab.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  };

  /* ══ Demo submit — במקום שליחה אמיתית ══════════════════════
     kind: 'add_song' | 'notebook_save' | 'notebook_publish' | 'personal_save' | 'propose' | 'personal_delete'
     fields: אובייקט שדות בשמות האמיתיים של השרת (ראו C-infra §2)
     view: { title, performer, onClose, onGone, okText } — onGone נקרא בכל סגירה (גם כשגיליון אחר מחליף) */
  var ACTIONS = {
    add_song: 'achord_submit_song', notebook_save: 'achord_notebook_save_song', notebook_publish: 'achord_notebook_publish_song',
    personal_save: 'achord_save_personal_version', propose: 'achord_submit_proposal', personal_delete: 'achord_delete_personal_version'
  };
  var OKTEXT = {
    add_song: 'השיר נשלח לאישור העורכים 🎉',
    notebook_save: 'השיר נשמר במחברת שלכם ✓',
    notebook_publish: 'השיר נשלח לאישור העורכים, והוא שמור גם במחברת שלכם 🎉',
    personal_save: 'הגרסה שלך נשמרה ✓',
    propose: 'ההצעה נשלחה לעורכים, תודה! 🙏',
    personal_delete: 'הגרסה שלכם נמחקה. חוזרים לגרסה של האתר.'
  };
  /* איזה nonce לאיזו פעולה (כמו העורך הישן בדיוק) */
  var UPLOAD_NONCE_ACTIONS = ['achord_submit_song', 'achord_notebook_save_song', 'achord_notebook_publish_song'];
  var PERSONAL_NONCE_ACTIONS = ['achord_save_personal_version', 'achord_submit_proposal', 'achord_delete_personal_version'];
  UCLab.demoSubmit = function (kind, fields, view) {
    view = view || {};
    fields = fields || {};
    var action = ACTIONS[kind];
    var payload = Object.assign({ action: action }, fields);
    if (UPLOAD_NONCE_ACTIONS.indexOf(action) !== -1) payload.achord_nonce = '(nonce)';
    else payload.nonce = '(personal_nonce)';
    var raw = fields.version_normal != null ? fields.version_normal : fields.raw_text;
    var withPreview = view.preview !== false && kind !== 'personal_delete' && raw != null;
    var prev = withPreview ? el('div', { class: 'lab-demo-preview', text: 'טוען תצוגה…' }) : null;
    var body = el('div', null, [
      el('p', { class: 'lab-demo-ok', text: view.okText || OKTEXT[kind] || 'נשלח' }),
      el('p', { class: 'lab-sub', text: 'זה מה שהמשתמש יראה. בעמוד הבדיקה שום דבר לא נשמר באמת.' }),
      withPreview && el('h4', { text: 'כך השיר ייראה באתר:' }), prev,
      el('details', null, [
        el('summary', { class: 'lab-btn lab-btn--ghost', text: 'למפתחים: מה היה נשלח לשרת ›' }),
        el('pre', { class: 'lab-demo-payload', text: JSON.stringify(payload, null, 2) })
      ]),
      el('div', { class: 'lab-row', style: 'margin-top:12px' }, [
        el('button', { type: 'button', class: 'lab-btn lab-btn--primary', text: 'סגירה', 'data-autofocus': true, onclick: function () { UCLab.sheet.close(); } })
      ])
    ]);
    UCLab.sheet.open({ title: 'הדגמה: כאן היה נשלח', body: body, onClose: view.onClose, onGone: view.onGone });
    if (withPreview) {
      UCLab.preview(raw, fields.title || view.title || '', fields.performer || view.performer || '')
        .then(function (html) { prev.innerHTML = html; })
        .catch(function () { prev.textContent = '(לא הצלחנו לטעון תצוגה, זה לא משפיע על השמירה)'; });
    }
    console.info('[UCLab demo] would POST', payload);
    return payload;
  };

  /* ══ Round 5 (K): שליחה אמיתית לשרת — UCLab.api ══════════════════════════════
     עיקרון: כלפי השרת בדיוק כמו העורך הישן (אותן פעולות, אותם שדות, אותו nonce);
     כלפי המשתמש — כפתור נעול, הודעה ברורה, "נסו שוב", ושום טקסט לא נמחק.

     UCLab.api.real                         true רק ב-&live=1 + מנהל (PHP קובע). אחרת הדגמה.
     UCLab.api.loggedIn                     לפי UC_LAB.loggedIn / personalNonce
     UCLab.api.send(action, fields, opts) → Promise<Result>   (לעולם לא נדחה)
        Result = { ok, message, data, network, demo, timeout?, action }
        opts: { button, busyText, okText, demoKind, title, performer,
                keepBusyOnOk  — הכפתור נשאר נעול אחרי הצלחה (לפני מעבר-עמוד),
                demoSheet:false — בהדגמה: בלי גיליון, מחזיר מיד ok (לשלב-ביניים, למשל "שמירה" לפני "הצעה"),
                timeout (ms, ברירת-מחדל 25000) }
     UCLab.busy(btn, on, busyText?)         נעילה: disabled + aria-busy + טקסט, ושחזור מלא ב-off
     UCLab.notice(host, {kind,text,retry,retryText,login,reload})  שורת-מצב אחת (מחליפה את הקודמת). null → מנקה
     UCLab.explain(result) → { text, retry, login, reload, kind }
     UCLab.noticeResult(host, result, {retry, okText})  = notice(host, explain(result)) — קיצור
     UCLab.reloadFresh(delay)               העתק של PersonalEditor.reloadFresh (main.js) */
  var MSG = {
    network: 'אין חיבור כרגע. מה שכתבתם לא נמחק. נסו שוב.',
    security: 'הדף פתוח הרבה זמן. הטיוטה שמורה. רעננו את הדף והמשיכו.',
    login: 'כדי לשמור צריך להתחבר. מה שכתבתם לא נמחק.',
    generic: 'שגיאה'
  };
  var BUSYTEXT = {
    achord_submit_song: 'שולחים…', achord_notebook_save_song: 'שומרים…', achord_notebook_publish_song: 'שולחים…',
    achord_save_personal_version: 'שומרים…', achord_submit_proposal: 'שולחים…', achord_delete_personal_version: 'מוחקים…'
  };
  var DEMOKIND = {};
  Object.keys(ACTIONS).forEach(function (k) { DEMOKIND[ACTIONS[k]] = k; });
  function truthy(v) { return v === true || v === 1 || v === '1' || v === 'true'; }   // wp_localize_script הופך bool למחרוזת
  function plain(s) {   // הודעת-שרת → טקסט (achord_submit_song מחזיר SVG + טקסט)
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function result(o) {
    return { ok: !!o.ok, message: o.message || '', data: o.data === undefined ? null : o.data,
             network: !!o.network, demo: !!o.demo, timeout: !!o.timeout, action: o.action || '' };
  }

  var api = UCLab.api = UCLab.api || {};
  api.real = truthy(D.real);
  api.loggedIn = truthy(D.loggedIn) || !!D.personalNonce;
  api.MSG = MSG;
  api.TIMEOUT = 25000;
  var inflight = {};
  api.inFlight = function (action) { return !!inflight[action]; };

  /** השדה והערך של ה-nonce לפעולה: { field, value } או null (פעולה בלי nonce שלנו) */
  api.nonceFor = function (action) {
    if (UPLOAD_NONCE_ACTIONS.indexOf(action) !== -1) return { field: 'achord_nonce', value: D.nonce || '' };
    if (PERSONAL_NONCE_ACTIONS.indexOf(action) !== -1) return { field: 'nonce', value: D.personalNonce || '' };
    return null;
  };

  /** FormData בסדר: action, ה-nonce, ואז השדות. מערך → כמה ערכים באותו שם (למשל 'genres[]'). */
  api.formData = function (action, fields) {
    var fd = new FormData();
    fd.append('action', action);
    var n = api.nonceFor(action);
    fields = fields || {};
    if (n) fd.append(n.field, n.value || (fields[n.field] != null ? String(fields[n.field]) : ''));
    Object.keys(fields).forEach(function (k) {
      if (k === 'action' || (n && k === n.field)) return;
      var v = fields[k];
      if (v == null) return;
      (Array.isArray(v) ? v : [v]).forEach(function (x) {
        if (x == null) return;
        fd.append(k, typeof x === 'boolean' ? (x ? '1' : '0') : String(x));
      });
    });
    return fd;
  };

  /** תשובת-שרת (טקסט) → Result. admin-ajax מחזיר "0" כשאין handler למשתמש לא-מחובר, ו-"-1" בכשל-nonce. */
  api.parse = function (text, action, opts) {
    opts = opts || {};
    var body = String(text == null ? '' : text).trim();
    if (body === '0') return result({ ok: false, message: 'יש להתחבר.', action: action });
    if (body === '-1') return result({ ok: false, message: 'שגיאת אבטחה.', action: action });
    var json;
    try { json = JSON.parse(body); } catch (e) { json = null; }
    if (!json || typeof json !== 'object' || typeof json.success !== 'boolean') {
      return result({ ok: false, network: true, message: MSG.network, action: action });
    }
    var d = json.data;
    if (json.success) {
      var m = d && typeof d === 'object' ? d.message : (typeof d === 'string' ? d : '');
      return result({ ok: true, data: d === undefined ? null : d, message: plain(m) || opts.okText || '', action: action });
    }
    var em = d && typeof d === 'object' ? (d.message || '') : d;
    return result({ ok: false, data: d === undefined ? null : d, message: plain(em) || MSG.generic, action: action });
  };

  function realSend(action, fields, opts) {
    return new Promise(function (resolve) {
      var done = false, timer = null, ctrl = null;
      function finish(r) { if (done) return; done = true; clearTimeout(timer); resolve(r); }
      var n = api.nonceFor(action);
      if (n && n.field === 'nonce' && !n.value) {   // אין personalNonce = לא מחוברים (העורך הישן היה מקבל "0")
        finish(result({ ok: false, message: 'יש להתחבר.', action: action }));
        return;
      }
      var ms = opts.timeout || api.TIMEOUT;
      try { ctrl = typeof AbortController === 'function' ? new AbortController() : null; } catch (e) { ctrl = null; }
      timer = setTimeout(function () {
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        finish(result({ ok: false, network: true, timeout: true, message: MSG.network, action: action }));
      }, ms);
      try {
        var init = { method: 'POST', body: api.formData(action, fields), credentials: 'same-origin' };
        if (ctrl) init.signal = ctrl.signal;
        window.fetch(D.ajaxUrl, init)
          .then(function (r) { return r.text(); })
          .then(function (t) { finish(api.parse(t, action, opts)); })
          .catch(function () { finish(result({ ok: false, network: true, message: MSG.network, action: action })); });
      } catch (e) {
        finish(result({ ok: false, network: true, message: MSG.network, action: action }));
      }
    });
  }

  function demoSend(action, fields, opts) {
    var kind = opts.demoKind || DEMOKIND[action];
    var okText = opts.okText || OKTEXT[kind] || '';
    var ok = result({ ok: true, demo: true, message: okText, action: action,
                      data: { demo: true, payload: Object.assign({ action: action }, fields || {}) } });
    if (opts.demoSheet === false || !kind) return Promise.resolve(ok);
    return new Promise(function (resolve) {
      try {
        UCLab.demoSubmit(kind, fields || {}, { title: opts.title, performer: opts.performer, okText: opts.okText,
          onGone: function () { resolve(ok); } });
      } catch (e) {
        console.error('[UCLab] demoSubmit', e);
        resolve(ok);
      }
    });
  }

  /** send(action, fields, opts) → Promise<Result>. לעולם לא נדחה. קריאה שנייה לאותה פעולה בזמן שהראשונה באוויר → אותו Promise. */
  api.send = function (action, fields, opts) {
    opts = opts || {};
    if (inflight[action]) return inflight[action];
    var btn = opts.button || null;
    if (btn) UCLab.busy(btn, true, opts.busyText || BUSYTEXT[action]);
    var p = (api.real ? realSend(action, fields, opts) : demoSend(action, fields, opts))
      .then(null, function (e) {   // רשת-ביטחון: אף פעם לא נדחה
        console.error('[UCLab] api.send', e);
        return result({ ok: false, network: true, message: MSG.network, action: action });
      })
      .then(function (r) {
        delete inflight[action];
        if (btn && !(r.ok && opts.keepBusyOnOk)) UCLab.busy(btn, false);
        return r;
      });
    inflight[action] = p;
    return p;
  };

  /* ── busy: כפתור נעול בזמן שליחה ── */
  UCLab.busy = function (btn, on, busyText) {
    if (!btn) return;
    if (on) {
      if (!btn._ucBusy) {
        btn._ucBusy = { kids: Array.prototype.slice.call(btn.childNodes), disabled: btn.disabled, minWidth: btn.style.minWidth };
        var w = btn.offsetWidth;
        if (w) btn.style.minWidth = w + 'px';   // בלי קפיצה כשהטקסט מתקצר
      }
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.classList.add('is-busy');
      if (busyText) {
        while (btn.firstChild) btn.removeChild(btn.firstChild);
        btn.appendChild(el('span', { class: 'lab-spin', 'aria-hidden': 'true' }));
        btn.appendChild(el('span', { text: busyText }));
      }
      return;
    }
    var s = btn._ucBusy;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('is-busy');
    if (!s) { btn.disabled = false; return; }
    if (s.kids.length && s.kids[0].parentNode !== btn) {   // הוחלף בטקסט-המתנה → מחזירים את הצמתים המקוריים (מאזינים/הפניות נשמרים)
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      s.kids.forEach(function (k) { btn.appendChild(k); });
    }
    btn.disabled = s.disabled;
    btn.style.minWidth = s.minWidth || '';
    btn._ucBusy = null;
  };

  /* ── explain: Result → מה להגיד למשתמש ומה להציע ── */
  UCLab.explain = function (r) {
    r = r || {};
    var msg = String(r.message || '');
    if (r.ok) return { kind: 'ok', text: msg, retry: false, login: false, reload: false };
    if (r.network) return { kind: 'error', text: MSG.network, retry: true, login: false, reload: false };
    if (/שגיאת אבטחה/.test(msg)) return { kind: 'error', text: MSG.security, retry: false, login: false, reload: true };
    if (/יש להתחבר/.test(msg)) return { kind: 'error', text: MSG.login, retry: false, login: true, reload: false };
    return { kind: 'error', text: msg || MSG.generic, retry: false, login: false, reload: false };
  };

  /* ── notice: שורת-מצב אחת בתוך host ──
     o: { kind:'ok'|'error'|'info', text, retry:fn, retryText, login:bool, reload:bool }   null/undefined → מנקה */
  UCLab.notice = function (host, o) {
    if (!host) return null;
    var old = host._ucNotice;
    if (old && !host.contains(old)) old = null;
    if (!o || (!o.text && !o.login && !o.reload && !o.retry)) {
      if (old) old.remove();
      host._ucNotice = null;
      return null;
    }
    var kind = o.kind === 'error' || o.kind === 'ok' ? o.kind : 'info';
    var actions = [];
    if (typeof o.retry === 'function') {
      actions.push(el('button', { type: 'button', class: 'lab-notice-act', text: o.retryText || 'נסו שוב', onclick: function () { o.retry(); } }));
    }
    if (o.login) {
      var href = D.loginUrl || '/login/';
      actions.push(el('a', { class: 'lab-notice-act', href: href, text: 'התחברו' }));
    }
    if (o.reload) {
      actions.push(el('button', { type: 'button', class: 'lab-notice-act', text: 'רענון הדף', onclick: function () { window.location.reload(); } }));
    }
    var ico = kind === 'ok' ? '✓' : (kind === 'error' ? '!' : 'i');
    var n = el('div', {
      class: 'uc-lab-notice uc-lab-notice--' + kind,
      role: kind === 'error' ? 'alert' : 'status',
      'aria-live': kind === 'error' ? 'assertive' : 'polite'
    }, [
      el('span', { class: 'lab-notice-ico', 'aria-hidden': 'true', text: ico }),
      el('p', { class: 'lab-notice-text', text: o.text || '' }),
      actions.length ? el('span', { class: 'lab-notice-acts' }, actions) : null
    ]);
    if (old) host.replaceChild(n, old); else host.appendChild(n);
    host._ucNotice = n;
    try {
      var r = n.getBoundingClientRect(), vh = window.innerHeight || 800;
      if (r.bottom > vh - 90 || r.top < 0) n.scrollIntoView({ block: 'nearest' });
    } catch (e) {}
    return n;
  };

  /** noticeResult(host, result, {retry, okText}) — הודעה מוכנה מ-Result (כולל "נסו שוב"/"התחברו"/"רענון") */
  UCLab.noticeResult = function (host, r, o) {
    o = o || {};
    var x = UCLab.explain(r);
    return UCLab.notice(host, {
      kind: x.kind, text: x.kind === 'ok' ? (x.text || o.okText || '') : x.text,
      retry: x.retry && typeof o.retry === 'function' ? o.retry : null, retryText: o.retryText,
      login: x.login, reload: x.reload
    });
  };

  /* ── reloadFresh: העתק של PersonalEditor.reloadFresh (main.js).
     ה-service-worker שומר עמודים ב-uc-pages לפי URL בלי להבחין בין מחובר/אנונימי, אז reload רגיל עלול
     להגיש עותק ישן. מוחקים את הרשומה מכל קאש-pages ואז reload (networkFirst מושך טרי). ── */
  UCLab.reloadFresh = function (delay) {
    setTimeout(function () {
      var go = function () { window.location.reload(); };
      if (!('caches' in window)) { go(); return; }
      var href = window.location.href;
      try {
        window.caches.keys().then(function (names) {
          return names.filter(function (n) { return /uc-pages/.test(n); }).reduce(function (chain, n) {
            return chain.then(function () {
              return window.caches.open(n).then(function (c) {
                return c.delete(href).then(function () { return c.delete(href, { ignoreSearch: true }); });
              });
            });
          }, Promise.resolve());
        }).then(go, go);   // קאש חסום/לא-זמין — נמשיך ל-reload רגיל
      } catch (e) { go(); }
    }, delay || 800);
  };
})();
