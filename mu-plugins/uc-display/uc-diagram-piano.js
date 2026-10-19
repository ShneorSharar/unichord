/* uc-diagram-piano.js (WP3, round 1)
   SVG piano keyboard for the song page popup and the chord strip.
   Spec: _display-lab/SPEC-round1.md decisions 3-7, 9.
   - Voicing: window.UCChords.pianoNotes(name) when it returns notes, otherwise the
     small built-in theory below (root/accidental/quality/slash bass -> MIDI, spelled names).
   - Registers through window.ucEngineHooks and replaces engine.renderPianoDiagram.
   - Public: window.UCPianoDiagram = { svg(name, opts) -> string, voicing(name), html(name, opts) }.
   Colors are CSS custom properties with inline fallbacks; uc-display.css (WP4) defines them per theme. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ theory */
  var LETTERS = 'CDEFGAB';
  var LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  var SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  var FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  // Quality (parentheses removed) -> semitones above the root. Values > 12 are extensions (9, 11, 13).
  var MAJ = [0, 4, 7], MIN = [0, 3, 7], DIM = [0, 3, 6], DIM7 = [0, 3, 6, 9], AUG = [0, 4, 8];
  var SUS4 = [0, 5, 7], SUS2 = [0, 2, 7], HALF = [0, 3, 6, 10];
  var Q = {
    '': MAJ, 'maj': MAJ, 'M': MAJ, 'major': MAJ,
    'm': MIN, 'min': MIN, '-': MIN, 'minor': MIN,
    'dim': DIM, 'o': DIM, 'O': DIM, '°': DIM,
    'dim7': DIM7, 'o7': DIM7, 'O7': DIM7, '°7': DIM7,
    'aug': AUG, '+': AUG, '+5': AUG, '#5': AUG,
    'sus4': SUS4, 'sus': SUS4, '4': SUS4, '4-3': SUS4, 'msus4': SUS4, 'msus': SUS4,
    'sus2': SUS2, '2': SUS2, '2-1': SUS2, 'msus2': SUS2,
    'm2': [0, 3, 7, 14], 'm4': [0, 3, 5, 7], 'madd4': [0, 3, 5, 7],
    '5': [0, 7],
    '6': [0, 4, 7, 9], '6-5': [0, 4, 6, 9], '6b5': [0, 4, 6, 9], 'm6': [0, 3, 7, 9], '6no3': [0, 7, 9],
    '6/9': [0, 4, 7, 9, 14], '69': [0, 4, 7, 9, 14], '6add9': [0, 4, 7, 9, 14], 'm6/9': [0, 3, 7, 9, 14], 'm69': [0, 3, 7, 9, 14],
    '7': [0, 4, 7, 10], 'dom7': [0, 4, 7, 10],
    'maj7': [0, 4, 7, 11], 'M7': [0, 4, 7, 11], '7M': [0, 4, 7, 11], 'Δ': [0, 4, 7, 11], 'Δ7': [0, 4, 7, 11],
    'm7': [0, 3, 7, 10], 'min7': [0, 3, 7, 10], '-7': [0, 3, 7, 10],
    'mM7': [0, 3, 7, 11], 'mmaj7': [0, 3, 7, 11], 'mMaj7': [0, 3, 7, 11], 'm7M': [0, 3, 7, 11],
    'm7b5': HALF, 'm7-5': HALF, 'Ø': HALF, 'ø': HALF, 'Ø7': HALF, 'ø7': HALF, 'b5m7': HALF,
    '7sus4': [0, 5, 7, 10], '7sus': [0, 5, 7, 10], '74': [0, 5, 7, 10], '4-7': [0, 5, 7, 10], '7/4-3': [0, 5, 7, 10],
    '7sus2': [0, 2, 7, 10],
    'aug7': [0, 4, 8, 10], '+7': [0, 4, 8, 10], '7#5': [0, 4, 8, 10], '7+5': [0, 4, 8, 10], '7+': [0, 4, 8, 10],
    '7b5': [0, 4, 6, 10], '7-5': [0, 4, 6, 10],
    '7b9': [0, 4, 7, 10, 13], '7-9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], '7+9': [0, 4, 7, 10, 15],
    '9': [0, 4, 7, 10, 14], 'm9': [0, 3, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14], 'M9': [0, 4, 7, 11, 14],
    '9sus4': [0, 5, 7, 10, 14],
    'add9': [0, 4, 7, 14], 'add2': [0, 2, 4, 7], 'madd9': [0, 3, 7, 14], 'madd2': [0, 2, 3, 7],
    'add4': [0, 4, 5, 7], 'add11': [0, 4, 7, 17], 'madd11': [0, 3, 7, 17],
    '11': [0, 7, 10, 14, 17], 'm11': [0, 3, 7, 10, 17], 'm7/11': [0, 3, 7, 10, 17], 'm7add11': [0, 3, 7, 10, 17], 'm74': [0, 3, 5, 7, 10],
    '13': [0, 4, 7, 10, 21], 'm13': [0, 3, 7, 10, 21], '7/6': [0, 4, 7, 9, 10], '7/13': [0, 4, 7, 9, 10], '76': [0, 4, 7, 9, 10],
    'maj7#11': [0, 4, 7, 11, 18], 'maj7b5': [0, 4, 6, 11],
    'aug4': [0, 5, 8], 'maug': [0, 3, 8], 'm+': [0, 3, 8],
    'm7-6': [0, 3, 7, 10]
  };
  var DIM7_SET = { 'dim7': 1, 'o7': 1, 'O7': 1, '°7': 1 };
  // interval (semitones) -> letter steps above the root letter
  var STEP = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 12: 0, 13: 1, 14: 1, 15: 1, 17: 3, 18: 3, 21: 5 };

  function asciiName(n) {
    return String(n == null ? '' : n).replace(/[♯♭]/g, function (c) { return c === '♯' ? '#' : 'b'; }).replace(/\s+/g, '');
  }
  function displayName(n) { return asciiName(n).replace(/#/g, '♯').replace(/b/g, '♭'); }
  function pcOf(letter, acc) {
    var pc = LETTER_PC[LETTERS.indexOf(letter)];
    if (acc === '#') pc += 1; else if (acc === 'b') pc -= 1;
    return (pc + 12) % 12;
  }
  function accGlyph(a) { return a === '#' ? '♯' : a === 'b' ? '♭' : ''; }

  function parse(name) {
    var s = asciiName(name);
    var m = /^([A-G])([#b]?)(.*)$/.exec(s);
    if (!m) return null;
    var rest = m[3], bass = null;
    var sm = /^(.*)\/([A-G])([#b]?)m?$/.exec(rest);
    if (sm) { rest = sm[1]; bass = { letter: sm[2], acc: sm[3], pc: pcOf(sm[2], sm[3]) }; }
    var q = rest.replace(/[()]/g, '');
    var iv = Q.hasOwnProperty(q) ? Q[q] : null;
    if (!iv) return null;
    return { letter: m[1], acc: m[2], rootPc: pcOf(m[1], m[2]), quality: q, intervals: iv, bass: bass };
  }

  function spell(p, iv, pc) {
    var preferFlat = p.acc === 'b' || (p.acc === '' && p.letter === 'F');
    var step = (DIM7_SET[p.quality] && iv === 9) ? 6 : STEP[iv];
    if (step == null) return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[pc];
    var li = (LETTERS.indexOf(p.letter) + step) % 7;
    var diff = (pc - LETTER_PC[li] + 12) % 12;
    var L = LETTERS[li];
    if (diff === 0) return L;
    // C♭, F♭, E♯, B♯ and double accidentals are written as the plain enharmonic note (players read E, not F♭)
    if (diff === 1 && L !== 'E' && L !== 'B') return L + '♯';
    if (diff === 11 && L !== 'C' && L !== 'F') return L + '♭';
    return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[pc];
  }

  // Built-in voicing: chord tones from the root in octave 4 (C4 = 60), slash bass in octave 3.
  function fallbackVoicing(name) {
    var p = parse(name);
    if (!p) return null;
    // Plain chords: root position, root in octave 4. Slash chords: bass in octave 3 and the chord tones
    // in close position right above it (one octave), so the whole picture stays within 2 octaves.
    var root = 60 + p.rootPc, notes = [], names = [];
    var bassMidi = p.bass ? 48 + p.bass.pc : null;
    p.intervals.forEach(function (iv) {
      var pc = (p.rootPc + iv) % 12, m = root + iv;
      if (bassMidi != null) { m = bassMidi + ((pc - p.bass.pc + 12) % 12 || 12); }
      notes.push(m);
      names.push(iv === 0 ? p.letter + accGlyph(p.acc) : spell(p, iv, pc));
    });
    // Extensions that push a plain chord into a third octave are played an octave lower (still above the root).
    for (var guard = 0; bassMidi == null && guard < 4; guard++) {
      var hi = Math.max.apply(null, notes);
      if (Math.floor(hi / 12) - Math.floor(root / 12) < 2) break;
      var idx = notes.indexOf(hi), down = hi - 12;
      if (down <= root || notes.indexOf(down) !== -1) break;
      notes[idx] = down;
    }
    if (p.bass) {
      notes.unshift(bassMidi);
      names.unshift(p.bass.letter + accGlyph(p.bass.acc));
    }
    return { notes: notes, names: names, bassMidi: bassMidi, label: displayName(name), source: 'fallback' };
  }

  function fromCore(name) {
    var C = window.UCChords;
    if (!C || typeof C.pianoNotes !== 'function') return null;
    var r;
    try { r = C.pianoNotes(name); } catch (e) { return null; }
    if (!r || !r.notes || !r.notes.length) return null;
    var notes = [], names = [];
    for (var i = 0; i < r.notes.length; i++) {
      var n = Math.round(Number(r.notes[i]));
      if (!isFinite(n) || n < 12 || n > 115) return null;
      notes.push(n);
      names.push(r.names && r.names[i] ? displayName(r.names[i]) : SHARP_NAMES[n % 12]);
    }
    var bm = (r.bassMidi == null || !isFinite(Number(r.bassMidi))) ? null : Math.round(Number(r.bassMidi));
    return { notes: notes, names: names, bassMidi: bm, label: r.label ? displayName(r.label) : displayName(name), source: 'core' };
  }

  // Sort, dedupe, keep at most 3 octaves (fold the highest notes down), compute the C..B range (2 to 3 octaves).
  function normalise(v) {
    var pairs = [];
    v.notes.forEach(function (n, i) { pairs.push({ m: n, name: v.names[i], bass: v.bassMidi != null && n === v.bassMidi }); });
    pairs.sort(function (a, b) { return a.m - b.m; });
    pairs = pairs.filter(function (p, i) { return i === 0 || p.m !== pairs[i - 1].m; });
    var guard = 0;
    while (pairs.length > 1 && guard++ < 20) {
      var lo = Math.floor(pairs[0].m / 12), hi = Math.floor(pairs[pairs.length - 1].m / 12);
      if (hi - lo + 1 <= 3) break;
      var top = pairs.pop();
      if (top.bass) { pairs.push(top); break; }
      top.m -= 12;
      if (!pairs.some(function (p) { return p.m === top.m; })) pairs.push(top);
      pairs.sort(function (a, b) { return a.m - b.m; });
    }
    var loOct = Math.floor(pairs[0].m / 12), hiOct = Math.floor(pairs[pairs.length - 1].m / 12);
    if (hiOct - loOct + 1 < 2) hiOct = loOct + 1;
    if (hiOct - loOct + 1 > 3) hiOct = loOct + 2; // only reached when a bass is pinned; keys out of range are dropped
    var startMidi = loOct * 12, endMidi = hiOct * 12 + 11;
    pairs = pairs.filter(function (p) { return p.m >= startMidi && p.m <= endMidi; });
    return { keys: pairs, startMidi: startMidi, endMidi: endMidi, octaves: hiOct - loOct + 1, label: v.label, source: v.source };
  }

  function voicing(name) {
    if (name == null || String(name).trim() === '') return null;
    var v = fromCore(name) || fallbackVoicing(name);
    if (!v) return null;
    return normalise(v);
  }

  /* ------------------------------------------------------------------ render */
  var FONT = 'font-family:&quot;UCRoboto&quot;, Roboto, system-ui, sans-serif';
  var WHITE_IN_OCT = [0, 2, 4, 5, 7, 9, 11];
  var BLACK_AFTER = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }; // black pc -> index of the white key on its left
  var C_KEY = {
    white: 'fill:var(--ucd-p-white,#fbf7f1)',
    edge: 'stroke:var(--ucd-p-edge,rgba(40,40,48,.55))',
    black: 'fill:var(--ucd-p-black,#1b1f27)',
    dot: 'fill:var(--ucd-dot,var(--text-chord,#00509D))',
    dotInk: 'fill:var(--ucd-dot-ink,var(--bg-song,#ffffff))',
    bass: 'fill:var(--ucd-bass,var(--accent-primary,#B68C64))',
    bassInk: 'fill:var(--ucd-bass-ink,#111111)',
    ink: 'fill:var(--ucd-ink,var(--text-primary,#0D1B33))',
    muted: 'fill:var(--ucd-muted-text,var(--text-secondary,#5a6475))'
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function r1(n) { return Math.round(n * 100) / 100; }

  function notFound(name) {
    return '<div class="ucd-nf" role="note" style="' + FONT + ';text-align:center;padding:14px 12px;margin:0 auto;max-width:260px;border-radius:10px;' +
      'border:1px solid var(--ucd-p-edge,rgba(40,40,48,.35));color:var(--ucd-ink,var(--text-primary,#0D1B33));background:transparent">' +
      '<div class="ucd-nf-text" dir="rtl" style="font-size:15px;line-height:1.4">אין דיאגרמה לאקורד הזה</div>' +
      (String(name || '').trim() ? '<div class="ucd-nf-name" dir="ltr" style="font-size:17px;font-weight:700;margin-top:4px;unicode-bidi:isolate">' + esc(displayName(name)) + '</div>' : '') +
      '</div>';
  }

  function geometry(size) {
    var strip = size === 'strip';
    return {
      strip: strip, W: 24, H: strip ? 84 : 100, BW: 15, BH: strip ? 52 : 62,
      pad: 2, titleH: strip ? 36 : 30, footH: strip ? 32 : 4, titleSize: strip ? 30 : 18, notesSize: 24
    };
  }

  // Returns the SVG markup string, or null when the chord cannot be resolved.
  function svg(name, opts) {
    opts = opts || {};
    var v = voicing(name);
    if (!v || !v.keys.length) return null;
    var g = geometry(opts.size);
    var showTitle = opts.title !== false;
    if (!showTitle) g.titleH = g.pad;
    var whites = [], blacks = [], pressed = {};
    v.keys.forEach(function (k) { pressed[k.m] = k; });
    var wi = 0;
    for (var m = v.startMidi; m <= v.endMidi; m++) {
      var pc = m % 12;
      if (WHITE_IN_OCT.indexOf(pc) !== -1) { whites.push({ m: m, x: g.pad + wi * g.W }); wi++; }
      else {
        var boundary = g.pad + (Math.floor((m - v.startMidi) / 12) * 7 + BLACK_AFTER[pc] + 1) * g.W;
        blacks.push({ m: m, x: boundary - g.BW / 2, cx: boundary });
      }
    }
    var vbW = whites.length * g.W + 2 * g.pad;
    // 3 octaves draw smaller on screen: grow text and key height so they read like the 2 octave board
    var k = whites.length / 14;
    var hk = 1 + (k - 1) * 0.6;
    g.H = Math.round(g.H * hk); g.BH = Math.round(g.BH * hk);
    var bassKey = null;
    v.keys.forEach(function (key) { if (key.bass) bassKey = key; });
    if (bassKey && !g.strip) g.footH = 17; // room for the "בס" caption under the bass key
    g.titleH = Math.round(g.titleH * k); g.footH = Math.round(g.footH * k);
    var fsTitle = r1(g.titleSize * k), fsWhite = r1(Math.min(12 * k, 15)), fsBlack = r1(Math.min(10 * k, 11.5)), fsNotes = r1(g.notesSize * k);
    var top = g.titleH;
    var vbH = top + g.H + g.footH + g.pad;
    var label = v.label || displayName(name);
    var namesLine = v.keys.map(function (k) { return k.name; }).join(' ');
    var aria = 'פסנתר: ' + label + '. תווים: ' + namesLine;
    var out = [];
    out.push('<svg class="ucd-p-svg ucd-p-' + (g.strip ? 'strip' : 'popup') + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + vbW + ' ' + vbH + '"' +
      ' width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(aria) + '"' +
      ' data-chord="' + esc(asciiName(name)) + '" data-source="' + v.source + '"' +
      ' style="display:block;width:100%;height:auto;overflow:visible;direction:ltr;' + FONT + '">');
    if (showTitle) out.push('<text class="ucd-p-name" x="' + r1(vbW / 2) + '" y="' + r1(g.titleH - 9 * k) + '" text-anchor="middle" direction="ltr" unicode-bidi="bidi-override"' +
      ' font-size="' + fsTitle + '" font-weight="700" style="' + C_KEY.ink + ';direction:ltr;unicode-bidi:bidi-override">' + esc(label) + '</text>');
    out.push('<g class="ucd-p-keys">');
    whites.forEach(function (k) {
      var p = pressed[k.m];
      var fill = p ? (p.bass ? C_KEY.bass : C_KEY.dot) : C_KEY.white;
      out.push('<rect class="ucd-p-white' + (p ? (p.bass ? ' ucd-p-bass' : ' ucd-p-on') : '') + '" data-midi="' + k.m + '" x="' + r1(k.x) + '" y="' + top +
        '" width="' + g.W + '" height="' + g.H + '" rx="2.5" style="' + fill + ';' + C_KEY.edge + ';stroke-width:1"/>');
    });
    blacks.forEach(function (k) {
      var p = pressed[k.m];
      var fill = p ? (p.bass ? C_KEY.bass : C_KEY.dot) : C_KEY.black;
      out.push('<rect class="ucd-p-black' + (p ? (p.bass ? ' ucd-p-bass' : ' ucd-p-on') : '') + '" data-midi="' + k.m + '" x="' + r1(k.x) + '" y="' + top +
        '" width="' + g.BW + '" height="' + g.BH + '" rx="1.8" style="' + fill + ';' + C_KEY.edge + ';stroke-width:1"/>');
    });
    out.push('</g>');
    if (!g.strip) {
      out.push('<g class="ucd-p-labels" font-weight="700" text-anchor="middle">');
      whites.forEach(function (k) {
        var p = pressed[k.m]; if (!p) return;
        out.push('<text class="ucd-p-label" x="' + r1(k.x + g.W / 2) + '" y="' + r1(top + g.H - 9 * hk) + '" font-size="' + fsWhite + '" direction="ltr" unicode-bidi="bidi-override" style="' +
          (p.bass ? C_KEY.bassInk : C_KEY.dotInk) + ';direction:ltr;unicode-bidi:bidi-override">' + esc(p.name) + '</text>');
      });
      blacks.forEach(function (k) {
        var p = pressed[k.m]; if (!p) return;
        out.push('<text class="ucd-p-label" x="' + r1(k.cx) + '" y="' + r1(top + g.BH - 7 * hk) + '" font-size="' + fsBlack + '" direction="ltr" unicode-bidi="bidi-override" style="' +
          (p.bass ? C_KEY.bassInk : C_KEY.dotInk) + ';direction:ltr;unicode-bidi:bidi-override">' + esc(p.name) + '</text>');
      });
      out.push('</g>');
      if (bassKey) {
        // Bass marker that does not rely on color alone (in some themes --ucd-bass equals --ucd-dot)
        var bk = whites.filter(function (w) { return w.m === bassKey.m; })[0];
        var bx = bk ? bk.x + g.W / 2 : (blacks.filter(function (b) { return b.m === bassKey.m; })[0] || { cx: vbW / 2 }).cx;
        bx = Math.max(12 * k, Math.min(vbW - 12 * k, bx));
        out.push('<text class="ucd-p-basscap" x="' + r1(bx) + '" y="' + r1(top + g.H + 13 * k) + '" text-anchor="middle" font-size="' + r1(11 * k) + '" font-weight="700" direction="rtl" style="' +
          C_KEY.muted + '">בס</text>');
      }
    } else {
      out.push('<text class="ucd-p-notes" x="' + r1(vbW / 2) + '" y="' + r1(top + g.H + 25 * k) + '" text-anchor="middle" font-size="' + fsNotes + '" font-weight="600" direction="ltr" unicode-bidi="bidi-override" style="' +
        C_KEY.muted + ';direction:ltr;unicode-bidi:bidi-override">' + esc(namesLine) + '</text>');
    }
    out.push('</svg>');
    return out.join('');
  }

  // Full block for a container: wrapper + svg, or the not-found card.
  function html(name, opts) {
    opts = opts || {};
    var s = svg(name, opts);
    if (!s) return notFound(name);
    var max = opts.size === 'strip' ? 'none' : '420px';
    return '<div class="ucd-p ucd-p-size-' + (opts.size === 'strip' ? 'strip' : 'popup') + '" dir="ltr" style="width:100%;max-width:' + max + ';margin:0 auto;box-sizing:border-box">' + s + '</div>';
  }

  function sizeFor(el) {
    if (!el || !el.closest) return 'popup';
    if (el.id === 'achord-diagram' || el.closest('.achord-popup, #achord-diagram')) return 'popup';
    return 'strip';
  }

  function renderPianoDiagram(chordName, container) {
    var el = container && container.jquery ? container[0] : container;
    if (!el) return;
    el.innerHTML = html(chordName, { size: sizeFor(el) });
  }

  window.UCPianoDiagram = { svg: svg, html: html, voicing: voicing, parse: parse, render: renderPianoDiagram, version: 'r1' };

  (window.ucEngineHooks = window.ucEngineHooks || []).push(function (ctx) {
    var engine = ctx && ctx.engine;
    if (!engine || engine.__ucPiano) return;
    engine.__ucPiano = true;
    engine.__ucPianoOriginal = engine.renderPianoDiagram;
    engine.renderPianoDiagram = renderPianoDiagram;
  });
})();
