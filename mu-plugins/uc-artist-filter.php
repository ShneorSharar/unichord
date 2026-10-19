<?php
/*
 * Plugin Name: UC Artist Filter
 * Description: תיבת סינון מעל רשימות "מבצעים" ו"יוצרים" בעמוד /chords/ ובעמוד הבית. כותבים "שו" והרשימה מצטמצמת
 *              לשמות שמילה בהם מתחילה ב"שו". צד לקוח בלבד, בלי שינוי בתוסף או בתמה.
 *              (הצעת ארנון, 19.10.26)
 * Remove:      rm wp-content/mu-plugins/uc-artist-filter.php
 * Version:     1.1.0
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'wp_footer', function () {
	if ( is_admin() || ! ( is_page( 'chords' ) || is_front_page() ) ) { return; }
	?>
<style id="uc-artist-filter-css">
.uc-af{position:relative;margin:4px 12px 12px}
.uc-af input{width:100%;box-sizing:border-box;font:inherit;font-size:17px;color:inherit;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.4);border-radius:10px;padding:10px 14px 10px 40px}
.uc-af input:focus{outline:2px solid #D8A86E;outline-offset:1px}
.uc-af-clear{position:absolute;left:6px;top:5px;width:32px;height:32px;border:0;background:none;color:inherit;font-size:22px;line-height:1;cursor:pointer;opacity:.7}
.uc-af-clear[hidden]{display:none}
.uc-af-msg{margin:6px 4px 0;font-size:14px;opacity:.75}
.uc-af-hide{display:none!important}
</style>
<script id="uc-artist-filter-js">
(function () {
	var FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
	function norm(s) {
		return String(s || '').toLowerCase()
			.replace(/[֑-ׇ]/g, '')
			.replace(/['"׳״`’]/g, '')
			.replace(/[ךםןףץ]/g, function (c) { return FINALS[c]; })
			.replace(/[-–־,.()]/g, ' ')
			.replace(/\s+/g, ' ').trim();
	}
	function matches(words, q) {
		return q.split(' ').every(function (p) {
			return words.some(function (w) {
				return w.indexOf(p) === 0 || (w.charAt(0) === 'ו' && w.length > 1 && w.indexOf(p, 1) === 1);
			});
		});
	}

	function setup(section, one, many, example) {
		var title = [].slice.call(document.querySelectorAll('h3.achord-accordion-section-title'))
			.filter(function (h) { return h.textContent.trim() === section; })[0];
		if (!title) return;
		var items = [];
		for (var n = title.nextElementSibling; n && !n.matches('h3.achord-accordion-section-title'); n = n.nextElementSibling) {
			if (n.classList.contains('achord-accordion-item')) items.push(n);
		}
		if (items.length < 8) return;
		items.forEach(function (it) {
			var h = it.querySelector('.achord-accordion-header span');
			it._ucWords = norm(h ? h.textContent : it.textContent).split(' ');
		});

		var box = document.createElement('div');
		box.className = 'uc-af';
		box.innerHTML = '<input type="search" inputmode="search" autocomplete="off" placeholder="חיפוש ' + one + ', למשל ' + example + '" aria-label="חיפוש ברשימת ה' + many + '">' +
			'<button type="button" class="uc-af-clear" aria-label="ניקוי החיפוש" hidden>&times;</button>' +
			'<div class="uc-af-msg" aria-live="polite"></div>';
		title.insertAdjacentElement('afterend', box);
		var input = box.querySelector('input'), clear = box.querySelector('.uc-af-clear'), msg = box.querySelector('.uc-af-msg');

		function run() {
			var q = norm(input.value);
			clear.hidden = !input.value;
			var shown = 0;
			items.forEach(function (it) {
				var ok = !q || matches(it._ucWords, q);
				it.classList.toggle('uc-af-hide', !ok);
				if (ok) shown++;
			});
			msg.textContent = !q ? '' : (shown ? (shown === 1 ? 'נמצא ' + one + ' אחד' : 'נמצאו ' + shown + ' ' + many) : 'לא נמצא ' + one + ' בשם הזה. אפשר לנסות בחיפוש הכללי למעלה');
		}
		input.addEventListener('input', run);
		input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') {
				e.preventDefault();
				var vis = items.filter(function (it) { return !it.classList.contains('uc-af-hide'); });
				if (vis.length === 1) { var h = vis[0].querySelector('.achord-accordion-header'); if (h) h.click(); }
			}
		});
		clear.addEventListener('click', function () { input.value = ''; run(); input.focus(); });
	}

	try { setup('מבצעים', 'מבצע', 'מבצעים', 'שו'); } catch (e) { try { console.error('uc-artist-filter', e); } catch (e2) {} }
	try { setup('יוצרים', 'יוצר', 'יוצרים', 'אלתרמן'); } catch (e) { try { console.error('uc-artist-filter', e); } catch (e2) {} }
})();
</script>
	<?php
}, 99 );
