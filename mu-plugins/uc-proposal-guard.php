<?php
/**
 * Plugin Name: unichord Proposal Guard
 * Description: שלוש רשתות ביטחון לעורכים בלבד סביב אישור הצעות עריכה: (1) חסימת החזרת מילים לשיר שהמילים שלו הוסרו בגלל זכויות יוצרים, (2) התראה שהשיר השתנה מאז שההצעה נשלחה, (3) הערה שהגרסה הקלה לא תתעדכן מיד (ראו uc-easy-queue.php).
 * Version: 1.0.0
 * Author: unichord
 *
 * עקרונות
 * -------
 * 1. לא משנה כלום אצל משתמש רגיל: אין פלט ציבורי, ואין השפעה על שליחת הצעה.
 * 2. כל קוד עטוף ב-try/catch (Throwable). תקלה אצלנו לא חוסמת שליחה או אישור
 *    (חוץ מהחסימה המכוונת של שיר מוגן).
 * 3. לא נוגע בקבצי התוסף או התמה. מתחבר ל-hooks בלבד.
 *
 * הגדרות
 * ------
 *  - "מילות שיר" = רצפי אותיות עבריות אחרי הסרת כל מה שבסוגריים מרובעים
 *    (אקורדים ותגיות). כך שינוי אקורדים בלבד לא נחשב שינוי מילים.
 *  - שיר מוגן = יש לו מטא _uc_orig_content (המילים הוסרו בגלל זכויות יוצרים).
 *  - הצעה "מחזירה מילים" לשיר מוגן = יש בה מילה עברית (לפי ספירה) שאין בגרסה הרשמית הנוכחית.
 *
 * מה זה עושה
 * ----------
 *  1. wp_ajax_achord_approve_proposal בעדיפות 1 (לפני המטפל של התוסף, עדיפות 10):
 *     אם העורך מנסה לאשר הצעה שמחזירה מילים לשיר מוגן, מחזירים wp_send_json_error
 *     עם הודעה (מחרוזת, כמו שהמטפל של התוסף עושה ושהג'אוסקריפט של העמוד מציג).
 *     בנוסף מוצגת אזהרה אדומה בעמוד /review-proposals/.
 *  2. save_post_achord_edit_proposal: שומר מטא _uc_base_hash = md5 של גוף [version=normal]
 *     של השיר ברגע השליחה. בעמוד הסקירה, אם הגוף הנוכחי שונה: אזהרה כתומה.
 *     הצעות ישנות בלי המטא: אין הצגה.
 *  3. אם ההצעה משנה מילים ובשיר יש גרסה קלה לא ריקה: הערה כתומה בעמוד הסקירה.
 *
 * איך מבטלים: מוחקים את הקובץ. המטא _uc_base_hash שנשמר לא מזיק.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const UC_PG_BASE_META = '_uc_base_hash';
const UC_PG_ORIG_META = '_uc_orig_content';
const UC_PG_MSG_ACUM  = 'שיר שהמילים שלו הוסרו בגלל זכויות יוצרים — אסור להחזיר מילים';
const UC_PG_MSG_STALE = 'השיר השתנה מאז שההצעה נשלחה — אישור ידרוס את השינויים';
const UC_PG_MSG_EASY  = 'הגרסה הקלה לא מתעדכנת מיד. אחרי האישור השיר נכנס לרשימה, והגרסה הקלה תיווצר מחדש בסבב הבא של המנוע';

/* -------------------------------------------------------------------------
 * פונקציות עזר
 * ---------------------------------------------------------------------- */

/** גוף [version=normal] של תוכן שיר, או null אם אין. */
function uc_pg_normal_body( $content ) {
	if ( is_string( $content ) && preg_match( '/\[version=normal\](.*?)\[\/version\]/s', $content, $m ) ) {
		return trim( $m[1] );
	}
	return null;
}

/** טקסט מנורמל להשוואה: \r\n מול \n ורווחים בקצוות שורה לא נחשבים שינוי. */
function uc_pg_lines_key( $text ) {
	$lines = explode( "\n", str_replace( array( "\r\n", "\r" ), "\n", (string) $text ) );
	$lines = array_map(
		static function ( $l ) {
			return trim( preg_replace( '/\s+/u', ' ', $l ) );
		},
		$lines
	);
	return trim( implode( "\n", $lines ) );
}

