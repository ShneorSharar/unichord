<?php
/*
 * Plugin Name: UC Writers
 * Description: "יוצרים" (כותבי מילים ומלחינים) כטקסונומיה `writer`, מתוך [lyrics_by] / [music_by] / [writer] בתוכן השיר.
 *              עמוד לכל יוצר (/writer/<slug>/, דרך archive.php של התמה), מדור "יוצרים" ברשימות הדפדוף,
 *              קישורים בשורת "מילים / לחן" בעמוד השיר, וכרטיס יוצר בחיפוש המהיר (Ajax_Handler בודק taxonomy_exists).
 *              סנכרון: בכל שמירת שיר. סנכרון מלא: wp eval 'uc_writers_sync_all();'
 *              (הצעת ארנון, 19.10.26)
 * Remove:      rm wp-content/mu-plugins/uc-writers.php  (התוסף ממשיך לעבוד כרגיל בלי הטקסונומיה)
 * Version:     1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'init', function () {
	register_taxonomy( 'writer', [ 'achord_song_cpt' ], [
		'labels'            => [
			'name'          => 'יוצרים',
			'singular_name' => 'יוצר',
			'menu_name'     => 'יוצרים',
			'all_items'     => 'כל היוצרים',
			'edit_item'     => 'עריכת יוצר',
			'search_items'  => 'חיפוש יוצרים',
			'not_found'     => 'לא נמצאו יוצרים',
		],
		'public'            => true,
		'hierarchical'      => false,
		'show_ui'           => true,
		'show_in_rest'      => false,
		'show_admin_column' => false,
		'rewrite'           => [ 'slug' => 'writer', 'with_front' => false ],
	] );
}, 20 );

/* ── פירוק שורת קרדיט לשמות ── */

// מקורות ותוויות שאינם יוצר (עממי, מן המקורות, "פילוני"), ושגיאות כתיב מוכרות
function uc_writers_is_skip( $p ) {
	return (bool) preg_match( '/עממי|מסורת|טורקי|יווני|לדינו|פילוני|מלחין|לא ידוע|תה(י)?לים|ברכות|שיר השירים|^(מן )?(ה)?(מקורות|תפילה)$|^מה(מקורות|תפילה)$|^(Trad|Folk)\b|^(יעק|דורי|יובל)$/ui', $p );
}
function uc_writers_alias() {
	return [
		'אלון אולאצ\'יק' => 'אלון אולארצ\'יק',
		'יונתן גפן'      => 'יהונתן גפן',
		'יעקב רוטבליט'   => 'יענקלה רוטבליט',
		'יענקל\'ה רוטבליט' => 'יענקלה רוטבליט',
		'דוד ברק'        => 'דודו ברק',
	];
}

// "יעקב גלעד ויהודה פוליקר" → שני שמות; "יונה וולך" נשאר שם אחד (צריך לפחות שתי מילים בכל צד)
function uc_writers_split_vav( $s ) {
	$w = explode( ' ', $s );
	for ( $i = 2; $i < count( $w ) - 1; $i++ ) {
		if ( mb_substr( $w[ $i ], 0, 1 ) === 'ו' && mb_strlen( $w[ $i ] ) >= 3 ) {
			$first = ltrim( mb_substr( $w[ $i ], 1 ), '-' );
			$right = implode( ' ', array_merge( [ $first ], array_slice( $w, $i + 1 ) ) );
			return array_merge( [ implode( ' ', array_slice( $w, 0, $i ) ) ], uc_writers_split_vav( $right ) );
		}
	}
	return [ $s ];
}

function uc_writers_split( $raw ) {
	$raw = wp_strip_all_tags( html_entity_decode( $raw, ENT_QUOTES, 'UTF-8' ) );
	$raw = preg_replace( [ '/\(\s+/u', '/\s+\)/u', '/\s+/u' ], [ '(', ')', ' ' ], trim( $raw ) );
	$raw = preg_replace( '/[?¨:]+/u', ' ', $raw );
	// "אהוד מנור לחן מתי כספי", "X תרגום: Y"
	$raw = preg_replace( '/(?<!\S)(תרגום|תרג|מילים|לחן|עיבוד|גי?רסה עברית|עברית)(?!\S)/u', ',', $raw );
	$raw = preg_replace( [ '/\s+\d{4}(?=\s*(,|$))/u', '/\s+/u' ], [ '', ' ' ], $raw );
	$alias = uc_writers_alias();
	$out   = [];
	foreach ( preg_split( '/\s*[,\/&;]\s*|\s+-\s+/u', trim( $raw ) ) as $part ) {
		$part = preg_replace( '/\s+ו\S?$/u', '', trim( $part ) ); // קרדיט קטוע: "אלכס טופול וג"
		foreach ( uc_writers_split_vav( $part ) as $p ) {
			$p = trim( $p, " .-\t" );
			if ( mb_strlen( str_replace( ' ', '', $p ) ) < 3 || uc_writers_is_skip( $p ) ) continue;
			$out[] = isset( $alias[ $p ] ) ? $alias[ $p ] : $p;
		}
	}
	return $out;
}

function uc_writers_parse( $content ) {
	$names = [];
	foreach ( [ 'lyrics_by', 'music_by', 'writer' ] as $k ) {
		if ( ! preg_match( '/\[' . $k . '\](.*?)\[\/' . $k . '\]/s', $content, $m ) ) continue;
		foreach ( uc_writers_split( $m[1] ) as $n ) $names[ $n ] = true;
	}
	return array_keys( $names );
}

