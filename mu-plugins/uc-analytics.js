/*
 * UC Analytics — tracker קוקילס בצד-לקוח.
 * מזהה (uid) אקראי נשמר ב-localStorage בלבד. אין עוגיות, אין צד-שלישי, אין מידע אישי.
 * שולח אירועי-שימוש ל-endpoint הראשוני של האתר לצורך חישוב WRU.
 */
(function () {
	'use strict';
	var CFG = window.UC_A;
	if (!CFG || !CFG.endpoint) { return; }

	// --- סינון בוטים: דפדפן-אוטומטי / סורק לא נמדד בכלל ---
	var UA = navigator.userAgent || '';
	if (navigator.webdriver || /bot\b|bot\/|crawl|spider|slurp|google-inspectiontool|googleother|lighthouse|headless|phantomjs/i.test(UA)) { return; }

	// --- uid: מזהה-לקוח אקראי, יציב פר-דפדפן ---
	var uid = '';
	try {
		uid = localStorage.getItem('uc_uid') || '';
		if (!uid) {
			if (window.crypto && crypto.randomUUID) {
				uid = crypto.randomUUID().replace(/-/g, '');
			} else {
				uid = (Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi, '');
			}
			localStorage.setItem('uc_uid', uid);
		}
	} catch (e) {
		// מצב-פרטי / localStorage חסום → מזהה זמני לפגישה (לא נשמר)
		uid = 'x' + Math.random().toString(36).slice(2);
	}

	// --- ביקורי-בעלים: ?uc_own=1 מסמן את הדפדפן הזה (localStorage), ?uc_own=0 מבטל. מנהל מחובר מסומן אוטומטית ---
	var own = CFG.own ? 1 : 0;
	try {
		var qm = /[?&]uc_own=([01])/.exec(location.search);
		if (qm) { qm[1] === '1' ? localStorage.setItem('uc_own', '1') : localStorage.removeItem('uc_own'); }
		if (localStorage.getItem('uc_own') === '1') { own = 1; }
	} catch (e) {}

	// --- מקור-הגעה: קטגוריה בלבד (לא נשמרת כתובת). נקבע בכניסה הראשונה לפגישה ונשמר ב-sessionStorage ---
	function classifySource() {
		var ref = document.referrer || '';
		if (!ref) { return 'direct'; }
		var host = '';
		try { host = new URL(ref).hostname.toLowerCase(); } catch (e) { return 'other'; }
		if (host === location.hostname) { return 'internal'; }
		if (/(^|\.)google\./.test(host)) { return 'google'; }
		if (/(^|\.)(bing|duckduckgo|yahoo|yandex|ecosia|brave)\./.test(host)) { return 'search'; }
		if (/(^|\.)(facebook|fb|instagram|t|twitter|x|whatsapp|wa|youtube|tiktok|linkedin|reddit)\./.test(host + '.')) { return 'social'; }
		return 'other';
	}
	var src = '';
	try { src = sessionStorage.getItem('uc_src') || ''; } catch (e) {}
	if (!src) {
		src = classifySource();
		// ניווט פנימי בתוך אתר לפני שנקבע מקור (למשל רענון) נחשב internal ולא דורס
		try { sessionStorage.setItem('uc_src', src); } catch (e) {}
	}

	// --- סוג מכשיר לפי רוחב החלון בלבד ---
	var w = window.innerWidth || (screen && screen.width) || 1200;
	var dev = w < 768 ? 'mobile' : (w < 1100 ? 'tablet' : 'desktop');

	function send(ev) {
		var payload = { ev: ev, uid: uid, sid: CFG.sid || 0, src: src, dev: dev, own: own };
		var body = JSON.stringify(payload);
		try {
			if (navigator.sendBeacon) {
				navigator.sendBeacon(CFG.endpoint, new Blob([body], { type: 'application/json' }));
				return;
			}
		} catch (e) {}
		try {
			fetch(CFG.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: body,
				keepalive: true,
				credentials: 'omit'
			});
		} catch (e) {}
	}

	// --- צפייה בשיר: נספרת רק אחרי סימן-אנושי — אינטראקציה ראשונה (גלילה/מגע/מקש/לחיצה)
	//     או 15 שניות שבהן הדף גלוי. סורקים טוענים ועוזבים בלי זה. ---
	if (CFG.sid && CFG.sid > 0) {
		var viewed = false, visibleMs = 0, lastTick = Date.now();
		var HUMAN = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'];
		var countView = function () {
			if (viewed) { return; }
			viewed = true;
			for (var h = 0; h < HUMAN.length; h++) { window.removeEventListener(HUMAN[h], countView, true); }
			clearInterval(timer);
			send('song_view');
		};
		for (var h = 0; h < HUMAN.length; h++) {
			window.addEventListener(HUMAN[h], countView, { capture: true, passive: true });
		}
		var timer = setInterval(function () {
			var now = Date.now();
			if (document.visibilityState === 'visible') { visibleMs += now - lastTick; }
			lastTick = now;
			if (visibleMs >= 15000) { countView(); }
		}, 1000);
	}

	// --- אירועי-אינטראקציה דרך האזנה-מואצלת (לא נוגע ב-main.js) ---
	var MAP = [
		['#achord-transpose-up', 'transpose'],
		['#achord-transpose-down', 'transpose'],
		['#achord-toggle-version', 'easy_toggle'],
		['#achord-scroll-toggle', 'autoscroll'],
		['#achord-save-song', 'favorite'],
		['.ams-save-btn', 'favorite'],
		['#achord-lyrics-only-toggle', 'lyrics_only'],
		['#achord-print', 'print'],
		['#achord-share-song', 'share'],
		['#uc-save-offline', 'pwa_offline']
	];
	// מונע ספירה כפולה כשאלמנט תואם לשני סלקטורים (כמו favorite)
	document.addEventListener('click', function (e) {
		for (var i = 0; i < MAP.length; i++) {
			var el = e.target.closest ? e.target.closest(MAP[i][0]) : null;
			if (el) { send(MAP[i][1]); return; }
		}
	}, true);
})();
