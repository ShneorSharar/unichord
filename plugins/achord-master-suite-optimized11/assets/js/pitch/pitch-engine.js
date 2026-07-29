/**
 * pitch-engine.js — מנוע זיהוי-גובה מונופוני בדפדפן, חוצה-מכשירים.
 *
 * אחראי על: לכידת מיקרופון (Web Audio), הצינור AnalyserNode→rAF, וזיהוי גובה
 * פר-פריים עם pitchy (McLeod Pitch Method). מוציא קריאה *גולמית* בכל פריים דרך
 * callback. אין כאן לוגיקת-משחק ואין החלטות "נכון/לא-נכון" — רק "מה אני שומע".
 * את ההחלטה ההוגנת (median+hold+hysteresis) עושה StabilityTracker / שכבת המענה.
 *
 * כל הבחירות נגזרות ממחקר חוצה-מכשירים (ראה הספק שב-feat/flute-game):
 *   - AudioContext נוצר ומשוחרר רק בתוך user-gesture (חובה ב-iOS Safari).
 *   - constraints מוקשחים: echoCancellation/noiseSuppression/autoGainControl=false
 *     (כל אחד מהם מעוות גובה), + applyConstraints על ה-track + אימות getSettings.
 *   - לא נועלים sampleRate (מתנגש ב-Firefox); קוראים את ctx.sampleRate החי.
 *   - AnalyserNode(2048) + requestAnimationFrame = הכי מעט קוד, כיסוי מלא גם ל-iOS ישן.
 *   - לא מחברים ל-destination (feedback howl בטלפונים).
 */

import { PitchDetector } from '../../vendor/pitchy/pitchy.module.js';
import { hzToMidi, midiToNoteName, centsFromNearestNote, rms, rmsToDbfs } from './note-utils.js';

/**
 * פרופילי כלים. windowHz = חלון-תדר לגיטימי לסאונד הכלי; כל זיהוי מחוצה לו
 * נדחה כארטיפקט-אוקטבה. semitoneOffset = הסטת-טרנספוזיציה (D-whistle/Irish-flute/
 * recorder-C = 0; הסאונד תמיד נמדד כ"מנוגן", לא ככתוב).
 */
export const INSTRUMENTS = {
  tinwhistle: { label: 'חליל אירי D', windowHz: [560, 2400], semitoneOffset: 0 },
  recorder:   { label: 'חלילון סופרן C', windowHz: [520, 3200], semitoneOffset: 0 },
  flute:      { label: 'חליל רוחבי / אירי', windowHz: [245, 2100], semitoneOffset: 0 },
  piano:      { label: 'פסנתר', windowHz: [60, 4200], semitoneOffset: 0 },
};

const DEFAULTS = {
  instrument: 'tinwhistle',
  bufferSize: 2048,   // ~43ms @48kHz — מספיק מחזורים גם ל-D5
  refA: 440,          // כיול A4 (415–444)
  minClarity: 0.90,   // שער-בהירות MPM — ההגנה הראשית מול רעש-נשיפה
  minRms: 0.012,      // שער-אנרגיה מוחלט (~-45dBFS); ניתן לכיול חי בפרוטוטייפ
};

export class PitchEngine {
  constructor(opts = {}) {
    this.cfg = { ...DEFAULTS, ...opts };
    this.ctx = null;
    this.stream = null;
    this.track = null;
    this.source = null;
    this.analyser = null;
    this.detector = null;
    this.buf = null;
    this.rafId = null;
    this.running = false;
    this._starting = false;  // הגנת double-start (חלון ה-await)
    this.onReading = null;   // callback(reading)
    this.onStatus = null;    // callback({type, message, settings?})
    this.settings = null;    // track.getSettings() שנקרא בפועל
    // מאזין-נראוּת קשור פעם אחת (לא closure חדש בכל start) — להסרה ב-dispose, אחרת
    // דולף מאזין בכל mount/unmount של תו/שאלה.
    this._onVisibility = () => {
      if (document.visibilityState === 'visible' && this.running && this.ctx && this.ctx.state !== 'running')
        this._status('suspended', 'חזרת לעמוד — הקש/י לחידוש האזנה.');
    };
  }

  setInstrument(name) {
    if (INSTRUMENTS[name]) this.cfg.instrument = name;
  }
  setRefA(hz) { this.cfg.refA = hz; }
  setMinClarity(v) { this.cfg.minClarity = v; }
  setMinRms(v) { this.cfg.minRms = v; }

  _status(type, message, extra = {}) {
    if (this.onStatus) this.onStatus({ type, message, ...extra });
  }

