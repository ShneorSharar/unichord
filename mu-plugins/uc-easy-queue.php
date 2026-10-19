<?php
/**
 * Plugin Name: unichord Easy Queue
 * Description: רשימת שירים שהגרסה הרגילה שלהם השתנתה ולכן הגרסה הקלה שלהם צריכה להיווצר מחדש. הגרסה הקלה נוצרת במנוע פייתון מקומי, בסבבים מרוכזים, דרך פקודות wp uc easy-queue.
 * Version: 1.0.0
 * Author: unichord
 *
 * למה
 * ---
 * הגרסה הקלה נגזרת מהגרסה הרגילה במנוע פייתון שרץ אצל שניאור במחשב, לא בשרת.
 * כשמאשרים הצעת עריכה או עורכים שיר, הגרסה הקלה נשארת ישנה. הקובץ הזה זוכר
 * אילו שירים השתנו, ומאפשר פעם בכמה זמן לייצא את כולם, להריץ עליהם את המנוע
 * ולהעלות בחזרה רק את התוצאה.
 *
 * מה נכנס לרשימה
 * --------------
 *  - שיר קיים שגוף [version=normal] שלו השתנה (אישור הצעה, עריכה ישירה, עורך, wp-admin).
 *    השוואה מנורמלת: \r\n מול \n ורווחים בקצוות שורה לא נחשבים שינוי.
 *    אם באותה שמירה גם הגרסה הקלה השתנתה, מניחים שמישהו עדכן אותה ידנית ולא מוסיפים.
 *  - שיר חדש שיש לו גרסה רגילה ואין לו גרסה קלה.
 *  - שיר שנמחק (פח) יוצא מהרשימה.
 *
 * פקודות (wp uc easy-queue ...)
 * ---------------------------
 *  list                 מה ברשימה
 *  add <id>...          הוספה ידנית
 *  remove <id>...       הוצאה ידנית
 *  export <dir>         כותב song_page_<id>.txt (תוכן מלא, \n) + manifest.json עם md5 של התוכן
 *  import <dir> [--dry-run]
 *                       לכל שיר ב-manifest: אם התוכן בשרת לא השתנה מאז הייצוא, והגרסה
 *                       הרגילה בקובץ זהה לזו שבשרת, מחליף את התוכן בפלט המנוע, מעדכן
 *                       _ams_barre_status ומוציא מהרשימה. שיר שהשתנה בינתיים נשאר ברשימה לסבב הבא.
 *
 * הרשימה שמורה באופציה uc_easy_queue (בלי autoload): [ song_id => [ 't'=>time, 'src'=>..., 'by'=>user_id ] ].
 * איך מבטלים: מוחקים את הקובץ ואת האופציה (wp option delete uc_easy_queue).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const UC_EQ_OPTION = 'uc_easy_queue';
const UC_EQ_CPT    = 'achord_song_cpt';

/* -------------------------------------------------------------------------
 * פונקציות עזר
 * ---------------------------------------------------------------------- */

/** גוף של בלוק [version=X] מנורמל, או null אם אין בלוק. */
function uc_eq_block( $content, $version ) {
	if ( ! is_string( $content ) ) {
		return null;
	}
	if ( ! preg_match( '/\[version=' . preg_quote( $version, '/' ) . '\](.*?)\[\/version\]/s', $content, $m ) ) {
		return null;
	}
	$lines = explode( "\n", str_replace( array( "\r\n", "\r" ), "\n", $m[1] ) );
	$lines = array_map(
		static function ( $l ) {
			return trim( preg_replace( '/\s+/u', ' ', $l ) );
		},
		$lines
	);
	return trim( implode( "\n", $lines ) );
}

/** האם יש גרסה קלה עם תוכן אמיתי. */
function uc_eq_has_easy( $content ) {
	$easy = uc_eq_block( $content, 'easy' );
	return null !== $easy && '' !== $easy && false === strpos( $easy, 'אין גרסה קלה' );
}