/** האם יש גרסה קלה לא ריקה בתוכן שיר. */
function uc_pg_has_easy( $content ) {
	return is_string( $content )
		&& preg_match( '/\[version=easy\](.*?)\[\/version\]/s', $content, $m )
		&& '' !== trim( $m[1] );
}

/** רשימת המילים העבריות (בלי אקורדים/תגיות). */
function uc_pg_words( $text ) {
	$text = is_string( $text ) ? $text : '';
	$text = preg_replace( '/\[[^\]]*\]/u', ' ', $text );
	if ( ! is_string( $text ) ) {
		return array();
	}
	if ( preg_match_all( '/[\x{05D0}-\x{05EA}]+/u', $text, $m ) ) {
		return $m[0];
	}
	return array();
}

/** האם מילות ההצעה שונות מהנוכחי (סדר ותוכן). */
function uc_pg_lyrics_changed( $proposal_text, $current_text ) {
	return uc_pg_words( $proposal_text ) !== uc_pg_words( $current_text );
}

/** מילים שיש בהצעה ואין בנוכחי (לפי ספירה). */
function uc_pg_added_words( $proposal_text, $current_text ) {
	$have  = array_count_values( uc_pg_words( $current_text ) );
	$added = array();
	foreach ( uc_pg_words( $proposal_text ) as $w ) {
		if ( ! empty( $have[ $w ] ) ) {
			--$have[ $w ];
		} else {
			$added[] = $w;
		}
	}
	return $added;
}

function uc_pg_is_protected_song( $song_id ) {
	return $song_id > 0 && metadata_exists( 'post', $song_id, UC_PG_ORIG_META );
}

/**
 * מחשב את כל הדגלים להצעה אחת.
 *
 * @param WP_Post $proposal
 * @return array{acum:bool,stale:bool,easy:bool}
 */
function uc_pg_evaluate( $proposal ) {
	$out  = array( 'acum' => false, 'stale' => false, 'easy' => false );
	$song = $proposal->post_parent ? get_post( (int) $proposal->post_parent ) : null;
	if ( ! $song || 'achord_song_cpt' !== $song->post_type ) {
		return $out;
	}
	$current  = uc_pg_normal_body( $song->post_content );
	$proposed = trim( (string) $proposal->post_content );

	// 1. שיר מוגן שההצעה מחזירה לו מילים.
	if ( uc_pg_is_protected_song( $song->ID ) && null !== $current ) {
		$out['acum'] = (bool) uc_pg_added_words( $proposed, $current );
	}

	// 2. בסיס ישן. רק להצעות שיש להן מטא.
	$base = get_post_meta( $proposal->ID, UC_PG_BASE_META, true );
	if ( is_string( $base ) && '' !== $base && null !== $current ) {
		$out['stale'] = ( md5( $current ) !== $base );
	}

	// 3. הגרסה הקלה לא תתעדכן מיד (גם שינוי אקורדים בלבד משנה אותה).
	if ( null !== $current && uc_pg_has_easy( $song->post_content ) && uc_pg_lines_key( $proposed ) !== uc_pg_lines_key( $current ) ) {
		$out['easy'] = true;
	}
	return $out;
}

/* -------------------------------------------------------------------------
 * 2. שמירת גיבוב הבסיס בעת שליחה/עדכון הצעה ממתינה
 * ---------------------------------------------------------------------- */

add_action(
	'save_post_achord_edit_proposal',
	function ( $post_id, $post = null ) {
		try {
			if ( ! $post instanceof WP_Post ) {
				$post = get_post( $post_id );
			}
			if ( ! $post || wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
				return;
			}
			if ( 'pending' !== $post->post_status || ! $post->post_parent ) {
				return;
			}
			$song = get_post( (int) $post->post_parent );
			if ( ! $song || 'achord_song_cpt' !== $song->post_type ) {
				return;
			}
			$body = uc_pg_normal_body( $song->post_content );
			if ( null === $body ) {
				return;
			}
			update_post_meta( $post_id, UC_PG_BASE_META, md5( $body ) );
		} catch ( \Throwable $e ) {
			error_log( '[uc-proposal-guard] ' . $e->getMessage() );
		}
	},
	30,
	2
);

/* -------------------------------------------------------------------------
 * 1. חסימת אישור בצד השרת (לפני המטפל של התוסף, שרץ בעדיפות 10)
 * ---------------------------------------------------------------------- */