/* ── סנכרון ── */

function uc_writers_sync_post( $post_id ) {
	if ( ! taxonomy_exists( 'writer' ) ) return;
	wp_set_object_terms( $post_id, uc_writers_parse( (string) get_post_field( 'post_content', $post_id ) ), 'writer', false );
}

add_action( 'save_post_achord_song_cpt', function ( $post_id ) {
	if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) return;
	uc_writers_sync_post( $post_id );
}, 20 );

function uc_writers_sync_all() {
	$ids = get_posts( [ 'post_type' => 'achord_song_cpt', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids' ] );
	foreach ( $ids as $id ) uc_writers_sync_post( $id );
	// יוצרים שכבר אין להם שירים
	foreach ( get_terms( [ 'taxonomy' => 'writer', 'hide_empty' => false ] ) as $t ) {
		if ( (int) $t->count === 0 ) wp_delete_term( $t->term_id, 'writer' );
	}
	delete_transient( 'ams_writer_search_index' );
	return count( $ids );
}

$uc_writers_flush = function () { delete_transient( 'ams_writer_search_index' ); };
add_action( 'created_writer', $uc_writers_flush );
add_action( 'edited_writer', $uc_writers_flush );
add_action( 'delete_writer', $uc_writers_flush );
add_action( 'set_object_terms', function ( $object_id, $terms, $tt_ids, $taxonomy ) {
	if ( $taxonomy === 'writer' ) delete_transient( 'ams_writer_search_index' );
}, 10, 4 );

/* ── מדור "יוצרים" אחרי "מבצעים" ברשימות הדפדוף ── */

add_filter( 'ams_accordion_taxonomies', function ( $tax, $post_type ) {
	if ( $post_type !== 'achord_song_cpt' || ! taxonomy_exists( 'writer' ) ) return $tax;
	$i = array_search( 'singer', $tax, true );
	array_splice( $tax, $i === false ? count( $tax ) : $i + 1, 0, [ 'writer' ] );
	return $tax;
}, 10, 2 );

/* ── עמוד יוצר: כמו עמוד מבצע (30 לעמוד, לפי שם, גרסה קלה כשהמצב דלוק) ── */

add_action( 'pre_get_posts', function ( $q ) {
	if ( is_admin() || ! $q->is_main_query() || ! $q->is_tax( 'writer' ) ) return;
	$q->set( 'post_type', 'achord_song_cpt' );
	$q->set( 'posts_per_page', 30 );
	$q->set( 'orderby', 'title' );
	$q->set( 'order', 'ASC' );
	if ( class_exists( 'Achord_Master_Suite' ) && Achord_Master_Suite::easy_mode_on() ) {
		$mq   = (array) $q->get( 'meta_query' );
		$mq[] = [ 'key' => '_ams_is_easy', 'value' => '1', 'compare' => '=' ];
		$q->set( 'meta_query', $mq );
	}
} );

// עמוד יוצר עם שיר אחד בלבד לא נכנס לגוגל (עמוד דל)
add_filter( 'wp_robots', function ( $robots ) {
	if ( is_tax( 'writer' ) ) {
		$t = get_queried_object();
		if ( $t && isset( $t->count ) && (int) $t->count < 2 ) $robots['noindex'] = true;
	}
	return $robots;
} );

/* ── שורת "מילים / לחן" בעמוד השיר: שם היוצר מקשר לעמוד שלו ── */

add_filter( 'do_shortcode_tag', function ( $out, $tag ) {
	if ( $tag !== 'achord_song' || strpos( $out, 'achord-writer' ) === false || ! is_singular( 'achord_song_cpt' ) ) return $out;
	$terms = get_the_terms( get_queried_object_id(), 'writer' );
	if ( ! $terms || is_wp_error( $terms ) ) return $out;
	return preg_replace_callback( '#(<p class="achord-writer">)(.*?)(</p>)#s', function ( $m ) use ( $terms ) {
		usort( $terms, function ( $a, $b ) { return mb_strlen( $b->name ) - mb_strlen( $a->name ); } );
		$body = $m[2];
		$keep = [];
		foreach ( $terms as $i => $t ) {
			$name = esc_html( $t->name );
			$pos  = strpos( $body, $name );
			if ( $pos === false ) continue;
			$link = get_term_link( $t );
			if ( is_wp_error( $link ) ) continue;
			$keep[ $i ] = '<a class="uc-writer-link" href="' . esc_url( $link ) . '">' . $name . '</a>';
			$body = substr_replace( $body, "\x01" . $i . "\x01", $pos, strlen( $name ) );
		}
		$body = preg_replace_callback( '/\x01(\d+)\x01/', function ( $k ) use ( $keep ) { return $keep[ (int) $k[1] ]; }, $body );
		return $m[1] . $body . $m[3];
	}, $out, 1 );
}, 10, 2 );

add_action( 'wp_head', function () {
	if ( ! is_singular( 'achord_song_cpt' ) ) return;
	echo '<style id="uc-writers-css">.achord-writer a.uc-writer-link{color:inherit;text-decoration:underline;text-decoration-color:rgba(216,168,110,.6);text-underline-offset:3px}.achord-writer a.uc-writer-link:hover{text-decoration-color:currentColor}</style>';
} );
