<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Song_Request_Handler
 *
 * "בקש שיר חסר" — הופך חיפוש כושל לאות-ביקוש, ויוצר רשימת "בקשות שירים"
 * שמנתבת תורמים לאן שיש דרישה.
 *
 *  - CPT פרטי `achord_song_request` (title = שם השיר; meta = אמן/הערה/מבקש/נירמול/ביקוש).
 *  - שליחה ב-AJAX (פתוח גם לאורחים), עם rate-limit + honeypot + דדופ.
 *  - דדופ = אות ביקוש: בקשה זהה מגדילה `_req_count` במקום כפילות.
 *  - shortcode [achord_song_requests]: טופס + רשימת בקשות פתוחות ממוינת לפי ביקוש.
 */
class AMS_Song_Request_Handler {

    const CPT      = 'achord_song_request';
    const NONCE    = 'achord_song_request_nonce';
    const RATE_MAX = 5; // שליחות לשעה

    public function __construct() {
        add_action('init', [$this, 'register_cpt']);
        add_action('wp_ajax_achord_submit_song_request',        [$this, 'submit']);
        add_action('wp_ajax_nopriv_achord_submit_song_request', [$this, 'submit']);

        // עמודות אדמין
        add_filter('manage_' . self::CPT . '_posts_columns',       [$this, 'admin_cols']);
        add_action('manage_' . self::CPT . '_posts_custom_column', [$this, 'admin_cols_render'], 10, 2);
        add_filter('manage_edit-' . self::CPT . '_sortable_columns', [$this, 'admin_sortable']);

        add_shortcode('achord_song_requests', [$this, 'render_shortcode']);
    }

    public function register_cpt() {
        register_post_type(self::CPT, [
            'public'            => false,
            'show_ui'           => true,
            'show_in_menu'      => 'edit.php?post_type=achord_song_cpt',
            'show_in_admin_bar' => false,
            'supports'          => ['title'],
            'capability_type'   => 'post',
            'map_meta_cap'      => true,
            'labels'            => [
                'name'          => 'בקשות שירים',
                'singular_name' => 'בקשת שיר',
                'menu_name'     => 'בקשות שירים',
                'all_items'     => 'בקשות שירים',
            ],
        ]);
    }

    private function normalize($s) {
        if (class_exists('Achord_Master_Suite') && method_exists('Achord_Master_Suite', 'normalize_hebrew_for_search')) {
            return Achord_Master_Suite::normalize_hebrew_for_search($s);
        }
        return trim(mb_strtolower((string) $s, 'UTF-8'));
    }

    private function rate_key() {
        $uid = get_current_user_id();
        if ($uid) return 'achord_req_rate_u' . $uid;
        $ip = isset($_SERVER['REMOTE_ADDR']) ? preg_replace('/[^0-9a-f:.]/i', '', $_SERVER['REMOTE_ADDR']) : '0';
        return 'achord_req_rate_ip' . md5($ip);
    }