add_action(
	'wp_ajax_achord_approve_proposal',
	function () {
		$block = false;
		try {
			// רק עורכים. לכל אחד אחר המטפל של התוסף יחזיר "אין הרשאה" כרגיל.
			if ( ! current_user_can( 'edit_others_posts' ) ) {
				return;
			}
			$pid      = isset( $_POST['proposal_id'] ) ? (int) $_POST['proposal_id'] : 0; // phpcs:ignore WordPress.Security.NonceVerification
			$proposal = $pid ? get_post( $pid ) : null;
			if ( ! $proposal || 'achord_edit_proposal' !== $proposal->post_type || 'pending' !== $proposal->post_status ) {
				return;
			}
			$r     = uc_pg_evaluate( $proposal );
			$block = ! empty( $r['acum'] );
		} catch ( \Throwable $e ) {
			error_log( '[uc-proposal-guard] ' . $e->getMessage() );
			return; // תקלה שלנו לא חוסמת עבודה לגיטימית
		}
		if ( $block ) {
			// מחרוזת, כי הג'אוסקריפט של העמוד מציג data.data ישירות.
			wp_send_json_error( UC_PG_MSG_ACUM );
		}
	},
	1
);

/* -------------------------------------------------------------------------
 * אזהרות בעמוד /review-proposals/ (עורכים בלבד, סקריפט בתחתית העמוד)
 * ---------------------------------------------------------------------- */

add_action(
	'wp_footer',
	function () {
		try {
			if ( is_admin() || ! is_singular( 'page' ) || ! current_user_can( 'edit_others_posts' ) ) {
				return;
			}
			$page = get_queried_object();
			if ( ! $page || ! has_shortcode( (string) $page->post_content, 'achord_review_proposals' ) ) {
				return;
			}
			$props = get_posts(
				array(
					'post_type'      => 'achord_edit_proposal',
					'post_status'    => 'pending',
					'posts_per_page' => 100,
					'no_found_rows'  => true,
				)
			);
			$map = array();
			foreach ( $props as $p ) {
				try {
					$r = uc_pg_evaluate( $p );
				} catch ( \Throwable $e ) {
					error_log( '[uc-proposal-guard] ' . $e->getMessage() );
					continue;
				}
				$notes = array();
				if ( $r['acum'] ) {
					$notes[] = array( 'red', UC_PG_MSG_ACUM );
				}
				if ( $r['stale'] ) {
					$notes[] = array( 'amber', UC_PG_MSG_STALE );
				}
				if ( $r['easy'] ) {
					$notes[] = array( 'amber', UC_PG_MSG_EASY );
				}
				if ( $notes ) {
					$map[ (string) $p->ID ] = $notes;
				}
			}
			if ( ! $map ) {
				return;
			}
			$json = wp_json_encode( $map, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE );
			?>
<script>
(function(){try{
var map=<?php echo $json; // phpcs:ignore WordPress.Security.EscapeOutput ?>;
Object.keys(map).forEach(function(id){
  var li=document.querySelector('li.ams-review-item[data-proposal-id="'+id+'"]');
  if(!li||li.querySelector('.uc-pg-box'))return;
  var box=document.createElement('div');
  box.className='uc-pg-box';
  box.setAttribute('dir','rtl');
  map[id].forEach(function(n){
    var red=n[0]==='red';
    var d=document.createElement('div');
    d.className='uc-pg-note uc-pg-'+n[0];
    d.setAttribute('role',red?'alert':'status');
    d.style.cssText='margin:8px 0;padding:8px 12px;border-radius:8px;font-size:14px;line-height:1.5;font-weight:'+(red?'700':'600')+';border:1px solid '+(red?'#b32d2e':'#996800')+';background:'+(red?'#fcecec':'#fff7e0')+';color:'+(red?'#8a1f20':'#5c3d00');
    d.textContent=(red?'⛔ ':'⚠️ ')+n[1];
    box.appendChild(d);
  });
  var anchor=li.querySelector('.ams-diff-toolbar');
  if(anchor&&anchor.parentNode){anchor.parentNode.insertBefore(box,anchor);}else{li.insertBefore(box,li.firstChild);}
});
}catch(e){}})();
</script>
			<?php
		} catch ( \Throwable $e ) {
			error_log( '[uc-proposal-guard] ' . $e->getMessage() );
		}
	},
	99
);
