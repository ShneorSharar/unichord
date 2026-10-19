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

    // page=1: חיפוש חדש מהטופס. page>1: "הצג עוד" — אותה שאילתה שנשמרה, נוספת לסוף הרשימה.
    function doSearch(form, page) {
        page = page || 1;
        const append = page > 1;
        // מציאת קונטיינר התוצאות שנמצא בדיוק אחרי הטופס הספציפי
        const wrapper = form.closest('.achord-search-wrapper') || form.closest('.ams-simple-search-wrapper');
        const resultsContainer = wrapper ? wrapper.querySelector('.achord-search-results-grid') : null;
        const metaContainer = wrapper ? wrapper.querySelector('.achord-search-meta') : null;

        if (!resultsContainer) return;

        // אם הכל ריק — נקה תוצאות
        if (!append && isFormEmpty(form)) {
            if (form._achordSearchAbort) form._achordSearchAbort.abort();
            form._achordLastKey = null;
            resultsContainer.innerHTML = '';
            if (metaContainer) metaContainer.innerHTML = '';
            return;
        }

        // אותו חיפוש בדיוק כבר רץ/הוצג — לא מריצים שוב. (blur מהשדה בלחיצה על "הצג עוד"
        // יורה change, ובלי זה היה מתחיל חיפוש-מחדש שדורס את הטעינה הנוספת.)
        let formFd = null;
        if (!append) {
            formFd = new FormData(form);
            const key = JSON.stringify(Array.from(formFd.entries()));
            if (key === form._achordLastKey) return;
            form._achordLastKey = key;
        }

        const moreBtn = resultsContainer.querySelector('.achord-search-more');
        if (append) {
            if (!form._achordLastParams) return;
            if (moreBtn) { moreBtn.disabled = true; moreBtn.textContent = 'טוען...'; }
        } else {
            // חיפוש חדש — הכפתור של הרשימה הקודמת כבר לא רלוונטי
            if (moreBtn) moreBtn.remove();
            if (metaContainer) metaContainer.innerHTML = '<span class="achord-search-loading">מחפש שירים...</span>';
        }

        // ביטול בקשת חיפוש קודמת שעדיין בתהליך — מונע מצב שבו תגובה ישנה דורסת חדשה (race condition)
        if (form._achordSearchAbort) form._achordSearchAbort.abort();
        const abortController = new AbortController();
        form._achordSearchAbort = abortController;

        let fd;
        if (append) {
            fd = new FormData();
            form._achordLastParams.forEach(([k, v]) => fd.append(k, v));
        } else {
            fd = formFd;
            fd.append('action', 'achord_search_songs');
            fd.append('nonce', (window.ams_ajax_data && window.ams_ajax_data.search_nonce) || '');
            form._achordLastParams = Array.from(fd.entries());
        }
        fd.set('page', String(page));

        const onMore = () => doSearch(form, page + 1);
        // עמוד 1 נפל לתוצאות-קרובות — "הצג עוד" ממשיך באותו מצב
        const rememberPartial = (data) => {
            if (!append && data && data.partial && form._achordLastParams) form._achordLastParams.push(['any', '1']);
        };

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
                    rememberPartial(json.data);
                    renderResults(json.data, resultsContainer, metaContainer, (fd.get('query') || '').toString(), append, onMore);
                } else if (append) {
                    if (moreBtn) { moreBtn.disabled = false; moreBtn.textContent = 'שגיאה בטעינה. נסו שוב'; }
                } else {
                    form._achordLastKey = null; // לאפשר ניסיון חוזר עם אותה שאילתה
                    resultsContainer.innerHTML = '<p class="achord-search-no-results">שגיאה בחיפוש. נסו שנית.</p>';
                    if (metaContainer) metaContainer.innerHTML = '';
                }
            })
            .catch(err => {
                if (err.name === 'AbortError') return; // בקשה בוטלה במכוון לטובת חיפוש חדש — להתעלם
                console.error('Search error:', err);
                if (append) {
                    if (moreBtn) { moreBtn.disabled = false; moreBtn.textContent = 'שגיאת רשת. נסו שוב'; }
                    return;
                }
                form._achordLastKey = null;
                resultsContainer.innerHTML = '<p class="achord-search-no-results">שגיאת רשת. אנא בדקו את החיבור לאינטרנט.</p>';
                if (metaContainer) metaContainer.innerHTML = '';
            });
    }

    // כרטיס-אמן שמשתלב בתוך רשימת השירים (לא בראש) — מיקומו לפי חוזק ההתאמה:
    // שם מלא → אחרי 2 שירים; תחילת שם/שם בתוך השאילתה → אחרי 3; התאמה חלקית → אחרי 5.
    function artistSlot(tier) {
        return tier >= 3 ? 2 : (tier === 2 ? 3 : 5);
    }

    function renderArtistItem(artist, icon, writerIcon) {
        const countLabel = artist.count === 1 ? 'שיר אחד' : `${artist.count} שירים`;
        return `<li class="achord-search-result-item achord-search-artist-item"><a href="${escHtml(artist.url)}" class="result-link">
                <span class="artist-avatar">${(artist.kind === 'writer' ? writerIcon : icon) || ''}</span>
                <span class="artist-text">
                    <span class="artist-kicker">${artist.kind === 'writer' ? 'יוצר' : 'אמן'} · ${escHtml(countLabel)}</span>
                    <span class="result-title">${escHtml(artist.name)}</span>
                </span>
                <span class="artist-cta">לכל השירים ←</span>
            </a></li>`;
    }

    function renderSongItem(song) {
        // שורה אחת "שם שיר – שם אמן" (line נבנה בשרת), בלי תווית-אמן נפרדת
        const text = song.line || song.display_title || song.title || '';
        return `<li class="achord-search-result-item"><a href="${escHtml(song.url)}" class="result-link">
                <span class="result-title">${escHtml(text)}</span>
            </a></li>`;
    }

    // כפתור "הצג עוד" — מוצג כל עוד יש עמוד נוסף בשרת
    function syncMoreButton(data, container, onMore) {
        const old = container.querySelector('.achord-search-more');
        if (old) old.remove();
        if (!data.has_more) return;
        const shown = container.querySelectorAll('.achord-search-result-item:not(.achord-search-artist-item)').length;
        const left = Math.max(0, (data.count || 0) - shown);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'achord-search-more';
        btn.textContent = left ? `הצג עוד שירים (${left})` : 'הצג עוד שירים';
        btn.addEventListener('click', onMore);
        container.appendChild(btn);
    }

    function renderResults(data, container, metaContainer, query, append, onMore) {
        const artists = Array.isArray(data.artists) ? data.artists : [];
        const results = Array.isArray(data.results) ? data.results : [];

        if (append) {
            const list = container.querySelector('.achord-search-results-list');
            if (list) list.insertAdjacentHTML('beforeend', results.map(renderSongItem).join(''));
            syncMoreButton(data, container, onMore);
            return;
        }

        if (results.length === 0 && artists.length) {
            container.innerHTML = '<ul class="achord-search-results-list" style="list-style:none;padding:0;margin:0;">' +
                artists.map(a => renderArtistItem(a, data.artist_icon, data.writer_icon)).join('') + '</ul>';
            if (metaContainer) metaContainer.innerHTML = '';
            return;
        }

        if (results.length === 0) {
            var reqUrl = (window.ams_ajax_data && window.ams_ajax_data.requests_url) || '/requests/';
            var href = reqUrl + (reqUrl.indexOf('?') > -1 ? '&' : '?') + 'q=' + encodeURIComponent(query || '');
            container.innerHTML =
                '<p class="achord-search-no-results">לא נמצאו שירים תואמים לחיפוש.</p>' +
                '<a class="achord-search-request-cta" href="' + href + '">לא מצאתם? בקשו שאוסיף את השיר ←</a>';
            if (metaContainer) metaContainer.innerHTML = '';
            return;
        }

        if (metaContainer) {
            const n = data.count;
            metaContainer.innerHTML = data.partial
                ? `<span class="achord-search-count achord-search-partial">לא נמצא שיר עם כל המילים · ${n === 1 ? 'תוצאה קרובה אחת' : `${n} תוצאות קרובות`}</span>`
                : `<span class="achord-search-count">${n === 1 ? 'נמצא שיר אחד' : `נמצאו ${n} שירים`}</span>`;
        }

        const items = results.map(renderSongItem);

        if (artists.length) {
            const slot = Math.min(artistSlot(artists[0].tier), items.length);
            items.splice(slot, 0, artists.map(a => renderArtistItem(a, data.artist_icon, data.writer_icon)).join(''));
        }

        container.innerHTML = `<ul class="achord-search-results-list" style="list-style:none;padding:0;margin:0;">` + items.join('') + '</ul>';
        syncMoreButton(data, container, onMore);
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
                    form._achordLastKey = null;
                    if (form._achordSearchAbort) form._achordSearchAbort.abort();
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
