/* UC Editor Lab: the "add song" scenario (owner: Builder A).
 * Three steps: 1 · lyrics (paste + smart conversion) → 2 · chords (UCLab.ChordStep) → 3 · details and submit.
 * Submitting goes through UCLab.api.send (round 5): demo lab = the demo sheet, real mode (&live=1, admins) = the real server actions
 * achord_submit_song / achord_notebook_save_song / achord_notebook_publish_song. Without UCLab.api it falls back to UCLab.demoSubmit.
 * view=notebook (new song, or &pid= edit) shares this flow: primary "שמור במחברת", secondary "הצע לפרסום באתר".
 *
 * The paste converter is a pure function (also exported for node: qa/A-paste.test.js):
 *   UCLabAdd.convertPaste(text, { align: 'right'|'left', isChord, measure, grid: 'auto'|'mono'|'prop', model: 'auto'|'rtl'|'pad'|'ltr' })
 *     → { text, format: 'empty'|'plain'|'brackets'|'chords-over'|'mixed', chords, pairs, rtlPairs, chordOnlyLines, sections,
 *         grid, model, padded, scores, candidates }
 *   UCLabAdd.canvasMeasure([font[, doc]]) → memoised canvas text-width function with .reset() (null outside a browser)
 *   UCLabAdd.fontLoader(doc) → lazy Open Sans loader { load, whenReady(ms), state, onReady }
 *   UCLabAdd.detectCopySig / mergeCopySig / normCopySig / copySignalsField → copy-sign note + the submit field copy_signals
 */
