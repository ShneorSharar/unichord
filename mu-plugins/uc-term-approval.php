<?php
/**
 * Plugin Name: unichord Term Approval
 * Description: שם זמר או ז'אנר חדש שנשלח עם שיר לא נוצר מיד כקטגוריה באתר, אלא מחכה לאישור. הוא הופך לקטגוריה אמיתית ברגע שמפרסמים את השיר.
 * Version: 1.0.0
 * Author: unichord
 *
 * הבעיה שזה פותר
 * ---------------
 * טופס שליחת השיר קרא ל-wp_set_object_terms עם שם חופשי שהמשתמש הקליד.
 * בטקסונומיה לא-היררכית הפונקציה הזו יוצרת טרם חדש אם השם לא קיים, בלי
 * שום בדיקת הרשאה. כלומר כל אורח שהקליד "יוסי כהן " עם רווח מיותר יצר
 * קטגוריה חדשה באתר — עוד לפני שמישהו הסתכל על השיר שלו.
 *
 * מה קורה עכשיו
 * -------------
 * שם שכבר קיים במאגר משויך מיד, בדיוק כמו קודם. אין שינוי בהתנהגות.
 * שם שלא קיים נשמר במטא של השיר כ"הצעה", ומופיע בתיבה במסך העריכה
 * וגם בעמודה ברשימת השירים. ברגע שהשיר עובר לפרסום, ההצעות שאושרו
 * הופכות לטרמים אמיתיים ומשויכות לשיר. אין מסך נוסף ואין צעד נוסף:
 * לחיצת "פרסם" היא האישור.
 *
 * איך מבטלים
 * ----------
 * מוחקים את הקובץ הזה. הפלאגין בודק function_exists ונופל בחזרה
 * להתנהגות המקורית. הצעות שנשמרו נשארות במטא ולא הולכות לאיבוד.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const UC_PROPOSED_TERMS_META = '_uc_proposed_terms';
const UC_TERM_POST_TYPE      = 'achord_song_cpt';

/**
 * מנקה שם לפני השוואה: רווחים בקצוות, רווחים כפולים באמצע, וגרשיים
 * שונים שנראים אותו דבר אבל הם תווים שונים.
 *
 * @param string $name
 * @return string
 */
function uc_normalize_term_name( $name ) {
	$name = wp_strip_all_tags( (string) $name );
	$name = str_replace( array( '״', '”', '“' ), '"', $name );
	$name = str_replace( array( '׳', '’', '‘' ), "'", $name );
	$name = preg_replace( '/\s+/u', ' ', $name );

	return trim( $name );
}

/**
 * משייך מיד שמות שכבר קיימים, ואוסף את החדשים לרשימת ההצעות.
 *
 * @param int      $post_id
 * @param string[] $names
 * @param string   $taxonomy
 * @param array    $proposed נצבר במקום, במבנה [ taxonomy => [ שמות ] ].
 * @return void
 */
function uc_assign_or_propose_terms( $post_id, $names, $taxonomy, &$proposed ) {
	$existing = array();

	foreach ( (array) $names as $raw ) {
		$name = uc_normalize_term_name( $raw );
		if ( '' === $name ) {
			continue;
		}

		$term = term_exists( $name, $taxonomy );

		if ( $term ) {
			$existing[] = $name;
			continue;
		}

		if ( ! isset( $proposed[ $taxonomy ] ) ) {
			$proposed[ $taxonomy ] = array();
		}
		if ( ! in_array( $name, $proposed[ $taxonomy ], true ) ) {
			$proposed[ $taxonomy ][] = $name;
		}
	}

	if ( $existing ) {
		wp_set_object_terms( $post_id, $existing, $taxonomy, true );
	}
}

/**
 * הופך הצעות שאושרו לטרמים אמיתיים. רץ כשהשיר מתפרסם.
 * אידמפוטנטי: מוחק את המטא בסוף, כך שקריאה כפולה לא מזיקה.
 *
 * @param int $post_id
 * @return void
 */
function uc_materialize_proposed_terms( $post_id ) {
	$proposed = get_post_meta( $post_id, UC_PROPOSED_TERMS_META, true );

	if ( empty( $proposed ) || ! is_array( $proposed ) ) {
		return;
	}

	// אם ההצעות הגיעו ממסך עריכה, מכבדים את התיבות שסומנו שם.
	$approved_from_form = null;
	if ( isset( $_POST['uc_terms_nonce'] ) && wp_verify_nonce( sanitize_key( wp_unslash( $_POST['uc_terms_nonce'] ) ), 'uc_terms_' . $post_id ) ) {
		$approved_from_form = isset( $_POST['uc_terms'] ) ? (array) wp_unslash( $_POST['uc_terms'] ) : array();
	}

	foreach ( $proposed as $taxonomy => $names ) {
		if ( ! taxonomy_exists( $taxonomy ) ) {
			continue;
		}

		$to_create = array();

		foreach ( (array) $names as $name ) {
			if ( null !== $approved_from_form ) {
				$key = $taxonomy . '|' . $name;
				if ( ! in_array( $key, $approved_from_form, true ) ) {
					continue; // בעל האתר הוריד את הסימון מהשם הזה.
				}
			}
			$to_create[] = $name;
		}

		if ( $to_create ) {
			wp_set_object_terms( $post_id, $to_create, $taxonomy, true );
		}
	}

	delete_post_meta( $post_id, UC_PROPOSED_TERMS_META );
}

