<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Edit_Proposal_Handler
 * מנהל הצעות עריכה לגרסה הקנונית של שירים.
 *
 * היררכיה:
 *   Subscriber  → גרסה אישית בלבד (Personal_Version_Handler)
 *   Contributor → שולח הצעת עריכה (pending)
 *   Editor+     → מאשר / דוחה הצעות
 *
 * post_status: 'pending' = ממתין | 'publish' = אושר | 'trash' = נדחה
 * post_parent: ID של achord_song_cpt
 */
class AMS_Edit_Proposal_Handler {

    const CPT = 'achord_edit_proposal';

    public function __construct() {
        add_action('init', [$this, 'register_cpt']);
        add_action('wp_ajax_achord_submit_proposal',  [$this, 'submit']);
        add_action('wp_ajax_achord_approve_proposal', [$this, 'approve']);
        add_action('wp_ajax_achord_reject_proposal',  [$this, 'reject']);
    }

    public function register_cpt() {
        register_post_type(self::CPT, [
            'public'            => false,
            'show_ui'           => false,
            'show_in_menu'      => false,
            'show_in_admin_bar' => false,
            'supports'          => ['title', 'editor', 'author'],
            'capability_type'   => 'post',
            'map_meta_cap'      => true,
            'labels'            => [
                'name'          => 'הצעות עריכה',
                'singular_name' => 'הצעת עריכה',
            ],
        ]);
    }

    /**
     * מחזיר את כל הצעות העריכה של משתמש נתון.
     */
    public static function get_user_proposals($user_id = null) {
        if (!$user_id) $user_id = get_current_user_id();
        if (!$user_id) return [];

        return get_posts([
            'post_type'      => self::CPT,
            'author'         => (int) $user_id,
            'post_status'    => ['pending', 'publish', 'trash'],
            'posts_per_page' => 50,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'no_found_rows'  => true,
        ]);
    }

    /**
     * מחזיר הצעות עריכה ממתינות (לעורכים).
     */
    public static function get_pending_proposals($limit = 50) {
        return get_posts([
            'post_type'      => self::CPT,
            'post_status'    => 'pending',
            'posts_per_page' => (int) $limit,
            'orderby'        => 'date',
            'order'          => 'ASC',
            'no_found_rows'  => true,
        ]);
    }