(function (root) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     Pure section: paste conversion (no DOM)
     ══════════════════════════════════════════════════════════ */
  var HEB = /[֐-׿]/;
  var COMBINING = /[֑-ׇ̀-ͯ]/;
  var REPEAT = /^(?:[xX×]\d+|\d+[xX×])$/;
  var DECOR = /^(?:\|+|[-–—]+|\(|\)|\/|\.{2,}|:)$/;
  // guitar tablature (e|--0--3--|): never a lyric line, a chord line above it stays standalone chords
  var TABLINE = /^\s*[A-Ga-g][#b]?\s*[|:](?=.*---)[-0-9|hpbrsx~\/\\().*\s]*$/;

  function defaultIsChord(s) {
    if (root.UCLab && root.UCLab.isChord) return root.UCLab.isChord(s);
    s = String(s || '').trim();
    return s.length > 0 && s.length <= 14 && /^[A-G][#b]?[A-Za-z0-9#+°ø()]*(\/[A-G][#b]?)?$/.test(s);
  }

  /** Cleanup that preserves columns: remove bidi marks/zero-width chars, NBSP → space, tab → spaces (stops of 8) */
  function cleanLine(line) {
    line = line.replace(/[‎‏‪-‮⁦-⁩​﻿]/g, '').replace(/ /g, ' ');
    if (line.indexOf('\t') === -1) return line;
    var out = '';
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '\t') { do { out += ' '; } while (out.length % 8); } else out += line[i];
    }
    return out;
  }

  function normChordTok(t) { return t.replace(/♯/g, '#').replace(/♭/g, 'b'); }

  // English section words: never chords, even though "Chorus"/"Bridge" start with A-G
  var SECTION_WORD = /^(?:pre-?chorus|chorus|verse|intro|bridge|outro|interlude|solo|instrumental|refrain|coda|ending|break)\s*\d*$/i;

  /** Peel decoration off the END of a token: | , ] and a ")" only when it has no "(" of its own,
   *  so a chord's own parentheses survive:  D6(no3)] → D6(no3),  (Am) → Am  (the "(" was peeled by the caller) */
  function peelTail(core) {
    for (;;) {
      var n = core.length;
      core = core.replace(/[|\],]+$/, '');
      if (core.charAt(core.length - 1) === ')' && core.split(')').length > core.split('(').length) core = core.slice(0, -1);
      if (core.length === n) return core;
    }
  }

  /** Analyse a chord line: returns [{chord, s, e}] by column, plus repeat markers. null = not a chord line. */
  function chordLineInfo(line, isChord) {
    if (!line.trim()) return null;
    var re = /\S+/g, m, chords = [], repeats = [], br = 0, bare = 0;
    while ((m = re.exec(line)) !== null) {
      var tok = m[0], s = m.index;
      // peel decoration off the edges: (Am) |Am| Am,
      var lead = tok.match(/^[(|\[]*/)[0].length;
      var core = peelTail(tok.slice(lead));
      core = normChordTok(core);
      if (core && !SECTION_WORD.test(core) && isChord(core)) { if (tok.charAt(0) === '[') br++; else bare++; chords.push({ chord: core, s: s + lead, e: s + lead + core.length }); continue; }
      if (REPEAT.test(tok.replace(/[()]/g, ''))) { repeats.push(tok.replace(/[()]/g, '')); continue; }
      if (DECOR.test(tok)) continue;
      return null;                       // a token that isn't a chord → this is a lyric line
    }
    // a line mixing [bracketed] and bare chords is the site's own bracket format (a stored song with a stray bare "G"): keep verbatim
    if (br && bare) return null;
    return chords.length ? { chords: chords, repeats: repeats } : null;
  }

  /** Words in a lyric line, with logical positions */
  function wordsOf(line) {
    var re = /\S+/g, m, w = [];
    while ((m = re.exec(line)) !== null) w.push({ a: m.index, b: m.index + m[0].length, text: m[0], hits: [] });
    return w;
  }

  /** Anchor index (logical index into the lyric line) for a chord.
   *  right: the lines are aligned from the right (RTL display; the chord line shows as an LTR block with its
   *         leading spaces on the right) → the chord's right edge (its last char) is the anchor:
   *         j = lead + (trimmedLen - e).
   *  left:  plain column grid → j = s (the chord's left edge).
   *  g (optional) = proportional grid from propGrid(): the same distances in pixels instead of characters,
   *         converted back to a logical lyric index (propIndex). Without g → character columns (mono). */
  function anchorOf(c, chordLine, align, info, g, model, lyric) {
    if (align !== 'right') return g ? propIndex(g, g.measure(chordLine.slice(0, c.s))) : c.s;
    // ltr: both lines start at the same left edge (an LTR paragraph, the Hebrew lyric reads from its right end)
    //      → distance from the lyric's right end = lyric width − the chord's right edge.
    if (model === 'ltr' && lyric != null) return g ? propIndex(g, g.pre[g.pre.length - 1] - g.measure(chordLine.slice(0, c.e))) : lyric.length - c.e;
    // pad: the chord line is padded with trailing spaces to the lyric's width and shows as one LTR block aligned
    //      to the right → the distance from the right edge is everything after the chord, trailing spaces included.
    if (model === 'pad') return g ? propIndex(g, g.measure(chordLine.slice(c.e))) : chordLine.length - c.e;
    // rtl (default): an unpadded chord line in an RTL paragraph → leading spaces show on the right, trailing ones don't count
    // the width of the line = up to the end of the last chord (repeat markers like x2 and decoration don't move the alignment)
    var end = info ? info.chords.reduce(function (m, x) { return Math.max(m, x.e); }, 0) : chordLine.replace(/\s+$/, '').length;
    var lead = chordLine.length - chordLine.replace(/^\s+/, '').length;
    if (!g) return lead + (end - c.e);
    // distance of the chord's right edge from the line's right edge, in pixels
    return propIndex(g, g.measure(chordLine.slice(0, lead)) + g.measure(chordLine.slice(c.e, end)));
  }

  /** Proportional grid for one lyric line: prefix widths W(lyric[0..i)) for i = 0..length. */
  function propGrid(lyric, measure) {
    var pre = [];
    for (var i = 0; i <= lyric.length; i++) pre.push(measure(lyric.slice(0, i)));
    return { measure: measure, pre: pre };
  }
  /** The logical lyric index i whose prefix width is closest to d pixels (ties → the smaller i).
   *  Past the end of the lyric → continue in units of one space, so "past the end → tail chord" still works. */
  function propIndex(g, d) {
    var pre = g.pre, n = pre.length - 1;
    g.d = d;                              // the last distance asked for (mergePair uses it for the tail threshold)
    if (d > pre[n]) return n + Math.round((d - pre[n]) / (g.measure(' ') || 1));
    var best = 0, bd = Infinity;
    for (var i = 0; i <= n; i++) { var x = Math.abs(pre[i] - d); if (x < bd) { bd = x; best = i; } }
    return best;
  }

  function nearestWord(words, j) {
    var best = -1, bd = Infinity;
    for (var k = 0; k < words.length; k++) {
      var w = words[k], d;
      if (j >= w.a && j < w.b) return { k: k, d: 0 };
      d = j < w.a ? w.a - j : j - (w.b - 1);
      if (d < bd || (d === bd && j < w.a)) { bd = d; best = k; }   // tie → the following word
    }
    return { k: best, d: bd };
  }

  function okSplit(text, o) { return o > 0 && o < text.length && !COMBINING.test(text.charAt(o)); }

  /** Render one word with its chords: head[c1]tail[c2] · conflicts → standalone before/after */
  function renderWord(w) {
    if (!w.hits.length) return w.text;
    var hits = w.hits.slice().sort(function (x, y) { return x.j - y.j; });
    var pre = [], post = [], segs = [{ start: 0, chord: hits[0].chord }];
    for (var i = 1; i < hits.length; i++) {
      var o = hits[i].j - w.a, last = segs[segs.length - 1];
      while (o > 0 && o < w.text.length && COMBINING.test(w.text.charAt(o))) o++;   // don't separate a letter from its niqqud
      if (o > last.start && okSplit(w.text, o)) { segs.push({ start: o, chord: hits[i].chord }); }
      else if (o >= w.text.length) { post.push(hits[i].chord); }
      else if (segs.length === 1) { pre.push(last.chord); last.chord = hits[i].chord; }   // same spot: the earlier one goes before the word
      else { post.push(hits[i].chord); }
    }
    var out = pre.map(function (c) { return '[' + c + '] '; }).join('');
    segs.forEach(function (sg, i) {
      var end = i + 1 < segs.length ? segs[i + 1].start : w.text.length;
      out += w.text.slice(sg.start, end) + '[' + sg.chord + ']';
    });
    return out + post.map(function (c) { return ' [' + c + ']'; }).join('');
  }

  /** Merge a chord line into a lyric line → a word[Am] line */
  function mergePair(chordLine, info, lyric, align, measure, misfit, model) {
    var words = wordsOf(lyric), tailChords = [];
    var g = measure ? propGrid(lyric, measure) : null;
    var far = -1;
    info.chords.forEach(function (c) {
      var j = anchorOf(c, chordLine, align, info, g, model, lyric);
      far = Math.max(far, j);
      if (misfit) {
        // how far the anchor is from the nearest word start (capped at 3): the right grid lands chords on word starts
        var m = 3;
        words.forEach(function (w) { m = Math.min(m, Math.abs(j - w.a)); });
        misfit.sum += m; misfit.n++;
      }
      var n = nearestWord(words, j);
      var lastW = words[words.length - 1];
      // past the end of the last word: a standalone chord at the end of the line, unless it's only just past it
      var past = lastW && n.k === words.length - 1 && j >= lastW.b;
      var tail = n.k < 0 || (past && (g
        ? g.d - g.pre[lastW.b] > g.measure('אאא')                           // pixels: more than three letters past the word (canvas widths drift from the source's font)
        : model === 'pad' || model === 'ltr' ? j >= Math.max(lastW.b + 2, lyric.length)   // padded: the lyric's trailing spaces still belong to the line
        : j >= lastW.b + 2));
      if (tail) { tailChords.push({ j: j, chord: c.chord }); return; }
      // only just past the last word (or inside the padding after it) → on the word's last letter
      if (past && (g || model === 'pad' || model === 'ltr')) j = lastW.b - 1;
      words[n.k].hits.push({ j: Math.max(j, words[n.k].a), chord: c.chord });
    });
    // extent of the chord line relative to the lyric (1 = the farthest chord sits on the last letter)
    if (misfit) misfit.ext.push((far + 1) / Math.max(1, lyric.length));
    var out = '', pos = 0;
    words.forEach(function (w) { out += lyric.slice(pos, w.a) + renderWord(w); pos = w.b; });
    out += lyric.slice(pos).replace(/\s+$/, '');
    tailChords.sort(function (x, y) { return x.j - y.j; }).forEach(function (t) { out += ' [' + t.chord + ']'; });
    if (info.repeats.length) out += ' ' + info.repeats.join(' ');
    return out;
  }

  function chordOnlyLine(info, align, chordLine) {
    // chords with no lyrics under them (intro/interlude) → standalone chords in typed order
    var parts = info.chords.map(function (c) { return '[' + c.chord + ']'; });
    return parts.concat(info.repeats).join(' ');
  }

  /** A bracket token that is clearly a section name: Hebrew text ([פזמון], [פזמון 2]) or an English section word
   *  ([Chorus], [Verse 2], [Intro]). Everything else in brackets is kept verbatim (it is a chord, even an unusual one). */
  function isSectionName(inner) {
    inner = inner.trim();
    if (!inner || inner.length > 40) return false;
    if (SECTION_WORD.test(inner)) return true;
    return HEB.test(inner) && !/[\[\]]/.test(inner);
  }

  /** Brackets that aren't chords: a clear section name ([פזמון], [Chorus]) → plain header text, so it isn't parsed as a chord.
   *  Anything else stays exactly as typed - never turned into a header, never a character dropped (A6/9, D6(no3), C-5 ...).
   *  A bracket glued to a word (word[Am]) is always a chord, never a header. */
  function fixSectionBrackets(line, isChord, counter) {
    return line.replace(/\[([^\]\n]*)\]/g, function (all, inner, off) {
      var t = inner.trim();
      if (!t) return '';
      var glued = (off > 0 && /\S/.test(line.charAt(off - 1))) || /\S/.test(line.charAt(off + all.length));
      if (!glued && isSectionName(t)) { counter.n++; return t + ':'; }
      var norm = normChordTok(t);
      return isChord(norm) && !SECTION_WORD.test(norm) ? '[' + norm + ']' : all;
    });
  }

  function countChords(text) {
    var m = String(text).match(/\[[^\]\n]+\]/g);
    return m ? m.length : 0;
  }

  /** opts: { align: 'right'|'left', isChord, measure(str)→px, grid: 'auto'|'mono'|'prop', model: 'auto'|'rtl'|'pad'|'ltr' }
   *  grid (default 'auto'): how the chord line's spacing is read.
   *    mono = by characters (sources shown in a fixed-width font: 1 char = 1 column)
   *    prop = by pixel width via opts.measure (sources typed in a proportional font, aligned by eye)
   *  model (default 'auto'; only matters for Hebrew lines aligned 'right'): where the chord line's right edge is.
   *    rtl = an unpadded chord line in an RTL paragraph (leading spaces show on the right, trailing ones don't count)
   *    pad = a chord line padded with trailing spaces to the lyric's width (trailing spaces count)
   *    ltr = both lines share the left edge (an LTR page); never picked by auto, only offered by the cycle button
   *  auto: every candidate {mono, prop (needs measure)} × {rtl, pad, ltr} is converted, then
   *    1. model: pad when most Hebrew pairs look padded (trailing spaces + chord line ≈ lyric length in chars), else rtl.
   *       The misfit score cannot tell the models apart (measured on the fixtures), the padding can.
   *    2. grid: padded → mono (padding a chord line to the lyric's character count only lines up in a fixed-width
   *       font, and the score picked the wrong grid on a padded fixture); otherwise the lower misfit score, ties → mono.
   *  Adds res.grid, res.model, res.padded (share of Hebrew pairs that look padded), res.scores ({'mono/rtl': n, …})
   *  and res.candidates ([{grid, model, score, text}]: the pick first, then its model by score, then the rest by score). */
  function convertPaste(text, opts) {
    opts = opts || {};
    var measure = typeof opts.measure === 'function' ? opts.measure : null;
    var align = opts.align === 'left' ? 'left' : 'right';
    var gridSet = opts.grid === 'mono' || opts.grid === 'prop';
    var modelSet = opts.model === 'rtl' || opts.model === 'pad' || opts.model === 'ltr';
    var grids = opts.grid === 'mono' || !measure ? ['mono'] : opts.grid === 'prop' ? ['prop'] : ['mono', 'prop'];
    var models = modelSet ? [opts.model] : align === 'right' ? ['rtl', 'pad', 'ltr'] : ['rtl'];
    var all = [];
    grids.forEach(function (g) { models.forEach(function (m) { all.push(convertGrid(text, opts, g === 'prop' ? measure : null, m)); }); });
    var padded = all[0].padded, isPadded = align === 'right' && padded >= 0.5;
    var prefModel = modelSet ? opts.model : isPadded ? 'pad' : 'rtl';
    function byScore(a, b) { return (a.score - b.score) || ((a.grid === 'mono' ? 0 : 1) - (b.grid === 'mono' ? 0 : 1)); }
    var pool = all.filter(function (r) { return r.model === prefModel; }).sort(byScore);
    var pick = pool[0];
    if (isPadded && !gridSet) pool.forEach(function (r) { if (r.grid === 'mono') pick = r; });
    var rest = all.filter(function (r) { return r !== pick; }).sort(function (a, b) {
      return ((a.model === prefModel ? 0 : 1) - (b.model === prefModel ? 0 : 1)) || byScore(a, b);
    });
    var scores = {};
    all.forEach(function (r) { scores[r.grid + '/' + r.model] = r.score; });
    pick.scores = scores;
    pick.candidates = [pick].concat(rest).map(function (r) { return { grid: r.grid, model: r.model, score: r.score, text: r.text }; });
    delete pick.score;
    return pick;
  }

  /** Misfit of one candidate (lower = better), over the chords merged onto Hebrew lyric lines:
   *  word-start fit = mean(min(|j − nearest word start|, 3))   (the reference score)
   *  + 3 × |ln(p75 of per-line extent)|, extent = (farthest anchor + 1) / lyric length.
   *  Why the extent term: chords in fixed-width sources sit near, not on, word starts (they mark syllables), so
   *  the word-start fit alone preferred the wrong grid on every fixed-width fixture (the proportional reading just
   *  squeezes chords toward the line start, where words are as dense). In the right grid the chord line spans about
   *  as much as the lyric; the wrong one either overshoots the line end (proportional source read by characters)
   *  or stops well short of it (fixed-width source read by pixels). p75 because some lines legitimately have chords
   *  only at the start; weight 3 = the cap of the word-start term. */
  function misfitScore(m) {
    if (!m.n) return 0;
    var e = m.ext.slice().sort(function (a, b) { return a - b; });
    var p75 = e[Math.min(e.length - 1, Math.floor(0.75 * e.length))];
    return m.sum / m.n + 3 * Math.abs(Math.log(Math.max(p75, 1e-3)));
  }

  function convertGrid(text, opts, measure, model) {
    var isChord = opts.isChord || defaultIsChord;
    var align = opts.align === 'left' ? 'left' : 'right';
    var src = String(text || '').replace(/\r\n?/g, '\n');
    var misfit = { sum: 0, n: 0, ext: [] }, padN = 0;
    var res = { text: '', format: 'empty', chords: 0, pairs: 0, rtlPairs: 0, chordOnlyLines: 0, sections: 0, grid: measure ? 'prop' : 'mono', model: model, score: 0, padded: 0 };
    if (!src.trim()) return res;

    var lines = src.split('\n').map(cleanLine);
    var sec = { n: 0 }, hadBrackets = false, out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var info = chordLineInfo(line, isChord);
      if (!info) {
        if (/\[[^\]\n]*\]/.test(line)) { line = fixSectionBrackets(line, isChord, sec); if (/\[/.test(line)) hadBrackets = true; }
        out.push(line);
        continue;
      }
      var next = lines[i + 1];
      var nextIsLyric = next != null && next.trim() !== '' && !chordLineInfo(next, isChord) && !/\[[^\]\n]+\]/.test(next) && !TABLINE.test(next);
      if (nextIsLyric) {
        // in a Hebrew line, the alignment chosen by the user; a Latin line is always a regular column grid
        var heb = HEB.test(next);
        var lineAlign = heb ? align : 'left';
        out.push(mergePair(line, info, next, lineAlign, measure, heb ? misfit : null, model));
        res.pairs++;
        if (heb) {
          res.rtlPairs++;
          // padding signal: the chord line is about as long as the lyric (in characters)
          if (Math.abs(line.length - next.length) <= 2) padN++;
        }
        i++;
      } else {
        out.push(chordOnlyLine(info, align, line));
        res.chordOnlyLines++;
      }
    }
    res.text = out.join('\n').replace(/\s+$/, '');
    res.sections = sec.n;
    res.chords = countChords(res.text);
    res.score = misfitScore(misfit);
    res.padded = res.rtlPairs ? padN / res.rtlPairs : 0;
    var conv = res.pairs + res.chordOnlyLines > 0;
    res.format = conv && hadBrackets ? 'mixed' : conv ? 'chords-over' : hadBrackets ? 'brackets' : 'plain';
    return res;
  }

  /** Browser text measure for the proportional grid: canvas, memoised. null when there is no canvas (node).
   *  The returned function has .reset() — the cache must be dropped whenever a web font finishes loading
   *  (canvas widths are cached per string and would keep the fallback font's numbers). */
  var MEASURE_FONT = '16px "Open Sans", Arial, sans-serif';
  function canvasMeasure(font, doc) {
    doc = doc || root.document;
    var ctx = null;
    try { ctx = doc && doc.createElement('canvas').getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx || typeof ctx.measureText !== 'function') return null;
    font = font || MEASURE_FONT;
    var cache = Object.create(null), size = 0;
    function reset() { cache = Object.create(null); size = 0; }
    // any web font that finishes loading changes the widths → start over
    try { if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', reset); } catch (e) {}
    function measure(s) {
      var v = cache[s];
      if (v === undefined) {
        if (++size > 20000) reset();
        ctx.font = font;
        v = cache[s] = ctx.measureText(s).width;
      }
      return v;
    }
    measure.reset = reset;
    return measure;
  }

  /** Open Sans for the paste measurement (the big Hebrew chord sites draw their chords against it).
   *  Lazy: nothing is requested until load() is called. Never throws, never blocks: offline → state 'failed' (the canvas
   *  falls back to Arial). doc: a document (or a fake in tests). Returns { load(), whenReady(maxMs), state(), onReady(fn) }.
   *  state: 'idle' → 'loading' → 'ready' | 'failed'. A late success after a timeout still ends in 'ready' and fires onReady. */
  var OPEN_SANS_CSS = 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400&display=swap';
  function fontLoader(doc, opts) {
    opts = opts || {};
    var state = 'idle', promise = null, subs = [];
    var url = opts.url || OPEN_SANS_CSS, spec = opts.spec || '16px "Open Sans"', sample = opts.sample || 'אבג Am';
    var giveUp = opts.giveUpMs == null ? 8000 : opts.giveUpMs;
    function setState(v) {
      if (state === 'ready') return;
      if (v === 'failed' && state !== 'loading') return;
      var was = state; state = v;
      if (v === 'ready' && was !== 'ready') subs.slice().forEach(function (fn) { try { fn(); } catch (e) {} });
    }
    function load() {
      if (promise) return promise;
      promise = new Promise(function (resolve) {
        function fin(ok) { setState(ok ? 'ready' : 'failed'); resolve(state === 'ready'); }
        if (!doc || !doc.fonts || typeof doc.fonts.load !== 'function' || !doc.createElement || !(doc.head || doc.documentElement)) { state = 'failed'; return resolve(false); }
        state = 'loading';
        var timer = setTimeout(function () { setState('failed'); resolve(false); }, giveUp);
        try {
          var link = doc.createElement('link');
          link.rel = 'stylesheet'; link.href = url;
          link.onerror = function () { clearTimeout(timer); fin(false); };
          link.onload = function () {
            // the @font-face rules exist only now: ask for the Hebrew + Latin glyphs we measure with
            Promise.resolve(doc.fonts.load(spec, sample)).then(function (faces) { clearTimeout(timer); fin(!!(faces && faces.length)); },
              function () { clearTimeout(timer); fin(false); });
          };
          (doc.head || doc.documentElement).appendChild(link);
        } catch (e) { clearTimeout(timer); fin(false); }
      });
      return promise;
    }
    /** resolves true when the font is ready, false on failure or after maxMs (the caller then converts with what is there) */
    function whenReady(maxMs) {
      if (state === 'ready') return Promise.resolve(true);
      if (state === 'failed') return Promise.resolve(false);
      return new Promise(function (resolve) {
        var t = setTimeout(function () { resolve(false); }, maxMs == null ? 1500 : maxMs);
        load().then(function (ok) { clearTimeout(t); resolve(ok); });
      });
    }
    return { load: load, whenReady: whenReady, state: function () { return state; }, onReady: function (fn) { subs.push(fn); } };
  }

  /* ── copy signs (lab-copysig.js, optional): detection result kept next to the draft ── */
  var CS_RANK = { none: 0, weak: 1, strong: 2 };
  function emptyCopySig() { return { level: 'none', signals: [] }; }
  function normCopySig(x) {
    if (!x || typeof x !== 'object' || !CS_RANK.hasOwnProperty(x.level) || !Array.isArray(x.signals)) return emptyCopySig();
    return { level: x.level, signals: x.signals.slice() };
  }
  /** the stronger level wins; signals are the union (same type + match counted once) */
  function mergeCopySig(a, b) {
    a = normCopySig(a); b = normCopySig(b);
    var seen = {}, sigs = [];
    a.signals.concat(b.signals).forEach(function (g) {
      var k = (g && g.type) + '|' + (g && g.match);
      if (!seen[k]) { seen[k] = 1; sigs.push(g); }
    });
    return { level: CS_RANK[a.level] >= CS_RANK[b.level] ? a.level : b.level, signals: sigs };
  }
  /** detect() on the RAW text (before any cleaning); none when lab-copysig.js is absent or throws */
  function detectCopySig(raw, detector) {
    detector = detector || (root.UCLabCopySig && root.UCLabCopySig.detect ? root.UCLabCopySig : null);
    raw = String(raw || '');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);   // one leading BOM is a file marker, not a watermark
    if (!detector || !raw.trim()) return emptyCopySig();
    try { return normCopySig(detector.detect(raw)); } catch (e) { return emptyCopySig(); }
  }
  /** value of the submit field "copy_signals" (JSON string), or null when there is nothing to report */
  function copySignalsField(cs) {
    cs = normCopySig(cs);
    return cs.level === 'none' ? null : JSON.stringify(cs);
  }

  function isTabLine(line) { return TABLINE.test(line); }

  var API = { convertPaste: convertPaste, chordLineInfo: chordLineInfo, isTabLine: isTabLine, canvasMeasure: canvasMeasure, fontLoader: fontLoader, detectCopySig: detectCopySig, mergeCopySig: mergeCopySig,
    normCopySig: normCopySig, copySignalsField: copySignalsField, _anchorOf: anchorOf, _propGrid: propGrid };
  root.UCLabAdd = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (!root.UCLab || !root.UCLab.register || typeof document === 'undefined') return;

  /* ══════════════════════════════════════════════════════════
     The UI
     ══════════════════════════════════════════════════════════ */
  function mountAdd(rootEl, L) {
    if (rootEl.__labAddMounted) return;       // the core may call us under 'add' and 'notebook' (and the bootstrap below)
    rootEl.__labAddMounted = true;
    var el = L.el;
    var D = L.data || {};
    // round 7: true only on the test page (/editor-lab/). On the real pages (/add-song/, /notebook/) every demo-only string and behaviour stays off
    var LAB = !!L.isLab;
    var STEPS = ['מילים', 'אקורדים', 'פרטים ושליחה'];

    // two scenarios in one flow: view=add (send to the editors / save privately) and view=notebook (new song or edit by pid)
    var NB = D.view === 'notebook' || rootEl.getAttribute('data-mode') === 'notebook';
    var NBD = NB && D.notebook && typeof D.notebook === 'object' ? D.notebook : null;
    var PID = NBD ? (parseInt(NBD.pid, 10) || 0) : 0;
    var DK = NB ? 'nb-' + (PID || 'new') : 'add';       // draft key: a notebook song never mixes with the add-song draft
    // lab URL only (?pid=): the real URL is ?np=edit-<pid>, and there PHP mounts this view only for an own song (pid comes from UC_LAB.notebook.pid)
    var wantedPid = LAB && NB && !NBD && /[?&]pid=\d+/.test(window.location.search);   // asked for a song that is not ours / does not exist

    function blankState() {
      return {
        step: 1, source: '', align: 'right', grid: 'auto', model: 'auto', layoutManual: false, copySig: emptyCopySig(), raw: '', dirty: false,
        title: '', performer: '', lyrics_by: '', music_by: '', capo: '0', youtube: '',
        tempo: '', strumming: '', genres: [], level: '', consent: false, moreOpen: false,
        versionEasy: '', easyTranspose: '0', easyOpen: false
      };
    }
    var state = blankState();
    if (NBD) {
      // same prefill as Notebook_Handler::render_editor; the stored text is kept verbatim (no re-conversion)
      state.title = String(NBD.title || ''); state.performer = String(NBD.performer || '');
      state.capo = String(parseInt(NBD.capo, 10) || 0);
      state.source = state.raw = String(NBD.raw || ''); state.dirty = true; state.step = 2;
    }
    function snapOf(s) { return JSON.stringify([s.title, s.performer, s.capo, s.raw]); }
    var initialSnap = NBD ? snapOf(state) : null;
    var sending = false, sent = false, redirectTimer = null;
    var measure = canvasMeasure();     // pixel widths for chords typed in a proportional font (null → characters only)
    // Open Sans (what the big chord sites measure against): requested lazily, never blocks; the measure cache is dropped when it arrives
    var fonts = fontLoader(document);
    var fontHook = null;               // step 1 sets it: re-converts once the font is ready (unless the layout was picked by hand)
    fonts.onReady(function () { if (measure && measure.reset) measure.reset(); if (fontHook) fontHook(); });
    function startFont() { if (measure && fonts.state() === 'idle') fonts.load(); }
    if (measure) {
      if (window.requestIdleCallback) window.requestIdleCallback(startFont, { timeout: 2500 }); else setTimeout(startFont, 1200);
    }
    // how the chord lines are read: align + grid (characters / pixels) + model (where the chord line's edge is)
    function convOpts(s) { s = s || state; return { align: s.align || 'right', grid: s.grid || 'auto', model: s.model || 'auto', measure: measure }; }
    // what a saved draft may lack (older drafts): layout fields → automatic, copySig → none
    function resumeOf(s) { var o = layoutOf(s); o.copySig = normCopySig(s.copySig); o.layoutManual = !!s.layoutManual; return o; }
    // one calm note when the text carries signs of having been copied from another site (never an error, never blocks)
    var COPY_NOTE = 'נראה שהשיר הועתק מאתר אחר. אם אתם פרסמתם אותו שם, אפשר לשלוח אותו גם לכאן. אם לא, אפשר לשמור אותו רק לעצמכם במחברת.';
    function copyNote() {
      return state.copySig && state.copySig.level !== 'none' ? el('p', { class: 'lab-add-copynote', role: 'note', text: COPY_NOTE }) : null;
    }
    function layoutOf(s) { return { align: s.align || 'right', grid: s.grid || 'auto', model: s.model || 'auto' }; }
    var conv = convertPaste('', {});
    var cs = null;                    // ChordStep instance
    var tm = null;                    // text-mode instance (step 2 only)
    var noChordWarned = false;
    var draftPaused = false;

    /* ── draft ── */
    var saveDraft = L.debounce(function () {
      if (draftPaused || sent) return;                         // after a successful send the draft stays gone
      var s = Object.assign({}, state);
      if (!s.source.trim() && !s.raw.trim() && !s.title.trim()) { L.draft.clear(DK); return; }
      if (initialSnap && snapOf(s) === initialSnap) { L.draft.clear(DK); return; }   // an untouched notebook song needs no draft
      L.draft.save(DK, s);
    }, 500);

    function recompute() {
      conv = convertPaste(state.source, convOpts());
      if (!state.dirty) state.raw = conv.text;
    }
    function chordCount(raw) { return L.parse(raw).filter(function (t) { return t.chord; }).length; }
    function plural(n, one, many) { return n === 1 ? one : n + ' ' + many; }

    /* ── skeleton ── */
    rootEl.innerHTML = '';
    var resumeBox = el('div', { class: 'lab-add-resume', hidden: true });
    var stepsOl = el('ol', { class: 'uc-lab-steps lab-add-steps', 'aria-label': 'שלבי הוספת שיר' });
    var stage = el('div', { class: 'lab-add-stage' });
    rootEl.appendChild(resumeBox);
    if (NB) {
      // the notebook is private: say so once, in one line (the two ways out are the two buttons of the last step)
      rootEl.appendChild(el('p', { class: 'lab-add-nbbar', role: 'note' }, [
        el('span', { 'aria-hidden': 'true', text: '🔒 ' }),
        PID ? 'עורכים שיר במחברת האישית שלכם. השינויים נשמרים רק כשתשמרו.' : 'שיר חדש במחברת האישית שלכם. הוא פרטי, עד שתציעו אותו לפרסום.'
      ]));
      if (wantedPid) rootEl.appendChild(el('p', { class: 'lab-add-nbbar lab-add-nbbar--warn', role: 'status', text: 'לא מצאנו את השיר הזה במחברת שלכם, אז מתחילים שיר חדש.' }));
    }
    rootEl.appendChild(stepsOl);
    rootEl.appendChild(stage);

    var cta = el('div', { class: 'uc-lab-cta lab-add-cta', role: 'region', 'aria-label': 'המשך' });
    document.body.appendChild(cta);

    /* the CTA always sits above the keyboard (iOS: the layout viewport doesn't shrink) */
    // the CTA's height is published as --lab-cta-h (lab-add.css uses it on the real pages: the site's accessibility button and the footer stay clear of the sticky bar)
    function ctaHeight() { try { document.body.style.setProperty('--lab-cta-h', cta.offsetHeight + 'px'); } catch (e) {} }
    if (window.ResizeObserver) { try { new window.ResizeObserver(ctaHeight).observe(cta); } catch (e) {} }
    function liftCta() {
      ctaHeight();
      var vv = window.visualViewport;
      if (!vv) return;
      var kb = window.innerHeight - vv.height - vv.offsetTop;
      cta.style.bottom = (kb > 40 ? kb : 0) + 'px';
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', liftCta);
      window.visualViewport.addEventListener('scroll', liftCta);
    }
    // a field that receives focus moves to the centre of the visible area (above the CTA and keyboard)
    var focusScroll = null;
    rootEl.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t.matches || !t.matches('input[type=text], input[type=url], input[type=search], textarea')) return;
      clearTimeout(focusScroll);
      focusScroll = setTimeout(function () { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
    });

    function renderSteps() {
      stepsOl.innerHTML = '';
      STEPS.forEach(function (name, i) {
        var n = i + 1;
        var li = el('li', { class: n === state.step ? 'is-on' : (n < state.step ? 'is-done' : ''), 'aria-current': n === state.step ? 'step' : null });
        var label = n + ' · ' + name;
        if (n < state.step) li.appendChild(el('button', { type: 'button', class: 'lab-add-stepbtn', text: label, 'aria-label': 'חזרה לשלב ' + label, onclick: function () { go(n); } }));
        else li.appendChild(el('span', { class: 'lab-add-stepbtn', text: label }));
        stepsOl.appendChild(li);
      });
    }

    function setCta(kids) {
      cta.innerHTML = '';
      kids.forEach(function (k) { if (k) cta.appendChild(k); });
      liftCta();
    }

    function fieldError(anchor, id, msg) {
      var old = document.getElementById(id);
      if (old) old.remove();
      if (!msg) return null;
      var e = el('div', { class: 'lab-error', id: id, role: 'alert', text: msg });
      anchor.insertAdjacentElement('afterend', e);
      return e;
    }
    function focusInvalid(node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (node.focus) node.focus({ preventScroll: true });
    }

    function go(n) {
      if (tm) { L.toast('סיימו או בטלו את עריכת הטקסט קודם'); return; }
      if (cs && L.sheet.isOpen()) L.sheet.close(true);
      // a toast from the previous step (with "בטל" pointing at a ChordStep that no longer exists) does not carry into the new step
      document.querySelectorAll('.uc-lab-toast').forEach(function (t) { t.remove(); });
      if (n === 1 && state.dirty) {
        // back from step 2 after edits: the text with its chords becomes the source (nothing is lost)
        state.source = state.raw; state.dirty = false;
      }
      state.step = n;
      fontHook = null;
      renderSteps();
      stage.innerHTML = '';
      cs = null;
      if (n === 1) renderStep1(); else if (n === 2) renderStep2(); else renderStep3();
      window.scrollTo({ top: Math.max(0, rootEl.getBoundingClientRect().top + window.scrollY - 12), behavior: 'auto' });
      var h = stage.querySelector('h2');
      if (h) h.focus({ preventScroll: true });
      saveDraft();
    }

    /* ════════ Step 1: lyrics ════════ */
    function renderStep1() {
      stage.appendChild(el('h2', { class: 'lab-title', tabindex: '-1', text: 'המילים של השיר' }));
      stage.appendChild(el('p', { class: 'lab-sub', text: 'הדביקו את השיר כמו שהוא. אם יש בו אקורדים, נזהה אותם לבד.' }));

      var accepted = el('details', { class: 'lab-add-accepts' }, [
        el('summary', { text: 'מה אפשר להדביק? ›' }),
        el('ul', null, [
          el('li', null, [el('strong', { text: 'רק מילים. ' }), 'את האקורדים תוסיפו בשלב הבא.']),
          el('li', null, [el('strong', { text: 'אקורדים מעל השורות, ' }), 'כמו שמעתיקים מאתרי אקורדים, מוואטסאפ או מוורד:',
            el('pre', { class: 'lab-add-example', dir: 'rtl', text: 'Am        G\nשלום עולם' })]),
          el('li', null, [el('strong', { text: 'אקורד בסוגריים אחרי המילה: ' }), el('code', { dir: 'rtl', text: 'שלום[Am] עולם[G]' })])
        ])
      ]);

      var ta = el('textarea', {
        id: 'lab-add-lyrics', dir: 'rtl', rows: '10', spellcheck: 'true', autocomplete: 'off',
        'aria-describedby': 'lab-add-lyrics-help',
        placeholder: 'למשל:\nAm        G\nשלום עולם\nאו רק את המילים'
      });
      ta.value = state.source;
      var label = el('label', { class: 'lab-field', for: 'lab-add-lyrics' }, [
        el('span', { text: 'הדביקו או הקלידו את השיר' }), ta,
        el('small', { id: 'lab-add-lyrics-help', text: 'שורה בשיר = שורה כאן. שורה ריקה מפרידה בין בתים.' })
      ]);

      var status = el('div', { class: 'lab-add-status', role: 'status', 'aria-live': 'polite' });
      var mini = el('div', { class: 'lab-add-mini', 'aria-hidden': 'true' });
      // "try another layout": the converter's candidates in order (best first), then the flipped alignment.
      // Layouts that give exactly the same text are skipped, so every press changes something.
      function layouts() {
        var right = convertPaste(state.source, convOpts({ align: 'right' }));
        var list = [{ align: 'right', grid: 'auto', model: 'auto', text: right.text }];
        (right.candidates || []).slice(1).forEach(function (c) { list.push({ align: 'right', grid: c.grid, model: c.model, text: c.text }); });
        list.push({ align: 'left', grid: 'auto', model: 'auto', text: convertPaste(state.source, convOpts({ align: 'left' })).text });
        var seen = {};
        return list.filter(function (x) { if (seen[x.text]) return false; seen[x.text] = 1; return true; });
      }
      function applyLayout(x) {
        state.align = x.align; state.grid = x.grid; state.model = x.model;
        recompute(); paintStatus(); saveDraft();
      }
      var flip = el('button', { type: 'button', class: 'lab-btn lab-btn--ghost lab-add-flip', hidden: true, onclick: function () {
        var list = layouts();
        if (list.length < 2) { L.toast('לא מצאנו סידור אחר לשיר הזה. אפשר לתקן אקורד בנגיעה בשלב הבא.'); return; }
        var cur = -1;
        list.forEach(function (x, i) { if (cur < 0 && x.text === conv.text) cur = i; });
        var prev = layoutOf(state), prevManual = state.layoutManual, next = list[(cur + 1) % list.length];
        state.layoutManual = true;
        applyLayout(next);
        L.toast('סידור ' + ((cur + 1) % list.length + 1) + ' מתוך ' + list.length + '. בדקו למטה אם האקורדים במקום', { action: 'בטל', onAction: function () { state.layoutManual = prevManual; applyLayout(prev); } });
      } }, [el('span', { text: 'האקורדים לא במקום? נסו סידור אחר ⇄' })]);

      stage.appendChild(accepted);
      stage.appendChild(label);
      stage.appendChild(status);
      stage.appendChild(flip);
      stage.appendChild(mini);
      var noteSlot = el('div', { class: 'lab-add-copyslot' });
      stage.appendChild(noteSlot);
      function paintNote() { noteSlot.innerHTML = ''; var n = copyNote(); if (n) noteSlot.appendChild(n); }

      function paintStatus() {
        status.className = 'lab-add-status';
        flip.hidden = true; mini.innerHTML = '';
        if (conv.format === 'empty') { status.textContent = ''; return; }
        var lineCount = state.raw.split('\n').filter(function (l) { return l.trim(); }).length;
        var n = conv.chords;
        if (conv.format === 'chords-over' || conv.format === 'mixed') {
          status.textContent = 'זיהינו ' + plural(n, 'אקורד אחד', 'אקורדים') + ' ושמנו ' + (n === 1 ? 'אותו' : 'אותם') + ' במקום ✓';
          status.classList.add('is-ok');
          if (conv.pairs) flip.hidden = false;
          paintMini();
        } else if (conv.format === 'brackets') {
          status.textContent = 'האקורדים כבר בסוגריים (' + plural(n, 'אקורד אחד', 'אקורדים') + '). השארנו אותם כמו שהם ✓';
          status.classList.add('is-ok');
          paintMini();
        } else {
          status.textContent = 'קיבלנו ' + plural(lineCount, 'שורה אחת', 'שורות') + ' של מילים. את האקורדים מוסיפים בשלב הבא.';
        }
      }
      // a small preview of the first lines that have chords, so you can see whether the alignment is right
      function paintMini() {
        var toks = L.parse(state.raw), lines = [[]];
        toks.forEach(function (t) { if (t.type === 'newline') lines.push([]); else lines[lines.length - 1].push(t); });
        var shown = 0;
        mini.appendChild(el('div', { class: 'lab-add-mini-cap', text: 'כך זה ייראה:' }));
        lines.some(function (ln) {
          if (!ln.some(function (t) { return t.chord; })) return false;
          var row = el('div', { class: 'lab-cs-line' });
          ln.forEach(function (t) {
            if (t.type === 'space') { row.appendChild(el('span', { class: 'lab-cs-space' })); return; }
            row.appendChild(el('span', { class: 'lab-cs-word lab-add-mini-word' + (t.chord ? ' has-chord' : '') }, [
              el('span', { class: 'lab-cs-chord', text: t.chord || ' ' }),
              el('span', { class: 'lab-cs-text', text: t.text || '♪' })
            ]));
          });
          mini.appendChild(row);
          return ++shown >= 3;
        });
      }

      // the measure font (Open Sans) is requested lazily; a paste waits for it up to 1.5 s, then converts with what is there
      var onInput = L.debounce(function () {
        function run() { recompute(); paintStatus(); saveDraft(); }
        if (!measure || fonts.state() === 'ready' || fonts.state() === 'failed' || !state.source.trim()) { run(); return; }
        if (!status.textContent) { status.className = 'lab-add-status'; status.textContent = 'מזהים את האקורדים…'; }
        fonts.whenReady(1500).then(run);
      }, 350);
      // the font arrived after a conversion with the fallback font → convert once more (not after a hand-picked layout or chord edits)
      fontHook = function () {
        if (state.layoutManual || state.dirty || !state.source.trim() || state.step !== 1) return;
        var before = conv.text;
        recompute();
        if (conv.text !== before) { paintStatus(); saveDraft(); }
      };
      ta.addEventListener('input', function (e) {
        hideResume();
        var fresh = (e && (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop')) || (!state.source.trim() && ta.value.trim());
        // a new paste starts from the automatic layout again (a layout picked by hand belonged to the previous text)
        if (fresh) {
          state.align = 'right'; state.grid = 'auto'; state.model = 'auto'; state.layoutManual = false;
          // copy signs are read from the RAW pasted text (before the cleaning strips invisible characters). A paste into
          // existing text keeps the earlier signs too; typing does not re-detect (the text we hold has been cleaned)
          var found = detectCopySig(ta.value);
          state.copySig = state.source.trim() ? mergeCopySig(state.copySig, found) : found;
          paintNote();
        } else if (!ta.value.trim()) { state.copySig = emptyCopySig(); paintNote(); }
        state.source = ta.value;
        fieldError(label, 'lab-add-lyrics-err', null);
        onInput();
      });
      recompute(); paintStatus(); paintNote();

      setCta([el('button', { type: 'button', class: 'lab-btn lab-btn--primary lab-btn--block', text: 'הבא: הוספת אקורדים ←', onclick: function () {
        state.source = ta.value; recompute();
        if (!state.raw.trim()) {
          fieldError(label, 'lab-add-lyrics-err', 'כתבו או הדביקו לפחות שורה אחת של השיר');
          focusInvalid(ta);
          return;
        }
        go(2);
      } })]);
    }

    /* ════════ Step 2: chords ════════ */
    function renderStep2() {
      stage.appendChild(el('h2', { class: 'lab-title', tabindex: '-1', text: 'שימו אקורדים על המילים' }));
      // F5a: the explanation collapses to one tappable line once a chord exists (or when the song already has chords)
      var explain = el('div', { class: 'lab-add-explain' }, [
        el('p', { class: 'lab-sub', text: 'נגעו במילה ובחרו אקורד. נגעו באקורד שכבר שמתם כדי להחליף, להזיז או למחוק אותו.' })
      ]);
      var howto = el('button', { type: 'button', class: 'lab-add-howto', hidden: true, 'aria-expanded': 'false', onclick: function () {
        var open = explain.hidden;            // currently collapsed → expand
        explain.hidden = !open;
        howto.setAttribute('aria-expanded', open ? 'true' : 'false');
        howto.classList.toggle('is-open', open);
      } }, [el('span', { text: 'איך זה עובד?' }), el('span', { class: 'lab-add-chev', 'aria-hidden': 'true', text: '›' })]);
      var autoCollapsed = false;
      function collapseExplain() {
        if (autoCollapsed) return;           // once per visit: a manual expand is respected
        autoCollapsed = true;
        explain.hidden = true; howto.hidden = false;
        howto.setAttribute('aria-expanded', 'false'); howto.classList.remove('is-open');
      }
      stage.appendChild(explain);
      stage.appendChild(howto);

      var n0 = chordCount(state.raw);
      if (n0 && !state.dirty && (conv.format === 'chords-over' || conv.format === 'mixed')) {
        stage.appendChild(el('p', { class: 'lab-add-status is-ok', text: 'שמנו ' + plural(n0, 'אקורד אחד', 'אקורדים') + ' מההדבקה. בדקו שהם במקום, ותקנו בנגיעה.' }));
      }
      if (n0) collapseExplain();
      var hint = L.hint('add-tap', 'נגעו במילה כדי להוסיף מעליה אקורד', '👆');
      if (hint) stage.appendChild(hint);

      var undoBtn = el('button', { type: 'button', class: 'lab-btn lab-add-tool lab-add-undo', 'aria-label': 'ביטול פעולה', disabled: true, text: '↶ ביטול פעולה', onclick: function () { if (cs) cs.undo(); } });
      var prevBtn = el('button', { type: 'button', class: 'lab-btn lab-add-tool', 'aria-pressed': 'false', text: '👁 תצוגה מקדימה' });
      // F1: text mode — only when the component is loaded
      var textBtn = (typeof L.TextMode === 'function')
        ? el('button', { type: 'button', class: 'lab-btn lab-btn--ghost lab-add-tool lab-add-tool--quiet', text: 'עריכת טקסט', onclick: function () { openTextMode(); } })
        : null;
      var noChordErr = el('div', { class: 'lab-error', hidden: true, role: 'alert' });
      var undoGrp = el('div', { class: 'lab-add-undogrp' }, [undoBtn]);   // undo + (when the core offers it) redo
      var toolbar = el('div', { class: 'lab-add-toolbar' }, [undoGrp, prevBtn, textBtn]);
      stage.appendChild(toolbar);
      stage.appendChild(noChordErr);

      var csHost = el('div', { class: 'lab-add-cshost' });
      var tmHost = el('div', { class: 'lab-add-tmhost', hidden: true });
      var prevBox = el('div', { class: 'lab-add-preview', hidden: true, 'aria-live': 'polite' });
      stage.appendChild(csHost);
      stage.appendChild(tmHost);
      stage.appendChild(prevBox);

      // one place that every content change goes through (tap edits and text-mode apply alike)
      function afterChange(raw) {
        state.raw = raw; state.dirty = true;
        undoBtn.disabled = !(cs && cs.canUndo());
        noChordErr.hidden = true;
        if (chordCount(raw)) collapseExplain();   // fallback when the core has no onFirstChord
        // the hint has done its job after the first chord
        var h = stage.querySelector('.uc-lab-hint');
        if (h) { try { localStorage.setItem('uc_lab_hint_add-tap', '1'); } catch (e) {} h.remove(); csHost.classList.remove('is-hinting'); }
        saveDraft();
      }
      var redoBtn = null;
      function mountCs(raw) {
        csHost.innerHTML = '';
        cs = L.ChordStep(csHost, { raw: raw, onChange: afterChange, onFirstChord: collapseExplain });
        // redo button from the core (hides itself when there is nothing to redo); absent in an older core
        if (redoBtn) redoBtn.remove();
        redoBtn = (typeof cs.redoButton === 'function') ? cs.redoButton({ class: 'lab-btn lab-add-tool lab-add-redo' }) : null;
        if (redoBtn) redoBtn.setAttribute('aria-label', 'חזור על הפעולה');
        if (redoBtn) undoGrp.appendChild(redoBtn);
      }
      mountCs(state.raw);
      if (hint) {
        csHost.classList.add('is-hinting');
        var firstW = csHost.querySelector('.lab-cs-word');
        if (firstW) firstW.classList.add('lab-add-pulse');
      }

      // replace the whole content (text-mode apply / its undo). Prefers the core's setRaw, otherwise re-creates the ChordStep.
      function replaceRaw(raw, undoable) {
        if (cs && typeof cs.setRaw === 'function') { cs.setRaw(raw, { undoable: !!undoable }); if (typeof cs.getRaw === 'function' && cs.getRaw() !== raw) { mountCs(raw); } }
        else mountCs(raw);
        afterChange(cs && typeof cs.getRaw === 'function' ? cs.getRaw() : raw);
      }
      function closeTextMode() {
        if (tm && typeof tm.destroy === 'function') { try { tm.destroy(); } catch (e) {} }
        tm = null; tmHost.innerHTML = ''; tmHost.hidden = true;
        csHost.hidden = false; toolbar.hidden = false;
        cta.style.display = ''; liftCta();
      }
      function openTextMode() {
        if (tm || typeof L.TextMode !== 'function') return;
        if (L.sheet.isOpen()) L.sheet.close(true);
        if (!prevBox.hidden) prevBtn.click();                 // leave the preview first
        document.querySelectorAll('.uc-lab-toast').forEach(function (t) { t.remove(); });   // a stale chord toast would undo into a hidden editor
        var before = (cs && typeof cs.getRaw === 'function') ? cs.getRaw() : state.raw;
        csHost.hidden = true; toolbar.hidden = true; noChordErr.hidden = true;
        cta.style.display = 'none';                             // the text editor has its own apply / cancel
        tmHost.hidden = false;
        tm = L.TextMode(tmHost, {
          raw: before,
          onApply: function (newRaw) {
            closeTextMode();
            if (typeof newRaw !== 'string' || newRaw === before) return;
            replaceRaw(newRaw, true);
            L.toast('הטקסט עודכן', { action: 'בטל', onAction: function () {
              var undone = false;
              if (cs && typeof cs.canUndo === 'function' && cs.canUndo() && typeof cs.undo === 'function') {
                cs.undo();
                undone = (typeof cs.getRaw === 'function' && cs.getRaw() === before);
              }
              if (undone) afterChange(cs.getRaw()); else replaceRaw(before, false);
            } });
            window.scrollTo({ top: Math.max(0, rootEl.getBoundingClientRect().top + window.scrollY - 12), behavior: 'auto' });
          },
          onCancel: function () { closeTextMode(); }
        });
        var f = tmHost.querySelector('textarea');
        if (f && window.matchMedia && window.matchMedia('(pointer: fine)').matches) f.focus({ preventScroll: true });
      }

      var loadPreview = L.debounce(function () {
        L.preview(state.raw, state.title, state.performer)
          .then(function (html) { prevBox.innerHTML = html; })
          .catch(function () { prevBox.textContent = 'לא הצלחנו לטעון תצוגה מקדימה. אפשר להמשיך כרגיל.'; });
      }, 600);
      prevBtn.addEventListener('click', function () {
        var on = prevBox.hidden;
        prevBox.hidden = !on; csHost.hidden = on;
        prevBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        prevBtn.textContent = on ? '✎ חזרה לעריכה' : '👁 תצוגה מקדימה';
        undoGrp.hidden = on;
        if (on) { prevBox.textContent = 'טוען תצוגה…'; loadPreview(); }
      });

      setCta([
        el('button', { type: 'button', class: 'lab-btn lab-btn--ghost', text: '→ חזרה', onclick: function () { go(1); } }),
        el('button', { type: 'button', class: 'lab-btn lab-btn--primary', text: 'הבא: פרטים ושליחה ←', onclick: function () {
          if (!chordCount(state.raw) && !noChordWarned) {
            noChordWarned = true;
            noChordErr.textContent = 'עוד לא הוספתם אקורדים. נגעו במילה כדי להוסיף, או לחצו שוב על "הבא" כדי להמשיך בלי.';
            noChordErr.hidden = false;
            focusInvalid(noChordErr);
            return;
          }
          go(3);
        } })
      ]);
    }

    /* ════════ Step 3: details and submit ════════ */
    var ARTISTS = (D.artists || []).slice();
    function norm(s) {
      return String(s || '').toLowerCase()
        .replace(/[֑-ׇ]/g, '').replace(/['"`׳״]/g, '')
        .replace(/[-–—_.,]/g, ' ')
        .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
        .replace(/\s+/g, ' ').trim();
    }
    var ART_N = ARTISTS.map(norm);
    function matchArtists(q) {
      q = norm(q);
      if (!q) return [];
      var out = [];
      ART_N.forEach(function (n, i) {
        var score = n === q ? 0 : n.indexOf(q) === 0 ? 1 : (' ' + n).indexOf(' ' + q) >= 0 ? 2 : n.indexOf(q) >= 0 ? 3 : 9;
        if (score < 9) out.push({ name: ARTISTS[i], score: score });
      });
      return out.sort(function (a, b) { return a.score - b.score || a.name.length - b.name.length; }).slice(0, 6);
    }
    function isKnownArtist(v) { var n = norm(v); return !!n && ART_N.indexOf(n) >= 0; }

    function input(id, attrs) { return el('input', Object.assign({ id: id, type: 'text', autocomplete: 'off' }, attrs || {})); }

    function renderStep3() {
      stage.appendChild(el('h2', { class: 'lab-title', tabindex: '-1', text: 'כמעט סיימנו' }));
      stage.appendChild(el('p', { class: 'lab-sub', text: NB ? 'שם השיר חובה. מבצע/ת חובה רק אם מציעים לפרסום באתר.' : 'שני פרטים חובה, וכל השאר רק אם בא לכם.' }));

      /* title */
      var tIn = input('lab-add-title', { required: true, enterkeyhint: 'next' });
      tIn.value = state.title;
      var tLab = el('label', { class: 'lab-field', for: 'lab-add-title' }, [el('span', { text: 'שם השיר' }), tIn]);
      tIn.addEventListener('input', function () { state.title = tIn.value; fieldError(tLab, 'lab-add-title-err', null); saveDraft(); });

      /* performer + autocomplete */
      var pIn = input('lab-add-performer', { required: !NB, role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'lab-add-artists', enterkeyhint: 'done' });
      pIn.value = state.performer;
      var list = el('div', { id: 'lab-add-artists', class: 'lab-add-suggest', role: 'listbox', hidden: true });
      var newNote = el('small', { class: 'lab-add-newartist', hidden: true, text: 'אמן חדש. יתווסף לאתר אחרי אישור העורכים.' });
      var pLab = el('div', { class: 'lab-field' }, [
        el('label', { for: 'lab-add-performer' }, [el('span', { text: 'מבצע/ת' })]),
        pIn, list,
        el('small', { text: 'התחילו להקליד ובחרו מהרשימה. אמן שעוד לא באתר? פשוט כתבו את השם.' }),
        newNote
      ]);
      function paintSuggest() {
        var m = matchArtists(pIn.value);
        list.innerHTML = '';
        var exact = m.length && norm(m[0].name) === norm(pIn.value);
        if (!m.length || (exact && m.length === 1)) { list.hidden = true; pIn.setAttribute('aria-expanded', 'false'); }
        else {
          m.forEach(function (a) {
            list.appendChild(el('button', { type: 'button', role: 'option', class: 'lab-add-suggest-item', text: a.name, onmousedown: function (e) { e.preventDefault(); }, onclick: function () {
              pIn.value = a.name; state.performer = a.name; list.hidden = true; pIn.setAttribute('aria-expanded', 'false');
              paintNew(); fieldError(pLab, 'lab-add-performer-err', null); saveDraft();
            } }));
          });
          list.hidden = false; pIn.setAttribute('aria-expanded', 'true');
        }
        paintNew();
      }
      function paintNew() { newNote.hidden = !(norm(pIn.value).length >= 2 && !isKnownArtist(pIn.value)); }
      pIn.addEventListener('input', function () { state.performer = pIn.value; fieldError(pLab, 'lab-add-performer-err', null); paintSuggest(); saveDraft(); });
      pIn.addEventListener('focus', paintSuggest);
      pIn.addEventListener('blur', function () { setTimeout(function () { list.hidden = true; pIn.setAttribute('aria-expanded', 'false'); }, 150); });
      paintNew();

      stage.appendChild(tLab);
      stage.appendChild(pLab);

      /* more details (collapsed) */
      var more = el('details', { class: 'lab-add-more' });
      if (state.moreOpen) more.open = true;
      more.addEventListener('toggle', function () { state.moreOpen = more.open; saveDraft(); });
      more.appendChild(el('summary', { class: 'lab-add-more-sum' }, [el('span', { text: 'פרטים נוספים (לא חובה)' }), el('span', { class: 'lab-add-chev', 'aria-hidden': 'true', text: '›' })]));
      var mb = el('div', { class: 'lab-add-more-body' });
      more.appendChild(mb);

      // genres (the private notebook keeps only title, performer, capo and the text)
      if (!NB && (D.genres || []).length) {
        var gWrap = el('div', { class: 'lab-chips lab-add-genres', role: 'group', 'aria-label': 'ז\'אנר' });
        D.genres.forEach(function (g) {
          var on = state.genres.indexOf(g) >= 0;
          var b = el('button', { type: 'button', class: 'lab-chip lab-add-chip' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false', text: g, onclick: function () {
            var i = state.genres.indexOf(g);
            if (i >= 0) state.genres.splice(i, 1); else state.genres.push(g);
            b.classList.toggle('is-on', i < 0); b.setAttribute('aria-pressed', i < 0 ? 'true' : 'false'); saveDraft();
          } });
          gWrap.appendChild(b);
        });
        mb.appendChild(el('div', { class: 'lab-field' }, [el('span', { text: 'סגנון (ז\'אנר)' }), el('small', { class: 'lab-add-pre', text: 'אפשר לבחור יותר מאחד.' }), gWrap]));
      }

      // capo
      var capoWrap = el('div', { class: 'lab-chips lab-add-capo', role: 'radiogroup', 'aria-label': 'קאפו' });
      for (var c = 0; c <= 12; c++) {
        (function (v) {
          var b = el('button', { type: 'button', role: 'radio', class: 'lab-chip lab-add-chip' + (String(v) === state.capo ? ' is-on' : ''), 'aria-checked': String(v) === state.capo ? 'true' : 'false', text: v === 0 ? 'בלי' : String(v), onclick: function () {
            state.capo = String(v);
            capoWrap.querySelectorAll('.lab-chip').forEach(function (n) { n.classList.remove('is-on'); n.setAttribute('aria-checked', 'false'); });
            b.classList.add('is-on'); b.setAttribute('aria-checked', 'true'); saveDraft();
          } });
          capoWrap.appendChild(b);
        })(c);
      }
      mb.appendChild(el('div', { class: 'lab-field' }, [el('span', { text: 'קאפו' }),
        el('small', { class: 'lab-add-pre', text: 'קאפו הוא מהדק ששמים על צוואר הגיטרה. אם מנגנים את השיר בלי, השאירו "בלי".' }), capoWrap]));

      // writers
      var yt = null, tempo = null;
      function textField(id, key, label, help, attrs) {
        var i = input(id, attrs); i.value = state[key] || '';
        i.addEventListener('input', function () { state[key] = i.value; fieldError(lab, id + '-err', null); saveDraft(); });
        var lab = el('label', { class: 'lab-field', for: id }, [el('span', { text: label }), i, help && el('small', { text: help })]);
        mb.appendChild(lab);
        return { input: i, label: lab };
      }
      if (!NB) textField('lab-add-lyricsby', 'lyrics_by', 'מילים', 'מי כתב את המילים. חשוב לקרדיט ליוצרים.');
      if (!NB) textField('lab-add-musicby', 'music_by', 'לחן', 'מי הלחין.');
      if (!NB) yt = textField('lab-add-youtube', 'youtube', 'קישור לשיר ביוטיוב', 'עוזר לנגנים לשמוע איך השיר הולך.', { type: 'url', dir: 'ltr', inputmode: 'url', placeholder: 'https://youtu.be/…' });

      // level (only if the server provides levels)
      var LV_ORDER = ['קל ממש', 'קל', 'בינוני', 'קשה', 'מתקדם'];   // easy → hard (WP returns them sorted by name)
      var levels = (D.levels || []).slice().sort(function (a, b) {
        var ia = LV_ORDER.indexOf(a.name || String(a)), ib = LV_ORDER.indexOf(b.name || String(b));
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      if (!NB && levels.length) {
        var lvWrap = el('div', { class: 'lab-chips', role: 'radiogroup', 'aria-label': 'רמת קושי' });
        levels.forEach(function (lv) {
          var id = String(lv.id != null ? lv.id : lv), name = lv.name || String(lv);
          var b = el('button', { type: 'button', role: 'radio', class: 'lab-chip lab-add-chip' + (state.level === id ? ' is-on' : ''), 'aria-checked': state.level === id ? 'true' : 'false', text: name, onclick: function () {
            state.level = state.level === id ? '' : id;
            lvWrap.querySelectorAll('.lab-chip').forEach(function (n) { n.classList.remove('is-on'); n.setAttribute('aria-checked', 'false'); });
            if (state.level) { b.classList.add('is-on'); b.setAttribute('aria-checked', 'true'); }
            saveDraft();
          } });
          lvWrap.appendChild(b);
        });
        mb.appendChild(el('div', { class: 'lab-field' }, [el('span', { text: 'רמת קושי' }), el('small', { class: 'lab-add-pre', text: 'כמה קשה לנגן את השיר. נגיעה נוספת מבטלת.' }), lvWrap]));
      }

      if (!NB) tempo = textField('lab-add-tempo', 'tempo', 'קצב (BPM)', 'כמה פעימות בדקה. לא בטוחים? השאירו ריק.', { inputmode: 'numeric', dir: 'ltr' });
      if (!NB) textField('lab-add-strum', 'strumming', 'פריטה', 'הדפוס שהיד מכה במיתרים. למשל: ↓ ↓ ↑ ↑ ↓ ↑ (למטה=D, למעלה=U).', { dir: 'ltr' });
      /* easy version (add only; collapsed inside "more details") */
      var easyTa = null, easySel = null, easyLab = null, easyDet = null;
      function easyAllow() { return (L.TextMode && typeof L.TextMode.foreignTokens === 'function') ? L.TextMode.foreignTokens(state.raw) : []; }
      // null = fine / empty; otherwise the message to show under the box
      function easyProblem(value) {
        if (!String(value || '').trim() || !L.TextMode || typeof L.TextMode.process !== 'function') return null;
        var res = L.TextMode.process(value, { allow: easyAllow() });
        if (res.ok) return null;
        var first = res.errors[0] && res.errors[0].msg ? res.errors[0].msg : 'יש בטקסט משהו שלא הבנו';
        return first + (res.errors.length > 1 ? ' (ועוד ' + (res.errors.length - 1) + ')' : '');
      }
      if (!NB) {
        easyTa = el('textarea', { id: 'lab-add-easy', name: 'version_easy', dir: 'rtl', rows: '6', spellcheck: 'false', autocomplete: 'off', 'aria-describedby': 'lab-add-easy-help', placeholder: 'למשל:\nשלום[C] עולם[G]' });
        easyTa.value = state.versionEasy || '';
        easyTa.addEventListener('input', function () { state.versionEasy = easyTa.value; fieldError(easyTa, 'lab-add-easy-err', null); saveDraft(); });
        easyTa.addEventListener('blur', function () { fieldError(easyTa, 'lab-add-easy-err', easyProblem(easyTa.value)); });
        var opts = [];
        for (var q = -6; q <= 6; q++) {
          var v = q / 2, a = Math.abs(v);
          var lbl = v === 0 ? 'בלי הזזה' : (v > 0 ? '+' : '−') + (a === 1 ? 'טון' : a + ' טונים');
          opts.push(el('option', { value: String(v), text: lbl }));
        }
        easySel = el('select', { id: 'lab-add-easytr', name: 'easy_transpose', class: 'lab-add-select' }, opts);
        easySel.value = String(state.easyTranspose == null ? '0' : state.easyTranspose);
        if (easySel.value !== String(state.easyTranspose)) easySel.value = '0';
        easySel.addEventListener('change', function () { state.easyTranspose = easySel.value; saveDraft(); });
        easyLab = el('label', { class: 'lab-field', for: 'lab-add-easy' }, [
          el('span', { text: 'מילים ואקורדים לגרסה הקלה' }), easyTa,
          el('small', { id: 'lab-add-easy-help', text: 'אפשר לכתוב כאן גרסה עם אקורדים פשוטים יותר. אם משאירים ריק, אין גרסה קלה.' })
        ]);
        easyDet = el('details', { class: 'lab-add-easy' });
        if (state.easyOpen || (state.versionEasy || '').trim()) easyDet.open = true;
        easyDet.addEventListener('toggle', function () { state.easyOpen = easyDet.open; saveDraft(); });
        easyDet.appendChild(el('summary', { class: 'lab-add-more-sum' }, [el('span', { text: 'גרסה קלה למתחילים (לא חובה)' }), el('span', { class: 'lab-add-chev', 'aria-hidden': 'true', text: '›' })]));
        easyDet.appendChild(el('div', { class: 'lab-add-easy-body' }, [
          easyLab,
          el('div', { class: 'lab-field' }, [
            el('label', { for: 'lab-add-easytr' }, [el('span', { text: 'הזזת טונים בגרסה הקלה' })]),
            easySel,
            el('small', { text: 'אם הגרסה הקלה בטון אחר מהמקור. לא בטוחים? השאירו "בלי הזזה".' })
          ])
        ]));
        mb.appendChild(easyDet);
      }
      stage.appendChild(more);

      /* consent */
      var cBox = el('input', { type: 'checkbox', id: 'lab-add-consent' });
      cBox.checked = !!state.consent;
      var cRow = el('label', { class: 'lab-add-consent', for: 'lab-add-consent' }, [cBox, el('span', { text: D.consent || 'בשליחת השיר אני מאשר שהתמלול הוא עבודה שלי, ומשחרר אותו לשימוש חופשי תחת הרישיון של האתר.' })]);
      cBox.addEventListener('change', function () { state.consent = cBox.checked; fieldError(cRow, 'lab-add-consent-err', null); saveDraft(); });
      stage.appendChild(el('h3', { class: 'lab-add-h3', text: 'רגע לפני השליחה' }));
      var note3 = copyNote(); if (note3) stage.appendChild(note3);
      stage.appendChild(cRow);
      stage.appendChild(el('p', { class: 'lab-add-note', text: NB
        ? 'שמירה: נשארת במחברת הפרטית שלכם, בלי אישור ובלי פרסום (וגם בלי צורך בהסכמה למעלה). הצעה לפרסום: עורכי האתר יעברו על השיר, וצריך לסמן את ההסכמה ולמלא מבצע/ת.'
        : 'שלח לפרסום באתר: עורכי האתר יעברו על השיר ויפרסמו אותו לכולם. שמור רק לעצמי: נשמר במחברת הפרטית שלכם, בלי אישור ובלי פרסום (וגם בלי צורך בהסכמה למעלה).' }));

      function validate(publish) {
        var first = null;
        function bad(node, anchor, id, msg) { fieldError(anchor, id, msg); if (!first) first = node; }
        ['lab-add-title-err', 'lab-add-performer-err', 'lab-add-consent-err', 'lab-add-youtube-err', 'lab-add-tempo-err', 'lab-add-easy-err'].forEach(function (id) { var n = document.getElementById(id); if (n) n.remove(); });
        if (!state.title.trim()) bad(tIn, tLab, 'lab-add-title-err', 'מה שם השיר?');
        if (publish && !state.performer.trim()) bad(pIn, pLab, 'lab-add-performer-err', 'מי מבצע את השיר? אפשר גם אמן חדש.');
        if (yt && state.youtube.trim() && !/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/\S+/i.test(state.youtube.trim())) {
          more.open = true; bad(yt.input, yt.label, 'lab-add-youtube-err', 'זה לא נראה כמו קישור ליוטיוב. אפשר גם להשאיר ריק.');
        }
        if (tempo && state.tempo.trim() && !(/^\d{2,3}$/.test(state.tempo.trim()) && +state.tempo >= 30 && +state.tempo <= 300)) {
          more.open = true; bad(tempo.input, tempo.label, 'lab-add-tempo-err', 'מספר בין 30 ל-300, או להשאיר ריק.');
        }
        // the easy version is only checked when the add-song form really sends it
        var ep = (!NB && publish && easyTa) ? easyProblem(easyTa.value) : null;
        if (ep) { more.open = true; easyDet.open = true; bad(easyTa, easyTa, 'lab-add-easy-err', ep); }
        if (publish && !state.consent) bad(cBox, cRow, 'lab-add-consent-err', 'כדי לפרסם באתר צריך לסמן את ההסכמה.');
        if (first) focusInvalid(first);
        return !first;
      }

      // fields exactly as the server handlers read them
      step3Fields = function (kind) {
        if (kind === 'notebook_save' || kind === 'notebook_publish') {
          var n = { personal_id: PID, title: state.title.trim(), performer: state.performer.trim(), capo: state.capo, version_normal: state.raw };
          if (kind === 'notebook_publish') n.license_consent = '1';
          return n;
        }
        var f = {
          title: state.title.trim(), performer: state.performer.trim(),
          lyrics_by: state.lyrics_by.trim(), music_by: state.music_by.trim(),
          capo: state.capo, youtube: state.youtube.trim(), tempo: state.tempo.trim(), strumming: state.strumming.trim(),
          version_normal: state.raw, 'song_genres[]': state.genres.slice(),
          easy_transpose: String(state.easyTranspose == null || state.easyTranspose === '' ? '0' : state.easyTranspose)   // always, like the old form
        };
        if (state.level) f.song_level = parseInt(state.level, 10);
        var ev = String(state.versionEasy || '');
        if (ev.trim()) {                                    // only when filled; the same cleaning as text mode
          var pr = (L.TextMode && typeof L.TextMode.process === 'function') ? L.TextMode.process(ev, { allow: easyAllow() }) : null;
          f.version_easy = pr && pr.ok ? pr.raw : ev.trim();
        }
        var csf = copySignalsField(state.copySig);   // for the reviewer; the private save does not need it
        if (csf) f.copy_signals = csf;
        f.license_consent = '1';
        return f;
      };

      noticeHost = el('div', { class: 'lab-add-noticehost' });
      stage.appendChild(noticeHost);
      function btn(kind, cls, text) {
        var b = el('button', { type: 'button', class: cls, 'data-kind': kind, text: text, onclick: function () {
          if (sending || sent) return;
          if (!validate(kind !== 'notebook_save')) return;
          submit(kind, b);
        } });
        return b;
      }
      var secondaryBtn, primaryBtn;
      if (NB) {
        secondaryBtn = btn('notebook_publish', 'lab-btn lab-add-secondary', 'הצע לפרסום באתר');
        primaryBtn = btn('notebook_save', 'lab-btn lab-btn--primary', PID ? 'שמור שינויים' : 'שמור במחברת');
      } else {
        secondaryBtn = btn('notebook_save', 'lab-btn lab-add-secondary', 'שמור רק לעצמי');
        primaryBtn = btn('add_song', 'lab-btn lab-btn--primary', 'שלח לפרסום באתר');
      }
      step3Btns = [secondaryBtn, primaryBtn];
      setCta(step3Btns);
    }

    /* ════════ Sending ════════ */
    var step3Btns = [], step3Fields = null, noticeHost = null;
    var cfg = {
      add_song: { action: 'achord_submit_song', busy: 'שולחים…', ok: 'השיר הועלה בהצלחה ונשלח לבדיקה!' },
      notebook_save: { action: 'achord_notebook_save_song', busy: 'שומרים…', ok: 'השיר נשמר במחברת.' },
      notebook_publish: { action: 'achord_notebook_publish_song', busy: 'שולחים…', ok: 'נשלח לאישור. הגרסה שלך שמורה במחברת.' }
    };
    function api() { return L.api && typeof L.api.send === 'function' ? L.api : null; }
    function isReal() { var a = api(); return !!(a && a.real); }
    function loggedIn() { var a = api(); if (a && typeof a.loggedIn === 'boolean') return a.loggedIn; return !!D.loggedIn || !!D.personalNonce; }

    // button lock: the core's busy when it exists, else a plain disabled + text swap
    function lockBtn(b, on, text) {
      if (!b) return;
      if (typeof L.busy === 'function') { L.busy(b, on, text); return; }
      if (on) { b.dataset.labText = b.textContent; b.disabled = true; b.setAttribute('aria-busy', 'true'); if (text) b.textContent = text; }
      else { b.disabled = false; b.removeAttribute('aria-busy'); if (b.dataset.labText != null) { b.textContent = b.dataset.labText; delete b.dataset.labText; } }
    }
    function lockAll(on, active, text) {
      step3Btns.forEach(function (b) { if (!b) return; if (b === active) lockBtn(b, on, text); else b.disabled = on; });
    }

    // one status line above the buttons (inside the sticky CTA, so it is always in view)
    function showNotice(o) {
      if (!noticeHost) return;
      clearTimeout(focusScroll);                  // a pending "centre the focused field" must not scroll the line away
      if (typeof L.notice === 'function') { L.notice(noticeHost, o); }
      else {
      clearNotice();
      var kids = [el('span', { class: 'lab-notice-ico', 'aria-hidden': 'true', text: o.kind === 'ok' ? '✓' : o.kind === 'error' ? '!' : 'i' }), el('p', { class: 'lab-notice-text', text: o.text })];
      var acts = [];
      if (o.retry) acts.push(el('button', { type: 'button', class: 'lab-notice-act', text: o.retryText || 'נסו שוב', onclick: o.retry }));
      if (o.login && D.loginUrl) acts.push(el('a', { class: 'lab-notice-act', href: D.loginUrl, text: 'התחברו' }));
      if (o.reload) acts.push(el('button', { type: 'button', class: 'lab-notice-act', text: 'רענון הדף', onclick: function () { window.location.reload(); } }));
      if (acts.length) kids.push(el('div', { class: 'lab-notice-acts' }, acts));
      noticeHost.appendChild(el('div', { class: 'uc-lab-notice uc-lab-notice--' + o.kind, role: o.kind === 'error' ? 'alert' : 'status' }, kids));
      }
      var shown = noticeHost.firstChild;
      // after layout settles (the buttons just changed): bring the line to the middle of the screen, above the sticky buttons
      if (shown && shown.scrollIntoView) setTimeout(function () { try { shown.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) { shown.scrollIntoView(); } }, 30);
    }
    function clearNotice() { if (noticeHost) noticeHost.innerHTML = ''; }
    function explainOf(r) {
      if (typeof L.explain === 'function') { try { var x = L.explain(r); if (x && x.text) return x; } catch (e) {} }
      var m = String(r && r.message || '');
      if (r && r.network) return { text: m || 'אין חיבור כרגע. מה שכתבתם לא נמחק. נסו שוב.', retry: true, login: false };
      if (m === 'שגיאת אבטחה.') return { text: 'הדף פתוח הרבה זמן. הטיוטה שמורה. רעננו את הדף והמשיכו.', retry: false, login: false, reload: true };
      return { text: m || 'משהו השתבש. נסו שוב.', retry: true, login: /יש להתחבר/.test(m) };
    }

    // the one place that talks to the server (UCLab.api when the core has it; otherwise today's demo sheet)
    function send(kind, f) {
      var c = cfg[kind], a = api();
      // a real page never shows the demo sheet: without a real api there is nothing to send to (looks like a lost connection, the draft stays)
      if (!LAB && !(a && a.real)) return Promise.resolve({ ok: false, network: true, message: '' });
      if (a) return a.send(c.action, f, { demoKind: kind, okText: c.ok, view: { title: f.title, performer: f.performer } });
      return new Promise(function (resolve) {
        L.demoSubmit(kind === 'notebook_publish' ? 'notebook_save' : kind, f, { onClose: function () { resolve({ ok: true, demo: true, message: c.ok }); }, title: f.title, performer: f.performer });
      });
    }

    function submit(kind, b) {
      if (sending || sent) return;
      var c = cfg[kind];
      clearNotice();
      // the notebook needs a signed-in user; say so before sending (the draft stays)
      if (kind !== 'add_song' && isReal() && !loggedIn()) {
        showNotice({ kind: 'error', text: 'כדי לשמור במחברת צריך להתחבר. מה שכתבתם לא נמחק.', login: true });
        return;
      }
      sending = true;
      lockAll(true, b, c.busy);
      var f = step3Fields(kind);
      var p;
      try { p = Promise.resolve(send(kind, f)); } catch (e) { p = Promise.resolve({ ok: false, network: true, message: '' }); }
      p.then(function (r) { return r || { ok: false, network: true, message: '' }; }, function () { return { ok: false, network: true, message: '' }; })
        .then(function (r) {
          sending = false;
          lockAll(false, b);
          if (r.ok) { onOk(kind, r); return; }
          var x = explainOf(r);
          var o = { kind: 'error', text: x.text };
          if (x.retry) { o.retry = function () { submit(kind, b); }; o.retryText = 'נסו שוב'; }
          if (x.login) o.login = true;
          if (x.reload) o.reload = true;
          showNotice(o);
        });
    }

    function stripTags(s) { return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
    function messageOf(kind, r) {
      var m = r.message ? String(r.message) : '';
      if (!m && typeof r.data === 'string') m = r.data;     // achord_submit_song answers with a plain string (an icon + text)
      return stripTags(m) || cfg[kind].ok;
    }
    function safeRedirect(u) {
      try {
        var url = new URL(String(u || ''), window.location.href);
        if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin === window.location.origin) return url.href;
      } catch (e) {}
      return D.notebookUrl || '';
    }

    function onOk(kind, r) {
      var demo = !!r.demo && LAB;                 // demo wording: the test page only
      var msg = messageOf(kind, r);
      var redirect = null;
      if (!demo) {
        sent = true; L.draft.clear(DK);                         // cleared only after the server said yes
        if (kind !== 'add_song') redirect = safeRedirect(r.data && r.data.redirect);
      }
      showDone(kind, msg, demo, redirect);
    }

    function showDone(kind, msg, demo, redirect) {
      stage.innerHTML = '';
      clearNotice();
      stepsOl.hidden = true;
      var notebookOp = kind !== 'add_song';
      stage.appendChild(el('div', { class: 'lab-add-done' }, [
        el('div', { class: 'lab-add-done-ico', 'aria-hidden': 'true', text: demo ? '🎉' : '✓' }),
        el('h2', { class: 'lab-title', tabindex: '-1', text: demo ? 'תודה! זה מה שהיה קורה' : 'תודה!' }),
        el('p', { class: 'lab-sub lab-add-done-msg', role: 'status', text: demo ? 'בעמוד הבדיקה לא נשמר כלום. באתר האמיתי השיר היה מחכה לאישור העורכים, ואתם הייתם מקבלים עדכון.' : msg }),
        !demo && kind === 'add_song' ? el('p', { class: 'lab-sub', text: 'עורכי האתר יעברו על השיר לפני הפרסום.' }) : null,
        redirect ? el('p', { class: 'lab-sub', text: 'מעבירים אתכם למחברת…' }) : null
      ]));
      var again = el('button', { type: 'button', class: 'lab-btn' + (!demo && notebookOp ? '' : ' lab-btn--primary'), text: 'הוספת שיר נוסף', onclick: function () {
        if (redirectTimer) { clearTimeout(redirectTimer); redirectTimer = null; }
        L.draft.clear(DK);
        state = Object.assign(state, blankState());
        sent = false; sending = false; noChordWarned = false; stepsOl.hidden = false; initialSnap = null; recompute(); go(1);
      } });
      var kids = [];
      if (demo) kids.push(el('button', { type: 'button', class: 'lab-btn lab-btn--ghost', text: '→ חזרה לשיר', onclick: function () { stepsOl.hidden = false; go(3); } }));
      if (!demo && notebookOp && (redirect || D.notebookUrl)) kids.push(el('a', { class: 'lab-btn lab-btn--primary', href: redirect || D.notebookUrl, text: 'למחברת' }));
      if (!(PID && !demo)) kids.push(again);
      setCta(kids);
      if (redirect) redirectTimer = setTimeout(function () { window.location.href = redirect; }, 1200);
      window.scrollTo({ top: Math.max(0, rootEl.getBoundingClientRect().top + window.scrollY - 12), behavior: 'auto' });
      stage.querySelector('h2').focus({ preventScroll: true });
    }

    /* ── resume from a draft ── */
    function hideResume() { if (!resumeBox.hidden) { resumeBox.hidden = true; draftPaused = false; } }
    var d = L.draft.load(DK);
    if (d && ((d.source || '').trim() || (d.raw || '').trim() || (d.title || '').trim())) {
      draftPaused = true;
      var what = (d.title || '').trim() ? '"' + d.title.trim() + '"' : 'שיר שהתחלתם';
      resumeBox.hidden = false;
      resumeBox.appendChild(el('p', null, [el('strong', { text: 'יש טיוטה: ' }), what + '. להמשיך מהטיוטה?']));
      resumeBox.appendChild(el('div', { class: 'lab-add-resume-row' }, [
        el('button', { type: 'button', class: 'lab-btn lab-btn--primary', text: 'להמשיך', onclick: function () {
          state = Object.assign(state, d, resumeOf(d));     // drafts from before the grid/model fields → 'auto'
          hideResume(); conv = convertPaste(state.source, convOpts());
          go(state.step || 1);
        } }),
        el('button', { type: 'button', class: 'lab-btn', text: 'להתחיל מחדש', onclick: function () {
          L.draft.clear(DK); hideResume();
          L.toast('הטיוטה נמחקה', { action: 'בטל', onAction: function () { L.draft.save(DK, d); state = Object.assign(state, d, resumeOf(d)); conv = convertPaste(state.source, convOpts()); go(state.step || 1); } });
        } })
      ]));
    }

    renderSteps();
    if (state.step === 2 && NBD) renderStep2(); else renderStep1();
  }
  // the add-song view and the notebook view share this flow (the core may look up either name)
  root.UCLab.register('add', mountAdd);
  root.UCLab.register('notebook', mountAdd);
  // view=notebook renders #lab-add-root (data-mode="notebook"), but a core that looks for #lab-notebook-root would never start us
  document.addEventListener('DOMContentLoaded', function () {
    var D = root.UCLab.data || {};
    if (D.view !== 'notebook') return;
    var r = document.getElementById('lab-add-root');
    if (r && !r.__labAddMounted) { try { mountAdd(r, root.UCLab); } catch (e) { console.error('[UCLab] init notebook', e); } }
  });
})(typeof window !== 'undefined' ? window : globalThis);
