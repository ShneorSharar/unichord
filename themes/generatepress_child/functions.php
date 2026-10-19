<?php
/**
 * GeneratePress Child Theme — Functions
 * Achord - App Style Drawer
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ── 1. Enqueue assets ─────────────────────────────────────────────────────────
function achord_child_enqueue_assets() {
    $dir = get_stylesheet_directory();
    $uri = get_stylesheet_directory_uri();

    // גופן כותרות: Frank Ruhl Libre (סריף עברי קלאסי — תחושת שירון)
    wp_enqueue_style(
        'uc-google-fonts',
        'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&display=swap',
        [],
        null
    );

    // Main CSS
    wp_enqueue_style(
        'achord-child',
        $uri . '/assets/css/achord-child.css',
        [ 'uc-google-fonts' ],
        filemtime( $dir . '/assets/css/achord-child.css' )
    );

    // מערכת האייקונים המרכזית (Phosphor) — נטענת ב-head כדי שתהיה זמינה לכל
    // סקריפט (drawer/upload/pwa/a11y) לפני שהוא רץ. מגדירה window.UC_ICON(name).
    wp_enqueue_script(
        'uc-icons',
        $uri . '/assets/js/uc-icons.js',
        [],
        filemtime( $dir . '/assets/js/uc-icons.js' ),
        false
    );

    // Drawer JS
    wp_enqueue_script(
        'achord-appdrawer',
        $uri . '/assets/js/achord-drawer.js',
        [ 'uc-icons' ],
        filemtime( $dir . '/assets/js/achord-drawer.js' ),
        true
    );

    // Upload form JS — on the public uploader, on the personal notebook editor,
    // וגם בעמוד-שיר בודד למשתמש-מחובר: שם משובץ אותו מנוע-עורך במודאל
    // "ערוך גרסה אישית / הצע תיקון" (window.initAchordEditor במצב embed).
    global $post;
    $achord_needs_editor = is_a( $post, 'WP_Post' ) && (
            has_shortcode( $post->post_content, 'achord_upload_song' )
            || has_shortcode( $post->post_content, 'achord_notebook' )
            || has_shortcode( $post->post_content, 'achord_notebook_editor' )
    );
    if ( is_singular( 'achord_song_cpt' ) && is_user_logged_in() ) {
        $achord_needs_editor = true;
    }
    if ( $achord_needs_editor ) {
        wp_enqueue_script(
            'achord-upload',
            $uri . '/assets/js/achord-upload.js',
            [],
            filemtime( $dir . '/assets/js/achord-upload.js' ),
            true
        );
    }

    // Force-load song-search.js on pages where the header search must render correctly
    if ( is_front_page() || is_404() || is_search() ) {
        wp_enqueue_script(
            'ams-song-search-script',
            WP_PLUGIN_URL . '/achord-master-suite-optimized11/assets/js/song-search.js',
            [],
            null,
            true
        );
    }

    // Infinite scroll — only on archive / blog pages
    if ( is_archive() || is_home() ) {
        wp_enqueue_script(
            'achord-load-more',
            $uri . '/js/infinite-scroll.js',
            [ 'jquery' ],
            filemtime( $dir . '/js/infinite-scroll.js' ),
            true
        );
        wp_localize_script( 'achord-load-more', 'AchordAjax', [
            'ajaxurl' => admin_url( 'admin-ajax.php' ),
            'nonce'   => wp_create_nonce( 'achord_load_more_nonce' ),
        ] );
    }
}
add_action( 'wp_enqueue_scripts', 'achord_child_enqueue_assets', 20 );

// preconnect ל-Google Fonts (ביצועי טעינת גופן)
add_filter( 'wp_resource_hints', function ( $hints, $relation ) {
    if ( 'preconnect' === $relation ) {
        $hints[] = 'https://fonts.gstatic.com';
    }
    return $hints;
}, 10, 2 );

// ── מצב לילה: החלת העדפת המכשיר/הבחירה השמורה לפני ציור ראשון (מניעת FOUC) ──
// רץ מיד אחרי פתיחת <body> (hook core של WP) כדי שהמחלקה body.dark-mode תחול
// לפני שהדפדפן מצייר תוכן. סדר עדיפויות: בחירה ידנית שמורה גוברת תמיד; בהיעדרה,
// prefers-color-scheme של מערכת ההפעלה/הדפדפן. הלוגיקה הזהה חיה גם ב-achord-drawer.js
// (מאזין לשינוי חי) וב-main.js (סנכרון ה-wrapper בעמוד שיר).
function achord_dark_mode_boot() {
    echo '<script id="achord-dark-boot">(function(){try{var s=localStorage.getItem("achordDarkMode");var d=s==="enabled"||(s===null&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var t=localStorage.getItem("achordTheme")||"theme-conductor";var b=document.body;if(b){b.classList.remove("theme-conductor","theme-studio");b.classList.add(t);b.classList.toggle("dark-mode",d);}}catch(e){}})();</script>' . "\n";
}
add_action( 'wp_body_open', 'achord_dark_mode_boot', 1 );

// ── 2. Defer scripts ──────────────────────────────────────────────────────────
function achord_child_add_defer_to_scripts( $tag, $handle ) {
    $defer_handles = [ 'achord-appdrawer', 'achord-load-more' ];
    if ( in_array( $handle, $defer_handles, true ) && false === strpos( $tag, 'defer' ) ) {
        return str_replace( '<script ', '<script defer ', $tag );
    }
    return $tag;
}
add_filter( 'script_loader_tag', 'achord_child_add_defer_to_scripts', 10, 2 );

// ── 3. AJAX: load more posts ──────────────────────────────────────────────────
function achord_load_more_posts_ajax_handler() {
    check_ajax_referer( 'achord_load_more_nonce', 'nonce' );
    // אבטחה: לא לסמוך על query_vars גולמי מהמשתמש (WP_Query מקבל כל ארגומנט).
    // מסננים למפתחות מותרים בלבד, מגבילים כמות ומכריחים post_status.
    $raw = json_decode( wp_unslash( $_POST['query_vars'] ?? '' ), true );
    if ( ! is_array( $raw ) ) {
        $raw = array();
    }
    $allowed    = array( 'post_type', 'cat', 'category_name', 'tag', 'tax_query', 's', 'orderby', 'order', 'author' );
    $query_vars = array_intersect_key( $raw, array_flip( $allowed ) );

    $query_vars['paged']          = max( 1, intval( $_POST['paged'] ?? 1 ) );
    $query_vars['post_status']    = 'publish';
    $query_vars['posts_per_page'] = 10; // חוסם DoS דרך posts_per_page=-1
    $q = new WP_Query( $query_vars );
    if ( $q->have_posts() ) {
        while ( $q->have_posts() ) {
            $q->the_post();
            if ( function_exists( 'generate_do_template_part' ) ) {
                generate_do_template_part( 'archive' );
            } else {
                get_template_part( 'content', get_post_type() );
            }
        }
    }
    wp_reset_postdata();
    wp_die();
}
add_action( 'wp_ajax_achord_load_more_posts',        'achord_load_more_posts_ajax_handler' );
add_action( 'wp_ajax_nopriv_achord_load_more_posts', 'achord_load_more_posts_ajax_handler' );

// ── 4. Logo helper ────────────────────────────────────────────────────────────
function achord_get_logo_url() {
    $logo_id = get_theme_mod( 'custom_logo' );
    if ( $logo_id ) {
        return (string) wp_get_attachment_image_url( $logo_id, 'full' );
    }
    // Fallback: production URL — replace via Appearance → Customize → Site Identity
    return 'https://unichord.co.il/wp-content/uploads/2025/08/cropped-IMG_6038-1.png';
}

// ── 5. Custom header ──────────────────────────────────────────────────────────
/**
 * אייקוני-קו (SVG) לתפריט הראשי — מחליפים אמוג'י לעקביות עם פלטת האתר.
 * stroke=currentColor כדי שהצבע נשלט מ-CSS.
 */
function achord_menu_icon( $name ) {
    $paths = [
        'music'    => '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        'score'    => '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="9.5" cy="16.5" r="1.5"/><path d="M11 16.5V11l4-1v4.5"/>',
        'heart'    => '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
        'versions' => '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
        'edit'     => '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
        'add'      => '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
        'review'   => '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        'user'     => '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        'logout'   => '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
        'info'     => '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        'guide'    => '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        'lesson'   => '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5"/>',
        'phone'    => '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
        'download' => '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>',
        'device'   => '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 6v6"/><path d="m9.5 10 2.5 2.5 2.5-2.5"/>',
        'notebook' => '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H19v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M9 2v20"/><path d="M13 8h3"/><path d="M13 12h3"/>',
    ];
    $p = isset( $paths[ $name ] ) ? $paths[ $name ] : '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' . $p . '</svg>';
}

/**
 * יוצר אוטומטית את עמוד "מדריך וידאו" (slug: tutorials) אם אינו קיים.
 * התבנית page-tutorials.php חלה אוטומטית על עמוד עם slug זה (היררכיית התבניות).
 * מגודר ב-option כדי לא לרוץ בכל טעינה.
 */
