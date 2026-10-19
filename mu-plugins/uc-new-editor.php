<?php
/*
 * Plugin Name: UC New Editor (flag: admins | all)
 * Description: מחבר את עורך-האקורדים החדש (נכסי uc-editor-lab/) לעמודים האמיתיים: /add-song/, עורך המחברת,
 *              וכפתור "ערוך" בעמוד השיר. מאחורי דגל. כבוי כשהאופציה uc_new_editor לא קיימת.
 *              אפס עריכות בתוסף ובתמה. אף פעם לא טוען את lab-guard.js.
 * Flag:        wp option update uc_new_editor all   (לכולם; admins = מנהלים בלבד; כבוי = wp option delete uc_new_editor)
 *              wp option update uc_new_editor_surfaces add,notebook,song   (ברירת-מחדל אם חסר)
 *              ?uc_old_editor=1 → העורך הישן לבקשה הזו · user meta uc_old_editor=1 → קבוע למנהל הזה
 *              define('UC_NEW_EDITOR_OFF', true) ב-wp-config גובר על הכל.
 * Remove:      rm wp-content/mu-plugins/uc-new-editor.php  (+ wp option delete uc_new_editor uc_new_editor_surfaces)
 *              הנכסים ב-uc-editor-lab/ משותפים עם המעבדה ונשארים.
 * Version:     0.2.0 (round 8: uc_new_editor=all, 10.10.26)
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** תיקיית הנכסים המשותפת עם המעבדה. */
function uc_ne_dir() { return WPMU_PLUGIN_DIR . '/uc-editor-lab/'; }
function uc_ne_url() { return WPMU_PLUGIN_URL . '/uc-editor-lab/'; }

/** הקבצים שחייבים להיות קיימים לכל משטח. lab-drag.* אופציונלי. חסר קובץ = המשטח כבוי (העורך הישן). */
function uc_ne_required_files( $surface ) {
	$base = array( 'lab.css', 'lab-core.js', 'lab-textmode.js', 'lab-textmode.css' );
	if ( $surface === 'song' ) {
		return array_merge( $base, array( 'lab-edit.js', 'lab-edit.css' ) );
	}
	return array_merge( $base, array( 'lab-add.js', 'lab-add.css', 'lab-copysig.js' ) );
}

function uc_ne_assets_ok( $surface ) {
	foreach ( uc_ne_required_files( $surface ) as $f ) {
		if ( ! file_exists( uc_ne_dir() . $f ) ) { return false; }
	}
	return true;
}

/** ?uc_old_editor=1 בבקשה הנוכחית. */
function uc_ne_old_param() {
	return isset( $_GET['uc_old_editor'] ) && (string) wp_unslash( $_GET['uc_old_editor'] ) === '1';
}

/**
 * השער. $honor_optout=false משמש רק לשאלה "האם היה דלוק אילולא ?uc_old_editor=1" (צ'יפ "לעורך החדש").
 */
function uc_ne_gate( $surface, $honor_optout = true ) {
	if ( defined( 'UC_NEW_EDITOR_OFF' ) && UC_NEW_EDITOR_OFF ) { return false; }
	$mode = get_option( 'uc_new_editor', '' );
	if ( $mode !== 'admins' && $mode !== 'all' ) { return false; }
	$list = array_map( 'trim', explode( ',', (string) get_option( 'uc_new_editor_surfaces', 'add,notebook,song' ) ) );
	if ( ! in_array( $surface, $list, true ) ) { return false; }
	if ( is_admin() || wp_doing_ajax() || ! is_user_logged_in() ) { return false; }
	if ( $mode === 'admins' && ! current_user_can( 'manage_options' ) ) { return false; }
	if ( $honor_optout ) {
		if ( uc_ne_old_param() ) { return false; }
		if ( (string) get_user_meta( get_current_user_id(), 'uc_old_editor', true ) === '1' ) { return false; }
	}
	if ( ! uc_ne_assets_ok( $surface ) ) { return false; }
	return true;
}

/** פונקציית-ההחלטה היחידה (map §6). $surface = 'add' | 'notebook' | 'song'. */
function uc_ne_on( $surface ) {
	return uc_ne_gate( $surface, true );
}

