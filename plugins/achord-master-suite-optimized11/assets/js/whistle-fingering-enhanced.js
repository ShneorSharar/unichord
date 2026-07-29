/**
 * ========================================
 * Whistle Fingering Module v4.0.0
 * 3 מצבי תצוגה: פאנל | על התווים | אצבוע מלא
 * ========================================
 */

const WhistleFingering = (function () {
    'use strict';

    // =========================================
    // נתוני אצבוע: Tin Whistle D
    // =========================================
    const tinWhistleD_Data = {
        "C4":  { holes:[0,0,0,0,0,0], octave:"low" },
        "Db4": { holes:[0,0,0,0,0,0], octave:"low" },
        "D4":  { holes:[0,0,0,0,0,0], octave:"low" },
        "Eb4": { holes:[0,0,0,0,0,1], octave:"low" },
        "E4":  { holes:[0,0,0,0,0,1], octave:"low" },
        "F4":  { holes:[0,0,0,0,1,0], octave:"low" },
        "F#4": { holes:[0,0,0,0,1,1], octave:"low" },
        "Gb4": { holes:[0,0,0,0,1,1], octave:"low" },
        "G4":  { holes:[0,0,0,1,1,1], octave:"low" },
        "G#4": { holes:[0,0,1,0,1,1], octave:"low" },
        "Ab4": { holes:[0,0,1,0,1,1], octave:"low" },
        "A4":  { holes:[0,0,1,1,1,1], octave:"low" },
        "A#4": { holes:[0,1,0,1,1,1], octave:"low" },
        "Bb4": { holes:[0,1,1,1,1,1], octave:"low" },
        "B4":  { holes:[0,1,1,1,1,1], octave:"low" },
        "C5":  { holes:[1,0,0,1,1,1], octave:"low" },
        "C#5": { holes:[1,0,1,1,1,1], octave:"low" },
        "Db5": { holes:[1,0,1,1,1,1], octave:"low" },
        "D5":  { holes:[0,0,0,0,0,0], octave:"low" },
        "Eb5": { holes:[0,0,0,0,0,1], octave:"high" },
        "E5":  { holes:[0,0,0,0,0,1], octave:"high" },
        "F5":  { holes:[0,0,0,0,1,0], octave:"high" },
        "F#5": { holes:[0,0,0,0,1,1], octave:"high" },
        "Gb5": { holes:[0,0,0,0,1,1], octave:"high" },
        "G5":  { holes:[0,0,0,1,1,1], octave:"high" },
        "G#5": { holes:[0,0,1,0,1,1], octave:"high" },
        "Ab5": { holes:[0,0,1,0,1,1], octave:"high" },
        "A5":  { holes:[0,0,1,1,1,1], octave:"high" },
        "A#5": { holes:[0,1,0,1,1,1], octave:"high" },
        "Bb5": { holes:[0,1,1,1,1,1], octave:"high" },
        "B5":  { holes:[0,1,1,1,1,1], octave:"high" },
        "C6":  { holes:[1,0,0,1,1,1], octave:"high" },
        "C#6": { holes:[1,0,1,1,1,1], octave:"high" },
        "Db6": { holes:[1,0,1,1,1,1], octave:"high" },
        "D6":  { holes:[0,0,0,0,0,0], octave:"high" },
        "Eb6": { holes:[0,0,0,0,0,1], octave:"veryhigh" },
        "E6":  { holes:[0,0,0,0,0,1], octave:"veryhigh" },
        "F6":  { holes:[0,0,0,0,1,0], octave:"veryhigh" },
        "F#6": { holes:[0,0,0,0,1,1], octave:"veryhigh" }
    };

    // =========================================
    // נתוני אצבוע: Recorder Soprano C
    // =========================================
    const recorderSopranoC_Data = {
        "C5":  { holes:[0,0,0,0,0,0,0,0], octave:"low" },
        "C#5": { holes:[0,0,0,0,0,0,1,0], octave:"low" },
        "Db5": { holes:[0,0,0,0,0,0,1,0], octave:"low" },
        "D5":  { holes:[0,0,0,0,0,0,0,1], octave:"low" },
        "D#5": { holes:[0,0,0,0,0,1,1,0], octave:"low" },
        "Eb5": { holes:[0,0,0,0,0,1,1,0], octave:"low" },
        "E5":  { holes:[0,0,0,0,0,0,1,1], octave:"low" },
        "F5":  { holes:[0,0,0,0,0,1,0,1], octave:"low" },
        "F#5": { holes:[0,0,0,1,0,0,1,1], octave:"low" },
        "Gb5": { holes:[0,0,0,1,0,0,1,1], octave:"low" },
        "G5":  { holes:[0,0,0,0,1,1,1,1], octave:"low" },
        "G#5": { holes:[0,0,1,0,1,1,1,1], octave:"low" },
        "Ab5": { holes:[0,0,1,0,1,1,1,1], octave:"low" },
        "A5":  { holes:[0,0,0,1,1,1,1,1], octave:"low" },
        "A#5": { holes:[0,0,1,1,0,1,1,1], octave:"low" },
        "Bb5": { holes:[0,0,1,1,0,1,1,1], octave:"low" },
        "B5":  { holes:[0,0,1,1,1,1,1,1], octave:"low" },
        "C6":  { holes:[0,1,0,1,1,1,1,1], octave:"low" },
        // רגיסטר שני (high) — תוקן לפי Woodwind Fingering Guide (wfg.woodwind.org), טבלת baroque.
        // C#6/D6/Eb6 = "leak notes" עם אגודל פתוח; מ-E6 ומעלה אגודל מנוקב (pinch=0.5).
        "C#6": { holes:[1,0,0,1,1,1,1,1], octave:"high" },
        "Db6": { holes:[1,0,0,1,1,1,1,1], octave:"high" },
        "D6":  { holes:[1,1,0,1,1,1,1,1], octave:"high" },
        "D#6": { holes:[1,1,0,0,0,0,0,1], octave:"high" },
        "Eb6": { holes:[1,1,0,0,0,0,0,1], octave:"high" },
        "E6":  { holes:[0.5,0,0,0,0,0,1,1], octave:"high" },
        "F6":  { holes:[0.5,0,0,0,0,1,0,1], octave:"high" },
        "F#6": { holes:[0.5,0,0,0,1,0,1,1], octave:"high" },
        "Gb6": { holes:[0.5,0,0,0,1,0,1,1], octave:"high" },
        "G6":  { holes:[0.5,0,0,0,1,1,1,1], octave:"high" },
        "G#6": { holes:[0.5,0,0,1,0,1,1,1], octave:"high" },
        "Ab6": { holes:[0.5,0,0,1,0,1,1,1], octave:"high" },
        "A6":  { holes:[0.5,0,0,1,1,1,1,1], octave:"high" },
        "A#6": { holes:[0.5,0,0,1,0,0,0,1], octave:"high" },
        "Bb6": { holes:[0.5,0,0,1,0,0,0,1], octave:"high" },
        "B6":  { holes:[0.5,0,0,1,0,0,1,1], octave:"high" },
        "C7":  { holes:[0.5,0,1,1,0,0,1,1], octave:"high" }
    };

    const pianoOctaveKeys = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    const INSTRUMENT_LABELS = {
        tinwhistle:   '🎶 חליל אירי',
        recorder:     '🎵 חלילון',
        altorecorder: '🪈 חליל אלט',
        piano:        '🎹 פסנתר'
    };

    // =========================================
    // מצב גלובלי
    // =========================================
    let state = {
        instrument:   null,
        visualObj:    null,
        container:    null,
        keyAcc:       {},     // חתימת-סולם: letter -> 'sharp'|'flat'
        noteMap:      null,   // startChar -> שם תו מתוקן (מקור אמת יחיד)
        orderedNotes: null,   // מערך תווים מסודר ({name,startChar}) — cache
        octaveShift:  0,      // התאמת אוקטבה לטווח הכלי (במספרי אוקטבות)
        octaveLabel:  '',     // תווית תצוגה ("מנוגן אוקטבה מעל" וכו')
        modeSingle:   true,   // "תו בודד" — ברירת מחדל: פתוח
        modeScore:    false,  // "על התווים"
        modeFull:     false   // "אצבוע מלא"
    };

    // =========================================
    // המרת pitch לשם תו
    // חשוב: ב-abcjs השדה pitch כבר מקודד אוקטבה (0=דו מרכזי C4),
    // ו-verticalPos שווה ל-pitch — אסור לחבר אותם (היה באג שהכפיל אוקטבות).
    // =========================================
    const NOTE_LETTERS = ['C','D','E','F','G','A','B'];

    function accidentalSymbol(acc) {
        if (acc === 'sharp')    return '#';
        if (acc === 'flat')     return 'b';
        if (acc === 'dblsharp') return '##';
        if (acc === 'dblflat')  return 'bb';
        return ''; // natural
    }

    // אות + אוקטבה מ-pitch בלבד
    function pitchLetterOctave(pitch) {
        const octave = Math.floor(pitch / 7) + 4;
        const idx    = ((pitch % 7) + 7) % 7;
        return { letter: NOTE_LETTERS[idx], octave };
    }

    // שם תו מלא בהינתן accidental אפקטיבי (כולל חתימת-סולם)
    function noteNameFromPitch(pitch, effectiveAccidental) {
        const { letter, octave } = pitchLetterOctave(pitch);
        return letter + accidentalSymbol(effectiveAccidental) + octave;
    }

    // גיבוי (fallback) כשאין noteMap: pitch + accidental מפורש + חתימת-סולם ידועה
    function pitchToNoteName(pitch, accidental) {
        let acc = 'natural';
        if (accidental === 'sharp' || accidental === '#') acc = 'sharp';
        else if (accidental === 'flat' || accidental === 'b') acc = 'flat';
        else if (accidental === 'dblsharp') acc = 'dblsharp';
        else if (accidental === 'dblflat')  acc = 'dblflat';
        const { letter } = pitchLetterOctave(pitch);
        if (acc === 'natural' && state.keyAcc && (letter in state.keyAcc)) acc = state.keyAcc[letter];
        return noteNameFromPitch(pitch, acc);
    }

    // =========================================================
    // אינדקס תווים יחיד (מקור אמת): startChar -> שם תו מתוקן.
    // מיישם חתימת-סולם + מעקב accidental בתוך תיבה (איפוס בכל ברליין),
    // בדיוק כמו כללי הנוטציה. נבנה פעם אחת מה-visualObj.
    // =========================================================
    function buildNoteIndex() {
        const ordered = [];
        const map = {};
        let keyAcc = {};
        if (!state.visualObj || !state.visualObj.lines) {
            state.keyAcc = keyAcc; state.noteMap = map; state.orderedNotes = ordered;
            return ordered;
        }
        state.visualObj.lines.forEach(line => {
            if (!line.staff) return;
            line.staff.forEach(staff => {
                // עדכן חתימת-סולם אם מופיעה בשורה זו (נמשך לשורות הבאות)
                if (staff.key && staff.key.accidentals) {
                    keyAcc = {};
                    staff.key.accidentals.forEach(a => {
                        if (a && a.note) keyAcc[a.note.toUpperCase()] = a.acc;
                    });
                }
                if (!staff.voices) return;
                staff.voices.forEach(voice => {
                    let measureAcc = {};   // accidentals מפורשים — איפוס בכל תיבה
                    voice.forEach(element => {
                        if (element.el_type === 'bar') { measureAcc = {}; return; }
                        if (!element.pitches || !element.pitches.length) return;
                        const p = element.pitches[0];
                        const { letter, octave } = pitchLetterOctave(p.pitch);
                        const pkey = letter + octave;
                        let eff;
                        if (p.accidental) { eff = p.accidental; measureAcc[pkey] = p.accidental; }
                        else if (pkey in measureAcc) { eff = measureAcc[pkey]; }
                        else if (letter in keyAcc)   { eff = keyAcc[letter]; }
                        else eff = 'natural';
                        const name = noteNameFromPitch(p.pitch, eff);
                        const sc = (element.startChar != null) ? element.startChar : Infinity;
                        ordered.push({ name, startChar: sc });
                        if (sc !== Infinity) map[sc] = name;
                    });
                });
            });
        });
        ordered.sort((a, b) => a.startChar - b.startChar);
        state.keyAcc = keyAcc;
        state.noteMap = map;
        state.orderedNotes = ordered;
        return ordered;
    }

    function ensureNoteIndex() {
        if (state.noteMap === null) buildNoteIndex();
        return state.orderedNotes || [];
    }

    // שם תו אמין: קודם מה-noteMap לפי startChar, אחרת fallback מחושב
    function noteNameByStartChar(startChar, pitch, accidental) {
        if (startChar != null && state.noteMap && state.noteMap[startChar] != null) {
            return state.noteMap[startChar];
        }
        return pitchToNoteName(pitch, accidental);
    }

    // =========================================================
    // התאמת אוקטבה אוטומטית לטווח הכלי
    // (שיר שחורג מטווח הכלי מוסט באוקטבות שלמות כדי שיתאים)
    // =========================================================
    const SEMITONE = { 'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,
                       'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11 };

    function nameToSemitone(name) {
        const m = String(name).match(/^([A-G])(#|b)?(-?\d+)$/);
        if (!m) return null;
        const semi = SEMITONE[m[1] + (m[2] || '')];
        if (semi == null) return null;
        return (parseInt(m[3], 10) + 1) * 12 + semi;   // MIDI: C4=60
    }

    const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    function semitoneToName(semi) {
        const octave = Math.floor(semi / 12) - 1;
        return SHARP_NAMES[((semi % 12) + 12) % 12] + octave;
    }

    // חליל אלט (recorder F): אותו אצבוע כמו הסופרן (C), מושמע קווינטה נמוך יותר.
    // לכן האצבוע לתו N בחליל-אלט = האצבוע של הסופרן לתו N+7 חצאי-טונים (קווינטה מעל).
    // נגזר מהמאגר הקיים — ללא המצאת אצבועים (עובדה ידועה במשפחת החליליות).
    function recorderAltoData(name) {
        const s = nameToSemitone(name);
        if (s == null) return undefined;
        return recorderSopranoC_Data[ semitoneToName(s + 7) ];
    }

    // הסטת שם תו ב-k אוקטבות (שומר אות + סימן, משנה רק את המספר)
    function shiftName(name, k) {
        if (!k) return name;
        const m = String(name).match(/^([A-G](?:#|b)?)(-?\d+)$/);
        if (!m) return name;
        return m[1] + (parseInt(m[2], 10) + k);
    }

    // שם התו לחיפוש במאגר האצבוע של הכלי (אחרי הסטת-אוקטבה)
    function fingerName(scoreName) {
        return shiftName(scoreName, state.octaveShift);
    }

    function dataRangeSemitones(dataObj) {
        let lo = Infinity, hi = -Infinity;
        Object.keys(dataObj).forEach(n => {
            const s = nameToSemitone(n);
            if (s == null) return;
            if (s < lo) lo = s;
            if (s > hi) hi = s;
        });
        return { lo, hi };
    }

    function instrumentRange(instrument) {
        if (instrument === 'recorder')   return dataRangeSemitones(recorderSopranoC_Data);
        if (instrument === 'tinwhistle') return dataRangeSemitones(tinWhistleD_Data);
        if (instrument === 'altorecorder') {
            // טווח כתוב = טווח הסופרן מוסט קווינטה (7 חצאי-טונים) מטה
            const r = dataRangeSemitones(recorderSopranoC_Data);
            return { lo: r.lo - 7, hi: r.hi - 7 };
        }
        return null; // פסנתר — ללא הגבלת טווח
    }

    // בחר הסטת-אוקטבה שתמקסם את מספר התווים שנכנסים לטווח הכלי
    function computeOctaveShift(instrument) {
        if (instrument === 'piano') return { shift: 0, label: '' };
        const range = instrumentRange(instrument);
        const notes = collectAllNotes().map(o => nameToSemitone(o.name)).filter(s => s != null);
        if (!range || !notes.length) return { shift: 0, label: '' };
        let best = { shift: 0, inRange: -1 };
        for (let k = -4; k <= 4; k++) {
            let c = 0;
            for (const s of notes) { const t = s + k * 12; if (t >= range.lo && t <= range.hi) c++; }
            if (c > best.inRange || (c === best.inRange && Math.abs(k) < Math.abs(best.shift))) {
                best = { shift: k, inRange: c };
            }
        }
        let label = '';
        if (best.shift > 0)      label = best.shift === 1  ? 'מנוגן אוקטבה מעל'   : `מנוגן ${best.shift} אוקטבות מעל`;
        else if (best.shift < 0) label = best.shift === -1 ? 'מנוגן אוקטבה מתחת' : `מנוגן ${-best.shift} אוקטבות מתחת`;
        return { shift: best.shift, label };
    }

    // =========================================================
    // SVG — "על התווים": קוד מקורי (גודל קטן, מעל התווים)
    // =========================================================
    function svgWhistleOrig(fd, width, height) {
        if (!fd) return `<svg width="${width}" height="${height}"></svg>`;
        const holes = fd.holes;
        const whistleWidth = 12;
        const whistleX     = (width - whistleWidth) / 2;
        const holeRadius   = 4;
        const holeSpacing  = height / 8;
        const startY       = holeSpacing;
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect x="${whistleX}" y="0" width="${whistleWidth}" height="${height}" fill="var(--border-color,#8B4513)" rx="6" ry="6" opacity="0.3"/>`;
        for (let i = 0; i < 6; i++) {
            const y = startY + i * holeSpacing;
            const isOpen = fd.holes[i] === 1;
            svg += `<circle cx="${width/2}" cy="${y}" r="${holeRadius}"
                fill="${isOpen ? 'var(--bg-song,#ffffff)' : 'var(--text-primary,#000000)'}"
                stroke="var(--text-primary,#000000)" stroke-width="${isOpen ? 2 : 1}"/>`;
        }
        if (fd.octave === 'veryhigh') svg += `<text x="${width/2}" y="${height-2}" text-anchor="middle" font-size="9" fill="var(--text-primary,#000)">↑↑</text>`;
        else if (fd.octave === 'high') svg += `<text x="${width/2}" y="${height-2}" text-anchor="middle" font-size="9" fill="var(--text-primary,#000)">↑</text>`;
        svg += `</svg>`;
        return svg;
    }

    function svgRecorderOrig(fd, width, height) {
        if (!fd) return `<svg width="${width}" height="${height}"></svg>`;
        const holes        = fd.holes;
        const whistleWidth = 12;
        const whistleX     = (width - whistleWidth) / 2;
        const cx           = width / 2;
        const radius       = 3.5;
        const thumbR       = 2.6;                         // אגודל קטן יותר — בולט כשונה
        const pad          = radius + 1;
        const thumbCy      = pad;
        const frontTop     = thumbCy + radius + thumbR + radius * 0.7;  // מרווח אחרי האגודל
        const frontBottom  = height - pad;
        const frontSpacing = (frontBottom - frontTop) / 6;             // 7 חורים קדמיים, 6 מרווחים
        const hole = (hx, hy, hr, h, thumb) => {
            const stroke = thumb ? '#c47a25' : 'var(--text-primary,#000000)';
            if (h === 0.5) {
                // אגודל מנוקב (pinch / חצי-חור) — חצי תחתון מלא + קו-חוצה ברור
                return `<circle cx="${hx}" cy="${hy}" r="${hr}" fill="var(--bg-song,#ffffff)" stroke="${stroke}" stroke-width="1.2"/>`
                     + `<path d="M ${hx-hr} ${hy} A ${hr} ${hr} 0 0 1 ${hx+hr} ${hy} Z" fill="var(--text-primary,#000)" stroke="none"/>`
                     + `<line x1="${hx-hr}" y1="${hy}" x2="${hx+hr}" y2="${hy}" stroke="var(--text-primary,#000)" stroke-width="0.8"/>`;
            }
            const isOpen = h === 1;
            const sw = thumb ? 1.8 : (isOpen ? 2 : 1);
            return `<circle cx="${hx}" cy="${hy}" r="${hr}" fill="${isOpen ? 'var(--bg-song,#ffffff)' : 'var(--text-primary,#000000)'}" stroke="${stroke}" stroke-width="${sw}"/>`;
        };
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect x="${whistleX}" y="0" width="${whistleWidth}" height="${height}" fill="var(--border-color,#654321)" rx="6" ry="6" opacity="0.35"/>`;
        // חור אגודל (גב הכלי) — ממורכז כמו החורים הקדמיים, אך קטן יותר + טבעת זהב + תווית T
        const thumbCx = cx;
        svg += hole(thumbCx, thumbCy, thumbR, holes[0], true);
        svg += `<text x="${thumbCx + radius + 1}" y="${thumbCy + thumbR*0.6}" text-anchor="start" font-size="8" font-weight="bold" fill="#c47a25" style="font-family:sans-serif">T</text>`;
        // 7 חורים קדמיים
        for (let i = 1; i < 8; i++) {
            svg += hole(cx, frontTop + (i - 1) * frontSpacing, radius, holes[i], false);
        }
        if (fd.octave === 'high') svg += `<text x="${cx}" y="${height-2}" text-anchor="middle" font-size="9" fill="var(--text-primary,#000)">↑</text>`;
        svg += `</svg>`;
        return svg;
    }

    function svgPianoOrig(noteName, width, height) {
        if (!noteName) return `<svg width="${width}" height="${height}"></svg>`;
        const m = noteName.match(/^([A-G][#b]?)(\d+)$/);
        if (!m) return `<svg width="${width}" height="${height}"></svg>`;
        const note   = m[1].replace('b','#');
        const octave = m[2];
        const ai     = pianoOctaveKeys.indexOf(note);
        if (ai === -1) return `<svg width="${width}" height="${height}"></svg>`;
        const keyH    = height / 7;
        const blackH  = keyH * 0.75;
        const blackW  = width * 0.67;
        const circleR = 5;
        const circleY = -8;
        let svg = `<svg width="${width}" height="${height+15}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<circle cx="${width/2}" cy="${circleY}" r="${circleR}" fill="#fff" stroke="#333" stroke-width="1.5"/>`;
        svg += `<text x="${width/2}" y="${circleY+3}" text-anchor="middle" font-size="7" font-weight="bold" fill="#333" style="font-family:sans-serif">${octave}</text>`;
        svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#eee" stroke="#333" stroke-width="2" rx="3"/>`;
        svg += `<text x="${width/2}" y="-3" text-anchor="middle" font-size="8" font-weight="bold" fill="#333" style="font-family:sans-serif">${noteName}</text>`;
        const whiteKeys = ['C','D','E','F','G','A','B'];
        whiteKeys.forEach((k, i) => {
            const y = height - (i+1)*keyH;
            const isActive = (k === note && !note.includes('#'));
            svg += `<rect x="0" y="${y}" width="${width}" height="${keyH}" fill="${isActive ? '#FF4444' : 'white'}" stroke="#333" stroke-width="1"/>`;
        });
        const blackKeys = [
            {note:'C#',after:0},{note:'D#',after:1},
            {note:'F#',after:3},{note:'G#',after:4},{note:'A#',after:5}
        ];
        blackKeys.forEach(({note:bk, after}) => {
            const y = height - (after+1)*keyH - blackH/2;
            const isActive = bk === note;
            svg += `<rect x="0" y="${y}" width="${blackW}" height="${blackH}" fill="${isActive ? '#FFD700' : '#222'}" stroke="#000" stroke-width="1.5" rx="2"/>`;
        });
        svg += `</svg>`;
        return svg;
    }

    // =========================================================
    // SVG — פאנל ו"אצבוע מלא": גרסה גדולה ומשופרת
    // =========================================================
    function svgWhistleLarge(fd, width, height) {
        if (!fd) return `<svg width="${width}" height="${height}"></svg>`;
        const bodyW   = Math.round(width * 0.55);
        const bodyX   = (width - bodyW) / 2;
        const radius  = Math.max(3, Math.round(width * 0.18));
        const spacing = (height - radius * 2) / 7;
        const startY  = radius + spacing * 0.5;
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="white" rx="5" opacity="0.92"/>`;
        svg += `<rect x="${bodyX}" y="0" width="${bodyW}" height="${height}" fill="#c8a96e" rx="6" stroke="#8B5e2a" stroke-width="1.2"/>`;
        for (let i = 0; i < 6; i++) {
            const cy = startY + i * spacing;
            const isOpen = fd.holes[i] === 1;
            svg += `<circle cx="${width/2}" cy="${cy}" r="${radius}" fill="${isOpen ? '#fff' : '#1d3461'}" stroke="#1d3461" stroke-width="${isOpen ? 1.5 : 0.8}"/>`;
        }
        if (fd.octave === 'veryhigh') svg += `<text x="${width/2}" y="${height-2}" text-anchor="middle" font-size="${Math.max(8,width*0.22)}" font-weight="bold" fill="#e74c3c" style="font-family:sans-serif">↑↑</text>`;
        else if (fd.octave === 'high') svg += `<text x="${width/2}" y="${height-2}" text-anchor="middle" font-size="${Math.max(8,width*0.22)}" font-weight="bold" fill="#e67e22" style="font-family:sans-serif">↑</text>`;
        svg += `</svg>`;
        return svg;
    }

    function svgRecorderLarge(fd, width, height) {
        if (!fd) return `<svg width="${width}" height="${height}"></svg>`;
        const bodyW   = Math.round(width * 0.55);
        const bodyX   = (width - bodyW) / 2;
        const cx      = width / 2;
        const radius  = Math.max(2.5, Math.round(width * 0.16));
        const thumbR  = Math.max(2, radius * 0.78);        // אגודל קטן יותר — בולט כשונה
        const pad     = radius + 2;
        const thumbCy = pad;
        const frontTop     = thumbCy + radius + thumbR + radius * 0.8;  // מרווח אחרי האגודל
        const frontBottom  = height - pad;
        const frontSpacing = (frontBottom - frontTop) / 6;             // 7 חורים קדמיים, 6 מרווחים
        const hole = (hx, hy, hr, h, thumb) => {
            const stroke = thumb ? '#c47a25' : '#1d3461';
            if (h === 0.5) {
                // אגודל מנוקב (pinch / חצי-חור) — חצי תחתון מלא + קו-חוצה ברור, נראה גם בקטן
                return `<circle cx="${hx}" cy="${hy}" r="${hr}" fill="white" stroke="${stroke}" stroke-width="1.4"/>`
                     + `<path d="M ${hx-hr} ${hy} A ${hr} ${hr} 0 0 1 ${hx+hr} ${hy} Z" fill="#1d3461" stroke="none"/>`
                     + `<line x1="${hx-hr}" y1="${hy}" x2="${hx+hr}" y2="${hy}" stroke="#1d3461" stroke-width="0.9"/>`;
            }
            const isOpen = h === 1;
            const sw = thumb ? 2.2 : (isOpen ? 1.5 : 0.8);
            return `<circle cx="${hx}" cy="${hy}" r="${hr}" fill="${isOpen ? '#fff' : '#1d3461'}" stroke="${stroke}" stroke-width="${sw}"/>`;
        };
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="white" rx="5" opacity="0.92"/>`;
        svg += `<rect x="${bodyX}" y="0" width="${bodyW}" height="${height}" fill="#d4a96a" rx="6" stroke="#7a5230" stroke-width="1.2"/>`;
        // חור אגודל (גב הכלי) — ממורכז כמו החורים הקדמיים, אך קטן יותר + טבעת זהב + תווית T
        const thumbCx = cx;
        svg += hole(thumbCx, thumbCy, thumbR, fd.holes[0], true);
        svg += `<text x="${thumbCx + radius + 2}" y="${thumbCy + thumbR*0.55}" text-anchor="start" font-size="${Math.max(7,width*0.2)}" fill="#c47a25" style="font-family:sans-serif;font-weight:bold">T</text>`;
        // 7 חורים קדמיים
        for (let i = 1; i < 8; i++) {
            svg += hole(cx, frontTop + (i - 1) * frontSpacing, radius, fd.holes[i], false);
        }
        if (fd.octave === 'high') svg += `<text x="${cx}" y="${height-2}" text-anchor="middle" font-size="${Math.max(8,width*0.2)}" font-weight="bold" fill="#e67e22" style="font-family:sans-serif">↑</text>`;
        svg += `</svg>`;
        return svg;
    }

    function svgPianoLarge(noteName, width, height) {
        if (!noteName) return `<svg width="${width}" height="${height}"></svg>`;
        const m = noteName.match(/^([A-G][#b]?)(\d+)$/);
        if (!m) return `<svg width="${width}" height="${height}"></svg>`;
        const note   = m[1].replace('b','#');
        const octave = m[2];
        const ai     = pianoOctaveKeys.indexOf(note);
        if (ai === -1) return `<svg width="${width}" height="${height}"></svg>`;
        const keyH   = height / 7;
        const blackH = keyH * 0.72;
        const blackW = width * 0.62;
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#f0ece4" rx="4" stroke="#999" stroke-width="1.5"/>`;
        const whiteKeys = ['C','D','E','F','G','A','B'];
        whiteKeys.forEach((k, i) => {
            const y = height - (i+1)*keyH;
            const isActive = (k === note && !note.includes('#'));
            svg += `<rect x="0" y="${y}" width="${width}" height="${keyH}" fill="${isActive ? '#e74c3c' : 'white'}" stroke="#888" stroke-width="0.8"/>`;
            if (isActive) svg += `<text x="${width/2}" y="${y+keyH*0.65}" text-anchor="middle" font-size="${Math.max(7,width*0.28)}" fill="white" font-weight="bold" style="font-family:sans-serif">${note}</text>`;
        });
        const blackKeys = [
            {note:'C#',after:0},{note:'D#',after:1},
            {note:'F#',after:3},{note:'G#',after:4},{note:'A#',after:5}
        ];
        blackKeys.forEach(({note:bk, after}) => {
            const y = height - (after+1)*keyH - blackH/2;
            const isActive = bk === note;
            svg += `<rect x="0" y="${y}" width="${blackW}" height="${blackH}" fill="${isActive ? '#f39c12' : '#222'}" stroke="#000" stroke-width="1" rx="2"/>`;
        });
        svg += `<text x="${width}" y="10" text-anchor="end" font-size="${Math.max(7,width*0.3)}" fill="#555" style="font-family:sans-serif">${octave}</text>`;
        svg += `</svg>`;
        return svg;
    }

    // =========================================================
    // קבלת SVG לפאנל (גדול) לפי כלי
    // =========================================================
    function getPanelSVG(noteName) {
        const fn = fingerName(noteName);   // עם הסטת-אוקטבה לטווח הכלי
        if (state.instrument === 'piano') {
            return svgPianoLarge(fn, 44, 190);
        } else if (state.instrument === 'recorder') {
            const fd = recorderSopranoC_Data[fn];
            return fd ? svgRecorderLarge(fd, 54, 165)
                      : `<p class="wp-no-data">התו ${noteName} מחוץ לטווח החלילון</p>`;
        } else if (state.instrument === 'altorecorder') {
            const fd = recorderAltoData(fn);
            return fd ? svgRecorderLarge(fd, 54, 165)
                      : `<p class="wp-no-data">התו ${noteName} מחוץ לטווח חליל האלט</p>`;
        } else {
            const fd = tinWhistleD_Data[fn];
            return fd ? svgWhistleLarge(fd, 54, 148)
                      : `<p class="wp-no-data">התו ${noteName} מחוץ לטווח החליל</p>`;
        }
    }

    // =========================================================
    // איסוף כל התווים מה-visualObj בסדר הופעה
    // =========================================================
    function collectAllNotes() {
        // מקור אמת יחיד — אינדקס מתוקן (אוקטבות + חתימת-סולם + accidentals בתיבה)
        return ensureNoteIndex();
    }

    // =========================================================
    // מצב 1: פאנל (תו אחד, מתעדכן)
    // =========================================================
    function buildPanel() {
        removePanel();
        const wrapper = state.container ? state.container.closest('.tavim-wrapper') : null;
        if (!wrapper) return;

        const panel = document.createElement('div');
        panel.id = 'whistle-panel';
        panel.innerHTML = `
            <div class="wp-panel-title">📖 תו נוכחי — לחץ על תו לצפייה</div>
            <div class="wp-header">
                <span class="wp-instrument-label">${INSTRUMENT_LABELS[state.instrument] || ''}${state.octaveLabel ? ' · ' + state.octaveLabel : ''}</span>
                <span class="wp-note-name">—</span>
                <div class="wp-mode-btns">
                    <button id="wp-btn-score"  class="wp-mode-btn" title="הצג אצבוע על התווים">על התווים</button>
                    <button id="wp-btn-single" class="wp-mode-btn wp-mode-btn--active" title="הצג תו בודד">תו בודד</button>
                    <button id="wp-btn-full"   class="wp-mode-btn" title="הצג את כל האצבוע למטה">אצבוע מלא</button>
                </div>
            </div>
            <div class="wp-diagram-area">
                <div class="wp-diagram"></div>
                <p class="wp-hint">לחץ על תו בתווים, או לחץ ▶️ נגן לסנכרון אוטומטי</p>
            </div>
        `;
        wrapper.appendChild(panel);

        // כפתור "על התווים"
        document.getElementById('wp-btn-score').addEventListener('click', function () {
            state.modeScore = !state.modeScore;
            this.classList.toggle('wp-mode-btn--active', state.modeScore);
            state.modeScore ? addScoreOrigFingerings() : removeScoreFingerings();
        });

        // כפתור "תו בודד" — toggle: כיבוי/הפעלה
        document.getElementById('wp-btn-single').addEventListener('click', function () {
            state.modeSingle = !state.modeSingle;
            this.classList.toggle('wp-mode-btn--active', state.modeSingle);
            const diagArea = panel.querySelector('.wp-diagram-area');
            if (diagArea) diagArea.style.display = state.modeSingle ? '' : 'none';
        });

        // כפתור "אצבוע מלא" — כיבוי "תו בודד" אם פעיל
        document.getElementById('wp-btn-full').addEventListener('click', function () {
            state.modeFull = !state.modeFull;
            this.classList.toggle('wp-mode-btn--active', state.modeFull);
            if (state.modeFull) {
                buildFullPanel();
                // כבה תו בודד
                if (state.modeSingle) {
                    state.modeSingle = false;
                    const singleBtn = document.getElementById('wp-btn-single');
                    if (singleBtn) singleBtn.classList.remove('wp-mode-btn--active');
                    const diagArea = panel.querySelector('.wp-diagram-area');
                    if (diagArea) diagArea.style.display = 'none';
                }
            } else {
                removeFullPanel();
            }
        });

        // שמור מצב כפתורים בהתאם למצב קיים
        if (state.modeScore)  document.getElementById('wp-btn-score').classList.add('wp-mode-btn--active');
        if (state.modeFull)   document.getElementById('wp-btn-full').classList.add('wp-mode-btn--active');
        if (!state.modeSingle) {
            document.getElementById('wp-btn-single').classList.remove('wp-mode-btn--active');
            const diagArea = panel.querySelector('.wp-diagram-area');
            if (diagArea) diagArea.style.display = 'none';
        }
    }

    function removePanel() {
        const p = document.getElementById('whistle-panel');
        if (p) p.remove();
    }

    function updatePanelNote(noteName, startChar) {
        const panel = document.getElementById('whistle-panel');
        if (!panel) return;
        const noteEl = panel.querySelector('.wp-note-name');
        const diagEl = panel.querySelector('.wp-diagram');
        const hint   = panel.querySelector('.wp-hint');
        if (noteEl) noteEl.textContent = state.octaveShift ? `${noteName} → ${fingerName(noteName)}` : noteName;
        if (hint)   hint.style.display = 'none';
        if (diagEl) diagEl.innerHTML = getPanelSVG(noteName);

        // עדכון ה"אצבוע מלא" — הדגשת התו המדויק לפי startChar
        highlightFullPanelNote(noteName, startChar);
    }

    // =========================================================
    // מצב 2: "על התווים" — קוד מקורי (מעל התווים, בתוך SVG)
    // =========================================================
    function addScoreOrigFingerings() {
        removeScoreFingerings();
        if (!state.visualObj || !state.container) return;
        const svg = state.container.querySelector('svg');
        if (!svg) return;

        let svgGen, getData, svgW, svgH, yOff;

        if (state.instrument === 'piano') {
            svgGen  = (n) => svgPianoOrig(n, 9, 75);
            getData = (n) => n;
            svgW = 9; svgH = 75; yOff = 100;
        } else if (state.instrument === 'recorder') {
            svgGen  = (fd) => svgRecorderOrig(fd, 20, 75);
            getData = (n) => recorderSopranoC_Data[n];
            svgW = 20; svgH = 75; yOff = 80;
        } else if (state.instrument === 'altorecorder') {
            svgGen  = (fd) => svgRecorderOrig(fd, 20, 75);
            getData = (n) => recorderAltoData(n);
            svgW = 20; svgH = 75; yOff = 80;
        } else {
            svgGen  = (fd) => svgWhistleOrig(fd, 20, 55);
            getData = (n) => tinWhistleD_Data[n];
            svgW = 20; svgH = 55; yOff = 60;
        }

        svg.style.overflow = 'visible';
        state.container.style.marginBottom = '20px';

        state.visualObj.lines.forEach(line => {
            if (!line.staff) return;
            line.staff.forEach(staff => {
                if (!staff.voices) return;
                staff.voices.forEach(voice => {
                    voice.forEach(element => {
                        if (!element.pitches || !element.pitches.length) return;
                        if (!element.abselem || !element.abselem.elemset || !element.abselem.elemset.length) return;
                        const p    = element.pitches[0];
                        const name = noteNameByStartChar(element.startChar, p.pitch, p.accidental);
                        const fn   = fingerName(name);   // הסטת-אוקטבה לטווח הכלי
                        const fd   = getData(fn);
                        if (!fd) return;
                        const svgStr = (state.instrument === 'piano') ? svgGen(fn) : svgGen(fd);
                        const noteEl = element.abselem.elemset[0];
                        const bbox   = noteEl.getBBox();
                        const x = bbox.x + bbox.width / 2 - svgW / 2;
                        const y = bbox.y - yOff;
                        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        g.setAttribute('class', 'whistle-fingering');
                        g.setAttribute('style', 'overflow:visible');
                        g.setAttribute('transform', `translate(${x},${y})`);
                        g.innerHTML = svgStr;
                        svg.appendChild(g);
                    });
                });
            });
        });
    }

    function removeScoreFingerings() {
        if (!state.container) return;
        state.container.querySelectorAll('.whistle-fingering').forEach(el => el.remove());
        const svg = state.container.querySelector('svg');
        if (svg) svg.style.overflow = '';
        if (state.container) state.container.style.marginBottom = '';
    }

    // =========================================================
    // מצב 3: "אצבוע מלא" — כל התווים בסדר, מתחת לנגן
    // =========================================================
    function buildFullPanel() {
        removeFullPanel();
        const wrapper = state.container ? state.container.closest('.tavim-wrapper') : null;
        if (!wrapper) return;

        const notes = collectAllNotes();
        if (!notes.length) return;

        const full = document.createElement('div');
        full.id = 'whistle-full-panel';

        const titleExtra = state.octaveLabel ? ` · ${state.octaveLabel}` : '';
        let html = `<div class="wfp-title">${INSTRUMENT_LABELS[state.instrument] || ''} — אצבוע מלא (${notes.length} תווים${titleExtra})</div>`;
        html += `<div class="wfp-strip">`;

        notes.forEach((noteObj, idx) => {
            const noteName  = noteObj.name;
            const startChar = noteObj.startChar;
            const fn        = fingerName(noteName);   // הסטת-אוקטבה לטווח הכלי
            let svgHtml;
            if (state.instrument === 'piano') {
                svgHtml = svgPianoLarge(fn, 28, 120);
            } else if (state.instrument === 'recorder') {
                const fd = recorderSopranoC_Data[fn];
                svgHtml = fd ? svgRecorderLarge(fd, 32, 105) : '';
            } else if (state.instrument === 'altorecorder') {
                const fd = recorderAltoData(fn);
                svgHtml = fd ? svgRecorderLarge(fd, 32, 105) : '';
            } else {
                const fd = tinWhistleD_Data[fn];
                svgHtml = fd ? svgWhistleLarge(fd, 32, 90) : '';
            }
            // תו שעדיין מחוץ לטווח (גם אחרי הסטה) — כתא "מחוץ לטווח" כדי לשמור 1:1 מול התווים
            if (!svgHtml) {
                html += `<div class="wfp-note wfp-note--oor" data-note="${noteName}" data-startchar="${startChar}" data-idx="${idx}" title="מחוץ לטווח הכלי">
                    <div class="wfp-svg" style="display:flex;align-items:center;justify-content:center;min-height:88px;color:#c0392b;opacity:.45;font-size:22px;font-weight:bold">✕</div>
                    <div class="wfp-label">${noteName}</div>
                </div>`;
                return;
            }
            // data-startchar מאפשר מיקום מדויק של התו — ייחודי לכל תו
            // כשיש הסטת-אוקטבה: התווית מציגה "כתוב → מנוגן" כדי שהאצבוע יתאים לתו המנוגן
            const labelTxt   = (state.octaveShift && fn !== noteName) ? `${noteName}→${fn}` : noteName;
            const labelStyle = (state.octaveShift && fn !== noteName) ? ' style="font-size:11px;letter-spacing:-.3px;white-space:nowrap"' : '';
            html += `<div class="wfp-note" data-note="${noteName}" data-startchar="${startChar}" data-idx="${idx}">
                <div class="wfp-svg">${svgHtml}</div>
                <div class="wfp-label"${labelStyle}>${labelTxt}</div>
            </div>`;
        });
        html += `</div>`;
        full.innerHTML = html;
        wrapper.appendChild(full);
    }

    function removeFullPanel() {
        const f = document.getElementById('whistle-full-panel');
        if (f) f.remove();
    }

    function highlightFullPanelNote(noteName, startChar) {
        const full = document.getElementById('whistle-full-panel');
        if (!full) return;
        full.querySelectorAll('.wfp-note').forEach(el => el.classList.remove('wfp-note--active'));
        // חפש לפי startChar (ייחודי) — גיבוי: לפי שם
        let found = null;
        if (startChar != null) {
            found = full.querySelector(`.wfp-note[data-startchar="${startChar}"]`);
        }
        if (!found) {
            found = full.querySelector(`.wfp-note[data-note="${noteName}"]`);
        }
        if (found) {
            found.classList.add('wfp-note--active');
            found.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    // =========================================================
    // לחיצה על תו — דרך clickListener של ABCJS (אמין ומדויק)
    // =========================================================
    function setupNoteClickListener() {
        document.addEventListener('achord-note-clicked', function(e) {
            if (!state.instrument) return;
            const abcElem = e.detail && e.detail.abcElem;
            if (!abcElem || !abcElem.pitches || !abcElem.pitches.length) return;
            const p         = abcElem.pitches[0];
            const startChar = abcElem.startChar;   // מיקום ייחודי בטקסט ABC
            const name      = noteNameByStartChar(startChar, p.pitch, p.accidental);
            updatePanelNote(name, startChar);
        });
    }

    // =========================================================
    // כפתורי כלי הנגינה ב-tavim-controls
    // =========================================================
    function createInstrumentButtons() {
        const ctrl = document.querySelector('.tavim-controls');
        if (!ctrl || document.getElementById('whistle-tin-toggle')) return;

        const configs = [
            { id:'whistle-tin-toggle',   type:'tinwhistle',   color:'#27ae60' },
            { id:'whistle-rec-toggle',   type:'recorder',     color:'#2980b9' },
            { id:'whistle-alto-toggle',  type:'altorecorder', color:'#16a085' },
            { id:'whistle-piano-toggle', type:'piano',         color:'#8e44ad' }
        ];
        const tempoBtn = document.getElementById('tavim-tempo');

        configs.forEach(cfg => {
            const btn = document.createElement('button');
            btn.id            = cfg.id;
            btn.className     = 'button whistle-btn';
            btn.innerHTML     = INSTRUMENT_LABELS[cfg.type];
            btn.dataset.type  = cfg.type;
            btn.dataset.color = cfg.color;
            btn.addEventListener('click', () => toggleInstrument(cfg.type));
            if (tempoBtn && tempoBtn.nextSibling) {
                ctrl.insertBefore(btn, tempoBtn.nextSibling);
            } else {
                ctrl.appendChild(btn);
            }
        });
    }

    function updateButtonStyles(activeType) {
        ['whistle-tin-toggle','whistle-rec-toggle','whistle-alto-toggle','whistle-piano-toggle'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            if (btn.dataset.type === activeType) {
                btn.style.backgroundColor = btn.dataset.color;
                btn.style.color           = 'white';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color           = '';
            }
        });
    }

    function toggleInstrument(type) {
        if (state.instrument === type) {
            // כיבוי
            state.instrument = null;
            state.octaveShift = 0;
            state.octaveLabel = '';
            updateButtonStyles(null);
            removePanel();
            removeScoreFingerings();
            removeFullPanel();
            state.modeScore = false;
            state.modeFull  = false;
        } else {
            // החלפה/הפעלה
            const prevInstrument = state.instrument;
            if (prevInstrument) {
                removeScoreFingerings();
                removeFullPanel();
            }
            state.instrument = type;
            // התאמת אוקטבה אוטומטית לטווח הכלי הנבחר
            const oc = computeOctaveShift(type);
            state.octaveShift = oc.shift;
            state.octaveLabel = oc.label;
            updateButtonStyles(type);
            buildPanel();
            // שחזר מצבים פעילים
            if (state.modeScore) addScoreOrigFingerings();
            if (state.modeFull)  buildFullPanel();
        }
    }

    // =========================================================
    // מצב נגן — תרגול נגינה בתוך העמוד: סמן זז תו-תו על החמשה,
    // לומדים גם לקרוא את התו (מודגש על החמשה) וגם את האצבוע. האצבוע מוצג
    // לתווים חדשים (פעם-פעמיים) ומתפוגג למוכרים; "הצג אצבוע" כשמתקשים.
    // =========================================================
    var player = { notes: [], idx: -1, seen: {}, active: false, forced: false, hlEl: null };
    var SHOW_TIMES = 2;   // כמה פעמים מראים אצבוע לתו לפני שהוא "מוכר"
    var SOLFEGE = { C: 'דו', D: 'רה', E: 'מי', F: 'פה', G: 'סול', A: 'לה', B: 'סי' };
    function solfege(name) { return SOLFEGE[String(name)[0]] || ''; }

    // =========================================================
    // זיהוי נגינה במיקרופון (אופציונלי) — כשמנגנים את התו, עוברים לתו הבא.
    // משתמש במנוע הזיהוי הקיים (assets/js/pitch/pitch-engine.js) עם ברירות-מחדל
    // אמינות ממחקר (A4=440, clarity 0.90, חלון-תדר לכל כלי, קיפול-אוקטבה) —
    // ללא שום מסך כיול. הכל נטען דינמית רק כשמדליקים את התכונה.
    // =========================================================
    var mic = { engine: null, tracker: null, on: false, loading: false,
                expectedMidi: null, gateReleased: true, prevPC: null, statusEl: null,
                primedCtx: null };

    // iOS Safari: AudioContext חייב להיווצר ולעבור resume *בתוך* מחוות-המשתמש.
    // טעינת המנוע היא `await import(...)` (מאקרו-טאסק רשת) ששובר את המחווה, ואז ה-ctx
    // שנוצר ב-start() נשאר suspended → שקט מוחלט ("לא מגיב באייפון"). לכן יוצרים
    // ומפעילים את ה-ctx כאן, סינכרונית במחווה, לפני ה-import; המנוע יאמץ אותו.
    function primeAudioInGesture() {
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            if (!mic.primedCtx || mic.primedCtx.state === 'closed') mic.primedCtx = new AC();
            mic.primedCtx.resume();
            // באפר-שקט בן דגימה אחת — משחרר את מנוע האודיו ב-iOS
            var b = mic.primedCtx.createBuffer(1, 1, 22050);
            var s = mic.primedCtx.createBufferSource();
            s.buffer = b; s.connect(mic.primedCtx.destination); s.start(0);
        } catch (e) { /* לא קריטי */ }
    }
    // מיפוי כלי-האצבוע לפרופיל-התדר של מנוע הזיהוי (חלון-תדר לדחיית ארטיפקטים)
    var MIC_INSTR = { tinwhistle: 'tinwhistle', recorder: 'recorder', altorecorder: 'flute', piano: 'piano' };
    function micInstrument() { return MIC_INSTR[state.instrument] || 'flute'; }

    // מאתר את ספריית הפלאגין כדי לטעון את ה-ESM של המנוע
    function pluginBaseUrl() {
        if (window.ams_ajax_data && window.ams_ajax_data.plugin_url) return window.ams_ajax_data.plugin_url;
        var s = document.querySelector('script[src*="whistle-fingering-enhanced"]');
        if (s && s.src) return s.src.replace(/assets\/js\/whistle-fingering-enhanced\.js.*$/, '');
        return '/wp-content/plugins/achord-master-suite-optimized11/';
    }

    function setMicStatus(msg) { if (mic.statusEl) mic.statusEl.textContent = msg; }

    function updateMicBtn() {
        var b = document.getElementById('wpl-mic');
        if (!b) return;
        b.textContent = mic.on ? '🎤 זיהוי נגינה פעיל' : '🎤 הפעל זיהוי נגינה';
        b.style.background = mic.on ? '#2e9e5b' : 'transparent';
        b.style.color = mic.on ? '#fff' : '#0D1B33';
        b.style.borderColor = mic.on ? '#2e9e5b' : '#d8cfc0';
    }

    // טעינה עצלה של מנוע הזיהוי (פעם אחת)
    async function ensureMicEngine() {
        if (mic.engine) return true;
        if (mic.loading) return false;
        mic.loading = true;
        try {
            var mod = await import(pluginBaseUrl() + 'assets/js/pitch/pitch-engine.js');
            mic.engine = new mod.PitchEngine({ instrument: micInstrument() });
            mic.tracker = new mod.StabilityTracker({ onCommit: onMicCommit });
            mic.engine.onStatus = function (s) { setMicStatus(s.message); };
            mic.loading = false;
            return true;
        } catch (e) {
            mic.loading = false;
            setMicStatus('שגיאה בטעינת מנוע הזיהוי.');
            return false;
        }
    }

    // התחלת האזנה (חייב להיקרא מתוך מחווה — לחיצה על הכפתור — בשל iOS)
    async function micStart() {
        var ok = await ensureMicEngine();
        if (!ok) return false;
        // מאמצים את ה-AudioContext שהופעל במחווה (לפני ה-import) — כך הוא כבר running
        // כשהמיקרופון מתחבר, גם אם ה-import שבר את חלון המחווה (קריטי ל-iOS).
        if (mic.primedCtx && !mic.engine.ctx) mic.engine.ctx = mic.primedCtx;
        mic.engine.setInstrument(micInstrument());
        return await mic.engine.start(function (reading) {
            mic.tracker.push(reading, performance.now());
        });
    }

    // "מזיין" את הזיהוי לתו הנוכחי: התו המנוגן (אחרי הסטת-אוקטבה), בקיפול-אוקטבה
    function armMicForStep() {
        if (!mic.on || !player.active || !mic.tracker) return;
        mic.tracker.reset();
        var cur = player.notes[player.idx];
        if (!cur) { mic.expectedMidi = null; return; }
        mic.expectedMidi = nameToSemitone(fingerName(cur.name));
        if (mic.expectedMidi == null) { setMicStatus('התו הזה מחוץ לטווח הכלי'); return; }
        var pc = ((mic.expectedMidi % 12) + 12) % 12;
        // צריך "שחרור" (שקט) רק אם התו הבא זהה למחלקת-הגובה של התו שזה עתה נוגן —
        // כדי שתו סוסטיין יחיד לא יקפיץ דרך תווים חוזרים; תווים שונים בלגאטו מתקדמים מיד.
        mic.gateReleased = (pc !== mic.prevPC);
        setMicStatus('🎤 נגן/י ' + fingerName(cur.name));
    }

    function onMicCommit(midi) {
        if (!mic.on) return;
        if (midi == null) { mic.gateReleased = true; return; }   // שקט = שחרור
        if (mic.expectedMidi == null || !mic.gateReleased) return;
        var diff = ((midi - mic.expectedMidi) % 12 + 12) % 12;   // קיפול-אוקטבה
        if (diff === 0) {
            mic.prevPC = ((mic.expectedMidi % 12) + 12) % 12;
            mic.gateReleased = false;
            setMicStatus('✓ יפה!');
            playerNext();   // יקרא ל-renderPlayerStep → armMicForStep
        }
    }

    async function toggleMic() {
        if (mic.on) {
            mic.on = false;
            if (mic.engine) mic.engine.stop();
            updateMicBtn();
            setMicStatus('זיהוי נגינה כבוי — אפשר להתקדם עם "הבא"');
            return;
        }
        // קריטי ל-iOS: יוצרים+מפעילים את ה-ctx כאן, סינכרונית במחווה, *לפני* ה-await
        // (ה-import האסינכרוני שמגיע מיד אחרי שובר את חלון המחווה ב-Safari).
        primeAudioInGesture();
        setMicStatus('מבקש גישה למיקרופון…');
        var ok = await micStart();
        if (!ok) { mic.on = false; updateMicBtn(); return; }
        mic.on = true;
        mic.prevPC = null;
        updateMicBtn();
        armMicForStep();
    }

    function micCleanup(full) {
        if (!mic.engine) return;
        if (full) { try { mic.engine.dispose(); } catch (e) {} mic.engine = null; mic.tracker = null; mic.primedCtx = null; }
        else { try { mic.engine.stop(); } catch (e) {} }
        mic.on = false;
    }

    // אוסף את תווי השיר עם האלמנט ה-SVG של כל תו (להדגשה על החמשה)
    function buildPlayerNotes() {
        ensureNoteIndex();
        const out = [];
        if (!state.visualObj || !state.visualObj.lines) return out;
        state.visualObj.lines.forEach((line, lineIdx) => {
            if (!line.staff) return;
            line.staff.forEach(staff => {
                if (!staff.voices) return;
                staff.voices.forEach(voice => {
                    voice.forEach(element => {
                        if (element.el_type === 'bar') return;
                        if (!element.pitches || !element.pitches.length) return;
                        const p = element.pitches[0];
                        const name = noteNameByStartChar(element.startChar, p.pitch, p.accidental);
                        const el = (element.abselem && element.abselem.elemset && element.abselem.elemset[0]) || null;
                        out.push({ name: name, startChar: element.startChar, el: el, line: lineIdx });
                    });
                });
            });
        });
        out.sort((a, b) => (a.startChar == null ? 0 : a.startChar) - (b.startChar == null ? 0 : b.startChar));
        return out;
    }

    function highlightStaffNote(el) {
        if (player.hlEl) { player.hlEl.style.fill = ''; player.hlEl.style.stroke = ''; }
        player.hlEl = el || null;
        if (!el) return;
        el.style.fill = '#2e9e5b'; el.style.stroke = '#2e9e5b';
        // הפאנל "מצב נגן" דביק בראש — גוללים את התו המודגש כך שייחשף *מתחת* לפאנל
        // (block:center לבדו עלול להשאיר אותו מאחורי הפאנל הגבוה).
        try {
            var panel = document.getElementById('whistle-player');
            var panelBottom = panel ? panel.getBoundingClientRect().bottom : 0;
            var safeTop = panelBottom + 20;                 // רווח קטן מתחת לפאנל
            var rect = el.getBoundingClientRect();
            var hiddenBehindPanel = rect.top < safeTop;
            var belowFold = rect.bottom > window.innerHeight - 20;
            if (hiddenBehindPanel || belowFold) {
                var newTop = window.scrollY + rect.top - safeTop;
                window.scrollTo({ top: Math.max(0, newTop), behavior: 'smooth' });
            }
        } catch (e) {
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e2) {}
        }
    }

    // מדגיש את השורה הנוכחית במצב-נגן ומאפיל את שאר התווים — עוזר להתמצא בשיר ארוך בטלפון
    function dimToActiveLine(activeLine) {
        if (activeLine == null || !player.notes) return;
        player.notes.forEach(function (n) {
            if (n.el) n.el.style.opacity = (n.line === activeLine) ? '' : '0.3';
        });
    }
    function clearDim() {
        if (!player.notes) return;
        player.notes.forEach(function (n) { if (n.el) n.el.style.opacity = ''; });
    }

    function fingeringSVGFor(scoreName) {
        const fn = fingerName(scoreName);
        if (state.instrument === 'piano')        return svgPianoLarge(fn, 46, 130);
        if (state.instrument === 'recorder')     { const fd = recorderSopranoC_Data[fn]; return fd ? svgRecorderLarge(fd, 50, 130) : ''; }
        if (state.instrument === 'altorecorder') { const fd = recorderAltoData(fn);      return fd ? svgRecorderLarge(fd, 50, 130) : ''; }
        const fd = tinWhistleD_Data[fn];         return fd ? svgWhistleLarge(fd, 50, 112) : '';
    }

    function buildPlayerPanel() {
        const wrapper = state.container ? state.container.closest('.tavim-wrapper') : null;
        if (!wrapper) return;
        const old = document.getElementById('whistle-player'); if (old) old.remove();
        const box = document.createElement('div');
        box.id = 'whistle-player';
        box.dir = 'rtl';
        box.setAttribute('style', 'position:sticky;top:8px;z-index:60;margin:0 0 14px;background:#F7F1E6;border:1.5px solid #e3d8c4;border-radius:16px;padding:14px;text-align:center;color:#0D1B33;font-family:Assistant,Arial,sans-serif;box-shadow:0 8px 26px rgba(13,27,51,.20)');
        box.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
              '<span id="wpl-prog" style="font-size:.85rem;color:#6b6256"></span>' +
              '<button id="wpl-exit" style="border:none;background:transparent;font-size:1.2rem;cursor:pointer;color:#6b6256">✕</button>' +
            '</div>' +
            '<div id="wpl-coach" style="min-height:1.3em;font-size:.95rem;color:#6b6256;margin-bottom:4px"></div>' +
            '<div id="wpl-note" style="font-size:2.4rem;font-weight:800;line-height:1.1"></div>' +
            '<div id="wpl-fing" style="display:flex;justify-content:center;align-items:center;min-height:120px;margin:6px 0"></div>' +
            '<button id="wpl-mic" style="display:block;width:100%;min-height:44px;border:1.5px solid #d8cfc0;border-radius:14px;background:transparent;color:#0D1B33;font-size:.98rem;font-weight:700;padding:10px;cursor:pointer;margin-bottom:6px;transition:background .2s,border-color .2s">🎤 הפעל זיהוי נגינה</button>' +
            '<div id="wpl-mic-status" style="min-height:1.2em;font-size:.82rem;color:#6b6256;margin-bottom:8px"></div>' +
            '<button id="wpl-next" style="display:block;width:100%;min-height:48px;border:none;border-radius:14px;background:#0D1B33;color:#F7F1E6;font-size:1.05rem;font-weight:700;padding:12px;cursor:pointer">הבא ⟶</button>';
        // מעל הכפתורים והתווים (ראש ה-wrapper) — דביק כדי להישאר גלוי בטלפון
        wrapper.insertBefore(box, wrapper.firstChild);
        document.getElementById('wpl-next').addEventListener('click', playerNext);
        document.getElementById('wpl-exit').addEventListener('click', exitPlayerMode);
        document.getElementById('wpl-mic').addEventListener('click', toggleMic);
        mic.statusEl = document.getElementById('wpl-mic-status');
        updateMicBtn();
        player.panel = box;
    }

    function updatePlayerPanel(cur, isNew, showFing) {
        const fn = fingerName(cur.name);
        const written = cur.name, played = fn;
        const shifted = state.octaveShift && played !== written;
        const label = shifted ? (written + '→' + played) : written;
        const prog = document.getElementById('wpl-prog');
        const coach = document.getElementById('wpl-coach');
        const noteEl = document.getElementById('wpl-note');
        const fingEl = document.getElementById('wpl-fing');
        if (prog)  prog.textContent = 'תו ' + (player.idx + 1) + ' מתוך ' + player.notes.length;
        if (coach) coach.textContent = isNew ? '🦉 תו חדש — נכיר אותו!' : '';
        if (noteEl) noteEl.innerHTML = label + (solfege(written) ? ' <span style="font-size:1.1rem;color:#B5936A">· ' + solfege(written) + '</span>' : '');
        if (!fingEl) return;
        const svg = fingeringSVGFor(cur.name);
        if (!svg) { fingEl.innerHTML = '<span style="color:#c0392b;opacity:.6">מחוץ לטווח הכלי</span>'; return; }
        if (showFing || player.forced) {
            fingEl.innerHTML = svg;
        } else {
            // תו מוכר — אין אצבוע, אבל אפשר לבקש אם מתקשים
            fingEl.innerHTML = '<button id="wpl-show" style="border:1.5px solid #d8cfc0;background:transparent;border-radius:12px;padding:10px 16px;cursor:pointer;color:#0D1B33;font-weight:600">🤚 הצג אצבוע</button>';
            const sb = document.getElementById('wpl-show');
            if (sb) sb.addEventListener('click', function () { player.forced = true; renderPlayerStep(true); });
        }
    }

    function renderPlayerStep(keepSeen) {
        const cur = player.notes[player.idx];
        if (!cur) return;
        highlightStaffNote(cur.el);
        dimToActiveLine(cur.line);
        const seenCount = player.seen[cur.name] || 0;
        const isNew = seenCount === 0;
        const showFing = seenCount < SHOW_TIMES;
        if (!keepSeen) { player.seen[cur.name] = seenCount + 1; player.forced = false; }
        updatePlayerPanel(cur, isNew && !keepSeen, showFing);
        if (!keepSeen) armMicForStep();   // זיהוי-נגינה: כוון את התו המצופה הבא
    }

    function playerNext() {
        if (!player.active) return;
        player.idx++;
        if (player.idx >= player.notes.length) return playerDone();
        renderPlayerStep(false);
    }

    function playerDone() {
        highlightStaffNote(null);
        clearDim();          // מחזירים את כל השיר לתצוגה מלאה
        micCleanup(false);   // עוצרים האזנה אך שומרים את המנוע לסיבוב נוסף
        const box = player.panel; if (!box) return;
        box.innerHTML =
            '<div style="font-size:2.2rem">🎉</div>' +
            '<div style="font-size:1.1rem;font-weight:700;margin:.2em 0">כל הכבוד! עברת על כל השיר</div>' +
            '<button id="wpl-again" style="display:block;width:100%;border:none;border-radius:14px;background:#0D1B33;color:#F7F1E6;font-weight:700;padding:12px;cursor:pointer;margin-top:8px">להתחיל מחדש</button>' +
            '<button id="wpl-close" style="display:block;width:100%;border:1.5px solid #d8cfc0;background:transparent;border-radius:14px;padding:10px;cursor:pointer;margin-top:8px;color:#0D1B33">סגור</button>';
        document.getElementById('wpl-again').addEventListener('click', startPlayerMode);
        document.getElementById('wpl-close').addEventListener('click', exitPlayerMode);
    }

    function exitPlayerMode() {
        player.active = false;
        highlightStaffNote(null);
        clearDim();         // מחזירים את כל השיר לתצוגה מלאה
        micCleanup(true);   // משחררים מיקרופון לחלוטין ביציאה
        mic.statusEl = null;
        const box = document.getElementById('whistle-player'); if (box) box.remove();
        player.panel = null;
    }

    function startPlayerMode() {
        if (!state.instrument) toggleInstrument('tinwhistle');
        // מצב נגן רץ נקי — מסירים פאנלים אחרים
        removePanel(); removeScoreFingerings(); removeFullPanel();
        state.modeScore = false; state.modeFull = false;
        player.notes = buildPlayerNotes();
        if (!player.notes.length) { alert('לא נמצאו תווים בשיר הזה.'); return; }
        player.idx = -1; player.seen = {}; player.active = true; player.forced = false;
        buildPlayerPanel();
        playerNext();
        // מיקרופון דלוק כברירת-מחדל: נכנסים למצב-נגן מתוך לחיצה (user-gesture תקף),
        // אז מנסים להפעיל זיהוי-נגינה אוטומטית — מנגנים והתו מתקדם לבד. אם אין
        // מיקרופון/הרשאה, מתקדמים ידנית ב"הבא". הכפתור הופך ל"כבה".
        if (!mic.on) toggleMic();
    }

    function createGameButton() {
        const ctrl = document.querySelector('.tavim-controls');
        if (!ctrl || document.getElementById('whistle-game-btn')) return;
        const btn = document.createElement('button');
        btn.id        = 'whistle-game-btn';
        btn.className = 'button whistle-btn whistle-game-btn';
        btn.innerHTML = '🎮 מצב נגן';
        btn.title     = 'מצב נגן — לעבור על השיר תו-תו וללמוד תווים + אצבוע';
        btn.style.backgroundColor = '#d9822b';
        btn.style.color = '#fff';
        btn.addEventListener('click', startPlayerMode);
        ctrl.appendChild(btn);
    }

    // =========================================================
    // סנכרון נגינה
    // =========================================================
    function setupPlaybackListeners() {
        document.addEventListener('achord-note-playing', function (e) {
            if (!state.instrument) return;
            const ev = e.detail;
            if (!ev || !ev.notes || !ev.notes.length) return;
            const note = ev.notes[0];
            if (!note.pitches || !note.pitches.length) return;
            const p         = note.pitches[0];
            const startChar = note.startChar;   // מיקום ייחודי — לסנכרון מדויק
            const name      = noteNameByStartChar(startChar, p.pitch, p.accidental);
            updatePanelNote(name, startChar);
        });

        document.addEventListener('achord-playback-stopped', function () {
            const noteEl = document.querySelector('#whistle-panel .wp-note-name');
            if (noteEl) noteEl.textContent = 'לחץ על תו לצפייה באצבוע';
            const full = document.getElementById('whistle-full-panel');
            if (full) full.querySelectorAll('.wfp-note').forEach(el => el.classList.remove('wfp-note--active'));
        });
    }

    // =========================================================
    // אתחול
    // =========================================================
    function init(container, visualObj) {
        state.container = container;
        state.visualObj = visualObj;
        state.noteMap = null;          // אלץ בנייה מחדש של האינדקס
        ensureNoteIndex();
        createInstrumentButtons();
        createGameButton();
        setupPlaybackListeners();
        setupNoteClickListener();
    }

    return {
        init: init,
        enable: function (visualObj, container, instrumentType) {
            state.container = container;
            state.visualObj = visualObj;
            state.noteMap = null;          // אלץ בנייה מחדש של האינדקס
            ensureNoteIndex();
            if (!document.getElementById('whistle-tin-toggle')) {
                createInstrumentButtons();
                createGameButton();
                setupPlaybackListeners();
                setupNoteClickListener();
            }
            if (state.instrument !== (instrumentType || 'tinwhistle')) {
                toggleInstrument(instrumentType || 'tinwhistle');
            }
        },
        disable: function () {
            if (state.instrument) toggleInstrument(state.instrument);
        }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WhistleFingering;
}
