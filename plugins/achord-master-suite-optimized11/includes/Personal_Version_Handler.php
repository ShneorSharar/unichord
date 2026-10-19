<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Personal_Version_Handler
 * מנהל גרסאות אישיות של אקורדים למשתמשים מחוברים.
 * כל גרסה שמורה כ-CPT פרטי עם post_parent = ID השיר המקורי.
 */
class AMS_Personal_Version_Handler {

    const CPT = 'achord_personal'; // max 20 chars — varchar(20) in wp_posts

    public function __construct() {
        add_action('init', [$this, 'register_cpt']);
        add_action('wp_ajax_achord_save_personal_version',   [$this, 'save']);
        add_action('wp_ajax_achord_delete_personal_version', [$this, 'delete_version']);
        add_action('wp_ajax_achord_get_share_link',          [$this, 'get_share_link']);
    }

    public function register_cpt() {
        register_post_type(self::CPT, [
            'public'            => false,
            'show_ui'           => false, // לא מוצג בממשק הניהול — אין לו UI ייעודי
            'show_in_menu'      => false,
            'show_in_admin_bar' => false,
            'supports'          => ['title', 'editor', 'author'],
            'capability_type'   => 'post',
            'map_meta_cap'      => true,
            'labels'            => [
                'name'          => 'גרסאות אישיות',
                'singular_name' => 'גרסה אישית',
            ],
        ]);
    }

    /**
     * מחזיר את הגרסה האישית של המשתמש לשיר נתון, או null אם לא קיימת.
     */
    public static function get_personal_version($post_id, $user_id = null) {
        if (!$user_id) $user_id = get_current_user_id();
        if (!$user_id || !$post_id) return null;

        $results = get_posts([
            'post_type'      => self::CPT,
            'author'         => (int) $user_id,
            'post_parent'    => (int) $post_id,
            'post_status'    => 'publish',
            'posts_per_page' => 1,
            'no_found_rows'  => true,
        ]);

        return $results ? $results[0] : null;
    }

    /**
     * AJAX: שמירת גרסה אישית (יצירה או עדכון).
     */
    public function save() {
        if (!is_user_logged_in()) {
            wp_send_json_error('יש להתחבר כדי לשמור גרסה אישית.');
        }
        if (!check_ajax_referer('achord_personal_version_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $post_id  = isset($_POST['post_id'])  ? intval($_POST['post_id']) : 0;
        $raw_text = isset($_POST['raw_text']) ? sanitize_textarea_field(wp_unslash($_POST['raw_text'])) : '';

        // אבטחה: וידוא שה-post קיים וששייך לסוג השיר בלבד (מניעת IDOR)
        $song = $post_id ? get_post($post_id) : null;
        if (!$song || $song->post_type !== 'achord_song_cpt') {
            wp_send_json_error('שיר לא נמצא.');
        }

        // הגבלת גודל הקלט (מניעת spam/DoS)
        if (mb_strlen($raw_text, 'UTF-8') > 50000) {
            wp_send_json_error('הטקסט ארוך מדי (מקסימום 50,000 תווים).');
        }

        $user_id  = get_current_user_id();
        $existing = self::get_personal_version($post_id, $user_id);
        $title    = get_the_title($post_id) . ' · גרסה אישית';

        if ($existing) {
            $result = wp_update_post([
                'ID'           => $existing->ID,
                'post_content' => $raw_text,
            ], true);
            if (is_wp_error($result)) {
                wp_send_json_error('שגיאה בשמירה: ' . $result->get_error_message());
            }
        } else {
            $new_id = wp_insert_post([
                'post_type'    => self::CPT,
                'post_title'   => $title,
                'post_content' => $raw_text,
                'post_status'  => 'publish',
                'post_author'  => $user_id,
                'post_parent'  => $post_id,
            ], true);

            if (is_wp_error($new_id)) {
                wp_send_json_error('שגיאה בשמירה: ' . $new_id->get_error_message());
            }
        }

        wp_send_json_success(['message' => 'הגרסה האישית נשמרה.']);
    }

    /**
     * מחזיר/יוצר token לשיתוף גרסה אישית.
     * Token מאוחסן כ-post_meta על הגרסה האישית.
     */
    public static function get_or_create_share_token($personal_post_id) {
        $token = get_post_meta($personal_post_id, '_ams_share_token', true);
        if (!$token) {
            $token = bin2hex(random_bytes(16)); // 32 תווים hex
            update_post_meta($personal_post_id, '_ams_share_token', $token);
        }
        return $token;
    }

    /**
     * מוצא גרסה אישית לפי song_id + token. מחזיר null אם לא נמצא.
     */
    public static function get_by_share_token($song_id, $token) {
        if (!$song_id || !$token) return null;

        $results = get_posts([
            'post_type'      => self::CPT,
            'post_parent'    => (int) $song_id,
            'post_status'    => 'publish',
            'posts_per_page' => 1,
            'no_found_rows'  => true,
            'meta_query'     => [[
                'key'     => '_ams_share_token',
                'value'   => sanitize_text_field($token),
                'compare' => '=',
            ]],
        ]);

        return $results ? $results[0] : null;
    }

    /**
     * AJAX: החזרת קישור שיתוף לגרסה האישית של המשתמש.
     */
    public function get_share_link() {
        if (!is_user_logged_in()) {
            wp_send_json_error('יש להתחבר.');
        }
        if (!check_ajax_referer('achord_personal_version_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $post_id = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;
        $user_id = get_current_user_id();
        $personal = self::get_personal_version($post_id, $user_id);

        if (!$personal) {
            wp_send_json_error('אין גרסה אישית לשיתוף. שמור גרסה קודם.');
        }

        $token = self::get_or_create_share_token($personal->ID);
        $url   = add_query_arg([
            'shared_version' => $post_id,
            'share_token'    => $token,
        ], get_permalink($post_id));

        wp_send_json_success(['url' => $url]);
    }

    /**
     * AJAX: מחיקת גרסה אישית (חזרה לגרסה הקנונית).
     */
    public function delete_version() {
        if (!is_user_logged_in()) {
            wp_send_json_error('יש להתחבר.');
        }
        if (!check_ajax_referer('achord_personal_version_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $post_id  = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;
        $user_id  = get_current_user_id();
        $existing = self::get_personal_version($post_id, $user_id);

        if (!$existing) {
            wp_send_json_error('לא נמצאה גרסה אישית.');
        }
        if ((int) $existing->post_author !== $user_id) {
            wp_send_json_error('אין הרשאה.');
        }

        wp_delete_post($existing->ID, true);
        wp_send_json_success(['message' => 'הגרסה האישית נמחקה.']);
    }
}
