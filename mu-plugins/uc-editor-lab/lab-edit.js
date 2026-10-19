/* UC Editor Lab — תרחיש "עריכת שיר" (בעלים: Builder B).
 *
 * זרימה:  כניסה (מדמה את עמוד-השיר: כפתור "ערוך אקורדים" גלוי)
 *      →  עורך במסך-מלא (UCLab.ChordStep, בטל, מונה-שינויים, נקודה על כל מה ששונה)
 *      →  "למי התיקון?" (רק בשבילי / להציע לכולם + הערה)  →  UCLab.demoSubmit
 *  שומר-יציאה: ✕ / כפתור-חזרה של הדפדפן/אנדרואיד / רענון → "לצאת בלי לשמור?"
 *  טיוטה מקומית: UCLab.draft('edit-'+id) → "להמשיך מהטיוטה?" בפתיחה הבאה.
 *
 *  סבב 5 — שרת אמיתי (רק מנהלים עם &live=1, UCLab.api.real). מול השרת בדיוק כמו העורך הישן
 *  (main.js PersonalEditor):
 *    "רק בשבילי"     → achord_save_personal_version {post_id, raw_text}            → reloadFresh(800)
 *    "להציע לכולם"   → קודם achord_save_personal_version, ואז achord_submit_proposal
 *                       {post_id, raw_text, note}                                    → reloadFresh(2000)
 *                       כשל חלקי (נשמר, ההצעה לא נשלחה) → הודעה + "נסו שוב" ששולח רק את ההצעה.
 *    "חזרה למקור"    → אישור בתוך הדף → achord_delete_personal_version {post_id}   → reloadFresh(800)
 *  הודעות השרת מוצגות כמו שהן. כפתורים נעולים בזמן שליחה, אין שליחה כפולה. הטיוטה נמחקת רק אחרי הצלחה.
 *  בלי UCLab.api (ליבה ישנה) או במצב הדגמה → demoSubmit כמו היום. אין כאן fetch משלנו.
 */
