/* UC Editor Lab — lab-copysig.js (owner: S1)
 * Copy-signature detector: flags pasted text that looks copied from another chord site.
 * Pure function, no DOM. Works in the browser (window.UCLabCopySig) and in Node (module.exports).
 *
 *   UCLabCopySig.detect(rawText) -> {
 *     level: 'none' | 'weak' | 'strong',
 *     signals: [ { type: 'invisible'|'site'|'url'|'notice', strength: 'strong'|'weak',
 *                  label: <short Hebrew for the reviewer>, match: <string>, line: <1-based|null>, count?: <n> } ]
 *   }
 *
 * Signals:
 *  - invisible (strong): U+200B U+200C U+200D U+2060 U+FEFF anywhere (zero-width watermark, e.g. Negina plants
 *    these right after the title). NOT bidi marks (U+200E/200F/202A-202E/2066-2069: normal for WhatsApp/Nagnu copy).
 *  - url (strong): http(s)://..., www.…, or a domain-looking token (name + known TLD).
 *  - site (strong): Latin site names (tab4u, nagnu, negina, ultimate-guitar / ultimateguitar / "ultimate guitar",
 *    shironet, e-chords, chordify…). Bare "ug" is deliberately NOT included (too many false positives).
 *    WEAK: Hebrew names (נגנו / נגינה / שירונט / טאב פור יו…) and only in a site context ("אתר X", "מאתר X",
 *    "באתר X", "X.co.il"): "נגנו"/"נגינה" are ordinary Hebrew words and never trigger alone.
 *  - notice (strong): "כל הזכויות שמורות", "©", "(c) 20xx", "copyright 20xx", "הועתק מ", "מתוך אתר", "all rights reserved".
 * level = strong if any strong signal, else weak if any weak, else none.
 *
 * Chord tokens (Am, G/B, E7) and section headers ("פזמון:", "x2") never match any pattern here.
 * No lookbehind (older Safari); regexes are built per call (no shared lastIndex state).
 */