function achord_ensure_tutorials_page() {
    if ( get_option('achord_tutorials_page_v1') ) {
        return;
    }
    if ( ! get_page_by_path('tutorials') ) {
        wp_insert_post([
            'post_type'      => 'page',
            'post_title'     => 'מדריך וידאו',
            'post_name'      => 'tutorials',
            'post_status'    => 'publish',
            'post_content'   => '',
            'comment_status' => 'closed',
        ]);
    }
    update_option('achord_tutorials_page_v1', 1);
}
// add_action('init', 'achord_ensure_tutorials_page'); // נוטרל 29.7.26 — עמוד /tutorials/ נמחק

/**
 * האם ה-URL שנמסר הוא העמוד שנצפה כרגע — לסימון aria-current בתפריט.
 * משווה נתיבים בלבד (בלי סכימה/דומיין/פרמטרים) כדי ש-http/https ו-www לא ישברו את ההשוואה.
 */
function uc_menu_is_current( $url ) {
    $path = static function ( $u ) {
        $p = wp_parse_url( $u, PHP_URL_PATH );
        return untrailingslashit( $p ? $p : '/' );
    };
    $here = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
    return $path( $url ) === $path( $here );
}

/**
 * שורת ניווט אחת בתפריט הצד. מרכזת אייקון + תווית + תג-מונה + סימון עמוד נוכחי
 * במקום לחזור על אותו HTML בכל פריט.
 *
 * @param int  $badge  מונה להצגה; 0 = בלי תג.
 * @param bool $alert  תג בגוון התרעה (פעולה שממתינה לי) במקום מידע.
 */
function uc_nav_item( $url, $icon, $label, $badge = 0, $alert = false ) {
    $badge_html = $badge > 0
        ? '<span class="achord-badge' . ( $alert ? ' achord-badge--alert' : '' ) . '">' . (int) $badge . '</span>'
        : '';
    printf(
        '<li><a href="%1$s"%2$s><span class="achord-menu-icon">%3$s</span> %4$s%5$s</a></li>',
        esc_url( $url ),
        uc_menu_is_current( $url ) ? ' aria-current="page"' : '',
        achord_menu_icon( $icon ),
        esc_html( $label ),
        $badge_html
    );
}

/**
 * כותרת קבוצה בתפריט. מחליפה את קווי-ההפרדה העיוורים: במקום "עוד קו",
 * המשתמש מקבל שם לקבוצה — וגם הקוראים בטכנולוגיה מסייעת מקבלים כותרת לרשימה.
 */
function uc_nav_group_title( $id, $text ) {
    printf(
        '<h2 class="uc-navgroup" id="%1$s">%2$s</h2>',
        esc_attr( $id ),
        esc_html( $text )
    );
}

/**
 * פריט "התקן אפליקציה" קבוע בתפריט ההמבורגר (PWA).
 * מוסתר כברירת מחדל; ה-JS ב-§9 חושף אותו כשניתן להתקין (ומסתיר אם כבר מותקנת).
 */
function achord_install_menu_item() {
    ?>
    <li class="uc-install-menu-item" style="display:none">
      <a href="#" class="uc-install-trigger" role="button">
        <span class="achord-menu-icon"><?php echo achord_menu_icon('download'); ?></span> התקן אפליקציה
      </a>
    </li>
    <?php
}

/**
 * פריט "שירים לא מקוונים" — פותח את מסך ניהול השירים השמורים במכשיר (offline).
 * נפרד מ"שירים שמורים" (מועדפים בשרת) כדי למנוע בלבול. ה-JS ב-pwa-offline.js מחווט אותו.
 */
function achord_offline_songs_menu_item() {
    ?>
    <li>
      <a href="#" class="uc-offline-mgr-trigger" role="button">
        <span class="achord-menu-icon"><?php echo achord_menu_icon('device'); ?></span> שירים לא מקוונים
      </a>
    </li>
    <?php
}

/**
 * עימוד נוח לארכיוני שירים — 30 כרטיסים לעמוד (במקום עשרות-מאות בעמוד אחד).
 */
function uc_archive_posts_per_page( $query ) {
    if ( is_admin() || ! $query->is_main_query() ) return;
    if ( $query->is_tax( [ 'genre', 'singer', 'level', 'tune_category' ] )
         || $query->is_post_type_archive( 'achord_song_cpt' ) ) {
        $query->set( 'posts_per_page', 30 );
        $query->set( 'orderby', 'title' );
        $query->set( 'order', 'ASC' );
    }
}
add_action( 'pre_get_posts', 'uc_archive_posts_per_page' );

/**
 * כרטיס שיר אחיד (unichord) — בשימוש בעמוד הבית ובארכיונים.
 * מקבל post ID, מחזיר HTML של <a class="uc-card">.
 */
function uc_render_song_card( $post_id ) {
    $raw   = get_the_title( $post_id );
    // כותרת לרוב בפורמט "שם השיר – אמן" → הפרדה לתצוגה נקייה
    $parts = preg_split( '/\s+[–-]\s+/u', $raw, 2 );
    $song  = $parts[0];
    $singers = wp_get_post_terms( $post_id, 'singer', [ 'fields' => 'names' ] );
    $singer  = ( ! is_wp_error( $singers ) && ! empty( $singers ) ) ? $singers[0]
               : ( isset( $parts[1] ) ? $parts[1] : '' );
    $flags = get_post_meta( $post_id, '_achord_content_flags', true );
    $flags = is_string( $flags ) ? $flags : '';
    $has_chords = ( strpos( $flags, 'chords' ) !== false );
    $has_score  = ( strpos( $flags, 'score' )  !== false );
    $is_easy    = ( strpos( $flags, 'easy' )   !== false );

    ob_start(); ?>
    <a class="uc-card" href="<?php echo esc_url( get_permalink( $post_id ) ); ?>">
        <span class="uc-card__title"><?php echo esc_html( $song ); ?></span>
        <?php if ( $singer ) : ?>
            <span class="uc-card__singer"><?php echo esc_html( $singer ); ?></span>
        <?php endif; ?>
        <span class="uc-card__tags">
            <?php if ( $has_chords ) : ?><span class="uc-tag">אקורדים</span><?php endif; ?>
            <?php if ( $has_score ) : ?><span class="uc-tag">תווים</span><?php endif; ?>
            <?php if ( $is_easy ) : ?><span class="uc-tag uc-tag--easy">קל לנגן</span><?php endif; ?>
        </span>
    </a>
    <?php
    return ob_get_clean();
}