  /**
   * מאתחל ומתחיל האזנה. *חייב* להיקרא מתוך מטפל-אירוע של מחווה (click/touchend),
   * אחרת ב-iOS ה-AudioContext יישאר suspended בשקט (buffer של אפסים, ללא שגיאה).
   * @param {function} onReading callback שמקבל קריאה גולמית בכל פריים
   */
  async start(onReading) {
    this.onReading = onReading;
    // הגנת double-start: כבר רץ, או בעיצומו של start() קודם (חלון ה-await — דאבל-טאפ).
    // בלעדיה קריאה שנייה מיתמת לולאת rAF שנייה (CPU כפול + callbacks כפולים).
    if (this.running || this._starting) return this.running;
    this._starting = true;

    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._starting = false;
      this._status('error', 'נדרש חיבור מאובטח (HTTPS) או localhost כדי לגשת למיקרופון.');
      return false;
    }

    try {
      // 1) AudioContext יחיד — נוצר בתוך המחווה. ללא אופציית sampleRate.
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      await this.ctx.resume();
      this._unlockIOS(); // באפר-שקט בן דגימה אחת — משחרר את מנוע האודיו ב-iOS

      // 2) לכידה עם constraints מוקשחים (כל השלושה מעוותים גובה)
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            // belt-and-suspenders ל-Chromium ישן (מפתחות goog-):
            googEchoCancellation: false,
            googAutoGainControl: false,
            googNoiseSuppression: false,
          },
          video: false,
        });
        this.track = this.stream.getAudioTracks()[0];

        // 3) הקשחה חוזרת על ה-track (הדפוס הכי אמין חוצה-דפדפנים, WebKit 179411)
        try {
          await this.track.applyConstraints({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          });
        } catch (e) { /* חלק מהדפדפנים לא תומכים — נמשיך, נאמת ב-getSettings */ }

        // 4) אמת מה *באמת* נכנס לתוקף (constraints נדחים מושמטים בשקט, לא נזרקים)
        this.settings = this.track.getSettings ? this.track.getSettings() : {};
        this._reportSettings();
        this._wireLifecycle();
      }

      // 5) גרף: source → analyser(2048, smoothing 0). לא מחברים ל-destination.
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.cfg.bufferSize;
      this.analyser.smoothingTimeConstant = 0;
      this.source.connect(this.analyser);

      // 6) pitchy detector + buffer לפי sampleRate החי
      this.buf = new Float32Array(this.analyser.fftSize);
      this.detector = PitchDetector.forFloat32Array(this.analyser.fftSize);

      this.running = true;
      this._starting = false;
      this._status('listening', 'מאזין…', { settings: this.settings });
      this._loop();
      return true;
    } catch (err) {
      this._starting = false;
      if (err && err.name === 'NotAllowedError') {
        this._status('error', 'הגישה למיקרופון נדחתה. אשר/י הרשאת מיקרופון ונסה/י שוב.');
      } else if (err && err.name === 'NotFoundError') {
        this._status('error', 'לא נמצא מיקרופון במכשיר.');
      } else {
        this._status('error', 'שגיאת אתחול אודיו: ' + (err && err.message ? err.message : err));
      }
      return false;
    }
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.source) { try { this.source.disconnect(); } catch (e) {} this.source = null; }
    // לא עוצרים את ה-stream/track ולא סוגרים את ה-ctx — שמירה עליהם מאפשרת
    // resume מהיר ומונעת את הבאג ש-getUserMedia שני הורג את ה-track הראשון ב-iOS.
    this._status('stopped', 'ההאזנה הופסקה.');
  }

  /** משחרר הכול לחלוטין (ביציאה מהעמוד). */
  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVisibility); // H1: לא להשאיר מאזין דולף
    if (this.track) { try { this.track.stop(); } catch (e) {} }
    if (this.stream) this.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
    if (this.ctx) { try { this.ctx.close(); } catch (e) {} }
    this.ctx = this.stream = this.track = null;
  }

  get sampleRate() { return this.ctx ? this.ctx.sampleRate : null; }

  // ---- פנימי ----

  _unlockIOS() {
    try {
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    } catch (e) { /* לא קריטי */ }
  }

  _reportSettings() {
    const s = this.settings || {};
    const forced = [];
    if (s.echoCancellation === true) forced.push('ביטול-הד');
    if (s.noiseSuppression === true) forced.push('דיכוי-רעש');
    if (s.autoGainControl === true) forced.push('בקרת-עוצמה (AGC)');
    if (forced.length) {
      this._status('warn',
        'המכשיר כפה: ' + forced.join(', ') + ' — עלול לגרום לרעידת-גובה. נסה/י מיקרופון מובנה (לא Bluetooth).',
        { settings: s });
    }
  }

  _wireLifecycle() {
    // iOS: רקע/נעילה משעים את ה-ctx וממתים את ה-track. נזהה ונבקש "הקש לחידוש".
    if (this.ctx && 'onstatechange' in this.ctx) {
      this.ctx.onstatechange = () => {
        if (!this.ctx) return;   // ה-ctx אופס ב-dispose() אך אירוע statechange אחרון ('closed') עוד יורה
        if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
          this._status('suspended', 'האודיו הושהה (רקע/נעילה). הקש/י לחידוש.');
        }
      };
    }
    if (this.track) {
      this.track.onmute = () => this._status('suspended', 'המיקרופון הושתק. הקש/י לחידוש.');
      this.track.onunmute = () => { if (this.running) this._status('listening', 'מאזין…'); };
    }
    document.removeEventListener('visibilitychange', this._onVisibility); // הגנה מפני כפילות
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  /** קריאה מתוך user-gesture כשחוזרים מרקע ב-iOS. */
  async resume() {
    if (this.ctx) { try { await this.ctx.resume(); } catch (e) {} }
    if (this.running) this._status('listening', 'מאזין…');
  }

  _loop() {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(() => this._loop());

    this.analyser.getFloatTimeDomainData(this.buf);
    const r = rms(this.buf);
    const dbfs = rmsToDbfs(r);

    // (1) שער-שקט
    if (r < this.cfg.minRms) {
      this._emit({ state: 'silence', rms: r, dbfs });
      return;
    }

    // (2) זיהוי גובה
    const [hz, clarity] = this.detector.findPitch(this.buf, this.ctx.sampleRate);
    const [lo, hi] = INSTRUMENTS[this.cfg.instrument].windowHz;

    // (3) שער-בהירות + חלון-תדר של הכלי (דחיית ארטיפקטים)
    if (!hz || clarity < this.cfg.minClarity || hz < lo || hz > hi) {
      this._emit({ state: 'unclear', rms: r, dbfs, hz: hz || 0, clarity: clarity || 0 });
      return;
    }

    // קריאה תקפה — מחשבים שם-תו וסנטים מהתו הקרוב
    const nearest = centsFromNearestNote(hz, this.cfg.refA);
    this._emit({
      state: 'pitch',
      hz,
      clarity,
      rms: r,
      dbfs,
      midi: nearest.midi,
      note: nearest.noteName.name,
      octave: nearest.noteName.octave,
      label: nearest.noteName.label,
      cents: nearest.cents,
    });
  }

  _emit(reading) {
    reading.t = (this.ctx ? this.ctx.currentTime : 0);
    if (this.onReading) this.onReading(reading);
  }
}

