<?php
/*
 * Plugin Name: UC Editor Lab (test-only, noindex, token-gated)
 * Description: עמוד-מעבדה לעורך-האקורדים החדש במובייל (הוספה+עריכה). מצב-הדגמה: שום דבר לא נשמר.
 *              נגיש רק בקישור-סוד (?k=) או למנהל. לא קיים כעמוד WP, לא במפת-האתר, noindex.
 * Remove:      rm wp-content/mu-plugins/uc-editor-lab.php && rm -rf wp-content/mu-plugins/uc-editor-lab/
 * Version:     0.2.0 (round 5: &live=1 real mode for admins, notebook view)
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }
if ( ! defined( 'UC_EDITOR_LAB_KEY' ) ) { define( 'UC_EDITOR_LAB_KEY', '' ); } // set in wp-config.php; empty = admins only
if ( ! defined( 'UC_EDITOR_LAB_DEMO_SONG' ) ) { define( 'UC_EDITOR_LAB_DEMO_SONG', 20868 ); } // החברה הטובים – נערי רפול

function uc_lab_is_request() {
	$path = trim( (string) parse_url( isset( $_SERVER['REQUEST_URI'] ) ? $_SERVER['REQUEST_URI'] : '', PHP_URL_PATH ), '/' );
	if ( $path !== 'editor-lab' ) { return false; }
	$k = isset( $_GET['k'] ) ? (string) wp_unslash( $_GET['k'] ) : '';
	return ( $k !== '' && hash_equals( UC_EDITOR_LAB_KEY, $k ) ) || current_user_can( 'manage_options' );
}

function uc_lab_view() {
	$v = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : 'add';
	return in_array( $v, array( 'add', 'edit', 'notebook' ), true ) ? $v : 'add';
}

/** &live=1 בכתובת (נשמר בקישורי-המעבר, גם אם המשתמש אינו מנהל). */
function uc_lab_live_param() {
	return isset( $_GET['live'] ) && (string) wp_unslash( $_GET['live'] ) === '1';
}

/** מצב אמיתי: רק &live=1 וגם מנהל. אחרת — הדגמה, בדיוק כמו קודם. */
function uc_lab_is_real() {
	return uc_lab_live_param() && current_user_can( 'manage_options' );
}

/** שיר לעריכה — קריאה בלבד, רק שיר מפורסם. מחלץ בדיוק כמו עמוד-השיר. */
function uc_lab_song_data() {
	$id = isset( $_GET['song'] ) ? absint( $_GET['song'] ) : 0;
	$p  = $id ? get_post( $id ) : null;
	if ( ! $p || $p->post_type !== 'achord_song_cpt' || $p->post_status !== 'publish' ) {
		$p = get_post( UC_EDITOR_LAB_DEMO_SONG );
	}
	if ( ! $p ) { return null; }
	$c = (string) get_post_field( 'post_content', $p->ID, 'raw' );
	$grab = function ( $re ) use ( $c ) { return preg_match( $re, $c, $m ) ? trim( $m[1] ) : ''; };
	$official = $grab( '/\[version=normal\](.*?)\[\/version\]/s' );

	// אותו מקור כמו data-song-raw בעמוד-השיר (Shortcode_Handler): גרסה אישית אם יש, אחרת הקנונית.
	$raw = $official;
	$has_personal = false;
	$uid = get_current_user_id();
	if ( $uid && class_exists( 'AMS_Personal_Version_Handler' ) && method_exists( 'AMS_Personal_Version_Handler', 'get_personal_version' ) ) {
		$pv = AMS_Personal_Version_Handler::get_personal_version( $p->ID, $uid );
		if ( $pv && isset( $pv->post_content ) ) {
			$has_personal = true;
			$raw = (string) $pv->post_content;
		}
	}
	$has_pending = false;
	if ( $uid ) {
		$cpt = ( class_exists( 'AMS_Edit_Proposal_Handler' ) && defined( 'AMS_Edit_Proposal_Handler::CPT' ) )
			? AMS_Edit_Proposal_Handler::CPT : 'achord_edit_proposal';
		$has_pending = (bool) get_posts( array(
			'post_type'      => $cpt,
			'author'         => $uid,
			'post_parent'    => (int) $p->ID,
			'post_status'    => 'pending',
			'posts_per_page' => 1,
			'no_found_rows'  => true,
			'fields'         => 'ids',
		) );
	}
	return array(
		'id'                 => (int) $p->ID,
		'title'              => $grab( '/\[song_title\](.*?)\[\/song_title\]/s' ),
		'performer'          => $grab( '/\[performer\](.*?)\[\/performer\]/s' ),
		'capo'               => $grab( '/\[capo\](.*?)\[\/capo\]/s' ),
		'raw'                => $raw,
		'url'                => get_permalink( $p->ID ),
		'officialRaw'        => $official,
		'hasPersonal'        => $has_personal,
		'hasPendingProposal' => $has_pending,
	);
}