function achord_custom_header_output() { ?>
  <header id="achord-ux-header" class="achord-ux-header" role="banner">

    <div class="achord-topbar">
      <div class="achord-brandwrap">
        <a class="uc-brand" href="<?php echo esc_url( home_url( '/' ) ); ?>" rel="home" aria-label="unichord, דף הבית">
          <span class="uc-wordmark">un<span class="uc-i">i</span>chord</span>
          <span class="uc-slogan">החופש לנגן</span>
        </a>
        <button id="achord-menu-btn" type="button"
                aria-expanded="false" aria-controls="achord-panel" aria-label="פתח תפריט">
          <span class="bar b1"></span>
          <span class="bar b2"></span>
          <span class="bar b3"></span>
        </button>
      </div>
    </div>

    <div class="achord-searchbar" role="search">
      <div class="achord-main-search-container">
        <?php echo do_shortcode( '[achord_song_search]' ); ?>
      </div>
    </div>

    <div id="achord-overlay" class="achord-overlay" tabindex="-1" aria-hidden="true"></div>

    <section id="achord-panel" class="achord-panel" aria-hidden="true" aria-label="תפריט ראשי">
      <div class="achord-panel__top">
        <div class="achord-panel__title">תפריט</div>
        <button id="achord-close-btn" type="button" aria-label="סגור"><?php echo ams_icon('x'); ?></button>
      </div>
      <div class="achord-panel__body">

        <?php
        // קבוצת "במכשיר שלי" — זהה במחובר ובאורח, ולכן מוגדרת פעם אחת.
        $render_device_group = static function () {
            uc_nav_group_title( 'uc-nav-device', 'במכשיר שלי' );
            echo '<ul class="achord-panel__nav-list" aria-labelledby="uc-nav-device">';
            achord_install_menu_item();
            achord_offline_songs_menu_item();
            echo '</ul>';
        };
        ?>

        <?php if ( is_user_logged_in() ) :
            $user       = wp_get_current_user();
            $achord_role = class_exists('AMS_User_Role_Handler')
                           ? AMS_User_Role_Handler::get_role($user->ID)
                           : 'follower';

            // badge: הצעות פתוחות של המשתמש
            $open_proposals = 0;
            if ( class_exists('AMS_Edit_Proposal_Handler') ) {
                $open_proposals = count( get_posts([
                    'post_type'      => 'achord_edit_proposal',
                    'author'         => $user->ID,
                    'post_status'    => 'pending',
                    'posts_per_page' => -1,
                    'no_found_rows'  => true,
                    'fields'         => 'ids',
                ]) );
            }

            // badge: הצעות ממתינות לאישור (עורך/מנהל)
            $pending_proposals = 0;
            if ( current_user_can('edit_others_posts') && class_exists('AMS_Edit_Proposal_Handler') ) {
                $pending_proposals = count( AMS_Edit_Proposal_Handler::get_pending_proposals(200) );
            }

            $profile_url  = get_permalink( get_page_by_path('my-profile') )   ?: get_edit_profile_url($user->ID);
            $notebook_url = get_permalink( get_page_by_path('notebook') )      ?: '#';
            $saved_url    = get_permalink( get_page_by_path('saved-songs') )   ?: '#';
            $versions_url = get_permalink( get_page_by_path('my-versions') )   ?: '#';
            $add_url      = get_permalink( get_page_by_path('add-song') )      ?: '#';
            $review_url   = get_permalink( get_page_by_path('review-proposals') ) ?: '#';
            $logout_url   = wp_logout_url( home_url() );

            // כרטיס הזהות בראש התפריט מחליף את שורת "פרופיל אישי" שהייתה בתחתית:
            // מי אני מוצג במקום שבו מסתכלים קודם, ולא כשורה נוספת בין שאר השורות.
            $uc_role_labels = [
                'follower'    => 'עוקב',
                'contributor' => 'תורם',
                'editor'      => 'עורך',
                'admin'       => 'מנהל',
            ];
            $uc_role_label = isset( $uc_role_labels[ $achord_role ] ) ? $uc_role_labels[ $achord_role ] : '';
            $uc_name       = $user->display_name ? $user->display_name : $user->user_login;
            $uc_initial    = function_exists('mb_substr')
                             ? mb_substr( $uc_name, 0, 1, 'UTF-8' )
                             : substr( $uc_name, 0, 1 );
        ?>

        <a class="uc-me" href="<?php echo esc_url( $profile_url ); ?>">
          <span class="uc-me__avatar" aria-hidden="true"><?php echo esc_html( $uc_initial ); ?></span>
          <span class="uc-me__text">
            <span class="uc-me__name">
              <span class="screen-reader-text">הפרופיל שלי, </span><?php echo esc_html( $uc_name ); ?>
            </span>
            <span class="uc-me__mail"><?php echo esc_html( $user->user_email ); ?></span>
          </span>
          <?php if ( $uc_role_label ) : ?>
            <span class="uc-me__role"><?php echo esc_html( $uc_role_label ); ?></span>
          <?php endif; ?>
        </a>

        <nav class="achord-panel__nav" aria-label="ניווט ראשי">
          <ul class="achord-panel__nav-list">
            <?php
            uc_nav_item( home_url('/'),               'music', 'ספריית אקורדים' );
            uc_nav_item( home_url('/tavim-library/'), 'score', 'ספריית תווים' );
            uc_nav_item( home_url('/madrich/'),       'guide', 'מדריך' );
            ?>
          </ul>

          <?php uc_nav_group_title( 'uc-nav-mine', 'האזור שלי' ); ?>
          <ul class="achord-panel__nav-list" aria-labelledby="uc-nav-mine">
            <?php
            uc_nav_item( $notebook_url, 'notebook', 'המחברת שלי', $open_proposals );
            if ( in_array( $achord_role, ['contributor','editor','admin'], true ) ) {
                uc_nav_item( $add_url, 'add', 'הוספת שיר' );
            }
            if ( current_user_can('edit_others_posts') ) {
                uc_nav_item( $review_url, 'review', 'סקירת הצעות', $pending_proposals, true );
            }
            ?>
          </ul>

          <?php $render_device_group(); ?>

          <div class="achord-panel__links-row">
            <a href="<?php echo esc_url( home_url('/requests/') ); ?>">בקשות שירים</a>
            <a href="<?php echo esc_url( home_url('/contributors/') ); ?>">תורמים</a>
            <a href="<?php echo esc_url( home_url('/about/') ); ?>">אודות</a>
            <a href="<?php echo esc_url( home_url('/contact/') ); ?>">יצירת קשר</a>
          </div>

          <div class="uc-panel-foot">
            <a class="uc-logout" href="<?php echo esc_url( $logout_url ); ?>">
              <span class="achord-menu-icon"><?php echo achord_menu_icon('logout'); ?></span> התנתקות
            </a>
          </div>
        </nav>

        <?php else :
            $login_url    = home_url( '/login/' );
            // ההרשמה מתבצעת אוטומטית דרך זרם ההתחברות של Google (wp-login.php) —
            // אין עמוד /register/ נפרד, לכן מפנים לאותו יעד כדי למנוע 404.
            $register_url = $login_url;
        ?>

        <nav class="achord-panel__nav" aria-label="ניווט ראשי">
          <ul class="achord-panel__nav-list">
            <?php
            uc_nav_item( home_url('/'),               'music', 'ספריית אקורדים' );
            uc_nav_item( home_url('/tavim-library/'), 'score', 'ספריית תווים' );
            uc_nav_item( home_url('/madrich/'),       'guide', 'מדריך' );
            ?>
          </ul>

          <?php $render_device_group(); ?>

          <div class="achord-panel__links-row">
            <a href="<?php echo esc_url( home_url('/requests/') ); ?>">בקשות שירים</a>
            <a href="<?php echo esc_url( home_url('/contributors/') ); ?>">תורמים</a>
            <a href="<?php echo esc_url( home_url('/about/') ); ?>">אודות</a>
            <a href="<?php echo esc_url( home_url('/contact/') ); ?>">יצירת קשר</a>
          </div>
          <div class="achord-panel__divider"></div>
          <div class="achord-panel__auth-btns">
            <a class="achord-btn achord-btn--google" href="<?php echo esc_url( $login_url ); ?>">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              התחברות עם Google
            </a>
            <a class="achord-btn achord-btn--register" href="<?php echo esc_url( $register_url ); ?>">
              הרשמה
            </a>
          </div>
        </nav>

        <?php endif; ?>

      </div>
    </section>

  </header>
<?php }

function achord_setup_custom_header() {
    remove_action( 'generate_header',       'generate_construct_header' );
    remove_action( 'generate_after_header', 'generate_add_navigation_after_header' );
    add_action(    'generate_header',       'achord_custom_header_output' );
}
add_action( 'wp', 'achord_setup_custom_header' );

/**
 * קרדיטים לפוטר.
 *
 * להוספת קרדיט נוסף בעתיד: מוסיפים איבר למערך $credits.
 * מבנה איבר:
 *   'before'    => טקסט שמופיע לפני הקישור
 *   'link_text' => הטקסט שיהפוך לקישור (אפשר להשאיר ריק לקרדיט בלי קישור)
 *   'url'       => כתובת הקישור (ריק = בלי קישור)
 *   'after'     => טקסט שמופיע אחרי הקישור
 *
 * אפשר גם להוסיף/לשנות קרדיטים מבחוץ דרך הפילטר 'achord_footer_credits'.
 */
function achord_footer_credits() {
	$credits = array(
		array(
			'before'    => 'מאגר השירים מבוסס על ',
			'link_text' => 'ספר האקורדים הישראלי',
			'url'       => 'https://www.mustaki.com/guitarbook/',
			'after'     => ' של אורן מוסטקי, באישורו.',
		),
	);

	return apply_filters( 'achord_footer_credits', $credits );
}

/**
 * מדפיס את בלוק הקרדיטים בפוטר. לולאה על המערך שמחזירה achord_footer_credits().
 */
function achord_footer_credits_output() {
	$credits = achord_footer_credits();

	if ( empty( $credits ) || ! is_array( $credits ) ) {
		return;
	}

	echo '<div class="achord-footer__credits">';

	foreach ( $credits as $credit ) {
		$before    = isset( $credit['before'] )    ? (string) $credit['before']    : '';
		$link_text = isset( $credit['link_text'] ) ? (string) $credit['link_text'] : '';
		$url       = isset( $credit['url'] )       ? (string) $credit['url']       : '';
		$after     = isset( $credit['after'] )     ? (string) $credit['after']     : '';

		$line = esc_html( $before );

		if ( '' !== $link_text ) {
			if ( '' !== $url ) {
				$line .= '<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener">' . esc_html( $link_text ) . '</a>';
			} else {
				$line .= esc_html( $link_text );
			}
		}

		$line .= esc_html( $after );

		// כל רכיב עבר escaping בנפרד למעלה.
		echo '<p class="achord-footer__credit">' . $line . '</p>';
	}

	echo '</div>';
}