function uc_eq_get() {
	$q = get_option( UC_EQ_OPTION, array() );
	return is_array( $q ) ? $q : array();
}

function uc_eq_save( $q ) {
	if ( false === get_option( UC_EQ_OPTION, false ) ) {
		add_option( UC_EQ_OPTION, $q, '', 'no' );
	} else {
		update_option( UC_EQ_OPTION, $q, false );
	}
}

function uc_eq_add( $song_id, $src ) {
	$q                      = uc_eq_get();
	$q[ (int) $song_id ] = array(
		't'   => time(),
		'src' => (string) $src,
		'by'  => (int) get_current_user_id(),
	);
	uc_eq_save( $q );
}

function uc_eq_remove( $ids ) {
	$q       = uc_eq_get();
	$removed = 0;
	foreach ( (array) $ids as $id ) {
		if ( isset( $q[ (int) $id ] ) ) {
			unset( $q[ (int) $id ] );
			$removed++;
		}
	}
	if ( $removed ) {
		uc_eq_save( $q );
	}
	return $removed;
}

/* -------------------------------------------------------------------------
 * מעקב אחרי שינויים
 * ---------------------------------------------------------------------- */

add_action(
	'wp_after_insert_post',
	function ( $post_id, $post, $update, $post_before ) {
		try {
			if ( ! empty( $GLOBALS['uc_eq_importing'] ) ) {
				return;
			}
			if ( ! $post instanceof WP_Post || UC_EQ_CPT !== $post->post_type ) {
				return;
			}
			if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
				return;
			}
			if ( 'trash' === $post->post_status ) {
				uc_eq_remove( array( $post_id ) );
				return;
			}
			if ( 'auto-draft' === $post->post_status ) {
				return;
			}
			$new = uc_eq_block( $post->post_content, 'normal' );
			if ( null === $new || '' === $new ) {
				return;
			}

			if ( ! $post_before instanceof WP_Post ) {
				// שיר חדש: רק אם אין לו גרסה קלה.
				if ( ! uc_eq_has_easy( $post->post_content ) ) {
					uc_eq_add( $post_id, 'new' );
				}
				return;
			}

			$old = uc_eq_block( $post_before->post_content, 'normal' );
			if ( $old === $new ) {
				return;
			}
			// גם הגרסה הקלה השתנתה באותה שמירה: מישהו עדכן אותה ידנית.
			if ( uc_eq_block( $post_before->post_content, 'easy' ) !== uc_eq_block( $post->post_content, 'easy' ) ) {
				return;
			}
			$src = doing_action( 'wp_ajax_achord_approve_proposal' ) ? 'proposal' : 'edit';
			uc_eq_add( $post_id, $src );
		} catch ( \Throwable $e ) {
			error_log( '[uc-easy-queue] ' . $e->getMessage() );
		}
	},
	20,
	4
);

/* -------------------------------------------------------------------------
 * שורה בעמוד /review-proposals/ (עורכים בלבד): כמה שירים מחכים לגרסה קלה
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
			$n = count( uc_eq_get() );
			if ( ! $n ) {
				return;
			}
			$text = 1 === $n
				? 'שיר אחד ממתין ליצירה מחדש של הגרסה הקלה (בסבב הבא של המנוע)'
				: $n . ' שירים ממתינים ליצירה מחדש של הגרסה הקלה (בסבב הבא של המנוע)';
			?>
<script>
(function(){try{
var h=document.querySelector('.ams-review-proposals .ams-mv-title');
if(!h||document.querySelector('.uc-eq-note'))return;
var d=document.createElement('p');
d.className='uc-eq-note';d.setAttribute('dir','rtl');
d.style.cssText='margin:6px 0 14px;font-size:14px;opacity:.8';
d.textContent=<?php echo wp_json_encode( '🔁 ' . $text, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG ); ?>;
h.parentNode.insertBefore(d,h.nextSibling);
}catch(e){}})();
</script>
			<?php
		} catch ( \Throwable $e ) {
			error_log( '[uc-easy-queue] ' . $e->getMessage() );
		}
	},
	100
);

/* -------------------------------------------------------------------------
 * WP-CLI
 * ---------------------------------------------------------------------- */