    /**
     * AJAX: שליחת הצעת עריכה חדשה.
     */
    public function submit() {
        if (!is_user_logged_in()) {
            wp_send_json_error('יש להתחבר.');
        }
        if (!check_ajax_referer('achord_personal_version_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $post_id  = isset($_POST['post_id'])  ? intval($_POST['post_id']) : 0;
        // אבטחה: התוכן הזה מוחדר בהמשך לתוך [version=normal]…[/version] של שיר
        // קיים. בלי הסינון, `[/version][/achord_song]` בהצעה סוגר את השורטקוד
        // העוטף וכל מה שאחריו מורץ כשורטקוד עצמאי (ראה AMS_Content_Guard).
        $raw_text = isset($_POST['raw_text']) ? AMS_Content_Guard::strip_structural_tags(sanitize_textarea_field(wp_unslash($_POST['raw_text']))) : '';
        $note     = isset($_POST['note'])     ? sanitize_text_field(wp_unslash($_POST['note'])) : '';

        // אבטחה: post_type חייב להיות achord_song_cpt
        $song = $post_id ? get_post($post_id) : null;
        if (!$song || $song->post_type !== 'achord_song_cpt') {
            wp_send_json_error('שיר לא נמצא.');
        }

        if (empty($raw_text)) {
            wp_send_json_error('הטקסט ריק.');
        }
        if (mb_strlen($raw_text, 'UTF-8') > 50000) {
            wp_send_json_error('הטקסט ארוך מדי.');
        }

        $user_id = get_current_user_id();

        // מגבלת 5 הצעות פתוחות בו-זמנית (לתורמים)
        if (class_exists('AMS_User_Role_Handler') && AMS_User_Role_Handler::has_reached_proposal_limit($user_id)) {
            wp_send_json_error('הגעת למגבלת 5 הצעות פתוחות. המתן לאישור או דחייה של הצעה לפני שליחת הצעה חדשה.');
        }

        // Rate limiting: מקסימום 5 הצעות לשעה לכל משתמש
        $rate_key   = 'achord_proposal_rate_' . $user_id;
        $rate_count = (int) get_transient($rate_key);
        if ($rate_count >= 5) {
            wp_send_json_error('שלחת יותר מדי הצעות בשעה האחרונה. נסה שוב מאוחר יותר.');
        }
        // אבטחה: מגדילים את המונה מיד אחרי הבדיקה (לפני העבודה הכבדה) כדי לצמצם חלון race —
        // בקשות מקבילות יראו מונה גבוה מוקדם יותר ולא יעקפו בקלות את מגבלת 5/שעה.
        set_transient($rate_key, $rate_count + 1, HOUR_IN_SECONDS);

        // מניעת הצעות כפולות ממתינות מאותו משתמש לאותו שיר
        $existing_pending = get_posts([
            'post_type'      => self::CPT,
            'author'         => $user_id,
            'post_parent'    => $post_id,
            'post_status'    => 'pending',
            'posts_per_page' => 1,
            'no_found_rows'  => true,
        ]);
        if ($existing_pending) {
            // עדכון ההצעה הממתינה הקיימת במקום ליצור חדשה
            $result = wp_update_post([
                'ID'           => $existing_pending[0]->ID,
                'post_content' => $raw_text,
                'post_excerpt' => $note,
            ], true);
            if (is_wp_error($result)) {
                wp_send_json_error('שגיאה בעדכון: ' . $result->get_error_message());
            }
            wp_send_json_success(['message' => 'ההצעה הקיימת עודכנה ועדיין ממתינה לאישור.']);
        }

        $title  = get_the_title($post_id) . ' — הצעת עריכה';
        $new_id = wp_insert_post([
            'post_type'    => self::CPT,
            'post_title'   => $title,
            'post_content' => $raw_text,
            'post_excerpt' => $note,
            'post_status'  => 'pending',
            'post_author'  => $user_id,
            'post_parent'  => $post_id,
        ], true);

        if (is_wp_error($new_id)) {
            wp_send_json_error('שגיאה בשמירה: ' . $new_id->get_error_message());
        }

        $this->notify_editors($song, $note, $user_id);

        wp_send_json_success(['message' => 'ההצעה נשלחה לאישור. תודה!']);
    }

    /**
     * שולח אימייל לכל העורכים כאשר מוגשת הצעה חדשה.
     */
    private function notify_editors($song, $note, $proposer_id) {
        $editors = get_users(['capability' => 'edit_others_posts', 'fields' => ['user_email', 'display_name']]);
        if (empty($editors)) return;

        $proposer      = get_userdata($proposer_id);
        $proposer_name = $proposer ? $proposer->display_name : 'משתמש לא ידוע';
        $song_title    = get_the_title($song->ID);
        $review_url    = admin_url('admin.php?page=achord-review-proposals');

        $subject = sprintf('[Achordim] הצעת עריכה חדשה: %s', $song_title);

        $body  = "שלום,\n\n";
        $body .= sprintf("המשתמש %s שלח הצעת עריכה לשיר \"%s\".\n\n", $proposer_name, $song_title);
        if (!empty($note)) {
            $body .= sprintf("הערת המשתמש: %s\n\n", $note);
        }
        $body .= "לסקירה ואישור/דחייה:\n" . $review_url . "\n\n";
        $body .= "— מערכת Achordim";

        $emails = array_map(function($u) { return $u->user_email; }, $editors);
        foreach (array_unique($emails) as $email) {
            wp_mail($email, $subject, $body);
        }
    }

    /**
     * AJAX: אישור הצעה ועדכון הגרסה הקנונית.
     * דורש הרשאת editor ומעלה.
     */
    public function approve() {
        if (!current_user_can('edit_others_posts')) {
            wp_send_json_error('אין הרשאה.');
        }
        if (!check_ajax_referer('achord_personal_version_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $proposal_id = isset($_POST['proposal_id']) ? intval($_POST['proposal_id']) : 0;
        $proposal    = $proposal_id ? get_post($proposal_id) : null;

        if (!$proposal || $proposal->post_type !== self::CPT) {
            wp_send_json_error('הצעה לא נמצאה.');
        }
        if ($proposal->post_status !== 'pending') {
            wp_send_json_error('ההצעה אינה במצב ממתין.');
        }

        $song_id  = (int) $proposal->post_parent;
        $song     = $song_id ? get_post($song_id) : null;

        if (!$song || $song->post_type !== 'achord_song_cpt') {
            wp_send_json_error('השיר המקורי לא נמצא.');
        }

        // מסונן שוב בזמן ההחלה: הצעות שנוצרו לפני הוספת הסינון כבר שמורות ב-DB.
        $new_raw  = AMS_Content_Guard::strip_structural_tags($proposal->post_content);
        $old_content = $song->post_content;

        // החלפת חלק [version=normal]...[/version] בתוכן השיר
        // preg_replace_callback מונע injection דרך $1/$0/\\ בתוכן ההצעה
        $updated_content = preg_replace_callback(
            '/(\[version=normal\]).*?(\[\/version\])/s',
            function($m) use ($new_raw) {
                return $m[1] . $new_raw . $m[2];
            },
            $old_content
        );

        // אם הרג'קס לא מצא (שיר ישן / פורמט שונה) — נכשל בצורה בטוחה
        if ($updated_content === $old_content || $updated_content === null) {
            wp_send_json_error('לא ניתן להחיל: תוכן השיר לא כולל [version=normal].');
        }

        $result = wp_update_post([
            'ID'           => $song_id,
            'post_content' => $updated_content,
        ], true);

        if (is_wp_error($result)) {
            wp_send_json_error('שגיאה בעדכון השיר: ' . $result->get_error_message());
        }

        // סימון ההצעה כ"אושרה" — בדיקת שגיאה כדי לא להשאיר מצב לא-עקבי (השיר עודכן אך ההצעה נשארה pending)
        $proposal_update = wp_update_post([
            'ID'          => $proposal_id,
            'post_status' => 'publish',
        ], true);
        if (is_wp_error($proposal_update)) {
            error_log('[achord] השיר עודכן אך סימון ההצעה ' . $proposal_id . ' כ-publish נכשל: ' . $proposal_update->get_error_message());
        }

        // הודעת email למגיש ההצעה
        $this->notify_proposer_approved($proposal);

        // בדיקת סף קידום תורם→עורך
        if (class_exists('AMS_User_Role_Handler')) {
            AMS_User_Role_Handler::maybe_notify_admin_about_candidate($proposal->post_author);
        }

        wp_send_json_success(['message' => 'ההצעה אושרה והשיר עודכן.']);
    }

    /**
     * AJAX: דחיית הצעה.
     * דורש הרשאת editor ומעלה.
     */
    public function reject() {
        if (!current_user_can('edit_others_posts')) {
            wp_send_json_error('אין הרשאה.');
        }
        if (!check_ajax_referer('achord_personal_version_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $proposal_id = isset($_POST['proposal_id']) ? intval($_POST['proposal_id']) : 0;
        $reason      = isset($_POST['reason']) ? sanitize_text_field(wp_unslash($_POST['reason'])) : '';
        $proposal    = $proposal_id ? get_post($proposal_id) : null;

        if (!$proposal || $proposal->post_type !== self::CPT) {
            wp_send_json_error('הצעה לא נמצאה.');
        }

        // שמירת סיבת הדחייה ב-meta לפני המחיקה
        if ($reason) {
            update_post_meta($proposal_id, '_ams_reject_reason', $reason);
        }

        wp_trash_post($proposal_id);

        // הודעת email למגיש ההצעה
        $this->notify_proposer_rejected($proposal, $reason);

        wp_send_json_success(['message' => 'ההצעה נדחתה.']);
    }

    /**
     * שולח email למגיש כאשר הצעתו אושרה.
     */
    private function notify_proposer_approved($proposal) {
        $proposer = get_userdata($proposal->post_author);
        if (!$proposer || empty($proposer->user_email)) return;

        $song_title = get_the_title($proposal->post_parent);
        $song_url   = get_permalink($proposal->post_parent);

        $subject = sprintf('[Achordim] ההצעה שלך אושרה: %s', $song_title);
        $body    = "שלום {$proposer->display_name},\n\n";
        $body   .= "הצעת העריכה שלך לשיר \"{$song_title}\" אושרה ושולבה בגרסה הרשמית!\n\n";
        $body   .= "לצפייה בשיר: {$song_url}\n\n";
        $body   .= "תודה על התרומה!\n— מערכת Achordim";

        wp_mail($proposer->user_email, $subject, $body);
    }

    /**
     * שולח email למגיש כאשר הצעתו נדחתה.
     */
    private function notify_proposer_rejected($proposal, $reason = '') {
        $proposer = get_userdata($proposal->post_author);
        if (!$proposer || empty($proposer->user_email)) return;

        $song_title = get_the_title($proposal->post_parent);
        $song_url   = get_permalink($proposal->post_parent);

        $subject = sprintf('[Achordim] הצעתך לשיר "%s" נדחתה', $song_title);
        $body    = "שלום {$proposer->display_name},\n\n";
        $body   .= "הצעת העריכה שלך לשיר \"{$song_title}\" נדחתה על ידי עורך.\n\n";
        if ($reason) {
            $body .= "סיבת הדחייה: {$reason}\n\n";
        }
        $body .= "תוכל לשלוח הצעה חדשה לאחר עדכון: {$song_url}\n\n";
        $body .= "— מערכת Achordim";

        wp_mail($proposer->user_email, $subject, $body);
    }
}