// ── 6. Custom footer ──────────────────────────────────────────────────────────
function achord_custom_footer_output() { ?>
  <footer class="achord-footer" role="contentinfo" dir="rtl">
    <div class="achord-footer__inner">
      <p class="achord-footer__tagline"><span dir="ltr">unichord</span> · החופש לנגן. אקורדים, מילים ותווים לשירי ארץ ישראל</p>
      <nav class="achord-footer__nav" aria-label="ניווט תחתון">
        <a href="<?php echo esc_url( home_url( '/' ) ); ?>">ראשי</a>
        <a href="<?php echo esc_url( home_url( '/madrich/' ) ); ?>">מדריך</a>
        <a href="<?php echo esc_url( home_url( '/requests/' ) ); ?>">בקשות שירים</a>
        <a href="<?php echo esc_url( home_url( '/contributors/' ) ); ?>">תורמים</a>
        <a href="<?php echo esc_url( home_url( '/about/' ) ); ?>">אודות</a>
        <a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>">יצירת קשר</a>
        <a href="<?php echo esc_url( home_url( '/copyright/' ) ); ?>">זכויות יוצרים</a>
      </nav>
      <?php achord_footer_credits_output(); ?>
      <p class="achord-footer__copy">
        &copy; <?php echo esc_html( date( 'Y' ) ); ?> <span dir="ltr">unichord</span> &mdash; כל הזכויות שמורות
      </p>
    </div>
  </footer>
<?php }

function achord_setup_custom_footer() {
    remove_action( 'generate_footer', 'generate_construct_footer' );

    if ( is_singular( 'achord_song_cpt' ) ) {
        // בדפי שיר: הפוטר שלנו מופיע אחרי שירים קשורים של הפלאגין (priority 20 > 10)
        add_action( 'wp_footer', 'achord_custom_footer_output', 20 );
    } else {
        // בשאר הדפים: פוטר רגיל במיקום GeneratePress
        add_action( 'generate_footer', 'achord_custom_footer_output' );
    }
}
add_action( 'wp', 'achord_setup_custom_footer' );

// ── 7. GeneratePress layout overrides ─────────────────────────────────────────
add_filter( 'generate_options', function ( $options ) {
    $options['container_width'] = 2000;
    if ( isset( $options['content_layout'] ) ) {
        $options['content_layout'] = 'one-container';
    }
    return $options;
} );

add_filter( 'generate_sidebar_layout', function () { return 'no-sidebar'; } );

// ── 8. Dynamic meta description + Open Graph (שיתוף בוואטסאפ/פייסבוק) ──────────

/**
 * מחזיר מחרוזות שיתוף לשיר: og_title (כותרת חזקה לשיתוף/SEO) ו-description.
 * מחזיר null אם אין דגלי תוכן.
 */
function achord_song_share_strings( $post_id ) {
    $raw_flags = get_post_meta( $post_id, '_achord_content_flags', true );
    $flags     = ( is_string( $raw_flags ) && $raw_flags !== '' )
        ? json_decode( $raw_flags, true )
        : [];
    if ( ! is_array( $flags ) || empty( $flags ) ) return null;

    $flag_labels = [
        'chords'        => 'אקורדים',
        'score'         => 'תווים',
        'lesson_guitar' => 'שיעור גיטרה',
        'lesson_piano'  => 'שיעור פסנתר',
    ];
    $parts = array_values( array_filter( array_map( fn( $f ) => $flag_labels[ $f ] ?? null, $flags ) ) );
    if ( empty( $parts ) ) return null;

    $content      = (string) get_post_field( 'post_content', $post_id );
    $singer_terms = get_the_terms( $post_id, 'singer' );
    $singer = ( ! is_wp_error( $singer_terms ) && ! empty( $singer_terms ) ) ? $singer_terms[0]->name : '';

    // שם השיר בלבד: [song_title] מהתוכן, אחרת כותרת הפוסט בלי סיומת "– אמן" (שאחרת מוכפלת)
    $song = '';
    if ( preg_match( '/\[song_title\](.*?)\[\/song_title\]/su', $content, $m ) ) $song = trim( wp_strip_all_tags( $m[1] ) );
    if ( $song === '' ) {
        $song = get_the_title( $post_id );
        if ( $singer ) $song = preg_replace( '/\s*[–\-]\s*' . preg_quote( $singer, '/' ) . '\s*$/u', '', $song );
    }
    $song = html_entity_decode( $song, ENT_QUOTES, 'UTF-8' );
    // "Silver Spear, The" → "The Silver Spear"
    $song = preg_replace( '/^(.+),\s*(The|A|An)$/u', '$2 $1', $song );

    $is_chords = in_array( 'chords', $flags, true );
    $label     = $is_chords ? 'אקורדים' : $parts[0];

    // כותרת לגוגל: "ליל אמש אקורדים – שולי נתן" (המילה שמחפשים בתוך הכותרת)
    $seo_title = $song . ' ' . $label;
    if ( $singer ) $seo_title .= ' – ' . $singer;

    // כותרת שיתוף בסגנון "אקורדים לשיר X - אמן"
    $og_title = $label . ' לשיר ' . $song;
    if ( $singer ) $og_title .= ' - ' . $singer;

    // אקורדי הגרסה הרגילה, לפי שכיחות
    $chords = [];
    if ( $is_chords ) {
        $body = preg_match( '/\[version=normal\](.*?)\[\/version\]/su', $content, $m ) ? $m[1] : '';
        if ( preg_match_all( '/\[([A-G](?:#|b)?[mMajindsugb0-9+°ø()\-]{0,8}(?:\/[A-G](?:#|b)?)?)\]/u', $body, $cm ) ) {
            $freq = array_count_values( $cm[1] );
            arsort( $freq );
            $chords = array_keys( $freq );
        }
    }
    $has_easy = get_post_meta( $post_id, '_ams_is_easy', true ) === '1';

    $bits = [ $label . ' לשיר ' . $song . ( $singer ? ' של ' . $singer : '' ) ];
    $n = count( $chords );
    if ( $n > 0 && $n <= 6 ) {
        $bits[] = $n . ' אקורדים: ' . implode( ' ', $chords );
    } elseif ( $n > 6 ) {
        $bits[] = 'אקורדים עיקריים: ' . implode( ' ', array_slice( $chords, 0, 5 ) );
    }
    if ( $has_easy ) $bits[] = 'יש גרסה קלה למתחילים';
    $extra = array_diff( $parts, [ $label ] );
    if ( $extra ) $bits[] = 'גם ' . implode( ', ', $extra );
    $description = implode( ' · ', $bits ) . '. ' . ( $is_chords ? 'שינוי סולם וגלילה אוטומטית, ' : '' ) . 'בחינם ביוניקורד.';

    return [ 'seo_title' => $seo_title, 'og_title' => $og_title, 'description' => $description ];
}

// כותרת הלשונית/גוגל בעמוד שיר: "ליל אמש אקורדים – שולי נתן | יוניקורד"
add_filter( 'document_title_parts', function ( $parts ) {
    if ( is_front_page() && ! is_paged() ) return [ 'title' => 'יוניקורד – אקורדים לשירים בעברית, בחינם ובלי פרסומות' ];
    if ( ! is_singular( 'achord_song_cpt' ) ) return $parts;
    $s = achord_song_share_strings( get_queried_object_id() );
    if ( ! $s ) return $parts;
    return [ 'title' => $s['seo_title'], 'site' => 'יוניקורד' ];
} );
add_filter( 'document_title_separator', function ( $sep ) {
    return is_singular( 'achord_song_cpt' ) ? '|' : $sep;
} );

add_action( 'wp_head', 'achord_song_meta_description', 1 );
function achord_song_meta_description() {
    if ( is_admin() || is_404() || is_search() ) return;
    if ( is_singular( 'achord_song_cpt' ) ) {
        $s = achord_song_share_strings( get_the_ID() );
        if ( ! $s ) return;
        echo '<meta name="description" content="' . esc_attr( $s['description'] ) . '">' . "\n";
        return;
    }
    // שאר העמודים (בית/עמודים/ארכיונים): אותה ברירת־מחדל ממותגת כמו ב-achord_open_graph_tags
    $desc = 'אקורדים, מילים ותווים לשירי ארץ ישראל. חינם, בלי פרסומות, קוד פתוח.';
    if ( is_front_page() ) $desc = 'מעל 1,400 שירים עם אקורדים לגיטרה ולפסנתר · גרסאות קלות למתחילים · שינוי סולם וגלילה אוטומטית · מחברת אישית ושמירה לשימוש בלי אינטרנט. בחינם ובלי פרסומות.';
    if ( is_singular() && has_excerpt( get_the_ID() ) ) {
        $ex = wp_strip_all_tags( get_the_excerpt( get_the_ID() ) );
        if ( $ex ) $desc = $ex;
    }
    echo '<meta name="description" content="' . esc_attr( $desc ) . '">' . "\n";
}

/**
 * תגי Open Graph + Twitter Card — לתצוגה מקדימה יפה בשיתוף (וואטסאפ/פייסבוק/טלגרם).
 * עשיר בעמודי שיר; ברירות מחדל ממותגות בשאר העמודים.
 */