/** שיר-משלי לעריכה במחברת (&pid=) — רק של המשתמש הנוכחי, בדיוק כמו Notebook_Handler::render_editor. אחרת null. */
function uc_lab_notebook_data() {
	$pid = isset( $_GET['pid'] ) ? absint( $_GET['pid'] ) : 0;
	$uid = get_current_user_id();
	if ( ! $pid || ! $uid || ! is_user_logged_in() ) { return null; }
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

/** כל נתוני UC_LAB (נפרד מ-enqueue כדי שאפשר לבדוק אותו ב-wp eval). */
function uc_lab_data() {
	$view    = uc_lab_view();
	$real    = uc_lab_is_real();
	$artists = get_terms( array( 'taxonomy' => 'singer', 'hide_empty' => true, 'fields' => 'names' ) );
	$genres  = get_terms( array( 'taxonomy' => 'genre', 'hide_empty' => false, 'fields' => 'names' ) );
	$levels  = get_terms( array( 'taxonomy' => 'level', 'hide_empty' => false ) );
	$levels  = is_wp_error( $levels ) ? array() : array_map( function ( $t ) {
		return array( 'id' => (int) $t->term_id, 'name' => $t->name ); // השרת קורא song_level כ-intval
	}, $levels );
	$req     = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '/editor-lab/';

	$data = array(
		'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
		'nonce'    => wp_create_nonce( 'achord_upload_nonce' ), // field 'achord_nonce'
		'view'     => $view,
		'demo'     => ! $real,
		'lab'      => true,   // סבב 7: רק בעמוד הבדיקה. בעמודים האמיתיים (uc-new-editor.php) = false
		'loggedIn' => is_user_logged_in(),
		'artists'  => is_wp_error( $artists ) ? array() : array_values( $artists ),
		'genres'   => is_wp_error( $genres ) ? array() : array_values( $genres ),
		'levels'   => array_values( $levels ),
		'consent'  => function_exists( 'uc_license_consent_text' ) ? uc_license_consent_text() : '',
		'song'     => $view === 'edit' ? uc_lab_song_data() : null,
		'labUrl'   => home_url( '/editor-lab/' ),
		'key'      => isset( $_GET['k'] ) ? sanitize_text_field( wp_unslash( $_GET['k'] ) ) : '',
		'real'     => $real,
		'loginUrl' => home_url( '/login/' ) . '?redirect_to=' . rawurlencode( $req ),
		'notebookUrl' => ( class_exists( 'AMS_Notebook_Handler' ) && method_exists( 'AMS_Notebook_Handler', 'notebook_url' ) )
			? AMS_Notebook_Handler::notebook_url() : home_url( '/notebook/' ),
		'proposalNotice' => function_exists( 'uc_proposal_license_text' )
			? uc_proposal_license_text() : 'שליחת התיקון משחררת אותו תחת הרישיון של האתר.',
		'notebook' => $view === 'notebook' ? uc_lab_notebook_data() : null,
	);
	if ( is_user_logged_in() ) {
		$data['personalNonce'] = wp_create_nonce( 'achord_personal_version_nonce' ); // field 'nonce'
	}
	return $data;
}

function uc_lab_enqueue() {
	$d = WPMU_PLUGIN_DIR . '/uc-editor-lab/';
	$u = WPMU_PLUGIN_URL . '/uc-editor-lab/';
	$v = function ( $f ) use ( $d ) { return file_exists( $d . $f ) ? (string) filemtime( $d . $f ) : '0'; };

	wp_dequeue_script( 'uc-analytics' ); // בדיקות-הבעלים לא נכנסות למדד

	// lab-guard.js מודפס ידנית ב-wp_head בעדיפות -1000 (לפני כל סקריפט אחר) — ראה template_redirect
	if ( defined( 'AMS_PLUGIN_URL' ) && defined( 'AMS_VERSION' ) ) {
		wp_enqueue_style( 'ams-main-style', AMS_PLUGIN_URL . 'assets/css/main.css', array(), AMS_VERSION );
	}
	wp_enqueue_style( 'uc-lab', $u . 'lab.css', array(), $v( 'lab.css' ) );
	wp_enqueue_style( 'uc-lab-add', $u . 'lab-add.css', array( 'uc-lab' ), $v( 'lab-add.css' ) );
	wp_enqueue_style( 'uc-lab-edit', $u . 'lab-edit.css', array( 'uc-lab' ), $v( 'lab-edit.css' ) );
	wp_enqueue_style( 'uc-lab-textmode', $u . 'lab-textmode.css', array( 'uc-lab' ), $v( 'lab-textmode.css' ) );
	wp_enqueue_style( 'uc-lab-drag', $u . 'lab-drag.css', array( 'uc-lab' ), $v( 'lab-drag.css' ) );
	wp_enqueue_script( 'uc-lab-core', $u . 'lab-core.js', array(), $v( 'lab-core.js' ), true );
	wp_enqueue_script( 'uc-lab-drag', $u . 'lab-drag.js', array( 'uc-lab-core' ), $v( 'lab-drag.js' ), true ); // סבב 6: גרירה (עכבר + לחיצה-ארוכה)
	wp_enqueue_script( 'uc-lab-copysig', $u . 'lab-copysig.js', array(), $v( 'lab-copysig.js' ), true );
	wp_enqueue_script( 'uc-lab-textmode', $u . 'lab-textmode.js', array( 'uc-lab-core' ), $v( 'lab-textmode.js' ), true );
	wp_enqueue_script( 'uc-lab-add', $u . 'lab-add.js', array( 'uc-lab-core', 'uc-lab-drag', 'uc-lab-copysig', 'uc-lab-textmode' ), $v( 'lab-add.js' ), true );
	wp_enqueue_script( 'uc-lab-edit', $u . 'lab-edit.js', array( 'uc-lab-core', 'uc-lab-drag', 'uc-lab-textmode' ), $v( 'lab-edit.js' ), true );

	$data = uc_lab_data();
	wp_localize_script( 'uc-lab-core', 'UC_LAB', $data );
	// wp_localize_script הופך ערכים עליונים למחרוזות (false → ""). real חייב להיות בוליאני אמיתי.
	wp_add_inline_script( 'uc-lab-core', 'UC_LAB.real=' . ( $data['real'] ? 'true' : 'false' ) . ';', 'before' );
}

function uc_lab_render() {
	$view = uc_lab_view();
	$real = uc_lab_is_real();
	$k    = isset( $_GET['k'] ) ? rawurlencode( sanitize_text_field( wp_unslash( $_GET['k'] ) ) ) : '';
	$base = home_url( '/editor-lab/' ) . '?k=' . $k . ( uc_lab_live_param() ? '&live=1' : '' );
	$addv = $view === 'add' || $view === 'notebook';
	?>
	<main id="uc-lab" class="uc-lab" dir="rtl" data-view="<?php echo esc_attr( $view ); ?>">
		<?php if ( $real ) : ?>
		<div class="uc-lab-banner uc-lab-banner--real" role="note">🔴 מצב אמיתי · השמירה נכנסת לאתר באמת (רק למנהלים)</div>
		<?php else : ?>
		<div class="uc-lab-banner" role="note">🧪 עמוד בדיקה · שום דבר לא נשמר</div>
		<?php endif; ?>
		<nav class="uc-lab-switch" aria-label="בחירת תרחיש">
			<a href="<?php echo esc_url( $base . '&view=add' ); ?>" class="<?php echo $view === 'add' ? 'is-on' : ''; ?>">הוספת שיר</a>
			<a href="<?php echo esc_url( $base . '&view=edit' ); ?>" class="<?php echo $view === 'edit' ? 'is-on' : ''; ?>">עריכת שיר</a>
			<a href="<?php echo esc_url( $base . '&view=notebook' ); ?>" class="<?php echo $view === 'notebook' ? 'is-on' : ''; ?>">מחברת</a>
		</nav>
		<div id="lab-add-root" class="uc-lab-add"<?php echo $view === 'notebook' ? ' data-mode="notebook"' : ''; ?> <?php echo $addv ? '' : 'hidden'; ?>></div>
		<div id="lab-edit-root" class="uc-lab-edit" <?php echo $view === 'edit' ? '' : 'hidden'; ?>></div>
		<noscript>העמוד דורש JavaScript.</noscript>
	</main>
	<?php
}

add_action( 'template_redirect', function () {
	if ( ! uc_lab_is_request() ) { return; }
	global $wp_query;
	$wp_query->is_404 = false;
	status_header( 200 );
	nocache_headers();
	header( 'X-Robots-Tag: noindex, nofollow', true );
	add_filter( 'wp_robots', function ( $r ) { return array_merge( $r, array( 'noindex' => true, 'nofollow' => true ) ); } );
	add_filter( 'pre_get_document_title', function () { return 'עמוד בדיקה · unichord'; } );
	add_filter( 'body_class', function ( $c ) { return array_merge( array_diff( $c, array( 'error404' ) ), array( 'uc-editor-lab' ) ); } );
	add_action( 'wp_enqueue_scripts', 'uc_lab_enqueue', 30 );
	add_action( 'wp_head', function () { // רשת-הביטחון רצה ראשונה, לפני כל סקריפט אחר בעמוד
		$f = WPMU_PLUGIN_DIR . '/uc-editor-lab/lab-guard.js';
		if ( uc_lab_is_real() ) { // רק מנהל + &live=1. חייב להיות האלמנט שממש לפני lab-guard.js (השומר בודק זאת).
			echo '<script id="uc-lab-guard-real">window.UC_LAB_GUARD_REAL=true;</script>' . "\n";
		}
		echo '<script id="uc-lab-guard-js" src="' . esc_url( WPMU_PLUGIN_URL . '/uc-editor-lab/lab-guard.js?ver=' . ( file_exists( $f ) ? filemtime( $f ) : 0 ) ) . '"></script>' . "
";
	}, -1000 );
	get_header();
	uc_lab_render();
	get_footer();
	exit;
}, -50 );
