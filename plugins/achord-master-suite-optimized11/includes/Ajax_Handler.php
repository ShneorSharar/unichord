<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Ajax_Handler
 * מטפל בכל בקשות ה-AJAX של התוסף.
 */
class AMS_Ajax_Handler {

    /**
     * Rate limiter using transients.
     * @param string $action   Unique key for this action.
     * @param int    $limit    Max requests allowed.
     * @param int    $window   Time window in seconds.
     * @return bool True if allowed, false if rate limit exceeded.
     */
    private function check_rate_limit( string $action, int $limit, int $window ): bool {
        $ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
        $uid = get_current_user_id();
        // Use user ID when logged in, IP otherwise
        $identity = $uid > 0 ? 'u' . $uid : 'ip' . md5( $ip );
        $key      = 'ams_rl_' . $action . '_' . $identity;

        $count = (int) get_transient( $key );
        if ( $count >= $limit ) {
            return false;
        }
        if ( $count === 0 ) {
            set_transient( $key, 1, $window );
        } else {
            set_transient( $key, $count + 1, $window );
        }
        return true;
    }

    public function __construct() {
        // AJAX לשליחת שיר חדש
        add_action('wp_ajax_achord_submit_song', [$this, 'handle_song_submission']);
        add_action('wp_ajax_nopriv_achord_submit_song', [$this, 'handle_song_submission']);
        
        // AJAX לחיפוש שירים
        add_action('wp_ajax_achord_search_songs', [$this, 'handle_song_search']);
        add_action('wp_ajax_nopriv_achord_search_songs', [$this, 'handle_song_search']);
        
        // AJAX לתצוגה מקדימה של אקורדים
        add_action('wp_ajax_achord_live_preview', [$this, 'handle_chords_live_preview']);
add_action('wp_ajax_nopriv_achord_live_preview', [$this, 'handle_chords_live_preview']);
        
        // AJAX לתצוגה מקדימה של תווים
        add_action('wp_ajax_tavim_preview', [$this, 'handle_tavim_live_preview']);
        add_action('wp_ajax_nopriv_tavim_preview', [$this, 'handle_tavim_live_preview']);
    }