add_action( 'wp_head', 'achord_open_graph_tags', 2 );
function achord_open_graph_tags() {
    if ( is_admin() ) return;

    $site_name = 'unichord';
    $image     = home_url( '/pwa-icons/icon-512.png' );
    $type      = 'website';
    $title     = '';
    $desc      = 'אקורדים, מילים ותווים לשירי ארץ ישראל. חינם, בלי פרסומות, קוד פתוח.';
    $url       = home_url( add_query_arg( [], $GLOBALS['wp']->request ?? '' ) );

    if ( is_singular( 'achord_song_cpt' ) ) {
        $pid   = get_the_ID();
        $url   = get_permalink( $pid );
        $type  = 'article';
        $s     = achord_song_share_strings( $pid );
        $title = $s ? $s['og_title'] : ( 'אקורדים לשיר ' . get_the_title( $pid ) );
        if ( $s ) $desc = $s['description'];
    } elseif ( is_front_page() || is_home() ) {
        $url   = home_url( '/' );
        $title = 'יוניקורד – אקורדים לשירים בעברית, בחינם ובלי פרסומות';
        $desc  = 'מעל 1,400 שירים עם אקורדים לגיטרה ולפסנתר · גרסאות קלות למתחילים · שינוי סולם וגלילה אוטומטית · מחברת אישית ושמירה לשימוש בלי אינטרנט. בחינם ובלי פרסומות.';
    } elseif ( is_singular() ) {
        $pid   = get_the_ID();
        $url   = get_permalink( $pid );
        $title = get_the_title( $pid );
        $ex    = has_excerpt( $pid ) ? wp_strip_all_tags( get_the_excerpt( $pid ) ) : '';
        if ( $ex ) $desc = $ex;
    } elseif ( is_post_type_archive() ) {
        $obj   = get_queried_object();
        $title = post_type_archive_title( '', false ) ?: ( $obj->labels->name ?? 'unichord' );
        $title = 'אקורדים ל' . $title . ' | unichord';
    } elseif ( is_tax() || is_category() || is_tag() ) {
        $obj   = get_queried_object();
        $title = single_term_title( '', false ) ?: ( $obj->name ?? 'unichord' );
        $title = 'אקורדים ל' . $title . ' | unichord';
    } else {
        $title = wp_get_document_title();
    }

    if ( ! $title ) $title = $site_name;

    $tags = [
        'og:site_name'   => $site_name,
        'og:locale'      => 'he_IL',
        'og:type'        => $type,
        'og:title'       => $title,
        'og:description' => $desc,
        'og:url'         => $url,
        'og:image'       => $image,
    ];

    echo "\n<!-- unichord Open Graph -->\n";
    foreach ( $tags as $prop => $val ) {
        echo '<meta property="' . esc_attr( $prop ) . '" content="' . esc_attr( $val ) . '">' . "\n";
    }
    echo '<meta property="og:image:width" content="512">' . "\n";
    echo '<meta property="og:image:height" content="512">' . "\n";
    echo '<meta name="twitter:card" content="summary">' . "\n";
    echo '<meta name="twitter:title" content="' . esc_attr( $title ) . '">' . "\n";
    echo '<meta name="twitter:description" content="' . esc_attr( $desc ) . '">' . "\n";
    echo '<meta name="twitter:image" content="' . esc_attr( $image ) . '">' . "\n";
}

// ── 8b. כפתור שיתוף בעמוד שיר (וואטסאפ/פייסבוק/העתקה/שיתוף-נייטיב) ─────────────
// מבוטל 20/7/26 לבקשת שניאור — להחזרה: הסר את ה-// משתי שורות ה-hook (כאן וב-wp_footer למטה)
// add_filter( 'the_content', 'achord_song_share_bar', 22 );
function achord_song_share_bar( $content ) {
    if ( ! is_singular( 'achord_song_cpt' ) || ! in_the_loop() || ! is_main_query() ) {
        return $content;
    }
    $pid   = get_the_ID();
    $url   = get_permalink( $pid );
    $s     = achord_song_share_strings( $pid );
    $label = $s ? $s['og_title'] : ( 'אקורדים לשיר ' . get_the_title( $pid ) );
    $wa    = 'https://wa.me/?text=' . rawurlencode( '🎸 ' . $label . '. ב-unichord: ' . $url );
    $fb    = 'https://www.facebook.com/sharer/sharer.php?u=' . rawurlencode( $url );

    $wa_icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.16c-.24.68-1.42 1.31-1.95 1.36-.5.05-1.13.21-3.8-.79-3.2-1.26-5.25-4.5-5.41-4.71-.16-.21-1.3-1.73-1.3-3.3 0-1.57.82-2.34 1.11-2.66.29-.32.64-.4.85-.4.21 0 .43 0 .61.01.2.01.46-.07.72.55.27.64.92 2.21 1 2.37.08.16.13.35.02.56-.1.21-.16.35-.32.53-.16.18-.34.41-.48.55-.16.16-.33.34-.14.66.19.32.85 1.4 1.83 2.27 1.26 1.12 2.32 1.47 2.64 1.63.32.16.51.13.7-.08.19-.21.81-.94 1.03-1.27.21-.32.43-.27.72-.16.29.11 1.86.88 2.18 1.04.32.16.53.24.61.37.08.13.08.74-.16 1.42z"/></svg>';

    ob_start(); ?>
    <aside class="uc-share" dir="rtl" aria-label="שיתוף השיר"
           data-share-url="<?php echo esc_url( $url ); ?>"
           data-share-title="<?php echo esc_attr( $label ); ?>">
        <span class="uc-share__label">אהבתם? שתפו עם מי שמנגן 🎶</span>
        <div class="uc-share__btns">
            <a class="uc-share__btn uc-share__btn--wa" href="<?php echo esc_url( $wa ); ?>" target="_blank" rel="noopener"><?php echo $wa_icon; ?> וואטסאפ</a>
            <a class="uc-share__btn uc-share__btn--fb" href="<?php echo esc_url( $fb ); ?>" target="_blank" rel="noopener">פייסבוק</a>
            <button type="button" class="uc-share__btn uc-share__btn--copy">העתקת קישור</button>
            <button type="button" class="uc-share__btn uc-share__btn--native" hidden>שיתוף…</button>
        </div>
    </aside>
    <?php
    return $content . ob_get_clean();
}

// add_action( 'wp_footer', 'achord_song_share_script' );  // מבוטל יחד עם פס-השיתוף (ראה 8b)
function achord_song_share_script() {
    if ( ! is_singular( 'achord_song_cpt' ) ) return;
    ?>
    <script>(function(){
        var bar = document.querySelector('.uc-share'); if (!bar) return;
        var url = bar.getAttribute('data-share-url'), title = bar.getAttribute('data-share-title');
        var copy = bar.querySelector('.uc-share__btn--copy');
        var nat  = bar.querySelector('.uc-share__btn--native');
        if (copy) copy.addEventListener('click', function(){
            var done = function(){ var t = copy.textContent; copy.textContent = 'הקישור הועתק ✓'; copy.classList.add('is-done'); setTimeout(function(){ copy.textContent = t; copy.classList.remove('is-done'); }, 1800); };
            if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(done).catch(function(){ window.prompt('העתיקו את הקישור:', url); }); }
            else { window.prompt('העתיקו את הקישור:', url); }
        });
        if (nat && navigator.share) { nat.hidden = false; nat.addEventListener('click', function(){ navigator.share({ title: title, url: url }).catch(function(){}); }); }
    })();</script>
    <?php
}

// ── 9. PWA — manifest, אייקונים ורישום Service Worker ─────────────────────────
// קבצי ה-PWA הסטטיים (manifest.webmanifest, service-worker.js, offline.html,
// pwa-icons/) יושבים ב-web root כדי לקבל scope של "/". כאן מזריקים את התגיות
// וההרשמה. ראה תוכנית שלב 2 (Workbox) בזיכרון הפרויקט.
add_action( 'wp_head', 'achord_pwa_head_tags', 2 );
function achord_pwa_head_tags() {
    $ver = '1'; // העלה בעדכון אייקונים/מניפסט כדי לעקוף קאש
    ?>
    <link rel="manifest" href="/manifest.webmanifest">
    <meta name="theme-color" content="#A9743F">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="unichord">
    <link rel="apple-touch-icon" href="/pwa-icons/apple-touch-icon.png?v=<?php echo $ver; ?>">
    <link rel="icon" type="image/svg+xml" href="/pwa-icons/icon.svg?v=<?php echo $ver; ?>">
    <link rel="icon" type="image/png" sizes="32x32" href="/pwa-icons/favicon-32.png?v=<?php echo $ver; ?>">
    <?php
}

