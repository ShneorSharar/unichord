/**
 * note-utils.js — פונקציות טהורות להמרה בין תדר, MIDI, שם-תו וסנטים.
 *
 * אין כאן DOM, אין Web Audio, אין מצב גלובלי — הכול דטרמיניסטי וניתן לבדיקת-יחידה.
 * כל חישובי הגובה במנוע נגזרים מכאן (מקור-אמת יחיד), בדיוק כפי שמודול האצבוע
 * בנה note-map יחיד. ראה whistle-fingering-enhanced.js לאותו עיקרון.
 *
 * נוסחאות (A4 = refA, ברירת מחדל 440Hz):
 *   midi  = 69 + 12*log2(hz/refA)
 *   hz    = refA * 2^((midi-69)/12)
 *   cents = 1200*log2(hz/targetHz)
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LOG2 = Math.log(2);
const log2 = (x) => Math.log(x) / LOG2;

/** תדר (Hz) → מספר MIDI שבור (לא מעוגל). 69 = A4. */
export function hzToMidi(hz, refA = 440) {
  return 69 + 12 * log2(hz / refA);
}

/** מספר MIDI (יכול להיות שבור) → תדר (Hz). */
export function midiToHz(midi, refA = 440) {
  return refA * Math.pow(2, (midi - 69) / 12);
}

/**
 * מספר MIDI שלם → שם תו מדעי, למשל 69 → {name:'A', octave:4, label:'A4'}.
 * MIDI 60 = C4 (דו מרכזי) לפי הקונבנציה הנפוצה.
 */
export function midiToNoteName(midi) {
  const m = Math.round(midi);
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return { name, octave, label: name + octave };
}

/** הפרש בסנטים בין תדר נמדד לתדר-יעד. חיובי = גבוה מהיעד. */
export function centsBetween(hz, targetHz) {
  return 1200 * log2(hz / targetHz);
}

/**
 * סנטים מהתו הקרוב ביותר — כמה ה-Hz סוטה מהתו ה"נכון" שלו עצמו.
 * שימושי לתצוגה ("+4 סנט") ולא לאימות מול תו מצופה.
 */
export function centsFromNearestNote(hz, refA = 440) {
  const midi = hzToMidi(hz, refA);
  const nearest = Math.round(midi);
  return { midi: nearest, cents: (midi - nearest) * 100, noteName: midiToNoteName(nearest) };
}

/**
 * קיפול-אוקטבה מול תו מצופה — הלב של אימות הוגן.
 *
 * מזהי-גובה (MPM/YIN) נוטים לשגיאות-אוקטבה (f/2, 2f), והחליל מנגן את האוקטבה
 * השנייה ע"י overblow על אותו אצבוע — כך שבלבול-רגיסטר הוא קבוע. במקום להעניש,
 * אנחנו יודעים מראש איזה תו מצופה: סורקים את התו המצופה לאורך [-range,+range]
 * אוקטבות ובוחרים את האוקטבה שממזערת |סנטים|. כך הכפלה/חצייה של אוקטבה
 * הופכת ללא-בעיה כברירת מחדל (enforceOctave=false).
 *
 * @param {number} hz          תדר שזוהה
 * @param {number} expectedMidi מספר MIDI של התו המצופה (סאונד אמיתי)
 * @param {number} range        כמה אוקטבות לכל כיוון לסרוק (ברירת מחדל 2)
 * @param {number} refA         כיול A4
 * @returns {{foldedMidi:number, cents:number, octaveShift:number}}
 *          foldedMidi = התו המצופה אחרי הסטת-אוקטבה שהכי קרובה לזיהוי;
 *          cents = הסטיית הזיהוי מ-foldedMidi (לבדיקה מול סבילות);
 *          octaveShift = בכמה אוקטבות הוזז (0 = אותה אוקטבה).
 */
export function octaveFold(hz, expectedMidi, range = 2, refA = 440) {
  const detectedMidi = hzToMidi(hz, refA);
  let best = null;
  for (let oct = -range; oct <= range; oct++) {
    const candidate = expectedMidi + 12 * oct;
    const cents = (detectedMidi - candidate) * 100;
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { foldedMidi: candidate, cents, octaveShift: oct };
    }
  }
  return best;
}

/**
 * האם הזיהוי "סופר" כתו המצופה, בהינתן סבילות בסנטים.
 * enforceOctave=false (ברירת מחדל) → בודק מחלקת-גובה (chroma) בלבד, סלחני לאוקטבה.
 * @returns {{accepted:boolean, cents:number, octaveShift:number, foldedMidi:number}}
 */
export function matchesExpected(hz, expectedMidi, toleranceCents = 45, opts = {}) {
  const { range = 2, refA = 440, enforceOctave = false } = opts;
  const fold = octaveFold(hz, expectedMidi, range, refA);
  if (enforceOctave) {
    const directCents = (hzToMidi(hz, refA) - expectedMidi) * 100;
    return {
      accepted: Math.abs(directCents) <= toleranceCents,
      cents: directCents,
      octaveShift: 0,
      foldedMidi: expectedMidi,
    };
  }
  return {
    accepted: Math.abs(fold.cents) <= toleranceCents,
    cents: fold.cents,
    octaveShift: fold.octaveShift,
    foldedMidi: fold.foldedMidi,
  };
}

/**
 * שם-תו מדעי → מספר MIDI שלם (ההופכי של midiToNoteName). C4=60.
 * תומך דיאז ('C#4') ובמול ('Bb3'). מחזיר null אם המחרוזת לא תקינה.
 * משמש את שכבת-המתאם בין מסלול-התווים (notes כ'D5') למנוע-הקצב (midi מספרי).
 */
export function noteNameToMidi(name) {
  if (typeof name !== 'string') return null;
  const m = name.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (parseInt(m[3], 10) + 1) * 12 + base + acc;
}

/** RMS (root-mean-square) של חלון דגימות — מד אנרגיה לשער-שקט. */
export function rms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/** RMS לינארי → dBFS (0 dB = משרעת מלאה). שקט מוחלט → -Infinity. */
export function rmsToDbfs(rmsValue) {
  return 20 * Math.log10(rmsValue || 1e-12);
}

export { NOTE_NAMES };