/**
 * שיר-משלי לעריכה במחברת — רק של המשתמש הנוכחי, בדיוק כמו Notebook_Handler::render_editor
 * (CPT achord_personal, author = אני, parent 0). אחרת null → העורך הישן ("השיר לא נמצא.").
 */
function uc_ne_notebook_data( $pid ) {
	$pid = absint( $pid );
	$uid = get_current_user_id();
	if ( ! $pid || ! $uid ) { return null; }
	$nb  = class_exists( 'AMS_Notebook_Handler' );
	$cpt = ( $nb && defined( 'AMS_Notebook_Handler::CPT' ) ) ? AMS_Notebook_Handler::CPT : 'achord_personal';
	$pm  = ( $nb && defined( 'AMS_Notebook_Handler::PERFORMER_META' ) ) ? AMS_Notebook_Handler::PERFORMER_META : '_ams_np_performer';
	$cm  = ( $nb && defined( 'AMS_Notebook_Handler::CAPO_META' ) ) ? AMS_Notebook_Handler::CAPO_META : '_ams_np_capo';
	$p   = get_post( $pid );
	if ( ! $p || $p->post_type !== $cpt || (int) $p->post_author !== (int) $uid || (int) $p->post_parent !== 0 ) {
		return null;
	}
	return array(
		'pid'       => (int) $p->ID,
		'title'     => (string) $p->post_title,
		'performer' => (string) get_post_meta( $p->ID, $pm, true ),
		'capo'      => (int) get_post_meta( $p->ID, $cm, true ),
		'raw'       => (string) $p->post_content,
	);
}

/**
 * ניתוח העמוד (בלי השער): איזה משטח זה בכלל. מחזיר array( surface, notebook ) או null.
 * add      = עמוד עם [achord_upload_song], בלי ?entry= (מילוי-מתמלל נשאר בישן).
 * notebook = עמוד עם [achord_notebook] וגם np=new או np=edit-<pid> של המשתמש (pid>0).
 * song     = is_singular('achord_song_cpt').
 */
function uc_ne_detect() {
	if ( is_singular( 'achord_song_cpt' ) ) {
		return array( 'surface' => 'song', 'notebook' => null );
	}
	if ( ! is_singular() ) { return null; }
	$post = get_queried_object();
	if ( ! ( $post instanceof WP_Post ) ) { return null; }
	$c = (string) $post->post_content;
	if ( has_shortcode( $c, 'achord_upload_song' ) ) {
		return isset( $_GET['entry'] ) ? null : array( 'surface' => 'add', 'notebook' => null );
	}
	if ( has_shortcode( $c, 'achord_notebook' ) && is_user_logged_in() ) {
		$np = isset( $_GET['np'] ) ? sanitize_text_field( wp_unslash( $_GET['np'] ) ) : '';
		if ( $np === 'new' ) {
			return array( 'surface' => 'notebook', 'notebook' => null );
		}
		if ( strpos( $np, 'edit-' ) === 0 ) {
			$nd = uc_ne_notebook_data( intval( substr( $np, 5 ) ) );
			if ( $nd ) { return array( 'surface' => 'notebook', 'notebook' => $nd ); }
		}
	}
	return null;
}

/**
 * מצב הבקשה (static): נקבע פעם אחת אחרי שהשאילתה מוכנה (template_redirect / wp_enqueue_scripts),
 * ונקרא ע"י הכותרות, ה-enqueue, מסנן-השורטקוד ו-body_class, כך שהם אף פעם לא חלוקים.
 * $reset רק לבדיקות.
 */