add_action( 'wp_footer', 'achord_pwa_register_sw', 99 );
function achord_pwa_register_sw() {
    // נרשם רק על HTTPS (או localhost) — דרישת דפדפן ל-Service Worker.
    ?>
    <script>
    if ('serviceWorker' in navigator) {
      // רענון-אוטומטי כשמתפרסמת גרסה חדשה: ה-SW עושה skipWaiting בהתקנה, ואז כשהוא
      // משתלט (controllerchange) טוענים מחדש פעם אחת → חלונות פתוחים/אנונימי לא נתקעים
      // על קוד ישן (בלי Ctrl+Shift+R). מתעלמים בהתקנה ראשונה (אין controller קודם).
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController || window.__ucReloaded) return;
        window.__ucReloaded = true;
        window.location.reload();
      });
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
          .then(function (reg) { try { reg.update(); } catch (e) {} })
          .catch(function (err) { console.warn('[unichord PWA] רישום SW נכשל:', err); });
      });
    }
    </script>
    <?php
}

// התקנת אפליקציה — דרך פריט "התקן אפליקציה" בתפריט בלבד (בלי כפתור צף, לבקשת המשתמש).
// אנדרואיד/דסקטופ: beforeinstallprompt נייטיב. אייפון: מדריך מצויר (Safari לא תומך בהתקנה תוכניתית).
add_action( 'wp_footer', 'achord_pwa_install_button', 100 );
function achord_pwa_install_button() {
    ?>
    <style>
      /* מדריך התקנה לאייפון (bottom-sheet) */
      #uc-ios-sheet { position: fixed; inset: 0; z-index: 10002; display: none; }
      #uc-ios-sheet.is-open { display: block; }
      #uc-ios-sheet .uc-ios-backdrop { position: absolute; inset: 0; background: rgba(31,24,16,.55); }
      #uc-ios-sheet .uc-ios-card {
        position: absolute; inset-block-end: 0; inset-inline: 0; margin-inline: auto; max-width: 460px;
        background: #FCF8F1; border-radius: 22px 22px 0 0; padding: 22px 22px 30px;
        font-family: "Assistant", system-ui, sans-serif; color: #1F1810;
        box-shadow: 0 -12px 40px rgba(80,55,25,.28); animation: uc-rise .28s cubic-bezier(.2,.8,.2,1);
      }
      @keyframes uc-rise { from { transform: translateY(100%); } to { transform: translateY(0); } }
      #uc-ios-sheet .uc-ios-x { position: absolute; inset-block-start: 14px; inset-inline-end: 16px; background: none; border: 0; font-size: 1.1rem; color: #6B5D49; cursor: pointer; }
      #uc-ios-sheet .uc-ios-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
      #uc-ios-sheet .uc-ios-head img { width: 46px; height: 46px; border-radius: 11px; box-shadow: 0 3px 10px rgba(80,55,25,.2); }
      #uc-ios-sheet h3 { margin: 0; font-size: 1.18rem; }
      #uc-ios-sheet .uc-ios-sub { margin: 0 0 16px; color: #6B5D49; font-size: .92rem; }
      #uc-ios-sheet ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
      #uc-ios-sheet li { display: flex; align-items: center; gap: 12px; font-size: .98rem; line-height: 1.4; }
      #uc-ios-sheet .uc-ios-num {
        flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
        background: linear-gradient(135deg, #8A5C30, #6F4A26); color: #fff; font-weight: 700; font-size: .85rem;
      }
      #uc-ios-sheet .uc-ios-ic { flex: none; width: 24px; height: 24px; color: #A9743F; }
      #uc-ios-sheet .uc-ios-note {
        margin: 16px 0 0; padding: 10px 12px; background: #F0E6D8; border-radius: 10px;
        font-size: .86rem; color: #8A5C30; display: none;
      }
      #uc-ios-sheet .uc-ios-note.show { display: block; }
    </style>

    <div id="uc-ios-sheet" role="dialog" aria-label="התקנת unichord למסך הבית">
      <div class="uc-ios-backdrop"></div>
      <div class="uc-ios-card">
        <button class="uc-ios-x" aria-label="סגור"><?php echo ams_icon('x'); ?></button>
        <div class="uc-ios-head">
          <img src="/pwa-icons/icon-192.png" alt="unichord">
          <h3>התקנת unichord למסך הבית</h3>
        </div>
        <p class="uc-ios-sub">כדי להוסיף את האפליקציה למסך הבית, שלושה צעדים:</p>
        <ol>
          <li>
            <span class="uc-ios-num">1</span>
            <span>הקש על כפתור <strong>השיתוף</strong></span>
            <svg class="uc-ios-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="m8 8 4-4 4 4"/><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/></svg>
            <span>שבסרגל הדפדפן</span>
          </li>
          <li>
            <span class="uc-ios-num">2</span>
            <span>גלול ובחר <strong>"הוסף למסך הבית"</strong></span>
            <svg class="uc-ios-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 9v6M9 12h6"/></svg>
          </li>
          <li>
            <span class="uc-ios-num">3</span>
            <span>הקש <strong>"הוסף"</strong> בפינה העליונה, וזהו! 🎸</span>
          </li>
        </ol>
        <p class="uc-ios-note"><?php echo ams_icon('lightbulb'); ?> ההתקנה למסך הבית זמינה בדפדפן <strong>Safari</strong>. אם פתחת בדפדפן אחר, פתח את האתר ב-Safari.</p>
      </div>
    </div>

    <script>
    (function () {
      var sheet = document.getElementById('uc-ios-sheet');
      var menuItems = [].slice.call(document.querySelectorAll('.uc-install-menu-item'));
      var triggers = [].slice.call(document.querySelectorAll('.uc-install-trigger'));
      if (!sheet) return;

      var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      var ua = navigator.userAgent || '';
      var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var isSafari = !/crios|fxios|edgios|opios|opr\//i.test(ua);
      var deferred = null;

      function showMenu() { menuItems.forEach(function (li) { li.style.display = ''; }); }
      function hideMenu() { menuItems.forEach(function (li) { li.style.display = 'none'; }); }

      // כבר מותקנת → להסתיר את פריט ההתקנה
      if (standalone) { hideMenu(); return; }

      function openSheet() {
        if (!isSafari) sheet.querySelector('.uc-ios-note').classList.add('show');
        sheet.classList.add('is-open');
      }
      function closeSheet() { sheet.classList.remove('is-open'); }

      // התקנה — מופעלת מפריט התפריט בלבד
      function promptInstall() {
        if (isIOS) { openSheet(); return; }
        if (deferred) { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; }); }
        else { openSheet(); } // fallback: מדריך ידני (גם בדסקטופ ללא prompt)
      }
      window.ucPromptInstall = promptInstall;

      // זמינות פריט התפריט: אייפון תמיד; אנדרואיד/דסקטופ — כשהדפדפן מאשר התקנה
      if (isIOS) { showMenu(); }
      else {
        window.addEventListener('beforeinstallprompt', function (e) {
          e.preventDefault(); deferred = e; showMenu();
        });
      }

      triggers.forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); promptInstall(); }); });
      sheet.querySelector('.uc-ios-x').addEventListener('click', closeSheet);
      sheet.querySelector('.uc-ios-backdrop').addEventListener('click', closeSheet);

      window.addEventListener('appinstalled', function () { closeSheet(); hideMenu(); });
    })();
    </script>
    <?php
}

// ── 10. PWA — שמירת שיר לאופליין (opt-in, מקומי למכשיר, נפרד ממועדפים) ─────────
add_action( 'wp_enqueue_scripts', 'achord_pwa_offline_assets', 30 );
function achord_pwa_offline_assets() {
    // נטען בכל האתר — מסך "שירים לא מקוונים" נגיש מהתפריט מכל עמוד (כפתור השמירה עצמו רק בעמוד שיר).
    $path = get_stylesheet_directory() . '/assets/js/pwa-offline.js';
    wp_enqueue_script(
        'uc-pwa-offline',
        get_stylesheet_directory_uri() . '/assets/js/pwa-offline.js',
        [],
        file_exists( $path ) ? filemtime( $path ) : '1',
        true
    );
}

