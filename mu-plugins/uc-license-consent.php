<?php
/**
 * Plugin Name: unichord License Consent
 * Description: הצהרת רישיון בטופס שליחת שיר, ורישום ההסכמה על השיר עצמו.
 * Version: 1.0.0
 * Author: unichord
 *
 * למה זה קיים
 * -----------
 * אישור אקו"ם מכסה את זכויות המלחין והמחבר. הוא לא מכסה את מה
 * שהתורם עצמו יצר: התמלול, מיקום האקורדים מעל ההברות, הגרסה הקלה.
 * העבודה הזו שייכת לו. בלי הסכמה כתובה, תורם יכול לדרוש הסרה של כל
 * מה שהעלה, ואי אפשר לפרסם את המאגר תחת רישיון חופשי כמתוכנן.
 *
 * הקובץ הזה מספק את הנוסח במקום אחד, כך שמה שנרשם בבסיס הנתונים
 * הוא בדיוק מה שהמשתמש ראה על המסך, ולא ניסוח שהתגלגל בינתיים.
 *
 * איך מבטלים: מוחקים את הקובץ. הטופס וה-handler בודקים function_exists
 * ונופלים לנוסח מוטבע, בלי שגיאה.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const UC_LICENSE_CONSENT_META = '_uc_license_consent';

/**
 * מזהה גרסת הנוסח. משנים אותו רק כשמשנים את הטקסט עצמו,
 * כדי שאפשר יהיה לדעת על מה בדיוק כל תורם הסכים.
 *
 * @return string
 */
function uc_license_consent_version() {
	return '2026-10-08';
}

/**
 * הנוסח שמוצג ליד כפתור השליחה ונשמר יחד עם ההסכמה.
 *
 * @return string
 */
function uc_license_consent_text() {
	return 'בשליחת השיר אני מאשר שהתמלול הוא עבודה שלי ולא הועתק מאתר אחר (אלא אם אני עצמי פרסמתי אותו שם), ומשחרר אותו לשימוש חופשי תחת הרישיון של האתר.';
}

/**
 * רושם את ההסכמה על השיר.
 *
 * @param int $post_id
 * @return void
 */
function uc_license_consent_record( $post_id ) {
	$user_id = get_current_user_id();

	update_post_meta(
		$post_id,
		UC_LICENSE_CONSENT_META,
		array(
			'version' => uc_license_consent_version(),
			'text'    => uc_license_consent_text(),
			'at'      => current_time( 'mysql' ),
			'user_id' => $user_id,
			'user'    => $user_id ? get_userdata( $user_id )->user_login : 'אורח',
		)
	);
}

/**
 * תיבה במסך עריכת השיר שמראה אם ההסכמה נרשמה, מתי, ועל איזה נוסח.
 * שירים שנוצרו לפני שהמנגנון הופעל פשוט לא יחזיקו רישום, וזה מוצג
 * במפורש במקום להיראות כאילו הכל תקין.
 */
add_action(
	'add_meta_boxes',
	function () {
		add_meta_box(
			'uc-license-consent',
			'הצהרת רישיון',
			'uc_render_license_consent_box',
			'achord_song_cpt',
			'side',
			'default'
		);
	}
);

/**
 * @param WP_Post $post
 * @return void
 */
function uc_render_license_consent_box( $post ) {
	$consent = get_post_meta( $post->ID, UC_LICENSE_CONSENT_META, true );

	if ( empty( $consent ) || ! is_array( $consent ) ) {
		echo '<p style="margin:0;color:#666;">לא נרשמה הסכמה. השיר הזה נוצר לפני שההצהרה נוספה לטופס, או שהוא נוצר בייבוא.</p>';
		return;
	}

	printf(
		'<p style="margin:0 0 6px;"><strong>נרשמה</strong> ב-%s על ידי %s</p><p style="margin:0 0 6px;color:#666;">נוסח %s</p><blockquote style="margin:0;padding:6px 10px;border-right:3px solid #ccc;color:#444;font-size:12px;">%s</blockquote>',
		esc_html( $consent['at'] ?? '' ),
		esc_html( $consent['user'] ?? '' ),
		esc_html( $consent['version'] ?? '' ),
		esc_html( $consent['text'] ?? '' )
	);
}

/* ---------------------------------------------------------------------
 * הצהרת רישיון על הצעות תיקון (סבב 5)
 * ------------------------------------------------------------------- */

const UC_PROPOSAL_LICENSE_META = '_uc_proposal_license';

/**
 * מזהה גרסת הנוסח של הצעת תיקון. משנים רק כשמשנים את הטקסט.
 *
 * @return string
 */
function uc_proposal_license_version() {
	return '2026-10-09';
}

/**
 * השורה שמוצגת ליד כפתור "הצע תיקון לכולם" ונשמרת על ההצעה.
 *
 * @return string
 */
function uc_proposal_license_text() {
	return 'שליחת התיקון משחררת אותו תחת הרישיון של האתר.';
}

/**
 * רושם על הצעה ממתינה את הנוסח שהמשתמש ראה בשליחה. נקרא בכל יצירה/עדכון
 * של הצעה ממתינה, ולכן הרישום תמיד משקף את השליחה האחרונה.
 *
 * @param int          $post_id
 * @param WP_Post|null $post
 * @return void
 */
function uc_proposal_license_record( $post_id, $post = null ) {
	try {
		if ( ! $post instanceof WP_Post ) {
			$post = get_post( $post_id );
		}
		if ( ! $post || wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}
		if ( 'achord_edit_proposal' !== $post->post_type || 'pending' !== $post->post_status ) {
			return;
		}
		$user_id = get_current_user_id();
		$user    = $user_id ? get_userdata( $user_id ) : false;

		update_post_meta(
			$post_id,
			UC_PROPOSAL_LICENSE_META,
			array(
				'text'    => uc_proposal_license_text(),
				'version' => uc_proposal_license_version(),
				'user'    => $user ? $user->user_login : 'אורח',
				'time'    => current_time( 'mysql' ),
			)
		);
	} catch ( \Throwable $e ) {
		// לא מפילים שליחה בגלל רישום. רק ביומן.
		error_log( '[uc-license-consent] ' . $e->getMessage() );
	}
}
add_action( 'save_post_achord_edit_proposal', 'uc_proposal_license_record', 25, 2 );
