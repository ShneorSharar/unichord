<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Saved_Songs_Handler
 * מערכת שמירת שירים למועדפים — מבוססת user_meta.
 *
 * מטא-מפתח: _achord_saved_songs → array of post IDs (integers)
 * מגבלה: 500 שירים למשתמש.
 */
class AMS_Saved_Songs_Handler {

    const META_KEY = '_achord_saved_songs';
    const MAX_SAVED = 500;

    public function __construct() {
        add_action('wp_ajax_achord_toggle_saved_song', [$this, 'toggle']);
    }

    /**
     * מחזיר האם שיר מסוים שמור למשתמש.
     */
    public static function is_saved($post_id, $user_id = null) {
        if (!$user_id) $user_id = get_current_user_id();
        if (!$user_id) return false;
        $saved = get_user_meta($user_id, self::META_KEY, true);
        return is_array($saved) && in_array((int) $post_id, $saved, true);
    }

    /**
     * מחזיר מערך של IDs שמורים למשתמש.
     */
    public static function get_saved_ids($user_id = null) {
        if (!$user_id) $user_id = get_current_user_id();
        if (!$user_id) return [];
        $saved = get_user_meta($user_id, self::META_KEY, true);
        return is_array($saved) ? array_map('intval', $saved) : [];
    }

    /**
     * AJAX: הוספה/הסרה של שיר מהמועדפים.
     */
    public function toggle() {
        if (!is_user_logged_in()) {
            wp_send_json_error('יש להתחבר.');
        }
        if (!check_ajax_referer('achord_saved_songs_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $post_id = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;
        $song    = $post_id ? get_post($post_id) : null;

        if (!$song || $song->post_type !== 'achord_song_cpt' || $song->post_status !== 'publish') {
            wp_send_json_error('שיר לא נמצא.');
        }

        $user_id = get_current_user_id();
        $saved   = self::get_saved_ids($user_id);

        if (in_array($post_id, $saved, true)) {
            // הסרה
            $saved    = array_values(array_filter($saved, fn($id) => $id !== $post_id));
            $is_saved = false;
        } else {
            // הוספה
            if (count($saved) >= self::MAX_SAVED) {
                wp_send_json_error('הגעת למגבלת ' . self::MAX_SAVED . ' שירים שמורים.');
            }
            $saved[]  = $post_id;
            $is_saved = true;
        }

        update_user_meta($user_id, self::META_KEY, $saved);
        wp_send_json_success(['is_saved' => $is_saved]);
    }
}