add_action( 'wp_footer', 'achord_pwa_offline_modal_styles', 101 );
function achord_pwa_offline_modal_styles() {
    // נטען בכל האתר — מסך הניהול נגיש מהתפריט. כפתורי 📥/🗂️ עצמם בסרגל השיר (בתוסף, ליד 🖨️).
    ?>
    <style>
      /* אייקוני SVG מוטמעים (עובדים אופליין, לא תלויים ב-Twemoji מ-s.w.org) */
      #uc-save-offline .uc-ic, #uc-offline-manage .uc-ic { width: 19px; height: 19px; display: block; }
      #uc-save-offline .uc-ic-saved { display: none; }
      #uc-save-offline.is-saved .uc-ic-save { display: none; }
      #uc-save-offline.is-saved .uc-ic-saved { display: block; color: #A9743F; }
      #uc-save-offline.is-busy { opacity: .5; pointer-events: none; }
      #uc-save-offline.is-saved { color: #A9743F; }

      .uc-toast {
        position: fixed; inset-block-end: 74px; inset-inline-start: 50%; transform: translate(50%, 12px);
        z-index: 10000; background: #1F1810; color: #FCF8F1; padding: 10px 18px; border-radius: 999px;
        font-family: "Assistant", system-ui, sans-serif; font-size: .9rem; opacity: 0;
        transition: opacity .25s ease, transform .25s ease; pointer-events: none; white-space: nowrap;
      }
      .uc-toast.is-in { opacity: 1; transform: translate(50%, 0); }

      #uc-offline-modal { position: fixed; inset: 0; z-index: 10001; display: none; }
      #uc-offline-modal.is-open { display: block; }
      #uc-offline-modal .uc-modal-backdrop { position: absolute; inset: 0; background: rgba(31,24,16,.5); }
      #uc-offline-modal .uc-modal-card {
        position: absolute; inset-block-end: 0; inset-inline: 0; margin-inline: auto; max-width: 480px;
        background: #FCF8F1; border-radius: 20px 20px 0 0; padding: 20px; max-height: 80vh; overflow: auto;
        font-family: "Assistant", system-ui, sans-serif; box-shadow: 0 -10px 40px rgba(80,55,25,.25);
      }
      @media (min-width: 520px) { #uc-offline-modal .uc-modal-card { inset-block: 50% auto; transform: translateY(-50%); border-radius: 20px; } }
      #uc-offline-modal .uc-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
      #uc-offline-modal h2 { font-size: 1.2rem; margin: 0; color: #1F1810; }
      #uc-offline-modal .uc-modal-x { background: none; border: 0; font-size: 1.1rem; cursor: pointer; color: #6B5D49; padding: 6px; }
      #uc-offline-modal .uc-modal-meta { color: #6B5D49; font-size: .85rem; margin-bottom: 12px; }
      #uc-offline-modal .uc-modal-list { list-style: none; margin: 0; padding: 0; }
      #uc-offline-modal .uc-modal-list li { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid #E6D9C2; }
      #uc-offline-modal .uc-item-title { flex: 1; color: #1F1810; text-decoration: none; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #uc-offline-modal .uc-item-size { color: #6B5D49; font-size: .82rem; }
      #uc-offline-modal .uc-item-remove { background: none; border: 1px solid #DED4C2; border-radius: 999px; padding: 4px 12px; cursor: pointer; color: #9E482D; font: inherit; font-size: .82rem; }
      #uc-offline-modal .uc-empty { color: #6B5D49; text-align: center; padding: 24px 0; }
      #uc-offline-modal .uc-modal-foot { margin-top: 14px; text-align: center; }
      #uc-offline-modal .uc-clear-all { background: none; border: 0; color: #9E482D; cursor: pointer; font: inherit; font-size: .88rem; text-decoration: underline; }

      /* דף הבית במצב לא מקוון — מציג רק את השירים השמורים */
      #uc-offline-home {
        position: fixed; inset: 0; z-index: 10040; display: none; overflow-y: auto;
        background: #F7F3EC; font-family: "Assistant", system-ui, sans-serif; padding: 58px 20px 40px;
      }
      #uc-offline-home.is-on { display: block; }
      #uc-offline-home .uc-oh-card { max-width: 520px; margin: 0 auto; text-align: center; }
      #uc-offline-home .uc-oh-logo { width: 62px; height: 62px; border-radius: 14px; box-shadow: 0 4px 14px rgba(80,55,25,.18); }
      #uc-offline-home .uc-oh-badge { display: inline-block; margin: 14px 0 4px; padding: 4px 12px; border-radius: 999px; background: #F0DACF; color: #9E482D; font-weight: 600; font-size: .82rem; }
      #uc-offline-home h2 { margin: 8px 0 20px; color: #1F1810; font-size: 1.4rem; }
      #uc-offline-home .uc-oh-list { list-style: none; margin: 0 0 22px; padding: 0; text-align: start; display: flex; flex-direction: column; gap: 10px; }
      #uc-offline-home .uc-oh-item { display: flex; align-items: center; gap: 10px; padding: 15px 18px; background: #FCF8F1; border: 1px solid #DED4C2; border-radius: 14px; color: #1F1810; text-decoration: none; font-weight: 600; box-shadow: 0 2px 8px rgba(80,55,25,.06); transition: border-color .15s ease, transform .15s ease; }
      #uc-offline-home .uc-oh-item:hover { border-color: #A9743F; transform: translateY(-1px); }
      #uc-offline-home .uc-oh-item svg { width: 18px; height: 18px; color: #A9743F; flex: none; }
      #uc-offline-home .uc-oh-empty { color: #6B5D49; padding: 36px 14px; text-align: center; line-height: 1.6; }
      #uc-offline-home .uc-oh-retry { background: transparent; color: #8A5C30; border: 1.5px solid #DED4C2; border-radius: 999px; padding: 11px 26px; font: inherit; font-weight: 600; cursor: pointer; }
      #uc-offline-home .uc-oh-retry:hover { background: rgba(169,116,63,.06); }
    </style>
    <?php
}

// ── 11. PWA — חיווי "מצב לא מקוון" (פס עליון כשאין חיבור) ──────────────────────
add_action( 'wp_footer', 'achord_pwa_offline_indicator', 102 );
function achord_pwa_offline_indicator() {
    ?>
    <style>
      #uc-offline-bar {
        position: fixed; inset-block-start: 0; inset-inline: 0; z-index: 10050;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        background: #9E482D; color: #fff; font-family: "Assistant", system-ui, sans-serif;
        font-weight: 600; font-size: .9rem; padding: 8px 14px; text-align: center;
        transform: translateY(-100%); transition: transform .25s ease; box-shadow: 0 2px 10px rgba(0,0,0,.18);
      }
      #uc-offline-bar.is-on { transform: translateY(0); }
      #uc-offline-bar svg { width: 17px; height: 17px; flex: none; }
    </style>
    <div id="uc-offline-bar" role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
      <span>מצב לא מקוון. מוצג תוכן שכבר נטען / שמרת במכשיר</span>
    </div>
    <script>
    (function () {
      var bar = document.getElementById('uc-offline-bar');
      if (!bar) return;
      function update() { bar.classList.toggle('is-on', !navigator.onLine); }
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      update();
    })();
    </script>
    <?php
}

/* ═══════════════════════════════════════════════════════════════════════════
 * טופס "צור קשר" — מינימלי, עם הגנה רב-שכבתית נגד בוטים/ספאם (ללא שירות חיצוני)
 *
 * shortcode:  [achord_contact_form]   (מוטמע ב-page-contact.php)
 * שליחה:      admin-post.php  →  achord_contact_handle()  →  PRG redirect
 * שכבות הגנה: nonce · honeypot · מלכודת-זמן חתומה · טוקן-JS · rate-limit · סניטציה
 * ═══════════════════════════════════════════════════════════════════════════ */

/** חתימת חותמת-הזמן (מונעת זיוף של שדה הזמן ע"י בוט). */
function achord_contact_sign( $ts ) {
    return substr( wp_hash( 'achord_contact|' . $ts ), 0, 24 );
}

/** מפתח אחיד ל-rate-limit ול-transient של פידבק לפי כתובת ה-IP. */
function achord_contact_client_key() {
    $ip = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
    return md5( 'achord_contact|' . $ip );
}