function uc_ne_state( $reset = false ) {
	static $state = null;
	if ( $reset ) { $state = null; return null; }
	if ( $state !== null ) { return $state; }
	$off = array( 'on' => false, 'surface' => '', 'notebook' => null, 'optout' => false );
	if ( ! did_action( 'wp' ) || is_admin() || wp_doing_ajax() || ! is_user_logged_in() ) {
		return $off; // מוקדם מדי / לא רלוונטי. לא שומרים, כדי שקריאה מאוחרת יותר תחליט נכון.
	}
	$mode = get_option( 'uc_new_editor', '' );
	if ( ( defined( 'UC_NEW_EDITOR_OFF' ) && UC_NEW_EDITOR_OFF ) || ( $mode !== 'admins' && $mode !== 'all' ) ) {
		$state = $off; // הדגל כבוי: לא מנתחים את העמוד בכלל
		return $state;
	}
	$d = uc_ne_detect();
	if ( ! $d ) { $state = $off; return $state; }
	$state = array(
		'on'       => uc_ne_on( $d['surface'] ),
		'surface'  => $d['surface'],
		'notebook' => $d['notebook'],
		// מנהל שביקש את הישן ב-?uc_old_editor=1 (ולא קבוע ב-meta): נציע קישור חזרה לחדש
		'optout'   => false,
	);
	if ( ! $state['on'] && $d['surface'] !== 'song' && uc_ne_old_param()
		&& current_user_can( 'manage_options' ) && uc_ne_gate( $d['surface'], false )
		&& (string) get_user_meta( get_current_user_id(), 'uc_old_editor', true ) !== '1' ) {
		$state['optout'] = true;
	}
	if ( ! $state['on'] ) { $state['notebook'] = null; }
	return $state;
}

/** צ'יפ למנהלים: טקסט + קישור לאותו URL עם ?uc_old_editor=1. */
function uc_ne_chip_data() {
	if ( ! current_user_can( 'manage_options' ) ) { return null; }
	return array(
		// במצב all כולם מקבלים את העורך החדש; רק השורה הזו (וקישור ההשוואה) למנהלים
		'text'    => get_option( 'uc_new_editor', '' ) === 'all' ? 'עורך חדש לכולם · רק מנהלים רואים שורה זו' : 'עורך חדש · רק מנהלים רואים',
		'oldText' => 'לעורך הישן ›',
		'oldUrl'  => esc_url_raw( add_query_arg( 'uc_old_editor', '1' ) ),
	);
}

function uc_ne_chip_html() {
	$c = uc_ne_chip_data();
	if ( ! $c ) { return ''; }
	return '<p class="uc-ne-chip" role="note">' . esc_html( $c['text'] ) . ' · <a href="' . esc_url( $c['oldUrl'] ) . '">'
		. esc_html( $c['oldText'] ) . '</a></p>';
}

/** שורש העורך החדש (add / notebook). div ולא main: ל-GeneratePress כבר יש main. */
function uc_ne_markup( $surface ) {
	return '<div class="uc-lab uc-ne" dir="rtl">' . uc_ne_chip_html()
		. '<div id="lab-add-root" class="uc-lab-add"' . ( $surface === 'notebook' ? ' data-mode="notebook"' : '' ) . '></div>'
		. '<noscript>העורך דורש JavaScript.</noscript></div>';
}

/**
 * בסיס UC_LAB.song לעמוד השיר (קריאה בלבד). raw / hasPersonal / hasPendingProposal / id נדרסים ב-JS
 * בזמן הלחיצה מתוך data-* של .achord-song-wrapper (כולל מקרה ?shared_version), כמו open() הישן.
 */
function uc_ne_song_data() {
	$p = get_queried_object();
	if ( ! ( $p instanceof WP_Post ) || $p->post_type !== 'achord_song_cpt' ) { return null; }
	$c    = (string) get_post_field( 'post_content', $p->ID, 'raw' );
	$grab = function ( $re ) use ( $c ) { return preg_match( $re, $c, $m ) ? trim( $m[1] ) : ''; };
	$official = $grab( '/\[version=normal\](.*?)\[\/version\]/s' );
	return array(
		'id'                 => (int) $p->ID,
		'title'              => $grab( '/\[song_title\](.*?)\[\/song_title\]/s' ),
		'performer'          => $grab( '/\[performer\](.*?)\[\/performer\]/s' ),
		'capo'               => $grab( '/\[capo\](.*?)\[\/capo\]/s' ),
		'raw'                => $official,
		'url'                => get_permalink( $p->ID ),
		'officialRaw'        => $official,
		'hasPersonal'        => false,
		'hasPendingProposal' => false,
	);
}