/**
 * שני הוקים כי הם נורים בסדר שונה בהקשרים שונים:
 * transition_post_status תופס פרסום תכנותי, save_post תופס עריכה במסך.
 * הפונקציה אידמפוטנטית ולכן ירייה כפולה לא עושה נזק.
 */
add_action(
	'transition_post_status',
	function ( $new_status, $old_status, $post ) {
		if ( 'publish' === $new_status && UC_TERM_POST_TYPE === $post->post_type ) {
			uc_materialize_proposed_terms( $post->ID );
		}
	},
	10,
	3
);

add_action(
	'save_post_' . UC_TERM_POST_TYPE,
	function ( $post_id, $post ) {
		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}
		if ( 'publish' === $post->post_status ) {
			uc_materialize_proposed_terms( $post_id );
		}
	},
	20,
	2
);

/**
 * תיבה במסך עריכת השיר עם השמות שהוצעו. הכל מסומן כברירת מחדל,
 * כך שפרסום רגיל מאשר הכל בלחיצה אחת. הורדת סימון פוסלת שם.
 */
add_action(
	'add_meta_boxes',
	function () {
		add_meta_box(
			'uc-proposed-terms',
			'שמות חדשים שממתינים לאישור',
			'uc_render_proposed_terms_box',
			UC_TERM_POST_TYPE,
			'side',
			'high'
		);
	}
);

/**
 * @param WP_Post $post
 * @return void
 */
function uc_render_proposed_terms_box( $post ) {
	$proposed = get_post_meta( $post->ID, UC_PROPOSED_TERMS_META, true );

	if ( empty( $proposed ) || ! is_array( $proposed ) ) {
		echo '<p style="margin:0;color:#666;">אין שמות חדשים בשיר הזה. כל הזמרים והז\'אנרים שלו כבר קיימים במאגר.</p>';
		return;
	}

	wp_nonce_field( 'uc_terms_' . $post->ID, 'uc_terms_nonce' );

	echo '<p style="margin-top:0;">השולח הקליד שמות שעדיין לא קיימים באתר. הם ייווצרו כשתפרסם את השיר. הורד סימון כדי לא ליצור שם.</p>';

	$labels = array(
		'singer' => 'זמר / מבצע',
		'genre'  => "ז'אנר",
		'level'  => 'רמה',
	);

	foreach ( $proposed as $taxonomy => $names ) {
		$label = isset( $labels[ $taxonomy ] ) ? $labels[ $taxonomy ] : $taxonomy;
		echo '<p style="margin:10px 0 4px;font-weight:600;">' . esc_html( $label ) . '</p>';

		foreach ( (array) $names as $name ) {
			$key = $taxonomy . '|' . $name;
			printf(
				'<label style="display:block;margin:3px 0;"><input type="checkbox" name="uc_terms[]" value="%s" checked> %s</label>',
				esc_attr( $key ),
				esc_html( $name )
			);
		}
	}
}

/**
 * עמודה ברשימת השירים, כדי לראות אילו שירים מביאים איתם שם חדש
 * בלי לפתוח אותם אחד-אחד.
 */
add_filter(
	'manage_' . UC_TERM_POST_TYPE . '_posts_columns',
	function ( $columns ) {
		$columns['uc_proposed'] = 'שמות חדשים';
		return $columns;
	}
);

add_action(
	'manage_' . UC_TERM_POST_TYPE . '_posts_custom_column',
	function ( $column, $post_id ) {
		if ( 'uc_proposed' !== $column ) {
			return;
		}

		$proposed = get_post_meta( $post_id, UC_PROPOSED_TERMS_META, true );

		if ( empty( $proposed ) || ! is_array( $proposed ) ) {
			echo '—';
			return;
		}

		$flat = array();
		foreach ( $proposed as $names ) {
			foreach ( (array) $names as $name ) {
				$flat[] = $name;
			}
		}

		echo '<span style="color:#b26a00;font-weight:600;">' . esc_html( implode( ', ', $flat ) ) . '</span>';
	},
	10,
	2
);