/**
 * StabilityTracker — הופך קריאות גולמיות רועדות ל"תו מחויב" יציב.
 * median על N פריימים + זמן-אחזקה (hold) + hysteresis, ו-onset-guard שמתעלם
 * מ-~40ms הראשונים אחרי תחילת תו (ה-attack מלא רכיבים לא-הרמוניים).
 * שכבת המשחק תצרוך *רק* את התו המחויב, לא את הקריאות הגולמיות.
 */
export class StabilityTracker {
  constructor(opts = {}) {
    this.medianN = opts.medianN || 5;
    this.holdMs = opts.holdMs != null ? opts.holdMs : 80;
    this.onsetGuardMs = opts.onsetGuardMs != null ? opts.onsetGuardMs : 40;
    this.history = [];          // מספרי MIDI אחרונים
    this.committed = null;      // ה-MIDI המחויב הנוכחי
    this.candidate = null;      // מועמד שמחכה למלא hold
    this.candidateSince = 0;
    this.onsetAt = 0;
    this.onCommit = opts.onCommit || null; // callback(midi|null)
  }

  reset() {
    this.history = [];
    this.committed = null;
    this.candidate = null;
  }

  /** מזין קריאה גולמית (מ-PitchEngine). nowMs = חותמת-זמן במילישניות. */
  push(reading, nowMs) {
    if (reading.state !== 'pitch') {
      // שקט/לא-ברור — מאפסים את ההיסטוריה כדי לא לגשר על פערים
      this.history.length = 0;
      if (this.committed !== null && reading.state === 'silence') {
        this.committed = null;
        if (this.onCommit) this.onCommit(null);
      }
      return this.committed;
    }

    // onset guard: אם זה תחילת צליל חדש, מתעלמים מהפריימים הראשונים
    if (this.history.length === 0) this.onsetAt = nowMs;
    this.history.push(reading.midi);
    if (this.history.length > this.medianN) this.history.shift();
    if (nowMs - this.onsetAt < this.onsetGuardMs) return this.committed;

    const med = this._median(this.history);

    if (med !== this.candidate) {
      this.candidate = med;
      this.candidateSince = nowMs;
    }
    // hysteresis: צריך hold יציב של מועמד שונה לפני מעבר
    if (med !== this.committed && nowMs - this.candidateSince >= this.holdMs) {
      this.committed = med;
      if (this.onCommit) this.onCommit(med);
    }
    return this.committed;
  }

  _median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
}