    /**
     * מטפל בלוגיקת שליחת טופס העלאת השיר.
     */
    public function handle_song_submission() {
        if (!check_ajax_referer('achord_upload_nonce', 'achord_nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        // Rate limit: 5/hour for guests, 20/hour for logged-in users
        $limit = is_user_logged_in() ? 20 : 5;
        if ( ! $this->check_rate_limit( 'submit_song', $limit, HOUR_IN_SECONDS ) ) {
            wp_send_json_error('שלחת יותר מדי שירים. נסה שוב בעוד שעה.');
        }

        // הצהרת רישיון. תיבת הסימון בטופס מסומנת required, אבל זה נאכף
        // בדפדפן בלבד — הבדיקה שקובעת היא כאן.
        if ( empty( $_POST['license_consent'] ) ) {
            wp_send_json_error('צריך לאשר את הצהרת הרישיון לפני שליחת השיר.');
        }

        $title = sanitize_text_field(wp_unslash($_POST['title'] ?? ''));
        $performer = sanitize_text_field(wp_unslash($_POST['performer'] ?? ''));
        $content = isset($_POST['version_normal']) ? wp_kses_post(wp_unslash($_POST['version_normal'])) : '';
        // סרטוני שיעור — נשמרים כמטא (`lesson_video_*`), בדיוק כמו תיבת המטא
        // ב-wp-admin. שדה אחד "סרטון שיעור" לא היה ניתן למיפוי לאף אחד מהשניים.
        $lesson_video_guitar = isset($_POST['lesson_video_guitar']) ? esc_url_raw(wp_unslash($_POST['lesson_video_guitar'])) : '';
        $lesson_video_piano  = isset($_POST['lesson_video_piano'])  ? esc_url_raw(wp_unslash($_POST['lesson_video_piano']))  : '';
        $original_song_url = isset($_POST['youtube']) ? esc_url_raw(wp_unslash($_POST['youtube'])) : '';
        $author_id = get_current_user_id();
        // Separate fields for lyrics and music authors. If both are empty, fallback to legacy 'writer' field for backwards compatibility.
        $lyrics_by = isset($_POST['lyrics_by']) ? sanitize_text_field(wp_unslash($_POST['lyrics_by'])) : '';
        $music_by  = isset($_POST['music_by']) ? sanitize_text_field(wp_unslash($_POST['music_by'])) : '';
        // Legacy writer field support
        $writer = isset($_POST['writer']) ? sanitize_text_field(wp_unslash($_POST['writer'])) : '';
        $capo = isset($_POST['capo']) && is_numeric($_POST['capo']) ? intval($_POST['capo']) : 0;
        $level_id = isset($_POST['song_level']) ? intval($_POST['song_level']) : 0;
        // ערך הטרנספוזיה לגרסה הקלה (חצי טונים). אם לא מוגדר או לא מספרי – 0.
        $easy_transpose = isset($_POST['easy_transpose']) && is_numeric($_POST['easy_transpose']) ? floatval($_POST['easy_transpose']) : 0;

        // ── אבטחה: כל שדה-טקסט חופשי מוזרק לתוך [achord_song]…[/achord_song],
        // שעובר do_shortcode בכל צפייה. `wp_kses_post`/`sanitize_text_field`
        // אינם נוגעים בסוגריים מרובעים, ולכן `[/achord_song]` בתוך שדה סוגר
        // את השורטקוד מוקדם וכל מה שאחריו מורץ כשורטקוד עצמאי.
        // אקורדים (`[Am]`) שורדים — ראה AMS_Content_Guard. ──
        $title             = AMS_Content_Guard::strip_structural_tags($title);
        $performer         = AMS_Content_Guard::strip_structural_tags($performer);
        $content           = AMS_Content_Guard::strip_structural_tags($content);
        $lyrics_by         = AMS_Content_Guard::strip_structural_tags($lyrics_by);
        $music_by          = AMS_Content_Guard::strip_structural_tags($music_by);
        $writer            = AMS_Content_Guard::strip_structural_tags($writer);
        $original_song_url = AMS_Content_Guard::strip_structural_tags($original_song_url);
        // ($capo/$easy_transpose/$tempo מספריים; $strumming ו-$version_easy מסוננים במקום הגדרתם)

        $genres = [];
        if (isset($_POST['song_genres']) && is_array($_POST['song_genres'])) {
            foreach ($_POST['song_genres'] as $genre) { $genres[] = sanitize_text_field($genre); }
        }

        if (empty($title) || empty($performer) || empty($content)) {
            wp_send_json_error('חובה למלא שם שיר, מבצע, ותוכן אקורדים.');
        }

        // Build the chord post content. Use [lyrics_by] and [music_by] shortcodes when provided;
        // otherwise fall back to [writer] for backwards compatibility.  The order of meta
        // fields matches the display template in render_song_shortcode().
        $author_sections = '';
        if ($lyrics_by !== '') {
            $author_sections .= "[lyrics_by]{$lyrics_by}[/lyrics_by]\n";
        }
        if ($music_by !== '') {
            $author_sections .= "[music_by]{$music_by}[/music_by]\n";
        }
        // If legacy writer exists and both lyrics_by and music_by are empty, use it
        if ($author_sections === '' && $writer !== '') {
            $author_sections .= "[writer]{$writer}[/writer]\n";
        }
// הוספת שדות קצב ופריטה לפני השורה של post content
$tempo = isset($_POST['tempo']) && is_numeric($_POST['tempo']) ? intval($_POST['tempo']) : null;
$strumming = isset($_POST['strumming']) ? AMS_Content_Guard::strip_structural_tags(sanitize_text_field(wp_unslash($_POST['strumming']))) : '';

$chords_post_content = "[achord_song]\n[song_title]{$title}[/song_title]\n[performer]{$performer}[/performer]\n" .
    $author_sections .
    "[capo]{$capo}[/capo]\n[youtube]{$original_song_url}[/youtube]\n" .
    "[easy_transpose]{$easy_transpose}[/easy_transpose]\n";

// הוספת שדות קצב ופריטה
if ($tempo !== null) {
    $chords_post_content .= "[tempo]{$tempo}[/tempo]\n";
}
if (!empty($strumming)) {
    $chords_post_content .= "[strumming]{$strumming}[/strumming]\n";
}

$chords_post_content .= "[version=normal]\n" . trim($content) . "\n[/version]\n";

// אם קיים תוכן לגרסה קלה, הוסף אותו
$version_easy = isset($_POST['version_easy']) ? AMS_Content_Guard::strip_structural_tags(wp_kses_post(wp_unslash($_POST['version_easy']))) : '';
if (!empty(trim($version_easy))) {
    $chords_post_content .= "[version=easy]\n" . trim($version_easy) . "\n[/version]\n";
}

$chords_post_content .= "[/achord_song]";
        $chords_post_id = wp_insert_post([
            'post_title' => $title . ' – ' . $performer, 'post_content' => $chords_post_content, 'post_status' => 'pending',
            'post_author' => $author_id, 'post_type' => 'achord_song_cpt'
        ]);
        if (is_wp_error($chords_post_id)) {
            wp_send_json_error('שגיאה ביצירת עמוד האקורדים.');
        }

        // רישום ההסכמה על השיר: מתי, מי, ועל איזה נוסח בדיוק.
        if ( function_exists( 'uc_license_consent_record' ) ) {
            uc_license_consent_record( $chords_post_id );
        }

        // שיוך טקסונומיות.
        //
        // שם זמר או ז'אנר שכבר קיים במאגר משויך מיד, בדיוק כמו קודם.
        // שם חדש לגמרי לא נוצר כאן — הוא נשמר כהצעה ומחכה לאישור, והוא
        // הופך לטרם אמיתי רק כשמאשרים ומפרסמים את השיר. אחרת כל אורח
        // שממציא שם היה מייצר קטגוריה חדשה באתר בלי שאף אחד ראה אותה.
        //
        // הלוגיקה עצמה יושבת ב-mu-plugin uc-term-approval.php. אם הוא
        // יימחק, הבלוק הזה חוזר להתנהגות המקורית ולא נשבר כלום.
        if ( function_exists( 'uc_assign_or_propose_terms' ) ) {
            $proposed = [];
            if ( ! empty( $performer ) ) {
                uc_assign_or_propose_terms( $chords_post_id, [ $performer ], 'singer', $proposed );
            }
            if ( ! empty( $genres ) ) {
                uc_assign_or_propose_terms( $chords_post_id, $genres, 'genre', $proposed );
            }
            if ( ! empty( $proposed ) ) {
                update_post_meta( $chords_post_id, '_uc_proposed_terms', $proposed );
            }
        } else {
            if ( ! empty( $performer ) ) wp_set_object_terms( $chords_post_id, $performer, 'singer', true );
            if ( ! empty( $genres ) )    wp_set_object_terms( $chords_post_id, $genres, 'genre', true );
        }

        // דרגת קושי מגיעה כמזהה מספרי של טרם קיים, ולכן אין כאן יצירה של שם חדש.
        if ( $level_id > 0 ) {
            wp_set_object_terms( $chords_post_id, (int) $level_id, 'level', true );
        }

        // סרטוני שיעור. אותם מפתחות מטא בדיוק שתיבת המטא ב-wp-admin כותבת,
        // כך שעורך יראה אותם בעמוד העריכה ויוכל לתקן. עד כה שדה הווידאו בטופס
        // נקרא אך מעולם לא נשמר.
        // `_achord_content_flags` לא מחושב כאן: `index_song_data_on_save` דורש
        // `edit_post` ולכן יוצא מוקדם עבור אורח. הוא ירוץ בשמירה הבאה — כלומר
        // באישור השיר, שהוא ממילא הרגע שבו השיר נכנס לחיפוש.
        if ( $lesson_video_guitar !== '' ) {
            update_post_meta( $chords_post_id, 'lesson_video_guitar', $lesson_video_guitar );
        }
        if ( $lesson_video_piano !== '' ) {
            update_post_meta( $chords_post_id, 'lesson_video_piano', $lesson_video_piano );
        }

        wp_send_json_success("✅ השיר הועלה בהצלחה ונשלח לבדיקה!");
    }

    /**
     * AJAX: חיפוש מתקדם (Word-by-word) סלחני + סינון אמן, ז'אנר וקושי
     */
    public function handle_song_search() {
        // Nonce check is optional for public search (read-only).
        // Cached pages may have expired nonces, so we don't block on failure.

        // Rate limit: 120 searches/hour per user/IP
        if ( ! $this->check_rate_limit( 'search', 120, HOUR_IN_SECONDS ) ) {
            wp_send_json_error('יותר מדי בקשות חיפוש. נסה שוב בעוד מעט.');
        }

        global $wpdb;

        $query_string = isset($_POST['query']) ? substr( sanitize_text_field(wp_unslash($_POST['query'])), 0, 100 ) : '';

        // Limit search complexity: no more than 8 words
        if ( ! empty( $query_string ) ) {
            $words = array_filter( explode( ' ', $query_string ) );
            if ( count( $words ) > 8 ) {
                wp_send_json_error('שאילתת החיפוש ארוכה מדי.');
            }
        }
        $singer       = isset($_POST['singer']) ? intval($_POST['singer']) : 0;
        $genre        = isset($_POST['genre']) ? intval($_POST['genre']) : 0;
        $difficulty   = isset($_POST['difficulty']) ? sanitize_text_field(wp_unslash($_POST['difficulty'])) : '';
        $content_type = isset($_POST['content_type']) ? sanitize_text_field(wp_unslash($_POST['content_type'])) : '';

        // אם הכל ריק — לא מריצים חיפוש מיותר
        if (empty($query_string) && $singer === 0 && $genre === 0 && empty($difficulty) && empty($content_type)) {
            wp_send_json_success(['results' => [], 'count' => 0]);
        }

        $args = [
            'post_type'      => 'achord_song_cpt',
            'post_status'    => 'publish',
            'posts_per_page' => 40,
        ];

        // פילטרים טקסונומיים — באמצעות term_id (חסין לקידוד עברי)
        if ($singer > 0) $args['tax_query'][] = ['taxonomy' => 'singer', 'field' => 'term_id', 'terms' => $singer];
        if ($genre > 0)  $args['tax_query'][] = ['taxonomy' => 'genre', 'field' => 'term_id', 'terms' => $genre];
        
        if (in_array($difficulty, ['beginner', 'advanced'])) {
            $args['meta_query'][] = ['key' => '_achord_difficulty', 'value' => $difficulty, 'compare' => '='];
        }

        // מצב גרסה-קלה גלובלי (cookie) — סינון לשירים קלים בלבד
        if (Achord_Master_Suite::easy_mode_on()) {
            $args['meta_query'][] = ['key' => '_ams_is_easy', 'value' => '1', 'compare' => '='];
        }

        $allowed_content_types = ['chords', 'score', 'lesson_guitar', 'lesson_piano'];
        if (!empty($content_type) && in_array($content_type, $allowed_content_types, true)) {
            $args['meta_query'][] = [
                'key'     => '_achord_content_flags',
                'value'   => '"' . $content_type . '"',
                'compare' => 'LIKE',
            ];
        }

        // משתנים לניהול פילטרים שנוסיף
        $join_filter = null;
        $where_filter = null;
        $orderby_filter = null;

        // לוגיקת חיפוש טקסטואלי עם ניקוד רלוונטיות
        if (!empty($query_string)) {
            $normalized_query = Achord_Master_Suite::normalize_hebrew_for_search($query_string);
            $search_words = array_values(array_filter(explode(' ', $normalized_query)));
            $raw_words    = array_values(array_filter(explode(' ', trim($query_string))));

            if (!empty($search_words)) {

                // JOIN שלושה אינדקסים נפרדים: כותרת, אמן, ואינדקס-העל (כותרת+אמן+מילים).
                // LEFT JOIN כי שיר ישן יכול עדיין לא להיות מאונדקס.
                $join_filter = function($join) use ($wpdb) {
                    $join .= " LEFT JOIN {$wpdb->postmeta} pm_title  ON ({$wpdb->posts}.ID = pm_title.post_id  AND pm_title.meta_key  = '_achord_search_title') ";
                    $join .= " LEFT JOIN {$wpdb->postmeta} pm_artist ON ({$wpdb->posts}.ID = pm_artist.post_id AND pm_artist.meta_key = '_achord_search_artist') ";
                    $join .= " LEFT JOIN {$wpdb->postmeta} pm_search ON ({$wpdb->posts}.ID = pm_search.post_id AND pm_search.meta_key = '_achord_super_search_index') ";
                    return $join;
                };

                // OR סלחני: כל מילה יכולה להתאים בכל שדה — שדה כותרת, שדה אמן,
                // אינדקס-העל (שכולל גם מילים), או post_title הגולמי (גיבוי לשירים-לא-מאונדקסים).
                $where_filter = function($where) use ($wpdb, $search_words, $raw_words) {
                    $conditions = [];
                    foreach ($search_words as $i => $word) {
                        $like_norm = '%' . $wpdb->esc_like($word) . '%';
                        $raw_word  = isset($raw_words[$i]) ? $raw_words[$i] : $word;
                        $like_raw  = '%' . $wpdb->esc_like($raw_word) . '%';
                        $conditions[] = $wpdb->prepare(
                            "(pm_title.meta_value LIKE %s OR pm_artist.meta_value LIKE %s OR pm_search.meta_value LIKE %s OR {$wpdb->posts}.post_title LIKE %s)",
                            $like_norm, $like_norm, $like_norm, $like_raw
                        );
                    }
                    if (!empty($conditions)) {
                        $where .= " AND (" . implode(' OR ', $conditions) . ") ";
                    }
                    return $where;
                };

                // ניקוד רלוונטיות חדש:
                //   כותרת זהה        : 500
                //   כותרת מתחילה בשאילתה: 250
                //   כותרת מכילה שאילתה : 150
                //   מילה בכותרת בלבד   : 40
                //   מילה באמן בלבד     : 10
                //   מילה במילים        : 2
                //   בונוס: מילה היא מילה שלמה בכותרת (גבולות) : +20
                $orderby_filter = function($orderby) use ($wpdb, $raw_words, $search_words, $normalized_query) {
                    $score_parts = [];

                    // ניקוד-שאילתה-מלאה — מול אינדקס הכותרת המנורמל
                    $score_parts[] = $wpdb->prepare(
                        "CASE WHEN pm_title.meta_value = %s THEN 500 ELSE 0 END",
                        $normalized_query
                    );
                    $score_parts[] = $wpdb->prepare(
                        "CASE WHEN pm_title.meta_value LIKE %s THEN 250 ELSE 0 END",
                        $wpdb->esc_like($normalized_query) . '%'
                    );
                    $score_parts[] = $wpdb->prepare(
                        "CASE WHEN pm_title.meta_value LIKE %s THEN 150 ELSE 0 END",
                        '%' . $wpdb->esc_like($normalized_query) . '%'
                    );

                    // ניקוד פר-מילה — מנורמל
                    foreach ($search_words as $i => $nw) {
                        // 40 נקודות לכל מילה בכותרת
                        $score_parts[] = $wpdb->prepare(
                            "CASE WHEN pm_title.meta_value LIKE %s THEN 40 ELSE 0 END",
                            '%' . $wpdb->esc_like($nw) . '%'
                        );
                        // בונוס: גבול-מילה (לפי תחילה/סוף/רווח) — מקדם מילה שלמה על-פני תת-מחרוזת
                        $score_parts[] = $wpdb->prepare(
                            "CASE WHEN CONCAT(' ',pm_title.meta_value,' ') LIKE %s THEN 20 ELSE 0 END",
                            '% ' . $wpdb->esc_like($nw) . ' %'
                        );
                        // 10 נקודות לכל מילה בשם האמן בלבד
                        $score_parts[] = $wpdb->prepare(
                            "CASE WHEN pm_artist.meta_value LIKE %s THEN 10 ELSE 0 END",
                            '%' . $wpdb->esc_like($nw) . '%'
                        );
                        // 2 נקודות לכל מילה במילות השיר (super_search כולל גם title+artist
                        // ולכן הניקוד כאן הוא בעיקר השפעת ה-lyrics)
                        $score_parts[] = $wpdb->prepare(
                            "CASE WHEN pm_search.meta_value LIKE %s THEN 2 ELSE 0 END",
                            '%' . $wpdb->esc_like($nw) . '%'
                        );
                    }

                    $score = implode(' + ', $score_parts);
                    return "($score) DESC, {$wpdb->posts}.post_title ASC";
                };

                add_filter('posts_join', $join_filter);
                add_filter('posts_where', $where_filter);
                add_filter('posts_orderby', $orderby_filter);
            }
        } else {
            // ללא חיפוש טקסטואלי — מיון לפי שם
            $args['orderby'] = 'title';
            $args['order'] = 'ASC';
        }

        $loop = new WP_Query($args);

        // הסרת פילטרים מיד לאחר הריצה
        if ($join_filter)    remove_filter('posts_join', $join_filter);
        if ($where_filter)   remove_filter('posts_where', $where_filter);
        if ($orderby_filter) remove_filter('posts_orderby', $orderby_filter);

        $results = [];
        if ($loop->have_posts()) {
            while ($loop->have_posts()) {
                $loop->the_post();
                $post_id = get_the_ID();
                $singer_terms = get_the_terms($post_id, 'singer');
                $singer_name  = (!is_wp_error($singer_terms) && !empty($singer_terms)) ? $singer_terms[0]->name : '';
                
                $diff_meta = get_post_meta($post_id, '_achord_difficulty', true);
                $diff_label = ($diff_meta === 'beginner') ? 'מתחיל' : 'מתקדם';

                $raw_flags = get_post_meta($post_id, '_achord_content_flags', true);
                $flags = is_string($raw_flags) && $raw_flags !== '' ? json_decode($raw_flags, true) : [];

                $results[] = [
                    'title'      => get_the_title(),
                    'url'        => get_permalink(),
                    'singer'     => $singer_name,
                    'difficulty' => $diff_label,
                    'flags'      => is_array($flags) ? $flags : [],
                ];
            }
            wp_reset_postdata();
        }
        wp_send_json_success(['results' => $results, 'count' => $loop->found_posts]);
    }

    /**
     * מטפל בתצוגה החיה של האקורדים.
     */
    public function handle_chords_live_preview() {
        if (!check_ajax_referer('achord_upload_nonce', 'achord_nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }
        // Rate limit: 60 previews/minute per user/IP
        if ( ! $this->check_rate_limit( 'chords_preview', 60, MINUTE_IN_SECONDS ) ) {
            wp_die('יותר מדי בקשות תצוגה מקדימה.');
        }
        // אבטחה: הקלט נבנה למחרוזת שעוברת do_shortcode ממש כאן — בלי הסינון,
        // `[/achord_song]` בתוכן מריץ שורטקודים שרירותיים בשרת (ראה AMS_Content_Guard).
        $chords    = AMS_Content_Guard::strip_structural_tags(sanitize_textarea_field(wp_unslash($_POST['chords_content'] ?? '')));
        $title     = AMS_Content_Guard::strip_structural_tags(esc_html(sanitize_text_field($_POST['song_title']     ?? '')));
        $performer = AMS_Content_Guard::strip_structural_tags(esc_html(sanitize_text_field($_POST['song_performer'] ?? '')));
        $dummy  = '[achord_song]';
        if ($title)     $dummy .= "[song_title]{$title}[/song_title]";
        if ($performer) $dummy .= "[performer]{$performer}[/performer]";
        $dummy .= "[version=normal]\n{$chords}\n[/version][/achord_song]";
        echo do_shortcode($dummy);
        wp_die();
    }

    /**
     * מטפל בתצוגה החיה של התווים.
     */
    public function handle_tavim_live_preview() {
        if (!check_ajax_referer('tavim_preview', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }
        // Rate limit: 60 previews/minute per user/IP
        if ( ! $this->check_rate_limit( 'tavim_preview', 60, MINUTE_IN_SECONDS ) ) {
            wp_die('יותר מדי בקשות תצוגה מקדימה.');
        }
        $abc_code = isset($_POST['abc']) ? sanitize_textarea_field(wp_unslash($_POST['abc'])) : '';
        $unique_id = 'tavim_preview_area_' . uniqid();
        if (empty(trim($abc_code))) {
            echo '<p>התצוגה המקדימה של התווים תופיע כאן...</p>';
            wp_die();
        }
        echo '<div id="' . esc_attr($unique_id) . '"></div>';
        echo '<script>
            (function(){
                function renderPreview() {
                    if (window.ABCJS) {
                        try {
                            ABCJS.renderAbc("' . esc_js($unique_id) . '", ' . wp_json_encode($abc_code) . ', { responsive: "resize" });
                        } catch (e) {
                            document.getElementById("'.esc_js($unique_id).'").innerHTML = "<div class=\'tavim-error\'>שגיאה בקוד ה-ABC: " + e.message + "</div>";
                        }
                    } else {
                        setTimeout(renderPreview, 100);
                    }
                }
                renderPreview();
            })();
        </script>';
        wp_die();
    }
}