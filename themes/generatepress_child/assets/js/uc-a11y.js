/**
 * unichord — רכיב נגישות (Vanilla JS, ללא תלות חיצונית)
 * ת"י 5568 / WCAG 2.0 AA. שומר ב-localStorage, מחיל class-ים על <html>.
 *
 * ⚠️ נקודה קריטית לאתר הזה:
 *    בעמוד שיר האקורדים ממוקמים ב-position:absolute מעל המילים, וההסטות
 *    מחושבות ב-px ע"י window.__amsMidwordFix (מוגדר ב-Shortcode_Handler.php).
 *    כל שינוי שמשנה מטריקות-טקסט (גודל גופן / משפחת-גופן) הופך את המדידה
 *    לישנה ⇒ חפיפת אקורדים. ה-ResizeObserver של התוסף מגיב רק לשינוי *רוחב*
 *    המכל ולכן לא נורה כאן. לכן אנחנו מריצים __amsMidwordFix ידנית.
 *    הפונקציה אידמפוטנטית (מאפסת transform/margin לפני חישוב מחדש).
 */
'use strict';

(function () {
    var STORAGE_KEY = 'uc_a11y';
    var SCALES = [1, 1.1, 1.25, 1.4, 1.6];
    var root = document.documentElement;

    var TOGGLES = {
        contrast: 'uc-a11y-contrast',
        mono:     'uc-a11y-mono',
        links:    'uc-a11y-links',
        readable: 'uc-a11y-readable',
        pause:    'uc-a11y-pause',
        headings: 'uc-a11y-headings',
        cursor:   'uc-a11y-cursor'
    };

    function defaults() {
        return { fontStep: 0, contrast: false, mono: false, links: false,
                 readable: false, pause: false, headings: false, cursor: false };
    }

    var state = (function () {
        var def = defaults();
        try {
            var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            Object.keys(def).forEach(function (k) {
                if (Object.prototype.hasOwnProperty.call(saved, k)) { def[k] = saved[k]; }
            });
        } catch (e) {}
        // הגנה מפני ערך פגום ב-storage
        if (typeof def.fontStep !== 'number' || def.fontStep < 0 || def.fontStep >= SCALES.length) {
            def.fontStep = 0;
        }
        return def;
    })();

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    /* מריץ מחדש את מנוע-פריסת-האקורדים אחרי שינוי מטריקות-טקסט.
       __amsMidwordFix(root) עושה root.querySelectorAll('.achord-midword'),
       ולכן document הוא root תקף — מכסה גם עמוד עם כמה wrappers. */
    function runMidwordFix() {
        if (typeof window.__amsMidwordFix !== 'function') { return; }
        if (!document.querySelector('.achord-midword')) { return; }
        try { window.__amsMidwordFix(document); } catch (e) {}
    }
    function relayoutChords() {
        // ממתינים ל-reflow אחרי שינוי ה-font-size, ואז מודדים מחדש.
        requestAnimationFrame(runMidwordFix);
        // ריצה שנייה אחרי שהגופן התייצב (החלפת-גופן במצב "גופן קריא")
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(runMidwordFix);
        }
    }

    /* ── הגדלת טקסט ──────────────────────────────────────────────────────────
       ⚠️ למה שינוי font-size של <html> לא מספיק כאן:
       האתר מגדיר גדלי-גופן ב-px (body 17px, מילות-שיר 30px, אקורד 25.5px),
       לא ב-rem. הגדלת שורש ה-HTML משפיעה רק על rem/em — נמדד בפועל בחי
       שאפס טקסט גדל (html 16px→25.6px, וכל השאר ללא שינוי).
       לכן: סורקים את האלמנטים שיש להם טקסט ישיר, שומרים פעם אחת את גודל
       הבסיס ב-data-ucfs, ומחילים px מוחלט מוכפל. עובד גם על px וגם על rem.
       !important נדרש כי חלק מכללי התבנית עצמם !important. */
    var FS_ATTR = 'data-ucfs';
    var FS_SKIP = /^(SCRIPT|STYLE|NOSCRIPT|SVG|PATH|BR|HR|IMG|VIDEO|AUDIO|CANVAS|IFRAME|OBJECT)$/;

    function textElements() {
        if (!document.body) { return []; }
        var out = [], all = document.body.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (FS_SKIP.test(el.tagName)) { continue; }
            if (el.closest && el.closest('#uc-a11y-panel, #uc-a11y-toggle')) { continue; }
            for (var j = 0; j < el.childNodes.length; j++) {
                var n = el.childNodes[j];
                if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) { out.push(el); break; }
            }
        }
        return out;
    }

    function applyFontScale(scale) {
        /* ניקוי: עובדים ישירות על מי שמסומן, ולא על סריקת-הטקסט. אלמנט
           שהטקסט שלו הוחלף אחרי ההגדלה (טרנספוזיציה, גרסה קלה) כבר לא
           נספר ב-textElements, והיה נשאר תקוע בגודל מוגדל אחרי איפוס. */
        if (scale === 1) {
            var marked = document.querySelectorAll('[' + FS_ATTR + ']');
            for (var m = 0; m < marked.length; m++) {
                marked[m].style.removeProperty('font-size');
                marked[m].removeAttribute(FS_ATTR);
            }
            return;
        }
        var els = textElements();
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (!el.hasAttribute(FS_ATTR)) {
                el.setAttribute(FS_ATTR, parseFloat(getComputedStyle(el).fontSize) || 0);
            }
            var base = parseFloat(el.getAttribute(FS_ATTR));
            if (!base) { continue; }
            el.style.setProperty('font-size', (base * scale).toFixed(2) + 'px', 'important');
        }
    }

    /* תוכן שנוצר אחרי ההגדלה (רינדור-מחדש בטרנספוזיציה, גרסה קלה) מגיע
       בגודל המקורי. משקיפים על childList בלבד — שינויי style/attribute אינם
       נצפים, ולכן ההחלה עצמה לא מפעילה את המשקיף מחדש. */
    var fsTimer = null;
    function watchDom() {
        if (!window.MutationObserver || !document.body) { return; }
        new MutationObserver(function () {
            if (state.fontStep <= 0) { return; }
            clearTimeout(fsTimer);
            fsTimer = setTimeout(function () {
                applyFontScale(SCALES[state.fontStep] || 1);
                relayoutChords();
            }, 160);
        }).observe(document.body, { childList: true, subtree: true });
    }

    function apply(withRelayout) {
        var scale = SCALES[state.fontStep] || 1;
        if (state.fontStep > 0) {
            root.setAttribute('data-uc-a11y-font', '1');
            root.style.setProperty('--uc-a11y-scale', String(scale));
        } else {
            root.removeAttribute('data-uc-a11y-font');
            root.style.removeProperty('--uc-a11y-scale');
        }
        applyFontScale(scale);

        Object.keys(TOGGLES).forEach(function (key) {
            root.classList.toggle(TOGGLES[key], !!state[key]);
        });

        if (state.pause) {
            document.querySelectorAll('video, audio').forEach(function (m) {
                try { if (!m.paused) { m.pause(); } } catch (e) {}
            });
        }

        if (withRelayout) { relayoutChords(); }
    }

    function syncUI() {
        var pct = Math.round((SCALES[state.fontStep] || 1) * 100);
        var val = document.getElementById('uc-a11y-fontval');
        if (val) { val.textContent = pct + '%'; }

        var dec = document.getElementById('uc-a11y-font-dec');
        var inc = document.getElementById('uc-a11y-font-inc');
        if (dec) { dec.disabled = state.fontStep <= 0; }
        if (inc) { inc.disabled = state.fontStep >= SCALES.length - 1; }

        Object.keys(TOGGLES).forEach(function (key) {
            var btn = document.querySelector('[data-uc-a11y-toggle="' + key + '"]');
            if (btn) { btn.setAttribute('aria-pressed', state[key] ? 'true' : 'false'); }
        });
    }

    function announce(msg) {
        var live = document.getElementById('uc-a11y-live');
        if (live) { live.textContent = msg; }
    }

    function commit(relayout, msg) {
        apply(relayout);
        save();
        syncUI();
        if (msg) { announce(msg); }
    }

    // החלה מוקדמת — לפני DOMContentLoaded, כדי לצמצם הבהוב (FOUC).
    // בלי relayout: בשלב הזה עוד אין תוכן-שיר, והתוסף עצמו ירוץ אחרי הרינדור.
    apply(false);

    document.addEventListener('DOMContentLoaded', function () {
        var toggleBtn = document.getElementById('uc-a11y-toggle');
        var panel     = document.getElementById('uc-a11y-panel');
        var closeBtn  = document.getElementById('uc-a11y-close');
        if (!toggleBtn || !panel) { return; }

        function isOpen() { return panel.getAttribute('aria-hidden') === 'false'; }

        function openPanel() {
            panel.setAttribute('aria-hidden', 'false');
            toggleBtn.setAttribute('aria-expanded', 'true');
            var first = panel.querySelector('button:not([disabled])');
            if (first) { first.focus(); }
        }
        function closePanel(returnFocus) {
            panel.setAttribute('aria-hidden', 'true');
            toggleBtn.setAttribute('aria-expanded', 'false');
            if (returnFocus !== false) { toggleBtn.focus(); }
        }

        toggleBtn.addEventListener('click', function () {
            if (isOpen()) { closePanel(); } else { openPanel(); }
        });
        if (closeBtn) { closeBtn.addEventListener('click', function () { closePanel(); }); }

        // Esc סוגר
        document.addEventListener('keydown', function (e) {
            if ((e.key === 'Escape' || e.key === 'Esc') && isOpen()) { closePanel(); }
        });

        // קליק מחוץ לפאנל סוגר (בלי לגנוב פוקוס)
        document.addEventListener('click', function (e) {
            if (isOpen() && !panel.contains(e.target) && !toggleBtn.contains(e.target)) {
                closePanel(false);
            }
        });

        // מלכודת-פוקוס בסיסית: Tab לא בורח מהפאנל כשהוא פתוח
        panel.addEventListener('keydown', function (e) {
            if (e.key !== 'Tab' || !isOpen()) { return; }
            var f = [].slice.call(panel.querySelectorAll('button:not([disabled]), a[href]'));
            if (!f.length) { return; }
            var first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });

        // גודל טקסט — relayout=true (משנה מטריקות-טקסט)
        var dec = document.getElementById('uc-a11y-font-dec');
        var inc = document.getElementById('uc-a11y-font-inc');
        if (dec) {
            dec.addEventListener('click', function () {
                if (state.fontStep > 0) {
                    state.fontStep--;
                    commit(true, 'גודל טקסט ' + Math.round(SCALES[state.fontStep] * 100) + ' אחוז');
                }
            });
        }
        if (inc) {
            inc.addEventListener('click', function () {
                if (state.fontStep < SCALES.length - 1) {
                    state.fontStep++;
                    commit(true, 'גודל טקסט ' + Math.round(SCALES[state.fontStep] * 100) + ' אחוז');
                }
            });
        }

        // מתגים — רק "גופן קריא" משנה מטריקות-טקסט
        Object.keys(TOGGLES).forEach(function (key) {
            var btn = document.querySelector('[data-uc-a11y-toggle="' + key + '"]');
            if (!btn) { return; }
            btn.addEventListener('click', function () {
                state[key] = !state[key];
                var label = (btn.querySelector('.uc-a11y-btn__span') || {}).textContent || '';
                commit(key === 'readable', label.trim() + (state[key] ? ' — הופעל' : ' — כובה'));
            });
        });

        var reset = document.getElementById('uc-a11y-reset');
        if (reset) {
            reset.addEventListener('click', function () {
                state = defaults();
                commit(true, 'הגדרות הנגישות אופסו');
            });
        }

        syncUI();
        watchDom();
        /* ההחלה המוקדמת (apply(false) לפני DOMContentLoaded, למניעת FOUC) רצה
           כשעוד אין <body>, ולכן סריקת-הטקסט לא מצאה אלמנטים והגודל השמור
           לא הוחל בפועל. המתגים כן שרדו — הם קלאסים על <html>. מחילים כאן. */
        if (state.fontStep > 0) { applyFontScale(SCALES[state.fontStep] || 1); }
        // ריצה אחת אחרי שהעמוד מוכן — מסנכרנת פריסת-אקורדים עם הגדרה שנטענה מ-storage
        if (state.fontStep > 0 || state.readable) { relayoutChords(); }
    });
})();