(function () {
  'use strict';

  /* ══ השוואה לפני/אחרי (D3: המילים יכולות להשתנות במצב-טקסט) ══
     1. השיר מפורק לשורות. מפתח-שורה = המילים בלבד (בלי אקורדים, רווחים מכווצים).
     2. LCS על מפתחות-השורות → שורות זהות-מילים מוצמדות; השאר = "שורות ששיניתם"
        (בכל גוש-שינוי: max(נמחקו, נוספו) — שורה שתוקנה נספרת פעם אחת).
     3. בשורות מוצמדות משווים אקורדים כמו קודם: "חריץ" = מילה + האקורדים שעליה (כולל
        אקורדים-בלי-מילה שלפניה), ועוד חריץ-סוף לשורה. מונה = מרחק-עריכה בין רשימות-האקורדים.
        אם אותן מילים פוצלו אחרת (אקורד באמצע-מילה שנוסף בטקסט) → משווים לפי מיקום-תו
        ומסמנים את כל השורה, כדי לא לסמן מילה לא-נכונה.
     אין שום הנחה שמספר המילים/השורות קבוע.
     סבב 6 (B67): השוואת-אקורדים בשורה מוצמדת היא לפי "עוגן" = מיקום-התו שבו החלק מתחיל (K), ולא
     לפי מספר-המילה. כך:
       • פיצול מילה (אקורד שני באמצע, ops.split) = שינוי אחד, והנקודה על החלק החדש.
       • איחוד/פיזור באותה מילה כתובה (ש[C]לום[G] → מחיקת C → שלום[G]) = רק מה שנמחק נספר.
       • אותו אקורד שעבר למקום אחר (גרירה, "הזזה") = שינוי אחד ("הוזז"), גם בין שורות.
       • שורת אקורדים (בלי מילים) שנוספה/נמחקה = שינוי אחד, "שורת אקורדים חדשה" / "נמחקה שורת אקורדים".
         מפתח-השורה שלה כולל את האקורדים (♪ Am G), כדי שלא תוצמד לשורה ריקה או לשורת-אקורדים אחרת. */
  function splitLines(toks) {
    var out = [], cur, pend, pendIdx, grpAt, joined;
    function start() { cur = { text: '', slots: [], toks: [] }; pend = []; pendIdx = []; grpAt = 0; joined = false; }
    function trues(a) { return a.map(function () { return true; }); }
    function end() {
      cur.slots.push({ word: cur.slots.length ? '(סוף השורה)' : '(שורת אקורדים)', chords: pend, sa: trues(pend), idx: pendIdx, tail: true, at: 'T', grp: 'T' });
      cur.key = cur.text.replace(/\s+/g, ' ').trim();
      cur.cl = !cur.key && pend.length > 0;                   // שורת אקורדים בלי מילים
      cur.lkey = cur.cl ? '♪ ' + pend.join(' ') : cur.key;
      var g = {};                                             // המילה הכתובה המלאה של כל חלק (הו+לך → הולך)
      cur.slots.forEach(function (s) { if (!s.tail) g[s.grp] = (g[s.grp] || '') + s.word; });
      cur.slots.forEach(function (s) { s.gword = s.tail ? s.word : g[s.grp]; });
      out.push(cur); start();
    }
    start();
    toks.forEach(function (t, i) {
      if (t.type === 'newline') { end(); return; }
      cur.toks.push(i);
      if (t.type === 'space') { cur.text += ' '; joined = false; return; }
      if (t.type !== 'word') return;
      if (!t.text) { if (t.chord) { pend.push(t.chord); pendIdx.push(i); } joined = false; return; }
      cur.text += t.text;
      var at = cur.text.replace(/\s+/g, '').length - t.text.length;
      if (!joined) grpAt = at;
      cur.slots.push({ word: t.text, chords: pend.concat(t.chord ? [t.chord] : []), sa: trues(pend).concat(t.chord ? [false] : []),
                       idx: pendIdx.concat([i]), at: at, grp: grpAt });
      pend = []; pendIdx = []; joined = true;
    });
    end();
    return out;
  }
  /* פעולות LCS על מערכי-מחרוזות: ['=',i,j] | ['-',i] | ['+',j]. חיתוך קידומת/סיומת משותפת,
     ומעל ~250k תאים — כל האמצע נחשב שונה (לא קורס, לא נתקע). */
  function lineOps(A, B) {
    var m = A.length, n = B.length, pre = 0, suf = 0, ops = [], i, j;
    while (pre < m && pre < n && A[pre] === B[pre]) pre++;
    while (suf < m - pre && suf < n - pre && A[m - 1 - suf] === B[n - 1 - suf]) suf++;
    for (i = 0; i < pre; i++) ops.push(['=', i, i]);
    var a0 = pre, a1 = m - suf, b0 = pre, b1 = n - suf, la = a1 - a0, lb = b1 - b0;
    if (la * lb > 250000) {
      for (i = a0; i < a1; i++) ops.push(['-', i]);
      for (j = b0; j < b1; j++) ops.push(['+', j]);
    } else {
      var dp = [];
      for (i = 0; i <= la; i++) { dp[i] = new Array(lb + 1); dp[i][lb] = 0; }
      for (j = 0; j <= lb; j++) dp[la][j] = 0;
      for (i = la - 1; i >= 0; i--) for (j = lb - 1; j >= 0; j--) {
        dp[i][j] = A[a0 + i] === B[b0 + j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
      i = 0; j = 0;
      while (i < la || j < lb) {
        if (i < la && j < lb && A[a0 + i] === B[b0 + j]) { ops.push(['=', a0 + i, b0 + j]); i++; j++; }
        else if (j >= lb || (i < la && dp[i + 1][j] >= dp[i][j + 1])) { ops.push(['-', a0 + i]); i++; }
        else { ops.push(['+', b0 + j]); j++; }
      }
    }
    for (i = 0; i < suf; i++) ops.push(['=', m - suf + i, n - suf + i]);
    return ops;
  }
  var baseCache = { raw: null, lines: null };
  function baseLines(raw) {
    if (baseCache.raw !== raw) baseCache = { raw: raw, lines: splitLines(UCLab.parse(raw)) };
    return baseCache.lines;
  }
  function flat(line) { return line.slots.reduce(function (acc, s) { return acc.concat(s.chords); }, []); }
  function sameWords(a, b) { return a.slots.length === b.slots.length && a.slots.every(function (s, k) { return s.word === b.slots[k].word; }); }
  /* אקורדי-חריץ כרשומות: n=שם, sa=בלי מילה (♪), K=עוגן, grp=המילה הכתובה (או עוגן ה-♪) */
  function ents(s) {
    return s.chords.map(function (n, k) {
      var sa = !!s.sa[k];
      return { n: n, sa: sa, K: s.at, grp: sa ? 'S' + s.at : s.grp, word: s.word, gword: s.gword };
    });
  }
  function eKey(e) { return (e.sa ? '♪' : '') + e.n; }
  /* LCS קטן (רשימות-אקורדים של חריץ אחד) → האינדקסים שלא הותאמו בכל צד */
  function unmatched(a, b) {
    var m = a.length, n = b.length, dp = [], i, j, ra = [], rb = [];
    for (i = 0; i <= m; i++) { dp[i] = []; for (j = 0; j <= n; j++) dp[i][j] = 0; }
    for (i = m - 1; i >= 0; i--) for (j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    i = 0; j = 0;
    while (i < m || j < n) {
      if (i < m && j < n && a[i] === b[j]) { i++; j++; }
      else if (j >= n || (i < m && dp[i + 1][j] >= dp[i][j + 1])) ra.push(i++);
      else rb.push(j++);
    }
    return { ra: ra, rb: rb };
  }
  function findIn(arr, fn) { for (var k = 0; k < arr.length; k++) if (fn(arr[k])) return arr[k]; return null; }
  function notUsed(x) { return !x.used; }

  /* מחזיר: { changes:[…], chords, lines, clAdd, clDel, total, marks:{tokIdx:{removed}}, lineMarks:[newLineIdx] }
     changes בסדר-המסמך: {type:'chord',word,inWord,before,after} | {type:'move',chord,from,to} |
     {type:'chordline',add|del,chords} | {type:'line',before,after} | {type:'linechords',text,before,after} */
  function diff(fromRaw, toks) {
    var A = baseLines(fromRaw), B = splitLines(toks);
    var ops = lineOps(A.map(function (l) { return l.lkey; }), B.map(function (l) { return l.lkey; }));
    var res = { changes: [], chords: 0, lines: 0, clAdd: 0, clDel: 0, total: 0, marks: {}, lineMarks: [] };
    var pool = { R: [], A: [] };            // אקורדים שנמחקו/נוספו ועוד לא הוסברו (להזזה בין שורות)
    var dels = [], adds = [];
    function lineMark(bi) { if (res.lineMarks.indexOf(bi) < 0) res.lineMarks.push(bi); }
    function mark(ti, removed) {
      var m = res.marks[ti];
      if (m && m.removed && !removed) return;
      res.marks[ti] = { removed: removed || null };
    }
    function addMove(r, x) {
      res.chords += 1;
      res.changes.push({ type: 'move', chord: r.n, from: r.word, to: x.word, ord: x.ord });
    }
    function cover(line, K) {                // החריץ שמכסה עוגן שכבר לא קיים (חלק שהתאחד)
      if (K === 'T') return line.slots[line.slots.length - 1];
      var best = null;
      line.slots.forEach(function (s) { if (!s.tail && s.at <= K) best = s; });
      return best;
    }
    /* שתי שורות עם אותן מילים (או שתי שורות-אקורדים): מה זז/נוסף/נמחק, לפי עוגנים */
    function compareLine(a, b, bi) {
      var SA = {}, SB = {}, keys = [], seen = {}, R = [], Ad = [], any = false, moved = 0;
      b.slots.forEach(function (s, k) { s.ord = k; SB[s.at] = s; if (!seen[s.at]) { seen[s.at] = 1; keys.push(s.at); } });
      a.slots.forEach(function (s) { SA[s.at] = s; if (!seen[s.at]) { seen[s.at] = 1; keys.push(s.at); } });
      keys.forEach(function (K) {
        var sa = SA[K], sb = SB[K], o = sa ? ents(sa) : [], c = sb ? ents(sb) : [];
        var ok = o.map(eKey), ck = c.map(eKey);
        if (ok.join('|') === ck.join('|')) return;
        any = true;
        var tgt = sb || cover(b, K), u = unmatched(ok, ck);
        // בשורת-אקורדים / אקורדים בסוף שורה: נקודה רק על מה שנוסף (אם נוסף משהו), לא על כל השורה
        var idx = tgt ? (sb && sb.tail && u.rb.length ? u.rb.map(function (k) { return sb.idx[k]; }) : tgt.idx) : [];
        idx.forEach(function (ti) { mark(ti, sb && !c.length && o.length ? o.map(function (e) { return e.n; }).join(' ') : null); });
        var ord = bi * 1000 + (tgt ? tgt.ord : 999);
        u.ra.forEach(function (k) { R.push(Object.assign({ line: bi, ord: ord, used: false }, o[k], tgt ? { word: tgt.word, gword: tgt.gword } : {})); });
        u.rb.forEach(function (k) { Ad.push(Object.assign({ line: bi, ord: ord, used: false }, c[k])); });
      });
      if (!any) return;
      if (!sameWords(a, b)) lineMark(bi);    // המילה פוצלה/אוחדה אחרת → גם פס בצד (כמו קודם)
      // 1. אותו אקורד באותה מילה כתובה (פיצול/איחוד חלקים) → לא שינוי בפני עצמו
      R.forEach(function (r) {
        if (r.sa) return;
        var x = findIn(Ad, function (q) { return !q.used && !q.sa && q.n === r.n && q.grp === r.grp; });
        if (x) { r.used = x.used = true; }
      });
      // 2. אותו אקורד במקום אחר באותה שורה → "הוזז" = שינוי אחד
      R.forEach(function (r) {
        if (r.used) return;
        var x = findIn(Ad, function (q) { return !q.used && q.n === r.n; });
        if (x) { r.used = x.used = true; moved++; addMove(r, x); }
      });
      var restR = R.filter(notUsed), restA = Ad.filter(notUsed);
      if (!restR.length && !restA.length && !moved) {   // רק חלוקה אחרת של אותם אקורדים בתוך מילה
        res.chords += 1;
        res.changes.push({ type: 'linechords', text: b.key || '(שורת אקורדים)', before: flat(a).join(' '), after: flat(b).join(' '), ord: bi * 1000 });
        lineMark(bi);
        return;
      }
      pool.R = pool.R.concat(restR); pool.A = pool.A.concat(restA);
    }
    function flushHunk(nextB) {
      if (!dels.length && !adds.length) return;
      var isCL = function (L) { return function (x) { return L[x].cl; }; };
      var notCL = function (L) { return function (x) { return !L[x].cl; }; };
      var cd = dels.filter(isCL(A)), ca = adds.filter(isCL(B)), od = dels.filter(notCL(A)), oa = adds.filter(notCL(B));
      var delOrd = nextB * 1000 - 500;
      function blankIn(list, L) { for (var k = 0; k < list.length; k++) if (!L[list[k]].key && !L[list[k]].cl) return k; return -1; }
      // שורת-אקורדים ששונתה (הוסף/הוחלף אקורד בתוכה) → משווים אקורד-אקורד
      while (cd.length && ca.length) { var y0 = ca.shift(); compareLine(A[cd.shift()], B[y0], y0); }
      // שורת-אקורדים שנמחקה (אם נשארה במקומה שורה ריקה — זו אותה פעולה, לא "שורה חדשה")
      cd.forEach(function (x) {
        var e = blankIn(oa, B); if (e >= 0) oa.splice(e, 1);
        res.clDel++;
        res.changes.push({ type: 'chordline', del: true, paired: e >= 0, chords: A[x].slots[0].chords.join(' '), ord: delOrd });
      });
      ca.forEach(function (y) {
        var e = blankIn(od, A); if (e >= 0) od.splice(e, 1);
        res.clAdd++;
        res.changes.push({ type: 'chordline', add: true, paired: e >= 0, chords: B[y].slots[0].chords.join(' '), ord: y * 1000 });
        lineMark(y);
      });
      // שורות-מילים (כמו קודם)
      var n = Math.max(od.length, oa.length);
      res.lines += n;
      for (var k = 0; k < n; k++) {
        res.changes.push({ type: 'line', before: od[k] != null ? A[od[k]].key : null, after: oa[k] != null ? B[oa[k]].key : null,
                           ord: oa[k] != null ? oa[k] * 1000 : delOrd });
      }
      oa.forEach(lineMark);
      dels = []; adds = [];
    }
    ops.forEach(function (op) {
      if (op[0] === '-') { dels.push(op[1]); return; }
      if (op[0] === '+') { adds.push(op[1]); return; }
      flushHunk(op[2]);
      compareLine(A[op[1]], B[op[2]], op[2]);
    });
    flushHunk(B.length);
    // 3. אותו אקורד שנמחק בשורה אחת ונוסף באחרת → "הוזז"
    pool.R.forEach(function (r) {
      var x = findIn(pool.A, function (q) { return !q.used && q.n === r.n; });
      if (x) { r.used = x.used = true; addMove(r, x); }
    });
    // 4. השאר: לפי עוגן. באותו עוגן נמחק X ונוסף Y = החלפה אחת
    var groups = {}, gl = [];
    function grp(e, side) {
      var id = e.line + '|' + e.K, g = groups[id];
      if (!g) { g = groups[id] = { r: [], a: [], ord: e.ord, word: e.word, gword: e.gword }; gl.push(g); }
      if (side === 'a') { g.word = e.word; g.gword = e.gword; }
      g[side].push(e.n);
    }
    pool.R.filter(notUsed).forEach(function (e) { grp(e, 'r'); });
    pool.A.filter(notUsed).forEach(function (e) { grp(e, 'a'); });
    gl.forEach(function (g) {
      res.chords += Math.max(g.r.length, g.a.length);
      res.changes.push({ type: 'chord', word: g.word, inWord: g.gword && g.gword !== g.word ? g.gword : '', before: g.r.join(' '), after: g.a.join(' '), ord: g.ord });
    });
    // שורת-אקורדים שהתרוקנה והשורה הריקה שנשארה במקומה יכולות ליפול לשני גושי-LCS שונים → מצמידים גם כאן
    res.changes.filter(function (c) { return c.type === 'chordline' && !c.paired; }).forEach(function (c) {
      for (var k = 0; k < res.changes.length; k++) {
        var x = res.changes[k];
        if (x.type === 'line' && (c.del ? x.before == null && x.after === '' : x.before === '' && x.after == null)) {
          res.changes.splice(k, 1); res.lines--; c.paired = true; return;
        }
      }
    });
    res.changes.sort(function (p, q) { return p.ord - q.ord; });
    res.total = res.chords + res.lines + res.clAdd + res.clDel;
    res.newLines = B;
    return res;
  }

  function plural(n) { return n === 1 ? 'שינוי אחד' : n + ' שינויים'; }
  /* שורות-אקורדים שנוספו/נמחקו. noun=true → צירוף לתוך משפט ("..., שורת אקורדים חדשה ועוד…") */
  function clLabel(d, noun) {
    var a = d.clAdd || 0, r = d.clDel || 0;
    if (!a && !r) return '';
    if (a && !r) return a === 1 ? 'שורת אקורדים חדשה' : a + ' שורות אקורדים חדשות';
    if (r && !a) return noun ? (r === 1 ? 'מחיקת שורת אקורדים' : 'מחיקת ' + r + ' שורות אקורדים')
                             : (r === 1 ? 'נמחקה שורת אקורדים' : 'נמחקו ' + r + ' שורות אקורדים');
    return (a + r) + ' שורות אקורדים';
  }
  function countLabel(d) {
    var cl = clLabel(d, !!d.lines);
    if (!d.lines) {
      if (!cl) return d.chords ? plural(d.chords) : 'עוד לא שיניתם כלום';
      if (d.clAdd && d.clDel) cl = 'שיניתם ' + cl;
      return d.chords ? cl + ' ועוד ' + plural(d.chords) : cl;
    }
    var s = 'שיניתם ' + (d.lines === 1 ? 'שורה אחת' : d.lines + ' שורות');
    if (cl) s += (d.chords ? ', ' : ' ועוד ') + cl;
    if (d.chords) s += ' ועוד ' + (d.chords === 1 ? 'אקורד אחד' : d.chords + ' אקורדים');
    return s;
  }
  function clip(s, n) { s = s || ''; return s.length > n ? s.slice(0, n) + '…' : s; }
  function qw(w) { w = w || ''; return /^\(/.test(w) ? w : '«' + clip(w, 30) + '»'; }   // "(שורת אקורדים)" בלי מירכאות
  /* לבדיקות node (qa/B6-verify): פונקציות טהורות, בלי DOM */
  UCLab._editDiff = { diff: diff, countLabel: countLabel, splitLines: splitLines };

  /* סבב 7: opts.embedded === true → עמוד-השיר האמיתי (UCLab.mount מ-uc-new-editor.php):
       • העורך נפתח מיד (בלי מסך-כניסה), כשכבה מעל העמוד; ✕ / "סגירה" / Esc / כפתור-חזרה סוגרים.
       • סגירה = ניקוי מלא (שכבה, CTA, נעילה, מאזינים, רשומת-היסטוריה) והפוקוס חוזר ל-opts.returnFocus.
       • mount שוב (פתיחה חוזרת) עובד; mount על אותו root מנקה קודם את המופע הקודם.
       • אחרי שמירה: הודעה בתוך השכבה ואז reloadFresh. "חזרה לגרסת האתר" בתחתית העורך.
     בלי opts.embedded (עמוד הבדיקה) — הכל בדיוק כמו קודם. מחזיר { destroy() } בשני המצבים. */
  UCLab.register('edit', function (root, L, opts) {
    opts = opts || {};
    var EMB = opts.embedded === true;
    if (EMB && root._ucLabEdit && typeof root._ucLabEdit.destroy === 'function') {
      try { root._ucLabEdit.destroy(); } catch (e) { if (window.console) console.error('[lab-edit] destroy', e); }
    }
    var el = L.el;
    var D = L.data || {};
    var s = D.song || { id: 0, raw: '', title: '', performer: '', capo: '' };   // נקרא בכל mount (מתעדכן בכל לחיצה)
    var IS_LAB = L.isLab === true;    // "להמשיך בלי להתחבר" + כפתור-גוגל מדומה — רק בעמוד הבדיקה
    var SHARED = /[?&]share_token=/.test(window.location.search || '');   // צפייה בגרסה ששיתפו → בלי "פתחתם את הגרסה שלכם"
    var listeners = [];
    function listen(t, type, fn, o) { if (!t) return; t.addEventListener(type, fn, o); listeners.push([t, type, fn, o]); }
    var destroyed = false;
    var loggedIn = !!D.loggedIn;
    var DRAFT_KEY = 'edit-' + s.id;
    var CHOICE_KEY = 'uc_lab_edit_choice';

    /* ── סבב 5: חיבור לשרת (כל השדות מה-PHP אופציונליים) ── */
    var api = L.api && typeof L.api.send === 'function' ? L.api : null;
    var REAL = !!(api && api.real === true);
    function truthy(v) { return v === true || v === 1 || v === '1' || v === 'true'; }   // wp_localize_script → מחרוזות
    var hasPersonal = truthy(s.hasPersonal);
    var hasPending = truthy(s.hasPendingProposal);
    var officialRaw = typeof s.officialRaw === 'string' ? s.officialRaw : (hasPersonal ? null : (s.raw || ''));
    var LICENSE = (typeof D.proposalNotice === 'string' && D.proposalNotice.trim()) || 'שליחת התיקון משחררת אותו תחת הרישיון של האתר.';
    var NET_MSG = 'אין חיבור כרגע. מה שכתבתם לא נמחק. נסו שוב.';

    var official = s.raw || '';
    var baseline = official;       // מה ש"שמור" כרגע (הגרסה שנפתחה: אישית אם יש, אחרת של האתר)
    var savedKind = null;          // null | 'personal_save' | 'propose'
    var savedMsg = '';             // הודעת השרת מהשמירה האחרונה (מצב אמיתי)
    var savedRawPending = null;    // כשל חלקי: הגרסה האישית נשמרה, ההצעה עוד לא
    var sending = false;           // בקשה בדרך → הכל נעול, אין שליחה כפולה
    var reloading = false;         // אחרי הצלחה במצב אמיתי: מחכים לרענון
    var guestBypass = false;       // בעמוד-הבדיקה בלבד: אורח יכול להמשיך בלי להתחבר

    var screen = 'entry';          // entry | edit | choose
    var layer = null, cta = null, cs = null;
    var ui = {};                   // הפניות לאלמנטים של העורך
    var count = 0;                 // מספר המקומות ששונו מול baseline
    var choice = null;             // 'personal_save' | 'propose'


    /* ══ סבב 5: שליחה / הודעות / נעילה (דרך UCLab.api; נופל להדגמה אם חסר) ══ */
    var DEMO_KIND = {
      achord_save_personal_version: 'personal_save',
      achord_submit_proposal: 'propose',
      achord_delete_personal_version: 'personal_delete'
    };
    function normResult(r) {
      r = r && typeof r === 'object' ? r : {};
      return { ok: r.ok === true, message: r.message == null ? '' : String(r.message), data: r.data, network: !!r.network, demo: !!r.demo };
    }
    /* more: אפשרויות נוספות ל-api.send (למשל demoSheet:false לשלב-ביניים) */
    function send(action, fields, okText, more) {
      var kind = DEMO_KIND[action];
      var opts = Object.assign({ demoKind: kind, okText: okText, title: s.title, performer: s.performer }, more || {});
      if (api) {
        return Promise.resolve()
          .then(function () { return api.send(action, fields, opts); })
          .then(normResult, function () { return { ok: false, network: true, message: NET_MSG }; });
      }
      // ליבה בלי api → הדגמה בלבד (כמו בסבב 4). שום דבר לא יוצא לשרת.
      return new Promise(function (resolve) {
        var res = { ok: true, demo: true, message: okText || '' };
        if (opts.demoSheet === false) { resolve(res); return; }
        if (kind === 'personal_delete') { L.toast('הדגמה: כאן הגרסה שלכם הייתה נמחקת.'); resolve(res); return; }
        L.demoSubmit(kind, fields, { title: s.title, performer: s.performer, onClose: function () { resolve(res); } });
      });
    }
    function explain(r) {
      if (typeof L.explain === 'function') { try { var x = L.explain(r); if (x && x.text) return x; } catch (e) {} }
      var msg = r.message || 'שגיאה';
      if (r.network) return { text: NET_MSG, retry: true, login: false };
      if (msg === 'שגיאת אבטחה.') return { text: 'הדף פתוח הרבה זמן. הטיוטה שמורה. רעננו את הדף והמשיכו.', retry: false, login: false, reload: true };
      return { text: msg, retry: false, login: /יש להתחבר/.test(msg) };
    }
    /* שורת-סטטוס אחת בתוך host (מחליפה את הקודמת). o=null → מנקה. */
    function notice(host, o) {
      if (!host) return;
      host.innerHTML = '';
      if (!o) return;
      if (typeof L.notice === 'function') { try { L.notice(host, o); reveal(host); return; } catch (e) {} }
      var row = el('div', { class: 'lab-edit-note-' + o.kind + ' lab-edit-msg', role: o.kind === 'error' ? 'alert' : 'status' }, [el('span', { text: o.text })]);
      if (o.retry) row.appendChild(el('button', { type: 'button', class: 'lab-btn lab-edit-retry', text: o.retryText || 'נסו שוב', onclick: o.retry }));
      if (o.login && D.loginUrl) row.appendChild(el('a', { class: 'lab-btn', href: D.loginUrl, text: 'התחברו' }));
      if (o.reload) row.appendChild(el('button', { type: 'button', class: 'lab-btn', text: 'רענון הדף', onclick: function () { location.reload(); } }));
      host.appendChild(row);
      reveal(host);
    }
    /* ההודעה חייבת להיראות: בתוך שכבת-העורך הגלילה היא של השכבה, וה-CTA הדביק מכסה את התחתית */
    function reveal(host) {
      try {
        var r = host.getBoundingClientRect(), ctaH = cta && host.closest('.lab-edit-layer') ? cta.offsetHeight : 0;
        var vh = window.innerHeight || 800;
        if (r.bottom > vh - ctaH - 8 || r.top < 0) host.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
    }
    function busy(btn, on, txt) {
      if (!btn) return;
      if (typeof L.busy === 'function') { try { L.busy(btn, on, txt); return; } catch (e) {} }
      if (on) {
        if (btn._labLabel == null) btn._labLabel = btn.textContent;
        btn.disabled = true; btn.setAttribute('aria-busy', 'true'); if (txt) btn.textContent = txt;
      } else {
        btn.disabled = false; btn.removeAttribute('aria-busy');
        if (btn._labLabel != null) { btn.textContent = btn._labLabel; btn._labLabel = null; }
      }
    }
    /* העתק של main.js PersonalEditor.reloadFresh — רק אם הליבה לא מספקת אחד */
    function reloadFresh(delay) {
      if (typeof L.reloadFresh === 'function') { L.reloadFresh(delay); return; }
      setTimeout(function () {
        var go = function () { window.location.reload(); };
        if (!('caches' in window)) { go(); return; }
        caches.keys().then(function (names) {
          return Promise.all(names.filter(function (n) { return /uc-pages/.test(n); }).map(function (n) {
            return caches.open(n).then(function (c) {
              return c.delete(window.location.href).then(function () { return c.delete(window.location.href, { ignoreSearch: true }); });
            });
          }));
        }).catch(function () {}).then(go);
      }, delay || 800);
    }
    function chordTag(txt, cls) { return el('bdi', { class: 'lab-edit-ch' + (cls ? ' ' + cls : ''), dir: 'ltr', text: txt }); }

    /* ══ מסך כניסה — מדמה את עמוד-השיר ══════════════════════════ */
    var entry = el('section', { class: 'lab-edit-entry', 'aria-labelledby': 'lab-edit-songtitle' });
    if (!EMB) root.appendChild(entry);
    var editBtn;

    function renderEntry() {
      if (EMB) return;   // עמוד-השיר האמיתי הוא מסך-הכניסה
      entry.innerHTML = '';
      var meta = [s.performer, s.capo && s.capo !== '0' ? 'קאפו ' + s.capo : ''].filter(Boolean).join(' · ');
      var head = el('header', { class: 'lab-edit-songhead' }, [
        el('p', { class: 'lab-edit-kicker', text: 'כך זה ייראה בעמוד השיר' }),
        el('h2', { class: 'lab-title', id: 'lab-edit-songtitle', text: s.title || 'שיר' }),
        meta ? el('p', { class: 'lab-sub lab-edit-meta', text: meta }) : null
      ]);
      entry.appendChild(head);

      if (savedKind) {
        var savedHead = savedKind === 'propose' ? '✓ ההצעה נשלחה לעורכים' : '✓ הגרסה שלכם נשמרה';
        if (savedMsg) savedHead = '✓ ' + savedMsg;   // מצב אמיתי: הודעת השרת כמו שהיא
        entry.appendChild(el('div', { class: 'lab-edit-saved', id: 'lab-edit-saved', role: 'status' }, [
          el('strong', { text: savedHead }),
          el('span', { text: savedKind === 'propose'
            ? (savedMsg ? 'הגרסה שלכם נשמרה גם אצלכם.' : 'עד שהעורכים יאשרו, אתם רואים כאן את הגרסה שלכם. אחרים רואים את הרשמית.')
            : 'מעכשיו, בכל פעם שתפתחו את השיר, תראו את הגרסה הזאת.' }),
          reloading ? el('span', { class: 'lab-edit-reloading', text: 'מרעננים את הדף…' }) : null
        ]));
      }

      editBtn = el('button', { type: 'button', id: 'lab-edit-open', class: 'lab-btn lab-btn--primary lab-btn--block lab-edit-openbtn', disabled: reloading, onclick: onOpenClick }, [
        el('span', { 'aria-hidden': 'true', text: '✏️' }), savedKind ? 'לתקן שוב' : 'ערוך אקורדים'
      ]);
      ui.entryNotice = el('div', { class: 'lab-edit-notice', id: 'lab-edit-entry-notice' });
      entry.appendChild(el('div', { class: 'lab-edit-action' }, [
        editBtn,
        el('p', { class: 'lab-edit-explain', text: 'מצאתם אקורד לא נכון? התיקון יישמר אצלכם, ואפשר גם להציע אותו לכולם.' }),
        !loggedIn && !savedKind ? el('p', { class: 'lab-edit-guestline' }, [
          el('span', { class: 'lab-edit-g', 'aria-hidden': 'true', text: 'G' }),
          'כדי לתקן צריך להתחבר עם גוגל. לוקח כמה שניות.'
        ]) : null,
        pendingDraft() ? el('p', { class: 'lab-edit-draftline', text: '📝 יש לכם תיקון שלא נשמר. נגעו ב"ערוך אקורדים" כדי להמשיך ממנו.' }) : null,
        hasPersonal && !reloading ? resetBlock() : null,
        ui.entryNotice
      ]));

      // גוף השיר, קריאה-בלבד (אותם סגנונות כמו בעורך, בלי הקשות)
      var body = el('div', { class: 'lab-edit-songbody', 'aria-label': 'מילים ואקורדים' });
      var line = el('div', { class: 'lab-edit-rline' });
      L.parse(baseline).forEach(function (t) {
        if (t.type === 'newline') { body.appendChild(line); line = el('div', { class: 'lab-edit-rline' }); return; }
        if (t.type === 'space') { line.appendChild(el('span', { class: 'lab-cs-space' })); return; }
        line.appendChild(el('span', { class: 'lab-edit-rword' + (t.chord ? ' has-chord' : '') }, [
          el('span', { class: 'lab-cs-chord', text: t.chord || ' ' }),
          el('span', { class: 'lab-cs-text', text: t.text || ' ' })
        ]));
      });
      body.appendChild(line);
      entry.appendChild(body);
    }

    /* ══ "חזרה למקור" — רק כשיש גרסה אישית. מחיקה בשרת לא ניתנת לביטול → זה המקום היחיד עם אישור ══ */
    /* emb=true (עמוד-השיר): כפתור-רפאים "חזרה לגרסת האתר" בתחתית העורך, עם שורת-הודעה משלו */
    function resetBlock(emb) {
      var box = el('div', { class: 'lab-edit-mine' + (emb ? ' lab-edit-mine--emb' : ''), id: emb ? 'lab-edit-mine' : null });
      var ask = el('button', { type: 'button', class: 'lab-edit-resetbtn', id: 'lab-edit-reset', 'aria-expanded': 'false', onclick: openConfirm }, [
        el('span', { 'aria-hidden': 'true', text: '↺' }), emb ? 'חזרה לגרסת האתר' : 'חזרה למקור']);
      var host = emb ? el('div', { class: 'lab-edit-notice', id: 'lab-edit-reset-notice' }) : null;
      function nhost() { return emb ? host : ui.entryNotice; }
      box.appendChild(emb ? el('p', { class: 'lab-edit-mineline' }, [ask])
                          : el('p', { class: 'lab-edit-mineline' }, [el('span', { text: 'אתם רואים את הגרסה שלכם.' }), ask]));
      var confirmBox = null;
      function openConfirm() {
        if (confirmBox || sending || reloading) return;
        notice(nhost(), null);
        var yes = el('button', { type: 'button', class: 'lab-btn lab-btn--danger', id: 'lab-edit-reset-yes', text: 'כן, למחוק', onclick: doReset });
        var no = el('button', { type: 'button', class: 'lab-btn', id: 'lab-edit-reset-no', text: 'ביטול', onclick: closeConfirm });
        confirmBox = el('div', { class: 'lab-edit-confirm', id: 'lab-edit-reset-confirm', role: 'group', 'aria-labelledby': 'lab-edit-reset-q' }, [
          el('p', { id: 'lab-edit-reset-q', text: 'למחוק את הגרסה שלכם ולחזור לגרסה של האתר?' }),
          el('div', { class: 'lab-edit-confirmrow' }, [yes, no])
        ]);
        box.appendChild(confirmBox);
        if (host) box.appendChild(host);   // ההודעה מתחת לשאלה
        ask.setAttribute('aria-expanded', 'true'); ask.disabled = true;
        no.focus({ preventScroll: true });
        confirmBox.scrollIntoView({ block: 'nearest' });
        function closeConfirm() {
          if (sending) return;
          confirmBox.remove(); confirmBox = null;
          ask.disabled = false; ask.setAttribute('aria-expanded', 'false'); ask.focus({ preventScroll: true });
        }
        function doReset() {
          if (sending) return;
          sending = true;
          busy(yes, true, 'מוחקים…'); no.disabled = true; if (editBtn) editBtn.disabled = true;
          notice(nhost(), null);
          send('achord_delete_personal_version', { post_id: s.id }, 'חזרתם לגרסה של האתר.').then(function (r) {
            sending = false;
            if (destroyed) return;
            if (r.ok) {
              hasPersonal = false; savedKind = null; savedMsg = ''; savedRawPending = null;
              if (officialRaw != null) baseline = officialRaw;
              if (emb) {
                L.draft.clear(DRAFT_KEY);
                if (REAL && !r.demo) { reloadInOverlay(host, r.message || 'הגרסה שלכם נמחקה.', 800); return; }
                if (confirmBox) { confirmBox.remove(); confirmBox = null; }
                ask.hidden = true;
                notice(host, { kind: 'ok', text: r.message || 'חזרתם לגרסה של האתר.' });
                return;
              }
              if (REAL && !r.demo) {
                reloading = true; renderEntry();
                notice(ui.entryNotice, { kind: 'ok', text: (r.message || 'הגרסה שלכם נמחקה.') + ' מרעננים את הדף…' });
                reloadFresh(800);
              } else {
                renderEntry();
                notice(ui.entryNotice, { kind: 'ok', text: r.message || 'חזרתם לגרסה של האתר.' });
              }
              return;
            }
            busy(yes, false); no.disabled = false; if (editBtn) editBtn.disabled = false;
            var ex = explain(r);
            notice(nhost(), Object.assign({}, ex, { kind: 'error', text: ex.text, retry: ex.retry ? doReset : null }));
          });
        }
      }
      return box;
    }

    function pendingDraft() {
      var d = L.draft.load(DRAFT_KEY);
      if (!d || typeof d.raw !== 'string') return null;
      if (d.base !== baseline || d.raw === baseline) { L.draft.clear(DRAFT_KEY); return null; }
      return d;
    }

    /* ══ כניסה לעורך: אורח → התחברות (מדומה); טיוטה → "להמשיך?" ══ */
    function onOpenClick() {
      if (!loggedIn && !guestBypass) {
        if (IS_LAB) askLogin();
        else notice(ui.entryNotice, { kind: 'info', text: 'כדי לתקן אקורדים צריך להתחבר.', login: true });   // עמוד אמיתי: קישור ל-loginUrl
        return;
      }
      var d = pendingDraft();
      if (d) { askDraft(d); return; }
      openEditor(baseline);
    }

    /* רק בעמוד הבדיקה (UCLab.isLab): התחברות מדומה + "להמשיך בלי להתחבר" */
    function askLogin() {
      if (!IS_LAB) return;
      var body = el('div', { class: 'lab-edit-sheetbody' }, [
        el('p', { text: 'ככה התיקון נשמר על השם שלכם, ותמצאו אותו בכל מכשיר. אחרי ההתחברות חוזרים ישר לעורך, לאותו שיר.' }),
        el('button', { type: 'button', class: 'lab-btn lab-btn--block lab-edit-google', 'data-autofocus': true, onclick: function () {
          L.toast('הדגמה: כאן נפתחת התחברות עם גוגל, ואז חוזרים ישר לעורך.');
        } }, [el('span', { class: 'lab-edit-g', 'aria-hidden': 'true', text: 'G' }), 'התחברו עם גוגל']),
        el('p', { class: 'lab-edit-fine', text: 'אנחנו לא מפרסמים כלום בשמכם ולא שולחים מיילים.' }),
        el('hr'),
        el('button', { type: 'button', class: 'lab-btn lab-btn--ghost lab-btn--block', onclick: function () {
          guestBypass = true; L.sheet.close(true); onOpenClick();
        } }, ['🧪 עמוד בדיקה: להמשיך בלי להתחבר ›'])
      ]);
      L.sheet.open({ title: 'כדי לתקן אקורדים צריך להתחבר', body: body });
    }

    /* onGo/onFresh: בעמוד-השיר העורך כבר פתוח → רק מחליפים תוכן (ברירת-מחדל: כמו בעמוד הבדיקה) */
    function askDraft(d, onGo, onFresh) {
      clearToasts();
      var when = '';
      try {
        var dt = new Date(d.t), today = new Date();
        when = dt.toDateString() === today.toDateString()
          ? 'היום ב-' + dt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
          : 'ב-' + dt.toLocaleDateString('he-IL');
      } catch (e) {}
      var n = diff(baseline, L.parse(d.raw)).total;
      var body = el('div', { class: 'lab-edit-sheetbody' }, [
        el('p', { text: 'התחלתם לתקן את השיר הזה ' + when + ' ולא שמרתם (' + plural(n) + ').' }),
        el('div', { class: 'lab-row' }, [
          el('button', { type: 'button', class: 'lab-btn lab-btn--primary', 'data-autofocus': true, text: 'להמשיך מהטיוטה', onclick: function () {
            L.sheet.close(true); if (onGo) onGo(); else openEditor(d.raw);
          } }),
          el('button', { type: 'button', class: 'lab-btn', text: 'להתחיל מחדש', onclick: function () {
            L.draft.clear(DRAFT_KEY); L.sheet.close(true); if (onFresh) onFresh(); else { renderEntry(); openEditor(baseline); }
          } })
        ]),
        el('p', { class: 'lab-edit-fine', text: '"להתחיל מחדש" מוחק את הטיוטה ופותח את השיר כמו שהוא עכשיו.' })
      ]);
      L.sheet.open({ title: 'להמשיך מהטיוטה?', body: body });
    }

    /* ══ העורך (מסך מלא) ══════════════════════════════════════ */
    function openEditor(startRaw) {
      layer = el('div', { class: 'lab-edit-layer', id: 'lab-edit-layer', role: EMB ? 'dialog' : 'region', 'aria-modal': EMB ? 'true' : null, 'aria-label': 'עריכת אקורדים' });
      var inner = el('div', { class: 'lab-edit-inner' });
      layer.appendChild(inner);

      // ── כותרת דביקה: סגירה · כותרת · בטל ──
      ui.undo = el('button', { type: 'button', class: 'lab-edit-undo', id: 'lab-edit-undo', 'aria-label': 'ביטול השינוי האחרון', disabled: true, onclick: function () {
        if (cs && cs.canUndo()) { cs.undo(); onCsChange(); L.toast('השינוי האחרון בוטל'); }
      } }, [el('span', { 'aria-hidden': 'true', text: '↶' }), ' בטל']);
      // "חזור" (F4) — רק אם הליבה תומכת, ומופיע רק כשיש מה להחזיר (מתחיל לא רואה אותו)
      ui.redo = el('button', { type: 'button', class: 'lab-edit-undo lab-edit-redo', id: 'lab-edit-redo', 'aria-label': 'החזרת השינוי שבוטל', hidden: true, onclick: function () {
        if (cs && typeof cs.redo === 'function' && cs.canRedo()) { cs.redo(); onCsChange(); }
      } }, [el('span', { 'aria-hidden': 'true', text: '↷' })]);
      ui.count = el('span', { class: 'lab-edit-count', id: 'lab-edit-count', 'aria-live': 'polite' });
      ui.legend = el('span', { class: 'lab-edit-legend', hidden: true }, [el('i', { class: 'lab-edit-dot', 'aria-hidden': 'true' }), 'מסמן מה שיניתם']);
      ui.barTitle = el('strong', { text: 'עריכת אקורדים' });
      ui.head = el('header', { class: 'lab-edit-bar' }, [
        EMB ? el('button', { type: 'button', class: 'lab-edit-x lab-edit-x--text', id: 'lab-edit-close', 'aria-label': 'סגירת העורך', onclick: requestClose }, [
                el('span', { 'aria-hidden': 'true', text: '✕' }), el('span', { text: 'סגירה' })])
            : el('button', { type: 'button', class: 'lab-edit-x', id: 'lab-edit-close', 'aria-label': 'סגירת העורך', text: '✕', onclick: requestClose }),
        el('div', { class: 'lab-edit-bartitle' }, [ui.barTitle, el('span', { text: s.title })]),
        ui.redo,
        ui.undo
      ]);
      // F1: כפתור שקט "עריכת טקסט" — רק אם רכיב מצב-הטקסט נטען
      ui.textBtn = typeof L.TextMode === 'function'
        ? el('button', { type: 'button', class: 'lab-edit-textbtn', id: 'lab-edit-textmode', onclick: openTextMode }, [
            el('span', { 'aria-hidden': 'true', text: '✎' }), 'עריכת טקסט'])
        : null;
      ui.status = el('div', { class: 'lab-edit-status' }, [
        el('div', { class: 'lab-edit-statusmain' }, [ui.count, ui.legend]),
        ui.textBtn,
        hasPersonal && !SHARED ? el('p', { class: 'lab-edit-minenote', id: 'lab-edit-minenote', text: 'פתחתם את הגרסה שלכם' }) : null,
        // סבב 7 (עמוד-השיר): "כבר שלחתם הצעה" למעלה, כמו בעמוד הבדיקה (אותו טקסט)
        EMB && hasPending ? el('p', { class: 'lab-edit-pending lab-edit-pending--top', id: 'lab-edit-pending-top' }, [
          el('span', { 'aria-hidden': 'true', text: 'ⓘ' }), el('span', { text: 'כבר שלחתם הצעה לשיר הזה. הצעה חדשה תעדכן אותה.' })]) : null
      ]);
      // סבב 7: צ'יפ-מנהלים ("עורך חדש · …  לעורך הישן ›") מ-UC_LAB.neChip
      var chip = EMB && D.neChip && typeof D.neChip === 'object' && D.neChip.text ? D.neChip : null;
      ui.chip = chip ? el('p', { class: 'lab-edit-nechip', id: 'lab-edit-nechip', role: 'note' }, [
        el('span', { text: chip.text }),
        chip.oldUrl ? el('a', { href: chip.oldUrl, text: chip.oldText || 'לעורך הישן ›' }) : null
      ]) : null;
      ui.loginNote = EMB && !loggedIn ? el('div', { class: 'lab-edit-notice', id: 'lab-edit-login-notice' }) : null;

      // F5a: הסבר בשורה אחת + "עוד" (בעריכה לשיר תמיד יש אקורדים → מתחיל מקופל)
      ui.more = el('p', { class: 'lab-edit-tipmore', id: 'lab-edit-tipmore', hidden: true, text:
        'נגעו באקורד כדי להחליף, להזיז או למחוק אותו. מה ששיניתם מסומן בנקודה.' +
        (ui.textBtn ? ' ב"עריכת טקסט" אפשר לתקן גם מילים.' : '') });
      ui.moreBtn = el('button', { type: 'button', class: 'lab-edit-tipbtn', 'aria-expanded': 'false', 'aria-controls': 'lab-edit-tipmore', text: 'עוד', onclick: function () {
        setTipOpen(ui.more.hidden);
      } });
      ui.tip = el('div', { class: 'lab-edit-tip', id: 'lab-edit-tip' }, [
        el('p', { class: 'lab-edit-tipline' }, [el('span', { 'aria-hidden': 'true', text: '👆' }), el('span', { text: 'נגעו במילה כדי לשנות אקורד' }), ui.moreBtn]),
        ui.more
      ]);

      // ── מסך עריכה ──
      ui.editPane = el('section', { class: 'lab-edit-pane', 'aria-label': 'עריכה' });
      ui.editPane.appendChild(ui.tip);
      var csHost = ui.csHost = el('div', { class: 'lab-edit-cshost' });
      ui.editPane.appendChild(csHost);
      ui.tmHost = el('div', { class: 'lab-edit-tmhost', hidden: true });
      ui.editPane.appendChild(ui.tmHost);
      // סבב 7 (עמוד-השיר): "חזרה לגרסת האתר" — בתחתית העורך, רק כשיש גרסה אישית
      ui.resetBox = EMB && hasPersonal ? resetBlock(true) : null;
      if (ui.resetBox) ui.editPane.appendChild(ui.resetBox);

      // ── מסך "למי התיקון?" ──
      ui.choosePane = el('section', { class: 'lab-edit-pane lab-edit-choose', hidden: true, 'aria-labelledby': 'lab-edit-choose-title' });

      inner.appendChild(ui.head);
      if (ui.chip) inner.appendChild(ui.chip);
      if (ui.loginNote) inner.appendChild(ui.loginNote);
      inner.appendChild(ui.status);
      inner.appendChild(ui.editPane);
      inner.appendChild(ui.choosePane);
      root.appendChild(layer);
      // R8: סרגל "שימה מהירה" הדביק נעצר מתחת לכותרת הדביקה של השכבה (הגובה משתנה עם safe-area / גודל גופן)
      (function () {
        var lay = layer, head = ui.head;
        function syncTop() { if (lay.isConnected) lay.style.setProperty('--lab-brush-top', head.offsetHeight + 'px'); }
        syncTop();
        if (window.ResizeObserver) {
          var ro = new ResizeObserver(function () { if (!lay.isConnected) { ro.disconnect(); return; } syncTop(); });
          ro.observe(head);
        }
      })();
      document.documentElement.classList.add('lab-edit-lock');
      if (EMB) document.documentElement.classList.add('uc-ne-lock');   // מסתיר את כפתורי-העמוד הצפים (ראו lab-edit.css)
      if (ui.loginNote) notice(ui.loginNote, { kind: 'info', text: 'כדי לשמור את התיקון צריך להתחבר. מה שתשנו יישמר כאן כטיוטה.', login: true });

      firstChange = false;
      cs = makeChordStep(startRaw);
      onCsChange();

      screen = 'edit';
      push();
      showEditPane();
      layer.scrollTop = 0;
      var x = document.getElementById('lab-edit-close'); if (x) x.focus({ preventScroll: true });
    }

    var saveDraft = L.debounce(function () {
      if (!cs) return;
      if (count > 0) L.draft.save(DRAFT_KEY, { raw: cs.getRaw(), base: baseline, t: Date.now() });
      else L.draft.clear(DRAFT_KEY);
    }, 400);

    var firstChange = false;
    function makeChordStep(raw) {
      return L.ChordStep(ui.csHost, { raw: raw, onChange: onCsChange, onFirstChord: collapseTip });
    }
    function setTipOpen(open) {
      if (!ui.more) return;
      ui.more.hidden = !open;
      ui.moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      ui.moreBtn.textContent = open ? 'פחות' : 'עוד';
    }
    function collapseTip() { setTipOpen(false); }

    function onCsChange() {
      if (!cs || !ui.count) return;
      var d;
      try { d = diff(baseline, cs.getTokens()); }
      catch (e) {   // לעולם לא קורסים: נופלים להשוואה גסה
        if (window.console) console.error('[lab-edit] diff', e);
        var same = cs.getRaw() === baseline;
        d = { changes: [], chords: same ? 0 : 1, lines: 0, total: same ? 0 : 1, marks: {}, lineMarks: [] };
      }
      count = d.total;
      if (count > 0 && !firstChange) { firstChange = true; collapseTip(); }
      ui.undo.disabled = !cs.canUndo();
      ui.redo.hidden = !(typeof cs.canRedo === 'function' && cs.canRedo());
      ui.count.textContent = countLabel(d);
      ui.count.classList.toggle('is-some', count > 0);
      ui.legend.hidden = count === 0;
      decorate(d);
      saveDraft();
    }

    /* נקודה על כל מילה ששונה; אקורד שנמחק מוצג מחוק-בקו; שורה ששונו בה מילים (או שפוצלה אחרת) → פס בצד */
    function decorate(d) {
      var root = cs.el || ui.csHost;
      root.querySelectorAll('.lab-edit-linechg').forEach(function (n) { n.classList.remove('lab-edit-linechg'); });
      var byTok = {};
      root.querySelectorAll('.lab-cs-word').forEach(function (b) {
        var i = +b.dataset.i, m = d.marks[i];
        byTok[i] = b;
        b.classList.toggle('lab-edit-changed', !!m);
        var ch = b.querySelector('.lab-cs-chord');
        if (m && m.removed && ch && !ch.textContent.trim()) {
          b.classList.add('lab-edit-removed'); ch.setAttribute('data-old', m.removed);
        } else if (ch) { b.classList.remove('lab-edit-removed'); ch.removeAttribute('data-old'); }
      });
      (d.lineMarks || []).forEach(function (li) {
        var line = d.newLines && d.newLines[li];
        if (!line) return;
        for (var k = 0; k < line.toks.length; k++) {
          var b = byTok[line.toks[k]];
          var row = b && b.closest('.lab-cs-line');
          if (row) { row.classList.add('lab-edit-linechg'); return; }
        }
      });
    }

    /* ══ F1: מצב טקסט ══════════════════════════════════════
       מחליף את עורך-הנגיעות בתיבת טקסט (UCLab.TextMode). "החילו" → התוכן (מילים+אקורדים) נכנס
       לעורך כצעד-ביטול אחד + toast עם "בטל". "בטל"/חזרה → חוזרים בלי שינוי. */
    var tm = null, tmStart = '';
    function textDirty() {
      if (!tm) return false;
      try { return tm.getText() !== tmStart; } catch (e) { return false; }
    }
    function openTextMode() {
      if (!cs || tm || typeof L.TextMode !== 'function') return;
      L.sheet.close(true); clearToasts();
      tmStart = cs.getRaw();
      ui.tmHost.innerHTML = '';
      try {
        tm = L.TextMode(ui.tmHost, { raw: tmStart, onApply: applyText, onCancel: function () { leaveTextMode(true); } });
      } catch (e) {
        if (window.console) console.error('[lab-edit] TextMode', e);
        tm = null; L.toast('לא הצלחנו לפתוח את עריכת הטקסט.'); return;
      }
      screen = 'text';
      ui.csHost.hidden = true; ui.tip.hidden = true; ui.status.hidden = true;
      ui.undo.hidden = true; ui.redo.hidden = true;
      if (ui.resetBox) ui.resetBox.hidden = true;
      ui.tmHost.hidden = false;
      ui.barTitle.textContent = 'עריכת טקסט';
      if (cta) { cta.remove(); cta = null; }   // לרכיב יש "החילו" / "בטל" משלו
      push();
      layer.scrollTop = 0;
    }
    function teardownText() {
      if (tm) { try { tm.destroy(); } catch (e) {} }
      tm = null; tmStart = '';
      if (ui.tmHost) { ui.tmHost.innerHTML = ''; ui.tmHost.hidden = true; }
    }
    /* popHistory: true כשהיציאה ביוזמתנו (החילו/בטל) → מורידים את רשומת-ההיסטוריה של מצב-הטקסט */
    function leaveTextMode(popHistory) {
      if (!tm) return;
      teardownText();
      ui.csHost.hidden = false; ui.tip.hidden = false; ui.status.hidden = false;
      ui.undo.hidden = false;
      if (ui.resetBox) ui.resetBox.hidden = false;
      ui.barTitle.textContent = 'עריכת אקורדים';
      showEditPane();
      onCsChange();
      if (popHistory && depth > 1) { skipPop++; history.back(); }
      if (ui.textBtn) ui.textBtn.focus({ preventScroll: true });
    }
    function applyText(newRaw) {
      if (!tm || !cs) return;
      var prevRaw = cs.getRaw();
      newRaw = String(newRaw == null ? '' : newRaw);
      leaveTextMode(true);
      if (newRaw === prevRaw) { L.toast('לא היה מה לעדכן'); return; }
      var native = setContent(newRaw, true);
      L.toast('הטקסט עודכן', { action: 'בטל', onAction: function () {
        if (!cs) return;
        if (native && cs.canUndo()) cs.undo(); else setContent(prevRaw, false);
        onCsChange();
      } });
    }
    /* מחליף את תוכן העורך. מחזיר true אם הליבה רשמה את זה כצעד-ביטול. */
    function setContent(raw, undoable) {
      var native = false;
      if (typeof cs.setRaw === 'function') {
        // ליבה חדשה (K, מזוהה לפי canRedo): setRaw(raw,{undoable}) נרשם כצעד-ביטול.
        // ליבה ישנה: setRaw מאפס את ההיסטוריה → native=false → "בטל" יחזיר בעצמו את הטקסט הקודם.
        cs.setRaw(raw, { undoable: !!undoable });
        native = !!undoable && typeof cs.canRedo === 'function' && cs.canUndo();
      } else {                                                   // אין setRaw → בונים עורך חדש
        ui.csHost.innerHTML = '';
        cs = makeChordStep(raw);
      }
      onCsChange();
      return native;
    }

    function setCta(kids) {
      if (cta) cta.remove();
      cta = el('div', { class: 'uc-lab-cta lab-edit-cta' + (EMB ? ' lab-edit-cta--ne' : '') }, kids);
      document.body.appendChild(cta);
      liftCta();
    }

    function showEditPane() {
      screen = 'edit'; clearToasts();
      ui.choosePane.hidden = true; ui.editPane.hidden = false;
      ui.status.hidden = false; ui.undo.hidden = false;
      setCta([
        el('button', { type: 'button', class: 'lab-btn lab-btn--primary', id: 'lab-edit-done', onclick: function () {
          if (!count) { L.toast('עוד לא שיניתם כלום. נגעו באקורד כדי לתקן אותו.'); return; }
          showChoose(); push();
        } }, ['סיימתי', el('span', { 'aria-hidden': 'true', text: ' ←' })])
      ]);
    }

    /* ══ "למי התיקון?" ══════════════════════════════════════ */
    function showChoose() {
      L.sheet.close(true); clearToasts();
      screen = 'choose';
      choice = null;
      var d = diff(baseline, cs.getTokens());
      var p = ui.choosePane;
      p.innerHTML = '';
      p.appendChild(el('h2', { class: 'lab-title', id: 'lab-edit-choose-title', text: 'למי התיקון?' }));
      p.appendChild(el('p', { class: 'lab-sub', text: 'בחרו אחת משתי האפשרויות. בשתיהן התיקון נשמר אצלכם.' }));

      // סיכום "לפני ← אחרי"
      var list = el('ul', { class: 'lab-edit-changes' });
      function arrow() { return el('span', { class: 'lab-edit-arrow', 'aria-label': 'במקום', text: ' ← ' }); }
      function lyr(txt, cls) { return el('span', { class: 'lab-edit-lyr ' + cls, dir: 'rtl', text: '«' + clip(txt, 48) + '»' }); }
      d.changes.slice(0, 8).forEach(function (c) {
        var row;
        if (c.type === 'line') {
          row = el('li', { class: 'lab-edit-lyrrow' });
          if (c.before == null) { row.appendChild(document.createTextNode('נוספה שורה ')); row.appendChild(lyr(c.after || '(שורה ריקה)', 'is-new')); }
          else if (c.after == null) { row.appendChild(document.createTextNode('נמחקה שורה ')); row.appendChild(lyr(c.before || '(שורה ריקה)', 'is-old')); }
          else { row.appendChild(lyr(c.before, 'is-old')); row.appendChild(arrow()); row.appendChild(lyr(c.after, 'is-new')); }
        } else if (c.type === 'linechords') {
          row = el('li', null, [el('span', { class: 'lab-edit-cw', text: '«' + clip(c.text, 30) + '»' })]);
          row.appendChild(chordTag(c.before || '∅', 'is-old')); row.appendChild(arrow()); row.appendChild(chordTag(c.after || '∅', 'is-new'));
        } else if (c.type === 'chordline') {
          row = el('li', { class: 'lab-edit-clrow' }, [c.add ? 'נוספה שורת אקורדים ' : 'נמחקה שורת אקורדים ', chordTag(c.chords, c.add ? 'is-new' : 'is-old')]);
        } else if (c.type === 'move') {
          row = el('li', { class: 'lab-edit-moverow' }, [chordTag(c.chord, 'is-new'), c.from !== c.to ? ' הוזז מ' + qw(c.from) + ' ל' + qw(c.to)
            : (/^\(/.test(c.to) ? ' הוזז בשורת האקורדים' : ' הוזז בתוך ' + qw(c.to))]);
        } else {
          row = el('li', null, [el('span', { class: 'lab-edit-cw', text: qw(c.word) + (c.inWord ? ' בתוך ' + qw(c.inWord) : '') })]);
          if (!c.before) { row.appendChild(document.createTextNode('נוסף ')); row.appendChild(chordTag(c.after, 'is-new')); }
          else if (!c.after) { row.appendChild(document.createTextNode('נמחק ')); row.appendChild(chordTag(c.before, 'is-old')); }
          else { row.appendChild(chordTag(c.before, 'is-old')); row.appendChild(arrow()); row.appendChild(chordTag(c.after, 'is-new')); }
        }
        list.appendChild(row);
      });
      if (d.changes.length > 8) list.appendChild(el('li', { class: 'lab-edit-more', text: 'ועוד ' + (d.changes.length - 8) }));
      p.appendChild(el('details', { class: 'lab-edit-summary' }, [
        el('summary', { text: 'מה שיניתם (' + (d.lines ? countLabel(d).replace(/^שיניתם /, '') : plural(d.total)) + ') ›' }), list
      ]));

      var group = el('div', { class: 'lab-edit-cards', role: 'radiogroup', 'aria-label': 'למי התיקון' });
      var note = el('textarea', { id: 'lab-edit-note', maxlength: '500', rows: '3',
        placeholder: d.lines ? 'למשל: תיקנתי מילה בבית השני, בדקתי מול ההקלטה' : 'למשל: בפזמון זה Em ולא G, בדקתי מול ההקלטה' });
      var noteWrap = el('label', { class: 'lab-field lab-edit-note', hidden: true, for: 'lab-edit-note' }, [
        el('span', { text: 'מה תיקנתם? (לא חובה)' }), note,
        el('small', { text: 'משפט קצר עוזר לעורכים לאשר מהר יותר.' })
      ]);
      note.addEventListener('focus', function () { setTimeout(function () { note.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300); });

      function card(kind, icon, title, lines) {
        return el('button', { type: 'button', role: 'radio', 'aria-checked': 'false', class: 'lab-edit-card', 'data-kind': kind, onclick: function () { pick(kind); } }, [
          el('span', { class: 'lab-edit-cardico', 'aria-hidden': 'true', text: icon }),
          el('span', { class: 'lab-edit-cardtxt' }, [el('strong', { text: title })].concat(lines.map(function (t) { return el('span', { text: t }); }))),
          el('span', { class: 'lab-edit-radio', 'aria-hidden': 'true' })
        ]);
      }
      var cPersonal = card('personal_save', '🔒', 'רק בשבילי', ['תראו את הגרסה שלכם בכל פעם שתפתחו את השיר.', 'אף אחד אחר לא רואה אותה.']);
      var cPropose = card('propose', '🌍', 'להציע תיקון לכולם', ['העורכים יבדקו, ואם זה נכון, כל מי שמנגן את השיר יראה את התיקון.', 'בינתיים התיקון נשמר גם אצלכם.']);
      group.appendChild(cPersonal);
      group.appendChild(el('div', { class: 'lab-edit-cardwrap' }, [
        cPropose,
        // החלטה 2: שורת-רישיון פסיבית מתחת ל"להציע לכולם" (בלי תיבת סימון)
        el('p', { class: 'lab-edit-license', id: 'lab-edit-license', text: LICENSE }),
        hasPending ? el('p', { class: 'lab-edit-pending', id: 'lab-edit-pending' }, [
          el('span', { 'aria-hidden': 'true', text: 'ⓘ' }), el('span', { text: 'כבר שלחתם הצעה לשיר הזה. הצעה חדשה תעדכן אותה.' })]) : null,
        noteWrap
      ]));
      p.appendChild(group);
      // שורת-ההודעה: בדף, ממש מעל הכפתורים (לא בתוך ה-CTA הדביק)
      var msgHost = ui.notice = el('div', { class: 'lab-edit-notice', id: 'lab-edit-notice' });
      p.appendChild(msgHost);

      var go = el('button', { type: 'button', class: 'lab-btn lab-btn--primary', id: 'lab-edit-submit', disabled: true, text: 'בחרו למי התיקון', onclick: submit });
      var back = el('button', { type: 'button', class: 'lab-btn lab-btn--ghost', id: 'lab-edit-back', onclick: function () { if (!sending) history.back(); } }, [el('span', { 'aria-hidden': 'true', text: '→ ' }), 'לעריכה']);
      function pick(kind) {
        if (sending) return;
        choice = kind;
        [cPersonal, cPropose].forEach(function (c) {
          var on = c.dataset.kind === kind;
          c.classList.toggle('is-on', on); c.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        noteWrap.hidden = kind !== 'propose';
        go.disabled = false;
        go.textContent = kind === 'propose' ? 'שליחת ההצעה לעורכים' : 'שמירה לעצמי';
      }
      /* נעילה בזמן שליחה: הכפתור הראשי (busy), חזרה, ✕, הכרטיסים וההערה */
      function lock(on, txt) {
        sending = on;
        if (on) busy(go, true, txt); else busy(go, false);
        back.disabled = on;
        [cPersonal, cPropose].forEach(function (c) { c.disabled = on; });
        note.readOnly = on;
        var x = document.getElementById('lab-edit-close'); if (x) x.disabled = on;
      }
      function fail(r, retryFn) {
        var ex = explain(r);
        notice(msgHost, Object.assign({}, ex, { kind: 'error', text: ex.text, retry: ex.retry ? retryFn : null }));
      }
      function submit() {
        if (!choice || sending) return;
        try { window.localStorage.setItem(CHOICE_KEY, choice); } catch (e) {}   // F5c
        var raw = cs.getRaw().trim();   // כמו בישן: trim לפני שליחה
        if (!raw) { notice(msgHost, { kind: 'error', text: choice === 'propose' ? 'הטקסט ריק, לא נשלח.' : 'הטקסט ריק, לא נשמר.' }); return; }
        notice(msgHost, null);
        if (choice === 'propose') runPropose(raw, raw === savedRawPending);
        else runSave(raw);
      }
      /* "רק בשבילי" — קריאה אחת */
      function runSave(raw) {
        if (sending) return;
        lock(true, 'שומרים…');
        send('achord_save_personal_version', { post_id: s.id, raw_text: raw }, 'הגרסה שלכם נשמרה.').then(function (r) {
          if (r.ok) { lock(false); hasPersonal = true; finish('personal_save', raw, r); return; }
          lock(false); fail(r, function () { runSave(raw); });
        });
      }
      /* "להציע לכולם" — כמו בישן: קודם שמירה אישית, ואז ההצעה. onlyProposal=true → רק ההצעה (ניסיון חוזר
         אחרי כשל חלקי). בהדגמה: השמירה בלי גיליון (demoSheet:false), גיליון-הדגמה אחד של ההצעה. */
      function runPropose(raw, onlyProposal) {
        if (sending) return;
        lock(true, onlyProposal ? 'שולחים…' : 'שומרים…');
        notice(msgHost, null);
        var step1 = onlyProposal
          ? Promise.resolve({ ok: true, skipped: true })
          : send('achord_save_personal_version', { post_id: s.id, raw_text: raw }, 'הגרסה שלכם נשמרה.', { demoSheet: false });
        step1.then(function (r1) {
          if (!r1.ok) { lock(false); fail(r1, function () { runPropose(raw, false); }); return; }
          var personalSaved = onlyProposal || !r1.demo;
          if (!r1.skipped && !r1.demo) { hasPersonal = true; savedRawPending = raw; }
          busy(go, false); busy(go, true, 'שולחים…');
          return send('achord_submit_proposal', { post_id: s.id, raw_text: raw, note: note.value.trim() }, 'ההצעה נשלחה לעורכים, תודה!').then(function (r2) {
            if (r2.ok) { lock(false); hasPending = true; savedRawPending = null; finish('propose', raw, r2); return; }
            lock(false);
            var retry = function () { runPropose(raw, true); };
            if (!personalSaved) { fail(r2, retry); return; }
            var ex = explain(r2);
            notice(msgHost, Object.assign({}, ex, {
              kind: 'error',
              text: 'הגרסה נשמרה אצלכם, אבל ההצעה לא נשלחה: ' + (r2.network ? NET_MSG : (r2.message || 'שגיאה')),
              retry: retry, retryText: 'לשלוח שוב את ההצעה'
            }));
          });
        });
      }

      ui.editPane.hidden = true; ui.status.hidden = true; ui.undo.hidden = true;
      p.hidden = false;
      setCta([back, go]);
      // F5c: הבחירה האחרונה מסומנת מראש (עדיין נגיעה אחת לאישור). בלי פוקוס על ההערה → אין מקלדת.
      var last = null;
      try { last = window.localStorage.getItem(CHOICE_KEY); } catch (e) {}
      if (last === 'personal_save' || last === 'propose') pick(last);
      layer.scrollTop = 0;
    }

    /* הצלחה. הדגמה: חוזרים לעמוד השיר (כמו בסבב 4). מצב אמיתי: הודעת השרת + רענון עוקף-קאש. */
    function finish(kind, raw, r) {
      r = r || {};
      var real = REAL && !r.demo;
      baseline = raw; savedKind = kind; count = 0; savedRawPending = null;
      hasPersonal = true;   // בשתי האפשרויות נשמרת גרסה אישית (כמו בישן) → "חזרה למקור" זמין
      savedMsg = real ? (r.message || '') : '';
      L.draft.clear(DRAFT_KEY);
      if (EMB && real) {   // עמוד-השיר: נשארים בשכבה עם הודעה ברורה עד הרענון
        reloadInOverlay(ui.notice, r.message || 'נשמר.', kind === 'propose' ? 2000 : 800);
        return;
      }
      if (real) reloading = true;
      goBack(true);
      if (real) reloadFresh(kind === 'propose' ? 2000 : 800);
    }

    /* סבב 7: הצלחה בעמוד-השיר → "…, מרעננים את הדף…" בתוך השכבה, הכל נעול, רשומות-ההיסטוריה שלנו
       מוסרות בשקט (כדי שאחרי הרענון "חזרה" לא תיתקע על רשומה ריקה), ואז reloadFresh. */
    function reloadInOverlay(host, msg, delay) {
      reloading = true;
      try { L.sheet.close(true); } catch (e) {}
      clearToasts();
      [layer, cta].forEach(function (box) {
        if (box) box.querySelectorAll('button, textarea, input, select').forEach(function (n) { n.disabled = true; });
      });
      notice(host, { kind: 'ok', text: String(msg || '').trim() + ' מרעננים את הדף…' });
      if (depth > 0) { var n = depth; depth = 0; history.go(-n); }   // ה-popstate מתעלם (reloading)
      reloadFresh(delay);
    }

    /* ══ ניווט + שומר-יציאה ═══════════════════════════════════
       עומק ההיסטוריה: entry=0, edit=1, choose=2. כפתור-חזרה (גם של אנדרואיד) עובר כאן. */
    var depth = 0, forceLeave = false, skipPop = 0;
    function push() { depth++; history.pushState({ ucLabEdit: depth }, ''); }
    function screenDepth() { return screen === 'choose' || screen === 'text' ? 2 : screen === 'edit' ? 1 : 0; }
    function goBack(force) { forceLeave = !!force; if (depth > 0) history.go(-depth); else closeEditor(); }

    listen(window, 'popstate', function (e) {
      if (EMB && (reloading || destroyed)) return;
      if (screen === 'entry' && !forceLeave) return;
      depth = (e.state && e.state.ucLabEdit) || 0;
      if (forceLeave) {
        if (depth === 0) { forceLeave = false; closeEditor(); }
        return;
      }
      if (skipPop) { skipPop--; return; }      // יציאה ממצב-טקסט ביוזמתנו (החילו / בטל)
      if (sending) { while (depth < screenDepth()) push(); return; }   // בקשה בדרך → נשארים במסך
      if (L.sheet.isOpen()) {                  // חזרה כשגיליון פתוח = סגירת הגיליון בלבד
        while (depth < screenDepth()) push();
        L.sheet.close();
        return;
      }
      if (screen === 'text' && depth >= 1) {   // חזרה במצב-טקסט = "בטל" (עם שאלה אם הוקלד משהו)
        if (textDirty()) { push(); askLeaveText(); } else leaveTextMode(false);
        return;
      }
      if (screen === 'choose' && depth >= 1) { showEditPane(); return; }
      if (screen === 'edit' && depth === 0) {
        if (dirty()) { push(); askLeave(); } else closeEditor();
      }
    });

    /* יש מה לאבד? (אחרי כשל-חלקי הגרסה כבר שמורה אצלכם → לא שואלים על אותו טקסט) */
    function dirty() {
      if (count <= 0) return false;
      if (savedRawPending != null && cs && cs.getRaw().trim() === savedRawPending) return false;
      return true;
    }
    function requestClose() {
      if (sending) return;
      if (dirty() || textDirty()) askLeave(); else goBack(true);
    }

    function askLeaveText() {
      clearToasts();
      var body = el('div', { class: 'lab-edit-sheetbody' }, [
        el('p', { text: 'שיניתם את הטקסט ועוד לא החלתם. אם תצאו, השינויים בתיבה לא יישמרו.' }),
        el('div', { class: 'lab-row' }, [
          el('button', { type: 'button', class: 'lab-btn lab-btn--primary', id: 'lab-edit-textstay', 'data-autofocus': true, text: 'המשך לערוך', onclick: function () { L.sheet.close(true); } }),
          el('button', { type: 'button', class: 'lab-btn lab-btn--danger', id: 'lab-edit-textdiscard', text: 'צא בלי להחיל', onclick: function () {
            L.sheet.close(true); leaveTextMode(true);
          } })
        ])
      ]);
      L.sheet.open({ title: 'לצאת מעריכת הטקסט?', body: body });
    }

    /* toast פתוח (z מעל הגיליון) היה מסתיר את טקסט-השאלה */
    function clearToasts() { document.querySelectorAll('.uc-lab-toast').forEach(function (n) { n.remove(); }); }

    function askLeave() {
      clearToasts();
      var body = el('div', { class: 'lab-edit-sheetbody' }, [
        el('p', { text: count > 0
          ? 'עשיתם ' + plural(count) + ' ועוד לא שמרתם. אם תצאו עכשיו, התיקון לא יישמר.'
          : 'שיניתם את הטקסט ועוד לא שמרתם. אם תצאו עכשיו, השינויים לא יישמרו.' }),
        el('div', { class: 'lab-row' }, [
          el('button', { type: 'button', class: 'lab-btn lab-btn--primary', id: 'lab-edit-stay', 'data-autofocus': true, text: 'המשך לערוך', onclick: function () { L.sheet.close(true); } }),
          el('button', { type: 'button', class: 'lab-btn lab-btn--danger', id: 'lab-edit-discard', text: 'צא בלי לשמור', onclick: function () {
            count = 0; L.draft.clear(DRAFT_KEY); L.sheet.close(true); goBack(true);
          } })
        ])
      ]);
      L.sheet.open({ title: 'לצאת בלי לשמור?', body: body });
    }

    function closeEditor() {
      if (EMB) {
        // כשל-חלקי ויצאו: הגרסה האישית כן נשמרה בשרת → מרעננים, כדי שהעמוד (וגם הפתיחה הבאה) יראו אותה
        var partial = savedRawPending != null;
        if (partial && cs && cs.getRaw().trim() === savedRawPending) L.draft.clear(DRAFT_KEY);
        destroy();
        var rf = opts.returnFocus;
        if (rf && rf.isConnected && typeof rf.focus === 'function') { try { rf.focus({ preventScroll: true }); } catch (e) {} }
        if (partial) reloadFresh(400);
        return;
      }
      L.sheet.close(true); clearToasts();   // "בטל" ישן לא יפעל על עורך שנסגר
      teardownText();
      if (cta) { cta.remove(); cta = null; }
      if (layer) { layer.remove(); layer = null; }
      document.documentElement.classList.remove('lab-edit-lock');
      if (savedRawPending != null) {   // כשל חלקי ויצאו: הגרסה האישית כן נשמרה
        if (cs && cs.getRaw().trim() === savedRawPending) L.draft.clear(DRAFT_KEY);
        baseline = savedRawPending; savedKind = 'personal_save'; savedRawPending = null;
      }
      if (cs && typeof cs.destroy === 'function') { try { cs.destroy(); } catch (e) {} }   // מאזין-המקלדת + הגרירה של העורך הסגור
      cs = null; ui = {}; count = 0; screen = 'entry'; depth = 0; skipPop = 0;
      renderEntry();
      if (editBtn) editBtn.focus({ preventScroll: true });
      if (savedKind) entry.scrollIntoView({ block: 'start' });
    }

    listen(window, 'beforeunload', function (e) {
      if (reloading) return;
      if (screen !== 'entry' && (dirty() || textDirty())) { e.preventDefault(); e.returnValue = ''; return ''; }
    });

    /* ══ מקלדת: ה-CTA הדביק נשאר מעל המקלדת (iOS לא מקטין את ה-layout viewport) ══ */
    function liftCta() {
      if (!cta || !window.visualViewport) return;
      var vv = window.visualViewport;
      var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      cta.style.bottom = kb > 80 ? kb + 'px' : '';
    }
    if (window.visualViewport) {
      listen(window.visualViewport, 'resize', liftCta);
      listen(window.visualViewport, 'scroll', liftCta);
    }

    /* ══ סבב 7: ניקוי מלא (סגירה בעמוד-השיר, או mount חדש על אותו root) ══ */
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      try { L.sheet.close(true); } catch (e) {}
      clearToasts();
      teardownText();
      if (cs && typeof cs.destroy === 'function') { try { cs.destroy(); } catch (e) {} }
      if (cta) { cta.remove(); cta = null; }
      if (layer) { layer.remove(); layer = null; }
      document.documentElement.classList.remove('lab-edit-lock');
      document.documentElement.classList.remove('uc-ne-lock');
      listeners.forEach(function (x) { x[0].removeEventListener(x[1], x[2], x[3]); });
      listeners = [];
      if (depth > 0 && !reloading) { var n = depth; depth = 0; history.go(-n); }   // destroy מבחוץ, כשהעורך עוד פתוח
      cs = null; ui = {}; count = 0; screen = 'entry'; depth = 0;
      if (root._ucLabEdit === handle) root._ucLabEdit = null;
      if (EMB) root.innerHTML = '';
    }
    var handle = { destroy: destroy, _cs: function () { return cs; } };   // _cs: לבדיקות בלבד
    root._ucLabEdit = handle;

    if (EMB) {
      /* Esc = כמו ✕ (גיליון פתוח / גרירה / שליחה → לא כאן: לגיליון ולגרירה יש Esc משלהם) */
      listen(document, 'keydown', function (e) {
        if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
        if (L.sheet.isOpen() || sending || reloading || !layer) return;
        if (screen === 'choose') { e.preventDefault(); history.back(); return; }
        if (screen === 'edit') { e.preventDefault(); requestClose(); }
      });
      openEditor(baseline);
      var d0 = pendingDraft();
      if (d0) askDraft(d0, function () { if (cs) setContent(d0.raw, false); }, function () {});
    } else {
      renderEntry();
    }
    return handle;
  });
})();
