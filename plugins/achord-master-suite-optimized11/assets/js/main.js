// 1. פונקציית המתנה לטעינת הספרייה (ABCJS)
function tavimProPlusWaitForABCJS(callback) {
    let attempts = 0;
    (function check() {
        if (window.ABCJS && window.ABCJS.renderAbc && window.ABCJS.synth) {
            callback();
        } else if (attempts < 50) { // מקסימום 5 שניות המתנה
            attempts++;
            setTimeout(check, 100);
        } else {
            console.warn("ABCJS library failed to load.");
        }
    })();
}

// 2. פונקציית אתחול הנגן (חשופה גלובלית)
window.initTavimProPlus = function () {
    if (typeof window.tavimProPlusData === 'undefined' || !window.tavimProPlusData.abc) return;

    const wrapper = document.querySelector('.tavim-wrapper');
    if (!wrapper || wrapper.offsetParent === null) return;
    if (wrapper.dataset.rendered === "true") return;

    const abc = window.tavimProPlusData.abc;
    let currentTempo = parseInt(window.tavimProPlusData.tempo) || 120;

    const notationDiv = wrapper.querySelector(".tavim-notation");
    const playBtn = wrapper.querySelector("#tavim-play");
    const pauseBtn = wrapper.querySelector("#tavim-pause");
    const stopBtn = wrapper.querySelector("#tavim-stop");
    const tempoBtn = wrapper.querySelector("#tavim-tempo");
    const tempoControls = wrapper.querySelector(".tempo-controls");
    const metronomeIcon = wrapper.querySelector("#metronome-icon");
    const tempoDisplay = wrapper.querySelector(".tempo-display .tempo-value");
    const tempoSlider = wrapper.querySelector("#tempo-slider");

    let visualObj = null;
    let synth = null;
    let isPlaying = false;
    let audioContext = null;
    let metronomeInterval = null;

    // 1. רינדור — מובייל-פירסט: התווים נפרסים לכמה שורות לפי רוחב המסך
    //    (במקום שורה אחת ארוכה שמוקטנת לתמונה זעירה בטלפון).
    function computeStaffWidth() {
        var w = (notationDiv && notationDiv.clientWidth) || (wrapper && wrapper.clientWidth) || 600;
        // מורידים ~22px לריווח פנימי של .tavim-notation כדי שגליפים בקצה (סיומות, R:) לא ייגזרו
        return Math.max(180, Math.floor(w) - 22);
    }
    function measuresPerLine(sw) {
        if (sw < 360) return 2;   // טלפון צר
        if (sw < 560) return 3;   // טלפון
        if (sw < 760) return 4;   // טאבלט
        return 5;                 // דסקטופ
    }
    function renderScore() {
        var sw = computeStaffWidth();
        try {
            visualObj = ABCJS.renderAbc(notationDiv, abc, {
                responsive: "resize",
                add_classes: true,
                staffwidth: sw,
                paddingtop: 16,
                paddingbottom: 8,
                format: {
                    gchordfont: '"Assistant","Helvetica",sans-serif 15',   // סימוני אקורדים גדולים וברורים
                    annotationfont: '"Assistant","Helvetica",sans-serif 13',
                    composerfont: '"Assistant","Helvetica",sans-serif 13'
                },
                wrap: {
                    minSpacing: 1.6,
                    maxSpacing: 2.6,
                    preferredMeasuresPerLine: measuresPerLine(sw)
                },
                clickListener: function(abcElem) {
                    if (abcElem && abcElem.pitches && abcElem.pitches.length) {
                        document.dispatchEvent(new CustomEvent('achord-note-clicked', {
                            detail: { abcElem: abcElem }
                        }));
                    }
                }
            })[0];
            wrapper.dataset.rendered = "true";
            document.dispatchEvent(new CustomEvent('achord-tavim-rendered', {
                detail: { container: notationDiv, visualObj: visualObj }
            }));
        } catch (e) { console.error(e); }
    }
    renderScore();
    if (!visualObj) return;

    // רינדור-מחדש בשינוי רוחב (סיבוב מסך / שינוי חלון), עם debounce.
    // לא בזמן נגינה ולא באמצע "מצב נגן" — כדי לא לשבש את הסשן.
    var _lastSW = computeStaffWidth();
    var _resizeT = null;
    window.addEventListener('resize', function () {
        if (isPlaying) return;
        clearTimeout(_resizeT);
        _resizeT = setTimeout(function () {
            if (document.getElementById('whistle-player')) return;
            var sw = computeStaffWidth();
            if (Math.abs(sw - _lastSW) < 24) return;   // התעלם משינויים זעירים
            _lastSW = sw;
            renderScore();
        }, 250);
    });

    if (tempoDisplay) tempoDisplay.textContent = currentTempo;

    // 2. מטרונום
    function startMetronome() {
        stopMetronome();
        if (!metronomeIcon) return;

        const match = abc.match(/M:\s*(\d+)\/(\d+)/);
        let beatsPerMeasure = 4;
        if (match) beatsPerMeasure = parseInt(match[1]);

        const msPerBeat = 60000 / currentTempo;
        const measureDuration = msPerBeat * beatsPerMeasure;

        flashMetronome();
        metronomeInterval = setInterval(() => { flashMetronome(); }, measureDuration);
    }

    function flashMetronome() {
        metronomeIcon.classList.add('metronome-on');
        setTimeout(() => metronomeIcon.classList.remove('metronome-on'), 200);
    }

    function stopMetronome() {
        if (metronomeInterval) { clearInterval(metronomeInterval); metronomeInterval = null; }
        if (metronomeIcon) metronomeIcon.classList.remove('metronome-on');
    }

    // 3. ניגון
    async function startPlayback() {
        if (isPlaying) return;

        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        // בדיקה ותיקון: יצירת סינתיסייזר מחדש אם צריך (למשל אחרי שינוי קצב)
        if (!synth) {
            synth = new ABCJS.synth.CreateSynth();
            await synth.init({
                visualObj: visualObj,
                audioContext: audioContext,
                millisecondsPerMeasure: visualObj.millisecondsPerMeasure(),
                options: {
                    soundfontUrl: "https://paulrosen.github.io/midi-js-soundfonts/abcjs/",
                    defaultQpm: currentTempo // <--- התיקון: שימוש בטמפו המעודכן בעת היצירה
                }
            });
            await synth.prime();
        }

        isPlaying = true;
        playBtn.disabled = true;
        stopBtn.disabled = false;
        if (pauseBtn) pauseBtn.innerHTML = "השהה " + UC_ICON('pause');

        startMetronome();

        await synth.start();
        ABCJS.startAnimation(notationDiv, visualObj, {
            showCursor: true,
            bpm: currentTempo,
            onFinished: stopPlayback,
            eventCallback: function(event) {
                if (event && !event.measureStart) {
                    document.dispatchEvent(new CustomEvent('achord-note-playing', { detail: event }));
                }
            }
        });
    }

    function stopPlayback() {
        document.dispatchEvent(new CustomEvent('achord-playback-stopped'));
        isPlaying = false;
        if (playBtn) playBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (pauseBtn) pauseBtn.innerHTML = "השהה " + UC_ICON('pause');

        stopMetronome();
        if (synth) synth.stop();
        ABCJS.stopAnimation();
    }

    // 4. אירועים
    if (playBtn) playBtn.onclick = startPlayback;
    if (stopBtn) stopBtn.onclick = stopPlayback;

    if (tempoBtn) {
        tempoBtn.onclick = function () {
            if (tempoControls) tempoControls.classList.toggle('hidden');
        };
    }

    if (pauseBtn) pauseBtn.onclick = function () {
        if (!synth) return;
        if (isPlaying) {
            synth.pause();
            stopMetronome();
            ABCJS.stopAnimation();
            isPlaying = false;
            pauseBtn.innerHTML = "המשך " + UC_ICON('play');
        } else {
            synth.resume();
            startMetronome();
            ABCJS.startAnimation(notationDiv, visualObj, {
                showCursor: true,
                bpm: currentTempo,
                onFinished: stopPlayback,
                eventCallback: function(event) {
                    if (event && !event.measureStart) {
                        document.dispatchEvent(new CustomEvent('achord-note-playing', { detail: event }));
                    }
                }
            });
            isPlaying = true;
            pauseBtn.innerHTML = "השהה " + UC_ICON('pause');
        }
    };

    if (tempoSlider) {
        // עדכון המספר בזמן גרירה
        tempoSlider.oninput = function () {
            currentTempo = parseInt(this.value);
            if (tempoDisplay) tempoDisplay.textContent = currentTempo;
        };

        // ביצוע השינוי בפועל רק בסיום הגרירה (onchange)
        tempoSlider.onchange = function () {
            // התיקון הקריטי: איפוס הסינתיסייזר כדי שייווצר מחדש עם הקצב החדש
            if (synth) {
                synth.stop(); // עצירה בטוחה
                synth = null; // הריגה של האובייקט הישן
            }

            // אם ניגנו, מתחילים מחדש אוטומטית עם הקצב החדש
            if (isPlaying) {
                stopPlayback(); // איפוס כפתורים ומצבים
                setTimeout(startPlayback, 100); // התחלה מחדש
            }
        };
    }
};