/** UC_LAB לעמוד אמיתי. אותם מפתחות וסוגים כמו uc_lab_data() של המעבדה, בלי labUrl/key. */
function uc_ne_data( $state ) {
	$surface = $state['surface'];
	$view    = $surface; // add | notebook | song (song = בלי אתחול-אוטומטי; ה-JS קורא ל-UCLab.mount בלחיצה)
	$editor  = $surface === 'add' || $surface === 'notebook';
	$artists = $editor ? get_terms( array( 'taxonomy' => 'singer', 'hide_empty' => true, 'fields' => 'names' ) ) : array();
	$genres  = $editor ? get_terms( array( 'taxonomy' => 'genre', 'hide_empty' => false, 'fields' => 'names' ) ) : array();
	$levels  = $editor ? get_terms( array( 'taxonomy' => 'level', 'hide_empty' => false ) ) : array();
	$lv      = array();
	if ( ! is_wp_error( $levels ) ) {
		foreach ( $levels as $t ) {
			$lv[] = array( 'id' => (int) $t->term_id, 'name' => $t->name ); // השרת קורא song_level כ-intval
		}
	}
	$req = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/';

	$data = array(
		'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
		'nonce'          => wp_create_nonce( 'achord_upload_nonce' ), // נשלח כ-achord_nonce
		'view'           => $view,
		'demo'           => false,
		'lab'            => false,
		'real'           => true,
		'draftNs'        => 'real',
		'loggedIn'       => is_user_logged_in(),
		'artists'        => is_wp_error( $artists ) ? array() : array_values( $artists ),
		'genres'         => is_wp_error( $genres ) ? array() : array_values( $genres ),
		'levels'         => $lv,
		'consent'        => function_exists( 'uc_license_consent_text' ) ? uc_license_consent_text() : '',
		'song'           => $surface === 'song' ? uc_ne_song_data() : null,
		'loginUrl'       => home_url( '/login/' ) . '?redirect_to=' . rawurlencode( $req ),
		'notebookUrl'    => ( class_exists( 'AMS_Notebook_Handler' ) && method_exists( 'AMS_Notebook_Handler', 'notebook_url' ) )
			? AMS_Notebook_Handler::notebook_url() : home_url( '/notebook/' ),
		'proposalNotice' => function_exists( 'uc_proposal_license_text' )
			? uc_proposal_license_text() : 'שליחת התיקון משחררת אותו תחת הרישיון של האתר.',
		'notebook'       => $surface === 'notebook' ? $state['notebook'] : null,
	);
	if ( is_user_logged_in() ) {
		$data['personalNonce'] = wp_create_nonce( 'achord_personal_version_nonce' ); // נשלח כ-nonce
	}
	$chip = uc_ne_chip_data();
	if ( $chip ) {
		$data['neChip'] = $chip; // lab-edit מציג בכותרת השכבה בעמוד השיר
	}
	return $data;
}

/** יירוט "ערוך" בעמוד השיר (שלב-capture על document → רץ לפני המאזין של main.js על הכפתור). */
function uc_ne_song_js() {
	return <<<'JS'
(function () {
  'use strict';
  var host = null;
  document.addEventListener('click', function (e) {
    var t = e.target, b = t && t.closest ? t.closest('#achord-personal-edit') : null;
    if (!b) return;
    var L = window.UCLab, D = window.UC_LAB;
    // אין ליבה חדשה / אין mount / לא במצב אמיתי → לא נוגעים, המודאל הישן נפתח כמו היום
    if (!L || typeof L.mount !== 'function' || !D || !L.api || L.api.real !== true) return;
    var w = b.closest('.achord-song-wrapper');
    if (!w) return;
    var ds = w.dataset, id = parseInt(ds.postId, 10);
    if (!id) return;
    // נקרא בזמן הלחיצה, בדיוק כמו open() הישן (כולל ?shared_version). משנים את אותו אובייקט (UCLab.data === UC_LAB)
    D.song = Object.assign({}, D.song || {}, {
      id: id,
      raw: ds.songRaw || '',
      hasPersonal: ds.hasPersonal === '1',
      hasPendingProposal: ds.hasPendingProposal === '1'
    });
    if (!host || !host.isConnected) {
      host = document.createElement('div');
      host.id = 'uc-ne-edit-root';
      host.className = 'uc-lab uc-lab-edit uc-ne-overlay';
      host.setAttribute('dir', 'rtl');
      document.body.appendChild(host);
    }
    var drawer = document.getElementById('achord-options-drawer');
    var toggle = document.getElementById('achord-options-toggle');
    var ok = false;
    try {
      // המגירה נסגרת, אז הפוקוס חוזר לכפתור "אפשרויות" (הכפתור "ערוך" עצמו לא נראה כשהמגירה סגורה)
      ok = L.mount('edit', host, { embedded: true, returnFocus: toggle || b }) !== false;
    } catch (err) {
      if (window.console) console.error('[uc-ne] mount', err);
      ok = false;
    }
    if (!ok) { host.textContent = ''; return; } // נפילה → המודאל הישן
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    if (drawer) drawer.classList.remove('is-open');
  }, true);
})();
JS;
}

