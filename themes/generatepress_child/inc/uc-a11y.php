<?php
/**
 * unichord — רכיב נגישות: טעינת נכסים + פלט ה-markup.
 *
 * מודול עצמאי במכוון: השינוי היחיד הנדרש ב-functions.php הוא שורה אחת —
 *     require_once get_stylesheet_directory() . '/inc/uc-a11y.php';
 * (מצמצם קונפליקט בפריסה, כי functions.php המקומי מפגר אחרי החי.)
 *
 * ⚠️ הרכיב הזה הוא תוספת נוחות בלבד. החובה החוקית בישראל היא שהאתר *עצמו*
 *    יעמוד בת"י 5568 (WCAG 2.0 AA) — ווידג'ט אינו תחליף לתיקון ניגודיות/סמנטיקה.
 *
 * ══ הווידג'ט כבוי (29.7.2026, לבקשת המשתמש) ══════════════════════════════
 * הכפתור הצף והפאנל אינם נטענים ואינם מרונדרים. זו החלטה תקינה: התקן אינו
 * דורש ווידג'ט, אלא שהאתר יעמוד ב-AA ושתפורסם הצהרת נגישות — וההצהרה קיימת
 * וקושרה לתפריט הפוטר. גם לינק-הדילוג-לתוכן (WCAG 2.4.1) אינו תלוי בקובץ
 * הזה — GeneratePress מספק אותו ("לדלג לתוכן" → #content, אומת חי).
 *
 * להחזרה: להגדיר בקובץ wp-config.php או ב-functions.php, לפני טעינת הקובץ:
 *     define( 'UC_A11Y_WIDGET', true );
 * הקבצים assets/css/uc-a11y.css ו-assets/js/uc-a11y.js נשארו במקומם.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

if ( ! defined( 'UC_A11Y_WIDGET' ) ) {
	define( 'UC_A11Y_WIDGET', false );
}

/**
 * טעינת CSS/JS. ה-JS נטען ב-<head> ולא ב-footer, כדי שההעדפה השמורה
 * תוחל לפני הציור הראשון (מניעת הבהוב/FOUC).
 */
function uc_a11y_enqueue() {
	$dir = get_stylesheet_directory();
	$uri = get_stylesheet_directory_uri();

	$css = '/assets/css/uc-a11y.css';
	$js  = '/assets/js/uc-a11y.js';

	if ( file_exists( $dir . $css ) ) {
		wp_enqueue_style(
			'uc-a11y',
			$uri . $css,
			array( 'achord-child' ),           // חייב לרדת אחרי הטוקנים --uc-*
			filemtime( $dir . $css )
		);
	}
	if ( file_exists( $dir . $js ) ) {
		wp_enqueue_script(
			'uc-a11y',
			$uri . $js,
			array(),
			filemtime( $dir . $js ),
			false                               // false = ב-<head>, לא ב-footer
		);
	}
}
if ( UC_A11Y_WIDGET ) {
	add_action( 'wp_enqueue_scripts', 'uc_a11y_enqueue', 25 );
}

/**
 * מאתר את עמוד הצהרת הנגישות. מנסה כמה slugs נפוצים ונופל חזרה ל-null.
 */
function uc_a11y_statement_url() {
	$cached = wp_cache_get( 'uc_a11y_statement_url' );
	if ( false !== $cached ) {
		return $cached ? $cached : null;
	}

	$url   = null;
	$slugs = array( 'accessibility', 'הצהרת-נגישות', 'accessibility-statement', 'negishut' );
	foreach ( $slugs as $slug ) {
		$page = get_page_by_path( $slug );
		if ( $page instanceof WP_Post && 'publish' === $page->post_status ) {
			$url = get_permalink( $page );
			break;
		}
	}

	wp_cache_set( 'uc_a11y_statement_url', $url ? $url : '', '', HOUR_IN_SECONDS );
	return $url;
}

/**
 * אייקון SVG. aria-hidden — הטקסט הנלווה הוא מקור-האמת לקורא-מסך.
 */
function uc_a11y_icon( $name ) {
	$icons = array(
		// דמות נגישות (הסמל הבינלאומי המקובל לווידג'ט)
		'a11y'     => '<circle cx="12" cy="4" r="2"/><path d="M12 7c-2.5 0-4.5.6-6.2 1.2a1 1 0 1 0 .7 1.9c1-.4 2.2-.7 3.5-.9V13l-2.6 6.1a1 1 0 1 0 1.9.8L12 15l2.7 4.9a1 1 0 1 0 1.9-.8L14 13V9.2c1.3.2 2.5.5 3.5.9a1 1 0 1 0 .7-1.9C16.5 7.6 14.5 7 12 7z"/>',
		'contrast' => '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z"/>',
		'mono'     => '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5a7 7 0 0 0 0 14z" opacity=".45"/><path d="M12 5a7 7 0 0 1 0 14z" opacity=".9"/>',
		'links'    => '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
		'readable' => '<path d="M5 20 11 4h2l6 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 14h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
		'pause'    => '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
		'headings' => '<path d="M5 19V5m8 14V5M5 12h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M17 19v-7h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
		'cursor'   => '<path d="M5 3l14 8-5.5 1.5L11 18z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
	);
	$path = isset( $icons[ $name ] ) ? $icons[ $name ] : '';
	return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' . $path . '</svg>';
}