// --------------------------------------------------------------------
// --- מתחיל כאן קוד פרטי שרץ רק אחרי שהעמוד נטען ---
(function ($) {
    $(document).ready(function () {

        // --- ניהול טאבים (Tabs) וקריאה לנגן ---
        $('.tab-btn[data-tab="score"]').on('click', function () {
            // הוספנו setTimeout כדי לוודא שה-DIV הפך לגבוי (Display Block) לפני שהנגן מצייר
            tavimProPlusWaitForABCJS(function () {
                setTimeout(window.initTavimProPlus, 100);
            });
        });

        // אתחול ראשוני אם נחתנו ישר על תווים (נדיר)
        if ($('.tavim-wrapper').is(':visible')) {
            tavimProPlusWaitForABCJS(window.initTavimProPlus);
        }

        /**
         * ------------------------------------------------
         * מודול 1: תצוגת אקורדים אינטראקטיבית
         * ------------------------------------------------
         */
        function initChordDisplay() {
            const wrapper = document.querySelector('.achord-song-wrapper');
            if (!wrapper) return;

            const state = { instrument: "guitar", currentVersion: "normal", scrollSpeed: 0, scrollInterval: null, transposeSteps: 0 };
            const engine = {
                notesSharp: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], flatToSharpMap: { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" }, sharpToFlatMap: { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" },
                // expanded guitar chords database
                guitarChordsData: {"F#4":{"frets":[2,4,4,4,2,2],"fingers":[null,null,null,null,null,null],"label":"F#4","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"C#4":{"frets":[null,4,6,6,7,4],"fingers":[null,null,null,null,null,null],"label":"C#4","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Am4":{"frets":[null,0,2,2,3,0],"fingers":[null,null,"1","2","3",null],"label":"Am4"},"Dm4":{"frets":[null,null,0,2,3,3],"fingers":[null,null,null,"1","2","3"],"label":"Dm4"},"Bm4":{"frets":[null,2,4,4,5,2],"fingers":[null,"1","2","3","4","1"],"label":"Bm4","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"Gm4":{"frets":[3,3,0,0,1,3],"fingers":["2","3",null,null,"1","4"],"label":"Gm4"},"Cm4":{"frets":[null,3,3,0,1,1],"fingers":[null,"3","4",null,"1","1"],"label":"Cm4","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"F#m4":{"frets":[2,4,4,4,2,2],"fingers":[null,null,null,null,null,null],"label":"F#m4","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Amsus4":{"frets":[null,0,2,2,3,0],"fingers":[null,null,"1","2","3",null],"label":"Amsus4"},"G2":{"frets":[3,0,0,0,3,3],"fingers":[null,null,null,null,null,null],"label":"G2"},"C#m2":{"frets":[null,4,6,6,4,4],"fingers":[null,null,null,null,null,null],"label":"C#m2"},"Gm2":{"frets":[3,0,0,0,3,3],"fingers":[null,null,null,null,null,null],"label":"Gm2"},"Dm2":{"frets":[null,null,0,2,3,0],"fingers":[null,null,null,"1","2",null],"label":"Dm2"},"Am2":{"frets":[null,0,2,2,0,0],"fingers":[null,null,"1","2",null,null],"label":"Am2"},"Em2":{"frets":[0,2,2,null,0,2],"fingers":[null,"1","2",null,null,"3"],"label":"Em2"},"Fm2":{"frets":[1,3,3,null,1,3],"fingers":["1","2","3",null,"1","4"],"label":"Fm2","barre":{"fret":1,"fromString":0,"toString":4,"finger":"1"}},"F#add9":{"frets":[2,4,4,3,2,4],"fingers":[null,null,null,null,null,null],"label":"F#add9"},"C#add9":{"frets":[9,11,11,10,9,11],"fingers":[null,null,null,null,null,null],"label":"C#add9","barre":{"fret":9,"fromString":0,"toString":5,"finger":"1"}},"Gadd4":{"frets":[3,2,0,0,1,3],"fingers":[null,null,null,null,null,null],"label":"Gadd4"},"Cadd4":{"frets":[null,3,2,0,1,1],"fingers":[null,null,null,null,null,null],"label":"Cadd4"},"Badd4":{"frets":[null,2,4,4,4,0],"fingers":[null,null,null,null,null,null],"label":"Badd4"},"F#add4":{"frets":[2,2,4,3,2,2],"fingers":[null,null,null,null,null,null],"label":"F#add4"},"Gbadd4":{"frets":[2,2,4,3,2,2],"fingers":[null,null,null,null,null,null],"label":"Gbadd4"},"Bm(add11)":{"frets":[null,2,4,4,3,0],"fingers":[null,null,null,null,null,null],"label":"Bm(add11)"},"Am(add9)":{"frets":[null,0,2,4,1,0],"fingers":[null,null,null,null,null,null],"label":"Am(add9)"},"F#m(add9)":{"frets":[2,4,4,2,2,4],"fingers":[null,null,null,null,null,null],"label":"F#m(add9)"},"Fm(add9)":{"frets":[1,3,3,1,1,3],"fingers":[null,null,null,null,null,null],"label":"Fm(add9)"},"Amadd11":{"frets":[null,0,0,2,1,0],"fingers":[null,null,null,null,null,null],"label":"Amadd11"},"Emadd11":{"frets":[0,0,2,0,0,0],"fingers":[null,null,null,null,null,null],"label":"Emadd11"},"C#7b9":{"frets":[null,4,3,4,3,null],"fingers":[null,null,null,null,null,null],"label":"C#7b9"},"A7/C#":{"frets":[null,4,2,2,2,3],"fingers":[null,null,null,null,null,null],"label":"A7/C#"},"Am7/D":{"frets":[null,null,0,2,1,3],"fingers":[null,null,null,null,null,null],"label":"Am7/D"},"F5/G":{"frets":[3,3,3,null,null,null],"fingers":[null,null,null,null,null,null],"label":"F5/G"},"Gm7/D":{"frets":[null,5,3,3,3,3],"fingers":[null,null,null,null,null,null],"label":"Gm7/D"},"Db6/F":{"frets":[null,null,3,3,2,4],"fingers":[null,null,null,null,null,null],"label":"Db6/F"},"C":{"frets":[null,3,2,0,1,0],"fingers":[null,"3","2",null,"1",null],"label":"C"},"Cm":{"frets":[null,3,5,5,4,3],"fingers":[null,"1","3","4","2","1"],"label":"Cm","barre":{"fret":3,"fromString":1,"toString":5,"finger":"1"}},"Cdim":{"frets":[null,3,4,5,4,null],"fingers":[null,"1","2","4","3",null],"label":"Cdim"},"Cdim7":{"frets":[null,3,4,2,4,2],"fingers":[null,"2","3","1","4","1"],"label":"Cdim7","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"Csus4":{"frets":[null,3,3,0,1,1],"fingers":[null,"3","4",null,"1","1"],"label":"Csus4","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Csus2":{"frets":[null,3,0,0,1,3],"fingers":[null,"3",null,null,"1","4"],"label":"Csus2"},"C7sus4":{"frets":[null,3,3,3,1,1],"fingers":[null,"3","4","4","1","1"],"label":"C7sus4","barre":{"fret":1,"fromString":1,"toString":null,"finger":"1"}},"Caug":{"frets":[null,3,2,1,1,0],"fingers":[null,"4","3","1","2",null],"label":"Caug"},"C6":{"frets":[null,3,2,2,1,0],"fingers":[null,"3","2","2","1",null],"label":"C6"},"C7":{"frets":[null,3,2,3,1,0],"fingers":[null,"3","2","4","1",null],"label":"C7"},"Caug7":{"frets":[null,3,6,3,5,4],"fingers":[null,"1","4","1","3","2"],"label":"Caug7","barre":{"fret":3,"fromString":1,"toString":3,"finger":"1"}},"C9":{"frets":[null,3,2,3,3,3],"fingers":[null,"2","1","3","3","3"],"label":"C9"},"C13":{"frets":[null,3,2,3,5,5],"fingers":[null,"2","1","3","4","4"],"label":"C13","barre":{"fret":5,"fromString":1,"toString":null,"finger":"1"}},"Cmaj7":{"frets":[null,3,2,0,0,0],"fingers":[null,"2","1",null,null,null],"label":"Cmaj7"},"Cm6":{"frets":[null,3,1,2,1,3],"fingers":[null,"3","1","2","1","4"],"label":"Cm6","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"Cm7":{"frets":[null,3,5,3,4,3],"fingers":[null,"1","3","1","2","1"],"label":"Cm7","barre":{"fret":3,"fromString":1,"toString":5,"finger":"1"}},"Cm7b5":{"frets":[null,3,4,3,4,null],"fingers":[null,"1","3","2","4",null],"label":"Cm7b5"},"Cm9":{"frets":[null,3,1,3,3,null],"fingers":[null,"3","1","4","4",null],"label":"Cm9"},"Cadd9":{"frets":[null,3,2,0,3,0],"fingers":[null,"2","1",null,"3",null],"label":"Cadd9"},"Cm/Bb":{"frets":[null,1,1,0,1,3],"fingers":[null,"1","1",null,"1","4"],"label":"Cm/Bb","barre":{"fret":1,"fromString":1,"toString":4,"finger":"1"}},"C/B":{"frets":[null,2,2,0,1,0],"fingers":[null,"2","3",null,"1",null],"label":"C/B"},"C/Bb":{"frets":[null,1,2,0,1,0],"fingers":[null,"1","3",null,"2",null],"label":"C/Bb"},"C/D":{"frets":[null,null,0,0,1,0],"fingers":[null,null,null,null,"1",null],"label":"C/D"},"C/E":{"frets":[0,3,2,0,1,0],"fingers":[null,"3","2",null,"1",null],"label":"C/E"},"C/G":{"frets":[3,3,2,0,1,0],"fingers":["4","3","2",null,"1",null],"label":"C/G"},"C#":{"frets":[null,4,6,6,6,4],"fingers":[null,"1","3","2","4","1"],"label":"C#","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"C#m":{"frets":[null,4,6,6,5,4],"fingers":[null,"1","3","4","2","1"],"label":"C#m","barre":{"fret":4,"fromString":1,"toString":null,"finger":"1"}},"C#dim":{"frets":[null,4,5,6,5,null],"fingers":[null,"1","2","4","3",null],"label":"C#dim"},"C#sus4":{"frets":[null,4,6,6,7,4],"fingers":[null,"1","3","3","4","1"],"label":"C#sus4","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"C#sus2":{"frets":[null,4,6,6,4,4],"fingers":[null,"1","3","4","1","1"],"label":"C#sus2","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"C#7sus4":{"frets":[null,4,6,4,7,4],"fingers":[null,"1","3","1","4","1"],"label":"C#7sus4","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"C#aug":{"frets":[null,4,3,2,2,1],"fingers":[null,"4","3","1","1","1"],"label":"C#aug"},"C#7":{"frets":[null,4,6,4,6,4],"fingers":[null,"1","3","1","4","1"],"label":"C#7","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"C#aug7":{"frets":[null,4,3,4,null,5],"fingers":[null,"2","1","3",null,"4"],"label":"C#aug7"},"C#9":{"frets":[null,4,3,4,4,4],"fingers":[null,"2","1","3","3","3"],"label":"C#9"},"C#13":{"frets":[null,4,3,4,4,6],"fingers":[null,"2","1","3","3","4"],"label":"C#13"},"C#maj7":{"frets":[null,4,6,5,6,4],"fingers":[null,"1","3","2","4","1"],"label":"C#maj7","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"C#m7":{"frets":[null,4,6,4,5,4],"fingers":[null,"1","3","1","2","1"],"label":"C#m7","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"C#m7b5":{"frets":[null,4,5,4,5,null],"fingers":[null,"1","3","2","4",null],"label":"C#m7b5"},"C#madd9":{"frets":[null,4,2,6,4,null],"fingers":[null,"2","1","4","3",null],"label":"C#madd9"},"C#m/B":{"frets":[null,2,2,1,2,0],"fingers":[null,"2","3","1","4",null],"label":"C#m/B"},"C#m/E":{"frets":[0,4,2,1,2,0],"fingers":[null,"4","2","1","3",null],"label":"C#m/E"},"C#/B":{"frets":[null,2,3,1,2,4],"fingers":[null,"2","3","1","1","4"],"label":"C#/B"},"D":{"frets":[null,null,0,2,3,2],"fingers":[null,null,null,"1","3","2"],"label":"D"},"Dm":{"frets":[null,null,0,2,3,1],"fingers":[null,null,null,"2","3","1"],"label":"Dm"},"Ddim7":{"frets":[null,null,0,1,0,1],"fingers":[null,null,null,"2",null,"3"],"label":"Ddim7"},"Dsus4":{"frets":[null,null,0,2,3,3],"fingers":[null,null,null,"1","2","3"],"label":"Dsus4"},"Dsus2":{"frets":[null,null,0,2,3,0],"fingers":[null,null,null,"1","2",null],"label":"Dsus2"},"D7sus4":{"frets":[null,null,0,2,1,3],"fingers":[null,null,null,"2","1","3"],"label":"D7sus4"},"Daug":{"frets":[null,null,0,3,3,2],"fingers":[null,null,null,"2","3","1"],"label":"Daug"},"D6":{"frets":[null,null,0,2,0,2],"fingers":[null,null,null,"2",null,"3"],"label":"D6"},"D7":{"frets":[null,null,0,2,1,2],"fingers":[null,null,null,"2","1","3"],"label":"D7"},"Daug7":{"frets":[null,null,0,3,1,2],"fingers":[null,null,null,"3","1","2"],"label":"Daug7"},"D9":{"frets":[null,5,4,5,5,5],"fingers":[null,"2","1","3","3","3"],"label":"D9"},"D7b9":{"frets":[null,5,4,5,4,5],"fingers":[null,"2","1","3","1","4"],"label":"D7b9","barre":{"fret":4,"fromString":2,"toString":4,"finger":"1"}},"Dmaj7":{"frets":[null,null,0,2,2,2],"fingers":[null,null,null,"1","2","3"],"label":"Dmaj7"},"Dm6":{"frets":[null,null,0,2,0,1],"fingers":[null,null,null,"3",null,"1"],"label":"Dm6"},"Dm7":{"frets":[null,null,0,2,1,1],"fingers":[null,null,null,"2","1","1"],"label":"Dm7","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Dm7b5":{"frets":[null,null,0,1,1,1],"fingers":[null,null,null,"1","1","1"],"label":"Dm7b5","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"Dm9":{"frets":[null,5,3,5,5,null],"fingers":[null,"2","1","3","4",null],"label":"Dm9"},"Dm/A":{"frets":[null,0,0,2,3,1],"fingers":[null,null,null,"2","3","1"],"label":"Dm/A"},"Dm/C":{"frets":[null,3,0,2,3,1],"fingers":[null,"3",null,"2","4","1"],"label":"Dm/C"},"Dm/F":{"frets":[1,null,0,2,3,1],"fingers":["1",null,null,"3","4","2"],"label":"Dm/F"},"Dm/G":{"frets":[3,null,0,2,3,1],"fingers":["3",null,null,"2","4","1"],"label":"Dm/G"},"D/A":{"frets":[null,0,0,2,3,2],"fingers":[null,null,null,"1","3","2"],"label":"D/A"},"D/C":{"frets":[null,3,0,2,3,2],"fingers":[null,"2",null,"1","4","3"],"label":"D/C"},"D/F#":{"frets":[2,0,0,2,3,2],"fingers":["1",null,null,"2","4","3"],"label":"D/F#"},"D#":{"frets":[null,6,8,8,8,6],"fingers":[null,"1","3","4","2","1"],"label":"D#","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"D#m":{"frets":[null,6,8,8,7,6],"fingers":[null,"1","3","4","2","1"],"label":"D#m","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"D#dim":{"frets":[null,6,7,8,7,null],"fingers":[null,"1","2","4","3",null],"label":"D#dim"},"D#dim7":{"frets":[null,null,1,2,1,2],"fingers":[null,null,"1","3","2","4"],"label":"D#dim7"},"D#sus4":{"frets":[null,null,1,3,4,4],"fingers":[null,null,"1","2","3","4"],"label":"D#sus4"},"D#sus2":{"frets":[null,6,8,8,6,6],"fingers":[null,"1","3","4","1","1"],"label":"D#sus2","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"D#aug":{"frets":[null,6,5,4,4,null],"fingers":[null,"4","3","1","1",null],"label":"D#aug","barre":{"fret":4,"fromString":3,"toString":4,"finger":"1"}},"D#7":{"frets":[null,null,1,3,2,3],"fingers":[null,null,"1","4","2","3"],"label":"D#7"},"D#aug7":{"frets":[null,6,5,6,0,null],"fingers":[null,"3","2","4","1",null],"label":"D#aug7"},"D#9":{"frets":[null,6,5,6,6,null],"fingers":[null,"2","1","3","4",null],"label":"D#9"},"D#7b9":{"frets":[null,6,5,6,5,null],"fingers":[null,"2","1","3","1",null],"label":"D#7b9","barre":{"fret":5,"fromString":2,"toString":4,"finger":"1"}},"D#maj7":{"frets":[null,6,8,7,8,6],"fingers":[null,"1","3","2","4","1"],"label":"D#maj7","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"D#m7":{"frets":[null,null,1,3,2,2],"fingers":[null,null,"1","4","2","3"],"label":"D#m7"},"D#m9":{"frets":[null,6,4,6,6,6],"fingers":[null,"3","1","4","1","1"],"label":"D#m9"},"E":{"frets":[0,2,2,1,0,0],"fingers":[null,"2","3","1",null,null],"label":"E"},"Em":{"frets":[0,2,2,0,0,0],"fingers":[null,"1","2",null,null,null],"label":"Em"},"Edim":{"frets":[0,1,2,0,null,null],"fingers":[null,"1","2",null,null,null],"label":"Edim"},"Esus4":{"frets":[0,2,2,2,0,0],"fingers":[null,"2","3","4",null,null],"label":"Esus4"},"E7sus4":{"frets":[0,2,0,2,0,0],"fingers":[null,"2",null,"3",null,null],"label":"E7sus4"},"Eaug":{"frets":[0,3,2,1,1,0],"fingers":[null,"4","3","1","2",null],"label":"Eaug"},"E6":{"frets":[0,2,2,1,2,0],"fingers":[null,"2","3","1","4",null],"label":"E6"},"E7":{"frets":[0,2,0,1,0,0],"fingers":[null,"2",null,"1",null,null],"label":"E7"},"E9":{"frets":[0,2,0,1,0,2],"fingers":[null,"2",null,"1",null,"3"],"label":"E9"},"Emaj7":{"frets":[0,2,1,1,0,0],"fingers":[null,"2","1","1",null,null],"label":"Emaj7","barre":{"fret":1,"fromString":2,"toString":3,"finger":"1"}},"Em6":{"frets":[0,2,2,0,2,0],"fingers":[null,"1","2",null,"3",null],"label":"Em6"},"Em7":{"frets":[0,2,0,0,0,0],"fingers":[null,"2",null,null,null,null],"label":"Em7"},"Em9":{"frets":[0,2,0,0,0,2],"fingers":[null,"2",null,null,null,"3"],"label":"Em9"},"Emadd9":{"frets":[0,2,2,0,0,2],"fingers":[null,"2","3",null,null,"4"],"label":"Emadd9"},"Em/B":{"frets":[null,2,2,0,0,0],"fingers":[null,"2","3",null,null,null],"label":"Em/B"},"Em/C":{"frets":[null,3,2,0,0,0],"fingers":[null,"3","2",null,null,null],"label":"Em/C"},"Em/D":{"frets":[null,null,0,0,0,0],"fingers":[null,null,null,null,null,null],"label":"Em/D"},"Em/F#":{"frets":[2,null,2,0,0,0],"fingers":["2",null,"3",null,null,null],"label":"Em/F#"},"Em/G":{"frets":[3,2,2,0,0,0],"fingers":["3","1","2",null,null,null],"label":"Em/G"},"E/Ab":{"frets":[4,2,2,1,0,0],"fingers":["4","2","3","1",null,null],"label":"E/Ab"},"E/B":{"frets":[null,2,2,1,0,0],"fingers":[null,"3","4","1",null,null],"label":"E/B"},"E/D":{"frets":[null,null,0,1,0,0],"fingers":[null,null,null,"1",null,null],"label":"E/D"},"E/Eb":{"frets":[null,null,1,1,0,0],"fingers":[null,null,"1","1",null,null],"label":"E/Eb","barre":{"fret":1,"fromString":2,"toString":3,"finger":"1"}},"E/F#":{"frets":[2,2,2,1,0,0],"fingers":["2","3","4","1",null,null],"label":"E/F#"},"E/G":{"frets":[3,2,2,1,0,0],"fingers":["3","2","2","1",null,null],"label":"E/G"},"F":{"frets":[1,3,3,2,1,1],"fingers":["1","3","4","2","1","1"],"label":"F","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Fm":{"frets":[1,3,3,1,1,1],"fingers":["1","3","4","1","1","1"],"label":"Fm","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Fdim":{"frets":[1,2,3,1,null,null],"fingers":["1","2","4","1",null,null],"label":"Fdim","barre":{"fret":1,"fromString":0,"toString":3,"finger":"1"}},"Fsus4":{"frets":[1,3,3,3,1,1],"fingers":["1","3","3","3","1","1"],"label":"Fsus4","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Fsus2":{"frets":[null,null,3,0,1,1],"fingers":[null,null,"3",null,"1","2"],"label":"Fsus2"},"F7sus4":{"frets":[1,3,1,3,1,1],"fingers":["1","3","1","4","1","1"],"label":"F7sus4","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Faug":{"frets":[null,null,3,2,2,1],"fingers":[null,null,"4","2","3","1"],"label":"Faug"},"F6":{"frets":[1,3,3,2,3,1],"fingers":["1","2","3","1","4","1"],"label":"F6","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"F7":{"frets":[1,3,1,2,1,1],"fingers":["1","3","1","2","1","1"],"label":"F7","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Faug7":{"frets":[1,null,1,2,2,null],"fingers":["1",null,"1","3","4",null],"label":"Faug7","barre":{"fret":1,"fromString":0,"toString":2,"finger":"1"}},"F9":{"frets":[1,3,1,2,1,3],"fingers":["1","3","1","2","1","4"],"label":"F9","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Fmaj7":{"frets":[null,null,3,2,1,0],"fingers":[null,null,"3","2","1",null],"label":"Fmaj7"},"Fm6":{"frets":[1,3,0,1,3,1],"fingers":["1","3",null,"1","4","1"],"label":"Fm6","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Fm7":{"frets":[1,3,1,1,1,1],"fingers":["1","3","1","1","1","1"],"label":"Fm7","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Fm7b5":{"frets":[1,null,1,1,0,null],"fingers":["1",null,"2","3",null,null],"label":"Fm7b5"},"Fadd9":{"frets":[null,3,3,2,1,3],"fingers":[null,"2","3","1","1","4"],"label":"Fadd9"},"Fm/C":{"frets":[null,3,3,1,1,1],"fingers":[null,"3","4","1","1","1"],"label":"Fm/C","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"Fm/Eb":{"frets":[null,null,1,1,1,1],"fingers":[null,null,"1","1","1","1"],"label":"Fm/Eb","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"F/A":{"frets":[null,0,3,2,1,1],"fingers":[null,null,"3","2","1","1"],"label":"F/A","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"F/C":{"frets":[null,3,3,2,1,1],"fingers":[null,"3","4","2","1","1"],"label":"F/C","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"F/G":{"frets":[3,null,3,2,1,1],"fingers":["3",null,"4","2","1","1"],"label":"F/G","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"F#":{"frets":[2,4,4,3,2,2],"fingers":["1","3","4","2","1","1"],"label":"F#","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#m":{"frets":[2,4,4,2,2,2],"fingers":["1","3","4","1","1","1"],"label":"F#m","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#dim":{"frets":[null,null,4,2,1,null],"fingers":[null,null,"3","2","1",null],"label":"F#dim"},"F#dim7":{"frets":[2,3,1,2,1,2],"fingers":["2","4","1","3","1","3"],"label":"F#dim7","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"F#sus4":{"frets":[2,4,4,4,2,2],"fingers":["1","3","3","3","1","1"],"label":"F#sus4","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#sus2":{"frets":[2,4,4,1,2,2],"fingers":["2","3","4","1","1","1"],"label":"F#sus2"},"F#7sus4":{"frets":[2,4,2,4,2,2],"fingers":["1","3","1","4","1","1"],"label":"F#7sus4","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#aug":{"frets":[null,null,4,3,3,2],"fingers":[null,null,"4","2","3","1"],"label":"F#aug"},"F#6":{"frets":[2,4,4,3,4,2],"fingers":["1","3","4","2","4","1"],"label":"F#6","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#7":{"frets":[2,4,2,3,2,2],"fingers":["1","3","1","2","1","1"],"label":"F#7","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#maj7":{"frets":[2,4,3,3,2,2],"fingers":["1","3","2","2","1","1"],"label":"F#maj7","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#m6":{"frets":[2,4,4,2,4,2],"fingers":["1","3","4","1","4","1"],"label":"F#m6","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#m7":{"frets":[2,4,2,2,2,2],"fingers":["1","3","1","1","1","1"],"label":"F#m7","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#m7b5":{"frets":[2,3,2,2,1,null],"fingers":["2","4","3","3","1",null],"label":"F#m7b5"},"F#m9":{"frets":[2,4,2,2,2,4],"fingers":["1","3","1","1","1","4"],"label":"F#m9","barre":{"fret":2,"fromString":0,"toString":4,"finger":"1"}},"F#m/A":{"frets":[null,0,4,2,2,2],"fingers":[null,null,"4","1","1","1"],"label":"F#m/A","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"F#m/E":{"frets":[0,4,4,2,2,2],"fingers":[null,"3","4","1","1","1"],"label":"F#m/E","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"F#m/Eb":{"frets":[null,6,4,2,2,2],"fingers":[null,"4","3","1","1","1"],"label":"F#m/Eb","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"G":{"frets":[3,2,0,0,0,3],"fingers":["2","1",null,null,null,"3"],"label":"G"},"Gm":{"frets":[3,5,5,3,3,3],"fingers":["1","3","4","1","1","1"],"label":"Gm","barre":{"fret":3,"fromString":0,"toString":5,"finger":"1"}},"Gdim":{"frets":[3,4,5,3,null,null],"fingers":["1","2","4","1",null,null],"label":"Gdim","barre":{"fret":3,"fromString":0,"toString":3,"finger":"1"}},"Gsus4":{"frets":[3,3,0,0,1,3],"fingers":["2","3",null,null,"1","4"],"label":"Gsus4"},"G6":{"frets":[3,2,0,0,0,0],"fingers":["2","1",null,null,null,null],"label":"G6"},"G7":{"frets":[3,2,0,0,0,1],"fingers":["3","2",null,null,null,"1"],"label":"G7"},"G9":{"frets":[3,5,3,4,3,5],"fingers":["1","3","1","2","1","4"],"label":"G9","barre":{"fret":3,"fromString":0,"toString":5,"finger":"1"}},"Gmaj7":{"frets":[3,2,0,0,0,2],"fingers":["2","1",null,null,null,"3"],"label":"Gmaj7"},"Gm6":{"frets":[3,5,2,3,5,3],"fingers":["2","4","1","3","4","2"],"label":"Gm6"},"Gm7":{"frets":[3,5,3,3,3,3],"fingers":["1","3","1","1","1","1"],"label":"Gm7","barre":{"fret":3,"fromString":0,"toString":5,"finger":"1"}},"Gm9":{"frets":[3,null,3,3,3,5],"fingers":["1",null,"1","1","1","3"],"label":"Gm9","barre":{"fret":3,"fromString":2,"toString":null,"finger":"1"}},"Gadd9":{"frets":[3,2,0,2,0,3],"fingers":["2","1",null,"3",null,"4"],"label":"Gadd9"},"Gm/Bb":{"frets":[null,1,0,0,3,3],"fingers":[null,"1",null,null,"3","4"],"label":"Gm/Bb"},"Gm/E":{"frets":[0,1,0,0,3,3],"fingers":[null,"1",null,null,"3","4"],"label":"Gm/E"},"Gm/F":{"frets":[1,1,0,0,3,3],"fingers":["1","1",null,null,"3","4"],"label":"Gm/F","barre":{"fret":1,"fromString":0,"toString":1,"finger":"1"}},"G/B":{"frets":[null,2,0,0,0,3],"fingers":[null,"1",null,null,null,"2"],"label":"G/B"},"G/D":{"frets":[null,null,0,0,0,3],"fingers":[null,null,null,null,null,"3"],"label":"G/D"},"G/E":{"frets":[0,2,0,0,0,3],"fingers":[null,"2",null,null,null,"3"],"label":"G/E"},"G/F":{"frets":[1,2,0,0,0,3],"fingers":["1","2",null,null,null,"3"],"label":"G/F"},"G/F#":{"frets":[2,2,0,0,0,3],"fingers":["1","2",null,null,null,"3"],"label":"G/F#"},"G#":{"frets":[4,6,6,5,4,4],"fingers":["1","3","4","2","1","1"],"label":"G#","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#m":{"frets":[4,6,6,4,4,4],"fingers":["1","3","4","1","1","1"],"label":"G#m","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#dim":{"frets":[null,null,6,4,3,null],"fingers":[null,null,"4","2","1",null],"label":"G#dim"},"G#dim7":{"frets":[4,5,3,4,3,4],"fingers":["2","4","1","3","1","3"],"label":"G#dim7","barre":{"fret":3,"fromString":2,"toString":4,"finger":"1"}},"G#sus4":{"frets":[4,6,6,6,4,4],"fingers":["1","3","3","3","1","1"],"label":"G#sus4","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#7sus4":{"frets":[4,6,4,6,4,4],"fingers":["1","3","1","4","1","1"],"label":"G#7sus4","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#6":{"frets":[4,6,6,5,6,4],"fingers":["1","3","4","2","3","1"],"label":"G#6","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#7":{"frets":[4,6,4,5,4,4],"fingers":["1","3","1","2","1","1"],"label":"G#7","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#9":{"frets":[4,6,4,5,4,6],"fingers":["1","3","1","2","1","4"],"label":"G#9","barre":{"fret":4,"fromString":0,"toString":4,"finger":"1"}},"G#maj7":{"frets":[4,6,5,5,4,4],"fingers":["1","3","2","2","1","1"],"label":"G#maj7","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#m7":{"frets":[4,6,4,4,4,4],"fingers":["1","3","1","1","1","1"],"label":"G#m7","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#madd9":{"frets":[4,6,6,4,4,6],"fingers":["1","3","4","1","1","2"],"label":"G#madd9","barre":{"fret":4,"fromString":0,"toString":4,"finger":"1"}},"G#m/F#":{"frets":[2,2,1,1,4,4],"fingers":["2","3","1","1","4","4"],"label":"G#m/F#","barre":{"fret":1,"fromString":2,"toString":3,"finger":"1"}},"A":{"frets":[null,0,2,2,2,0],"fingers":[null,null,"1","2","3",null],"label":"A"},"Am":{"frets":[null,0,2,2,1,0],"fingers":[null,null,"2","3","1",null],"label":"Am"},"Adim":{"frets":[null,0,1,2,1,null],"fingers":[null,null,"1","3","2",null],"label":"Adim"},"Adim7":{"frets":[null,0,1,2,1,2],"fingers":[null,null,"1","3","2","4"],"label":"Adim7"},"Asus4":{"frets":[null,0,2,2,3,0],"fingers":[null,null,"1","2","3",null],"label":"Asus4"},"Asus2":{"frets":[null,0,2,2,0,0],"fingers":[null,null,"1","2",null,null],"label":"Asus2"},"A7sus4":{"frets":[null,0,2,0,3,0],"fingers":[null,null,"2",null,"3",null],"label":"A7sus4"},"Aaug":{"frets":[null,0,3,2,2,1],"fingers":[null,null,"4","2","3","1"],"label":"Aaug"},"A6":{"frets":[null,0,2,2,2,2],"fingers":[null,null,"1","1","1","1"],"label":"A6","barre":{"fret":2,"fromString":2,"toString":5,"finger":"1"}},"A7":{"frets":[null,0,2,0,2,0],"fingers":[null,null,"2",null,"3",null],"label":"A7"},"Aaug7":{"frets":[null,0,3,0,2,1],"fingers":[null,null,"3",null,"2","1"],"label":"Aaug7"},"A9":{"frets":[null,0,2,4,2,3],"fingers":[null,null,"1","3","2","4"],"label":"A9"},"Amaj7":{"frets":[null,0,2,1,2,0],"fingers":[null,null,"2","1","3",null],"label":"Amaj7"},"Am6":{"frets":[null,0,2,2,1,2],"fingers":[null,null,"2","3","1","4"],"label":"Am6"},"Am7":{"frets":[null,0,2,0,1,0],"fingers":[null,null,"2",null,"1",null],"label":"Am7"},"Am9":{"frets":[5,7,5,5,5,7],"fingers":[null,"3","1","1","1","4"],"label":"Am9","barre":{"fret":5,"fromString":2,"toString":4,"finger":"1"}},"Aadd9":{"frets":[null,0,2,4,2,0],"fingers":[null,null,"1","3","1",null],"label":"Aadd9","barre":{"fret":2,"fromString":2,"toString":4,"finger":"1"}},"Amadd9":{"frets":[null,0,2,4,1,0],"fingers":[null,null,"2","4","1",null],"label":"Amadd9"},"Am/C":{"frets":[null,3,2,2,1,0],"fingers":[null,"3","2","4","1",null],"label":"Am/C"},"Am/C#":{"frets":[null,4,2,2,2,0],"fingers":[null,"4","2","3","1",null],"label":"Am/C#"},"Am/E":{"frets":[0,0,2,2,1,0],"fingers":[null,null,"2","3","1",null],"label":"Am/E"},"Am/G":{"frets":[3,0,2,2,1,0],"fingers":["3",null,"2","2","1",null],"label":"Am/G"},"A/B":{"frets":[null,2,2,2,2,0],"fingers":[null,"1","2","3","4",null],"label":"A/B"},"A/C#":{"frets":[null,4,2,2,2,0],"fingers":[null,"4","1","2","3",null],"label":"A/C#"},"A/E":{"frets":[0,0,2,2,2,0],"fingers":[null,null,"1","2","3",null],"label":"A/E"},"A/F#":{"frets":[2,0,2,2,2,0],"fingers":["1",null,"2","3","4",null],"label":"A/F#"},"A#":{"frets":[null,1,3,3,3,1],"fingers":[null,"1","2","3","4","1"],"label":"A#","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"A#m":{"frets":[null,1,3,3,2,1],"fingers":[null,"1","3","4","2","1"],"label":"A#m","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"A#dim":{"frets":[null,1,2,3,2,0],"fingers":[null,"1","2","4","3",null],"label":"A#dim"},"A#sus4":{"frets":[null,1,3,3,4,1],"fingers":[null,"1","2","3","4","1"],"label":"A#sus4","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"A#sus2":{"frets":[null,1,3,3,1,1],"fingers":[null,"1","3","4","1","1"],"label":"A#sus2","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"A#6":{"frets":[null,1,3,3,3,3],"fingers":[null,"1","2","3","3","3"],"label":"A#6"},"A#7":{"frets":[null,1,3,1,3,1],"fingers":[null,"1","3","1","4","1"],"label":"A#7","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"A#aug7":{"frets":[null,1,0,1,3,2],"fingers":[null,"1",null,"2","4","3"],"label":"A#aug7"},"A#9":{"frets":[null,1,0,1,1,1],"fingers":[null,"2",null,"1","1","1"],"label":"A#9","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"A#maj7":{"frets":[null,1,3,2,3,1],"fingers":[null,"1","3","2","4","1"],"label":"A#maj7","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"A#m7":{"frets":[null,1,3,1,2,1],"fingers":[null,"1","3","1","2","1"],"label":"A#m7","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"A#m7b5":{"frets":[null,1,2,1,2,0],"fingers":[null,"1","3","1","4",null],"label":"A#m7b5","barre":{"fret":1,"fromString":1,"toString":3,"finger":"1"}},"B":{"frets":[null,2,4,4,4,2],"fingers":[null,"1","2","3","4","1"],"label":"B","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"Bm":{"frets":[null,2,4,4,3,2],"fingers":[null,"1","3","4","2","1"],"label":"Bm","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"Bdim":{"frets":[null,2,3,4,3,null],"fingers":[null,"1","2","4","3",null],"label":"Bdim"},"Bdim7":{"frets":[null,2,3,1,3,1],"fingers":[null,"2","3","1","4","1"],"label":"Bdim7","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"Bsus4":{"frets":[null,2,4,4,5,2],"fingers":[null,"1","2","3","4","1"],"label":"Bsus4","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"Bsus2":{"frets":[null,2,4,4,2,2],"fingers":[null,"1","3","4","1","1"],"label":"Bsus2","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"B7":{"frets":[null,2,1,2,0,2],"fingers":[null,"2","1","3",null,"4"],"label":"B7"},"B7b5":{"frets":[null,2,1,2,0,1],"fingers":[null,"3","1","4",null,"2"],"label":"B7b5"},"B9":{"frets":[null,2,1,2,2,2],"fingers":[null,"2","1","3","3","3"],"label":"B9"},"Bmaj7":{"frets":[null,2,4,3,4,2],"fingers":[null,"1","3","2","4","1"],"label":"Bmaj7","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"Bm6":{"frets":[null,2,0,1,0,2],"fingers":[null,"3",null,"2",null,"4"],"label":"Bm6"},"Bm7":{"frets":[null,2,4,2,3,2],"fingers":[null,"1","3","1","2","1"],"label":"Bm7","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"Bm7b5":{"frets":[null,2,3,2,3,null],"fingers":[null,"1","3","1","4",null],"label":"Bm7b5","barre":{"fret":2,"fromString":1,"toString":3,"finger":"1"}},"Bm9":{"frets":[null,2,0,2,2,2],"fingers":[null,"1",null,"2","3","4"],"label":"Bm9"},"Bmadd9":{"frets":[7,9,9,7,7,9],"fingers":["1","3","4","1","1","2"],"label":"Bmadd9","barre":{"fret":7,"fromString":0,"toString":4,"finger":"1"}},"Bm/A":{"frets":[null,0,4,4,3,2],"fingers":[null,null,"3","4","2","1"],"label":"Bm/A"},"Bm/D":{"frets":[null,null,0,4,3,2],"fingers":[null,null,null,"3","2","1"],"label":"Bm/D"},"Bm/F#":{"frets":[2,2,4,4,3,null],"fingers":["1","1","3","4","2",null],"label":"Bm/F#","barre":{"fret":2,"fromString":0,"toString":1,"finger":"1"}},"B/F#":{"frets":[2,2,4,4,4,2],"fingers":["1","1","2","3","4","1"],"label":"B/F#","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"B7#5":{"frets":[null,2,1,2,0,3],"fingers":[null,"2","1","3",null,"4"],"label":"B7#5"},"Cmsus4":{"frets":[null,3,3,0,1,1],"fingers":[null,"3","4",null,"1","1"],"label":"Cmsus4","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"C#madd11":{"frets":[null,4,4,6,5,4],"fingers":[null,"1","1","4","3","1"],"label":"C#madd11","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Dmaug":{"frets":[null,null,0,3,3,1],"fingers":[null,null,null,"3","4","1"],"label":"Dmaug"},"Emsus4":{"frets":[0,2,2,2,0,0],"fingers":[null,"2","3","4",null,null],"label":"Emsus4"},"Edim/E":{"frets":[0,1,2,0,null,null],"fingers":[null,"1","2",null,null,null],"label":"Edim/E"},"F#msus4":{"frets":[2,4,4,4,2,2],"fingers":["1","3","4","2","1","1"],"label":"F#msus4","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Gaug4":{"frets":[3,2,1,0,1,null],"fingers":["3","2","1",null,"1",null],"label":"Gaug4","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"Dm6/9":{"frets":[null,5,3,4,5,5],"fingers":[null,"3","1","2","4","4"],"label":"Dm6/9"},"Ebm":{"frets":[null,null,1,3,4,2],"fingers":[null,null,"1","3","4","2"],"label":"Ebm"},"Abm":{"frets":[4,6,6,4,4,4],"fingers":["1","3","4","1","1","1"],"label":"Abm","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Bbm":{"frets":[null,1,3,3,2,1],"fingers":[null,"1","3","4","2","1"],"label":"Bbm","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Dbm":{"frets":[null,4,6,6,5,4],"fingers":[null,"1","3","4","2","1"],"label":"Dbm","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Gbm":{"frets":[2,4,4,2,2,2],"fingers":["1","3","4","1","1","1"],"label":"Gbm","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Ab7":{"frets":[4,6,4,5,4,4],"fingers":["1","3","1","2","1","1"],"label":"Ab7","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Bb7":{"frets":[null,1,3,1,3,1],"fingers":[null,"1","3","1","4","1"],"label":"Bb7","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Db7":{"frets":[null,4,6,4,6,4],"fingers":[null,"1","3","1","4","1"],"label":"Db7","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Eb7":{"frets":[null,null,1,3,2,3],"fingers":[null,null,"1","4","2","3"],"label":"Eb7"},"Gb7":{"frets":[2,4,2,3,2,2],"fingers":["1","3","1","2","1","1"],"label":"Gb7","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Esus2":{"frets":[0,2,2,null,0,2],"fingers":[null,"1","2",null,null,"3"],"label":"Esus2"},"Gsus2":{"frets":[3,0,0,0,3,3],"fingers":["2",null,null,null,"3","4"],"label":"Gsus2"},"G#sus2":{"frets":[4,6,6,3,4,4],"fingers":["2","3","4","1","1","1"],"label":"G#sus2"},"B6":{"frets":[null,2,4,4,4,4],"fingers":[null,"1","2","2","2","2"],"label":"B6"},"C#dim7":{"frets":[null,null,2,3,2,3],"fingers":[null,null,"1","3","2","4"],"label":"C#dim7"},"Edim7":{"frets":[null,null,2,3,2,3],"fingers":[null,null,"1","3","2","4"],"label":"Edim7"},"Fdim7":{"frets":[1,2,0,1,0,1],"fingers":["2","3",null,"1",null,"1"],"label":"Fdim7","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"Gdim7":{"frets":[3,4,2,3,2,3],"fingers":["2","4","1","3","1","3"],"label":"Gdim7","barre":{"fret":2,"fromString":2,"toString":4,"finger":"1"}},"A#dim7":{"frets":[null,1,2,0,2,0],"fingers":[null,"1","2",null,"3",null],"label":"A#dim7"},"Dadd9":{"frets":[null,5,4,2,3,0],"fingers":[null,"4","3","1","2",null],"label":"Dadd9"},"Eadd9":{"frets":[0,2,2,1,0,2],"fingers":[null,"2","3","1",null,"4"],"label":"Eadd9"},"Badd9":{"frets":[null,2,1,4,2,2],"fingers":[null,"2","1","4","3","3"],"label":"Badd9"},"Db":{"frets":[null,4,6,6,6,4],"fingers":[null,"1","3","2","4","1"],"label":"Db","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Dbdim":{"frets":[null,4,5,6,5,null],"fingers":[null,"1","2","4","3",null],"label":"Dbdim"},"Dbsus4":{"frets":[null,4,6,6,7,4],"fingers":[null,"1","3","3","4","1"],"label":"Dbsus4","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Dbsus2":{"frets":[null,4,6,6,4,4],"fingers":[null,"1","3","4","1","1"],"label":"Dbsus2","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Db7sus4":{"frets":[null,4,6,4,7,4],"fingers":[null,"1","3","1","4","1"],"label":"Db7sus4","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Dbaug":{"frets":[null,4,3,2,2,1],"fingers":[null,"4","3","1","1","1"],"label":"Dbaug"},"Dbaug7":{"frets":[null,4,3,4,null,5],"fingers":[null,"2","1","3",null,"4"],"label":"Dbaug7"},"Db9":{"frets":[null,4,3,4,4,4],"fingers":[null,"2","1","3","3","3"],"label":"Db9"},"Db13":{"frets":[null,4,3,4,4,6],"fingers":[null,"2","1","3","3","4"],"label":"Db13"},"Dbmaj7":{"frets":[null,4,6,5,6,4],"fingers":[null,"1","3","2","4","1"],"label":"Dbmaj7","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Dbm7":{"frets":[null,4,6,4,5,4],"fingers":[null,"1","3","1","2","1"],"label":"Dbm7","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Dbm7b5":{"frets":[null,4,5,4,5,null],"fingers":[null,"1","3","2","4",null],"label":"Dbm7b5"},"Dbmadd9":{"frets":[null,4,2,6,4,null],"fingers":[null,"2","1","4","3",null],"label":"Dbmadd9"},"Dbm/B":{"frets":[null,2,2,1,2,0],"fingers":[null,"2","3","1","4",null],"label":"Dbm/B"},"Dbm/E":{"frets":[0,4,2,1,2,0],"fingers":[null,"4","2","1","3",null],"label":"Dbm/E"},"Db/B":{"frets":[null,2,3,1,2,4],"fingers":[null,"2","3","1","1","4"],"label":"Db/B"},"D/Gb":{"frets":[2,0,0,2,3,2],"fingers":["1",null,null,"2","4","3"],"label":"D/Gb"},"Eb":{"frets":[null,6,8,8,8,6],"fingers":[null,"1","3","4","2","1"],"label":"Eb","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"Ebdim":{"frets":[null,6,7,8,7,null],"fingers":[null,"1","2","4","3",null],"label":"Ebdim"},"Ebdim7":{"frets":[null,null,1,2,1,2],"fingers":[null,null,"1","3","2","4"],"label":"Ebdim7"},"Ebsus4":{"frets":[null,null,1,3,4,4],"fingers":[null,null,"1","2","3","4"],"label":"Ebsus4"},"Ebsus2":{"frets":[null,6,8,8,6,6],"fingers":[null,"1","3","4","1","1"],"label":"Ebsus2","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"Ebaug":{"frets":[null,6,5,4,4,null],"fingers":[null,"4","3","1","1",null],"label":"Ebaug","barre":{"fret":4,"fromString":3,"toString":4,"finger":"1"}},"Ebaug7":{"frets":[null,6,5,6,0,null],"fingers":[null,"3","2","4","1",null],"label":"Ebaug7"},"Eb9":{"frets":[null,6,5,6,6,null],"fingers":[null,"2","1","3","4",null],"label":"Eb9"},"Eb7b9":{"frets":[null,6,5,6,5,null],"fingers":[null,"2","1","3","1",null],"label":"Eb7b9","barre":{"fret":5,"fromString":2,"toString":4,"finger":"1"}},"Ebmaj7":{"frets":[null,6,8,7,8,6],"fingers":[null,"1","3","2","4","1"],"label":"Ebmaj7","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"Ebm7":{"frets":[null,null,1,3,2,2],"fingers":[null,null,"1","4","2","3"],"label":"Ebm7"},"Ebm9":{"frets":[null,6,4,6,6,6],"fingers":[null,"3","1","4","1","1"],"label":"Ebm9"},"Em/Gb":{"frets":[2,null,2,0,0,0],"fingers":["2",null,"3",null,null,null],"label":"Em/Gb"},"E/Gb":{"frets":[2,2,2,1,0,0],"fingers":["2","3","4","1",null,null],"label":"E/Gb"},"Gb":{"frets":[2,4,4,3,2,2],"fingers":["1","3","4","2","1","1"],"label":"Gb","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Gbdim":{"frets":[null,null,4,2,1,null],"fingers":[null,null,"3","2","1",null],"label":"Gbdim"},"Gbdim7":{"frets":[2,3,1,2,1,2],"fingers":["2","4","1","3","1","3"],"label":"Gbdim7","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"Gbsus4":{"frets":[2,4,4,4,2,2],"fingers":["1","3","3","3","1","1"],"label":"Gbsus4","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Gbsus2":{"frets":[2,4,4,1,2,2],"fingers":["2","3","4","1","1","1"],"label":"Gbsus2"},"Gb7sus4":{"frets":[2,4,2,4,2,2],"fingers":["1","3","1","4","1","1"],"label":"Gb7sus4","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Gbaug":{"frets":[null,null,4,3,3,2],"fingers":[null,null,"4","2","3","1"],"label":"Gbaug"},"Gb6":{"frets":[2,4,4,3,4,2],"fingers":["1","3","4","2","4","1"],"label":"Gb6","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Gbmaj7":{"frets":[2,4,3,3,2,2],"fingers":["1","3","2","2","1","1"],"label":"Gbmaj7","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Gbm6":{"frets":[2,4,4,2,4,2],"fingers":["1","3","4","1","4","1"],"label":"Gbm6","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Gbm7":{"frets":[2,4,2,2,2,2],"fingers":["1","3","1","1","1","1"],"label":"Gbm7","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Gbm7b5":{"frets":[2,3,2,2,1,null],"fingers":["2","4","3","3","1",null],"label":"Gbm7b5"},"Gbm9":{"frets":[2,4,2,2,2,4],"fingers":["1","3","1","1","1","4"],"label":"Gbm9","barre":{"fret":2,"fromString":0,"toString":4,"finger":"1"}},"Gbm/A":{"frets":[null,0,4,2,2,2],"fingers":[null,null,"4","1","1","1"],"label":"Gbm/A","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"Gbm/E":{"frets":[0,4,4,2,2,2],"fingers":[null,"3","4","1","1","1"],"label":"Gbm/E","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"Gbm/Eb":{"frets":[null,6,4,2,2,2],"fingers":[null,"4","3","1","1","1"],"label":"Gbm/Eb","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"G/Gb":{"frets":[2,2,0,0,0,3],"fingers":["1","2",null,null,null,"3"],"label":"G/Gb"},"Ab":{"frets":[4,6,6,5,4,4],"fingers":["1","3","4","2","1","1"],"label":"Ab","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Abdim":{"frets":[null,null,6,4,3,null],"fingers":[null,null,"4","2","1",null],"label":"Abdim"},"Abdim7":{"frets":[4,5,3,4,3,4],"fingers":["2","4","1","3","1","3"],"label":"Abdim7","barre":{"fret":3,"fromString":2,"toString":4,"finger":"1"}},"Absus4":{"frets":[4,6,6,6,4,4],"fingers":["1","3","3","3","1","1"],"label":"Absus4","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Ab7sus4":{"frets":[4,6,4,6,4,4],"fingers":["1","3","1","4","1","1"],"label":"Ab7sus4","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Ab6":{"frets":[4,6,6,5,6,4],"fingers":["1","3","4","2","3","1"],"label":"Ab6","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Ab9":{"frets":[4,6,4,5,4,6],"fingers":["1","3","1","2","1","4"],"label":"Ab9","barre":{"fret":4,"fromString":0,"toString":4,"finger":"1"}},"Abmaj7":{"frets":[4,6,5,5,4,4],"fingers":["1","3","2","2","1","1"],"label":"Abmaj7","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Abm7":{"frets":[4,6,4,4,4,4],"fingers":["1","3","1","1","1","1"],"label":"Abm7","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Abmadd9":{"frets":[4,6,6,4,4,6],"fingers":["1","3","4","1","1","2"],"label":"Abmadd9","barre":{"fret":4,"fromString":0,"toString":4,"finger":"1"}},"Abm/Gb":{"frets":[2,2,1,1,4,4],"fingers":["2","3","1","1","4","4"],"label":"Abm/Gb","barre":{"fret":1,"fromString":2,"toString":3,"finger":"1"}},"Am/Db":{"frets":[null,4,2,2,1,0],"fingers":[null,"4","2","3","1",null],"label":"Am/Db"},"A/Db":{"frets":[null,4,2,2,2,0],"fingers":[null,"4","1","2","3",null],"label":"A/Db"},"A/Gb":{"frets":[2,0,2,2,2,0],"fingers":["1",null,"2","3","4",null],"label":"A/Gb"},"Bb":{"frets":[null,1,3,3,3,1],"fingers":[null,"1","2","3","4","1"],"label":"Bb","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Bbdim":{"frets":[null,1,2,3,2,0],"fingers":[null,"1","2","4","3",null],"label":"Bbdim"},"Bbsus4":{"frets":[null,1,3,3,4,1],"fingers":[null,"1","2","3","4","1"],"label":"Bbsus4","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Bbsus2":{"frets":[null,1,3,3,1,1],"fingers":[null,"1","3","4","1","1"],"label":"Bbsus2","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Bb6":{"frets":[null,1,3,3,3,3],"fingers":[null,"1","2","3","3","3"],"label":"Bb6"},"Bbaug7":{"frets":[null,1,0,1,3,2],"fingers":[null,"1",null,"2","4","3"],"label":"Bbaug7"},"Bb9":{"frets":[null,1,0,1,1,1],"fingers":[null,"2",null,"1","1","1"],"label":"Bb9","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Bbmaj7":{"frets":[null,1,3,2,3,1],"fingers":[null,"1","3","2","4","1"],"label":"Bbmaj7","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Bbm7":{"frets":[null,1,3,1,2,1],"fingers":[null,"1","3","1","2","1"],"label":"Bbm7","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Bbm7b5":{"frets":[null,1,2,1,2,0],"fingers":[null,"1","3","1","4",null],"label":"Bbm7b5","barre":{"fret":1,"fromString":1,"toString":3,"finger":"1"}},"Bm/Gb":{"frets":[2,2,4,4,3,null],"fingers":["1","1","3","4","2",null],"label":"Bm/Gb","barre":{"fret":2,"fromString":0,"toString":1,"finger":"1"}},"B/Gb":{"frets":[2,2,4,4,4,2],"fingers":["1","1","2","3","4","1"],"label":"B/Gb","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Dbmadd11":{"frets":[null,4,4,6,5,4],"fingers":[null,"1","1","4","3","1"],"label":"Dbmadd11","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Gbmsus4":{"frets":[2,4,4,4,2,2],"fingers":["1","3","4","2","1","1"],"label":"Gbmsus4","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Absus2":{"frets":[4,6,6,3,4,4],"fingers":["2","3","4","1","1","1"],"label":"Absus2"},"Dbdim7":{"frets":[null,null,2,3,2,3],"fingers":[null,null,"1","3","2","4"],"label":"Dbdim7"},"Bbdim7":{"frets":[null,1,2,0,2,0],"fingers":[null,"1","2",null,"3",null],"label":"Bbdim7"},"A+7":{"frets":[null,0,3,0,2,1],"fingers":[null,null,"3",null,"2","1"],"label":"A+7"},"A4":{"frets":[null,0,2,2,3,0],"fingers":[null,null,"1","2","3",null],"label":"A4"},"A6/9":{"frets":[null,0,2,2,2,2],"fingers":[null,null,"1","1","1","1"],"label":"A6/9","barre":{"fret":2,"fromString":2,"toString":5,"finger":"1"}},"Ab(4-3)":{"frets":[4,6,6,6,4,4],"fingers":["1","3","3","3","1","1"],"label":"Ab(4-3)","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Ab6/Bb":{"frets":[4,6,6,5,6,4],"fingers":["1","3","4","2","3","1"],"label":"Ab6/Bb","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Abm(add9)":{"frets":[4,6,6,4,4,6],"fingers":["1","3","4","1","1","2"],"label":"Abm(add9)","barre":{"fret":4,"fromString":0,"toString":4,"finger":"1"}},"Adim7/Eb":{"frets":[null,0,1,2,1,2],"fingers":[null,null,"1","3","2","4"],"label":"Adim7/Eb"},"Am7/E":{"frets":[null,0,2,0,1,0],"fingers":[null,null,"2",null,"1",null],"label":"Am7/E"},"AO":{"frets":[null,0,1,2,1,null],"fingers":[null,null,"1","3","2",null],"label":"AO"},"B4":{"frets":[null,2,4,4,5,2],"fingers":[null,"1","2","3","4","1"],"label":"B4","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"B7(-5)":{"frets":[null,2,1,2,0,1],"fingers":[null,"3","1","4",null,"2"],"label":"B7(-5)"},"B7/A":{"frets":[null,2,1,2,0,2],"fingers":[null,"2","1","3",null,"4"],"label":"B7/A"},"B7/Eb":{"frets":[null,2,1,2,0,2],"fingers":[null,"2","1","3",null,"4"],"label":"B7/Eb"},"Bb+7":{"frets":[null,1,0,1,3,2],"fingers":[null,"1",null,"2","4","3"],"label":"Bb+7"},"Bb4":{"frets":[null,1,3,3,4,1],"fingers":[null,"1","2","3","4","1"],"label":"Bb4","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"BbO":{"frets":[null,1,2,3,2,0],"fingers":[null,"1","2","4","3",null],"label":"BbO"},"Bb/G#":{"frets":[null,1,3,3,3,1],"fingers":[null,"1","2","3","4","1"],"label":"Bb/G#","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"BbØ":{"frets":[null,1,2,1,2,0],"fingers":[null,"1","3","1","4",null],"label":"BbØ","barre":{"fret":1,"fromString":1,"toString":3,"finger":"1"}},"Bm(add9)":{"frets":[7,9,9,7,7,9],"fingers":["1","3","4","1","1","2"],"label":"Bm(add9)","barre":{"fret":7,"fromString":0,"toString":4,"finger":"1"}},"Bm/G#":{"frets":[null,2,4,4,3,2],"fingers":[null,"1","3","4","2","1"],"label":"Bm/G#","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"BØ":{"frets":[null,2,3,2,3,null],"fingers":[null,"1","3","1","4",null],"label":"BØ","barre":{"fret":2,"fromString":1,"toString":3,"finger":"1"}},"B°7":{"frets":[null,2,3,1,3,1],"fingers":[null,"2","3","1","4","1"],"label":"B°7","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"B°7/A":{"frets":[null,2,3,1,3,1],"fingers":[null,"2","3","1","4","1"],"label":"B°7/A","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"C+7":{"frets":[null,3,6,3,5,4],"fingers":[null,"1","4","1","3","2"],"label":"C+7","barre":{"fret":3,"fromString":1,"toString":3,"finger":"1"}},"C4":{"frets":[null,3,3,0,1,1],"fingers":[null,"3","4",null,"1","1"],"label":"C4","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"CØ":{"frets":[null,3,4,3,4,null],"fingers":[null,"1","3","2","4",null],"label":"CØ"},"C°7":{"frets":[null,3,4,2,4,2],"fingers":[null,"2","3","1","4","1"],"label":"C°7","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"C#+":{"frets":[null,4,3,2,2,1],"fingers":[null,"4","3","1","1","1"],"label":"C#+"},"C#m(add9)":{"frets":[null,4,2,6,4,null],"fingers":[null,"2","1","4","3",null],"label":"C#m(add9)"},"C#m7-5":{"frets":[null,4,5,4,5,null],"fingers":[null,"1","3","2","4",null],"label":"C#m7-5"},"D+7":{"frets":[null,null,0,3,1,2],"fingers":[null,null,null,"3","1","2"],"label":"D+7"},"D2":{"frets":[null,null,0,2,3,0],"fingers":[null,null,null,"1","2",null],"label":"D2"},"D4":{"frets":[null,null,0,2,3,3],"fingers":[null,null,null,"1","2","3"],"label":"D4"},"D6(no3)":{"frets":[null,null,0,2,0,2],"fingers":[null,null,null,"2",null,"3"],"label":"D6(no3)"},"D6/Gm":{"frets":[null,null,0,2,0,2],"fingers":[null,null,null,"2",null,"3"],"label":"D6/Gm"},"D9/F#":{"frets":[null,5,4,5,5,5],"fingers":[null,"2","1","3","3","3"],"label":"D9/F#"},"Db+7":{"frets":[null,4,3,4,null,5],"fingers":[null,"2","1","3",null,"4"],"label":"Db+7"},"Dm(7-6)":{"frets":[null,null,0,2,1,1],"fingers":[null,null,null,"2","1","1"],"label":"Dm(7-6)","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Dm6/B":{"frets":[null,null,0,2,0,1],"fingers":[null,null,null,"3",null,"1"],"label":"Dm6/B"},"Dm6/F":{"frets":[null,null,0,2,0,1],"fingers":[null,null,null,"3",null,"1"],"label":"Dm6/F"},"DØ":{"frets":[null,null,0,1,1,1],"fingers":[null,null,null,"1","1","1"],"label":"DØ","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"D°7":{"frets":[null,null,0,1,0,1],"fingers":[null,null,null,"2",null,"3"],"label":"D°7"},"E(4-7)":{"frets":[0,2,2,2,0,0],"fingers":[null,"2","3","4",null,null],"label":"E(4-7)"},"E4":{"frets":[0,2,2,2,0,0],"fingers":[null,"2","3","4",null,null],"label":"E4"},"E/G#":{"frets":[0,2,2,1,0,0],"fingers":[null,"2","3","1",null,null],"label":"E/G#"},"Eb+":{"frets":[null,6,5,4,4,null],"fingers":[null,"4","3","1","1",null],"label":"Eb+","barre":{"fret":4,"fromString":3,"toString":4,"finger":"1"}},"Eb+7":{"frets":[null,6,5,6,0,null],"fingers":[null,"3","2","4","1",null],"label":"Eb+7"},"Eb7(-9)":{"frets":[null,6,5,6,5,null],"fingers":[null,"2","1","3","1",null],"label":"Eb7(-9)","barre":{"fret":5,"fromString":2,"toString":4,"finger":"1"}},"Ebm/Db":{"frets":[null,6,8,8,7,6],"fingers":[null,"1","3","4","2","1"],"label":"Ebm/Db","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"Em(7-6)":{"frets":[0,2,0,0,0,0],"fingers":[null,"2",null,null,null,null],"label":"Em(7-6)"},"Em(add9)":{"frets":[0,2,2,0,0,2],"fingers":[null,"2","3",null,null,"4"],"label":"Em(add9)"},"Em/Db":{"frets":[0,2,2,0,0,0],"fingers":[null,"1","2",null,null,null],"label":"Em/Db"},"EO":{"frets":[0,1,2,0,null,null],"fingers":[null,"1","2",null,null,null],"label":"EO"},"Eo":{"frets":[0,1,2,0,null,null],"fingers":[null,"1","2",null,null,null],"label":"Eo"},"F(2-1)":{"frets":[null,null,3,0,1,1],"fingers":[null,null,"3",null,"1","2"],"label":"F(2-1)"},"F+7":{"frets":[1,null,1,2,2,null],"fingers":["1",null,"1","3","4",null],"label":"F+7","barre":{"fret":1,"fromString":0,"toString":2,"finger":"1"}},"FØ":{"frets":[1,null,1,1,0,null],"fingers":["1",null,"2","3",null,null],"label":"FØ"},"F#+":{"frets":[null,null,4,3,3,2],"fingers":[null,null,"4","2","3","1"],"label":"F#+"},"F#ø":{"frets":[2,3,2,2,1,null],"fingers":["2","4","3","3","1",null],"label":"F#ø"},"F#°7":{"frets":[2,3,1,2,1,2],"fingers":["2","4","1","3","1","3"],"label":"F#°7","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"F#7/4-3":{"frets":[2,4,2,3,2,2],"fingers":["1","3","1","2","1","1"],"label":"F#7/4-3","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#b5m7":{"frets":[2,3,2,2,1,null],"fingers":["2","4","3","3","1",null],"label":"F#b5m7"},"F#m6/A":{"frets":[2,4,4,2,4,2],"fingers":["1","3","4","1","4","1"],"label":"F#m6/A","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"F#m74":{"frets":[2,4,2,2,2,2],"fingers":["1","3","1","1","1","1"],"label":"F#m74","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Fmaj7/D":{"frets":[null,null,3,2,1,0],"fingers":[null,null,"3","2","1",null],"label":"Fmaj7/D"},"FO":{"frets":[1,2,3,1,null,null],"fingers":["1","2","4","1",null,null],"label":"FO","barre":{"fret":1,"fromString":0,"toString":3,"finger":"1"}},"G(4-3)":{"frets":[3,3,0,0,1,3],"fingers":["2","3",null,null,"1","4"],"label":"G(4-3)"},"G4":{"frets":[3,3,0,0,1,3],"fingers":["2","3",null,null,"1","4"],"label":"G4"},"G6/A":{"frets":[3,2,0,0,0,0],"fingers":["2","1",null,null,null,null],"label":"G6/A"},"G6/D":{"frets":[3,2,0,0,0,0],"fingers":["2","1",null,null,null,null],"label":"G6/D"},"G7/Cm":{"frets":[3,2,0,0,0,1],"fingers":["3","2",null,null,null,"1"],"label":"G7/Cm"},"Gm6/D":{"frets":[3,5,2,3,5,3],"fingers":["2","4","1","3","4","2"],"label":"Gm6/D"},"Gm7/B":{"frets":[3,5,3,3,3,3],"fingers":["1","3","1","1","1","1"],"label":"Gm7/B","barre":{"fret":3,"fromString":0,"toString":5,"finger":"1"}},"Gsus4/D":{"frets":[3,3,0,0,1,3],"fingers":["2","3",null,null,"1","4"],"label":"Gsus4/D"},"G#4":{"frets":[4,6,6,6,4,4],"fingers":["1","3","3","3","1","1"],"label":"G#4","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#(4-3)":{"frets":[4,6,6,6,4,4],"fingers":["1","3","3","3","1","1"],"label":"G#(4-3)","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"G#O":{"frets":[null,null,6,4,3,null],"fingers":[null,null,"4","2","1",null],"label":"G#O"},"Eb2":{"frets":[null,6,8,8,6,6],"fingers":[null,"1","3","4","1","1"],"label":"Eb2","barre":{"fret":6,"fromString":1,"toString":5,"finger":"1"}},"Db2":{"frets":[null,4,6,6,4,4],"fingers":[null,"1","3","4","1","1"],"label":"Db2","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Bb2":{"frets":[null,1,3,3,1,1],"fingers":[null,"1","3","4","1","1"],"label":"Bb2","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Ab2":{"frets":[4,6,6,3,4,4],"fingers":["2","3","4","1","1","1"],"label":"Ab2"},"Eb4":{"frets":[null,null,1,3,4,4],"fingers":[null,null,"1","2","3","4"],"label":"Eb4"},"Ab4":{"frets":[4,6,6,6,4,4],"fingers":["1","3","3","3","1","1"],"label":"Ab4","barre":{"fret":4,"fromString":0,"toString":5,"finger":"1"}},"Ddim":{"frets":[null,5,6,7,6,null],"fingers":[null,"1","2","4","3",null],"label":"Ddim"},"Em7b5":{"frets":[null,7,8,7,8,null],"fingers":[null,"1","3","2","4",null],"label":"Em7b5"},"Gm7b5":{"frets":[null,10,11,10,11,null],"fingers":[null,"1","3","2","4",null],"label":"Gm7b5"},"Am7b5":{"frets":[null,0,1,0,1,null],"fingers":[null,null,"2",null,"3",null],"label":"Am7b5"},"G#m7b5":{"frets":[null,11,12,11,12,null],"fingers":[null,"1","3","2","4",null],"label":"G#m7b5"},"Ebm7b5":{"frets":[null,6,7,6,7,null],"fingers":[null,"1","3","2","4",null],"label":"Ebm7b5"},"D#m7b5":{"frets":[null,6,7,6,7,null],"fingers":[null,"1","3","2","4",null],"label":"D#m7b5"},"Abm7b5":{"frets":[null,11,12,11,12,null],"fingers":[null,"1","3","2","4",null],"label":"Abm7b5"},"E7b9":{"frets":[null,7,6,7,6,7],"fingers":[null,"2","1","3","1","4"],"label":"E7b9","barre":{"fret":6,"fromString":2,"toString":4,"finger":"1"}},"G7b9":{"frets":[null,10,9,10,9,10],"fingers":[null,"2","1","3","1","4"],"label":"G7b9","barre":{"fret":9,"fromString":2,"toString":4,"finger":"1"}},"C7b9":{"frets":[null,3,2,3,2,3],"fingers":[null,"2","1","3","1","4"],"label":"C7b9","barre":{"fret":2,"fromString":2,"toString":4,"finger":"1"}},"F7b9":{"frets":[null,8,7,8,7,8],"fingers":[null,"2","1","3","1","4"],"label":"F7b9","barre":{"fret":7,"fromString":2,"toString":4,"finger":"1"}},"G7sus4":{"frets":[3,5,3,5,3,3],"fingers":["1","3","1","4","1","1"],"label":"G7sus4","barre":{"fret":3,"fromString":0,"toString":5,"finger":"1"}},"B7sus4":{"frets":[null,2,2,2,0,0],"fingers":[null,"1","2","3",null,null],"label":"B7sus4"},"Bb7sus4":{"frets":[6,8,6,8,6,6],"fingers":["1","3","1","4","1","1"],"label":"Bb7sus4","barre":{"fret":6,"fromString":0,"toString":5,"finger":"1"}},"Eb7sus4":{"frets":[null,6,6,6,4,4],"fingers":[null,"2","3","4","1","1"],"label":"Eb7sus4","barre":{"fret":4,"fromString":4,"toString":5,"finger":"1"}},"Gaug":{"frets":[3,2,1,0,0,null],"fingers":["3","2","1",null,null,null],"label":"Gaug"},"Baug":{"frets":[null,2,1,0,0,null],"fingers":[null,"2","1",null,null,null],"label":"Baug"},"Bbaug":{"frets":[null,1,4,3,3,null],"fingers":[null,"1","4","2","3",null],"label":"Bbaug"},"G#aug":{"frets":[4,3,2,1,1,null],"fingers":["4","3","2","1","1",null],"label":"G#aug","barre":{"fret":1,"fromString":3,"toString":4,"finger":"1"}},"Gaug7":{"frets":[null,10,13,10,12,11],"fingers":[null,"1","4","1","3","2"],"label":"Gaug7","barre":{"fret":10,"fromString":1,"toString":3,"finger":"1"}},"Baug7":{"frets":[null,2,5,2,4,3],"fingers":[null,null,"2","1","1","3"],"label":"Baug7"},"D7#9":{"frets":[null,5,4,5,6,null],"fingers":[null,"2","1","3","4",null],"label":"D7#9"},"C7#9":{"frets":[null,3,2,3,4,null],"fingers":[null,"2","1","3","4",null],"label":"C7#9"},"Gmaug":{"frets":[3,1,1,3,null,null],"fingers":["2","1","1","2",null,null],"label":"Gmaug","barre":{"fret":1,"fromString":1,"toString":2,"finger":"1"}},"Emaug":{"frets":[0,3,2,0,1,3],"fingers":[null,"3","2",null,"1","3"],"label":"Emaug"},"Cmaug":{"frets":[null,3,1,1,1,null],"fingers":[null,"2","1","1","1",null],"label":"Cmaug","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"Fmaug":{"frets":[null,null,3,1,2,1],"fingers":[null,null,"3","1","2","1"],"label":"Fmaug","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"Bmaug":{"frets":[null,2,0,0,0,null],"fingers":[null,"1",null,null,null,null],"label":"Bmaug"},"C#maug":{"frets":[null,4,2,2,2,null],"fingers":[null,"2","1","1","1",null],"label":"C#maug","barre":{"fret":2,"fromString":2,"toString":4,"finger":"1"}},"DmM7":{"frets":[null,null,0,2,2,1],"fingers":[null,null,null,"2","3","1"],"label":"DmM7"},"EmM7":{"frets":[0,2,1,0,0,0],"fingers":[null,"2","1",null,null,null],"label":"EmM7"},"FmM7":{"frets":[1,3,2,1,1,1],"fingers":["1","3","2","1","1","1"],"label":"FmM7","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"GmM7":{"frets":[3,1,0,0,3,2],"fingers":["3","1",null,null,"4","2"],"label":"GmM7"},"F#mM7":{"frets":[2,4,3,2,2,2],"fingers":["1","3","2","1","1","1"],"label":"F#mM7","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"Fmaj7b5":{"frets":[1,0,2,2,0,0],"fingers":["1",null,"2","3",null,null],"label":"Fmaj7b5"},"Amaj7b5":{"frets":[null,0,1,1,2,4],"fingers":[null,null,"1","1","2","4"],"label":"Amaj7b5","barre":{"fret":1,"fromString":2,"toString":3,"finger":"1"}},"G#m/B":{"frets":[null,2,1,1,4,4],"fingers":[null,"2","1","1","4","4"],"label":"G#m/B","barre":{"fret":1,"fromString":2,"toString":3,"finger":"1"}},"Cm/D":{"frets":[null,null,0,5,4,3],"fingers":[null,null,null,"3","2","1"],"label":"Cm/D"},"E/Bb":{"frets":[null,1,2,1,0,0],"fingers":[null,"1","3","2",null,null],"label":"E/Bb"},"F4":{"frets":[1,3,3,3,1,1],"fingers":["1","2","3","4","1","1"],"label":"F4","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"G#/D":{"frets":[null,null,0,5,4,4],"fingers":[null,null,null,"2","1","1"],"label":"G#/D","barre":{"fret":4,"fromString":4,"toString":5,"finger":"1"}},"G#m/F":{"frets":[1,2,1,1,0,null],"fingers":["1","4","2","3",null,null],"label":"G#m/F"},"A2":{"frets":[null,0,2,2,0,0],"fingers":[null,null,"2","3",null,null],"label":"A2"},"Bm/E":{"frets":[0,2,0,4,0,2],"fingers":[null,"1",null,"4",null,"2"],"label":"Bm/E"},"G#/C":{"frets":[null,3,1,1,1,4],"fingers":[null,"3","1","1","1","4"],"label":"G#/C","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"D/C#":{"frets":[null,4,0,2,3,2],"fingers":[null,"3",null,"1","2","1"],"label":"D/C#","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"F/E":{"frets":[null,null,2,2,1,1],"fingers":[null,null,"2","3","1","1"],"label":"F/E","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Eb/G":{"frets":[3,null,null,3,4,3],"fingers":["1","1","1","1","2","1"],"label":"Eb/G","barre":{"fret":3,"fromString":0,"toString":5,"finger":"1"}},"Bb/D":{"frets":[null,null,0,3,3,1],"fingers":[null,null,null,"3","4","1"],"label":"Bb/D"},"Am/F#":{"frets":[2,0,2,2,1,0],"fingers":["2",null,"3","4","1",null],"label":"Am/F#"},"Ab/G":{"frets":[3,3,1,1,1,4],"fingers":["2","3","1","1","1","4"],"label":"Ab/G","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"A/D":{"frets":[null,null,0,2,2,0],"fingers":[null,null,null,"1","2",null],"label":"A/D"},"Cm/G":{"frets":[3,3,5,5,4,3],"fingers":["1","1","3","4","2","1"],"label":"Cm/G","barre":{"fret":3,"fromString":0,"toString":5,"finger":"1"}},"Eb/D":{"frets":[null,null,0,3,4,3],"fingers":[null,null,null,"1","2","1"],"label":"Eb/D","barre":{"fret":3,"fromString":3,"toString":5,"finger":"1"}},"Cm/A":{"frets":[null,0,1,0,1,3],"fingers":[null,null,"1",null,"2","4"],"label":"Cm/A"},"Cm/Eb":{"frets":[null,null,1,0,1,3],"fingers":[null,null,"1",null,"2","4"],"label":"Cm/Eb"},"Gm/D":{"frets":[null,null,0,3,3,3],"fingers":[null,null,null,"1","1","1"],"label":"Gm/D","barre":{"fret":3,"fromString":3,"toString":5,"finger":"1"}},"Gm9/F":{"frets":[null,8,5,7,6,5],"fingers":[null,"4","1","3","2","1"],"label":"Gm9/F","barre":{"fret":5,"fromString":2,"toString":5,"finger":"1"}},"Gm/Eb":{"frets":[null,null,1,3,3,3],"fingers":[null,null,"1","3","3","3"],"label":"Gm/Eb"},"Eaug7":{"frets":[0,3,0,1,1,0],"fingers":[null,"4",null,"1","2",null],"label":"Eaug7"},"Em/Eb":{"frets":[null,null,1,0,0,0],"fingers":[null,null,"1",null,null,null],"label":"Em/Eb"},"C2":{"frets":[null,3,0,0,1,3],"fingers":[null,"3",null,null,"1","4"],"label":"C2"},"A/G":{"frets":[3,0,2,2,2,0],"fingers":["4",null,"1","2","3",null],"label":"A/G"},"G/A":{"frets":[null,0,0,0,0,3],"fingers":[null,null,null,null,null,"1"],"label":"G/A"},"Bbm/C#":{"frets":[null,4,3,3,6,6],"fingers":[null,"2","1","1","4","4"],"label":"Bbm/C#","barre":{"fret":3,"fromString":2,"toString":3,"finger":"1"}},"Abm/F#":{"frets":[2,2,1,1,0,null],"fingers":["3","4","1","2",null,null],"label":"Abm/F#"},"F/Eb":{"frets":[null,null,1,2,1,1],"fingers":[null,null,"1","2","1","1"],"label":"F/Eb","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"Bbm/Ab":{"frets":[4,4,3,3,null,null],"fingers":["2","3","1","1",null,null],"label":"Bbm/Ab","barre":{"fret":3,"fromString":2,"toString":3,"finger":"1"}},"Ab/C":{"frets":[null,3,1,1,1,4],"fingers":[null,"3","1","1","1","4"],"label":"Ab/C","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"Ab/Eb":{"frets":[null,null,1,1,1,4],"fingers":[null,null,"1","1","1","4"],"label":"Ab/Eb","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"B/G":{"frets":[3,2,4,4,4,null],"fingers":["2","1","3","3","3",null],"label":"B/G"},"Eb6":{"frets":[null,null,1,3,1,3],"fingers":[null,null,"1","3","1","4"],"label":"Eb6","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"B/A":{"frets":[null,0,1,4,0,2],"fingers":[null,null,"1","4",null,"2"],"label":"B/A"},"E2":{"frets":[2,2,2,4,5,2],"fingers":["1","1","1","3","4","1"],"label":"E2","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"G#m/C#":{"frets":[null,4,1,1,0,null],"fingers":[null,"4","1","2",null,null],"label":"G#m/C#"},"B/Eb":{"frets":[null,null,1,4,0,2],"fingers":[null,null,"1","4",null,"2"],"label":"B/Eb"},"Bb/F":{"frets":[1,1,3,3,3,1],"fingers":["1","1","2","3","4","1"],"label":"Bb/F","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"D/E":{"frets":[0,0,0,2,3,2],"fingers":[null,null,null,"1","2","1"],"label":"D/E","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"Bm11":{"frets":[null,2,0,2,2,0],"fingers":[null,"1",null,"2","3",null],"label":"Bm11"},"Am11":{"frets":[null,0,0,0,1,0],"fingers":[null,null,null,null,"1",null],"label":"Am11"},"Fm/Ab":{"frets":[4,3,3,1,1,1],"fingers":["4","2","3","1","1","1"],"label":"Fm/Ab","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"Bbm/F":{"frets":[1,1,3,3,2,1],"fingers":["1","1","3","4","2","1"],"label":"Bbm/F","barre":{"fret":1,"fromString":0,"toString":5,"finger":"1"}},"Am9/G":{"frets":[3,0,2,0,0,0],"fingers":["2",null,"1",null,null,null],"label":"Am9/G"},"Dmadd9":{"frets":[null,5,3,2,3,0],"fingers":[null,"4","2","1","3",null],"label":"Dmadd9"},"A#/C":{"frets":[null,3,0,3,3,1],"fingers":[null,"2",null,"3","4","1"],"label":"A#/C"},"Fmaj9":{"frets":[1,0,2,0,1,0],"fingers":["1",null,"3",null,"2",null],"label":"Fmaj9"},"A13":{"frets":[null,0,2,0,2,2],"fingers":[null,null,"1",null,"2","3"],"label":"A13"},"Gm/C":{"frets":[null,3,5,3,3,3],"fingers":[null,"1","3","1","1","1"],"label":"Gm/C","barre":{"fret":3,"fromString":1,"toString":5,"finger":"1"}},"Bbadd9":{"frets":[null,1,0,3,1,1],"fingers":[null,"1",null,"4","2","3"],"label":"Bbadd9"},"Eb/Bb":{"frets":[null,1,1,3,4,3],"fingers":[null,"1","1","2","4","3"],"label":"Eb/Bb","barre":{"fret":1,"fromString":1,"toString":2,"finger":"1"}},"Ebm/Bb":{"frets":[null,1,1,3,4,2],"fingers":[null,"1","1","3","4","2"],"label":"Ebm/Bb","barre":{"fret":1,"fromString":1,"toString":2,"finger":"1"}},"Bbmaj9":{"frets":[1,1,0,2,1,null],"fingers":["1","1",null,"3","2",null],"label":"Bbmaj9","barre":{"fret":1,"fromString":0,"toString":1,"finger":"1"}},"Abm/Bb":{"frets":[null,1,1,4,4,4],"fingers":[null,"1","1","4","4","4"],"label":"Abm/Bb","barre":{"fret":1,"fromString":1,"toString":2,"finger":"1"}},"F/D":{"frets":[null,null,0,2,1,1],"fingers":[null,null,null,"2","1","1"],"label":"F/D","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Am/F":{"frets":[null,null,3,2,1,0],"fingers":[null,null,"3","2","1",null],"label":"Am/F"},"Abm/Eb":{"frets":[null,null,1,1,0,4],"fingers":[null,null,"1","2",null,"4"],"label":"Abm/Eb"},"Bb11":{"frets":[null,1,1,1,3,1],"fingers":[null,"1","1","1","3","1"],"label":"Bb11","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"D7b5":{"frets":[null,null,0,1,1,2],"fingers":[null,null,null,"1","1","2"],"label":"D7b5","barre":{"fret":1,"fromString":3,"toString":4,"finger":"1"}},"B11":{"frets":[null,2,1,2,0,0],"fingers":[null,"2","1","3",null,null],"label":"B11"},"Abm/B":{"frets":[null,2,1,1,4,4],"fingers":[null,"2","1","1","4","4"],"label":"Abm/B","barre":{"fret":1,"fromString":2,"toString":3,"finger":"1"}},"G7b5":{"frets":[3,null,3,4,2,null],"fingers":["2",null,"3","4","1",null],"label":"G7b5"},"Dm/Bb":{"frets":[null,1,3,2,3,1],"fingers":[null,"1","3","2","4","1"],"label":"Dm/Bb","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Dm/B":{"frets":[null,2,0,2,3,1],"fingers":[null,"2",null,"3","4","1"],"label":"Dm/B"},"Dm9/C":{"frets":[null,3,0,2,1,0],"fingers":[null,"3",null,"2","1",null],"label":"Dm9/C"},"Ab13":{"frets":[4,1,3,1,1,2],"fingers":["4","1","3","1","1","2"],"label":"Ab13","barre":{"fret":1,"fromString":1,"toString":4,"finger":"1"}},"C69":{"frets":[null,3,2,2,3,3],"fingers":[null,"3","1","1","3","4"],"label":"C69","barre":{"fret":2,"fromString":2,"toString":3,"finger":"1"}},"Fm9":{"frets":[1,3,1,1,1,3],"fingers":["1","3","1","1","1","4"],"label":"Fm9","barre":{"fret":1,"fromString":0,"toString":4,"finger":"1"}},"G/C":{"frets":[null,3,0,0,0,3],"fingers":[null,"1",null,null,null,"2"],"label":"G/C"},"Am/D":{"frets":[null,null,0,2,1,0],"fingers":[null,null,null,"2","1",null],"label":"Am/D"},"Cmaj9":{"frets":[null,3,0,0,0,0],"fingers":[null,"3",null,null,null,null],"label":"Cmaj9"},"Badd11":{"frets":[null,2,1,4,0,0],"fingers":[null,"2","1","4",null,null],"label":"Badd11"},"C7/G":{"frets":[3,3,2,3,null,null],"fingers":["2","3","1","4",null,null],"label":"C7/G"},"Am/B":{"frets":[null,2,2,2,1,0],"fingers":[null,"2","3","4","1",null],"label":"Am/B"},"C/C#":{"frets":[null,4,2,0,1,0],"fingers":[null,"4","2",null,"1",null],"label":"C/C#"},"Dm/E":{"frets":[0,0,0,2,3,1],"fingers":[null,null,null,"2","3","1"],"label":"Dm/E"},"Bb/A":{"frets":[null,0,0,3,3,1],"fingers":[null,null,null,"3","4","1"],"label":"Bb/A"},"E7b5":{"frets":[0,1,0,1,3,0],"fingers":[null,"1",null,"2","4",null],"label":"E7b5"},"D/Eb":{"frets":[null,null,1,2,3,2],"fingers":[null,null,"1","2","4","3"],"label":"D/Eb"},"Bbm/C":{"frets":[null,3,3,6,6,6],"fingers":[null,"1","1","4","4","4"],"label":"Bbm/C","barre":{"fret":3,"fromString":1,"toString":2,"finger":"1"}},"Bbm6":{"frets":[null,1,3,null,2,3],"fingers":[null,"1","3",null,"2","4"],"label":"Bbm6"},"G#m/Eb":{"frets":[null,null,1,1,0,4],"fingers":[null,null,"1","2",null,"4"],"label":"G#m/Eb"},"Bm/Ab":{"frets":[4,null,4,4,3,null],"fingers":["2",null,"3","4","1",null],"label":"Bm/Ab"},"Abm6":{"frets":[4,null,3,4,4,null],"fingers":["2",null,"1","3","4",null],"label":"Abm6"},"G#/Eb":{"frets":[null,null,1,1,1,4],"fingers":[null,null,"1","1","1","4"],"label":"G#/Eb","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"F/F#":{"frets":[2,0,3,2,1,1],"fingers":["2",null,"4","3","1","1"],"label":"F/F#","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Dm/C#":{"frets":[null,4,0,2,3,1],"fingers":[null,"4",null,"2","3","1"],"label":"Dm/C#"},"Dm/Eb":{"frets":[null,null,1,2,3,1],"fingers":[null,null,"1","2","3","1"],"label":"Dm/Eb","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"Bb/Ab":{"frets":[4,5,3,3,3,6],"fingers":["2","3","1","1","1","4"],"label":"Bb/Ab","barre":{"fret":3,"fromString":2,"toString":4,"finger":"1"}},"Eb/F":{"frets":[1,1,1,3,4,3],"fingers":["1","1","1","2","4","3"],"label":"Eb/F","barre":{"fret":1,"fromString":0,"toString":2,"finger":"1"}},"Eb/C#":{"frets":[null,4,5,3,4,3],"fingers":[null,"2","4","1","3","1"],"label":"Eb/C#","barre":{"fret":3,"fromString":3,"toString":5,"finger":"1"}},"Bb/C":{"frets":[null,3,0,3,3,1],"fingers":[null,"2",null,"3","4","1"],"label":"Bb/C"},"A7b9":{"frets":[null,0,2,3,2,3],"fingers":[null,null,"1","2","1","3"],"label":"A7b9","barre":{"fret":2,"fromString":2,"toString":4,"finger":"1"}},"Dm11":{"frets":[null,null,0,0,1,1],"fingers":[null,null,null,null,"1","1"],"label":"Dm11","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Amaj9":{"frets":[null,0,2,4,2,4],"fingers":[null,null,"1","3","1","4"],"label":"Amaj9","barre":{"fret":2,"fromString":2,"toString":4,"finger":"1"}},"E/A":{"frets":[null,0,2,1,0,0],"fingers":[null,null,"2","1",null,null],"label":"E/A"},"Fm/D":{"frets":[null,null,0,1,1,1],"fingers":[null,null,null,"1","1","1"],"label":"Fm/D","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"B2":{"frets":[2,2,4,4,2,2],"fingers":["1","1","3","4","1","1"],"label":"B2","barre":{"fret":2,"fromString":0,"toString":5,"finger":"1"}},"D11":{"frets":[null,null,0,0,1,2],"fingers":[null,null,null,null,"1","2"],"label":"D11"},"A/Bb":{"frets":[null,1,2,2,2,0],"fingers":[null,"1","2","3","4",null],"label":"A/Bb"},"Bb7b9":{"frets":[null,1,0,1,0,1],"fingers":[null,"1",null,"2",null,"3"],"label":"Bb7b9"},"Em/A":{"frets":[null,0,2,0,0,0],"fingers":[null,null,"1",null,null,null],"label":"Em/A"},"Bmaj9":{"frets":[2,2,1,3,2,null],"fingers":["2","2","1","4","3",null],"label":"Bmaj9"},"Gm11":{"frets":[3,null,3,3,1,null],"fingers":["2",null,"3","4","1",null],"label":"Gm11"},"A/Ab":{"frets":[4,4,2,2,2,5],"fingers":["2","3","1","1","1","4"],"label":"A/Ab","barre":{"fret":2,"fromString":2,"toString":4,"finger":"1"}},"Aadd11":{"frets":[null,0,7,7,10,9],"fingers":[null,null,"1","1","4","3"],"label":"Aadd11","barre":{"fret":7,"fromString":2,"toString":3,"finger":"1"}},"C/A":{"frets":[null,0,2,0,1,0],"fingers":[null,null,"2",null,"1",null],"label":"C/A"},"Gm/F#":{"frets":[2,1,0,0,null,null],"fingers":["2","1",null,null,null,null],"label":"Gm/F#"},"G/Ab":{"frets":[4,2,0,0,0,3],"fingers":["3","1",null,null,null,"2"],"label":"G/Ab"},"Ab/A":{"frets":[null,0,1,1,1,4],"fingers":[null,null,"1","1","1","4"],"label":"Ab/A","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"Bb/B":{"frets":[null,2,0,3,3,1],"fingers":[null,"2",null,"3","4","1"],"label":"Bb/B"},"A/C":{"frets":[null,3,2,2,2,0],"fingers":[null,"4","1","2","3",null],"label":"A/C"},"G7#9":{"frets":[3,2,0,3,0,1],"fingers":["3","2",null,"4",null,"1"],"label":"G7#9"},"Bb7b5":{"frets":[null,1,2,1,3,null],"fingers":[null,"1","2","1","3",null],"label":"Bb7b5","barre":{"fret":1,"fromString":1,"toString":3,"finger":"1"}},"G69":{"frets":[3,0,0,0,0,0],"fingers":["1",null,null,null,null,null],"label":"G69"},"C11":{"frets":[null,3,2,3,1,1],"fingers":[null,"3","2","4","1","1"],"label":"C11","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Bbm9":{"frets":[null,null,3,5,2,4],"fingers":[null,null,"2","4","1","3"],"label":"Bbm9"},"F2":{"frets":[1,3,3,null,1,3],"fingers":["1","2","3",null,"1","4"],"label":"F2","barre":{"fret":1,"fromString":0,"toString":4,"finger":"1"}},"Gmadd9":{"frets":[3,1,0,2,3,3],"fingers":["3","1",null,"2","4","4"],"label":"Gmadd9"},"Am/Ab":{"frets":[4,3,2,2,5,5],"fingers":["3","2","1","1","4","4"],"label":"Am/Ab","barre":{"fret":2,"fromString":2,"toString":3,"finger":"1"}},"Fm/C#":{"frets":[null,4,3,1,1,1],"fingers":[null,"4","3","1","1","1"],"label":"Fm/C#","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"Fm/G":{"frets":[3,3,3,1,1,1],"fingers":["2","3","4","1","1","1"],"label":"Fm/G","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"Am/Bb":{"frets":[null,1,2,2,1,0],"fingers":[null,"1","3","4","2",null],"label":"Am/Bb"},"D/G":{"frets":[3,0,0,2,3,2],"fingers":["2",null,null,"1","3","1"],"label":"D/G","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"B7b9":{"frets":[null,2,1,2,1,2],"fingers":[null,"2","1","3","1","4"],"label":"B7b9","barre":{"fret":1,"fromString":2,"toString":4,"finger":"1"}},"G13":{"frets":[3,0,2,0,0,1],"fingers":["3",null,"2",null,null,"1"],"label":"G13"},"D/F":{"frets":[1,0,0,2,3,2],"fingers":["1",null,null,"2","4","3"],"label":"D/F"},"Dadd11":{"frets":[null,5,4,2,3,3],"fingers":[null,"4","3","1","2","2"],"label":"Dadd11"},"Em/C#":{"frets":[null,4,2,0,0,0],"fingers":[null,"3","1",null,null,null],"label":"Em/C#"},"Cm11":{"frets":[null,3,1,3,3,1],"fingers":[null,"2","1","3","4","1"],"label":"Cm11","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"B/F":{"frets":[null,null,3,4,4,2],"fingers":[null,null,"2","3","4","1"],"label":"B/F"},"C/F":{"frets":[null,null,3,0,1,0],"fingers":[null,null,"3",null,"1",null],"label":"C/F"},"Abaug":{"frets":[4,3,2,1,1,null],"fingers":["4","3","2","1","1",null],"label":"Abaug","barre":{"fret":1,"fromString":3,"toString":4,"finger":"1"}},"Ebmaj9":{"frets":[null,6,3,3,3,3],"fingers":[null,"4","1","1","1","1"],"label":"Ebmaj9","barre":{"fret":3,"fromString":2,"toString":5,"finger":"1"}},"Eb13":{"frets":[null,6,5,6,8,8],"fingers":[null,"2","1","3","4","4"],"label":"Eb13"},"Eb7b5":{"frets":[null,null,1,2,2,3],"fingers":[null,null,"1","2","3","4"],"label":"Eb7b5"},"Abaug7":{"frets":[4,null,4,5,5,0],"fingers":["1",null,"2","3","4",null],"label":"Abaug7"},"Abadd9":{"frets":[4,3,null,3,4,null],"fingers":["3","1",null,"2","4",null],"label":"Abadd9"},"G/Bb":{"frets":[null,1,0,0,0,null],"fingers":[null,"1",null,null,null,null],"label":"G/Bb"},"C#5":{"frets":[null,4,6,null,null,null],"fingers":[null,"1","3",null,null,null],"label":"C#5"},"A5":{"frets":[5,7,null,null,null,null],"fingers":["1","3",null,null,null,null],"label":"A5"},"F#5":{"frets":[2,4,null,null,null,null],"fingers":["1","3",null,null,null,null],"label":"F#5"},"G#5":{"frets":[4,6,null,null,null,null],"fingers":["1","3",null,null,null,null],"label":"G#5"},"E5":{"frets":[0,2,null,null,null,null],"fingers":[null,"3",null,null,null,null],"label":"E5"},"D5":{"frets":[null,5,7,null,null,null],"fingers":[null,"1","3",null,null,null],"label":"D5"},"G5":{"frets":[3,5,null,null,null,null],"fingers":["1","3",null,null,null,null],"label":"G5"},"A#5":{"frets":[6,8,null,null,null,null],"fingers":["1","3",null,null,null,null],"label":"A#5"},"D#5":{"frets":[null,6,8,null,null,null],"fingers":[null,"1","3",null,null,null],"label":"D#5"},"B5":{"frets":[7,9,null,null,null,null],"fingers":["1","3",null,null,null,null],"label":"B5"},"C5":{"frets":[null,3,5,null,null,null],"fingers":[null,"1","3",null,null,null],"label":"C5"},"F5":{"frets":[1,3,null,null,null,null],"fingers":["1","3",null,null,null,null],"label":"F5"},"Bb5":{"frets":[6,8,null,null,null,null],"fingers":["1","3",null,null,null,null],"label":"Bb5"},"Eb5":{"frets":[null,6,8,null,null,null],"fingers":[null,"1","3",null,null,null],"label":"Eb5"},"C/Db":{"frets":[null,4,2,0,1,0],"fingers":[null,"1","2",null,"1",null],"label":"C/Db"},"Caug/A":{"frets":[null,0,2,1,1,0],"fingers":[null,"1","3","1","2",null],"label":"Caug/A"},"Cm7/G":{"frets":[3,3,5,3,4,3],"fingers":["T","1","3","1","2","1"],"label":"Cm7/G","barre":{"fret":3,"fromString":1,"toString":5,"finger":"1"}},"B7/Bb":{"frets":[null,1,1,2,0,2],"fingers":[null,"1","1","3",null,"4"],"label":"B7/Bb","barre":{"fret":1,"fromString":1,"toString":2,"finger":"1"}},"D7/Ab":{"frets":[4,null,0,2,1,2],"fingers":["T",null,null,"2","1","3"],"label":"D7/Ab"},"Am7/G":{"frets":[3,0,2,0,1,0],"fingers":["T",null,"2",null,"1",null],"label":"Am7/G"},"G/G#":{"frets":[4,2,0,0,0,3],"fingers":["T","1",null,null,null,"3"],"label":"G/G#"},"G7/B":{"frets":[null,2,0,0,0,1],"fingers":[null,"1",null,null,null,"1"],"label":"G7/B"},"Cdim/G":{"frets":[3,3,4,5,4,null],"fingers":["T","1","2","4","3",null],"label":"Cdim/G"},"Bdim/C":{"frets":[null,3,3,4,3,null],"fingers":[null,"1","2","4","3",null],"label":"Bdim/C"},"D7/F#":{"frets":[2,null,0,2,1,2],"fingers":["T",null,null,"2","1","3"],"label":"D7/F#"},"Eb7/G":{"frets":[3,null,1,3,2,3],"fingers":["T",null,"1","4","2","3"],"label":"Eb7/G"},"A7/E":{"frets":[0,0,2,0,2,0],"fingers":["T",null,"2",null,"3",null],"label":"A7/E"},"D7/A":{"frets":[null,0,0,2,1,2],"fingers":[null,"1",null,"2","1","3"],"label":"D7/A"},"B/D#":{"frets":[null,null,1,4,4,2],"fingers":[null,null,"1","3","4","1"],"label":"B/D#"},"Dm/A#":{"frets":[null,1,0,2,3,1],"fingers":[null,"1",null,"2","3","1"],"label":"Dm/A#","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"F7/A":{"frets":[null,0,1,2,1,1],"fingers":[null,"1","1","2","1","1"],"label":"F7/A","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"E7/Ab":{"frets":[4,2,0,1,0,0],"fingers":["T","2",null,"1",null,null],"label":"E7/Ab"},"Db/F":{"frets":[1,4,6,6,6,4],"fingers":["T","1","3","2","4","1"],"label":"Db/F"},"F#/A#":{"frets":[null,1,4,3,2,2],"fingers":[null,"1","4","2","1","1"],"label":"F#/A#"},"B7/E":{"frets":[0,2,1,2,0,2],"fingers":["T","2","1","3",null,"4"],"label":"B7/E"},"Gm6/Bb":{"frets":[null,1,2,3,5,3],"fingers":[null,"1","1","3","4","2"],"label":"Gm6/Bb"},"C#dim/E":{"frets":[0,4,5,6,5,null],"fingers":["T","1","2","4","3",null],"label":"C#dim/E"},"C#/F":{"frets":[1,4,6,6,6,4],"fingers":["T","1","3","2","4","1"],"label":"C#/F"},"F#/C#":{"frets":[null,4,4,3,2,2],"fingers":[null,"1","4","2","1","1"],"label":"F#/C#","barre":{"fret":2,"fromString":4,"toString":5,"finger":"1"}},"C#/C":{"frets":[null,3,6,6,6,4],"fingers":[null,"1","3","2","4","1"],"label":"C#/C"},"Cmaj7/E":{"frets":[0,3,2,0,0,0],"fingers":["T","2","1",null,null,null],"label":"Cmaj7/E"},"F#m/B":{"frets":[null,2,4,2,2,2],"fingers":[null,"1","4","1","1","1"],"label":"F#m/B","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"E7sus4/B":{"frets":[null,2,0,2,0,0],"fingers":[null,"1",null,"3",null,null],"label":"E7sus4/B"},"A6/B":{"frets":[null,2,2,2,2,2],"fingers":[null,"1","1","1","1","1"],"label":"A6/B","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"B6/C#":{"frets":[null,4,4,4,4,4],"fingers":[null,"1","2","2","2","2"],"label":"B6/C#"},"D#dim/F#":{"frets":[2,6,7,8,7,null],"fingers":["T","1","2","4","3",null],"label":"D#dim/F#"},"Em6/B":{"frets":[null,2,2,0,2,0],"fingers":[null,"1","2",null,"3",null],"label":"Em6/B"},"E/D#":{"frets":[null,null,1,1,0,0],"fingers":[null,null,"1","1",null,null],"label":"E/D#","barre":{"fret":1,"fromString":2,"toString":3,"finger":"1"}},"B7/D#":{"frets":[null,null,1,2,0,2],"fingers":[null,null,"1","3",null,"4"],"label":"B7/D#"},"B7/F#":{"frets":[2,2,1,2,0,2],"fingers":["T","2","1","3",null,"4"],"label":"B7/F#"},"F#/Bb":{"frets":[null,1,4,3,2,2],"fingers":[null,"1","4","2","1","1"],"label":"F#/Bb"},"Amaj7/F#":{"frets":[2,0,2,1,2,0],"fingers":["T",null,"2","1","3",null],"label":"Amaj7/F#"},"E6/G":{"frets":[3,2,2,1,2,0],"fingers":["T","2","3","1","4",null],"label":"E6/G"},"B/G#":{"frets":[4,2,4,4,4,2],"fingers":["T","1","2","3","4","1"],"label":"B/G#","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"D4/C":{"frets":[null,3,0,2,3,3],"fingers":[null,"1",null,"1","2","3"],"label":"D4/C"},"Gm6/E":{"frets":[0,5,2,3,5,3],"fingers":["T","4","1","3","4","2"],"label":"Gm6/E"},"C6/D":{"frets":[null,null,0,2,1,0],"fingers":[null,null,"1","2","1",null],"label":"C6/D"},"F#7/C#":{"frets":[null,4,2,3,2,2],"fingers":[null,"1","1","2","1","1"],"label":"F#7/C#","barre":{"fret":2,"fromString":2,"toString":5,"finger":"1"}},"Gadd9/B":{"frets":[null,2,0,2,0,3],"fingers":[null,"1",null,"3",null,"4"],"label":"Gadd9/B"},"F#7/Bb":{"frets":[null,1,2,3,2,2],"fingers":[null,"1","1","2","1","1"],"label":"F#7/Bb"},"Am6/C":{"frets":[null,3,2,2,1,2],"fingers":[null,"1","2","3","1","4"],"label":"Am6/C"},"Fm/G#":{"frets":[4,3,3,1,1,1],"fingers":["T","3","4","1","1","1"],"label":"Fm/G#","barre":{"fret":1,"fromString":3,"toString":5,"finger":"1"}},"C7/E":{"frets":[0,3,2,3,1,0],"fingers":["T","3","2","4","1",null],"label":"C7/E"},"Cmaj7/G":{"frets":[3,3,2,0,0,0],"fingers":["T","2","1",null,null,null],"label":"Cmaj7/G"},"Am6/F#":{"frets":[2,0,2,2,1,2],"fingers":["T",null,"2","3","1","4"],"label":"Am6/F#"},"Fmaj7/G":{"frets":[3,null,3,2,1,0],"fingers":["T",null,"3","2","1",null],"label":"Fmaj7/G"},"Db/Eb":{"frets":[null,null,1,6,6,4],"fingers":[null,null,"1","2","4","1"],"label":"Db/Eb"},"Ab/Gb":{"frets":[2,6,6,5,4,4],"fingers":["T","3","4","2","1","1"],"label":"Ab/Gb"},"G7/Bb":{"frets":[null,1,0,0,0,1],"fingers":[null,"1",null,null,null,"1"],"label":"G7/Bb","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"D4/A":{"frets":[null,0,0,2,3,3],"fingers":[null,"1",null,"1","2","3"],"label":"D4/A"},"F7/Eb":{"frets":[null,null,1,2,1,1],"fingers":[null,null,"1","2","1","1"],"label":"F7/Eb","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"Bbm/Db":{"frets":[null,4,3,3,2,1],"fingers":[null,"1","3","4","2","1"],"label":"Bbm/Db"},"Fm7/Eb":{"frets":[null,null,1,1,1,1],"fingers":[null,null,"1","1","1","1"],"label":"Fm7/Eb","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"Ab7/C":{"frets":[null,3,4,5,4,4],"fingers":[null,"1","1","2","1","1"],"label":"Ab7/C"},"Eb4/Bb":{"frets":[null,1,1,3,4,4],"fingers":[null,"1","1","2","3","4"],"label":"Eb4/Bb","barre":{"fret":1,"fromString":1,"toString":2,"finger":"1"}},"F#7/E":{"frets":[0,4,2,3,2,2],"fingers":["T","3","1","2","1","1"],"label":"F#7/E","barre":{"fret":2,"fromString":2,"toString":5,"finger":"1"}},"F#m7/E":{"frets":[0,4,2,2,2,2],"fingers":["T","3","1","1","1","1"],"label":"F#m7/E","barre":{"fret":2,"fromString":2,"toString":5,"finger":"1"}},"F7/E":{"frets":[0,3,1,2,1,1],"fingers":["T","3","1","2","1","1"],"label":"F7/E","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"D/G#":{"frets":[4,null,0,2,3,2],"fingers":["T",null,null,"1","3","2"],"label":"D/G#"},"D2/F#":{"frets":[2,null,0,2,3,0],"fingers":["T",null,null,"1","2",null],"label":"D2/F#"},"F#/E":{"frets":[0,4,4,3,2,2],"fingers":["T","3","4","2","1","1"],"label":"F#/E","barre":{"fret":2,"fromString":4,"toString":5,"finger":"1"}},"F#m7/B":{"frets":[null,2,2,2,2,2],"fingers":[null,"1","1","1","1","1"],"label":"F#m7/B","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"D/Db":{"frets":[null,4,0,2,3,2],"fingers":[null,"1",null,"1","3","2"],"label":"D/Db"},"Bm7/E":{"frets":[0,2,4,2,3,2],"fingers":["T","1","3","1","2","1"],"label":"Bm7/E","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"E4/B":{"frets":[null,2,2,2,0,0],"fingers":[null,"1","3","4",null,null],"label":"E4/B"},"A7/G":{"frets":[3,0,2,0,2,0],"fingers":["T",null,"2",null,"3",null],"label":"A7/G"},"A7/F#":{"frets":[2,0,2,0,2,0],"fingers":["T",null,"2",null,"3",null],"label":"A7/F#"},"F6/G":{"frets":[3,3,3,2,3,1],"fingers":["T","2","3","1","4","1"],"label":"F6/G"},"G7/D":{"frets":[null,null,0,0,0,1],"fingers":[null,null,"1",null,null,"1"],"label":"G7/D"},"Amaj9/Ab":{"frets":[4,0,2,4,2,4],"fingers":["T",null,"1","3","1","4"],"label":"Amaj9/Ab","barre":{"fret":2,"fromString":2,"toString":4,"finger":"1"}},"Gadd9/D":{"frets":[null,null,0,2,0,3],"fingers":[null,null,"1","3",null,"4"],"label":"Gadd9/D"},"C#m/C":{"frets":[null,3,6,6,5,4],"fingers":[null,"1","3","4","2","1"],"label":"C#m/C"},"Bbm7/Ab":{"frets":[4,1,3,1,2,1],"fingers":["T","1","3","1","2","1"],"label":"Bbm7/Ab","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"Cm/A#":{"frets":[null,1,5,5,4,3],"fingers":[null,"1","3","4","2","1"],"label":"Cm/A#"},"F#m/C#":{"frets":[null,4,4,2,2,2],"fingers":[null,"1","4","1","1","1"],"label":"F#m/C#","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"B4/F#":{"frets":[2,2,4,4,5,2],"fingers":["T","1","2","3","4","1"],"label":"B4/F#","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"B4/G":{"frets":[3,2,4,4,5,2],"fingers":["T","1","2","3","4","1"],"label":"B4/G","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"B4/Ab":{"frets":[4,2,4,4,5,2],"fingers":["T","1","2","3","4","1"],"label":"B4/Ab","barre":{"fret":2,"fromString":1,"toString":5,"finger":"1"}},"F#7/A#":{"frets":[null,1,2,3,2,2],"fingers":[null,"1","1","2","1","1"],"label":"F#7/A#"},"C#m/Ab":{"frets":[4,4,6,6,5,4],"fingers":["T","1","3","4","2","1"],"label":"C#m/Ab","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"G7/Ab":{"frets":[4,2,0,0,0,1],"fingers":["T","2",null,null,null,"1"],"label":"G7/Ab"},"Db/C":{"frets":[null,3,6,6,6,4],"fingers":[null,"1","3","2","4","1"],"label":"Db/C"},"Bb6/C":{"frets":[null,3,3,3,3,3],"fingers":[null,"1","2","3","3","3"],"label":"Bb6/C"},"E7/G#":{"frets":[4,2,0,1,0,0],"fingers":["T","2",null,"1",null,null],"label":"E7/G#"},"C7/Bb":{"frets":[null,1,2,3,1,0],"fingers":[null,"1","2","4","1",null],"label":"C7/Bb","barre":{"fret":1,"fromString":1,"toString":4,"finger":"1"}},"F#m/Ab":{"frets":[4,4,4,2,2,2],"fingers":["T","3","4","1","1","1"],"label":"F#m/Ab","barre":{"fret":2,"fromString":3,"toString":5,"finger":"1"}},"Eb/Db":{"frets":[null,4,8,8,8,6],"fingers":[null,"1","3","4","2","1"],"label":"Eb/Db"},"D2/C#":{"frets":[null,4,0,2,3,0],"fingers":[null,"1",null,"1","2",null],"label":"D2/C#"},"C6/G":{"frets":[3,3,2,2,1,0],"fingers":["T","3","2","2","1",null],"label":"C6/G"},"F4/C":{"frets":[null,3,3,3,1,1],"fingers":[null,"1","3","4","1","1"],"label":"F4/C","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"D6/E":{"frets":[0,null,0,2,0,2],"fingers":["T",null,null,"2",null,"3"],"label":"D6/E"},"D6/F#":{"frets":[2,null,0,2,0,2],"fingers":["T",null,null,"2",null,"3"],"label":"D6/F#"},"Ab7/F#":{"frets":[2,6,4,5,4,4],"fingers":["T","3","1","2","1","1"],"label":"Ab7/F#"},"E7/B":{"frets":[null,2,0,1,0,0],"fingers":[null,"1",null,"1",null,null],"label":"E7/B"},"E7/D":{"frets":[null,null,0,1,0,0],"fingers":[null,null,"1","1",null,null],"label":"E7/D"},"C/C":{"frets":[null,3,2,0,1,0],"fingers":[null,"1","2",null,"1",null],"label":"C/C"},"E4/F#":{"frets":[2,2,2,2,0,0],"fingers":["T","2","3","4",null,null],"label":"E4/F#"},"Edim/G":{"frets":[3,1,2,0,null,null],"fingers":["T","1","2",null,null,null],"label":"Edim/G"},"A4/C":{"frets":[null,3,2,2,3,0],"fingers":[null,"1","1","2","3",null],"label":"A4/C"},"F#m/F":{"frets":[1,4,4,2,2,2],"fingers":["T","3","4","1","1","1"],"label":"F#m/F"},"E7/Bb":{"frets":[null,1,0,1,0,0],"fingers":[null,"1",null,"1",null,null],"label":"E7/Bb","barre":{"fret":1,"fromString":1,"toString":3,"finger":"1"}},"D2/C":{"frets":[null,3,0,2,3,0],"fingers":[null,"1",null,"1","2",null],"label":"D2/C"},"G6/B":{"frets":[null,2,0,0,0,0],"fingers":[null,"1",null,null,null,null],"label":"G6/B"},"D7/G":{"frets":[3,null,0,2,1,2],"fingers":["T",null,null,"2","1","3"],"label":"D7/G"},"D4/G":{"frets":[3,null,0,2,3,3],"fingers":["T",null,null,"1","2","3"],"label":"D4/G"},"B7sus4/F#":{"frets":[2,2,2,2,0,0],"fingers":["T","1","2","3",null,null],"label":"B7sus4/F#"},"Dm6/E":{"frets":[0,null,0,2,0,1],"fingers":["T",null,null,"3",null,"1"],"label":"Dm6/E"},"Fm7/Ab":{"frets":[4,3,1,1,1,1],"fingers":["T","3","1","1","1","1"],"label":"Fm7/Ab","barre":{"fret":1,"fromString":2,"toString":5,"finger":"1"}},"Ab/Db":{"frets":[null,4,6,5,4,4],"fingers":[null,"1","4","2","1","1"],"label":"Ab/Db","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Dm7/A":{"frets":[null,0,0,2,1,1],"fingers":[null,"1",null,"2","1","1"],"label":"Dm7/A","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"Dm7/G":{"frets":[3,null,0,2,1,1],"fingers":["T",null,null,"2","1","1"],"label":"Dm7/G","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}},"D7sus4/A":{"frets":[null,0,0,2,1,3],"fingers":[null,"1",null,"2","1","3"],"label":"D7sus4/A"},"F#/Ab":{"frets":[4,4,4,3,2,2],"fingers":["T","3","4","2","1","1"],"label":"F#/Ab","barre":{"fret":2,"fromString":4,"toString":5,"finger":"1"}},"C#/Ab":{"frets":[4,4,6,6,6,4],"fingers":["T","1","3","2","4","1"],"label":"C#/Ab","barre":{"fret":4,"fromString":1,"toString":5,"finger":"1"}},"Ebm7/Ab":{"frets":[4,null,1,3,2,2],"fingers":["T",null,"1","4","2","3"],"label":"Ebm7/Ab"},"Bb7/G#":{"frets":[4,1,3,1,3,1],"fingers":["T","1","3","1","4","1"],"label":"Bb7/G#","barre":{"fret":1,"fromString":1,"toString":5,"finger":"1"}},"G#7sus4/C":{"frets":[null,3,4,6,4,4],"fingers":[null,"1","1","4","1","1"],"label":"G#7sus4/C"},"Em7/A":{"frets":[null,0,0,0,0,0],"fingers":[null,"1",null,null,null,null],"label":"Em7/A"},"Bbdim/C#":{"frets":[null,4,2,3,2,0],"fingers":[null,"1","2","4","3",null],"label":"Bbdim/C#"},"Ab4/Bb":{"frets":[null,1,6,6,4,4],"fingers":[null,"1","3","3","1","1"],"label":"Ab4/Bb"},"Ebm/Gb":{"frets":[2,null,1,3,4,2],"fingers":["T",null,"1","3","4","2"],"label":"Ebm/Gb"},"F4/G":{"frets":[3,3,3,3,1,1],"fingers":["T","2","3","4","1","1"],"label":"F4/G","barre":{"fret":1,"fromString":4,"toString":5,"finger":"1"}}},
                // expanded piano chords database
                pianoChordsData: {"C":["C4","E4","G4"],"Cm":["C4","D#4","G4"],"Cdim":["C","Eb","Gb"],"Cdim7":["C4","D#4","F#4","A4"],"Csus4":["C4","F4","G4"],"Csus2":["C","D","G"],"C7sus4":["C","F","G","Bb"],"Caug":["C","E","G#"],"C6":["C4","E4","G4","A4"],"C7":["C4","E4","G4","A#4"],"Caug7":["C","E","G#","Bb"],"C9":["C4","E4","G4","A#4","D5"],"C13":["C","E","G","Bb","D","A"],"Cmaj7":["C4","E4","G4","B4"],"Cm6":["C4","D#4","G4","A4"],"Cm7":["C4","D#4","G4","A#4"],"Cm7b5":["C","Eb","Gb","Bb"],"Cm9":["C","Eb","G","Bb","D"],"Cadd9":["C4","E4","G4","D5"],"Cm/Bb":["Bb","C","Eb","G"],"C/B":["B","C","E","G"],"C/Bb":["A#","C","E","G"],"C/D":["D","C","E","G"],"C/E":["E","C","E","G"],"C/G":["G3","C4","E4"],"C#":["C#","E#","G#"],"C#m":["C#","E","G#"],"C#dim":["C#","E","G"],"C#sus4":["C#4","F#4","G#4"],"C#sus2":["C#4","D#4","G#4"],"C#7sus4":["C#","F#","G#","B"],"C#aug":["C#","E#","A"],"C#7":["C#4","F4","G#4","B4"],"C#aug7":["C#","E#","A","B"],"C#9":["C#","E#","G#","B","D#"],"C#13":["C#","E#","G#","B","D#","A#"],"C#maj7":["C#4","F4","G#4","C5"],"C#m7":["C#4","E4","G#4","B4"],"C#m7b5":["C#","E","G","B"],"C#madd9":["C#","E","G#","D#"],"C#m/B":["B","C#","E","G#"],"C#m/E":["E","C#","G#"],"C#/B":["B","C#","E#","G#"],"D":["D4","F#4","A4"],"Dm":["D4","F4","A4"],"Ddim7":["D4","F4","G#4","B4"],"Dsus4":["D4","G4","A4"],"Dsus2":["D4","E4","A4"],"D7sus4":["D","G","A","C"],"Daug":["D","F#","A#"],"D6":["D4","F#4","A4","B4"],"D7":["D4","F#4","A4","C5"],"Daug7":["D","F#","A#","C"],"D9":["D4","F#4","A4","C5","E5"],"D7b9":["D","F#","A","C","Eb"],"Dmaj7":["D4","F#4","A4","C#5"],"Dm6":["D4","F4","A4","B4"],"Dm7":["D4","F4","A4","C5"],"Dm7b5":["D","F","Ab","C"],"Dm9":["D","F","A","C","E"],"Dm/A":["A","D","F"],"Dm/C":["C","D","F","A"],"Dm/F":["F","D","A"],"Dm/G":["G","D","F","A"],"D/A":["A","D","F#"],"D/C":["C","D","F#","A"],"D/F#":["F#3","D4","A4"],"D#":["D#","G","A#"],"D#m":["D#","F#","A#"],"D#dim":["D#","F#","A"],"D#dim7":["D#4","F#4","A4","C5"],"D#sus4":["D#4","G#4","A#4"],"D#sus2":["D#4","F4","A#4"],"D#aug":["D#","G","B"],"D#7":["D#4","G4","A#4","C#5"],"D#aug7":["D#","G","A#","C#"],"D#9":["D#","G","A#","C#","F"],"D#7b9":["D#","G","A#","C#","E"],"D#maj7":["D#4","G4","A#4","D5"],"D#m7":["D#4","F#4","A#4","C#5"],"D#m9":["D#","F#","A#","C#","F"],"E":["E3","G#3","B3"],"Em":["E3","G3","B3"],"Edim":["E","G","Bb"],"Esus4":["E3","A3","B3"],"E7sus4":["E","A","B","D"],"Eaug":["E","G#","B#"],"E6":["E3","G#3","B3","C#4"],"E7":["E3","G#3","B3","D4"],"E9":["E3","G#3","B3","D4","F#4"],"Emaj7":["E3","G#3","B3","D#4"],"Em6":["E3","G3","B3","C#4"],"Em7":["E3","G3","B3","D4"],"Em9":["E","G","B","D","F#"],"Emadd9":["E","G","B","F#"],"Em/B":["B","E","G"],"Em/C":["C","E","G","B"],"Em/D":["D","G","B","E"],"Em/F#":["F#","E","G","B"],"Em/G":["G","E","B"],"E/Ab":["G#","E","B"],"E/B":["B","E","G#"],"E/D":["D","E","G#","B"],"E/Eb":["Eb","E","G#","B"],"E/F#":["F#","E","G#","B"],"E/G":["G","E","G#","B"],"F":["F3","A3","C4"],"Fm":["F3","G#3","C4"],"Fdim":["F","Ab","Cb"],"Fsus4":["F3","A#3","C4"],"Fsus2":["F3","G3","C4"],"F7sus4":["F","Bb","C","Eb"],"Faug":["F","A","C#"],"F6":["F3","A3","C4","D4"],"F7":["F3","A3","C4","D#4"],"Faug7":["F","A","C#","Eb"],"F9":["F3","A3","C4","D#4","G4"],"Fmaj7":["F3","A3","C4","E4"],"Fm6":["F3","G#3","C4","D4"],"Fm7":["F3","G#3","C4","D#4"],"Fm7b5":["F","Ab","Cb","Eb"],"Fadd9":["F3","A3","C4","G4"],"Fm/C":["C","F","Ab"],"Fm/Eb":["Eb","F","Ab","C"],"F/A":["A","C","F"],"F/C":["C3","F3","A3"],"F/G":["G","F","A","C"],"F#":["F#3","A#3","C#4"],"F#m":["F#3","A3","C#4"],"F#dim":["F#","A","C"],"F#dim7":["F#3","A3","C4","D#4"],"F#sus4":["F#3","B3","C#4"],"F#sus2":["F#3","G#3","C#4"],"F#7sus4":["F#","B","C#","E"],"F#aug":["F#","A#","D"],"F#6":["F#","A#","C#","D#"],"F#7":["F#3","A#3","C#4","E4"],"F#maj7":["F#3","A#3","C#4","F4"],"F#m6":["F#","A","C#","D#"],"F#m7":["F#3","A3","C#4","E4"],"F#m7b5":["F#","A","C","E"],"F#m9":["F#","A","C#","E","G#"],"F#m/A":["A","C#","F#"],"F#m/E":["E","F#","A","C#"],"F#m/Eb":["Eb","F#","A","C#"],"G":["G3","B3","D4"],"Gm":["G3","A#3","D4"],"Gdim":["G","Bb","Db"],"Gsus4":["G3","C4","D4"],"G6":["G3","B3","D4","E4"],"G7":["G3","B3","D4","F4"],"G9":["G3","B3","D4","F4","A4"],"Gmaj7":["G3","B3","D4","F#4"],"Gm6":["G3","A#3","D4","E4"],"Gm7":["G3","A#3","D4","F4"],"Gm9":["G","Bb","D","F","A"],"Gadd9":["G3","B3","D4","A4"],"Gm/Bb":["Bb","D","G"],"Gm/E":["E","G","Bb","D"],"Gm/F":["F","G","Bb","D"],"G/B":["B3","G4","D5"],"G/D":["D","G","B"],"G/E":["E","G","B","D"],"G/F":["F","G","B","D"],"G/F#":["F#","G","B","D"],"G#":["G#","B#","D#"],"G#m":["G#","B","D#"],"G#dim":["G#","B","D"],"G#dim7":["G#3","B3","D4","F4"],"G#sus4":["G#3","C#4","D#4"],"G#7sus4":["G#","C#","D#","F#"],"G#6":["G#","B#","D#","E#"],"G#7":["G#3","C4","D#4","F#4"],"G#9":["G#","B#","D#","F#","A#"],"G#maj7":["G#3","C4","D#4","G4"],"G#m7":["G#3","B3","D#4","F#4"],"G#madd9":["G#","B","D#","A#"],"G#m/F#":["F#","G#","B","D#"],"A":["A3","C#4","E4"],"Am":["A3","C4","E4"],"Adim":["A","C","Eb"],"Adim7":["A3","C4","D#4","F#4"],"Asus4":["A3","D4","E4"],"Asus2":["A3","B3","E4"],"A7sus4":["A","D","E","G"],"Aaug":["A","C#","E#"],"A6":["A3","C#4","E4","F#4"],"A7":["A3","C#4","E4","G4"],"Aaug7":["A","C#","E#","G"],"A9":["A","C#","E","G","B"],"Amaj7":["A3","C#4","E4","G#4"],"Am6":["A3","C4","E4","F#4"],"Am7":["A3","C4","E4","G4"],"Am9":["A","C","E","G","B"],"Aadd9":["A3","C#4","E4","B4"],"Amadd9":["A","C","E","B"],"Am/C":["C","A","E"],"Am/C#":["A","C#","E"],"Am/E":["E","A","C"],"Am/G":["G3","A3","C4","E4"],"A/B":["B","A","C#","E"],"A/C#":["C#","A","E"],"A/E":["E","A","C#","E"],"A/F#":["F#","A","C#","E"],"A#":["A#3","D4","F4"],"A#m":["A#","C#","F"],"A#dim":["A#","C#","E"],"A#sus4":["A#3","D#4","F4"],"A#sus2":["A#3","C4","F4"],"A#6":["A#","D","F","G"],"A#7":["A#3","D4","F4","G#4"],"A#aug7":["A#","D","F#","G#"],"A#9":["A#","D","F","G#","C"],"A#maj7":["A#3","D4","F4","A4"],"A#m7":["A#3","C#4","F4","G#4"],"A#m7b5":["A#","C#","E","G#"],"B":["B3","D#4","F#4"],"Bm":["B3","D4","F#4"],"Bdim":["B","D","F"],"Bdim7":["B3","D4","F4","G#4"],"Bsus4":["B3","E4","F#4"],"Bsus2":["B3","C#4","F#4"],"B7":["B3","D#4","F#4","A4"],"B7b5":["B","D#","F","A"],"B9":["B3","D#4","F#4","A4","C#5"],"Bmaj7":["B3","D#4","F#4","A#4"],"Bm6":["B3","D4","F#4","G#4"],"Bm7":["B3","D4","F#4","A4"],"Bm7b5":["B","D","F","A"],"Bm9":["B","D","F#","A","C#"],"Bmadd9":["B","D","F#","C#"],"Bm/A":["A","B","D","F#"],"Bm/D":["D","F#","B"],"Bm/F#":["B","D","F#"],"B/F#":["B","D#","F#"],"B7#5":["B","D#","G","A"],"Cmsus4":["C","F","G"],"C#madd11":["C#","E","G#","F#"],"Dmaug":["D","F","A#"],"Emsus4":["E","A","B"],"Edim/E":["E","G","Bb"],"F#msus4":["F#","B","C#"],"Gaug4":["G","B","D#","C"],"Dm6/9":["D","F","A","B","E"],"Ebm":["D#4","F#4","A#4"],"Abm":["G#3","B3","D#4"],"Bbm":["A#3","C#4","F4"],"Dbm":["C#4","E4","G#4"],"Gbm":["F#3","A3","C#4"],"Ab7":["G#3","C4","D#4","F#4"],"Bb7":["A#3","D4","F4","G#4"],"Db7":["C#4","F4","G#4","B4"],"Eb7":["D#4","G4","A#4","C#5"],"Gb7":["F#3","A#3","C#4","E4"],"Esus2":["E","F#","B"],"Gsus2":["G3","A3","D4"],"G#sus2":["G#3","A#3","D#4"],"B6":["B3","D#4","F#4","G#4"],"C#dim7":["C#","E","G","A#"],"Edim7":["E3","G3","A#3","C#4"],"Fdim7":["F3","G#3","B3","D4"],"Gdim7":["G3","A#3","C#4","E4"],"A#dim7":["A#3","C#4","E4","G4"],"Dadd9":["D","F#","A","E"],"Eadd9":["E3","G#3","B3","F#4"],"Badd9":["B","D#","F#","C#"],"Db":["C#","E#","G#"],"Dbdim":["C#","E","G"],"Dbsus4":["C#","F#","G#"],"Dbsus2":["C#","D#","G#"],"Db7sus4":["C#","F#","G#","B"],"Dbaug":["C#","E#","A"],"Dbaug7":["C#","E#","A","B"],"Db9":["C#","E#","G#","B","D#"],"Db13":["C#","E#","G#","B","D#","A#"],"Dbmaj7":["C#","E#","G#","B#"],"Dbm7":["C#","E","G#","B"],"Dbm7b5":["C#","E","G","B"],"Dbmadd9":["C#","E","G#","D#"],"Dbm/B":["B","C#","E","G#"],"Dbm/E":["E","C#","G#"],"Db/B":["B","C#","E#","G#"],"D/Gb":["F#","D","A"],"Eb":["D#","G","A#"],"Ebdim":["D#","F#","A"],"Ebdim7":["D#","F#","A","C"],"Ebsus4":["D#","G#","A#"],"Ebsus2":["D#","F","A#"],"Ebaug":["D#","G","B"],"Ebaug7":["D#","G","A#","C#"],"Eb9":["D#","G","A#","C#","F"],"Eb7b9":["D#","G","A#","C#","E"],"Ebmaj7":["D#","G","A#","D"],"Ebm7":["D#","F#","A#","C#"],"Ebm9":["D#","F#","A#","C#","F"],"Em/Gb":["F#","E","G","B"],"E/Gb":["F#","E","G#","B"],"Gb":["F#","A#","C#"],"Gbdim":["F#","A","C"],"Gbdim7":["F#","A","C","Eb"],"Gbsus4":["F#","B","C#"],"Gbsus2":["F#","G#","C#"],"Gb7sus4":["F#","B","C#","E"],"Gbaug":["F#","A#","D"],"Gb6":["F#","A#","C#","D#"],"Gbmaj7":["F#","A#","C#","E#"],"Gbm6":["F#","A","C#","D#"],"Gbm7":["F#","A","C#","E"],"Gbm7b5":["F#","A","C","E"],"Gbm9":["F#","A","C#","E","G#"],"Gbm/A":["A","C#","F#"],"Gbm/E":["E","F#","A","C#"],"Gbm/Eb":["Eb","F#","A","C#"],"G/Gb":["F#","G","B","D"],"Ab":["G#","B#","D#"],"Abdim":["G#","B","D"],"Abdim7":["G#","B","D","F"],"Absus4":["G#","C#","D#"],"Ab7sus4":["G#","C#","D#","F#"],"Ab6":["G#","B#","D#","E#"],"Ab9":["G#","B#","D#","F#","A#"],"Abmaj7":["G#","C","D#","G"],"Abm7":["G#","B","D#","F#"],"Abmadd9":["G#","B","D#","A#"],"Abm/Gb":["F#","G#","B","D#"],"Am/Db":["C#","A","C","E"],"A/Db":["C#","A","E"],"A/Gb":["F#","A","C#","E"],"Bb":["A#","D","F"],"Bbdim":["A#","C#","E"],"Bbsus4":["A#","D#","F"],"Bbsus2":["A#","C","F"],"Bb6":["A#","D","F","G"],"Bbaug7":["A#","D","F#","G#"],"Bb9":["A#","D","F","G#","C"],"Bbmaj7":["A#","D","F","A"],"Bbm7":["A#","C#","F","G#"],"Bbm7b5":["A#","C#","E","G#"],"Bm/Gb":["B","D","F#"],"B/Gb":["B","D#","F#"],"Dbmadd11":["C#","E","G#","F#"],"Gbmsus4":["F#","B","C#"],"Absus2":["G#","A#","D#"],"Dbdim7":["Db","Fb","Abb","Bbb"],"Bbdim7":["A#","C#","E","G"],"A+7":["A","C#","E#","G"],"A4":["A","D","E"],"A6/9":["A","C#","E","F#"],"Ab(4-3)":["G#","C#","D#"],"Ab6/Bb":["G#","B#","D#","E#"],"Abm(add9)":["G#","B","D#","A#"],"Adim7/Eb":["A","C","Eb","Gb"],"Am7/E":["A","C","E","G"],"AO":["A","C","Eb"],"B4":["B","E","F#"],"B7(-5)":["B","D#","F","A"],"B7/A":["B","D#","F#","A"],"B7/Eb":["B","D#","F#","A"],"Bb+7":["A#","D","F#","G#"],"Bb4":["A#","D#","F"],"BbO":["A#","C#","E"],"Bb/G#":["A#","D","F"],"BbØ":["A#","C#","E","G#"],"Bm(add9)":["B","D","F#","C#"],"Bm/G#":["B","D","F#"],"BØ":["B","D","F","A"],"B°7":["B","D","F","Ab"],"B°7/A":["B","D","F","Ab"],"C+7":["C","E","G#","Bb"],"C4":["C","F","G"],"CØ":["C","Eb","Gb","Bb"],"C°7":["C","Eb","Gb","A"],"C#+":["C#","E#","A"],"C#m(add9)":["C#","E","G#","D#"],"C#m7-5":["C#","E","G","B"],"D+7":["D","F#","A#","C"],"D2":["D","E","A"],"D4":["D","G","A"],"D6(no3)":["D","F#","A","B"],"D6/Gm":["D","F#","A","B"],"D9/F#":["D","F#","A","C","E"],"Db+7":["C#","E#","A","B"],"Dm(7-6)":["D","F","A","C"],"Dm6/B":["D","F","A","B"],"Dm6/F":["D","F","A","B"],"DØ":["D","F","Ab","C"],"D°7":["D","F","Ab","Cb"],"E(4-7)":["E","A","B"],"E4":["E","A","B"],"E/G#":["E","G#","B"],"Eb+":["D#","G","B"],"Eb+7":["D#","G","A#","C#"],"Eb7(-9)":["D#","G","A#","C#","E"],"Ebm/Db":["D#","F#","A#"],"Em(7-6)":["E","G","B","D"],"Em(add9)":["E","G","B","F#"],"Em/Db":["E","G","B"],"EO":["E","G","Bb"],"Eo":["E","G","Bb"],"F(2-1)":["F","G","C"],"F+7":["F","A","C#","Eb"],"FØ":["F","Ab","Cb","Eb"],"F#+":["F#","A#","D"],"F#ø":["F#","A","C","E"],"F#°7":["F#","A","C","Eb"],"F#7/4-3":["F#","A#","C#","E"],"F#b5m7":["F#","A","C","E"],"F#m6/A":["F#","A","C#","D#"],"F#m74":["F#","A","C#","E"],"Fmaj7/D":["F","A","C","E"],"FO":["F","Ab","Cb"],"G(4-3)":["G","C","D"],"G4":["G","C","D"],"G6/A":["G","B","D","E"],"G6/D":["G","B","D","E"],"G7/Cm":["G","B","D","F"],"Gm6/D":["G","Bb","D","E"],"Gm7/B":["G","Bb","D","F"],"Gsus4/D":["G","C","D"],"G#4":["G#","C#","D#"],"G#(4-3)":["G#","C#","D#"],"G#O":["G#","B","D"],"Eb2":["D#","F","A#"],"Db2":["C#","D#","G#"],"Bb2":["A#","C","F"],"Ab2":["G#","A#","D#"],"Eb4":["D#","G#","A#"],"Ab4":["G#","C#","D#"],"Cbm":["B3","D4","F#4"],"Fbm":["E3","G3","B3"],"Cb7":["B3","D#4","F#4","A4"],"Fb7":["E3","G#3","B3","D4"],"Ddim":["D4","F4","G#4"],"Em7b5":["E3","G3","A#3","D4"],"Gm7b5":["G3","A#3","C#4","F4"],"Am7b5":["A3","C4","D#4","G4"],"G#m7b5":["G#3","B3","D4","F#4"],"Ebm7b5":["D#3","F#3","A3","C#4"],"D#m7b5":["D#3","F#3","A3","C#4"],"Abm7b5":["G#3","B3","D4","F#4"],"E7b9":["E3","F3","G#3","B3","D4"],"G7b9":["G3","G#3","B3","D4","F4"],"C7b9":["C4","C#4","E4","G4","A#4"],"F7b9":["F3","F#3","A3","C4","D#4"],"G7sus4":["G3","C4","D4","F4"],"B7sus4":["B3","E4","F#4","A4"],"Bb7sus4":["A#3","D#4","F4","G#4"],"Eb7sus4":["D#3","G#3","A#3","C#4"],"Gaug":["G3","B3","D#4"],"Baug":["B3","D#4","G4"],"Bbaug":["A#3","D4","F#4"],"G#aug":["G#3","C4","E4"],"Gaug7":["G3","B3","D#4","F4"],"Baug7":["B3","D#4","G4","A4"],"D7#9":["D3","F3","F#3","A3","C4"],"C7#9":["C4","D#4","E4","G4","A#4"],"Gmaug":["G3","A#3","D#4"],"Emaug":["E3","G3","C4"],"Cmaug":["C4","D#4","G#4"],"Fmaug":["F3","G#3","C#4"],"Bmaug":["B3","D4","G4"],"C#maug":["C#4","E4","A4"],"DmM7":["D3","F3","A3","C#4"],"EmM7":["E3","G3","B3","D#4"],"FmM7":["F3","G#3","C4","E4"],"GmM7":["G3","A#3","D4","F#4"],"F#mM7":["F#3","A3","C#4","F4"],"Fmaj7b5":["F3","A3","B3","E4"],"Amaj7b5":["A3","C#4","D#4","G#4"]},
                // ── טרנספוזיציה מודעת-סולם ──
                // כתיב האקורד נקבע לפי הסולם שאליו עוברים (לה/מי/רה עם ♯, פה/סי♭/מי♭ עם ♭),
                // ושומר על היחסים שכתב המחבר (E/G# נשאר "טרצה בבס" גם אחרי ההזזה).
                _letters: ["C", "D", "E", "F", "G", "A", "B"], _letterPc: [0, 2, 4, 5, 7, 9, 11],
                _keyNames: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
                _pcOf: function (n) { const m = /^([A-G])([#b]?)$/.exec(n); if (!m) return -1; return (this._letterPc[this._letters.indexOf(m[1])] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12; },
                _quality: function (s) { s = s || ""; if (/^(dim|°|m7b5|ø)/.test(s)) return "d"; if (/^m(?!aj)/.test(s)) return "m"; return "M"; },
                // מזהה את סימן-המפתח (הסולם המז'ורי, או המז'ור המקביל למינור) מתוך אקורדי השיר
                detectKey: function (chords) {
                    const degQ = { 0: "M", 2: "m", 4: "m", 5: "M", 7: "M", 9: "m", 11: "d" }, parsed = [];
                    chords.forEach(c => { const m = /^([A-G][#b]?)(.*)$/.exec(String(c || "").replace(/♯/g, "#").replace(/♭/g, "b").split("/")[0]); if (!m) return; const pc = this._pcOf(m[1]); if (pc >= 0) parsed.push({ pc, q: this._quality(m[2]), name: m[1] }); });
                    if (!parsed.length) return null;
                    const first = parsed[0].pc, last = parsed[parsed.length - 1].pc;
                    let best = 0, bestScore = -1;
                    for (let k = 0; k < 12; k++) {
                        let s = 0;
                        parsed.forEach(p => { const d = (p.pc - k + 12) % 12; if (d in degQ) { s += 2; if (degQ[d] === p.q) s += 1; } });
                        if (first === k || first === (k + 9) % 12) s += 3;
                        if (last === k || last === (k + 9) % 12) s += 2;
                        if (s > bestScore) { bestScore = s; best = k; }
                    }
                    // איך המחבר כתב את הטוניקה (או המינור המקביל), כדי לשמור על הכתיב שלו
                    const tonicAs = parsed.find(p => p.pc === best);
                    let tonicName = tonicAs ? tonicAs.name : null;
                    if (!tonicName) { const rel = parsed.find(p => p.pc === (best + 9) % 12); tonicName = rel ? this._nameAt((rel.name), 2, 3) : this._keyNames[best]; }
                    return { pc: best, name: tonicName };
                },
                // שם התו שנמצא steps אותיות ו-semis חצאי-טון מעל note (למשל C,2,4 → E)
                _nameAt: function (note, steps, semis) {
                    const m = /^([A-G])([#b]?)$/.exec(note); if (!m) return null;
                    const L = this._letters[(this._letters.indexOf(m[1]) + steps + 7) % 7];
                    const target = (this._pcOf(note) + semis + 1200) % 12;
                    let diff = (target - this._letterPc[this._letters.indexOf(L)] + 12) % 12; if (diff > 6) diff -= 12;
                    if (diff === 0) return L; if (diff === 1) return L + "#"; if (diff === -1) return L + "b"; return null;
                },
                // תוכנית כתיב לשיר אחד: סולם-מקור → סולם-יעד, והזזת-אותיות קבועה
                makeSpeller: function (chords, b) {
                    const key = this.detectKey(chords); if (!key) return null;
                    const tpc = (key.pc + b + 1200) % 12, tname = this._keyNames[tpc];
                    const shift = (this._letters.indexOf(tname[0]) - this._letters.indexOf(key.name[0]) + 7) % 7;
                    const sharpKey = [7, 2, 9, 4, 11, 6].indexOf(tpc) !== -1, flatKey = [5, 10, 3, 8, 1].indexOf(tpc) !== -1;
                    const table = sharpKey ? this.notesSharp : flatKey ? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] : ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
                    return { shift, table };
                },
                transposeChord: function (a, b, sp) {
                    if (typeof a !== "string" || !a) return a;
                    if (!b) return a;                               // בסולם המקורי: בדיוק כמו שנכתב
                    const self = this;
                    a = a.replace(/♯/g, "#").replace(/♭/g, "b");
                    // מזיז שורש בודד; מחזיר null אם לא טון-תקין
                    const shift = function (note) {
                        const pc = self._pcOf(note); if (pc < 0) return null;
                        if (sp) { const n = self._nameAt(note, sp.shift, b); if (n && !/^(E#|B#|Cb|Fb)$/.test(n)) return n; return sp.table[(pc + b + 1200) % 12]; }
                        const h = self.notesSharp[(pc + b + 1200) % 12];
                        return self.sharpToFlatMap[h] || h;
                    };
                    // מפצל סלאש-אקורד לראש ולבאס ומטרנספז כל חלק בנפרד
                    const slashIdx = a.indexOf("/");
                    const head = slashIdx === -1 ? a : a.slice(0, slashIdx);
                    const bass = slashIdx === -1 ? "" : a.slice(slashIdx + 1);
                    const hm = head.match(/^([A-G][#b]?)(.*)/);
                    if (!hm) return a;
                    const hRoot = shift(hm[1]);
                    if (hRoot === null) return a;
                    let out = hRoot + (hm[2] || "");
                    if (slashIdx !== -1) {
                        const bm = bass.match(/^([A-G][#b]?)(.*)/);
                        const bRoot = bm ? shift(bm[1]) : null;
                        out += "/" + (bRoot !== null ? bRoot + (bm[2] || "") : bass);
                    }
                    return out.replace(/#/g, "♯").replace(/b/g, "♭");
                },
                renderGuitarDiagram: function (a, b) { const c = a.replace(/[♯♭]/g, a => ({ "♯": "#", "♭": "b" })[a]), d = this.guitarChordsData[c]; if (!b) return; const e = 30, f = 20, g = 30, h = 6, i = 4, j = 7, k = 8, l = (h - 1) * f + 40, m = i * g + 70; let n = `<svg width="${l}" height="${m}" viewBox="0 0 ${l} ${m}" style="font-family: var(--font-body);">`; if (n += `<line x1="20" y1="${e}" x2="${l - 20}" y2="${e}" stroke="var(--text-primary)" stroke-width="4"/>`, function () { for (let a = 1; a <= i; a++)n += `<line x1="20" y1="${e + a * g}" x2="${l - 20}" y2="${e + a * g}" stroke="var(--border-color)" stroke-width="2"/>` }(), function () { for (let a = 0; a < h; a++)n += `<line x1="${20 + a * f}" y1="${e}" x2="${20 + a * f}" y2="${e + i * g}" stroke="var(--text-primary)" stroke-width="1"/>` }(), !d) return n += `<text x="${l / 2}" y="${m / 2}" text-anchor="middle" fill="#e53935">${a} לא מוגדר</text></svg>`, void (b.innerHTML = n); if (d.barre) { const c = e + (d.barre.fret - .5) * g, i = 20 + d.barre.fromString * f, j = 20 + d.barre.toString * f; n += `<rect x="${i - 7 + 1}" y="${c - k / 2}" width="${j - i + 2 * 7 - 2}" height="${k}" fill="var(--text-primary)" rx="3" ry="3"/>`, d.barre.finger && (n += `<text x="${(i + j) / 2}" y="${c + 3}" text-anchor="middle" fill="var(--bg-song)" font-size="9">${d.barre.finger}</text>`) } d.frets.forEach((c, i) => { const k = 20 + i * f; if (c === 0) n += `<text x="${k}" y="${e - 8}" text-anchor="middle" fill="var(--text-primary)">O</text>`; else if (c === null) n += `<text x="${k}" y="${e - 8}" text-anchor="middle" fill="var(--text-primary)">X</text>`; else if (c > 0) { let l = d.barre && d.fingers[i] === d.barre.finger && c === d.barre.fret; if (!l) { const l = k, m = e + (c - .5) * g; n += `<circle cx="${l}" cy="${m}" r="${j}" fill="var(--text-chord)"/>`, d.fingers[i] && (n += `<text x="${l}" y="${m + 3.5}" text-anchor="middle" fill="var(--bg-song)" font-size="10">${d.fingers[i]}</text>`) } } }), n += `<text x="${l / 2}" y="${m - 15}" text-anchor="middle" font-size="16" fill="var(--text-primary)" font-weight="bold">${d.label || a}</text></svg>`, b.innerHTML = n },
                renderPianoDiagram: function (a, b) { const c = a.replace(/[♯♭]/g, a => ({ "♯": "#", "♭": "b" })[a]), d = this.pianoChordsData[c]; if (!b) return; if (!d) return void (b.innerHTML = `<div style="padding:20px;color:var(--text-primary);">${a} לא מוגדר לפסנתר.</div>`); let e = `<div class="achord-piano-diagram-wrapper"><h3 style="text-align:center;margin-bottom:15px;color:var(--text-primary);">${a}</h3><div class="piano-key-group">`; const f = [{ n: "C", t: "white" }, { n: "C#", t: "black" }, { n: "D", t: "white" }, { n: "D#", t: "black" }, { n: "E", t: "white" }, { n: "F", t: "white" }, { n: "F#", t: "black" }, { n: "G", t: "white" }, { n: "G#", t: "black" }, { n: "A", t: "white" }, { n: "A#", t: "black" }, { n: "B", t: "white" }], g = 3, h = 2; let i = 0, j = ""; const k = 40, l = 25; for (let a = g; a < g + h; a++)f.forEach(b => { const c = b.n + a, e = d.map(a => a.replace("b", "#")).includes(c.replace("b", "#")), f = e ? "highlighted" : ""; b.t === "white" ? (j += `<div class="piano-key white-key ${f}" style="left:${i}px;"><span class="key-label">${b.n}</span></div>`, i += k) : j += `<div class="piano-key black-key ${f}" style="left:${i - k / 2 - (l - k / 2) / 2}px;"><span class="key-label">${b.n}</span></div>` }); e += j + "</div></div>", b.innerHTML = e; const m = b.querySelector(".piano-key-group"); m && (m.style.width = `${i}px`) }
            };
            // --------------------------------------------------------------------------------
            // Handle Free Chords Enhancement
            // Define a helper on the engine to mark free chords. It scans phantom words (.achord-phantom-word)
            // and marks the chord immediately following as a free chord by adding a special class and attribute.
            engine.handleFreeChords = function () {
                const phantomWords = wrapper.querySelectorAll('.achord-phantom-word');
                phantomWords.forEach(phantom => {
                    const nextChord = phantom.nextElementSibling;
                    if (nextChord && nextChord.classList.contains('achord-chord')) {
                        nextChord.classList.add('achord-free-chord');
                        nextChord.setAttribute('data-free', 'true');
                    }
                });
            };
            // ─── תיקון חפיפת-אקורדים באמצע-מילה (מילים קצרות עם 2+ אקורדים) ───
            // הפיזיקה: תווית-אקורד רחבה מההברה שמתחתיה. אבל האקורד יושב על שורה נפרדת
            // *מעל* הטקסט (position:absolute, bottom:100%), אז אין שום סיבה להזיז את
            // האותיות כדי למנוע חפיפת-אקורדים. לכן מפרידים זוגות מתנגשים ע"י הזזת
            // *האקורד בלבד* (transform על האלמנט האבסולוטי) — המילה נשארת צמודה לחלוטין
            // ורק האקורדים מתפזרים מעליה. זהו בדיוק המודל של negina.co.il (שורת-אקורדים
            // נפרדת מעל שורת-מילים רציפה), ותואם את בקשת המשתמש: "המילה תשאר ורק
            // האקורדים יתרווחו מעליה".
            // חייב לרוץ אחרי טעינת-גופנים ובכל אירוע שמשנה רוחב-תווית או שבירת-שורה:
            // טרנספוזיציה, החלפת-גרסה, שינוי-גודל-חלון (re-wrap), טעינת/החלפת-גופן.
            function fixMidwordChordOverlaps() {
                // מקור-אמת יחיד לגיאומטריה: הסקריפט המוקדם ב-Shortcode_Handler מגדיר את
                // window.__amsMidwordFix ומריץ אותו כבר לפני-paint (בלי להמתין ל-jQuery/main.js),
                // וכך מבטל את קפיצת-המיקום. כאן רק מריצים אותו מחדש על אירועים חיים
                // (טרנספוזיציה / החלפת-גרסה / resize / טעינת-גופן). fallback לגוף המקורי למטה.
                if (typeof window.__amsMidwordFix === 'function') { window.__amsMidwordFix(wrapper); return; }
                const GAP = 4; // מרווח ויזואלי מינימלי בין תוויות-אקורד סמוכות
                wrapper.querySelectorAll('.achord-midword').forEach(group => {
                    const chordEls = [...group.querySelectorAll('.achord-seg > .achord-chord')];
                    // איפוס מלא לפני חישוב-מחדש: אקורדים חוזרים למרכז-ההברה (translateX(50%)
                    // של ה-CSS), שוליי-הקבוצה מתאפסים, ושרידי marginLeft ישנים על סגמנטים
                    // מנוקים (מגרסאות קודמות שהזיזו אותיות).
                    chordEls.forEach(el => { el.style.transform = ''; });
                    group.querySelectorAll('.achord-seg').forEach(seg => { seg.style.marginLeft = ''; });
                    group.style.marginLeft = '';
                    group.style.marginRight = '';
                    if (chordEls.length < 2) return;

                    // מרכזי-האקורדים הטבעיים (screen-x), ממוינים משמאל לימין.
                    const nat = chordEls.map(el => {
                        const r = el.getBoundingClientRect();
                        return { el, w: r.width, c0: (r.left + r.right) / 2 };
                    }).sort((a, b) => a.c0 - b.c0);

                    // מעבר קדימה: אכיפת מרווח-מינימום בין מרכזים סמוכים (right-packing).
                    const finalC = nat.map(n => n.c0);
                    for (let i = 1; i < nat.length; i++) {
                        const need = finalC[i - 1] + nat[i - 1].w / 2 + GAP + nat[i].w / 2;
                        if (finalC[i] < need) finalC[i] = need;
                    }
                    // מרכוז-מחדש: הסטת האשכול שמאלה בממוצע-ההיסט → פיזור סימטרי סביב
                    // מרכז-המילה, וחצי-חריגה לכל צד (במקום כל החריגה לצד אחד).
                    let drift = 0;
                    for (let i = 0; i < nat.length; i++) drift += finalC[i] - nat[i].c0;
                    drift /= nat.length;
                    for (let i = 0; i < nat.length; i++) finalC[i] -= drift;

                    // החלת ההיסט — רק על תווית-האקורד (absolute), לא על האות. האותיות
                    // נשארות צמודות לחלוטין; רק האקורדים מתפזרים מעל, כמו ב-negina.co.il.
                    for (let i = 0; i < nat.length; i++) {
                        const shift = finalC[i] - nat[i].c0;
                        if (Math.abs(shift) > 0.5)
                            nat[i].el.style.transform = 'translateX(calc(50% + ' + shift.toFixed(1) + 'px))';
                    }

                    // שמירת-מקום: אם אשכול-האקורדים חורג מגבולות תיבת-המילה, מוסיפים שוליים
                    // לקבוצה → המילים השכנות נדחפות, האקורדים מקבלים מקום, והאותיות עדיין
                    // לא זזות. כך ה"פיזור" חי בין-המילים ולא בתוך המילה (מודל negina).
                    const box = group.getBoundingClientRect();
                    const clusterLeft = Math.min(...nat.map((n, i) => finalC[i] - n.w / 2));
                    const clusterRight = Math.max(...nat.map((n, i) => finalC[i] + n.w / 2));
                    const overL = box.left - clusterLeft;
                    const overR = clusterRight - box.right;
                    if (overL > 0.5) group.style.marginLeft = Math.ceil(overL) + 'px';
                    if (overR > 0.5) group.style.marginRight = Math.ceil(overR) + 'px';
                });
            }
            // תזמון-מאוחד דרך microtask (לא requestAnimationFrame!). rAF קפוא בטאב-רקע/מוסתר,
            // ואז התיקון לא היה רץ כלל בטעינת-רקע; microtask רץ תמיד, ללא תלות בנראות-הטאב.
            let _overlapPending = false;
            function scheduleOverlapFix() {
                if (_overlapPending) return;
                _overlapPending = true;
                Promise.resolve().then(() => { _overlapPending = false; fixMidwordChordOverlaps(); });
            }
            // תיקון-שורש לבאג התזמון: מדידה לפני שגופן-האקורדים נטען → רוחב שגוי → חפיפה
            // שיורית שנשארת עד רענון. ממתינים ל-fonts.ready (promise — רץ גם בטאב-מוסתר),
            // מאזינים ל-loadingdone (טעינה עצלה / החלפת-גופן), ל-resize (re-wrap) דרך
            // ResizeObserver, ול-visibilitychange (עמוד שנטען בטאב-רקע ומתמקד מאוחר יותר).
            function initOverlapWatchers() {
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(fixMidwordChordOverlaps);
                    document.fonts.addEventListener('loadingdone', scheduleOverlapFix);
                }
                const contentArea = wrapper.querySelector('#achord-content-area');
                if (contentArea && 'ResizeObserver' in window) {
                    let _lastW = 0;
                    new ResizeObserver(entries => {
                        // מגיבים רק לשינוי רוחב-מכל (re-wrap) — לא לשינויי-גובה מהתיקון עצמו,
                        // כדי לא ליצור לולאת-observer.
                        const w = Math.round(entries[0].contentRect.width);
                        if (w !== _lastW) { _lastW = w; scheduleOverlapFix(); }
                    }).observe(contentArea);
                }
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') scheduleOverlapFix();
                });
            }

            const ui = {};
            ui.init = function () { this.elements = { contentArea: wrapper.querySelector("#achord-content-area"), transposeInfo: wrapper.querySelector("#achord-transpose-info"), capoInfo: wrapper.querySelector("#achord-capo-info"), drawer: wrapper.querySelector("#achord-options-drawer"), popup: wrapper.querySelector("#achord-popup"), popupDiagram: wrapper.querySelector("#achord-diagram"), popupClose: wrapper.querySelector(".achord-close"), versionBtn: wrapper.querySelector("#achord-toggle-version"), instrumentBtn: wrapper.querySelector("#achord-toggle-instrument"), scrollToggleBtn: wrapper.querySelector("#achord-scroll-toggle") }, this.initTheme(), this.initDarkMode(), this.initFontControls(), this.initScrollControls(), this.initTransposeControls(), this.initMainActions(), this.initPopup(), this.initOptionsDrawer(), this.initExtraButtons(), this.checkEasyVersion(), this.applyEasyStart() }; ui.initTheme = function () { const a = localStorage.getItem("achordTheme") || "theme-conductor"; this.applyTheme(a), wrapper.querySelector("#achord-toggle-theme")?.addEventListener("click", () => { const a = wrapper.classList.contains("theme-conductor") ? "theme-studio" : "theme-conductor"; this.applyTheme(a) }) }, ui.applyTheme = function (a) { wrapper.classList.remove("theme-conductor", "theme-studio"), wrapper.classList.add(a), localStorage.setItem("achordTheme", a) }, ui.initDarkMode = function () { const a = wrapper.querySelector("#achord-dark-mode"); const s = localStorage.getItem("achordDarkMode"); const dark = s === "enabled" || (s === null && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); dark && (wrapper.classList.add("dark-mode"), a && (a.innerHTML = UC_ICON('sun'))), a?.addEventListener("click", () => { wrapper.classList.toggle("dark-mode"); const b = wrapper.classList.contains("dark-mode"); localStorage.setItem("achordDarkMode", b ? "enabled" : "disabled"), a && (a.innerHTML = b ? UC_ICON('sun') : UC_ICON('moon')) }) }, ui.initFontControls = function () { wrapper.querySelector("#achord-font-increase")?.addEventListener("click", () => this.changeFontSize(1)), wrapper.querySelector("#achord-font-decrease")?.addEventListener("click", () => this.changeFontSize(-1)) }, ui.changeFontSize = function (a) { if (!this.elements.contentArea) return; let b = parseFloat(window.getComputedStyle(this.elements.contentArea).fontSize), c = Math.max(12, Math.min(48, b + a)); this.elements.contentArea.style.setProperty("--base-font-size", `${c}px`) }, ui.initScrollControls = function () { wrapper.querySelector("#achord-scroll-up")?.addEventListener("click", () => this.changeScrollSpeed(.5)), wrapper.querySelector("#achord-scroll-down")?.addEventListener("click", () => this.changeScrollSpeed(-.5)), this.elements.scrollToggleBtn?.addEventListener("click", () => { state.scrollInterval ? this.setScrollSpeed(0) : this.setScrollSpeed(state.scrollSpeed > 0 ? state.scrollSpeed : 1) }) }, ui.changeScrollSpeed = function (a) { let b = state.scrollSpeed + a; state.scrollSpeed === 0 && a > 0 && (b = .5), this.setScrollSpeed(Math.max(0, Math.min(5, b))) }, ui.setScrollSpeed = function (a) { clearInterval(state.scrollInterval), state.scrollSpeed = a, a > 0 ? (state.scrollInterval = setInterval(() => window.scrollBy(0, a * .7), 50), this.elements.scrollToggleBtn && (this.elements.scrollToggleBtn.innerHTML = UC_ICON('pause'))) : (state.scrollInterval = null, this.elements.scrollToggleBtn && (this.elements.scrollToggleBtn.innerHTML = UC_ICON('play'))) }, ui.initTransposeControls = function () { wrapper.querySelector("#achord-transpose-up")?.addEventListener("click", () => this.changeTranspose(1)), wrapper.querySelector("#achord-transpose-down")?.addEventListener("click", () => this.changeTranspose(-1)) };

            ui.changeTranspose = function (a) {
                state.transposeSteps += a;
                state.transposeSteps = Math.max(-11, Math.min(11, state.transposeSteps));
                const b = state.transposeSteps;
                wrapper.dataset.transposeCurrent = b;

                const displayValue = b / 2;
                this.elements.transposeInfo.textContent = displayValue >= 0 ? `+${displayValue}` : displayValue;
                if (displayValue === 0) this.elements.transposeInfo.textContent = '0';

                const c = parseFloat(wrapper.dataset.baseCapo) || 0;
                this.updateCapoInfo();

                wrapper.querySelectorAll(".achord-version").forEach(versionEl => {
                    const _chordEls = versionEl.querySelectorAll(".achord-chord:not(.achord-placeholder-chord)");
                    const _sp = engine.makeSpeller([..._chordEls].map(el => el.dataset.original), state.transposeSteps);
                    _chordEls.forEach(chordEl => {
                        const transposedChord = engine.transposeChord(chordEl.dataset.original, state.transposeSteps, _sp);
                        chordEl.textContent = transposedChord;
                        chordEl.dataset.current = transposedChord;
                    });
                });
                scheduleOverlapFix();
                ChordStrip.refresh();
            };

            ui.initMainActions = function () { this.elements.versionBtn?.addEventListener("click", a => { this.toggleVersion(a.currentTarget) }), this.elements.instrumentBtn?.addEventListener("click", a => { state.instrument = state.instrument === "guitar" ? "piano" : "guitar", a.currentTarget.innerHTML = state.instrument === "guitar" ? UC_ICON('guitar') : UC_ICON('piano') }) }, ui.checkEasyVersion = function () {
                const a = wrapper.querySelector(".achord-version[data-version='easy']");
                (!a || a.textContent.trim() === "") && this.elements.versionBtn && (this.elements.versionBtn.style.display = "none");
                this.easyDiff = this.computeEasyDiff();
                // גרסה קלה זהה לרגילה: הכפתור לא משנה כלום, אז לא מציגים אותו
                if (this.easyDiff && this.easyDiff.identical && this.elements.versionBtn) this.elements.versionBtn.style.display = "none";
            }, ui.computeEasyDiff = function () {
                const nEl = wrapper.querySelector(".achord-version[data-version='normal']");
                const eEl = wrapper.querySelector(".achord-version[data-version='easy']");
                if (!nEl || !eEl) return null;
                const pick = el => [...el.querySelectorAll(".achord-chord:not(.achord-placeholder-chord)")].map(c => (c.dataset.original || c.textContent).trim());
                const n = pick(nEl), e = pick(eEl);
                if (!e.length) return null;
                const identical = n.length === e.length && n.every((x, i) => x === e[i]);
                const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
                const root = s => { const m = /^([A-G])([#b]?)/.exec(s); return m ? (PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12 : null; };
                const changed = new Set(), votes = {};
                let pairs = 0;
                for (let i = 0; i < Math.min(n.length, e.length); i++) {
                    if (n[i] !== e[i]) changed.add(n[i]);
                    const rn = root(n[i]), re = root(e[i]);
                    if (rn === null || re === null) continue;
                    const d = (rn - re + 12) % 12;
                    votes[d] = (votes[d] || 0) + 1; pairs++;
                }
                let shift = 0, best = 0;
                for (const d in votes) if (votes[d] > best) { best = votes[d]; shift = +d; }
                if (pairs === 0 || best / pairs < 0.6) shift = 0;
                return { identical, changedCount: changed.size, shift };
            }, ui.capoValue = function () {
                // קאפו בסריגים: קאפו הבסיס פחות שינוי הסולם של המשתמש.
                // בגרסה הקלה מוסיפים בכמה חצאי טון היא נמוכה מהרגילה, כדי שתישמע כמו ההקלטה.
                const c = parseFloat(wrapper.dataset.baseCapo) || 0;
                const easyShift = state.currentVersion === "easy" && this.easyDiff ? this.easyDiff.shift : 0;
                return c + easyShift - state.transposeSteps;
            }, ui.updateCapoInfo = function () {
                if (!this.elements.capoInfo) return;
                const v = this.capoValue();
                // קאפו מחוץ ל-0..7 לא מעשי, אז מסתירים את התווית במקום להציג "קאפו –"
                const ok = v >= 0 && v <= 7;
                this.elements.capoInfo.style.display = ok ? "" : "none";
                this.elements.capoInfo.textContent = `קאפו ${v}`;
                this.elements.capoInfo.title = "קאפו לנגינה עם ההקלטה";
            }, ui.updateEasyInfo = function () {
                let box = wrapper.querySelector(".ams-easy-info");
                if (state.currentVersion !== "easy") { if (box) box.style.display = "none"; return; }
                const d = this.easyDiff;
                // בשיר עם כרטיס "גרסה בינונית" לא מוסיפים כרטיס שני
                if (!d || wrapper.querySelector(".ams-version-note--medium")) return;
                if (!box) {
                    box = document.createElement("div");
                    box.className = "ams-version-note ams-easy-info";
                    box.setAttribute("role", "status");
                    box.innerHTML = '<button type="button" class="ams-easy-info__close" aria-label="סגור">✕</button><strong class="ams-version-note__title"></strong><span class="ams-version-note__text"></span>';
                    box.querySelector(".ams-easy-info__close").addEventListener("click", () => { box.style.display = "none"; });
                    if (this.elements.contentArea) this.elements.contentArea.prepend(box);
                }
                box.querySelector(".ams-version-note__title").textContent = d.changedCount > 0 ? `גרסה קלה · ${d.changedCount === 1 ? "אקורד אחד הוחלף" : d.changedCount + " אקורדים הוחלפו"}` : "גרסה קלה";
                box.querySelector(".ams-version-note__text").style.display = "none";
                box.style.display = "block";
            }, ui.toggleVersion = function (a) {
                state.currentVersion = state.currentVersion === "normal" ? "easy" : "normal";
                a.classList.toggle("active", state.currentVersion === "easy");
                a.setAttribute("aria-pressed", state.currentVersion === "easy" ? "true" : "false");
                wrapper.querySelector(".achord-version[data-version='normal']").style.display = state.currentVersion === "normal" ? "block" : "none";
                wrapper.querySelector(".achord-version[data-version='easy']").style.display = state.currentVersion === "easy" ? "block" : "none";
                const _note = wrapper.querySelector(".ams-version-note");
                if (_note) _note.style.display = state.currentVersion === "easy" ? "block" : "none";
                this.updateCapoInfo();
                this.updateEasyInfo();
                scheduleOverlapFix();
                ChordStrip.refresh();
            }, ui.applyEasyStart = function () {
                if (wrapper.dataset.easyStart !== "1") return;
                const easyEl = wrapper.querySelector(".achord-version[data-version='easy']");
                if (!easyEl || easyEl.textContent.trim() === "") return;
                if (this.elements.versionBtn && this.elements.versionBtn.style.display !== "none") this.toggleVersion(this.elements.versionBtn);
            }, ui.initPopup = function () { if (!this.elements.contentArea || !this.elements.popup || !this.elements.popupDiagram || !this.elements.popupClose) return; this.elements.contentArea.addEventListener("click", a => { const b = a.target.closest(".achord-chord"); if (b && !b.classList.contains("achord-placeholder-chord")) { const a = b.dataset.current || b.textContent.trim(); this.elements.popupDiagram.innerHTML = "", state.instrument === "guitar" ? engine.renderGuitarDiagram(a, this.elements.popupDiagram) : engine.renderPianoDiagram(a, this.elements.popupDiagram), this.elements.popup.classList.remove("hidden") } }); const a = () => this.elements.popup.classList.add("hidden"); this.elements.popup.addEventListener("click", a), this.elements.popupClose.addEventListener("click", b => { b.stopPropagation(), a() }), document.addEventListener("keydown", b => b.key === "Escape" && a()) }, ui.initOptionsDrawer = function () { const t = wrapper.querySelector("#achord-options-toggle"), d = this.elements.drawer; if (!t || !d) return; const isOpen = () => d.classList.contains("is-open"); const sync = () => { const o = isOpen(); t.setAttribute("aria-expanded", o ? "true" : "false"); t.classList.toggle("active", o); }; new MutationObserver(sync).observe(d, { attributes: true, attributeFilter: ["class"] }); sync(); t.addEventListener("click", e => { e.stopPropagation(); d.classList.toggle("is-open"); }); d.querySelector("#achord-options-close")?.addEventListener("click", () => { d.classList.remove("is-open"); t.focus(); }); document.addEventListener("click", e => { if (isOpen() && !d.contains(e.target) && !t.contains(e.target)) d.classList.remove("is-open"); }); document.addEventListener("keydown", e => { if (e.key === "Escape" && isOpen()) { d.classList.remove("is-open"); t.focus(); } }); }, ui.initExtraButtons = function () { wrapper.querySelector("#achord-print")?.addEventListener("click", () => window.print()), wrapper.querySelector("#achord-share-song")?.addEventListener("click", () => { const url = window.location.href, title = document.title; if (navigator.share) { navigator.share({ title: title, url: url }).catch(() => {}) } else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(() => alert("הקישור הועתק!")).catch(() => prompt("העתק את הקישור:", url)) } else { prompt("העתק את הקישור:", url) } }) };
            // Override renderGuitarDiagram to handle high-position chords (fret normalization)
            engine.renderGuitarDiagram = function(chordName, container) {
                const normalizedName = chordName.replace(/[♯♭]/g, ch => ({ '♯': '#', '♭': 'b' })[ch]);
                const chordData = this.guitarChordsData[normalizedName];
                if (!container) return;
                const NUT_Y = 30, STR_GAP = 20, FRET_GAP = 30, NUM_STR = 6, NUM_FRETS = 4, DOT_R = 7, BARRE_H = 8;
                const SVG_W = (NUM_STR - 1) * STR_GAP + 40; // 140
                const SVG_H = NUM_FRETS * FRET_GAP + 70;    // 190
                // Compute fret offset for chords played high on the neck
                let fretOffset = 0;
                if (chordData) {
                    const activeFrets = chordData.frets.filter(f => f !== null && f > 0);
                    if (activeFrets.length) {
                        // כמו בדיאגרמות המקובלות: מתחילים מהסרגל אם האקורד נכנס ב-4 השריגים הראשונים
                        const minFret = Math.min(...activeFrets), maxFret = Math.max(...activeFrets);
                        if (maxFret > NUM_FRETS) fretOffset = minFret - 1;
                    }
                }
                let svg = `<svg width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}" style="font-family:var(--font-body);">`;
                // Nut (thick) or position indicator (thin line + label)
                if (fretOffset === 0) {
                    svg += `<line x1="20" y1="${NUT_Y}" x2="${SVG_W-20}" y2="${NUT_Y}" stroke="var(--text-primary)" stroke-width="4"/>`;
                } else {
                    svg += `<line x1="20" y1="${NUT_Y}" x2="${SVG_W-20}" y2="${NUT_Y}" stroke="var(--text-primary)" stroke-width="1.5"/>`;
                    svg += `<text x="13" y="${NUT_Y+FRET_GAP/2+4}" text-anchor="end" fill="var(--text-primary)" font-size="11" font-weight="bold">${fretOffset+1}</text>`;
                }
                // Fret lines
                for (let f = 1; f <= NUM_FRETS; f++)
                    svg += `<line x1="20" y1="${NUT_Y+f*FRET_GAP}" x2="${SVG_W-20}" y2="${NUT_Y+f*FRET_GAP}" stroke="var(--border-color)" stroke-width="2"/>`;
                // String lines
                for (let s = 0; s < NUM_STR; s++)
                    svg += `<line x1="${20+s*STR_GAP}" y1="${NUT_Y}" x2="${20+s*STR_GAP}" y2="${NUT_Y+NUM_FRETS*FRET_GAP}" stroke="var(--text-primary)" stroke-width="1"/>`;
                if (!chordData) {
                    svg += `<text x="${SVG_W/2}" y="${SVG_H/2}" text-anchor="middle" fill="#e53935">${chordName} לא מוגדר</text></svg>`;
                    container.innerHTML = svg;
                    return;
                }
                // Barre bar
                if (chordData.barre) {
                    const relFret = chordData.barre.fret - fretOffset;
                    const bCY = NUT_Y + (relFret - 0.5) * FRET_GAP;
                    const bX1 = 20 + chordData.barre.fromString * STR_GAP;
                    const bX2 = 20 + chordData.barre.toString * STR_GAP;
                    svg += `<rect x="${bX1-6}" y="${bCY-BARRE_H/2}" width="${bX2-bX1+12}" height="${BARRE_H}" fill="var(--text-primary)" rx="3" ry="3"/>`;
                    if (chordData.barre.finger)
                        svg += `<text x="${(bX1+bX2)/2}" y="${bCY+3}" text-anchor="middle" fill="var(--bg-song)" font-size="9">${chordData.barre.finger}</text>`;
                }
                // Finger dots
                chordData.frets.forEach((fret, si) => {
                    const sx = 20 + si * STR_GAP;
                    if (fret === 0) {
                        svg += `<text x="${sx}" y="${NUT_Y-8}" text-anchor="middle" fill="var(--text-primary)">O</text>`;
                    } else if (fret === null) {
                        svg += `<text x="${sx}" y="${NUT_Y-8}" text-anchor="middle" fill="var(--text-primary)">X</text>`;
                    } else if (fret > 0) {
                        const relFret = fret - fretOffset;
                        const isBarreDot = chordData.barre && chordData.fingers[si] === chordData.barre.finger && fret === chordData.barre.fret;
                        if (!isBarreDot) {
                            const cy = NUT_Y + (relFret - 0.5) * FRET_GAP;
                            svg += `<circle cx="${sx}" cy="${cy}" r="${DOT_R}" fill="var(--text-chord)"/>`;
                            if (chordData.fingers[si])
                                svg += `<text x="${sx}" y="${cy+3.5}" text-anchor="middle" fill="var(--bg-song)" font-size="10">${chordData.fingers[si]}</text>`;
                        }
                    }
                });
                svg += `<text x="${SVG_W/2}" y="${SVG_H-15}" text-anchor="middle" font-size="16" fill="var(--text-primary)" font-weight="bold">${chordData.label || chordName}</text></svg>`;
                container.innerHTML = svg;
            };

            // בר אקורדים עם SVG
            const ChordStrip = {
                init() {
                    const btn = wrapper.querySelector('#achord-chord-strip-toggle');
                    if (!btn) return;
                    btn.addEventListener('click', () => this.toggle());
                },
                isOpen() { return !!document.getElementById('chord-strip-bar'); },
                close() {
                    const strip = document.getElementById('chord-strip-bar');
                    if (strip) strip.remove();
                },
                toggle() {
                    if (this.isOpen()) { this.close(); return; }
                    this.create();
                },
                // מרענן את הבר אם הוא פתוח (אחרי החלפת גרסה / טרנספוזיציה)
                refresh() {
                    if (this.isOpen()) { this.close(); this.create(); }
                },
                // רק הגרסה הנראית כרגע (normal/easy), לא שתיהן
                activeVersion() {
                    const versions = wrapper.querySelectorAll('.achord-version');
                    for (const v of versions) {
                        if (v.style.display !== 'none' && getComputedStyle(v).display !== 'none') return v;
                    }
                    return wrapper;
                },
                create() {
                    const dark = wrapper.classList.contains('dark-mode');
                    const bg  = dark ? '#1e293b' : '#ffffff';
                    const bd  = dark ? '#334155' : '#e5e7eb';
                    const fg  = dark ? '#e2e8f0' : '#0f172a';
                    const sub = dark ? '#94a3b8' : '#64748b';
                    const chords = new Map();
                    // dataset.current = השם אחרי טרנספוזיציה; נופלים ל-original/textContent
                    this.activeVersion().querySelectorAll('.achord-chord:not(.achord-placeholder-chord)').forEach(el => {
                        const name = (el.dataset.current || el.dataset.original || el.textContent || '').trim();
                        if (!name) return;
                        chords.set(name, (chords.get(name) || 0) + 1);
                    });
                    const strip = document.createElement('div');
                    strip.id = 'chord-strip-bar';
                    strip.style.cssText = `position:fixed;top:0;left:0;right:0;background:${bg};border-bottom:2px solid #0ea5e9;padding:10px;overflow-x:auto;z-index:9999;`;
                    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    strip.innerHTML = '<div style="display:flex;gap:10px;align-items:flex-start;">' +
                        Array.from(chords.entries()).map(([chord, count]) =>
                            `<div style="text-align:center;min-width:150px;">
                                <div class="chord-strip-svg" data-chord="${esc(chord)}" style="width:140px;border:1px solid ${bd};border-radius:6px;overflow:hidden;"></div>
                                <div style="font-weight:bold;margin-top:4px;color:${fg}">${esc(chord)}</div>
                                <div style="font-size:0.8em;color:${sub}">${count}×</div>
                            </div>`
                        ).join('') + '</div>';
                    document.body.appendChild(strip);
                    // מכבד את הכלי הנבחר (גיטרה/פסנתר), כמו הפופ-אפ
                    const render = state.instrument === 'piano' ? engine.renderPianoDiagram : engine.renderGuitarDiagram;
                    strip.querySelectorAll('.chord-strip-svg').forEach(container => {
                        if (render) render.call(engine, container.dataset.chord, container);
                    });
                }
            };
            ChordStrip.init();
            (window.ucEngineHooks||[]).forEach(function(f){try{f({engine:engine,state:state,wrapper:wrapper,ChordStrip:ChordStrip,ui:ui});}catch(e){console.error('ucEngineHook',e);}});

            // ───── Personal Version Editor ─────
            const PersonalEditor = {
                modal:    wrapper.querySelector('#achord-personal-modal'),
                editor:   null, // מופע window.initAchordEditor (מאותחל עצל ב-open)
                btnEdit:  wrapper.querySelector('#achord-personal-edit'),
                btnSave:  wrapper.querySelector('#achord-personal-save'),
                btnPropose: wrapper.querySelector('#achord-personal-propose'),
                noteInput:  wrapper.querySelector('#achord-personal-note'),
                btnReset: wrapper.querySelector('#achord-personal-reset'),
                btnCancel:wrapper.querySelector('#achord-personal-cancel'),
                status:   wrapper.querySelector('#achord-personal-status'),

                init() {
                    if (!this.modal || !this.btnEdit) return;
                    this.btnEdit.addEventListener('click', () => this.open());
                    this.btnCancel.addEventListener('click', () => this.close());
                    wrapper.querySelector('#achord-personal-modal-close')?.addEventListener('click', () => this.close());
                    this.btnSave.addEventListener('click', () => this.save());
                    this.btnReset.addEventListener('click', () => this.reset());
                    if (this.btnPropose) this.btnPropose.addEventListener('click', () => this.propose());
                    // Close on backdrop click
                    this.modal.addEventListener('click', (e) => {
                        if (e.target === this.modal) this.close();
                    });
                },

                // אתחול-עצל של עורך-האקורדים המשובץ (רק בפתיחה ראשונה של המודאל,
                // אחרי ש-achord-upload.js כבר הוגדר בפוטר). מחזיר את המופע או null.
                ensureEditor() {
                    if (this.editor) return this.editor;
                    if (typeof window.initAchordEditor !== 'function') return null;
                    this.editor = window.initAchordEditor({
                        mode: 'embed',
                        data: window.ACHORD_PERSONAL_EDITOR_DATA || {},
                        ids: {
                            form:'achord-personal-editor', editorNormal:'pe-editor-normal', tokenCanvas:'pe-token-canvas',
                            textMode:'pe-text-mode', chordMode:'pe-chord-mode', previewPanel:'pe-preview-panel',
                            songPreview:'pe-song-preview', modeText:'pe-mode-text', modeChords:'pe-mode-chords',
                            previewBtn:'pe-preview-btn', recBar:'pe-recommended-bar', editRecBtn:'pe-edit-rec-btn',
                            openLibBtn:'pe-open-library-btn', libraryModal:'pe-library-modal', librarySearch:'pe-library-search',
                            libraryGrid:'pe-library-grid', chordInput:'pe-chord-input', addChordBtn:'pe-add-chord-btn',
                            undoBtn:'pe-undo-btn', redoBtn:'pe-redo-btn'
                        }
                    });
                    return this.editor;
                },

                // הטקסט המסודר מהעורך (פורמט מילה[Am]); ריק אם העורך לא זמין.
                getRaw() { return this.editor ? (this.editor.getContent() || '').trim() : ''; },

                open() {
                    const ed = this.ensureEditor();
                    // טוען את הגרסה הנוכחית (אישית אם קיימת, אחרת הרשמית) לעורך
                    if (ed) ed.setContent(wrapper.dataset.songRaw || '');
                    this.setStatus('');
                    this.modal.hidden = false;
                    if (ed) ed.focus();
                },

                close() {
                    this.modal.hidden = true;
                },

                setStatus(msg, isError = false) {
                    if (!this.status) return;
                    this.status.textContent = msg;
                    this.status.style.color = isError ? '#e53935' : '#2e7d32';
                },

                // ריענון עוקף-קאש. ה-service-worker שומר עמודי-שיר ב-uc-pages לפי URL
                // בלי להבחין בין מחובר/אנונימי, אז reload רגיל עלול להגיש עותק קנוני ישן
                // (בלי הגרסה האישית שנשמרה זה עתה). מוחקים את הרשומה מכל קאש-pages ואז
                // reload — שאז ה-networkFirst מושך גרסה טרייה מהשרת (ומעדכן את הקאש).
                reloadFresh(delay) {
                    setTimeout(async () => {
                        if ('caches' in window) {
                            try {
                                const names = await caches.keys();
                                for (const n of names) {
                                    if (/uc-pages/.test(n)) {
                                        const c = await caches.open(n);
                                        await c.delete(window.location.href);
                                        await c.delete(window.location.href, { ignoreSearch: true });
                                    }
                                }
                            } catch (e) { /* קאש חסום/לא-זמין — נמשיך ל-reload רגיל */ }
                        }
                        window.location.reload();
                    }, delay || 800);
                },

                save() {
                    const rawText = this.getRaw();
                    if (!rawText) { this.setStatus('הטקסט ריק, לא נשמר.', true); return; }

                    const postId = wrapper.dataset.postId;
                    const fd = new FormData();
                    fd.append('action', 'achord_save_personal_version');
                    fd.append('nonce',    ams_ajax_data.personal_nonce);
                    fd.append('post_id',  postId);
                    fd.append('raw_text', rawText);

                    this.btnSave.disabled = true;
                    this.setStatus('שומר...');

                    fetch(ams_ajax_data.ajax_url, { method: 'POST', body: fd })
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) {
                                // Update wrapper data so re-open shows saved version
                                wrapper.dataset.songRaw    = rawText;
                                wrapper.dataset.hasPersonal = '1';
                                if (this.btnEdit) this.btnEdit.classList.add('has-personal');
                                if (this.btnReset) this.btnReset.style.display = '';
                                this.setStatus('✓ הגרסה האישית נשמרה במחברת שלך');
                                this.reloadFresh(800);
                            } else {
                                this.setStatus(data.data || 'שגיאה בשמירה.', true);
                                this.btnSave.disabled = false;
                            }
                        })
                        .catch(() => {
                            this.setStatus('שגיאת רשת.', true);
                            this.btnSave.disabled = false;
                        });
                },

                // "הצע תיקון לכולם" — שומר קודם עותק אישי (שלא יאבד), ואז שולח הצעה לאישור.
                propose() {
                    const rawText = this.getRaw();
                    if (!rawText) { this.setStatus('הטקסט ריק, לא נשלח.', true); return; }

                    const postId = wrapper.dataset.postId;
                    const note   = this.noteInput ? this.noteInput.value.trim() : '';

                    this.btnPropose.disabled = true;
                    this.btnSave.disabled    = true;
                    this.setStatus('שומר עותק אישי...');

                    // שלב 1: שמירת גרסה אישית
                    const fdSave = new FormData();
                    fdSave.append('action', 'achord_save_personal_version');
                    fdSave.append('nonce',    ams_ajax_data.personal_nonce);
                    fdSave.append('post_id',  postId);
                    fdSave.append('raw_text', rawText);

                    fetch(ams_ajax_data.ajax_url, { method: 'POST', body: fdSave })
                        .then(r => r.json())
                        .then(data => {
                            if (!data.success) throw new Error(data.data || 'שגיאה בשמירה.');
                            wrapper.dataset.songRaw     = rawText;
                            wrapper.dataset.hasPersonal = '1';
                            if (this.btnEdit)  this.btnEdit.classList.add('has-personal');
                            if (this.btnReset) this.btnReset.style.display = '';

                            // שלב 2: שליחת הצעה לאישור
                            this.setStatus('שולח הצעה לאישור...');
                            const fdProp = new FormData();
                            fdProp.append('action',   'achord_submit_proposal');
                            fdProp.append('nonce',    ams_ajax_data.personal_nonce);
                            fdProp.append('post_id',  postId);
                            fdProp.append('raw_text', rawText);
                            fdProp.append('note',     note);
                            return fetch(ams_ajax_data.ajax_url, { method: 'POST', body: fdProp }).then(r => r.json());
                        })
                        .then(data => {
                            if (!data.success) throw new Error(data.data || 'שגיאה בשליחת ההצעה.');
                            wrapper.dataset.hasPendingProposal = '1';
                            const msg = (data.data && data.data.message) ? data.data.message : 'ההצעה נשלחה לאישור!';
                            this.setStatus('✓ ' + msg + ' הגרסה שלך נשמרה במחברת.');
                            this.reloadFresh(2000);
                        })
                        .catch(err => {
                            this.setStatus(err.message || 'שגיאת רשת.', true);
                            this.btnPropose.disabled = false;
                            this.btnSave.disabled    = false;
                        });
                },

                reset() {
                    if (!confirm('למחוק את הגרסה האישית ולחזור לגרסה המקורית?')) return;

                    const postId = wrapper.dataset.postId;
                    const fd = new FormData();
                    fd.append('action', 'achord_delete_personal_version');
                    fd.append('nonce',   ams_ajax_data.personal_nonce);
                    fd.append('post_id', postId);

                    this.btnReset.disabled = true;
                    this.setStatus('מוחק...');

                    fetch(ams_ajax_data.ajax_url, { method: 'POST', body: fd })
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) {
                                wrapper.dataset.hasPersonal = '0';
                                if (this.btnEdit) this.btnEdit.classList.remove('has-personal');
                                if (this.btnReset) this.btnReset.style.display = 'none';
                                this.setStatus('נמחק! מרענן...');
                                this.reloadFresh(800);
                            } else {
                                this.setStatus(data.data || 'שגיאה במחיקה.', true);
                                this.btnReset.disabled = false;
                            }
                        })
                        .catch(() => {
                            this.setStatus('שגיאת רשת.', true);
                            this.btnReset.disabled = false;
                        });
                }
            };
            PersonalEditor.init();

            // ───── Save Song (Bookmark) ─────
            const saveBtn = wrapper.querySelector('#achord-save-song');
            if (saveBtn) {
                const updateSaveBtn = (isSaved) => {
                    saveBtn.classList.toggle('is-saved', isSaved);
                    saveBtn.title = isSaved ? 'מועדפים: הסר מהרשימה שלך' : 'מועדפים: שמור שיר זה לרשימה שלך';
                };
                saveBtn.addEventListener('click', function () {
                    if (!ams_ajax_data || !ams_ajax_data.saved_nonce) return;
                    const postId = wrapper.dataset.postId;
                    const fd = new FormData();
                    fd.append('action',  'achord_toggle_saved_song');
                    fd.append('nonce',   ams_ajax_data.saved_nonce);
                    fd.append('post_id', postId);
                    saveBtn.disabled = true;
                    fetch(ams_ajax_data.ajax_url, { method: 'POST', body: fd })
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) updateSaveBtn(data.data.is_saved);
                        })
                        .finally(() => { saveBtn.disabled = false; });
                });
                // מצב ראשוני מה-data attribute
                updateSaveBtn(wrapper.dataset.isSaved === '1');
            }
            // ───────────────────────────────────

            // Override ui.init to call engine.handleFreeChords after initialization
            ui.init = (function (origInit) {
                return function () {
                    if (origInit) origInit.apply(this, arguments);
                    if (typeof engine.handleFreeChords === 'function') {
                        engine.handleFreeChords();
                    }
                    // ריצה סינכרונית מיידית (מסלול מהיר כשהגופן כבר במטמון; עובד גם בטאב-רקע)
                    // + watchers שמריצים שוב אחרי fonts.ready/loadingdone/resize/visibility —
                    // מכסה את באג-מרוץ-הגופן שבו המדידה קדמה לטעינת גופן-האקורדים.
                    fixMidwordChordOverlaps();
                    initOverlapWatchers();
                };
            })(ui.init);
            ui.init();
            // ───── מצב "מילים בלבד" (הסתרת אקורדים) ─────
            const LyricsOnly = {
                btn: wrapper.querySelector('#achord-lyrics-only-toggle'),
                init() {
                    if (!this.btn) return;
                    // סימון קבוצות-מילה שאין בהן מילה (אקורד עצמאי בין-מילים) — מוסתרות במצב מילים-בלבד
                    wrapper.querySelectorAll('.achord-word-group').forEach(g => {
                        const lyr = g.querySelector('.achord-lyrics');
                        const txt = lyr ? lyr.textContent.replace(/[\s\u00a0]/g, '') : '';
                        if (txt === '') g.classList.add('uc-empty-lyric');
                    });
                    if (localStorage.getItem('achordLyricsOnly') === 'enabled') this.apply(true);
                    this.btn.addEventListener('click', () => this.apply(!wrapper.classList.contains('uc-lyrics-only')));
                },
                apply(on) {
                    wrapper.classList.toggle('uc-lyrics-only', on);
                    this.btn.classList.toggle('active', on);
                    this.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                    this.btn.textContent = on ? 'הצג אקורדים' : 'מילים בלבד';
                    localStorage.setItem('achordLyricsOnly', on ? 'enabled' : 'disabled');
                    if (on) { try { ChordStrip.close(); } catch (e) {} }
                    else { scheduleOverlapFix(); }
                }
            };
            LyricsOnly.init();

            // ───── Share Personal Version ─────
            (function() {
                const shareBtn = wrapper.querySelector('#achord-share-personal');
                if (!shareBtn) return;

                shareBtn.addEventListener('click', function() {
                    if (typeof ams_ajax_data === 'undefined') {
                        alert('שגיאה: נתוני האתר לא נטענו. נסה לרענן את העמוד.');
                        return;
                    }
                    const postId = wrapper.dataset.postId;
                    const fd = new FormData();
                    fd.append('action',  'achord_get_share_link');
                    fd.append('nonce',   ams_ajax_data.personal_nonce);
                    fd.append('post_id', postId);

                    shareBtn.disabled = true;
                    shareBtn.innerHTML = UC_ICON('hourglass');

                    fetch(ams_ajax_data.ajax_url, { method: 'POST', body: fd })
                        .then(r => r.text())
                        .then(text => {
                            let data;
                            try { data = JSON.parse(text); }
                            catch(e) {
                                alert('שגיאת שרת:\n' + text.substring(0, 300));
                                shareBtn.innerHTML = UC_ICON('link');
                                shareBtn.disabled = false;
                                return;
                            }
                            if (data.success) {
                                const url = data.data.url;
                                const done = () => {
                                    shareBtn.innerHTML = UC_ICON('check');
                                    shareBtn.title = 'הקישור הועתק!';
                                    setTimeout(() => {
                                        shareBtn.innerHTML = UC_ICON('link');
                                        shareBtn.title = 'שתף גרסה אישית';
                                        shareBtn.disabled = false;
                                    }, 2000);
                                };
                                if (navigator.clipboard && navigator.clipboard.writeText) {
                                    navigator.clipboard.writeText(url).then(done).catch(() => {
                                        prompt('העתק את הקישור:', url);
                                        shareBtn.innerHTML = UC_ICON('link');
                                        shareBtn.disabled = false;
                                    });
                                } else {
                                    // HTTP / clipboard blocked — fallback
                                    prompt('העתק את הקישור:', url);
                                    done();
                                }
                            } else {
                                alert(data.data || 'שגיאה ביצירת הקישור.');
                                shareBtn.innerHTML = UC_ICON('link');
                                shareBtn.disabled = false;
                            }
                        })
                        .catch(err => {
                            alert('שגיאת רשת: ' + err.message);
                            shareBtn.innerHTML = UC_ICON('link');
                            shareBtn.disabled = false;
                        });
                });
            })();
            // ────────────────────────
        }

        /**
         * ------------------------------------------------
         * מודול 2: אקורדיון קטגוריות
         * ------------------------------------------------
         */
        function initCategorizedAccordion() {
            const accordions = $('.achord-accordion-container');
            if (!accordions.length) return;

            accordions.each(function () {
                const container = $(this);
                const headers = container.find('.achord-accordion-header');
                headers.removeClass('active').next('.achord-accordion-content').hide();
                headers.on('click', function () {
                    const content = $(this).next('.achord-accordion-content');
                    const isActive = $(this).hasClass('active');
                    container.find('.achord-accordion-header.active').not(this).removeClass('active').next('.achord-accordion-content').slideUp(200);
                    if (isActive) {
                        $(this).removeClass('active');
                        content.slideUp(200);
                    } else {
                        $(this).addClass('active');
                        content.slideDown(200);
                    }
                });
            });
        }

        /**
         * ------------------------------------------------
         * מודול 3: טופס העלאה
         * ------------------------------------------------
         */
        function initUploaderForm() {
            const uploadForm = document.getElementById('achord-upload-form');
            if (!uploadForm) return;

            // Always run preview and submission logic even for enhanced multi-step forms
            if (typeof ams_ajax_data === 'undefined') {
                console.error('AMS Ajax Data not found');
                return;
            }
            const ajaxUrl = ams_ajax_data.ajax_url;
            const nonce = ams_ajax_data.upload_nonce;

            const tavimTextarea = document.getElementById('editor-abc');
            if (tavimTextarea) {
                tavimProPlusWaitForABCJS(function () {
                    new ABCJS.Editor("editor-abc", {
                        paper_id: "tavim-auto-preview-content",
                        abcjsParams: { responsive: "resize" },
                        warnings_id: "tavim-abc-warnings"
                    });
                });

                if (!document.getElementById('tavim-abc-warnings')) {
                    const warningsDiv = document.createElement('div');
                    warningsDiv.id = 'tavim-abc-warnings';
                    warningsDiv.style.color = '#dc3545';
                    warningsDiv.style.marginTop = '10px';
                    warningsDiv.style.fontWeight = 'bold';
                    document.getElementById('tavim-auto-preview-wrapper').appendChild(warningsDiv);
                }
            }

            const previewBtn = document.getElementById('preview-song-btn');
            if (previewBtn) {
                previewBtn.addEventListener('click', function () {
                    // Validate free chords before previewing, if validation function is available
                    try {
                        const chordsContent = document.getElementById('editor-normal').value;
                        if (typeof window.validateFreeChords === 'function') {
                            window.validateFreeChords(chordsContent);
                        }
                    } catch (err) {
                        console.warn('Free chords validation encountered an error:', err);
                    }
                    const fd = new FormData();
                    fd.append('action', 'achord_live_preview');
                    fd.append('achord_nonce', nonce);
                    fd.append('chords_content', document.getElementById('editor-normal').value);
                    const previewWrapper = document.getElementById('achord-song-preview-wrapper');
                    const previewContainer = document.getElementById('achord-song-preview');
                    previewWrapper.style.display = 'block';
                    previewContainer.innerHTML = "<p>טוען תצוגה...</p>";
                    fetch(ajaxUrl, { method: 'POST', body: fd })
                        .then(r => r.text()).then(html => {
                            previewContainer.innerHTML = html;
                            if (typeof initChordDisplay === 'function') {
                                initChordDisplay();
                            }
                        });
                });
            }

            uploadForm.addEventListener('submit', function (e) {
                e.preventDefault();
                const msgDiv = document.getElementById('achord-upload-msg');
                // ניקוי הודעה קודמת והחזרת עיצוב שדות למצב רגיל
                msgDiv.style.display = 'block';
                msgDiv.innerHTML = '';
                // בדיקה מקדימה לשדות חובה (שם שיר, מבצע ותוכן)
                // נגדיר רשימה של שדות חובה ושמם לקריאה למשתמש
                const requiredFields = [
                    { sel: 'input[name="title"]', label: 'שם השיר' },
                    { sel: 'input[name="performer"]', label: 'מבצע' },
                    { sel: '#editor-normal', label: 'אקורדים ומילים' }
                ];
                let firstMissing = null;
                const missingLabels = [];
                requiredFields.forEach(function (item) {
                    const field = uploadForm.querySelector(item.sel);
                    if (!field) return;
                    field.classList.remove('field-error');
                    if (!field.value || field.value.trim() === '') {
                        field.classList.add('field-error');
                        missingLabels.push(item.label);
                        if (!firstMissing) firstMissing = field;
                    }
                });
                if (missingLabels.length > 0) {
                    // נציג למשתמש רשימה מפורטת של השדות החסרים
                    msgDiv.innerHTML = 'אנא מלאו את השדות הבאים: ' + missingLabels.join(', ');
                    if (firstMissing) {
                        try {
                            firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } catch (err) { }
                    }
                    return;
                }
                msgDiv.innerHTML = 'שולח...';
                const fd = new FormData(uploadForm);
                fd.append('action', 'achord_submit_song');
                fd.append('achord_nonce', nonce);
                fetch(ajaxUrl, { method: 'POST', body: fd })
                    .then(res => res.json())
                    .then(data => {
                        msgDiv.style.color = data.success ? 'green' : 'red';
                        msgDiv.innerHTML = data.data || 'שגיאה לא ידועה.';
                        if (data.success) {
                            uploadForm.reset();
                            document.getElementById('achord-song-preview-wrapper').style.display = 'none';
                            const tavimPreviewContainer = document.getElementById('tavim-auto-preview-content');
                            if (tavimPreviewContainer) {
                                tavimPreviewContainer.innerHTML = 'התצוגה המקדימה של התווים תופיע כאן...';
                            }
                            if (document.getElementById('tavim-abc-warnings')) {
                                document.getElementById('tavim-abc-warnings').innerHTML = '';
                            }
                        }
                    });
            });

            // עבור טופסי העלאה פשוטים בלבד (לא משופרים) – הוסף מאזינים לאקורדים מהירים ולשדה אקורד מותאם אישית
            const isEnhanced = uploadForm.dataset && uploadForm.dataset.enhanced === 'true';
            if (!isEnhanced) {
                const editorToolbar = document.querySelector('.editor-toolbar');
                // Define a global validation function for detecting free chords in the user input. A "free chord" is an isolated chord
                // marker (e.g., [C]) that has whitespace on both sides with no accompanying lyrics. If such patterns are found,
                // a warning message is displayed to the user via the upload message div.
                window.validateFreeChords = function (text) {
                    try {
                        const freeChordPattern = /\s+\[[^\]]+\]\s+/g;
                        const matches = text && typeof text === 'string' ? text.match(freeChordPattern) : null;
                        if (matches && matches.length > 0) {
                            const msgDiv = document.getElementById('achord-upload-msg');
                            if (msgDiv) {
                                msgDiv.style.display = 'block';
                                msgDiv.style.color = 'orange';
                                msgDiv.innerHTML = 'שימו לב: נמצאו אקורדים חופשיים (אקורדים ללא טקסט סביבם).';
                            }
                        }
                    } catch (err) {
                        console.warn('validateFreeChords encountered an error:', err);
                    }
                };
                if (editorToolbar) {
                    const targetTextarea = document.getElementById(editorToolbar.dataset.target);
                    if (targetTextarea) {
                        const insertAtCursor = (a) => { const b = targetTextarea.selectionStart, c = targetTextarea.selectionEnd; targetTextarea.value = targetTextarea.value.substring(0, b) + a + targetTextarea.value.substring(c); targetTextarea.selectionStart = targetTextarea.selectionEnd = b + a.length; targetTextarea.focus() };
                        const chordInput = editorToolbar.querySelector('.chord-input');
                        const addChordBtn = editorToolbar.querySelector('.add-chord-btn');
                        if (chordInput && addChordBtn) {
                            const addCustomChord = () => { if (chordInput.value.trim() !== "") insertAtCursor(`[${chordInput.value.trim()}]`); chordInput.value = ''; };
                            addChordBtn.addEventListener('click', addCustomChord);
                            chordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomChord(); } });
                        }
                        editorToolbar.querySelectorAll('.quick-chord-btn').forEach(btn => {
                            btn.addEventListener('click', () => { insertAtCursor(`[${btn.dataset.chord}]`); });
                        });
                    }
                }
            }
        }

        /**
         * ------------------------------------------------
         * מודול 5 (חדש ומתוקן): מגירת בחירת גופנים
         * ------------------------------------------------
         */
        function initFontDrawer() {
            const songWrapper = document.querySelector('.achord-song-wrapper');
            const mainDrawer = document.getElementById('achord-options-drawer');
            const fontDrawer = document.getElementById('achord-font-selector-drawer');
            const openBtn = document.getElementById('achord-open-font-drawer-btn');
            const closeBtn = document.getElementById('achord-close-font-drawer-btn');
            const fontList = document.getElementById('oot-haim-font-list');
            const loader = fontDrawer ? fontDrawer.querySelector('.font-list-loader') : null;

            if (!songWrapper || !mainDrawer || !fontDrawer || !openBtn || !closeBtn || !fontList || !loader) {
                return;
            }

            const fontsData = [
                { name: "גופן ברירת מחדל", dataName: "default", fontFamily: "var(--font-body-default)", fontFile: null, memorialUrl: null },
                { name: "אבי גולדברג", dataName: "AviGoldberg", fontFaceName: "OHRavAviGoldberg", fontFamily: "'OHRavAviGoldberg', serif", fontFile: "assets/fonts/OHRavAviGoldberg-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/avi-goldberg/" },
                { name: "אביה גנוט", dataName: "AviyaGenut", fontFaceName: "OHAviyaGenut", fontFamily: "'OHAviyaGenut', serif", fontFile: "assets/fonts/OHAviyaGenut-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/aviya-genut/" },
                { name: "אבשלום יאיר פרץ", dataName: "AvshalomPeretz", fontFaceName: "OHAvshalomPeretz", fontFamily: "'OHAvshalomPeretz', serif", fontFile: "assets/fonts/OHAvshalomPeretz-Medium.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/avshalom-yair-peretz/" },
                { name: "אגם נעים", dataName: "AgamNaim", fontFaceName: "OHAgamNaim", fontFamily: "'OHAgamNaim', serif", fontFile: "assets/fonts/OHAgamNaim-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/agam-naim/" },
                { name: "אדיר טמם", dataName: "AdirTamam", fontFaceName: "OHAdirTamam", fontFamily: "'OHAdirTamam', serif", fontFile: "assets/fonts/OHAdirTamam-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/adir-tamam/" },
                { name: "אדיר מסיקה", dataName: "AdirMesika", fontFaceName: "OHAdirMesika", fontFamily: "'OHAdirMesika', serif", fontFile: "assets/fonts/OHAdirMesika-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/adir-mesika/" },
                { name: "אדיר פורטוגל", dataName: "AdirPortugal", fontFaceName: "OHAdirPortugal", fontFamily: "'OHAdirPortugal', serif", fontFile: "assets/fonts/OHAdirPortugal-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/adir-portugal/" },
                { name: "אהרון ארתור מרקוביצ'י", dataName: "AharonMarkovitzi", fontFaceName: "OHAharonMarkovitzi", fontFamily: "'OHAharonMarkovitzi', serif", fontFile: "assets/fonts/OHAharonMarkovitzi-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/aharon-arthur-markovitzi/" },
                { name: "אוהד (בּוּדִי) כהן", dataName: "OhadBudiCohen", fontFaceName: "OHOhadBudiCohen", fontFamily: "'OHOhadBudiCohen', serif", fontFile: "assets/fonts/OHOhadBudiCohen-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/ohad-budi-cohen/" },
                { name: "אורי בר אור", dataName: "UriBarOr", fontFaceName: "OH_UriBarOr", fontFamily: "'OH_UriBarOr', serif", fontFile: "assets/fonts/OH_UriBarOr-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/uri-bar-or/" },
                { name: "אורי ג'רבי", dataName: "OriGerbi", fontFaceName: "OHOriGerbi", fontFamily: "'OHOriGerbi', serif", fontFile: "assets/fonts/OHOriGerbi-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/ori-gerby/" },
                { name: "אוריה יעקב", dataName: "OriyaYaakov", fontFaceName: "OHOriyaYaakov", fontFamily: "'OHOriyaYaakov', serif", fontFile: "assets/fonts/OHOriyaYaakov-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/oriya-yaakov/" },
                { name: "אוריה מש", dataName: "UriyahMash", fontFaceName: "OHUriyahMash", fontFamily: "'OHUriyahMash', serif", fontFile: "assets/fonts/OHUriyahMash-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/uriah-mash/" },
                { name: "אייל קליין", dataName: "EyalKlein", fontFaceName: "OHEyalKlein", fontFamily: "'OHEyalKlein', serif", fontFile: "assets/fonts/OHEyalKlein-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/eyal-klein/" },
                { name: "איל מאיר ברקוביץ", dataName: "EyalMeirBerkowitz", fontFaceName: "OHEyalMeirBerkowitz", fontFamily: "'OHEyalMeirBerkowitz', serif", fontFile: "assets/fonts/OHEyalMeirBerkowitz-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/eyal-meir-berkowitz/" },
                { name: "איתי יהודה", dataName: "ItayYehuda", fontFaceName: "OHItayYehuda", fontFamily: "'OHItayYehuda', serif", fontFile: "assets/fonts/OHItayYehuda-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/itay-yehuda/" },
                { name: "איתי יהושע", dataName: "ItayYehoshua", fontFaceName: "OHItayYehoshua", fontFamily: "'OHItayYehoshua', serif", fontFile: "assets/fonts/OHItayYehoshua-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/itay-yehoshua/" },
                { name: "איתי מאור", dataName: "ItayMaor", fontFaceName: "OHItayMaor", fontFamily: "'OHItayMaor', serif", fontFile: "assets/fonts/OHItayMaor-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/itay-maor/" },
                { name: "איתי סייף", dataName: "ItaiSeif", fontFaceName: "OHItaiSeif", fontFamily: "'OHItaiSeif', serif", fontFile: "assets/fonts/OHItaiSeif-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/itai-seif/" },
                { name: "איתן דב רוזנצוויג", dataName: "EitanRosenzweig", fontFaceName: "OHEitanRosenzweig", fontFamily: "'OHEitanRosenzweig', serif", fontFile: "assets/fonts/OHEitanRosenzweig-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/eitan-rosenzweig/" },
                { name: "איתן פיש", dataName: "EitanFisch", fontFaceName: "OHEitanFisch", fontFamily: "'OHEitanFisch', serif", fontFile: "assets/fonts/OHEitanFisch-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/eitan-fisch/" },
                { name: "אליה הלל", dataName: "EliyaHilel", fontFaceName: "OHEliyaHilel", fontFamily: "'OHEliyaHilel', serif", fontFile: "assets/fonts/OHEliyaHilel-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/eliya-hillel/" },
                { name: "אלירן אברג'ל", dataName: "EliranAbargel", fontFaceName: "OhEliranAbargel", fontFamily: "'OhEliranAbargel', serif", fontFile: "assets/fonts/OhEliranAbargel-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/eliran-abargel/" },
                { name: "אלקנה נוילנדר", dataName: "ElkanaNoylander", fontFaceName: "OHElkanaNoylander", fontFamily: "'OHElkanaNoylander', serif", fontFile: "assets/fonts/OHElkanaNoylander-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/elkana-newlander/" },
                { name: "אפיק טרי", dataName: "AfikTery", fontFaceName: "OHAfikTery", fontFamily: "'OHAfikTery', serif", fontFile: "assets/fonts/OHAfikTery-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/afik-tery/" },
                { name: "אריה ריין", dataName: "AryehRein", fontFaceName: "OHAryehRein", fontFamily: "'OHAryehRein', serif", fontFile: "assets/fonts/OHAryehRein-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/aryeh-rein/" },
                { name: "בן בנימין כהן", dataName: "BenBinyaminCohen", fontFaceName: "OHBenBinyaminCohen", fontFamily: "'OHBenBinyaminCohen', serif", fontFile: "assets/fonts/OHBenBinyaminCohen-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/ben-binyamin-cohen/" },
                { name: "ברק חיים בן ואליד", dataName: "BarakChaimBenValid", fontFaceName: "OHBarakChaimBenValid", fontFamily: "'OHBarakChaimBenValid', serif", fontFile: "assets/fonts/OHBarakChaimBenValid-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/barak-chaim-ben-valid/" },
                { name: "גיא עזר", dataName: "GuyAzar", fontFaceName: "OhGuyAzar", fontFamily: "'OhGuyAzar', serif", fontFile: "assets/fonts/OhGuyAzar-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/guy-azar/" },
                { name: "דביר רחמים", dataName: "DvirRahamim", fontFaceName: "OHDvirRahamim", fontFamily: "'OHDvirRahamim', serif", fontFile: "assets/fonts/OHDvirRahamim-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/dvir-rahamim/" },
                { name: "דור מנגדי", dataName: "DorMangadi", fontFaceName: "OhDorMangadi", fontFamily: "'OhDorMangadi', serif", fontFile: "assets/fonts/OhDorMangadi-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/dor-mangadi/" },
                { name: "דור שדה", dataName: "DorSade", fontFaceName: "OHDorSade", fontFamily: "'OHDorSade', serif", fontFile: "assets/fonts/OHDorSade-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/dor-sade/" },
                { name: "דורין אטיאס", dataName: "DorinAtias", fontFaceName: "OHDorinAtias", fontFamily: "'OHDorinAtias', serif", fontFile: "assets/fonts/OHDorinAtias-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/dorin-atias/" },
                { name: "דניאל לוי לודמיר", dataName: "DanielLeviLudmir", fontFaceName: "OHDanielLeviLudmir", fontFamily: "'OHDanielLeviLudmir', serif", fontFile: "assets/fonts/OHDanielLeviLudmir-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/daniel-levi-ludmir/" },
                { name: "דרור אלטון", dataName: "DrorAltun", fontFaceName: "OHDrorAltun", fontFamily: "'OHDrorAltun', serif", fontFile: "assets/fonts/OHDrorAltun-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/dror-altun/" },
                { name: "הראל איתח", dataName: "HarelIttah", fontFaceName: "OHHarelIttah", fontFamily: "'OHHarelIttah', serif", fontFile: "assets/fonts/OHHarelIttah-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/harel-ittah/" },
                { name: "זיו פפה שפירא", dataName: "ZivPepeShapira", fontFaceName: "OHZivPepeShapira", fontFamily: "'OHZivPepeShapira', serif", fontFile: "assets/fonts/OHZivPepeShapira-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/ziv-pepe-shapira/" },
                { name: "חן בוכריס", dataName: "ChenBuchris", fontFaceName: "OHChenBuchris", fontFamily: "'OHChenBuchris', serif", fontFile: "assets/fonts/OHChenBuchris-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/chen-buchris/" },
                { name: "יאיר כהן", dataName: "YairCohen", fontFaceName: "OhYairCohen", fontFamily: "'OhYairCohen', serif", fontFile: "assets/fonts/OhYairCohen-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yair-cohen/" },
                { name: "ידידיה רזיאל", dataName: "YedidyaRaziel", fontFaceName: "OHYedidyaRaziel", fontFamily: "'OHYedidyaRaziel', serif", fontFile: "assets/fonts/OHYedidyaRaziel-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yedidya-raziel/" },
                { name: "יהודה נתן כהן", dataName: "YehudaNatanCohen", fontFaceName: "OHYehudaNatanCohen", fontFamily: "'OHYehudaNatanCohen', serif", fontFile: "assets/fonts/OHYehudaNatanCohen-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yehuda-natan-cohen/" },
                { name: "יהונתן צור", dataName: "YehonatanTzor", fontFaceName: "OHYehonatanTzor", fontFamily: "'OHYehonatanTzor', serif", fontFile: "assets/fonts/OHYehonatanTzor-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yehonatan-tzor/" },
                { name: "יובל גבאי", dataName: "YuvalGabay", fontFaceName: "OHYuvalGabay", fontFamily: "'OHYuvalGabay', serif", fontFile: "assets/fonts/OHYuvalGabay-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yuval-gabay/" },
                { name: "יותם בן בסט", dataName: "YotamBenBasat", fontFaceName: "OH_YotamBenBasat", fontFamily: "'OH_YotamBenBasat', serif", fontFile: "assets/fonts/OH_YotamBenBasat-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yotam-ben-basat/" },
                { name: "יחזקאל חיזגיל רזילוב", dataName: "YehezkelRazilov", fontFaceName: "OHYehezkelRazilov", fontFamily: "'OHYehezkelRazilov', serif", fontFile: "assets/fonts/OHYehezkelRazilov-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yehezkel-razilov/" },
                { name: "יעל לייבושור", dataName: "YaelLeibushor", fontFaceName: "OHYaelLeibushor", fontFamily: "'OHYaelLeibushor', serif", fontFile: "assets/fonts/OHYaelLeibushor-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yael-leibushor/" },
                { name: "יפתח יעבץ", dataName: "IftahYavetz", fontFaceName: "OHIftahYavetz", fontFamily: "'OHIftahYavetz', serif", fontFile: "assets/fonts/OHIftahYavetz-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/iftah-yavetz/" },
                { name: "יצהר הופמן", dataName: "YitzharHoffman", fontFaceName: "OHYitzharHoffman", fontFamily: "'OHYitzharHoffman', serif", fontFile: "assets/fonts/OHYitzharHoffman-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/yitzhar-hoffman/" },
                { name: "לבנת לוי", dataName: "LivnatLevi", fontFaceName: "OHLivnatLevi", fontFamily: "'OHLivnatLevi', serif", fontFile: "assets/fonts/OHLivnatLevi-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/livnat-levi/" },
                { name: "ליאור אטיאס", dataName: "LiorAtias", fontFaceName: "OHLiorAtias", fontFamily: "'OHLiorAtias', serif", fontFile: "assets/fonts/OHLiorAtias-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/lior-atias/" },
                { name: "ליאור סימינוביץ'", dataName: "LiorSiminovich", fontFaceName: "OHLiorSiminovich", fontFamily: "'OHLiorSiminovich', serif", fontFile: "assets/fonts/OHLiorSiminovich-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/lior-siminovich/" },
                { name: "ליבי כהן-מגורי", dataName: "LibbyCohenMeguri", fontFaceName: "OHLibbyCohenMeguri", fontFamily: "'OHLibbyCohenMeguri', serif", fontFile: "assets/fonts/OHLibbyCohenMeguri-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/libby-cohen-meguri/" },
                { name: "לידור יוסף קרואני", dataName: "LidorYosefKaravani", fontFaceName: "OHLidorYosefKaravani", fontFamily: "'OHLidorYosefKaravani', serif", fontFile: "assets/fonts/OHLidorYosefKaravani-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/lidor-yosef-karavani/" },
                { name: "לילי ורם איתמרי", dataName: "LiliItamari", fontFaceName: "OHLiliItamari", fontFamily: "'OHLiliItamari', serif", fontFile: "assets/fonts/OHLiliItamari-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/itamari-lili-ram/" },
                { name: "לין דפני", dataName: "LinDafni", fontFaceName: "OHLinDafni", fontFamily: "'OHLinDafni', serif", fontFile: "assets/fonts/OHLinDafni-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/lin-dafni/" },
                { name: "מור סויד גבאי", dataName: "MorSwidGabay", fontFaceName: "OHMorSwidGabay", fontFamily: "'OHMorSwidGabay', serif", fontFile: "assets/fonts/OHMorSwidGabay-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/mor-swid-gabay/" },
                { name: "מיכאל בן חמו", dataName: "MichaelBenHamo", fontFaceName: "OHMichaelBenHamo", fontFamily: "'OHMichaelBenHamo', serif", fontFile: "assets/fonts/OHMichaelBenHamo-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/michael-ben-hamo/" },
                { name: "מיכאל ליזמי", dataName: "MichaelLizmi", fontFaceName: "OHMichaelLizmi", fontFamily: "'OHMichaelLizmi', serif", fontFile: "assets/fonts/OHMichaelLizmi-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/michael-lizmi/" },
                { name: "מלכיה גרוס", dataName: "MalkiaGross", fontFaceName: "OHMalkiaGross", fontFamily: "'OHMalkiaGross', serif", fontFile: "assets/fonts/OHMalkiaGross-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/malkia-gross/" },
                { name: "מעיין (שוזי) פרלשטיין", dataName: "MaayanShoozyPearlstein", fontFaceName: "OHMaayanShoozyPearlstein", fontFamily: "'OHMaayanShoozyPearlstein', serif", fontFile: "assets/fonts/OHMaayanShoozyPearlstein-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/maayan-shoozy-pearlstein/" },
                { name: "מעיין עידן", dataName: "MaayanIdan", fontFaceName: "OHMaayanIdan", fontFamily: "'OHMaayanIdan', serif", fontFile: "assets/fonts/OHMaayanIdan-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/maayan-idan/" },
                { name: "משה אברהם בר און", dataName: "MosheBarOn", fontFaceName: "OHMosheBarOn", fontFamily: "'OHMosheBarOn', serif", fontFile: "assets/fonts/OHMosheBarOn-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/moshe-bar-on/" },
                { name: "מתי וייס", dataName: "MattyWeiss", fontFaceName: "OHMattyWeiss", fontFamily: "'OHMattyWeiss', serif", fontFile: "assets/fonts/OHMattyWeiss-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/mati-weiss/" },
                { name: "נבו ארד", dataName: "NevoArad", fontFaceName: "OHNevoArad", fontFamily: "'OHNevoArad', serif", fontFile: "assets/fonts/OHNevoArad-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/nevo-arad/" },
                { name: "נועה זנדר", dataName: "NoaZender", fontFaceName: "OHNoaZender", fontFamily: "'OHNoaZender', serif", fontFile: "assets/fonts/OHNoaZender-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/noa-zender/" },
                { name: "נועם אברמוביץ", dataName: "NoamAbramovich", fontFaceName: "OHNoamAbramovich", fontFamily: "'OHNoamAbramovich', serif", fontFile: "assets/fonts/OHNoamAbramovich-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/noam-avramovich/" },
                { name: "נטע אפשטין", dataName: "NettaEpstein", fontFaceName: "OHNettaEpstein", fontFamily: "'OHNettaEpstein', serif", fontFile: "assets/fonts/OHNettaEpstein-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/netta-epstein/" },
                { name: "ניב רביב", dataName: "NivRaviv", fontFaceName: "OHNivRaviv", fontFamily: "'OHNivRaviv', serif", fontFile: "assets/fonts/OHNivRaviv-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/niv-raviv/" },
                { name: "נערן אשחר", dataName: "NaaranEshchar", fontFaceName: "OHNaaranEshchar", fontFamily: "'OHNaaranEshchar', serif", fontFile: "assets/fonts/OHNaaranEshchar-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/naaran-eshchar/" },
                { name: "נתי דוד אלפסי", dataName: "NatiDavidAlfasi", fontFaceName: "OHNatiDavidAlfasi", fontFamily: "'OHNatiDavidAlfasi', serif", fontFile: "assets/fonts/OHNatiDavidAlfasi-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/nati-david-alfasi/" },
                { name: "סביון חן קיפר", dataName: "SavyonChenKipper", fontFaceName: "OHSavyonChenKipper", fontFamily: "'OHSavyonChenKipper', serif", fontFile: "assets/fonts/OHSavyonChenKipper-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/savyon-chen-kipper/" },
                { name: "סיון אלקבץ", dataName: "SivanElkabetz", fontFaceName: "OHSivanElkabetz", fontFamily: "'OHSivanElkabetz', serif", fontFile: "assets/fonts/OHSivanElkabetz1.0-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/sivan-elkabets/" },
                { name: "סיון ווייל", dataName: "SivanWeil", fontFaceName: "OHSivanWeil", fontFamily: "'OHSivanWeil', serif", fontFile: "assets/fonts/OHSivanWeil-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/sivan-weil/" },
                { name: "סלמאן חבקה", dataName: "SalmanHabaka", fontFaceName: "OHSalmanHabaka", fontFamily: "'OHSalmanHabaka', serif", fontFile: "assets/fonts/OHSalmanHabaka-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/salman-habaka/" },
                { name: "עדי אודיה ברוך", dataName: "AdiOdeyaBaruch", fontFaceName: "OhAdiOdeyaBaruch", fontFamily: "'OhAdiOdeyaBaruch', serif", fontFile: "assets/fonts/OhAdiOdeyaBaruch-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/adi-odeya-baruch/" },
                { name: "עדי ליאון", dataName: "AdiLeon", fontFaceName: "OHAdiLeon", fontFamily: "'OHAdiLeon', serif", fontFile: "assets/fonts/OHAdiLeon-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/adi-leon/" },
                { name: "עדן נימרי", dataName: "EdenNimri", fontFaceName: "OHEdenNimri", fontFamily: "'OHEdenNimri', serif", fontFile: "assets/fonts/OHEdenNimri-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/eden-nimri/" },
                { name: "עדן פרוביזור", dataName: "EdenProvisor", fontFaceName: "OHEdenProvisor", fontFamily: "'OHEdenProvisor', serif", fontFile: "assets/fonts/OHEdenProvisor-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/eden-provisor/" },
                { name: "עומר וולף", dataName: "OmerWolf", fontFaceName: "OHOmerWolf", fontFamily: "'OHOmerWolf', serif", fontFile: "assets/fonts/OHOmerWolf-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/omer-wolf/" },
                { name: "עומרי שורץ", dataName: "OmriSchwartz", fontFaceName: "OHOmriSchwartz", fontFamily: "'OHOmriSchwartz', serif", fontFile: "assets/fonts/OHOmriSchwartz-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/omri-shwartz/" },
                { name: "עידו ברוך", dataName: "IdoBaruch", fontFaceName: "OHIdoBaruch", fontFamily: "'OHIdoBaruch', serif", fontFile: "assets/fonts/OHIdoBaruch-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/ido-baruch/" },
                { name: "עלמנאו עמנואל פלקה", dataName: "EmanuelFeleke", fontFaceName: "OHEmanuelFeleke", fontFamily: "'OHEmanuelFeleke', serif", fontFile: "assets/fonts/Oh_AlemnewEmanuelFeleke-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/alemnew-emanuel-feleke/" },
                { name: "עמיחי שמעון רובין", dataName: "AmichayRubin", fontFaceName: "OHAmichayRubin", fontFamily: "'OHAmichayRubin', serif", fontFile: "assets/fonts/OHAmichayRubin-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/amichay-rubin/" },
                { name: "עמית גואטה", dataName: "AmitGuetta", fontFaceName: "OHAmitGuetta", fontFamily: "'OHAmitGuetta', serif", fontFile: "assets/fonts/OHAmitGuetta-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/amit-guetta/" },
                { name: "עמית מן", dataName: "AmitMan", fontFaceName: "OhAmitMan", fontFamily: "'OhAmitMan', serif", fontFile: "assets/fonts/OhAmitMan-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/amit-man/" },
                { name: "עמית פרידמן", dataName: "AmitFridman", fontFaceName: "OHAmitFridman", fontFamily: "'OHAmitFridman', serif", fontFile: "assets/fonts/OHAmitFridman-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/amit-friedman/" },
                { name: "ענבר הימן", dataName: "InbarHaiman", fontFaceName: "OHInbarHaiman", fontFamily: "'OHInbarHaiman', serif", fontFile: "assets/fonts/OHInbarHaiman-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/inbar-haiman/" },
                { name: "ענר אליקים שפירא", dataName: "AnerShapiro", fontFaceName: "OH_AnerShapiro", fontFamily: "'OH_AnerShapiro', serif", fontFile: "assets/fonts/OH_AnerShapiro-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/aner-shapiro/" },
                { name: "רון שמר", dataName: "RonShemer", fontFaceName: "OHRonShemer", fontFamily: "'OHRonShemer', serif", fontFile: "assets/fonts/OHRonShemer-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/ron-shemer/" },
                { name: "רוני אשל", dataName: "RoniEshel", fontFaceName: "OHRoniEshel", fontFamily: "'OHRoniEshel', serif", fontFile: "assets/fonts/OHRoniEshel-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/roni-eshel/" },
                { name: "רועי דאוי", dataName: "RoiDawy", fontFaceName: "OhRoiDawy", fontFamily: "'OhRoiDawy', serif", fontFile: "assets/fonts/OhRoiDawy-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/roi-dawy/" },
                { name: "רועי צ'אפל", dataName: "RoeyChapell", fontFaceName: "OHRoeyChapell", fontFamily: "'OHRoeyChapell', serif", fontFile: "assets/fonts/OHRoeyChapell-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/roey-chapell/" },
                { name: "רותם יוסף לוי", dataName: "RotemLevi", fontFaceName: "OHRotemLevi", fontFamily: "'OHRotemLevi', serif", fontFile: "assets/fonts/OHRotemLevi-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/rotem-levy/" },
                { name: "רינת הודיה (ריני) זגדון", dataName: "RinatZigdon", fontFaceName: "OHRinatZigdon", fontFamily: "'OHRinatZigdon', serif", fontFile: "assets/fonts/OHRinatZigdon-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/rinat-zagdon/" },
                { name: "רני טחן", dataName: "RaniTahan", fontFaceName: "OHRaniTahan", fontFamily: "'OHRaniTahan', serif", fontFile: "assets/fonts/OHRaniTahan-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/rani-tahan/" },
                { name: "שאול מויאל", dataName: "ShaulMoyal", fontFaceName: "OHShaulMoyal", fontFamily: "'OHShaulMoyal', serif", fontFile: "assets/fonts/OHShaulMoyal-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/shaul-moyal/" },
                { name: "שאולי גרינגליק", dataName: "ShauliGreenglick", fontFaceName: "OHShauliGreenglick", fontFamily: "'OHShauliGreenglick', serif", fontFile: "assets/fonts/OHShauliGreenglick-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/shauli-greenglick/" },
                { name: "שגיא עידן", dataName: "SagiIdan", fontFaceName: "OHSagiIdan", fontFamily: "'OHSagiIdan', serif", fontFile: "assets/fonts/OHSagiIdan-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/sagi-idan/" },
                { name: "שחר פרידמן", dataName: "ShacharFridman", fontFaceName: "OhShacharFridman", fontFamily: "'OhShacharFridman', serif", fontFile: "assets/fonts/OhShacharFridman-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/shachar-fridman/" },
                { name: "שי שמריז", dataName: "ShayShamriz", fontFaceName: "OHShayShamriz", fontFamily: "'OHShayShamriz', serif", fontFile: "assets/fonts/OHShayShamriz-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/shay-shamriz/" },
                { name: "שילה ראוכברגר", dataName: "ShiloRauchberger", fontFaceName: "OHShiloRauchberger", fontFamily: "'OHShiloRauchberger', serif", fontFile: "assets/fonts/OHShiloRauchberger-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/shilo-rauchberger/" },
                { name: "שיר חנה ג'ורג'י", dataName: "ShirChanaGorgi", fontFaceName: "OhShirChanaGorgi", fontFamily: "'OhShirChanaGorgi', serif", fontFile: "assets/fonts/OhShirChanaGorgi-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/shir-hana-georgy/" },
                { name: "שני גבאי", dataName: "ShaniGabay", fontFaceName: "OhShaniGabay", fontFamily: "'OhShaniGabay', serif", fontFile: "assets/fonts/OhShaniGabay-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/shani-gabay/" },
                { name: "תומר גולן", dataName: "TomerGolan", fontFaceName: "OHTomerGolan", fontFamily: "'OHTomerGolan', serif", fontFile: "assets/fonts/OHTomerGolan-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/tomer-golan/" },
                { name: "תמיר אדר", dataName: "TamirAdar", fontFaceName: "OHTamirAdar", fontFamily: "'OHTamirAdar', serif", fontFile: "assets/fonts/OHTamirAdar-Regular.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/tamir-adar/" },
                { name: "תפארת לפידות", dataName: "TiferetLapidot", fontFaceName: "OHTiferetLapidot", fontFamily: "'OHTiferetLapidot', serif", fontFile: "assets/fonts/OHTiferetLapidot.woff2", memorialUrl: "https://www.ot-hayim.co.il/fonts/tiferet-lapidot/" },
            ];

            let listPopulated = false;
            const pluginUrl = (typeof ams_ajax_data !== 'undefined' && ams_ajax_data.plugin_url) ? ams_ajax_data.plugin_url : '';

            openBtn.addEventListener('click', function () {
                mainDrawer.classList.remove('is-open');
                fontDrawer.classList.add('is-open');
                if (!listPopulated) {
                    populateFontList();
                    setupLazyFontLoader();
                    listPopulated = true;
                }
            });

            closeBtn.addEventListener('click', function () {
                fontDrawer.classList.remove('is-open');
            });

            function populateFontList() {
                fontList.innerHTML = '';
                loader.style.display = 'none';
                fontList.classList.remove('hidden');

                fontsData.forEach(font => {
                    const li = document.createElement('li');
                    li.dataset.fontName = font.dataName;

                    if (font.fontFile) {
                        li.classList.add('loading');
                    } else {
                        li.classList.add('loaded');
                    }

                    const fontNameSpan = document.createElement('span');
                    fontNameSpan.className = 'font-name';
                    fontNameSpan.textContent = font.name;
                    li.appendChild(fontNameSpan);

                    if (font.memorialUrl) {
                        const infoLink = document.createElement('a');
                        infoLink.className = 'font-info-link';
                        infoLink.href = font.memorialUrl;
                        infoLink.target = '_blank';
                        infoLink.rel = 'noopener';
                        infoLink.setAttribute('aria-label', 'לעמוד הזיכרון');
                        infoLink.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
                        infoLink.addEventListener('click', (e) => e.stopPropagation());
                        li.appendChild(infoLink);
                    }

                    li.addEventListener('click', () => applyFont(font));
                    fontList.appendChild(li);
                });
                updateActiveFont();
            }

            function loadFontForItem(li, fontData) {
                const fontUrl = pluginUrl + fontData.fontFile;
                const fontFace = new FontFace(fontData.fontFaceName, `url(${fontUrl})`);
                fontFace.load().then(loadedFace => {
                    document.fonts.add(loadedFace);
                    li.classList.remove('loading');
                    li.classList.add('loaded');
                    li.querySelector('.font-name').style.fontFamily = fontData.fontFamily;
                }).catch(() => {
                    li.classList.remove('loading');
                    li.classList.add('error');
                    li.title = 'טעינת הפונט נכשלה';
                });
            }

            function setupLazyFontLoader() {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (!entry.isIntersecting) return;
                        const li = entry.target;
                        observer.unobserve(li);
                        const fontData = fontsData.find(f => f.dataName === li.dataset.fontName);
                        if (fontData && fontData.fontFile) {
                            loadFontForItem(li, fontData);
                        }
                    });
                }, { rootMargin: '150px' });

                fontList.querySelectorAll('li.loading').forEach(li => observer.observe(li));
            }

            function applyFont(font) {
                songWrapper.style.setProperty('--font-body-oot', font.fontFamily);
                if (font.dataName === 'default') {
                    songWrapper.classList.remove('oot-haim-active');
                } else {
                    songWrapper.classList.add('oot-haim-active');
                }
                localStorage.setItem('ootHaimSelectedFont', font.dataName);
                updateActiveFont();
            }

            function updateActiveFont() {
                const selectedFontName = localStorage.getItem('ootHaimSelectedFont') || 'default';
                fontList.querySelectorAll('li').forEach(li => {
                    li.classList.toggle('active', li.dataset.fontName === selectedFontName);
                });
            }

            function applySavedFontOnLoad() {
                const savedFontName = localStorage.getItem('ootHaimSelectedFont');
                if (savedFontName) {
                    const savedFont = fontsData.find(f => f.dataName === savedFontName);
                    if (savedFont) {
                        if (savedFont.fontFile && !document.fonts.check(`1em ${savedFont.fontFamily}`)) {
                            const pluginUrl = (typeof ams_ajax_data !== 'undefined' && ams_ajax_data.plugin_url) ? ams_ajax_data.plugin_url : '';
                            const fontUrl = pluginUrl + savedFont.fontFile;
                            // שימוש בשם הייחודי גם כאן
                            const fontFace = new FontFace(savedFont.fontFaceName, `url(${fontUrl})`);
                            fontFace.load().then(loadedFace => {
                                document.fonts.add(loadedFace);
                                applyFont(savedFont);
                            }).catch(err => console.error(`Failed to load saved font: ${savedFont.name}`, err));
                        } else {
                            applyFont(savedFont);
                        }
                    }
                }
            }
            applySavedFontOnLoad();
        }

        // ---- מרכז הבקרה ----
        initCategorizedAccordion();
        initChordDisplay();
        initUploaderForm();
        initFontDrawer();

    });
})(jQuery);
/* === Achord – Digits behave EXACTLY like buttons + Ampersand jump === */
(function () {
    // ---- Locate textarea (robust, like original) ----
    function getTextarea() {
        const toolbar = document.querySelector('.editor-toolbar');
        if (toolbar && toolbar.dataset && toolbar.dataset.target) {
            const ta = document.getElementById(toolbar.dataset.target);
            if (ta) return ta;
        }
        return document.querySelector('#achord-upload-form textarea') ||
            document.querySelector('.achord-editor textarea') ||
            null;
    }
    const ta = getTextarea();
    if (!ta) return;

    // ---- Recommended bar & items ----
    const bar = document.querySelector('#achord-upload-form .recommended-chords-bar');
    if (!bar) return;

    function getChordItems() {
        return Array.from(bar.querySelectorAll(':scope > *')); // button/a/div...
    }

    // ---- Ensure star (left), number (right), and reliable data-chord ----
    function initItemsDecor() {
        getChordItems().forEach((el, i) => {
            // number badge (1..9, 0)
            if (!el.querySelector('.chord-num')) {
                const num = document.createElement('span');
                num.className = 'chord-num';
                num.textContent = (i < 9 ? (i + 1) : 0);
                el.appendChild(num);
            }
            // normalize star class so CSS places it left-top
            const starCand = el.querySelector('.fav-star, .star, .star-icon, .icon-star, .is-fav, [data-fav="1"]');
            if (starCand && !starCand.classList.contains('fav-star')) {
                starCand.classList.add('fav-star');
            }
            // ensure data-chord (clean label without badges)
            if (!el.dataset.chord) {
                const clone = el.cloneNode(true);
                clone.querySelectorAll('.chord-num, .fav-star, .star, .star-icon, .icon-star, .is-fav, [data-fav]')
                    .forEach(n => n.remove());
                const label = Array.from(clone.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent).join(' ')
                    .replace(/\s+/g, ' ').trim();
                if (label) el.dataset.chord = label;
            }
        });
    }
    initItemsDecor();
    if (window.MutationObserver) {
        new MutationObserver(() => initItemsDecor())
            .observe(bar, { childList: true, subtree: true });
    }

    // ---- Base insertion exactly like the plugin's button motor ----
    // If plugin exposes window.insertAtCursor, use it. Otherwise fallback identical.
    const nativeInsertAtCursor =
        (typeof window.insertAtCursor === 'function')
            ? window.insertAtCursor
            : function (text) {
                const start = ta.selectionStart, end = ta.selectionEnd;
                const before = ta.value.slice(0, start);
                const after = ta.value.slice(end);
                ta.value = before + text + after;        // single write → single Undo
                const caret = start + text.length;
                ta.selectionStart = ta.selectionEnd = caret;
                ta.focus();
            };

    // ---- Ampersand jump (keep your improved logic) ----
    function findEndOfWord(val, from) {
        let i = from;
        while (i < val.length && !/\s/.test(val[i])) i++;
        while (i < val.length && /[.,]/.test(val[i])) i++; // land AFTER comma/dot
        return i;
    }
    function handleAmpersand() {
        let val = ta.value;
        let pos = ta.selectionStart;

        // remove the just-typed '&'
        if (pos > 0 && val[pos - 1] === '&') {
            val = val.slice(0, pos - 1) + val.slice(pos);
            ta.value = val;
            pos = pos - 1;
        }

        // skip leading spaces, then jump to end-of-word (after comma/dot if present)
        while (pos < val.length && /\s/.test(val[pos])) pos++;
        pos = findEndOfWord(val, pos);

        ta.selectionStart = ta.selectionEnd = pos;
        ta.focus();
    }

    // ---- Make digits act EXACTLY like buttons ----
    const items = getChordItems();
    function handleDigitLikeButtons(d) {
        const idx = (d === '0') ? 9 : (parseInt(d, 10) - 1);
        if (isNaN(idx) || idx < 0 || idx >= items.length) return;

        const el = items[idx];
        const chord = el && el.dataset && el.dataset.chord;
        if (!chord) return;

        // EXACT behavior: insert at caret, no spacing tweaks, with square brackets
        nativeInsertAtCursor('[' + chord + ']');

        // small visual feedback if CSS .blink exists
        if (el.classList) {
            el.classList.add('blink');
            setTimeout(() => el.classList.remove('blink'), 220);
        }
    }

    // ---- Input listener: strip typed digit then delegate to button motor ----
    ta.addEventListener('input', (e) => {
        const d = e.data;
        if (!d || typeof d !== 'string') return;

        if (/^\d$/.test(d)) {
            // remove the typed digit the browser inserted
            const s = ta.selectionStart, v = ta.value;
            if (s > 0 && v[s - 1] === d) {
                ta.value = v.slice(0, s - 1) + v.slice(s);
                ta.selectionStart = ta.selectionEnd = s - 1;
            }
            handleDigitLikeButtons(d);
            return;
        }

        if (d === '&') {
            handleAmpersand();
            return;
        }
    }, { capture: false });
})();