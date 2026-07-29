/**
 * song-request.js — שליחת טופס "בקש שיר חסר" ב-AJAX.
 * נתונים מ-achord_req_data (ajax_url, nonce) שמולקלים ב-shortcode.
 */
(function () {
    'use strict';

    function init() {
        var form = document.getElementById('achord-song-request-form');
        if (!form || form._achordReqBound) return;
        form._achordReqBound = true;

        var btn = form.querySelector('button[type="submit"]');
        var msg = form.querySelector('.uc-reqform__msg');

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!window.achord_req_data) return;

            var title = (form.querySelector('[name="song_title"]') || {}).value || '';
            if (title.trim().length < 2) {
                if (msg) { msg.textContent = 'כתבו את שם השיר.'; msg.className = 'uc-reqform__msg is-error'; }
                return;
            }

            if (btn) { btn.disabled = true; }
            if (msg) { msg.textContent = 'שולח...'; msg.className = 'uc-reqform__msg'; }

            var fd = new FormData(form);
            fd.append('action', 'achord_submit_song_request');
            fd.append('nonce', window.achord_req_data.nonce || '');

            fetch(window.achord_req_data.ajax_url, { method: 'POST', body: fd })
                .then(function (r) { return r.json(); })
                .then(function (json) {
                    if (json && json.success) {
                        if (msg) { msg.textContent = (json.data && json.data.message) || 'הבקשה נשלחה. תודה!'; msg.className = 'uc-reqform__msg is-ok'; }
                        form.reset();
                    } else {
                        if (msg) { msg.textContent = (json && json.data) || 'שגיאה. נסו שוב.'; msg.className = 'uc-reqform__msg is-error'; }
                    }
                })
                .catch(function () {
                    if (msg) { msg.textContent = 'שגיאת רשת. בדקו את החיבור ונסו שוב.'; msg.className = 'uc-reqform__msg is-error'; }
                })
                .finally(function () { if (btn) { btn.disabled = false; } });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
