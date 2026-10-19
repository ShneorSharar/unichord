/* uc-diagram-guitar.js (WP2, round 1). Guitar chord box renderer for unichord.
   Replaces engine.renderGuitarDiagram(chordName, container) through window.ucEngineHooks.
   Contract: SPEC-round1.md §2 decisions 3-8, §4 (UCChords.lookup).
   Geometry is absolute (low E on the left) and must never be mirrored by RTL.
   Exposes window.UCGuitarDiagram = { svg(name, opts), render(name, container, opts), displayName, version }. */
(function () {
  'use strict';
  if (window.UCGuitarDiagram && window.UCGuitarDiagram.__wp2) return;

  var VERSION = '1.0.0';
  var FONT = 'UCRoboto, Roboto, system-ui, sans-serif';
  var NF_TEXT = 'אין דיאגרמה לאקורד הזה';
  var BASS_PREFIX = 'בס: ';
  var LRI = '⁦', PDI = '⁩';

  /* Colors: tokens from uc-display.css (WP4) with fallbacks to the site tokens. */
  var C = {
    ink: 'var(--ucd-ink, var(--text-primary, #0D1B33))',
    grid: 'var(--ucd-grid, color-mix(in srgb, var(--text-primary, #0D1B33) 55%, transparent))',
    dot: 'var(--ucd-dot, var(--text-chord, #00509D))',
    dotInk: 'var(--ucd-dot-ink, var(--bg-song, #FFFFFF))',
    muted: 'var(--ucd-muted-text, var(--text-secondary, #5a6475))',
    bg: 'var(--bg-song, transparent)'
  };

  /* Layout, viewBox units. */
  var W = 168, X0 = 40, SG = 19, NS = 6;        // strings at x = 40 .. 135
  var X1 = X0 + SG * (NS - 1);
  var GCX = (X0 + X1) / 2;                       // grid centre, the name centres on it
  var FG = 22, DOT_R = 8, FINGER_FS = 12;
  var MAX_W = { popup: 200, strip: 120 };

  var engineData = null;                         // fallback: ctx.engine.guitarChordsData

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  /* ASCII key for data lookup. */
  function asciiName(n) {
    return String(n == null ? '' : n).trim().replace(/[♯♭]/g, function (c) { return c === '♯' ? '#' : 'b'; });
  }
  /* Display form: ♯ and ♭ glyphs. b is a flat only after a note letter or before a digit (b5, b9). */
  function displayName(n) {
    return asciiName(n)
      .replace(/#/g, '♯')
      .replace(/([A-G])b/g, '$1♭')
      .replace(/b(?=\d)/g, '♭');
  }

  function normFret(v) {
    if (v === null || v === undefined || v === '' || v === 'x' || v === 'X') return null;
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    return isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }
  function normFinger(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim().toUpperCase();
    return /^[1-4]$/.test(s) || s === 'T' ? s : null;
  }

  /* Turns a lookup result (or raw data entry) into a safe shape. Returns null when unusable. */
  function normalizeChord(d, name) {
    if (!d || !d.frets || typeof d.frets.length !== 'number') return null;
    var frets = [], fingers = [], i;
    for (i = 0; i < NS; i++) {
      frets.push(normFret(d.frets[i]));
      fingers.push(normFinger(d.fingers ? d.fingers[i] : null));
    }
    return {
      frets: frets,
      fingers: fingers,
      barre: d.barre || null,
      label: displayName(d.label || name),
      bassNotPlayed: !!d.bassNotPlayed,
      bass: d.bass ? displayName(d.bass) : null,
      source: d.source || 'data'
    };
  }

  function lookupChord(name) {
    var r = null;
    var U = window.UCChords;
    if (U && typeof U.lookup === 'function') {
      try { r = U.lookup(name); } catch (e) { r = null; }
    }
    if (!r && engineData) {
      var key = asciiName(name);
      var d = engineData[key];
      if (d) r = { frets: d.frets, fingers: d.fingers, barre: d.barre || null, label: d.label || key, source: 'data' };
    }
    return normalizeChord(r, name);
  }

  /* Barre sanity. Data has toString:null, barres over open/muted strings, barre fret not played.
     Result: {fret, from, to, finger} where every string from..to is fretted at >= fret,
     and both ends sit exactly on fret; or null. */
  function resolveBarre(ch) {
    var f = ch.frets, b = ch.barre;
    function okRange(a, z, fret) {
      if (a < 0 || z > NS - 1 || a >= z) return false;
      for (var s = a; s <= z; s++) if (f[s] === null || f[s] === 0 || f[s] < fret) return false;
      var at = 0;
      for (s = a; s <= z; s++) if (f[s] === fret) at++;
      return at >= 2;
    }
    /* longest run of strings fretted >= fret, trimmed to strings exactly on fret */
    function bestRun(fret, from, to) {
      var best = null, s = from;
      while (s <= to) {
        if (f[s] === null || f[s] === 0 || f[s] < fret) { s++; continue; }
        var a = s;
        while (s + 1 <= to && f[s + 1] !== null && f[s + 1] !== 0 && f[s + 1] >= fret) s++;
        var z = s;
        while (a <= z && f[a] !== fret) a++;
        while (z >= a && f[z] !== fret) z--;
        if (a < z && okRange(a, z, fret) && (!best || z - a > best.to - best.from)) best = { from: a, to: z };
        s++;
      }
      return best;
    }
    function fingerAt(a, z, fallback) {
      var seen = null;
      for (var s = a; s <= z; s++) if (f[s] === fret0 && ch.fingers[s]) { seen = seen || ch.fingers[s]; if (seen !== ch.fingers[s]) return normFinger(fallback) || seen; }
      return seen || normFinger(fallback);
    }
    var fret0;
    if (b && normFret(b.fret)) {
      fret0 = normFret(b.fret);
      var from = normFret(b.fromString), to = normFret(b.toString);
      if (from === null) from = 0;
      if (from > NS - 1) from = NS - 1;
      if (to === null || to > NS - 1) {
        // toString missing: extend over strings fretted >= fret, then trim to the last one on the fret
        to = from;
        while (to + 1 < NS && f[to + 1] !== null && f[to + 1] !== 0 && f[to + 1] >= fret0) to++;
        while (to > from && f[to] !== fret0) to--;
      }
      if (from > to) { var t = from; from = to; to = t; }
      if (okRange(from, to, fret0) && f[from] === fret0) {
        return { fret: fret0, from: from, to: to, finger: fingerAt(from, to, b.finger) };
      }
      var run = bestRun(fret0, 0, NS - 1);
      if (run) return { fret: fret0, from: run.from, to: run.to, finger: fingerAt(run.from, run.to, b.finger) };
      return null;
    }
    /* No barre in data: infer from the same finger on 2+ strings at the same fret. */
    var groups = {}, s;
    for (s = 0; s < NS; s++) {
      if (f[s] > 0 && ch.fingers[s] && ch.fingers[s] !== 'T') {
        var k = ch.fingers[s] + '@' + f[s];
        (groups[k] = groups[k] || []).push(s);
      }
    }
    var bestG = null;
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;
      var fr = f[g[0]], a = g[0], z = g[g.length - 1];
      if (!okRange(a, z, fr)) return;
      if (!bestG || z - a > bestG.to - bestG.from || (z - a === bestG.to - bestG.from && fr < bestG.fret))
        bestG = { fret: fr, from: a, to: z, finger: ch.fingers[a] };
    });
    return bestG;
  }

  /* Which frets the box shows: {base (first fret shown), rows}. base 1 means the nut is drawn. */
  function fretWindow(ch) {
    var played = ch.frets.filter(function (x) { return x !== null && x > 0; });
    if (!played.length) return { base: 1, rows: 4 };
    var minF = Math.min.apply(null, played), maxF = Math.max.apply(null, played);
    var hasOpen = ch.frets.some(function (x) { return x === 0; });
    if (maxF <= 4) return { base: 1, rows: 4 };
    if (maxF <= 5 && (hasOpen || minF <= 2)) return { base: 1, rows: 5 };
    var span = maxF - minF + 1;
    if (hasOpen && maxF <= 6) return { base: 1, rows: maxF };   // keep the nut so open strings read right
    return { base: minF, rows: Math.max(4, span) };
  }

  function nameFontSize(label) {
    var len = label.length;
    if (len <= 7) return 19;
    return Math.max(11, Math.floor(19 * 7 / len));
  }

  function svgOpen(w, h, size, aria) {
    var maxW = MAX_W[size] || MAX_W.popup;
    return '<svg class="ucd-g ucd-g--' + (size === 'strip' ? 'strip' : 'popup') + '" xmlns="http://www.w3.org/2000/svg"' +
      ' viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"' +
      ' role="img" aria-label="' + esc(aria) + '" direction="ltr" font-family="' + FONT + '"' +
      ' style="display:block;width:100%;max-width:' + maxW + 'px;height:auto;margin:0 auto;direction:ltr;unicode-bidi:isolate;overflow:visible;font-family:' + FONT + ';">';
  }

  function notFound(name, size) {
    var disp = displayName(name);
    var maxW = MAX_W[size] || MAX_W.popup;
    return '<div class="ucd-nf" role="note" style="box-sizing:border-box;max-width:' + maxW + 'px;margin:0 auto;padding:' + (size === 'strip' ? '8px 6px' : '14px 12px') + ';' +
      'border:1px dashed ' + C.grid + ';border-radius:10px;text-align:center;color:' + C.muted + ';' +
      'font-family:' + FONT + ';font-size:' + (size === 'strip' ? '12px' : '14px') + ';line-height:1.4;">' +
      '<div class="ucd-nf-msg" dir="rtl">' + NF_TEXT + '</div>' +
      (disp ? '<div class="ucd-nf-name" dir="ltr" style="margin-top:4px;font-weight:700;font-size:1.15em;color:' + C.ink + ';unicode-bidi:isolate;"><bdi dir="ltr">' + esc(disp) + '</bdi></div>' : '') +
      '</div>';
  }

  /* Main builder. opts: {size:'popup'|'strip', chord: pre-resolved object (tests/gallery)} */
  function buildSvg(name, opts) {
    opts = opts || {};
    var size = opts.size === 'strip' ? 'strip' : 'popup';
    var ch = opts.chord ? normalizeChord(opts.chord, name) : lookupChord(name);
    if (!ch) return notFound(name, size);

    var label = ch.label || displayName(name);
    var bassLine = ch.bassNotPlayed && ch.bass ? ch.bass : null;
    var win = fretWindow(ch);
    var barre = resolveBarre(ch);
    if (barre && (barre.fret < win.base || barre.fret > win.base + win.rows - 1)) barre = null;

    var nameY = 21;
    var headerH = bassLine ? 44 : 30;
    var markY = headerH + 6;            // centre of ○ / ×
    var nutY = markY + 11;
    var gridH = win.rows * FG;
    var H = nutY + gridH + 10;
    var p = [];

    var aria = 'דיאגרמת אקורד ' + label + (bassLine ? ', ' + BASS_PREFIX + bassLine : '');
    p.push(svgOpen(W, H, size, aria));

    // name, top, bold, LTR isolated
    p.push('<text class="ucd-g-name" x="' + GCX + '" y="' + nameY + '" text-anchor="middle" direction="ltr" unicode-bidi="isolate"' +
      ' font-size="' + nameFontSize(label) + '" font-weight="700" style="fill:' + C.ink + ';direction:ltr;unicode-bidi:isolate;">' + esc(label) + '</text>');
    if (bassLine) {
      p.push('<text class="ucd-g-bass" x="' + GCX + '" y="' + (nameY + 16) + '" text-anchor="middle" direction="rtl"' +
        ' font-size="11" style="fill:' + C.muted + ';direction:rtl;">' + esc(BASS_PREFIX) + LRI + esc(bassLine) + PDI + '</text>');
    }

    // frets (horizontal)
    for (var r = 1; r <= win.rows; r++) {
      var fy = nutY + r * FG;
      p.push('<line class="ucd-g-fret" x1="' + X0 + '" y1="' + fy + '" x2="' + X1 + '" y2="' + fy + '" stroke-width="1.5" stroke-linecap="square" style="stroke:' + C.grid + ';"/>');
    }
    // strings (vertical), low E on the left
    for (var s = 0; s < NS; s++) {
      var sx = X0 + s * SG;
      p.push('<line class="ucd-g-string" x1="' + sx + '" y1="' + nutY + '" x2="' + sx + '" y2="' + (nutY + gridH) + '" stroke-width="' + (s < 3 ? 1.6 : 1.2) + '" style="stroke:' + C.ink + ';"/>');
    }
    // nut or position
    if (win.base === 1) {
      p.push('<rect class="ucd-g-nut" x="' + (X0 - 1) + '" y="' + (nutY - 4) + '" width="' + (X1 - X0 + 2) + '" height="5" rx="1.5" style="fill:' + C.ink + ';"/>');
    } else {
      p.push('<line class="ucd-g-fret ucd-g-top" x1="' + X0 + '" y1="' + nutY + '" x2="' + X1 + '" y2="' + nutY + '" stroke-width="1.5" style="stroke:' + C.grid + ';"/>');
      p.push('<text class="ucd-g-pos" x="' + (X0 - DOT_R - 4) + '" y="' + (nutY + FG / 2 + 4) + '" text-anchor="end" direction="ltr" unicode-bidi="isolate"' +
        ' font-size="12" font-weight="700" style="fill:' + C.ink + ';direction:ltr;unicode-bidi:isolate;">' + win.base +
        '<tspan font-size="9" font-weight="400">fr</tspan></text>');
    }

    // open / muted markers above the nut
    for (s = 0; s < NS; s++) {
      sx = X0 + s * SG;
      if (ch.frets[s] === 0) {
        p.push('<circle class="ucd-g-open" data-s="' + s + '" cx="' + sx + '" cy="' + markY + '" r="4.6" stroke-width="1.6" style="fill:none;stroke:' + C.ink + ';"/>');
      } else if (ch.frets[s] === null) {
        var m = 4.2;
        p.push('<path class="ucd-g-mute" data-s="' + s + '" d="M' + r1(sx - m) + ' ' + r1(markY - m) + 'L' + r1(sx + m) + ' ' + r1(markY + m) +
          'M' + r1(sx + m) + ' ' + r1(markY - m) + 'L' + r1(sx - m) + ' ' + r1(markY + m) + '" stroke-width="1.7" stroke-linecap="round" style="fill:none;stroke:' + C.ink + ';"/>');
      }
    }

    function cyOf(fret) { return nutY + (fret - win.base + 0.5) * FG; }
    function fingerText(x, y, f) {
      return '<text class="ucd-g-finger" x="' + x + '" y="' + r1(y + FINGER_FS * 0.36) + '" text-anchor="middle" direction="ltr"' +
        ' font-size="' + FINGER_FS + '" font-weight="700" style="fill:' + C.dotInk + ';">' + esc(f) + '</text>';
    }

    // barre capsule (same color as dots), digit centred
    if (barre) {
      var by = cyOf(barre.fret);
      var bx1 = X0 + barre.from * SG - DOT_R, bx2 = X0 + barre.to * SG + DOT_R;
      p.push('<rect class="ucd-g-barre" data-from="' + barre.from + '" data-to="' + barre.to + '" data-fret="' + barre.fret + '"' +
        ' x="' + bx1 + '" y="' + r1(by - DOT_R) + '" width="' + (bx2 - bx1) + '" height="' + (DOT_R * 2) + '" rx="' + DOT_R + '" ry="' + DOT_R + '" style="fill:' + C.dot + ';"/>');
      if (barre.finger) p.push(fingerText((bx1 + bx2) / 2, by, barre.finger));
    }

    // dots
    for (s = 0; s < NS; s++) {
      var fr = ch.frets[s];
      if (fr === null || fr === 0) continue;
      if (barre && s >= barre.from && s <= barre.to && fr === barre.fret) continue;   // covered by the barre
      sx = X0 + s * SG;
      var cy = cyOf(fr);
      p.push('<circle class="ucd-g-dot" data-s="' + s + '" data-f="' + fr + '" cx="' + sx + '" cy="' + r1(cy) + '" r="' + DOT_R + '" style="fill:' + C.dot + ';"/>');
      if (ch.fingers[s]) p.push(fingerText(sx, cy, ch.fingers[s]));
    }

    p.push('</svg>');
    return p.join('');
  }

  function toEl(container) {
    if (!container) return null;
    if (container.jquery) return container[0] || null;
    if (container.nodeType === 1) return container;
    return null;
  }

  function sizeFor(el, opts) {
    if (opts && opts.size) return opts.size;
    if (!el) return 'popup';
    if (el.id === 'achord-diagram') return 'popup';
    if (el.closest && el.closest('#chord-strip-bar, .ucd-s, .ucd-strip')) return 'strip';
    if (el.classList && el.classList.contains('chord-strip-svg')) return 'strip';
    return 'popup';
  }

  function render(chordName, container, opts) {
    var el = toEl(container);
    if (!el) return;
    el.innerHTML = buildSvg(chordName, { size: sizeFor(el, opts), chord: opts && opts.chord });
  }

  window.UCGuitarDiagram = {
    __wp2: true,
    version: VERSION,
    svg: buildSvg,
    render: render,
    displayName: displayName,
    _internal: { resolveBarre: resolveBarre, fretWindow: fretWindow, normalizeChord: normalizeChord, layout: { W: W, X0: X0, SG: SG, FG: FG, DOT_R: DOT_R } }
  };

  (window.ucEngineHooks = window.ucEngineHooks || []).push(function (ctx) {
    var engine = ctx && ctx.engine;
    if (!engine) return;
    if (engine.guitarChordsData) engineData = engine.guitarChordsData;
    if (engine.__ucGuitar) return;
    engine.__ucGuitar = true;
    var data = engine.guitarChordsData;
    engine.renderGuitarDiagram = function (chordName, container) {
      if (data) engineData = data;    // the engine of this call is the freshest source
      try {
        render(chordName, container);
      } catch (e) {
        var el = toEl(container);
        if (el) el.innerHTML = notFound(chordName, sizeFor(el));
        if (window.console) console.error('uc-diagram-guitar', e);
      }
    };
  });
})();