/** CSS קטן: הצ'יפ למנהלים, ואיפוס ריפוד .uc-lab על מארח-השכבה בעמוד השיר. */
function uc_ne_css() {
	return 'body.uc-editor-lab .uc-ne-chip{display:block;width:fit-content;margin:12px auto 8px;padding:6px 14px;'
		. 'border:1px dashed var(--uc-border-strong,#C9BBA2);border-radius:var(--uc-r-pill,999px);'
		. 'background:var(--uc-terracotta-soft,#F0DACF);color:var(--uc-ink,#1F1810);font:600 14px/1.4 var(--lab-lyric-font,sans-serif);text-align:center}'
		. 'body.uc-editor-lab .uc-ne-chip a{color:var(--uc-gold-deep,#8A5C30);text-decoration:underline;white-space:nowrap}'
		. 'body.uc-editor-lab .uc-lab.uc-ne-overlay{max-width:none;margin:0;padding:0}';
}

/* ── hooks ─────────────────────────────────────────── */

// כותרות: רק בתגובה מסומנת (מנהל + דגל). אין מטמון-עמודים היום. זו הגנה לעתיד.
add_action( 'template_redirect', function () {
	$s = uc_ne_state();
	if ( empty( $s['on'] ) || headers_sent() ) { return; }
	nocache_headers();
	header( 'Vary: Cookie', false );
}, 20 );

// נכסים: אחרי התמה (20), כדי שאפשר להסיר את achord-upload בעמודי add/notebook.
add_action( 'wp_enqueue_scripts', function () {
	$s = uc_ne_state();
	if ( empty( $s['on'] ) ) { return; }
	$surface = $s['surface'];
	$song    = $surface === 'song';
	$d       = uc_ne_dir();
	$u       = uc_ne_url();
	$v       = function ( $f ) use ( $d ) { return file_exists( $d . $f ) ? (string) filemtime( $d . $f ) : '0'; };
	$drag    = file_exists( $d . 'lab-drag.js' );

	// CSS בסדר של המעבדה: lab, lab-add | lab-edit, lab-textmode, lab-drag
	wp_enqueue_style( 'uc-ne-lab', $u . 'lab.css', array(), $v( 'lab.css' ) );
	if ( $song ) {
		wp_enqueue_style( 'uc-ne-edit', $u . 'lab-edit.css', array( 'uc-ne-lab' ), $v( 'lab-edit.css' ) );
	} else {
		wp_enqueue_style( 'uc-ne-add', $u . 'lab-add.css', array( 'uc-ne-lab' ), $v( 'lab-add.css' ) );
	}
	wp_enqueue_style( 'uc-ne-textmode', $u . 'lab-textmode.css', array( 'uc-ne-lab' ), $v( 'lab-textmode.css' ) );
	if ( file_exists( $d . 'lab-drag.css' ) ) {
		wp_enqueue_style( 'uc-ne-drag', $u . 'lab-drag.css', array( 'uc-ne-lab' ), $v( 'lab-drag.css' ) );
	}
	wp_add_inline_style( 'uc-ne-lab', uc_ne_css() );

	// JS בסדר של המעבדה: core, drag, copysig, textmode, add | edit
	$deps = array( 'uc-ne-core' );
	wp_enqueue_script( 'uc-ne-core', $u . 'lab-core.js', array(), $v( 'lab-core.js' ), true );
	if ( $drag ) {
		wp_enqueue_script( 'uc-ne-drag', $u . 'lab-drag.js', array( 'uc-ne-core' ), $v( 'lab-drag.js' ), true );
		$deps[] = 'uc-ne-drag';
	}
	if ( ! $song ) {
		wp_enqueue_script( 'uc-ne-copysig', $u . 'lab-copysig.js', array(), $v( 'lab-copysig.js' ), true );
	}
	wp_enqueue_script( 'uc-ne-textmode', $u . 'lab-textmode.js', array( 'uc-ne-core' ), $v( 'lab-textmode.js' ), true );
	$deps[] = 'uc-ne-textmode';
	if ( $song ) {
		wp_enqueue_script( 'uc-ne-edit', $u . 'lab-edit.js', $deps, $v( 'lab-edit.js' ), true );
		wp_add_inline_script( 'uc-ne-edit', uc_ne_song_js(), 'after' );
		// achord-upload נשאר בעמוד השיר: הוא המנוע של המודאל הישן (הנפילה).
	} else {
		wp_enqueue_script( 'uc-ne-add', $u . 'lab-add.js', array_merge( $deps, array( 'uc-ne-copysig' ) ), $v( 'lab-add.js' ), true );
		wp_dequeue_script( 'achord-upload' ); // אין #achord-upload-form בעמוד, אז הוא ממילא לא היה עושה כלום
	}

	wp_localize_script( 'uc-ne-core', 'UC_LAB', uc_ne_data( $s ) );
	// wp_localize_script הופך ערכים עליונים למחרוזות (false → ""). אלה חייבים להיות בוליאניים אמיתיים.
	wp_add_inline_script( 'uc-ne-core', 'UC_LAB.real=true;UC_LAB.demo=false;UC_LAB.lab=false;UC_LAB.loggedIn=true;', 'before' );
}, 21 );