    public function submit() {
        if (!check_ajax_referer(self::NONCE, 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה. רעננו את העמוד ונסו שוב.');
        }

        // honeypot — אם מולא, מתנהגים כהצלחה בלי לשמור
        if (!empty($_POST['website'])) {
            wp_send_json_success(['message' => 'תודה!']);
        }

        $title  = isset($_POST['song_title']) ? sanitize_text_field(wp_unslash($_POST['song_title'])) : '';
        $artist = isset($_POST['artist'])     ? sanitize_text_field(wp_unslash($_POST['artist']))     : '';
        $note   = isset($_POST['note'])       ? sanitize_textarea_field(wp_unslash($_POST['note']))   : '';
        $email  = isset($_POST['email'])      ? sanitize_email(wp_unslash($_POST['email']))            : '';

        if (mb_strlen($title, 'UTF-8') < 2) {
            wp_send_json_error('כתבו את שם השיר (לפחות 2 תווים).');
        }
        if (mb_strlen($title, 'UTF-8') > 200 || mb_strlen($artist, 'UTF-8') > 200) {
            wp_send_json_error('שם השיר או האמן ארוכים מדי.');
        }

        // rate limiting
        $rate_key   = $this->rate_key();
        $rate_count = (int) get_transient($rate_key);
        if ($rate_count >= self::RATE_MAX) {
            wp_send_json_error('שלחתם הרבה בקשות בשעה האחרונה. נסו שוב מאוחר יותר.');
        }
        set_transient($rate_key, $rate_count + 1, HOUR_IN_SECONDS);

        $title_norm  = $this->normalize($title);
        $artist_norm = $this->normalize($artist);
        $uid         = get_current_user_id();

        // דדופ — בקשה פתוחה זהה? הגדל ביקוש
        $existing = get_posts([
            'post_type'      => self::CPT,
            'post_status'    => 'publish',
            'posts_per_page' => 1,
            'fields'         => 'ids',
            'no_found_rows'  => true,
            'meta_query'     => [
                'relation' => 'AND',
                ['key' => '_req_title_norm',  'value' => $title_norm],
                ['key' => '_req_artist_norm', 'value' => $artist_norm],
            ],
        ]);

        if (!empty($existing)) {
            $rid   = (int) $existing[0];
            $count = (int) get_post_meta($rid, '_req_count', true);
            update_post_meta($rid, '_req_count', max(1, $count) + 1);
            wp_send_json_success(['message' => 'מישהו כבר ביקש את השיר הזה, והוספנו את הקול שלכם! 🙌', 'dedup' => true]);
        }

        $rid = wp_insert_post([
            'post_type'   => self::CPT,
            'post_status' => 'publish',
            'post_title'  => $title,
            'post_author' => $uid,
        ], true);

        if (is_wp_error($rid)) {
            wp_send_json_error('שגיאה בשמירה. נסו שוב.');
        }

        update_post_meta($rid, '_req_artist',      $artist);
        update_post_meta($rid, '_req_note',        $note);
        update_post_meta($rid, '_req_title_norm',  $title_norm);
        update_post_meta($rid, '_req_artist_norm', $artist_norm);
        update_post_meta($rid, '_req_count',       1);
        if ($uid)   update_post_meta($rid, '_req_uid',   $uid);
        if ($email) update_post_meta($rid, '_req_email', $email);

        if (class_exists('AMS_Activity_Log_Handler')) {
            AMS_Activity_Log_Handler::log('song_request_submitted', 'request', $rid, [
                'title' => $title, 'artist' => $artist,
            ], $uid);
        }

        wp_send_json_success(['message' => 'הבקשה נשלחה, תודה! נעשה כמיטב יכולתנו להוסיף את השיר. 🎸']);
    }

    // ── אדמין ──
    public function admin_cols($cols) {
        $new = [];
        foreach ($cols as $k => $v) {
            $new[$k] = $v;
            if ($k === 'title') {
                $new['req_artist'] = 'אמן';
                $new['req_count']  = 'ביקושים';
                $new['req_by']     = 'מבקש';
            }
        }
        return $new;
    }

    public function admin_cols_render($col, $post_id) {
        if ($col === 'req_artist') {
            echo esc_html(get_post_meta($post_id, '_req_artist', true) ?: '—');
        } elseif ($col === 'req_count') {
            echo (int) (get_post_meta($post_id, '_req_count', true) ?: 1);
        } elseif ($col === 'req_by') {
            $uid = (int) get_post_meta($post_id, '_req_uid', true);
            if ($uid) {
                echo esc_html(get_the_author_meta('display_name', $uid));
            } else {
                $email = get_post_meta($post_id, '_req_email', true);
                echo $email ? esc_html($email) : 'אורח';
            }
        }
    }

    public function admin_sortable($cols) {
        $cols['req_count'] = 'req_count';
        return $cols;
    }

    // ── עמוד ציבורי: טופס + רשימה ──
    public function render_shortcode($atts = []) {
        $atts = shortcode_atts(['limit' => 50], $atts, 'achord_song_requests');

        // JS + נתונים (עצמאי — לא תלוי ב-is_ams_page)
        wp_enqueue_script('achord-song-request', AMS_PLUGIN_URL . 'assets/js/song-request.js', [], AMS_VERSION, true);
        wp_localize_script('achord-song-request', 'achord_req_data', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce'    => wp_create_nonce(self::NONCE),
        ]);

        $prefill = isset($_GET['q']) ? sanitize_text_field(wp_unslash($_GET['q'])) : '';

        ob_start();
        ?>
        <form class="uc-reqform" id="achord-song-request-form" autocomplete="off">
            <div class="uc-reqform__row">
                <label class="uc-reqform__field">
                    <span class="uc-reqform__label">שם השיר *</span>
                    <input type="text" name="song_title" required maxlength="200"
                           value="<?php echo esc_attr($prefill); ?>" placeholder="למשל: שיר לשלום">
                </label>
                <label class="uc-reqform__field">
                    <span class="uc-reqform__label">אמן (לא חובה)</span>
                    <input type="text" name="artist" maxlength="200" placeholder="למשל: מירי מסיקה">
                </label>
            </div>
            <label class="uc-reqform__field">
                <span class="uc-reqform__label">הערה (לא חובה)</span>
                <input type="text" name="note" maxlength="300" placeholder="קישור, גרסה מסוימת, או כל פרט שיעזור">
            </label>
            <?php if (!is_user_logged_in()) : ?>
            <label class="uc-reqform__field">
                <span class="uc-reqform__label">אימייל (לא חובה)</span>
                <input type="email" name="email" maxlength="200" placeholder="כדי שנעדכן אתכם כשהשיר יתווסף">
            </label>
            <?php endif; ?>
            <!-- honeypot (מוסתר ב-CSS) -->
            <input type="text" name="website" class="uc-reqform__hp" tabindex="-1" autocomplete="off" aria-hidden="true">
            <div class="uc-reqform__actions">
                <button type="submit" class="uc-btn uc-btn--primary">שלחו בקשה</button>
                <span class="uc-reqform__msg" role="status" aria-live="polite"></span>
            </div>
        </form>

        <?php
        $requests = get_posts([
            'post_type'      => self::CPT,
            'post_status'    => 'publish',
            'posts_per_page' => (int) $atts['limit'],
            'meta_key'       => '_req_count',
            'orderby'        => 'meta_value_num',
            'order'          => 'DESC',
            'no_found_rows'  => true,
        ]);

        if (empty($requests)) {
            echo '<div class="uc-req-empty"><p>עדיין אין בקשות פתוחות. היו הראשונים לבקש שיר ' . AMS_Icons::svg('music-note') . '</p></div>';
            return ob_get_clean();
        }

        $add_url = esc_url(home_url('/add-song/'));
        echo '<h2 class="uc-req-listtitle">בקשות שירים</h2>';
        echo '<ul class="uc-req-list">';
        foreach ($requests as $r) {
            $artist = get_post_meta($r->ID, '_req_artist', true);
            $count  = (int) (get_post_meta($r->ID, '_req_count', true) ?: 1);
            echo '<li class="uc-req">'
               . '<span class="uc-req__main">'
               . '<span class="uc-req__title">' . esc_html(get_the_title($r)) . '</span>'
               . ($artist ? '<span class="uc-req__artist">' . esc_html($artist) . '</span>' : '')
               . '</span>'
               . '<span class="uc-req__demand" title="מספר המבקשים">' . esc_html(number_format_i18n($count)) . ' ביקשו</span>'
               . '<a class="uc-req__add" href="' . $add_url . '">אני אוסיף ←</a>'
               . '</li>';
        }
        echo '</ul>';

        return ob_get_clean();
    }
}