/** מציג את טופס יצירת הקשר (shortcode). */
function achord_contact_form_shortcode() {
    $ts        = time();
    $tsh       = achord_contact_sign( $ts );
    $action    = esc_url( admin_url( 'admin-post.php' ) );

    // פידבק מסבב קודם (PRG): סטטוס, שגיאות וערכים ישנים — נקרא ונמחק.
    $key       = achord_contact_client_key();
    $feedback  = get_transient( 'achord_contact_fb_' . $key );
    if ( $feedback ) { delete_transient( 'achord_contact_fb_' . $key ); }
    $errors    = ( $feedback && ! empty( $feedback['errors'] ) ) ? $feedback['errors'] : [];
    $old       = ( $feedback && ! empty( $feedback['old'] ) )    ? $feedback['old']    : [];
    $sent      = isset( $_GET['uc_contact'] ) && 'sent' === $_GET['uc_contact'];

    $v = function ( $field ) use ( $old ) {
        return isset( $old[ $field ] ) ? esc_attr( $old[ $field ] ) : '';
    };
    $ta = function ( $field ) use ( $old ) {
        return isset( $old[ $field ] ) ? esc_textarea( $old[ $field ] ) : '';
    };

    ob_start();
    ?>
    <section class="uc-contact" aria-labelledby="uc-contact-h" dir="rtl">
      <h2 id="uc-contact-h">שליחת הודעה</h2>

      <?php if ( $sent ) : ?>
        <div class="uc-contact__alert uc-contact__alert--ok" role="status">
          <strong>תודה! ההודעה נשלחה.</strong> נשתדל לחזור אליכם בהקדם.
        </div>
      <?php elseif ( ! empty( $errors ) ) : ?>
        <div class="uc-contact__alert uc-contact__alert--err" role="alert">
          <strong>ההודעה לא נשלחה:</strong>
          <ul>
            <?php foreach ( $errors as $e ) : ?>
              <li><?php echo esc_html( $e ); ?></li>
            <?php endforeach; ?>
          </ul>
        </div>
      <?php endif; ?>

      <form class="uc-contact__form" method="post" action="<?php echo $action; ?>" novalidate>
        <input type="hidden" name="action" value="achord_contact">
        <?php wp_nonce_field( 'achord_contact_send', 'achord_contact_nonce' ); ?>
        <input type="hidden" name="uc_ts"  value="<?php echo esc_attr( $ts ); ?>">
        <input type="hidden" name="uc_tsh" value="<?php echo esc_attr( $tsh ); ?>">
        <input type="hidden" name="uc_js"  value="" id="uc-contact-js">

        <?php /* Honeypot — מוסתר מבני אדם; בוטים נוטים למלא. אסור autofill. */ ?>
        <div class="uc-contact__hp" aria-hidden="true">
          <label for="uc-website">אל תמלאו שדה זה</label>
          <input type="text" id="uc-website" name="uc_website" tabindex="-1" autocomplete="off">
        </div>

        <div class="uc-contact__field">
          <label for="uc-name">שם <span class="uc-contact__req">*</span></label>
          <input type="text" id="uc-name" name="uc_name" required maxlength="80"
                 autocomplete="name" value="<?php echo $v( 'name' ); ?>">
        </div>

        <div class="uc-contact__field">
          <label for="uc-email">אימייל <span class="uc-contact__req">*</span></label>
          <input type="email" id="uc-email" name="uc_email" required maxlength="120"
                 autocomplete="email" inputmode="email" value="<?php echo $v( 'email' ); ?>">
        </div>

        <div class="uc-contact__field">
          <label for="uc-message">הודעה <span class="uc-contact__req">*</span></label>
          <textarea id="uc-message" name="uc_message" required rows="6" maxlength="4000"><?php echo $ta( 'message' ); ?></textarea>
        </div>

        <button type="submit" class="uc-btn uc-btn--primary uc-contact__submit">שליחת ההודעה</button>
        <p class="uc-contact__note">השדות מוגנים מפני שליחה אוטומטית. לא נשתף את הפרטים שלכם עם אף אחד.</p>
      </form>
    </section>

    <script>
    (function () {
      /* טוקן-JS: שדה שמתמלא רק כשרץ JavaScript אמיתי בדפדפן. */
      var f = document.getElementById('uc-contact-js');
      if (f) { f.value = '1'; }
    })();
    </script>
    <?php
    return ob_get_clean();
}
add_shortcode( 'achord_contact_form', 'achord_contact_form_shortcode' );

/** עוזר PRG: שומר פידבק (שגיאות+ערכים ישנים) ומפנה חזרה לעמוד יצירת הקשר. */
function achord_contact_redirect( $status, $errors = [], $old = [] ) {
    $back = wp_get_referer();
    if ( ! $back ) { $back = home_url( '/contact/' ); }
    $back = remove_query_arg( [ 'uc_contact' ], $back );

    if ( 'sent' === $status ) {
        wp_safe_redirect( add_query_arg( 'uc_contact', 'sent', $back ) . '#uc-contact-h' );
    } else {
        set_transient(
            'achord_contact_fb_' . achord_contact_client_key(),
            [ 'errors' => $errors, 'old' => $old ],
            120
        );
        wp_safe_redirect( add_query_arg( 'uc_contact', 'err', $back ) . '#uc-contact-h' );
    }
    exit;
}

/** מטפל שליחת הטופס: בודק את כל שכבות ההגנה, ואז שולח מייל למנהל. */
function achord_contact_handle() {
    // ── 1. Nonce (CSRF + מקור מהאתר) ──
    if ( empty( $_POST['achord_contact_nonce'] )
         || ! wp_verify_nonce( $_POST['achord_contact_nonce'], 'achord_contact_send' ) ) {
        achord_contact_redirect( 'err', [ 'תוקף הטופס פג. רעננו את העמוד ונסו שוב.' ] );
    }

    // ── 2. Honeypot — אם מולא, זה בוט. מדמים הצלחה ושותקים. ──
    if ( ! empty( $_POST['uc_website'] ) ) {
        achord_contact_redirect( 'sent' );
    }

    // ── 3. טוקן-JS — בוטים שלא מריצים JS משאירים ריק. ──
    if ( empty( $_POST['uc_js'] ) || '1' !== $_POST['uc_js'] ) {
        achord_contact_redirect( 'sent' ); // דחייה שקטה כלפי בוטים
    }

    // ── 4. מלכודת-זמן חתומה — מונעת שליחה מיידית / חותמת מזויפת. ──
    $ts  = isset( $_POST['uc_ts'] )  ? absint( $_POST['uc_ts'] ) : 0;
    $tsh = isset( $_POST['uc_tsh'] ) ? sanitize_text_field( wp_unslash( $_POST['uc_tsh'] ) ) : '';
    if ( ! $ts || ! hash_equals( achord_contact_sign( $ts ), $tsh ) ) {
        achord_contact_redirect( 'sent' ); // חותמת מזויפת → בוט
    }
    $elapsed = time() - $ts;
    if ( $elapsed < 3 )        { achord_contact_redirect( 'sent' ); }                 // מהיר מדי = בוט
    if ( $elapsed > 2 * HOUR_IN_SECONDS ) {
        achord_contact_redirect( 'err', [ 'הטופס היה פתוח זמן רב מדי. רעננו ונסו שוב.' ] );
    }

    // ── 5. Rate-limit — מקס' 3 שליחות ל-10 דקות לכל IP. ──
    $rl_key = 'achord_contact_rl_' . achord_contact_client_key();
    $count  = (int) get_transient( $rl_key );
    if ( $count >= 3 ) {
        achord_contact_redirect( 'err', [ 'נשלחו יותר מדי הודעות בזמן קצר. נסו שוב מאוחר יותר.' ] );
    }

    // ── 6. סניטציה + ולידציה של הקלט ──
    $name    = isset( $_POST['uc_name'] )    ? sanitize_text_field( wp_unslash( $_POST['uc_name'] ) )      : '';
    $email   = isset( $_POST['uc_email'] )   ? sanitize_email( wp_unslash( $_POST['uc_email'] ) )           : '';
    $message = isset( $_POST['uc_message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['uc_message'] ) ) : '';
    $old     = [ 'name' => $name, 'email' => $email, 'message' => $message ];

    $errors = [];
    if ( '' === $name )                  { $errors[] = 'נא למלא שם.'; }
    if ( ! is_email( $email ) )          { $errors[] = 'נא למלא כתובת אימייל תקינה.'; }
    if ( mb_strlen( $message ) < 5 )     { $errors[] = 'נא לכתוב הודעה (לפחות כמה מילים).'; }
    // הגנת header-injection: שם/אימייל לא יכילו שורות חדשות.
    if ( preg_match( '/[\r\n]/', $name . $email ) ) { $errors[] = 'הקלט מכיל תווים לא חוקיים.'; }
    if ( $errors ) {
        achord_contact_redirect( 'err', $errors, $old );
    }

    // ── חסימת ספאם עתיר-קישורים (סימן מובהק לבוטים) — דחייה שקטה. ──
    if ( preg_match_all( '~https?://~i', $message ) > 4 ) {
        achord_contact_redirect( 'sent' );
    }

    // ── מעבר ההגנות: רישום ל-rate-limit + שליחת המייל ──
    set_transient( $rl_key, $count + 1, 10 * MINUTE_IN_SECONDS );

    $to      = get_option( 'admin_email' );
    $site    = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
    $subject = sprintf( '[%s] הודעה חדשה מטופס יצירת קשר', $site );

    $ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '—';
    $body  = "התקבלה הודעה חדשה מטופס יצירת הקשר באתר.\n\n";
    $body .= "שם:    {$name}\n";
    $body .= "אימייל: {$email}\n";
    $body .= "------------------------------------------\n";
    $body .= $message . "\n";
    $body .= "------------------------------------------\n\n";
    $body .= "נשלח: " . wp_date( 'Y-m-d H:i' ) . "  ·  IP: {$ip}\n";

    // Reply-To = שולח, כדי שאפשר יהיה להשיב ישירות. From נשאר ברירת-המחדל (דליברביליות).
    $headers = [
        'Content-Type: text/plain; charset=UTF-8',
        sprintf( 'Reply-To: %s <%s>', $name, $email ),
    ];

    $ok = wp_mail( $to, $subject, $body, $headers );

    if ( ! $ok ) {
        achord_contact_redirect( 'err', [ 'אירעה תקלה בשליחת ההודעה. נסו שוב מאוחר יותר.' ], $old );
    }
    achord_contact_redirect( 'sent' );
}
add_action( 'admin_post_nopriv_achord_contact', 'achord_contact_handle' );
add_action( 'admin_post_achord_contact',        'achord_contact_handle' );

// ── רכיב נגישות (כפתור צף + פאנל) ───────
// מודול עצמאי — ראה inc/uc-a11y.php
require_once get_stylesheet_directory() . '/inc/uc-a11y.php';
