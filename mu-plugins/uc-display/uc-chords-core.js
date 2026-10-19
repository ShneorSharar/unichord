/* uc-chords-core.js v1.0.0 (WP1, round 1)
   Chord theory + resolver for the song-page diagrams. Contract: SPEC-round1.md §4.
     UCChords.version            '1.0.0'
     UCChords.ready()            true once the engine data was captured by the hook
     UCChords.parse(name)        { root, rootPc, quality, intervals, bass, bassPc, display } | null
     UCChords.lookup(name)       { frets, fingers, barre, label, source, bassNotPlayed, bass } | null
     UCChords.pianoNotes(name)   { notes, names, bassMidi, label } | null
   lookup order: exact data → patched data → enharmonic spelling → alias (same chord tones) →
   slash (base shape + bass) → generated (movable shape search). Never throws, memoized, no network.
   Data patches (decision 13) are applied in place to engine.guitarChordsData from the engine hook,
   so the old code paths benefit too; lookup is the source of truth. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var TUNE = [40, 45, 50, 55, 59, 64];                 // E2 A2 D3 G3 B3 E4, index 0 = low E
  var LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], LPC = [0, 2, 4, 5, 7, 9, 11];
  var SH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MAX_ROWS = 4;                                     // generated / patched voicings span ≤ 4 frets

  var data = null;                                      // engine.guitarChordsData (patched in place)
  var patchedKeys = Object.create(null);
  var memoParse = new Map(), memoLookup = new Map(), memoPiano = new Map(), memoGen = new Map();
  var sigIndex = null;

  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function glyph(s) { return String(s).replace(/#/g, '♯').replace(/b/g, '♭'); }
  function normName(s) {
    if (s === null || s === undefined) return '';
    if (typeof s !== 'string') { if (typeof s === 'number') s = String(s); else return ''; }
    if (s.length > 40) return '';
    return s.replace(/[♯＃]/g, '#').replace(/♭/g, 'b').replace(/[−–—]/g, '-')
      .replace(/[º˚]/g, '°').replace(/\s+/g, '').trim();
  }
  function notePc(letter, acc) {
    var pc = LPC[LET.indexOf(letter)];
    if (acc === '#') pc += 1; else if (acc === 'b') pc -= 1;
    return (pc + 12) % 12;
  }

  /* ───────────────────────── quality parser ───────────────────────── */
  var DEG_SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 10, 8: 0, 9: 14, 11: 17, 13: 21 };

  function parseQuality(q) {
    var st = { third: 4, thirdOpt: false, fifth: 7, fifthSoft: false, sev: null, sevSoft: false, sus: 0,
      power: false, no3: false, no5: false, adds: [], allow: [], main: false, moving: false, any: false };
    function add(s, step) { st.adds.push({ s: s, st: step, soft: st.moving }); }
    function setSev(v) {
      if (st.sev === null || v === 11 || v === 9) { st.sev = v; st.sevSoft = st.moving; }
    }
    function setFifth(v) {
      st.fifth = v;
      if (st.moving) { st.fifthSoft = true; st.allow.push(7); } else st.fifthSoft = false;
    }
    function ext(n) {
      n = +n || 7;
      if (n === 9) add(14, 1);
      else if (n === 11) { add(17, 3); st.allow.push(14); }
      else if (n === 13) { add(21, 5); st.allow.push(14, 17); }
    }
    function altered(acc, d) {
      d = +d;
      var up = (acc === '#' || acc === '+');
      if (d === 5) { setFifth(up ? 8 : 6); return true; }
      if (d === 7) {
        if (up) setSev(11);
        else { if (acc === '-' && !st.any) st.third = 3; setSev(10); }
        st.main = true; return true;
      }
      if (d === 9 || d === 2) { add(up ? 15 : 13, 1); return true; }
      if (d === 11) { add(up ? 18 : 16, 3); return true; }
      if (d === 4) { add(up ? 6 : 4, 3); return true; }
      if (d === 13) { add(up ? 22 : 20, 5); return true; }
      if (d === 6) { if (up) add(10, 5); else setFifth(8); return true; }
      if (d === 3 && !up) { st.third = 3; return true; }
      return false;
    }
    function mainNum(d) {
      switch (d) {
        case 1: case 3: case 8: return true;
        case 2: if (st.third === 3) add(14, 1); else { st.sus = 2; st.thirdOpt = true; } return true;
        case 4: if (st.third === 3) add(5, 3); else st.sus = 4; return true;
        case 5: if (st.third === 3) return true; st.power = true; return true;
        case 6: add(9, 5); return true;
        case 7: setSev(10); return true;
        case 9: setSev(10); add(14, 1); return true;
        case 11: setSev(10); add(17, 3); st.allow.push(14); if (st.third === 4) st.thirdOpt = true; return true;
        case 13: setSev(10); add(21, 5); st.allow.push(14, 17); return true;
      }
      return false;
    }
    function subNum(d) {
      switch (d) {
        case 1: case 3: case 5: case 8: return true;
        case 2: if (st.moving && st.third !== 3 && !st.sus) { st.sus = 2; st.susSoft = true; st.thirdOpt = true; return true; }
          add(14, 1); return true;
        case 9: add(14, 1); return true;
        case 4:
          if (st.third === 3 || st.sus || st.power) { if (st.sus !== 4) add(5, 3); }
          else { st.sus = 4; if (st.moving) { st.thirdOpt = true; st.susSoft = true; } }
          return true;
        case 6: add(9, 5); return true;
        case 13: add(21, 5); return true;
        case 7: setSev(10); return true;
        case 11: add(17, 3); return true;
      }
      return false;
    }
    function number(d, post) {
      d = +d;
      if (post === '+') {
        if (d === 5) { setFifth(8); return true; }
        if (d === 6) { st.no5 = true; add(8, 5); return true; }   // "Am6+" = A C F
        if (d === 7) { setSev(11); st.main = true; return true; }
        return altered('#', d);
      }
      if (post === '-') return altered('b', d);
      if (!st.main && !st.moving) { st.main = true; return mainNum(d); }
      return subNum(d);
    }
    function applyMove(a) {
      var m = /^([#b+\-]?)(\d{1,2})(\+?)$/.exec(a);
      if (!m) return false;
      if (m[1]) return altered(m[1], m[2]);
      if (m[3]) return number(m[2], '+');
      return subNum(+m[2]);
    }
    function moveSemi(a) {
      var m = /^([#b+\-]?)(\d{1,2})(\+?)$/.exec(a);
      if (!m || !has(DEG_SEMI, m[2])) return null;
      var s = DEG_SEMI[m[2]];
      if (m[1] === '#' || m[1] === '+' || m[3]) s += (+m[2] === 7 ? 1 : 1);
      else if (m[1] === 'b' || m[1] === '-') s -= 1;
      return s;
    }

    // movement notation "(4-3)", "(8-+7)", "(#5-5)": the chord sounds the first tone, then moves
    q = q.replace(/\(([#b+\-]?\d{1,2}\+?)-\+?([#b+\-]?\d{1,2}\+?)\)/g, function (_, a, b) { return '{' + a + '|' + b + '}'; });
    var i = 0, L = q.length, guard = 0, m, r;
    while (i < L) {
      if (++guard > 60) return null;
      r = q.slice(i);
      if ((m = /^[()\[\],.]/.exec(r))) { i += 1; continue; }
      if ((m = /^\{([^|}]*)\|([^}]*)\}/.exec(r))) {
        st.moving = true;
        if (!applyMove(m[1])) return null;
        st.moving = false;
        var ys = moveSemi(m[2]); if (ys !== null) st.allow.push(ys);
        st.any = true; i += m[0].length; continue;
      }
      if ((m = /^(?:mmaj|mMaj|mMAJ|mM|mΔ|minmaj|minMaj|-maj|-Δ)(7|9|11|13)?/.exec(r))) {
        st.third = 3; setSev(11); ext(m[1]); st.main = true; st.any = true; i += m[0].length; continue;
      }
      if ((m = /^(?:maj|Maj|MAJ|ma|Ma|M|Δ|j)(7|9|11|13)/.exec(r))) {
        setSev(11); ext(m[1]); st.main = true; st.any = true; i += m[0].length; continue;
      }
      if ((m = /^Δ/.exec(r))) { setSev(11); st.main = true; st.any = true; i += 1; continue; }
      if ((m = /^(?:maj|Maj|MAJ|M)(?![a-z0-9])/.exec(r))) { st.any = true; i += m[0].length; continue; }
      if ((m = /^7M/.exec(r))) { setSev(11); st.main = true; st.any = true; i += 2; continue; }
      if ((m = /^[øØ]7?/.exec(r))) {
        st.third = 3; setFifth(6); setSev(10); st.main = true; st.any = true; i += m[0].length; continue;
      }
      if ((m = /^no(3|5)/.exec(r))) { if (m[1] === '3') st.no3 = true; else st.no5 = true; st.any = true; i += 3; continue; }
      if ((m = /^(?:dim|°|o|O)(7)?/.exec(r))) {
        st.third = 3; setFifth(6); if (m[1]) { setSev(9); st.main = true; } st.any = true; i += m[0].length; continue;
      }
      if ((m = /^(?:aug|\+(?!\d))/.exec(r))) { setFifth(8); st.any = true; i += m[0].length; continue; }
      if ((m = /^\+(1[0-3]|\d)/.exec(r)) && !st.any && m[1] !== '5') {
        setFifth(8); if (!number(m[1], '')) return null; st.any = true; i += m[0].length; continue;
      }
      if ((m = /^(?:min|mi|m)(?!aj)/.exec(r))) { st.third = 3; st.any = true; i += m[0].length; continue; }
      if ((m = /^-(?![0-9])/.exec(r)) && !st.any) { st.third = 3; st.any = true; i += 1; continue; }
      if ((m = /^sus(2|4|9)?/.exec(r))) {
        st.sus = (m[1] === '2' || m[1] === '9') ? 2 : 4; st.any = true; i += m[0].length; continue;
      }
      if ((m = /^add([#b+\-]?)(1[0-3]|\d)(\+?)/.exec(r))) {
        var ok;
        if (m[1]) ok = altered(m[1], m[2]);
        else if (m[3]) ok = altered('#', m[2]);
        else {
          var d = +m[2];
          if (d === 2 || d === 9) { add(14, 1); ok = true; }
          else if (d === 4) { add(5, 3); ok = true; }
          else if (d === 11) { add(17, 3); ok = true; }
          else if (d === 6) { add(9, 5); ok = true; }
          else if (d === 13) { add(21, 5); ok = true; }
          else ok = false;
        }
        if (!ok) return null;
        st.any = true; i += m[0].length; continue;
      }
      if ((m = /^([#b+\-])(1[0-3]|\d)/.exec(r))) {
        if (!altered(m[1], m[2])) return null; st.any = true; i += m[0].length; continue;
      }
      if ((m = /^(1[0-3]|[1-9])([+\-](?!\d))?/.exec(r))) {
        if (!number(m[1], m[2] || '')) return null; st.any = true; i += m[0].length; continue;
      }
      return null;
    }

    // compose: tones [{s:semitones above root, st:letter steps, c:'r'|'s'|'o'}]
    // r = required, s = soft (voiced by the generator, optional for the audit), o = optional
    var T = [];
    function push(s, step, c) {
      for (var k = 0; k < T.length; k++) {
        if (T[k].s % 12 === s % 12) {
          if (c === 'r' || (c === 's' && T[k].c === 'o')) T[k].c = c;
          return;
        }
      }
      T.push({ s: s, st: step, c: c });
    }
    push(0, 0, 'r');
    var allow = st.allow.slice();
    if (st.power) { push(7, 4, 'r'); }
    else {
      if (st.sus) { push(st.sus === 2 ? 2 : 5, st.sus === 2 ? 1 : 3, st.susSoft ? 's' : 'r'); if (st.thirdOpt) allow.push(st.third); }
      else if (!st.no3) push(st.third, 2, st.thirdOpt ? 'o' : 'r');
      if (!st.no5) push(st.fifth, 4, st.fifth === 7 ? 'o' : (st.fifthSoft ? 's' : 'r'));
    }
    if (st.sev !== null) push(st.sev, 6, st.sevSoft ? 's' : 'r');
    st.adds.forEach(function (a) { push(a.s, a.st, a.soft ? 's' : 'r'); });
    T.sort(function (a, b) { return a.s - b.s; });
    return { tones: T, allow: allow };
  }

  function parseInternal(key) {
    if (memoParse.has(key)) return memoParse.get(key);
    var res = null;
    try { res = parseUncached(key); } catch (e) { res = null; }
    memoParse.set(key, res);
    return res;
  }
  function maxNum(seg) { var mm = seg.match(/\d+/g) || []; return Math.max.apply(null, mm.map(Number).concat([0])); }

  function parseUncached(key) {
    var m = /^([A-G])(#|b)?(.*)$/.exec(key);
    if (!m) return null;
    var parts = m[3].split('/'), qual = parts[0], qualTxt = parts[0], bass = null;
    for (var i = 1; i < parts.length; i++) {
      var seg = parts[i];
      var bm = /^([A-G])(#|b)?m?$/.exec(seg);
      if (bm && i === parts.length - 1) { bass = { letter: bm[1], acc: bm[2] || '' }; continue; }
      if ((/^[#b+\-]?\d{1,2}[+\-]?(?:-\+?[#b+\-]?\d{1,2}\+?)?$/.test(seg) || /^\d{1,2}\([#b+\-]?\d{1,2}\)$/.test(seg)) && maxNum(seg) <= 13) {
        qual += '(' + seg + ')'; qualTxt += '/' + seg; continue;
      }
      return null;
    }
    var pq = parseQuality(qual);
    if (!pq) return null;
    var root = m[1] + (m[2] || ''), rootPc = notePc(m[1], m[2] || '');
    var bassName = bass ? bass.letter + bass.acc : null, bassPc = bass ? notePc(bass.letter, bass.acc) : null;
    if (bassPc === rootPc) { bassName = null; bassPc = null; }    // "C/C" = C
    var pcs = [];
    pq.tones.forEach(function (t) { var p = t.s % 12; if (pcs.indexOf(p) < 0) pcs.push(p); });
    pcs.sort(function (a, b) { return a - b; });
    var abs = function (s) { return (rootPc + s) % 12; };
    var req = [], soft = [], allowed = [];
    pq.tones.forEach(function (t) {
      var p = abs(t.s);
      if (t.c === 'r') req.push(p); else if (t.c === 's') soft.push(p);
      if (allowed.indexOf(p) < 0) allowed.push(p);
    });
    pq.allow.forEach(function (s) { var p = abs(s); if (allowed.indexOf(p) < 0) allowed.push(p); });
    if (bassPc !== null && allowed.indexOf(bassPc) < 0) allowed.push(bassPc);
    return {
      root: root, rootLetter: m[1], rootPc: rootPc, quality: qualTxt, head: root + qualTxt,
      tones: pq.tones, intervals: pq.tones.map(function (t) { return t.s; }),
      bass: bassName, bassPc: bassPc,
      req: req, soft: soft, allowed: allowed,
      sig: rootPc + '|' + pcs.join(',') + '|' + (bassPc === null ? '-' : bassPc),
      display: glyph(root) + glyph(qualTxt) + (bassName ? '/' + glyph(bassName) : '')
    };
  }

  /* ───────────────────────── fingering / validity ───────────────────────── */
  function isFretArr(f) {
    if (!Array.isArray(f) || f.length !== 6) return false;
    for (var i = 0; i < 6; i++) { var x = f[i]; if (!(x === null || (typeof x === 'number' && x >= 0 && x <= 24 && x === Math.floor(x)))) return false; }
    return true;
  }
  function normFrets(f) {
    var out = [];
    for (var i = 0; i < 6; i++) {
      var x = f && f[i];
      if (x === undefined || x === null || x === 'x' || x === 'X' || (typeof x === 'number' && x < 0)) out.push(null);
      else { x = parseInt(x, 10); out.push(isNaN(x) ? null : x); }
    }
    return out;
  }
  function barreValid(fr, b) {
    if (!b || typeof b !== 'object') return false;
    var a = b.fromString, z = b.toString, f = b.fret;
    if (!(Number.isInteger(a) && Number.isInteger(z) && Number.isInteger(f))) return false;
    if (a < 0 || z > 5 || a >= z || f < 1) return false;
    for (var s = a; s <= z; s++) { if (fr[s] === null || fr[s] === undefined || fr[s] < f) return false; }
    return fr[a] === f || fr[z] === f;
  }
  // assign fingers to notes [{s,f}] sorted by fret then string, first finger n0, fret base
  function assign(notes, n0, base) {
    if (notes.length > 5 - n0) return null;
    var out = {}, last = n0 - 1, ok = true, k, want;
    for (k = 0; k < notes.length; k++) {
      want = Math.max(last + 1, n0 + (notes[k].f - base));
      if (want > 4) { ok = false; break; }
      out[notes[k].s] = want; last = want;
    }
    if (ok) return out;
    out = {};
    for (k = 0; k < notes.length; k++) out[notes[k].s] = n0 + k;
    return out;
  }
  function sortNotes(a, b) { return a.f - b.f || a.s - b.s; }
  function barreOptions(fr, fret) {
    var opts = [];
    for (var a = 0; a < 6; a++) {
      if (fr[a] !== fret) continue;
      for (var z = a + 1; z < 6; z++) {
        if (fr[z] === null || fr[z] < fret) break;
        if (fr[z] !== fret) continue;
        var cover = 0;
        for (var s = a; s <= z; s++) if (fr[s] === fret) cover++;
        opts.push({ fret: fret, fromString: a, toString: z, cover: cover });
      }
    }
    opts.sort(function (x, y) { return y.cover - x.cover || (y.toString - y.fromString) - (x.toString - x.fromString); });
    return opts;
  }
  function withBarre(fr, b) {
    var rest = [], fingers = [null, null, null, null, null, null];
    for (var s = 0; s < 6; s++) {
      if (!(fr[s] > 0)) continue;
      if (s >= b.fromString && s <= b.toString && fr[s] === b.fret) fingers[s] = '1';
      else rest.push({ s: s, f: fr[s] });
    }
    rest.sort(sortNotes);
    var a = assign(rest, 2, b.fret + 1);
    if (!a) return null;
    for (var k in a) fingers[k] = String(a[k]);
    return { fingers: fingers, barre: { fret: b.fret, fromString: b.fromString, toString: b.toString, finger: '1' }, nf: 1 + rest.length };
  }
  // → {fingers, barre, nf} or null when it needs more than 4 fingers
  function fingerize(fr) {
    var notes = [], minF = 99;
    for (var s = 0; s < 6; s++) if (fr[s] > 0) { notes.push({ s: s, f: fr[s] }); if (fr[s] < minF) minF = fr[s]; }
    var none = [null, null, null, null, null, null];
    if (!notes.length) return { fingers: none, barre: null, nf: 0 };
    notes.sort(sortNotes);
    var atMin = notes.filter(function (n) { return n.f === minF; }).length;
    var plain = null;
    if (notes.length <= 4) {
      var a = assign(notes, 1, minF);
      if (a) { plain = { fingers: none.slice(), barre: null, nf: notes.length }; for (var k in a) plain.fingers[k] = String(a[k]); }
    }
    var wantBarre = !plain || (atMin >= 3 && notes.length >= 4);
    if (wantBarre) {
      var opts = barreOptions(fr, minF);
      for (var i = 0; i < opts.length; i++) {
        if (plain && opts[i].cover < 3) continue;
        var wb = withBarre(fr, opts[i]);
        if (wb) return wb;
      }
    }
    return plain;
  }
  function rowsOf(fr) {
    var mn = 99, mx = 0;
    for (var s = 0; s < 6; s++) if (fr[s] > 0) { if (fr[s] < mn) mn = fr[s]; if (fr[s] > mx) mx = fr[s]; }
    if (!mx) return { rows: 0, min: 0, max: 0 };
    return { rows: mx - mn + 1, min: mn, max: mx };
  }
  function lowestPc(fr) { for (var s = 0; s < 6; s++) if (fr[s] !== null && fr[s] !== undefined) return (TUNE[s] + fr[s]) % 12; return null; }

  /* ───────────────────────── audit (used by the test and by the generator) ───────────────────────── */
  function auditFrets(fr, p, flags) {
    var issues = [], pcs = [], played = 0;
    for (var s = 0; s < 6; s++) if (fr[s] !== null && fr[s] !== undefined) { played++; var pc = (TUNE[s] + fr[s]) % 12; if (pcs.indexOf(pc) < 0) pcs.push(pc); }
    if (!played) return ['nothing played'];
    p.req.forEach(function (x) { if (pcs.indexOf(x) < 0) issues.push('missing ' + SH[x]); });
    pcs.forEach(function (x) { if (p.allowed.indexOf(x) < 0) issues.push('extra ' + SH[x]); });
    if (p.bassPc !== null && !(flags && flags.bassNotPlayed) && lowestPc(fr) !== p.bassPc) issues.push('bass is ' + SH[lowestPc(fr)] + ' not ' + SH[p.bassPc]);
    return issues;
  }

  /* ───────────────────────── generator ───────────────────────── */
  function scoreShape(fr, p, fing) {
    var played = 0, lo = -1, hi = -1, opens = 0, s;
    for (s = 0; s < 6; s++) if (fr[s] !== null) { played++; if (lo < 0) lo = s; hi = s; if (fr[s] === 0) opens++; }
    var inner = 0;
    for (s = lo; s <= hi; s++) if (fr[s] === null) inner++;
    var rw = rowsOf(fr), sc = 0;
    sc += 3 * played - 7 * inner - 2.5 * fing.nf - (fing.barre ? 1 : 0);
    sc += (!rw.max || rw.min <= 3) ? 1 * opens : -2 * opens;          // open strings only help near the nut
    if (rw.max) sc -= 1.5 * (rw.min - 1) + 2.5 * Math.max(0, rw.max - rw.min - 2);
    var pcs = [];
    for (s = 0; s < 6; s++) if (fr[s] !== null) pcs.push((TUNE[s] + fr[s]) % 12);
    p.tones.forEach(function (t) { if (t.c === 'o' && pcs.indexOf((p.rootPc + t.s) % 12) >= 0) sc += 1.5; });
    if (fr[5] === null) sc -= 1;
    sc -= 0.6 * lo;
    if (p.bassPc === null && pcs.length && pcs[pcs.length - 1] === p.rootPc) sc += 0.3;
    return sc;
  }
  // full search: all 6-string combos, frets 0..12, span ≤ 4 frets
  function generate(p, needLow) {
    var key = p.sig + '#' + p.req.slice().sort().join(',') + '#' + p.soft.slice().sort().join(',') + '#' + p.allowed.slice().sort().join(',') + '#' + needLow;
    if (memoGen.has(key)) return memoGen.get(key);
    var allowed = p.allowed, need = p.req.concat(p.soft);
    if (p.bassPc !== null && need.indexOf(p.bassPc) < 0) need.push(p.bassPc);
    var best = null, bestSc = -1e9, fr = [0, 0, 0, 0, 0, 0];
    var minPlayed = p.tones.length <= 2 ? 2 : 3;
    function leaf(start) {
      var mn = 99, played = 0, s;
      for (s = 0; s < 6; s++) if (fr[s] !== null) { played++; if (fr[s] > 0 && fr[s] < mn) mn = fr[s]; }
      if (played < minPlayed) return;
      if (mn === 99 ? start !== 1 : mn !== start) return;            // each shape once
      var pcs = [];
      for (s = 0; s < 6; s++) if (fr[s] !== null) pcs.push((TUNE[s] + fr[s]) % 12);
      for (var k = 0; k < need.length; k++) if (pcs.indexOf(need[k]) < 0) return;
      var fing = fingerize(fr);
      if (!fing) return;
      var sc = scoreShape(fr, p, fing);
      if (sc > bestSc) { bestSc = sc; best = { frets: fr.slice(), fingers: fing.fingers, barre: fing.barre, score: sc }; }
    }
    function dfs(s, start, started) {
      if (s === 6) { leaf(start); return; }
      fr[s] = null; dfs(s + 1, start, started);
      var c, pc;
      for (var f = -1; f < MAX_ROWS; f++) {
        c = f < 0 ? 0 : start + f;
        if (c > 12) break;
        pc = (TUNE[s] + c) % 12;
        if (allowed.indexOf(pc) < 0) continue;
        if (!started && needLow !== null && pc !== needLow) continue;
        fr[s] = c; dfs(s + 1, start, true);
      }
      fr[s] = null;
    }
    for (var start = 1; start <= 12; start++) dfs(0, start, false);
    memoGen.set(key, best);
    return best;
  }
  // movable shapes: hand-made data voicings of the same chord type (same tones relative to the root,
  // same bass interval) moved up or down the neck. Preferred over free search when playable.
  var shapeIndex = null;
  function relSig(p) {
    var rel = [];
    p.tones.forEach(function (t) { var x = t.s % 12; if (rel.indexOf(x) < 0) rel.push(x); });
    rel.sort(function (a, b) { return a - b; });
    return rel.join(',') + '|' + (p.bassPc === null ? '-' : (p.bassPc - p.rootPc + 12) % 12);
  }
  function buildShapeIndex() {
    shapeIndex = Object.create(null);
    if (!data) return;
    for (var k in data) {
      if (!has(data, k)) continue;
      var d = data[k], p = parseInternal(k);
      if (!p || !d || !isFretArr(d.frets) || auditFrets(d.frets, p).length) continue;
      var rs = relSig(p);
      (shapeIndex[rs] = shapeIndex[rs] || []).push({ frets: d.frets, rootPc: p.rootPc });
    }
  }
  function shapeCandidates(p, needLow) {
    if (!shapeIndex) buildShapeIndex();
    var list = shapeIndex[relSig(p)] || [], best = null, bestSc = -1e9, seen = {};
    for (var i = 0; i < list.length; i++) {
      var sh = (p.rootPc - list[i].rootPc + 12) % 12;
      for (var o = -12; o <= 12; o += 12) {
        var d = sh + o, fr = [], ok = true;
        for (var s = 0; s < 6; s++) {
          var x = list[i].frets[s];
          if (x === null) { fr.push(null); continue; }
          x += d;
          if (x < 0 || x > 15) { ok = false; break; }
          fr.push(x);
        }
        if (!ok) continue;
        var key = fr.join(',');
        if (seen[key]) continue; seen[key] = 1;
        if (rowsOf(fr).rows > MAX_ROWS) continue;
        if (needLow !== null && lowestPc(fr) !== needLow) continue;
        if (auditFrets(fr, p).length) continue;
        var fing = fingerize(fr);
        if (!fing) continue;
        var sc = scoreShape(fr, p, fing) + 4;
        if (sc > bestSc) { bestSc = sc; best = { frets: fr, fingers: fing.fingers, barre: fing.barre, score: sc }; }
      }
    }
    return best;
  }
  function bestFor(p, needLow) {
    var a = shapeCandidates(p, needLow), b = generate(p, needLow);
    if (a && b) return a.score >= b.score ? a : b;
    return a || b;
  }
  function generateFor(p) {
    var r = bestFor(p, p.bassPc !== null ? p.bassPc : p.rootPc);
    if (!r && p.bassPc === null) r = bestFor(p, null);
    return r;
  }
  // slash: keep the base shape, put the bass on a lower string (or replace the lowest note)
  function addBass(baseFr, p) {
    var lo = -1, s;
    for (s = 0; s < 6; s++) if (baseFr[s] !== null) { lo = s; break; }
    if (lo < 0) return null;
    var best = null, bestSc = -1e9;
    for (s = 0; s <= lo; s++) {
      for (var f = 0; f <= 12; f++) {
        if ((TUNE[s] + f) % 12 !== p.bassPc) continue;
        var fr = baseFr.slice();
        for (var k = 0; k < s; k++) fr[k] = null;
        fr[s] = f;
        var rw = rowsOf(fr);
        if (rw.rows > MAX_ROWS) continue;
        if (auditFrets(fr, p).length) continue;
        var fing = fingerize(fr);
        if (!fing) continue;
        var sc = scoreShape(fr, p, fing) + (s < lo ? 2 : 0);
        if (sc > bestSc) { bestSc = sc; best = { frets: fr, fingers: fing.fingers, barre: fing.barre, score: sc }; }
      }
    }
    return best;
  }

  /* ───────────────────────── data patches (decision 13) ───────────────────────── */
  // [frets lowE→highE, fingers, barre [fret, from, to] or 0, why]. Filled from the audit (see R1-WP1.md).
  var PATCHES = {
    /*PATCHES-BEGIN*/
    "Am4": [[null,0,0,2,1,0], [null,null,null,"2","1",null], 0, "wrong tones: was Asus4 (no C); now Am add4"],
    "Dm4": [[null,null,0,0,3,1], [null,null,null,null,"3","1"], 0, "wrong tones: was Dsus4 (no F); now Dm add4"],
    "Bm4": [[null,2,4,4,3,0], [null,"1","3","4","2",null], 0, "wrong tones: was Bsus4 (no D); now Bm add4"],
    "Gm4": [[3,3,5,3,3,3], ["1","1","3","1","1","1"], [3,0,5,"1"], "wrong tones: was Gsus4 (no Bb); now Gm add4"],
    "Cm4": [[null,3,3,5,4,3], [null,"1","1","3","2","1"], [3,1,5,"1"], "wrong tones: was Csus4 (no Eb); now Cm add4"],
    "F#m4": [[2,2,4,2,2,2], ["1","1","3","1","1","1"], [2,0,5,"1"], "wrong tones: was F#sus4 (no A); now F#m add4"],
    "C#m2": [[null,4,1,1,2,0], [null,"4","1","2","3",null], 0, "wrong tones: was C#sus2 (no E); now C#m add9"],
    "Gm2": [[3,0,0,3,3,3], ["2",null,null,"1","1","1"], [3,3,5,"1"], "wrong tones: was Gsus2 (no Bb); now Gm add9"],
    "Dm2": [[null,5,3,2,3,0], [null,"4","2","1","3",null], 0, "wrong tones: was Dsus2 (no F); now Dm add9"],
    "Am2": [[null,0,2,4,1,0], [null,null,"2","4","1",null], 0, "wrong tones: was Asus2 (no C); now Am add9"],
    "Em2": [[0,2,2,0,0,2], [null,"1","2",null,null,"3"], 0, "wrong tones: was Esus2 (no G); now Em add9"],
    "Fm2": [[1,3,3,1,1,3], ["1","2","3","1","1","4"], [1,0,4,"1"], "wrong tones (no Ab) + muted string inside barre; now Fm add9"],
    "Am/C#": [[null,4,2,2,1,0], [null,"4","2","3","1",null], 0, "wrong tones: was A/C# (C# major third); now literal Am over C#"],
    "Gaug4": [[3,3,1,0,1,null], ["3","4","1",null,"2",null], 0, "extra B and barre over an open string; now G C D# (sus4 #5)"],
    "A6/9": [[null,0,2,4,2,2], [null,null,"1","3","1","1"], [2,2,5,"1"], "no B (the 9th), was identical to A6"],
    "D6(no3)": [[null,5,0,2,0,5], [null,"3",null,"1",null,"4"], 0, "contained F# despite no3"],
    "F#m74": [[2,4,2,2,0,0], ["1","3","1","1",null,null], [2,0,3,"1"], "no B (the 4th); now F#m7 add4"],
    "Gm9/F": [[1,0,0,3,3,3], ["1",null,null,"2","3","4"], 0, "no Bb"],
    "Am9/G": [[3,0,2,4,1,0], ["3",null,"2","4","1",null], 0, "no C"],
    "Dm9/C": [[null,3,3,2,3,0], [null,"2","3","1","4",null], 0, "no F"],
    "Bbm9": [[6,8,6,6,6,8], ["1","3","1","1","1","4"], [6,0,4,"1"], "root Bb missing"],
    "Ab6/Bb": [[null,1,1,1,1,1], [null,"1","1","1","1","1"], [1,1,5,"1"], "bass was G#, now Bb"],
    "Adim7/Eb": [[null,null,1,2,1,2], [null,null,"1","3","2","4"], 0, "bass was A, now Eb"],
    "Am7/E": [[0,0,2,0,1,0], [null,null,"2",null,"1",null], 0, "bass was A, now E"],
    "B7/A": [[null,0,1,2,0,2], [null,null,"1","2",null,"3"], 0, "bass was B, now A"],
    "B7/Eb": [[null,null,1,2,0,2], [null,null,"1","2",null,"3"], 0, "bass was B, now D#"],
    "Bb/G#": [[4,null,3,3,3,null], ["2",null,"1","1","1",null], [3,2,4,"1"], "bass was A#, now G#"],
    "Bm/G#": [[4,null,4,4,3,null], ["2",null,"3","4","1",null], 0, "bass was B, now G#"],
    "B°7/A": [[null,0,0,1,0,1], [null,null,null,"1",null,"2"], 0, "bass was B, now A"],
    "D6/Gm": [[3,null,0,2,0,2], ["3",null,null,"1",null,"2"], 0, "bass was D, now G"],
    "D9/F#": [[2,0,0,2,1,0], ["2",null,null,"3","1",null], 0, "bass was D, now F#"],
    "Dm6/B": [[null,2,0,2,0,1], [null,"2",null,"3",null,"1"], 0, "bass was D, now B"],
    "Dm6/F": [[1,null,0,2,0,1], ["1",null,null,"3",null,"2"], 0, "bass was D, now F"],
    "E/G#": [[4,2,2,1,0,0], ["4","2","3","1",null,null], 0, "bass was E, now G#"],
    "Ebm/Db": [[null,4,4,3,4,null], [null,"2","3","1","4",null], 0, "bass was D#, now C#"],
    "Em/Db": [[null,4,2,0,0,0], [null,"3","1",null,null,null], 0, "bass was E, now C#"],
    "F#m6/A": [[null,0,1,2,2,2], [null,null,"1","2","3","4"], 0, "bass was F#, now A"],
    "Fmaj7/D": [[null,5,3,2,3,0], [null,"4","2","1","3",null], 0, "bass was F, now D"],
    "G6/A": [[null,0,0,0,0,0], [null,null,null,null,null,null], 0, "bass was G, now A"],
    "G6/D": [[null,null,0,0,0,0], [null,null,null,null,null,null], 0, "bass was G, now D"],
    "G7/Cm": [[null,3,0,0,0,1], [null,"3",null,null,null,"1"], 0, "bass was G, now C"],
    "Gm6/D": [[null,5,5,3,5,3], [null,"2","3","1","4","1"], [3,3,5,"1"], "bass was G, now D"],
    "Gm7/B": [[null,2,3,3,0,3], [null,"1","2","3",null,"4"], 0, "bass was G, now B (literal: B natural)"],
    "Gsus4/D": [[null,null,0,0,1,3], [null,null,null,null,"1","3"], 0, "bass was G, now D"],
    "C#madd9": [[null,4,1,1,2,0], [null,"4","1","2","3",null], 0, "span 2-6, off grid"],
    "Dbmadd9": [[null,4,1,1,2,0], [null,"4","1","2","3",null], 0, "span 2-6, off grid"],
    "C#m(add9)": [[null,4,1,1,2,0], [null,"4","1","2","3",null], 0, "span 2-6, off grid"],
    "F#m/Eb": [[null,null,1,2,2,2], [null,null,"1","2","3","4"], 0, "span 2-6, off grid"],
    "Gbm/Eb": [[null,null,1,2,2,2], [null,null,"1","2","3","4"], 0, "span 2-6, off grid"],
    "Db/F": [[1,4,3,1,2,1], ["1","4","3","1","2","1"], [1,0,5,"1"], "span 1-6, off grid"],
    "C#/F": [[1,4,3,1,2,1], ["1","4","3","1","2","1"], [1,0,5,"1"], "span 1-6, off grid"],
    "Gm6/Bb": [[null,1,0,0,3,0], [null,"1",null,null,"3",null], 0, "span 1-5, off grid"],
    "D#dim/F#": [[null,9,7,8,7,null], [null,"4","1","3","2",null], 0, "span 2-8, unplayable"],
    "Db/Eb": [[null,null,1,1,2,1], [null,null,"1","1","2","1"], [1,2,5,"1"], "span 1-6, off grid"],
    "Ab/Gb": [[2,null,1,1,1,null], ["2",null,"1","1","1",null], [1,2,4,"1"], "span 2-6, off grid"],
    "Cm/A#": [[null,1,1,0,1,3], [null,"1","2",null,"3","4"], 0, "span 1-5, off grid"],
    "Cm/Bb": [[null,1,1,0,1,3], [null,"1","2",null,"3","4"], 0, "barre across an open string"],
    "Eb/Db": [[null,4,5,3,4,3], [null,"2","4","1","3","1"], [3,3,5,"1"], "span 4-8, off grid"],
    "Ab7/F#": [[2,null,1,1,1,2], ["2",null,"1","1","1","3"], [1,2,4,"1"], "span 2-6, off grid"],
    "Ab4/Bb": [[null,1,1,1,2,null], [null,"1","1","1","2",null], [1,1,3,"1"], "span 1-6, off grid"],
    "C7sus4": [[null,3,3,3,1,1], [null,"2","3","4","1","1"], [1,4,5,"1"], "barre toString null: 2 strings invisible"],
    "C13": [[null,3,2,3,5,5], [null,"2","1","3","4","4"], [5,4,5,"4"], "barre toString null; barre at fret 5 is the 4th finger"],
    "C#m": [[null,4,6,6,5,4], [null,"1","3","4","2","1"], [4,1,5,"1"], "barre toString null: barre and 2 dots invisible"],
    "Gm9": [[3,null,3,3,3,5], ["2",null,"1","1","1","4"], [3,2,5,"1"], "barre toString null: 4 strings invisible"],
    "Fm6": [[1,null,0,1,1,1], ["2",null,null,"1","1","1"], [1,3,5,"1"], "barre across an open string"],
    "Fdim7": [[1,2,3,1,3,1], ["1","2","3","1","4","1"], [1,0,5,"1"], "barre across an open string"],
    "Eb/G": [[3,null,null,3,4,3], ["3",null,null,"1","2","1"], [3,3,5,"1"], "barre across 2 muted strings"],
    "F2": [[null,null,3,0,1,1], [null,null,"3",null,"1","1"], [1,4,5,"1"], "muted string inside barre, 5 fingers"],
    "Faug7": [[1,null,1,2,2,null], ["1",null,"2","3","4",null], 0, "barre across a muted string"],
    "F+7": [[1,null,1,2,2,null], ["1",null,"2","3","4",null], 0, "barre across a muted string"],
    /*PATCHES-END*/
  };
  // fallback fingering: one finger per fret group, in ascending fret order. Strings at the same fret
  // share a finger when nothing lower sits between them (lowest fret = barre). Null when it needs > 4 fingers.
  function groupFingers(fr) {
    var cells = [], s;
    for (s = 0; s < 6; s++) if (fr[s] > 0) cells.push({ s: s, f: fr[s] });
    if (!cells.length) return null;
    cells.sort(function (a, b) { return a.f - b.f || a.s - b.s; });
    var groups = [];
    cells.forEach(function (c) {
      var g = groups.length ? groups[groups.length - 1] : null;
      if (g && g.f === c.f) {
        var ok = true;
        for (var k = g.to + 1; k < c.s; k++) if (fr[k] === null || fr[k] === 0 || fr[k] < c.f) ok = false;
        if (ok) { g.to = c.s; g.list.push(c.s); return; }
      }
      groups.push({ f: c.f, from: c.s, to: c.s, list: [c.s] });
    });
    if (groups.length > 4) return null;
    var fingers = [null, null, null, null, null, null], barre = null;
    groups.forEach(function (g, i) {
      g.list.forEach(function (st) { fingers[st] = String(i + 1); });
      if (i === 0 && g.list.length > 1) barre = { fret: g.f, fromString: g.from, toString: g.to, finger: 1 };
    });
    return { fingers: fingers, barre: barre };
  }
  function sanitizeEntry(key, d) {
    var changed = false;
    if (!d || typeof d !== 'object') return false;
    if (!isFretArr(d.frets)) { d.frets = normFrets(d.frets); changed = true; }
    if (!Array.isArray(d.fingers) || d.fingers.length !== 6) {
      var nf = [];
      for (var i = 0; i < 6; i++) nf.push(d.fingers && d.fingers[i] != null ? String(d.fingers[i]) : null);
      d.fingers = nf; changed = true;
    }
    var fr = d.frets;
    if (d.barre && !barreValid(fr, d.barre)) {
      var bf = d.barre.fret, fixed = null;
      var opts = Number.isInteger(bf) ? barreOptions(fr, bf) : [];
      if (opts.length && opts[0].cover >= 2) fixed = { fret: bf, fromString: opts[0].fromString, toString: opts[0].toString, finger: d.barre.finger || '1' };
      d.barre = fixed; changed = true;
      if (!fixed) { var fz = fingerize(fr); if (fz) { d.fingers = fz.fingers; d.barre = fz.barre; } }
    } else if (d.barre === undefined) { /* keep shape: no barre */ }
    var allNull = d.fingers.every(function (x) { return x === null; });
    if (allNull && fr.some(function (x) { return x > 0; })) {
      var fz2 = d.barre ? withBarre(fr, d.barre) : fingerize(fr);
      if (fz2) { d.fingers = fz2.fingers; if (fz2.barre) d.barre = fz2.barre; }
      changed = true;
    }
    if (d.barre) {   // strings at the barre fret inside the barre carry the barre finger
      for (var s2 = d.barre.fromString; s2 <= d.barre.toString; s2++) {
        if (fr[s2] === d.barre.fret && d.fingers[s2] !== d.barre.finger) { d.fingers[s2] = d.barre.finger; changed = true; }
      }
    }
    // one finger on two different frets (Q round 1: 41 entries, e.g. D#m9 x64666): re-finger the shape
    var fretOf = {}, clash = false;
    for (var s3 = 0; s3 < 6; s3++) {
      var g3 = d.fingers[s3];
      if (!(fr[s3] > 0) || g3 === null || g3 === 'T') continue;
      if (fretOf[g3] !== undefined && fretOf[g3] !== fr[s3]) clash = true;
      fretOf[g3] = fr[s3];
    }
    if (clash) {
      var fz3 = d.barre ? (withBarre(fr, d.barre) || fingerize(fr)) : fingerize(fr);
      var ok3 = false;
      if (fz3) { var fo = {}; ok3 = true; for (var s4 = 0; s4 < 6; s4++) { var g4 = fz3.fingers[s4]; if (!(fr[s4] > 0) || !g4 || g4 === "T") continue; if (fo[g4] !== undefined && fo[g4] !== fr[s4]) ok3 = false; fo[g4] = fr[s4]; } }
      if (ok3) { d.fingers = fz3.fingers; d.barre = fz3.barre; }
      else if ((fz3 = groupFingers(fr))) { d.fingers = fz3.fingers; d.barre = fz3.barre; }
      else {   // no clean fingering found: show the dots without digits rather than wrong digits
        d.fingers = [null, null, null, null, null, null];
        if (d.barre) { for (var s5 = 0; s5 < 6; s5++) if (fr[s5] > 0 && fr[s5] < d.barre.fret) d.barre = null; }
        if (d.barre) d.barre.finger = null;
      }
      changed = true;
    }
    if (typeof d.label !== 'string') { d.label = key; changed = true; }
    return changed;
  }
  function applyPatches(obj) {
    var n = 0;
    for (var k in PATCHES) {
      if (!has(PATCHES, k)) continue;
      var P = PATCHES[k];
      obj[k] = { frets: P[0].slice(), fingers: P[1].slice(), label: k };
      if (P[2]) obj[k].barre = { fret: P[2][0], fromString: P[2][1], toString: P[2][2], finger: P[2][3] || '1' };
      patchedKeys[k] = true; n++;
    }
    for (var key in obj) {
      if (!has(obj, key)) continue;
      try { if (sanitizeEntry(key, obj[key])) { patchedKeys[key] = true; n++; } } catch (e) { /* keep entry */ }
    }
    return n;
  }

  /* ───────────────────────── lookup ───────────────────────── */
  function spellings(letterAcc) {
    var m = /^([A-G])(#|b)?$/.exec(letterAcc);
    if (!m) return [letterAcc];
    var pc = notePc(m[1], m[2] || '');
    var out = [letterAcc];
    [SH[pc], FL[pc]].forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); });
    return out;
  }
  function buildSigIndex() {
    sigIndex = Object.create(null);
    if (!data) return;
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var p = parseInternal(keys[i]);
      if (!p) continue;
      (sigIndex[p.sig] = sigIndex[p.sig] || []).push(keys[i]);
    }
    for (var sg in sigIndex) sigIndex[sg].sort(function (a, b) { return a.length - b.length || (a < b ? -1 : 1); });
  }
  function fromEntry(d, source, p) {
    var fr = d.frets.slice();
    var lowPc = lowestPc(fr);
    var bnp = !!(p && p.bassPc !== null && lowPc !== p.bassPc);
    return {
      frets: fr, fingers: (d.fingers || [null, null, null, null, null, null]).slice(),
      barre: d.barre && barreValid(fr, d.barre) ? { fret: d.barre.fret, fromString: d.barre.fromString, toString: d.barre.toString, finger: d.barre.finger === null ? null : String(d.barre.finger || '1') } : null,
      label: p ? p.display : glyph(String(d.label || '')), source: source,
      bassNotPlayed: bnp, bass: p && p.bass ? glyph(p.bass) : null
    };
  }
  function dataGet(k) {
    if (!data || !has(data, k)) return null;
    var d = data[k];
    if (!d || !isFretArr(d.frets)) return null;
    return d;
  }
  function resolve(key, depth) {
    var d = dataGet(key), p = parseInternal(key);
    if (d) return fromEntry(d, patchedKeys[key] ? 'patched' : 'data', p);
    if (!p) return null;
    // enharmonic spelling of root / bass, same quality text
    var roots = spellings(p.root), basses = p.bass ? spellings(p.bass) : [null];
    for (var i = 0; i < roots.length; i++) for (var j = 0; j < basses.length; j++) {
      var v = roots[i] + p.quality + (basses[j] ? '/' + basses[j] : '');
      if (v !== key && (d = dataGet(v))) return fromEntry(d, 'enharmonic', p);
    }
    // alias: same root, same chord tones, same bass
    if (!sigIndex) buildSigIndex();
    // (same tones, but the voicing must also satisfy this name's rules: "7(6-5)" may not borrow a 13 with a 9th)
    var al = sigIndex[p.sig] || [];
    for (var ai = 0; ai < al.length; ai++) {
      if ((d = dataGet(al[ai])) && !auditFrets(d.frets, p).length) return fromEntry(d, 'alias', p);
    }
    if (p.bass && depth < 2) {
      var base = resolve(p.head, depth + 1);
      var out;
      if (base && lowestPc(base.frets) === p.bassPc) out = base;
      else {
        var cand = base ? addBass(base.frets, p) : null;
        if (!cand) cand = bestFor(p, p.bassPc);
        if (cand) out = { frets: cand.frets.slice(), fingers: cand.fingers.slice(), barre: cand.barre };
        else if (base) out = base;
      }
      if (out) {
        var r = { frets: out.frets.slice(), fingers: out.fingers.slice(), barre: out.barre ? Object.assign({}, out.barre) : null,
          label: p.display, source: 'slash', bassNotPlayed: lowestPc(out.frets) !== p.bassPc, bass: glyph(p.bass) };
        return r;
      }
      return null;
    }
    var g = generateFor(p);
    if (g) return { frets: g.frets.slice(), fingers: g.fingers.slice(), barre: g.barre ? Object.assign({}, g.barre) : null,
      label: p.display, source: 'generated', bassNotPlayed: p.bassPc !== null && lowestPc(g.frets) !== p.bassPc, bass: p.bass ? glyph(p.bass) : null };
    return null;
  }
  function clone(r) {
    if (!r) return null;
    return { frets: r.frets.slice(), fingers: r.fingers.slice(), barre: r.barre ? Object.assign({}, r.barre) : null,
      label: r.label, source: r.source, bassNotPlayed: r.bassNotPlayed, bass: r.bass };
  }
  function lookup(name) {
    try {
      var key = normName(name);
      if (!key) return null;
      if (memoLookup.has(key)) return clone(memoLookup.get(key));
      var r = resolve(key, 0);
      memoLookup.set(key, r);
      return clone(r);
    } catch (e) { return null; }
  }

  /* ───────────────────────── piano ───────────────────────── */
  function spell(p, t) {
    var li = LET.indexOf(p.rootLetter);
    var L = LET[(li + t.st) % 7], nat = LPC[(li + t.st) % 7];
    var pc = (p.rootPc + t.s) % 12, diff = (pc - nat + 12) % 12;
    if (diff > 6) diff -= 12;
    if (diff === 0) return L;
    if (diff === 1) return L + '#';
    if (diff === -1) return L + 'b';
    var flat = /b/.test(p.root) || p.root === 'F';
    return (flat ? FL : SH)[pc];
  }
  // piano key labels: no C♭/F♭/E♯/B♯ or double accidentals; those become the plain key name (lead, Q round 1)
  var PLAIN = ["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"];
  function plainKey(n, pc) { return /^(C♭|F♭|E♯|B♯)$|♭♭|♯♯|𝄫|𝄪/.test(n) ? PLAIN[pc] : n; }
  function pianoNotes(name) {
    try {
      var key = normName(name);
      if (!key) return null;
      if (memoPiano.has(key)) { var c = memoPiano.get(key); return c ? { notes: c.notes.slice(), names: c.names.slice(), bassMidi: c.bassMidi, label: c.label } : null; }
      var p = parseInternal(key), res = null;
      if (p) {
        // Plain chords: root position from the root in octave 4 (C4 = 60), close voicing; extensions that
        // reach a third octave drop an octave (still above the root). Slash chords: bass in octave 3 and
        // every chord tone in close position within the octave right above it (≤ 2 octaves in total).
        // Same rule as the WP3 fallback, so both paths draw the same keys.
        var root = 60 + p.rootPc, list = [], bassMidi = null;
        if (p.bassPc !== null) bassMidi = 48 + p.bassPc;
        p.tones.forEach(function (t) {
          var pc = (p.rootPc + t.s) % 12, m = root + t.s;
          if (bassMidi !== null) m = bassMidi + (((pc - p.bassPc + 12) % 12) || 12);
          list.push({ m: m, n: plainKey(glyph(spell(p, t)), pc), s: t.s });
        });
        if (list.length === 2 && bassMidi === null) list.push({ m: root + 12, n: list[0].n, s: 12 });
        for (var guard = 0; bassMidi === null && guard < 4; guard++) {
          var hiIt = list.reduce(function (a, b) { return b.m > a.m ? b : a; });
          if (Math.floor(hiIt.m / 12) - Math.floor(root / 12) < 2) break;
          var down = hiIt.m - 12;
          if (down <= root || list.some(function (o) { return o.m === down; })) break;
          hiIt.m = down;
        }
        if (bassMidi !== null) list.push({ m: bassMidi, n: glyph(p.bass), s: -1 });
        list.sort(function (a, b) { return a.m - b.m; });
        var seen = {}, notes = [], names = [];
        list.forEach(function (it) { if (!seen[it.m]) { seen[it.m] = 1; notes.push(it.m); names.push(it.n); } });
        res = { notes: notes, names: names, bassMidi: bassMidi, label: p.display };
      }
      memoPiano.set(key, res);
      return res ? { notes: res.notes.slice(), names: res.names.slice(), bassMidi: res.bassMidi, label: res.label } : null;
    } catch (e) { return null; }
  }

  function parse(name) {
    try {
      var p = parseInternal(normName(name));
      if (!p) return null;
      return { root: p.root, rootPc: p.rootPc, quality: p.quality, intervals: p.intervals.slice(),
        bass: p.bass, bassPc: p.bassPc, display: p.display };
    } catch (e) { return null; }
  }

  function capture(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (!obj.__ucChordsPatched) {
      try { applyPatches(obj); } catch (e) { /* data stays as shipped */ }
      try { Object.defineProperty(obj, '__ucChordsPatched', { value: true, enumerable: false }); } catch (e2) { obj.__ucChordsPatched = true; }
    }
    if (data !== obj) { data = obj; memoLookup.clear(); memoGen.clear(); sigIndex = null; shapeIndex = null; }
  }

  var UCChords = {
    version: VERSION,
    parse: parse,
    lookup: lookup,
    pianoNotes: pianoNotes,
    ready: function () { return !!data; },
    _internal: { normName: normName, parseInternal: parseInternal, auditFrets: auditFrets, generate: generate, bestFor: bestFor, shapeCandidates: shapeCandidates,
      generateFor: generateFor, addBass: addBass, fingerize: fingerize, barreValid: barreValid, rowsOf: rowsOf,
      lowestPc: lowestPc, capture: capture, patches: PATCHES, patchedKeys: patchedKeys, TUNE: TUNE }
  };
  if (typeof window !== 'undefined') {
    if (!window.UCChords || window.UCChords.version === 'stub') window.UCChords = UCChords;
    (window.ucEngineHooks = window.ucEngineHooks || []).push(function (ctx) {
      var e = ctx && ctx.engine;
      if (!e || !e.guitarChordsData) return;
      if (e.__ucChords) return;
      e.__ucChords = true;
      capture(e.guitarChordsData);
    });
  }
})();