// השורטקודים: מחזירים את שורש העורך החדש רק כשהמצב (וה-enqueue) דלוקים לאותו משטח.
add_filter( 'pre_do_shortcode_tag', function ( $out, $tag ) {
	if ( $out !== false || ( $tag !== 'achord_upload_song' && $tag !== 'achord_notebook' ) ) { return $out; }
	$s = uc_ne_state();
	if ( empty( $s['on'] ) || ! did_action( 'wp_enqueue_scripts' ) ) { return $out; }
	if ( $tag === 'achord_upload_song' && $s['surface'] === 'add' ) { return uc_ne_markup( 'add' ); }
	if ( $tag === 'achord_notebook' && $s['surface'] === 'notebook' ) { return uc_ne_markup( 'notebook' ); }
	return $out;
}, 10, 2 );

// מנהל שבחר בישן ב-?uc_old_editor=1: צ'יפ קטן "לעורך החדש ›" מעל הטופס הישן (add / notebook בלבד).
add_filter( 'do_shortcode_tag', function ( $output, $tag ) {
	if ( $tag !== 'achord_upload_song' && $tag !== 'achord_notebook' ) { return $output; }
	$s = uc_ne_state();
	if ( empty( $s['optout'] ) ) { return $output; }
	if ( ( $tag === 'achord_upload_song' ) !== ( $s['surface'] === 'add' ) ) { return $output; }
	$url = remove_query_arg( 'uc_old_editor' );
	return '<p class="uc-ne-chip uc-ne-chip--old" role="note" dir="rtl" style="display:block;width:fit-content;margin:12px auto 8px;padding:6px 14px;border-radius:999px;font-size:14px;line-height:1.4;text-align:center;background:#F0DACF;color:#1F1810">'
		. 'עורך ישן (מנהלים) · <a href="' . esc_url( $url ) . '" style="color:#6B4423;text-decoration:underline;font-weight:600">לעורך החדש ›</a></p>' . $output;
}, 10, 2 );

add_filter( 'body_class', function ( $classes ) {
	$s = uc_ne_state();
	if ( empty( $s['on'] ) ) { return $classes; }
	$classes[] = 'uc-editor-lab';
	$classes[] = 'uc-ne';
	$classes[] = 'uc-ne--' . sanitize_html_class( $s['surface'] );
	return $classes;
} );