/**
 * פלט הכפתור + הפאנל ל-footer.
 */
function uc_a11y_render() {
	// לא באדמין / לא בעורך הבלוקים
	if ( is_admin() ) {
		return;
	}

	$toggles = array(
		'contrast' => 'ניגודיות גבוהה',
		'mono'     => 'מונוכרום',
		'links'    => 'הדגשת קישורים',
		'readable' => 'גופן קריא',
		'pause'    => 'ביטול אנימציות',
		'headings' => 'הדגשת כותרות',
		'cursor'   => 'סמן גדול',
	);
	$statement = uc_a11y_statement_url();
	?>
	<!-- ══ unichord · רכיב נגישות ══ -->
	<button id="uc-a11y-toggle" class="uc-a11y-toggle" type="button"
	        aria-label="תפריט נגישות" aria-controls="uc-a11y-panel" aria-expanded="false">
		<?php echo uc_a11y_icon( 'a11y' ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
	</button>

	<div id="uc-a11y-panel" class="uc-a11y-panel" role="dialog" aria-modal="false"
	     aria-labelledby="uc-a11y-panel-title" aria-hidden="true" dir="rtl">

		<div class="uc-a11y-panel__head">
			<h2 id="uc-a11y-panel-title" class="uc-a11y-panel__title">נגישות</h2>
			<button id="uc-a11y-close" class="uc-a11y-panel__close" type="button" aria-label="סגירת תפריט הנגישות">&times;</button>
		</div>

		<div class="uc-a11y-fontrow">
			<span class="uc-a11y-fontrow__label" id="uc-a11y-fontlabel">גודל טקסט</span>
			<div class="uc-a11y-fontrow__controls">
				<button id="uc-a11y-font-dec" class="uc-a11y-step" type="button" aria-label="הקטנת גודל הטקסט">&minus;</button>
				<span id="uc-a11y-fontval" class="uc-a11y-fontval">100%</span>
				<button id="uc-a11y-font-inc" class="uc-a11y-step" type="button" aria-label="הגדלת גודל הטקסט">+</button>
			</div>
		</div>

		<div class="uc-a11y-grid">
			<?php foreach ( $toggles as $key => $label ) : ?>
			<button class="uc-a11y-btn" type="button" data-uc-a11y-toggle="<?php echo esc_attr( $key ); ?>" aria-pressed="false">
				<?php echo uc_a11y_icon( $key ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
				<span class="uc-a11y-btn__span"><?php echo esc_html( $label ); ?></span>
			</button>
			<?php endforeach; ?>
		</div>

		<button id="uc-a11y-reset" class="uc-a11y-reset" type="button">איפוס הגדרות נגישות</button>

		<?php if ( $statement ) : ?>
			<a class="uc-a11y-panel__link" href="<?php echo esc_url( $statement ); ?>">להצהרת הנגישות המלאה</a>
		<?php endif; ?>

		<!-- הכרזה לקוראי-מסך על שינוי הגדרה -->
		<span id="uc-a11y-live" class="screen-reader-text" role="status" aria-live="polite"></span>
	</div>
	<?php
}
if ( UC_A11Y_WIDGET ) {
	add_action( 'wp_footer', 'uc_a11y_render', 5 );
}

/**
 * ההצהרה חייבת להיות **נגישה מכל עמוד**. כל עוד הווידג'ט היה חי, הקישור אליה
 * ישב בתוך הפאנל; אחרי כיבויו נשאר רק ה-URL הישיר — ולכן שורת-פוטר תמידית.
 *
 * נבדק חי לפני הבחירה: `.site-footer` **ריק לגמרי** (innerHTML=" "), ותפריט
 * "Footer" אינו משויך לשום מיקום תצוגה ⇒ `generate_credits`/פריט-תפריט לא היו
 * מוצגים. `wp_footer` הוא ההוק היחיד שמובטח לרוץ בכל עמוד בחזית.
 *
 * ⚠️ בעמוד שיר `.achord-bottom-controls-cluster` צף מעל ~130px התחתונים, לכן
 *    ריפוד תחתון מוגדל שם — אחרת הקישור מסתתר מאחוריו.
 */
function uc_a11y_footer_link() {
	if ( is_admin() ) {
		return;
	}
	$url = uc_a11y_statement_url();
	if ( ! $url ) {
		return;
	}
	$pad = is_singular( 'achord_song_cpt' ) ? '14px 16px 150px' : '14px 16px 20px';
	printf(
		'<p class="uc-a11y-footnote" style="text-align:center;margin:0;padding:%s;font-size:.85rem">'
			. '<a href="%s" style="color:var(--uc-gold-text)">הצהרת נגישות</a></p>',
		esc_attr( $pad ),
		esc_url( $url )
	);
}
add_action( 'wp_footer', 'uc_a11y_footer_link', 20 );