if ( defined( 'WP_CLI' ) && WP_CLI ) {

	class UC_Easy_Queue_CLI {

		/**
		 * מה ברשימה.
		 *
		 * @subcommand list
		 *
		 * [--format=<format>]
		 * : table|json|ids|count
		 * ---
		 * default: table
		 * ---
		 */
		public function list_( $args, $assoc ) {
			$q      = uc_eq_get();
			$format = isset( $assoc['format'] ) ? $assoc['format'] : 'table';
			if ( 'count' === $format ) {
				WP_CLI::line( (string) count( $q ) );
				return;
			}
			if ( 'ids' === $format ) {
				WP_CLI::line( implode( ' ', array_keys( $q ) ) );
				return;
			}
			$rows = array();
			foreach ( $q as $id => $e ) {
				$rows[] = array(
					'id'    => $id,
					'title' => get_the_title( $id ),
					'when'  => wp_date( 'Y-m-d H:i', (int) $e['t'] ),
					'src'   => $e['src'],
					'by'    => $e['by'],
				);
			}
			if ( ! $rows ) {
				WP_CLI::success( 'הרשימה ריקה.' );
				return;
			}
			WP_CLI\Utils\format_items( 'json' === $format ? 'json' : 'table', $rows, array( 'id', 'title', 'when', 'src', 'by' ) );
		}

		/**
		 * הוספה ידנית.
		 *
		 * <id>...
		 * : מזהי שירים
		 */
		public function add( $args ) {
			$n = 0;
			foreach ( $args as $id ) {
				$p = get_post( (int) $id );
				if ( ! $p || UC_EQ_CPT !== $p->post_type ) {
					WP_CLI::warning( "$id: לא שיר" );
					continue;
				}
				uc_eq_add( $p->ID, 'manual' );
				$n++;
			}
			WP_CLI::success( "נוספו $n" );
		}

		/**
		 * הוצאה ידנית.
		 *
		 * <id>...
		 * : מזהי שירים
		 */
		public function remove( $args ) {
			WP_CLI::success( 'הוצאו ' . uc_eq_remove( array_map( 'intval', $args ) ) );
		}

		/**
		 * ייצוא השירים שברשימה לתיקייה, לקלט של המנוע.
		 *
		 * <dir>
		 * : תיקיית יעד (תיווצר)
		 */
		public function export( $args ) {
			$dir = rtrim( $args[0], '/' );
			if ( ! is_dir( $dir ) && ! wp_mkdir_p( $dir ) ) {
				WP_CLI::error( "לא ניתן ליצור $dir" );
			}
			$manifest = array();
			$gone     = array();
			foreach ( uc_eq_get() as $id => $e ) {
				$p = get_post( (int) $id );
				if ( ! $p || UC_EQ_CPT !== $p->post_type || 'trash' === $p->post_status ) {
					$gone[] = $id;
					continue;
				}
				$content = str_replace( array( "\r\n", "\r" ), "\n", $p->post_content );
				file_put_contents( "$dir/song_page_$id.txt", $content );
				$manifest[ $id ] = array(
					'md5'    => md5( $p->post_content ),
					'title'  => get_the_title( $p ),
					'status' => $p->post_status,
				);
			}
			if ( $gone ) {
				uc_eq_remove( $gone );
				WP_CLI::warning( 'הוצאו מהרשימה (לא קיימים): ' . implode( ' ', $gone ) );
			}
			file_put_contents(
				"$dir/manifest.json",
				wp_json_encode(
					array(
						'exported' => time(),
						'songs'    => $manifest,
					),
					JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT
				)
			);
			WP_CLI::success( count( $manifest ) . " שירים יוצאו אל $dir" );
		}

		/**
		 * החזרת פלט המנוע לאתר.
		 *
		 * <dir>
		 * : תיקייה עם manifest.json וקבצי song_page_<id>.txt מעובדים
		 *
		 * [--dry-run]
		 * : רק לדווח, בלי לשמור
		 */
		public function import( $args, $assoc ) {
			$dir = rtrim( $args[0], '/' );
			$dry = ! empty( $assoc['dry-run'] );
			$man = json_decode( (string) @file_get_contents( "$dir/manifest.json" ), true );
			if ( ! is_array( $man ) || empty( $man['songs'] ) ) {
				WP_CLI::error( "אין manifest.json תקין ב-$dir" );
			}
			$valid = array( 'barre_free', 'one_f', 'one_bm', 'few_semi', 'has_barre', 'medium_only', 'none' );
			$stats = array( 'updated' => 0, 'same' => 0, 'skipped' => 0 );
			$done  = array();

			foreach ( $man['songs'] as $id => $info ) {
				$id   = (int) $id;
				$p    = get_post( $id );
				$file = "$dir/song_page_$id.txt";
				$why  = '';
				if ( ! $p || UC_EQ_CPT !== $p->post_type ) {
					$why = 'השיר לא קיים';
				} elseif ( md5( $p->post_content ) !== $info['md5'] ) {
					$why = 'השיר השתנה מאז הייצוא, נשאר לסבב הבא';
				} elseif ( ! is_readable( $file ) ) {
					$why = 'אין קובץ פלט';
				}
				if ( '' === $why ) {
					$new = str_replace( array( "\r\n", "\r" ), "\n", (string) file_get_contents( $file ) );
					if ( false === strpos( $new, '[achord_song]' ) || false === strpos( $new, '[/achord_song]' ) ) {
						$why = 'פלט לא תקין (חסר [achord_song])';
					} elseif ( uc_eq_block( $new, 'normal' ) !== uc_eq_block( $p->post_content, 'normal' ) ) {
						$why = 'בפלט הגרסה הרגילה שונה מזו שבאתר. לא נוגעים';
					}
				}
				if ( '' !== $why ) {
					WP_CLI::warning( "$id {$info['title']}: $why" );
					$stats['skipped']++;
					continue;
				}

				$old_norm = str_replace( array( "\r\n", "\r" ), "\n", $p->post_content );
				if ( trim( $new ) === trim( $old_norm ) ) {
					WP_CLI::line( "= $id {$info['title']}: אין שינוי" );
					$stats['same']++;
					$done[] = $id;
					continue;
				}

				$bs = '';
				if ( preg_match( '/\[barre_status\](.*?)\[\/barre_status\]/s', $new, $m ) ) {
					$bs = sanitize_key( trim( $m[1] ) );
				}
				$old_bs = get_post_meta( $id, '_ams_barre_status', true );
				WP_CLI::line( "✓ $id {$info['title']}" . ( $bs && $bs !== $old_bs ? " (בארה: $old_bs → $bs)" : '' ) );

				if ( $dry ) {
					$stats['updated']++;
					continue;
				}
				// המטא לפני השמירה, כי set_is_easy_on_save קורא אותו בזמן save_post.
				if ( $bs && in_array( $bs, $valid, true ) ) {
					update_post_meta( $id, '_ams_barre_status', $bs );
				}
				$GLOBALS['uc_eq_importing'] = true;
				$r                          = wp_update_post(
					array(
						'ID'           => $id,
						'post_content' => wp_slash( $new ),
					),
					true
				);
				$GLOBALS['uc_eq_importing'] = false;
				if ( is_wp_error( $r ) ) {
					WP_CLI::warning( "$id: " . $r->get_error_message() );
					$stats['skipped']++;
					continue;
				}
				$stats['updated']++;
				$done[] = $id;
			}

			if ( ! $dry && $done ) {
				uc_eq_remove( $done );
			}
			WP_CLI::success(
				( $dry ? '[ניסיון] ' : '' ) . "עודכנו {$stats['updated']} · ללא שינוי {$stats['same']} · דולגו {$stats['skipped']}"
			);
		}
	}

	WP_CLI::add_command(
		'uc easy-queue',
		'UC_Easy_Queue_CLI'
	);
}
