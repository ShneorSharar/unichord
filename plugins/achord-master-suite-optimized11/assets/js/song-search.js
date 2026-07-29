(function () {
    'use strict';

    function debounce(fn, delay) {
        let t;
        return function (...a) {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), delay);
        };
    }

    // בריחה מ-HTML למניעת XSS בהזרקת ערכים לתבנית התוצאות
    function escHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isFormEmpty(form) {
        const query = (form.querySelector('[name="query"]')?.value || '').trim();
        const singer = form.querySelector('[name="singer"]')?.value || '0';
        const genre = form.querySelector('[name="genre"]')?.value || '0';
        const contentType = form.querySelector('input[name="content_type"]:checked')?.value || '';

        let difficulty = '';
        const diffRadio = form.querySelector('input[name="difficulty"]:checked');
        const diffSelect = form.querySelector('select[name="difficulty"]');
        if (diffRadio) difficulty = diffRadio.value;
        else if (diffSelect) difficulty = diffSelect.value;

        return !query && singer === '0' && genre === '0' && !difficulty && !contentType;
    }

    function doSearch(form) {
        // מציאת קונטיינר התוצאות שנמצא בדיוק אחרי הטופס הספציפי
        const wrapper = form.closest('.achord-search-wrapper') || form.closest('.ams-simple-search-wrapper');
        const resultsContainer = wrapper ? wrapper.querySelector('.achord-search-results-grid') : null;
        const metaContainer = wrapper ? wrapper.querySelector('.achord-search-meta') : null;

        if (!resultsContainer) return;

        // אם הכל ריק — נקה תוצאות
        if (isFormEmpty(form)) {
            resultsContainer.innerHTML = '';
            if (metaContainer) metaContainer.innerHTML = '';
            return;
        }

        if (metaContainer) {
            metaContainer.innerHTML = '<span class="achord-search-loading">מחפש שירים...</span>';
        }

        // ביטול בקשת חיפוש קודמת שעדיין בתהליך — מונע מצב שבו תגובה ישנה דורסת חדשה (race condition)
        if (form._achordSearchAbort) form._achordSearchAbort.abort();
        const abortController = new AbortController();
        form._achordSearchAbort = abortController;

        const fd = new FormData(form);
        fd.append('action', 'achord_search_songs');
        fd.append('nonce', (window.ams_ajax_data && window.ams_ajax_data.search_nonce) || '');

        fetch((window.ams_ajax_data && window.ams_ajax_data.ajax_url) || '/wp-admin/admin-ajax.php', {
            method: 'POST',
            body: fd,
            signal: abortController.signal
        })
            .then(r => {
                if (!r.ok) throw new Error('Network error ' + r.status);
                return r.json();
            })
            .then(json => {
                if (json.success) {
                    renderResults(json.data, resultsContainer, metaContainer, (fd.get('query') || '').toString());
                } else {
                    resultsContainer.innerHTML = '<p class="achord-search-no-results">שגיאה בחיפוש. נסו שנית.</p>';
                    if (metaContainer) metaContainer.innerHTML = '';
                }
            })
            .catch(err => {
                if (err.name === 'AbortError') return; // בקשה בוטלה במכוון לטובת חיפוש חדש — להתעלם
                console.error('Search error:', err);
                resultsContainer.innerHTML = '<p class="achord-search-no-results">שגיאת רשת. אנא בדקו את החיבור לאינטרנט.</p>';
                if (metaContainer) metaContainer.innerHTML = '';
            });
    }

    function renderResults(data, container, metaContainer, query) {
        if (!data.results || data.results.length === 0) {
            var reqUrl = (window.ams_ajax_data && window.ams_ajax_data.requests_url) || '/requests/';
            var href = reqUrl + (reqUrl.indexOf('?') > -1 ? '&' : '?') + 'q=' + encodeURIComponent(query || '');
            container.innerHTML =
                '<p class="achord-search-no-results">לא נמצאו שירים תואמים לחיפוש.</p>' +
                '<a class="achord-search-request-cta" href="' + href + '">לא מצאתם? בקשו שאוסיף את השיר ←</a>';
            if (metaContainer) metaContainer.innerHTML = '';
            return;
        }

        if (metaContainer) {
            metaContainer.innerHTML = `<span class="achord-search-count">נמצאו ${data.count} שירים</span>`;
        }

        let html = `<ul class="achord-search-results-list" style="list-style:none;padding:0;margin:0;">`;
        data.results.forEach(song => {
            html += `<li class="achord-search-result-item"><a href="${escHtml(song.url)}" class="result-link">
                <span class="result-title">${escHtml(song.title)}</span>
                ${song.singer ? `<span class="result-singer">${escHtml(song.singer)}</span>` : ''}
            </a></li>`;
        });
        container.innerHTML = html + '</ul>';
    }

    // טוגל "מצב גרסה קלה" גלובלי — מדליק/מכבה cookie ומרענן את הדף כדי שהסינון
    // יחול בכל מקום (חיפוש, המלצות, ארכיב, ברירת-מחדל בשיר).
    function bindEasyModeToggles() {
        document.querySelectorAll('.ams-easy-toggle-input').forEach(function (toggle) {
            toggle.addEventListener('change', function () {
                if (toggle.checked) {
                    document.cookie = 'ams_easy_mode=1; path=/; max-age=' + (60 * 60 * 24 * 365);
                } else {
                    document.cookie = 'ams_easy_mode=; path=/; max-age=0';
                }
                window.location.reload();
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindEasyModeToggles();

        const forms = document.querySelectorAll('.achord-dynamic-search-form');
        if (!forms.length) return;

        forms.forEach(form => {
            const liveSearch = debounce(() => doSearch(form), 400);

            form.querySelectorAll('input, select').forEach(el => {
                // הטוגל הגלובלי מטופל בנפרד (cookie+reload) — לא טריגר חיפוש
                if (el.classList.contains('ams-easy-toggle-input')) return;
                el.addEventListener('input', liveSearch);
                el.addEventListener('change', () => doSearch(form));
            });

            form.addEventListener('submit', e => {
                e.preventDefault();
                doSearch(form);
            });

            // כפתור ניקוי בטופס המתקדם
            const resetBtn = form.querySelector('.achord-search-reset');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    form.reset();
                    const wrapper = form.closest('.achord-search-wrapper');
                    if (wrapper) {
                        const resultsContainer = wrapper.querySelector('.achord-search-results-grid');
                        const metaContainer = wrapper.querySelector('.achord-search-meta');
                        if (resultsContainer) resultsContainer.innerHTML = '';
                        if (metaContainer) metaContainer.innerHTML = '';
                    }
                });
            }

            // כפתור toggle לפאנל הסינון המתקדם
            const toggleBtn = form.querySelector('.ams-filter-toggle');
            const filterPanel = form.querySelector('.ams-filter-panel');
            if (toggleBtn && filterPanel) {
                toggleBtn.addEventListener('click', () => {
                    const isOpen = !filterPanel.hidden;
                    filterPanel.hidden = isOpen;
                    toggleBtn.setAttribute('aria-expanded', String(!isOpen));
                    toggleBtn.classList.toggle('ams-filter-toggle--active', !isOpen);
                });
            }
        });
    });
})();