(function (root) {
  'use strict';

  var INVISIBLE_RE = '[\\u200B\\u200C\\u200D\\u2060\\uFEFF]';
  var HEB = '\\u05D0-\\u05EA';

  // Latin site names (strong). Word-boundaries on both sides.
  var LATIN_SITES = [
    'tab4u', 'tabs4u', 'nagnu', 'negina', 'ultimate[- ]?guitar', 'shironet', 'e-?chords', 'chordify',
    'songsterr', 'chordie', 'azchords', 'guitartabs', '911tabs', 'cifraclub', 'lacuerda', 'chords-and-tabs'
  ];
  // Hebrew site names (weak, only with a site context).
  var HEB_SITES = ['נגנו', 'נגינה', 'שירונט', 'טאב\\s+פור\\s+יו', 'טאב4יו', 'אקורדים\\s+ותווים'];
  var TLDS = 'com|net|org|info|io|fm|tv|co\\.il|org\\.il|ac\\.il|gov\\.il|muni\\.il|net\\.il';

  var NOTICES = [
    ['כל\\s+הזכויות\\s+שמורות', 'כל הזכויות שמורות'],
    ['all\\s+rights\\s+reserved', 'all rights reserved'],
    ['©', '©'],
    ['\\(c\\)\\s*(?:19|20)\\d\\d', '(c) שנה'],
    ['copyright\\s+(?:19|20)\\d\\d', 'copyright שנה'],
    ['הועתק\\s+מ', 'הועתק מ'],
    ['מתוך\\s+אתר', 'מתוך אתר']
  ];

  function lineIndex(text) {                       // offsets of every '\n'
    var nl = [], i = -1;
    while ((i = text.indexOf('\n', i + 1)) !== -1) nl.push(i);
    return nl;
  }
  function lineOf(nl, pos) {                       // 1-based line of character offset pos
    var n = 1;
    for (var i = 0; i < nl.length && nl[i] < pos; i++) n++;
    return n;
  }
  function hex4(code) { var h = code.toString(16).toUpperCase(); while (h.length < 4) h = '0' + h; return 'U+' + h; }
  function trimTail(s) { return s.replace(/[.,;:!?)\]}"'׳״]+$/, ''); }

  function detect(rawText) {
    var text = typeof rawText === 'string' ? rawText : (rawText == null ? '' : String(rawText));
    var signals = [];
    if (!text) return { level: 'none', signals: signals };
    var nl = lineIndex(text);
    var m, re;

    // ── invisible (strong) ──
    re = new RegExp(INVISIBLE_RE, 'g');
    var count = 0, firstPos = -1, seen = {}, cps = [];
    while ((m = re.exec(text))) {
      count++;
      if (firstPos < 0) firstPos = m.index;
      var cp = hex4(m[0].charCodeAt(0));
      if (!seen[cp]) { seen[cp] = 1; cps.push(cp); }
    }
    if (count) {
      signals.push({
        type: 'invisible', strength: 'strong',
        label: 'תווים בלתי נראים (סימן מים) ×' + count,
        match: cps.join(' '), line: lineOf(nl, firstPos), count: count
      });
    }

    // ── url (strong) ──  (spans are remembered so a site name inside a URL is not reported twice)
    var urlSpans = [], urlSeen = {};
    function addUrl(raw, idx) {
      var s = trimTail(raw);
      if (!s) return;
      var end = idx + s.length;
      for (var i = 0; i < urlSpans.length; i++) if (idx < urlSpans[i][1] && end > urlSpans[i][0]) return;
      urlSpans.push([idx, end]);
      var key = s.toLowerCase();
      if (urlSeen[key]) return;
      urlSeen[key] = 1;
      signals.push({ type: 'url', strength: 'strong', label: 'כתובת אתר: ' + s, match: s, line: lineOf(nl, idx) });
    }
    re = /https?:\/\/[^\s<>"'א-ת]+/gi;
    while ((m = re.exec(text))) addUrl(m[0], m.index);
    re = /\bwww\.[^\s<>"'א-ת]+/gi;
    while ((m = re.exec(text))) addUrl(m[0], m.index);
    re = new RegExp('\\b[a-z0-9][a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:' + TLDS + ')\\b', 'gi');
    while ((m = re.exec(text))) addUrl(m[0], m.index);

    function insideUrl(a, b) {
      for (var i = 0; i < urlSpans.length; i++) if (a < urlSpans[i][1] && b > urlSpans[i][0]) return true;
      return false;
    }

    // ── site, Latin (strong) ──
    var siteSeen = {};
    re = new RegExp('\\b(?:' + LATIN_SITES.join('|') + ')\\b', 'gi');
    while ((m = re.exec(text))) {
      if (insideUrl(m.index, m.index + m[0].length)) continue;
      var k = m[0].toLowerCase().replace(/[\s-]+/g, '');
      if (siteSeen[k]) continue;
      siteSeen[k] = 1;
      signals.push({ type: 'site', strength: 'strong', label: 'שם אתר: ' + m[0], match: m[0], line: lineOf(nl, m.index) });
    }

    // ── site, Hebrew (weak, only with a site context) ──
    var names = '(' + HEB_SITES.join('|') + ')';
    var after = '(?![' + HEB + '])';
    var ctxPatterns = [
      // "אתר X", "מאתר X", "באתר X", "לאתר X", "האתר X", optional quotes / "ה" before the name
      new RegExp('(^|[^' + HEB + '])((?:[מבלה])?(?:ה)?אתר\\s+[\\"\'״׳“”]?ה?' + names + ')' + after, 'g'),
      // "X.co.il" / "X.com" with a Hebrew label
      new RegExp('(^|[^' + HEB + '])(' + HEB_SITES.join('|') + ')(?:\\.(?:co\\.il|com|org\\.il|net))\\b', 'g')
    ];
    for (var p = 0; p < ctxPatterns.length; p++) {
      re = ctxPatterns[p];
      while ((m = re.exec(text))) {
        var full = m[2].replace(/\s+/g, ' ');
        var key2 = 'he:' + full;
        if (siteSeen[key2]) continue;
        siteSeen[key2] = 1;
        signals.push({
          type: 'site', strength: 'weak', label: 'שם אתר (בהקשר של אתר): ' + full, match: full,
          line: lineOf(nl, m.index + m[1].length)
        });
        if (m[0].length === 0) re.lastIndex++;
      }
    }

    // ── notice (strong) ──
    for (var n = 0; n < NOTICES.length; n++) {
      re = new RegExp(NOTICES[n][0], 'gi');
      while ((m = re.exec(text))) {
        var nk = 'n:' + NOTICES[n][1];
        if (siteSeen[nk]) break;                    // one per notice kind
        siteSeen[nk] = 1;
        signals.push({
          type: 'notice', strength: 'strong', label: 'הודעת זכויות: ' + NOTICES[n][1],
          match: m[0], line: lineOf(nl, m.index)
        });
      }
    }

    var level = 'none';
    for (var s = 0; s < signals.length; s++) {
      if (signals[s].strength === 'strong') { level = 'strong'; break; }
      level = 'weak';
    }
    return { level: level, signals: signals };
  }

  var api = { detect: detect };
  if (root) root.UCLabCopySig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
