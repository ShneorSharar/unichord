/*
 * UC Editor Lab — מצב טקסט (F1). בעלים: סוכן T.
 * נטען אחרי lab-core.js. מוסיף ל-window.UCLab:
 *
 *   UCLab.TextMode(host, { raw, onApply(newRaw), onCancel() }) -> { destroy(), getText(), el }
 *   UCLab.TextMode.validate(text)  -> { ok, errors:[{ line, msg }] }     (פונקציה טהורה)
 *   UCLab.TextMode.normalize(text) -> text                               (רווחים "מוזרים" → רווח, ניקוי בתוך סוגריים)
 *   UCLab.TextMode.process(text)   -> { ok, errors, raw }                (normalize → validate → serialize(parse))
 *
 * הרכיב מציג את השיר כטקסט גולמי (word[Am]) ב-textarea. "החילו" מאמת; בשגיאה מציג אותן
 * מתחת לתיבה (הטקסט נשאר, onApply לא נקרא); בהצלחה קורא ל-onApply(serialize(parse(text))).
 * הרכיב לא הורס את עצמו ולא סוגר כלום — המארח מחליף תצוגה ב-onApply/onCancel.
 * אין שום קריאת רשת ואין אחסון.
 */
(function () {
  'use strict';

  var UCLab = window.UCLab;
  if (!UCLab || !UCLab.el || !UCLab.parse) { if (window.console) console.error('[UCLab] lab-textmode.js נטען לפני lab-core.js'); return; }
  var el = UCLab.el;

  var LRM = '\u200e';
  var BIDI_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
  // רווחי-לבן שה-parse של הליבה היה מפיל בשקט (הוא מזהה רק " " ו-\n): טאב, NBSP, רווחים טיפוגרפיים וכו'
  var ODD_SPACE = /[\t\v\f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

  function iso(s) { return LRM + s + LRM; }                     // שם אקורד בתוך משפט עברי — תמיד LTR
  function cleanName(s) { return String(s).replace(BIDI_MARKS, '').trim(); }

  /* ── ולידציה טהורה ─────────────────────────────────────
     שורות לפי \r\n | \r | \n (כמו ה-textarea). לכל שורה: סוגריים מרובעים חייבים להיות זוגות
     שטוחים (בלי קינון, בלי ריק), ושם האקורד עובר UCLab.isChord. סוגר שלא נסגר עד סוף השורה = שגיאה. */
  /* opts.allow: שמות-סוגריים שהיו בשיר המקורי (multiset) ואינם אקורד — "אקורד לא מוכר" לא נחסם עליהם.
     שגיאות מבנה (קינון / ריק / לא מאוזן) תמיד נבדקות. */
  function validate(text, opts) {
    var errors = [];
    var allow = (opts && opts.allow ? opts.allow : []).map(cleanName);
    function takeAllowed(name) { var k = allow.indexOf(name); if (k < 0) return false; allow.splice(k, 1); return true; }
    var lines = String(text == null ? '' : text).split(/\r\n?|\n/);
    lines.forEach(function (ln, li) {
      var n = li + 1, open = -1, nested = false;
      function add(msg) { errors.push({ line: n, msg: 'שורה ' + n + ': ' + msg }); }
      for (var i = 0; i < ln.length; i++) {
        var ch = ln.charAt(i);
        if (ch === '[') {
          if (open >= 0 && !nested) { add('סוגריים מרובעים בתוך סוגריים מרובעים. כל אקורד נכתב בזוג אחד, כמו ' + iso('[Am]')); nested = true; }
          open = i;
        } else if (ch === ']') {
          if (open < 0) {
            if (!nested) add('הסוגר ' + iso(']') + ' בלי ' + iso('[') + ' לפניו');
          } else {
            var name = cleanName(ln.slice(open + 1, i));
            if (!name) {
              add('סוגריים ריקים ' + iso('[]') + '. כתבו בפנים שם אקורד, או מחקו אותם');
            } else if (!UCLab.isChord(name)) {
              if (takeAllowed(name)) { /* היה בשיר המקורי — לא באשמת המשתמש */ }
              else if (/[֐-׿]/.test(name)) {
                add(iso('[' + name + ']') + ' אינו אקורד. שמות של קטעים (פזמון, בית) כותבים בלי סוגריים מרובעים, למשל ' + 'פזמון:');
              } else if (/^[a-g]/.test(name)) {
                add('האקורד ' + iso(name) + ' לא מוכר. שם אקורד מתחיל באות גדולה, למשל ' + iso(name.charAt(0).toUpperCase() + name.slice(1)));
              } else {
                add('האקורד ' + iso(name) + ' לא מוכר');
              }
            }
            open = -1;
          }
        }
      }
      if (open >= 0 && !nested) add('הסוגר ' + iso('[') + ' לא נסגר. חסר ' + iso(']'));
      else if (open >= 0 && nested) { /* כבר דווח על קינון בשורה הזו */ }
    });
    return { ok: errors.length === 0, errors: errors };
  }

  /* ── נרמול לפני parse ──────────────────────────────────
     • טאב/NBSP/רווחים מיוחדים → רווח רגיל (אחרת parse מוחק אותם בשקט).
     • בתוך [..] שהוא אקורד: מסירים רווחים בקצוות וסימני-כיוון (RLM/LRM) שנדבקו מהעתקה. תוכן אחר נשאר כמות שהוא. */
  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .replace(ODD_SPACE, ' ')
      .replace(/\[([^\[\]\n]*)\]/g, function (m, c) { var n = cleanName(c); return UCLab.isChord(n) ? '[' + n + ']' : m; });   // רק אקורדים מנוקים; טקסט-בסוגריים קיים נשאר כמות שהוא
  }

  /** נרמול → ולידציה → serialize(parse). raw מוגדר רק כש-ok. */
  function process(text, opts) {
    var norm = normalize(text);
    var v = validate(norm, opts);
    if (!v.ok) return { ok: false, errors: v.errors, raw: null };
    return { ok: true, errors: [], raw: UCLab.serialize(UCLab.parse(norm)) };
  }

  /** תוכן-סוגריים תקין-מבנית שאינו אקורד, בטקסט המקורי (עם כפילויות) — להעברה כ-allow. */
  function foreignTokens(raw) {
    var out = [];
    normalize(raw).replace(/\[([^\[\]\n]*)\]/g, function (m, c) { c = cleanName(c); if (c && !UCLab.isChord(c)) out.push(c); return m; });
    return out;
  }

  /* ── הרכיב ──────────────────────────────────────────── */
  var uid = 0;
  var MAX_SHOWN = 6;

  function TextMode(host, opts) {
    opts = opts || {};
    var id = 'lab-tm-' + (++uid);
    var destroyed = false;

    var ta = el('textarea', {
      id: id + '-ta', class: 'lab-tm-input', dir: 'rtl', lang: 'he', rows: 14,
      spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off',
      'aria-label': 'השיר כטקסט', 'aria-describedby': id + '-help'
    });
    ta.value = opts.raw == null ? '' : String(opts.raw);
    var allowList = foreignTokens(ta.value);    // מה שכבר היה בשיר לא חוסם החלה; רק מה שהמשתמש הכניס

    var errBox = el('div', { class: 'lab-error lab-tm-errors', id: id + '-err', role: 'alert' });
    errBox.hidden = true;

    var applyBtn = el('button', { type: 'button', class: 'lab-btn lab-btn--primary lab-tm-apply', text: 'החילו' });
    var cancelBtn = el('button', { type: 'button', class: 'lab-btn lab-btn--ghost lab-tm-cancel', text: 'בטל' });

    var root = el('div', { class: 'uc-lab-textmode', dir: 'rtl' }, [
      el('p', { class: 'lab-sub lab-tm-help', id: id + '-help', text: 'כאן רואים את השיר כטקסט. אקורד כותבים בסוגריים מרובעים אחרי המילה, למשל שלום[Am]' }),
      ta,
      errBox,
      el('div', { class: 'lab-tm-actions' }, [applyBtn, cancelBtn])
    ]);
    host.appendChild(root);

    function clearErrors() {
      if (errBox.hidden) return;
      errBox.hidden = true;
      errBox.textContent = '';
      ta.removeAttribute('aria-invalid');
      ta.removeAttribute('aria-errormessage');
    }

    function lineRange(line) {
      var lines = ta.value.split(/\r\n?|\n/), start = 0;
      for (var i = 0; i < line - 1 && i < lines.length; i++) start += lines[i].length + 1;
      return { start: start, end: start + (lines[line - 1] ? lines[line - 1].length : 0) };
    }
    function jumpTo(line) {
      try {
        var r = lineRange(line);
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(r.start, r.end);
        var lh = 27;
        try { lh = parseFloat(window.getComputedStyle(ta).lineHeight) || lh; } catch (e) {}
        ta.scrollTop = Math.max(0, (line - 3) * lh);
        if (ta.scrollIntoView) ta.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
    }
    function lineSnippet(line) {
      var s = (ta.value.split(/\r\n?|\n/)[line - 1] || '').replace(/\s+/g, ' ').trim();
      return s.length > 34 ? s.slice(0, 34) + '…' : s;
    }

    function showErrors(errors) {
      errBox.textContent = '';
      var n = errors.length;
      errBox.appendChild(el('p', { class: 'lab-tm-errhead', text: n === 1 ? 'יש דבר אחד לתקן לפני שמחילים:' : 'יש ' + n + ' דברים לתקן לפני שמחילים:' }));
      var ul = el('ul', { class: 'lab-tm-errlist' });
      errors.slice(0, MAX_SHOWN).forEach(function (e) {
        var snip = lineSnippet(e.line);
        var b = el('button', { type: 'button', class: 'lab-tm-err', 'data-line': e.line, 'aria-label': e.msg + '. הקישו כדי לקפוץ לשורה' }, [
          el('span', { class: 'lab-tm-errmsg', text: e.msg }),
          snip ? el('span', { class: 'lab-tm-errline', dir: 'auto', text: snip }) : null
        ]);
        b.addEventListener('click', function () { jumpTo(e.line); });
        ul.appendChild(el('li', null, [b]));
      });
      errBox.appendChild(ul);
      if (n > MAX_SHOWN) errBox.appendChild(el('p', { class: 'lab-tm-more', text: 'ועוד ' + (n - MAX_SHOWN) + ' אחרי אלה' }));
      errBox.hidden = false;
      ta.setAttribute('aria-invalid', 'true');
      ta.setAttribute('aria-errormessage', id + '-err');
      var first = errors[0];
      if (first) jumpTo(first.line);
    }

    function onApplyClick() {
      if (destroyed) return;
      var res = process(ta.value, { allow: allowList });
      if (!res.ok) { showErrors(res.errors); return; }
      clearErrors();
      if (typeof opts.onApply === 'function') opts.onApply(res.raw);
    }
    function onCancelClick() {
      if (destroyed) return;
      if (typeof opts.onCancel === 'function') opts.onCancel();
    }
    function onInput() { clearErrors(); }

    applyBtn.addEventListener('click', onApplyClick);
    cancelBtn.addEventListener('click', onCancelClick);
    ta.addEventListener('input', onInput);

    // במגע לא פותחים מקלדת מעצמנו; בעכבר/מקלדת — מיקוד נוח
    try {
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) ta.focus({ preventScroll: true });
    } catch (e) {}

    return {
      el: root,
      getText: function () { return ta.value; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        applyBtn.removeEventListener('click', onApplyClick);
        cancelBtn.removeEventListener('click', onCancelClick);
        ta.removeEventListener('input', onInput);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  TextMode.validate = validate;
  TextMode.normalize = normalize;
  TextMode.process = process;
  TextMode.foreignTokens = foreignTokens;
  UCLab.TextMode = TextMode;
})();
