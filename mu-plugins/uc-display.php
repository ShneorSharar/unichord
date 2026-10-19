<?php
/*
 * Plugin Name: UC Display v2 (flag: admin | all)
 * Description: שכבת תצוגה חדשה לעמוד השיר: נתוני אקורדים מתוקנים, דיאגרמות גיטרה ופסנתר, פס אקורדים וחלון אקורד.
 *              קבצים ב-uc-display/, נטענים אחרי main.js ומתחברים דרך window.ucEngineHooks (שורה אחת ב-main.js).
 *              אפס עריכות בתמה. כבוי כשהאופציה uc_display_v2 לא קיימת.
 * Flag:        wp option update uc_display_v2 all     (לכולם; admin = מנהלים בלבד; כבוי = wp option delete uc_display_v2)
 *              ?ucdisp=1 → דלוק לבקשה הזו (תצוגה מקדימה, לכל מבקר) · ?ucdisp=0 → כבוי לבקשה הזו
 *              define('UC_DISPLAY_OFF', true) ב-wp-config גובר על הכל.
 * Remove:      rm wp-content/mu-plugins/uc-display.php  (התיקייה uc-display/ יכולה להישאר)
 * Version:     0.1.0 (round 1, 19.10.26)
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function uc_disp_dir() { return WPMU_PLUGIN_DIR . '/uc-display/'; }
function uc_disp_url() { return WPMU_PLUGIN_URL . '/uc-display/'; }

/** סדר הטעינה קובע את סדר ה-hooks: הליבה ראשונה. */
function uc_disp_files() {
	return array(
		'uc-chords-core'    => 'uc-chords-core.js',
		'uc-diagram-guitar' => 'uc-diagram-guitar.js',
		'uc-diagram-piano'  => 'uc-diagram-piano.js',
		'uc-page'           => 'uc-page.js',
	);
}

function uc_disp_gate() {
	if ( defined( 'UC_DISPLAY_OFF' ) && UC_DISPLAY_OFF ) { return false; }
	if ( is_admin() || wp_doing_ajax() ) { return false; }
	if ( ! file_exists( uc_disp_dir() . 'uc-chords-core.js' ) ) { return false; }
	if ( isset( $_GET['ucdisp'] ) ) {
		return (string) wp_unslash( $_GET['ucdisp'] ) === '1';
	}
	$mode = get_option( 'uc_display_v2', '' );
	if ( $mode === 'all' ) { return true; }
	if ( $mode === 'admin' ) { return is_user_logged_in() && current_user_can( 'manage_options' ); }
	return false;
}

/** wp_footer לפני הדפסת סקריפטי הפוטר (20): עד אז ברור אם main.js נטען בעמוד. */
add_action( 'wp_footer', function () {
	if ( ! wp_script_is( 'ams-main-script', 'enqueued' ) || ! uc_disp_gate() ) { return; }
	$prev = 'ams-main-script';
	foreach ( uc_disp_files() as $handle => $file ) {
		$path = uc_disp_dir() . $file;
		if ( ! file_exists( $path ) ) { continue; }
		wp_enqueue_script( $handle, uc_disp_url() . $file, array( $prev ), (string) filemtime( $path ),
			array( 'in_footer' => true, 'strategy' => 'defer' ) );
		$prev = $handle;
	}
	$css = uc_disp_dir() . 'uc-display.css';
	if ( file_exists( $css ) ) {
		wp_enqueue_style( 'uc-display', uc_disp_url() . 'uc-display.css', array(), (string) filemtime( $css ) );
	}
}, 1 );

/** סימון לבדיקות: class על ה-body כשהשכבה דלוקה. */
add_filter( 'body_class', function ( $c ) {
	if ( uc_disp_gate() ) { $c[] = 'uc-display-v2'; }
	return $c;
} );
