<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Notebook_Handler
 * "המחברת שלי" — מרחב אישי ופרטי למשתמש מחובר.
 *
 * מאחד שלושה סוגי פריטים בעמוד אחד:
 *   1. שירים שמורים (מועדפים)        — AMS_Saved_Songs_Handler (user_meta)
 *   2. גרסאות אישיות לשירי הספרייה   — achord_personal עם post_parent=<song_id>
 *   3. שירים-משלי שנכתבו מאפס        — achord_personal עם post_parent=0 + _ams_own_song=1
 *
 * ארגון בתיקיות (פרטי לכל משתמש):
 *   - רשימת התיקיות: user_meta _ams_notebook_folders = [ {id,name}, ... ]
 *   - שיוך פריט אישי (CPT): post_meta _ams_folder = folder_id
 *   - שיוך שיר שמור (ID):   user_meta _ams_saved_folders = { song_id: folder_id }
 *
 * השיר-משלי ממחזר את עורך האקורדים הקיים (achord-upload.js) ואת ה-renderer
 * של עמוד השיר (do_shortcode על בלוק [achord_song]).
 */
class AMS_Notebook_Handler {

    /** post_type לגרסאות/שירים אישיים — אותו CPT של גרסאות אישיות */
    const CPT = 'achord_personal';

    const FOLDERS_META       = '_ams_notebook_folders';   // user_meta
    const SAVED_FOLDERS_META = '_ams_saved_folders';      // user_meta
    const ITEM_FOLDER_META   = '_ams_folder';             // post_meta
    const OWN_SONG_META      = '_ams_own_song';           // post_meta = '1'
    const PERFORMER_META     = '_ams_np_performer';       // post_meta
    const CAPO_META          = '_ams_np_capo';            // post_meta
    const PUBLIC_SONG_META   = '_ams_public_song_id';     // post_meta על שיר-משלי → ID השיר הציבורי שהוצע
    const SOURCE_PERSONAL_META = '_ams_source_personal';  // post_meta על השיר הציבורי → ID השיר-משלי המקורי

    const MAX_OWN_SONGS = 300;
    const NONCE         = 'achord_notebook_nonce';

    public function __construct() {
        // ודא שעמוד המחברת קיים (פעם אחת — אידמפוטנטי, עובד גם בפריסה לחי)
        add_action('init', [$this, 'ensure_notebook_page']);
        // ניהול תיקיות
        add_action('wp_ajax_achord_nb_create_folder', [$this, 'ajax_create_folder']);
        add_action('wp_ajax_achord_nb_rename_folder', [$this, 'ajax_rename_folder']);
        add_action('wp_ajax_achord_nb_delete_folder', [$this, 'ajax_delete_folder']);
        add_action('wp_ajax_achord_nb_assign',        [$this, 'ajax_assign']);
        // שיר-משלי
        add_action('wp_ajax_achord_notebook_save_song',    [$this, 'ajax_save_song']);
        add_action('wp_ajax_achord_notebook_publish_song', [$this, 'ajax_publish_song']);
        add_action('wp_ajax_achord_notebook_delete_song',  [$this, 'ajax_delete_song']);
        // שורטקודים
        add_shortcode('achord_notebook',        [$this, 'render_notebook']);
        add_shortcode('achord_notebook_editor', [$this, 'render_editor']);
    }

    /**
     * יוצר את עמוד "המחברת שלי" (slug: notebook) אם אינו קיים. רץ פעם אחת.
     */
    public function ensure_notebook_page() {
        if (get_option('ams_notebook_page_v1')) return;

        $existing = get_page_by_path('notebook');
        if (!$existing) {
            wp_insert_post([
                'post_title'   => 'המחברת שלי',
                'post_name'    => 'notebook',
                'post_content' => '[achord_notebook]',
                'post_status'  => 'publish',
                'post_type'    => 'page',
                'comment_status'=> 'closed',
            ]);
        }
        update_option('ams_notebook_page_v1', 1);
    }

    /* ════════════════════════ תיקיות ════════════════════════ */

    public static function get_folders($user_id = null) {
        if (!$user_id) $user_id = get_current_user_id();
        if (!$user_id) return [];
        $folders = get_user_meta($user_id, self::FOLDERS_META, true);
        if (!is_array($folders)) return [];
        // נירמול: רק רשומות תקינות {id,name}
        $clean = [];
        foreach ($folders as $f) {
            if (is_array($f) && !empty($f['id']) && isset($f['name'])) {
                $clean[] = ['id' => (string) $f['id'], 'name' => (string) $f['name']];
            }
        }
        return $clean;
    }

    private static function save_folders($user_id, array $folders) {
        update_user_meta($user_id, self::FOLDERS_META, array_values($folders));
    }

    private static function folder_exists($user_id, $folder_id) {
        foreach (self::get_folders($user_id) as $f) {
            if ($f['id'] === (string) $folder_id) return true;
        }
        return false;
    }

    private function require_login_nonce() {
        if (!is_user_logged_in()) {
            wp_send_json_error('יש להתחבר.');
        }
        if (!check_ajax_referer(self::NONCE, 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }
    }

    public function ajax_create_folder() {
        $this->require_login_nonce();
        $user_id = get_current_user_id();
        $name    = isset($_POST['name']) ? trim(sanitize_text_field(wp_unslash($_POST['name']))) : '';
        if ($name === '') wp_send_json_error('יש להזין שם לתיקייה.');
        if (mb_strlen($name, 'UTF-8') > 60) wp_send_json_error('שם התיקייה ארוך מדי.');

        $folders = self::get_folders($user_id);
        if (count($folders) >= 50) wp_send_json_error('הגעת למקסימום התיקיות.');

        $id        = 'f_' . substr(md5(uniqid('', true)), 0, 12);
        $folders[] = ['id' => $id, 'name' => $name];
        self::save_folders($user_id, $folders);
        wp_send_json_success(['id' => $id, 'name' => $name]);
    }

    public function ajax_rename_folder() {
        $this->require_login_nonce();
        $user_id   = get_current_user_id();
        $folder_id = isset($_POST['folder_id']) ? sanitize_text_field(wp_unslash($_POST['folder_id'])) : '';
        $name      = isset($_POST['name']) ? trim(sanitize_text_field(wp_unslash($_POST['name']))) : '';
        if ($name === '') wp_send_json_error('יש להזין שם.');
        if (mb_strlen($name, 'UTF-8') > 60) wp_send_json_error('שם ארוך מדי.');

        $folders = self::get_folders($user_id);
        $found   = false;
        foreach ($folders as &$f) {
            if ($f['id'] === $folder_id) { $f['name'] = $name; $found = true; break; }
        }
        unset($f);
        if (!$found) wp_send_json_error('תיקייה לא נמצאה.');
        self::save_folders($user_id, $folders);
        wp_send_json_success(['name' => $name]);
    }

    public function ajax_delete_folder() {
        $this->require_login_nonce();
        $user_id   = get_current_user_id();
        $folder_id = isset($_POST['folder_id']) ? sanitize_text_field(wp_unslash($_POST['folder_id'])) : '';

        $folders = self::get_folders($user_id);
        $folders = array_values(array_filter($folders, fn($f) => $f['id'] !== $folder_id));
        self::save_folders($user_id, $folders);

        // ניתוק שיוכי שירים שמורים מהתיקייה (הפריטים נשארים — רק ללא תיקייה)
        $map = get_user_meta($user_id, self::SAVED_FOLDERS_META, true);
        if (is_array($map)) {
            foreach ($map as $sid => $fid) {
                if ((string) $fid === $folder_id) unset($map[$sid]);
            }
            update_user_meta($user_id, self::SAVED_FOLDERS_META, $map);
        }
        // ניתוק שיוכי פריטים אישיים (CPT)
        $personals = get_posts([
            'post_type'      => self::CPT,
            'author'         => $user_id,
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'no_found_rows'  => true,
            'fields'         => 'ids',
            'meta_key'       => self::ITEM_FOLDER_META,
            'meta_value'     => $folder_id,
        ]);
        foreach ($personals as $pid) {
            delete_post_meta($pid, self::ITEM_FOLDER_META);
        }

        wp_send_json_success(['message' => 'התיקייה נמחקה.']);
    }

    /**
     * שיוך פריט לתיקייה (או הסרה אם folder_id ריק).
     * item_type: 'saved' (שיר שמור, item_id=post_id) | 'personal' (CPT, item_id=personal post id)
     */
    public function ajax_assign() {
        $this->require_login_nonce();
        $user_id   = get_current_user_id();
        $item_type = isset($_POST['item_type']) ? sanitize_text_field(wp_unslash($_POST['item_type'])) : '';
        $item_id   = isset($_POST['item_id']) ? intval($_POST['item_id']) : 0;
        $folder_id = isset($_POST['folder_id']) ? sanitize_text_field(wp_unslash($_POST['folder_id'])) : '';

        if ($folder_id !== '' && !self::folder_exists($user_id, $folder_id)) {
            wp_send_json_error('תיקייה לא נמצאה.');
        }

        if ($item_type === 'saved') {
            if (!AMS_Saved_Songs_Handler::is_saved($item_id, $user_id)) {
                wp_send_json_error('שיר לא נמצא במועדפים.');
            }
            $map = get_user_meta($user_id, self::SAVED_FOLDERS_META, true);
            if (!is_array($map)) $map = [];
            if ($folder_id === '') unset($map[$item_id]);
            else                   $map[$item_id] = $folder_id;
            update_user_meta($user_id, self::SAVED_FOLDERS_META, $map);
            wp_send_json_success();
        }

        if ($item_type === 'personal') {
            $post = get_post($item_id);
            if (!$post || $post->post_type !== self::CPT || (int) $post->post_author !== $user_id) {
                wp_send_json_error('פריט לא נמצא.');
            }
            if ($folder_id === '') delete_post_meta($item_id, self::ITEM_FOLDER_META);
            else                   update_post_meta($item_id, self::ITEM_FOLDER_META, $folder_id);
            wp_send_json_success();
        }

        wp_send_json_error('סוג פריט לא תקין.');
    }

    /* ════════════════════════ שיר-משלי ════════════════════════ */

    public static function get_own_songs($user_id = null) {
        if (!$user_id) $user_id = get_current_user_id();
        if (!$user_id) return [];
        return get_posts([
            'post_type'      => self::CPT,
            'author'         => $user_id,
            'post_parent'    => 0,
            'post_status'    => 'publish',
            'posts_per_page' => self::MAX_OWN_SONGS,
            'orderby'        => 'modified',
            'order'          => 'DESC',
            'no_found_rows'  => true,
            'meta_key'       => self::OWN_SONG_META,
            'meta_value'     => '1',
        ]);
    }

    public function ajax_save_song() {
        if (!is_user_logged_in()) {
            wp_send_json_error('יש להתחבר כדי לשמור שיר.');
        }
        if (!check_ajax_referer('achord_upload_nonce', 'achord_nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $user_id     = get_current_user_id();
        $personal_id = isset($_POST['personal_id']) ? intval($_POST['personal_id']) : 0;
        $title       = sanitize_text_field(wp_unslash($_POST['title'] ?? ''));
        $performer   = sanitize_text_field(wp_unslash($_POST['performer'] ?? ''));
        $capo        = isset($_POST['capo']) && is_numeric($_POST['capo']) ? intval($_POST['capo']) : 0;
        $content     = isset($_POST['version_normal'])
            ? sanitize_textarea_field(wp_unslash($_POST['version_normal'])) : '';
        $folder_id   = isset($_POST['folder']) ? sanitize_text_field(wp_unslash($_POST['folder'])) : '';

        if ($title === '' || trim($content) === '') {
            wp_send_json_error('חובה למלא שם שיר ותוכן.');
        }
        if (mb_strlen($content, 'UTF-8') > 50000) {
            wp_send_json_error('הטקסט ארוך מדי (מקסימום 50,000 תווים).');
        }

        $personal_id = $this->persist_own_song($user_id, $personal_id, $title, $content, $performer, $capo, $folder_id);
        if (is_wp_error($personal_id)) {
            wp_send_json_error($personal_id->get_error_message());
        }

        wp_send_json_success([
            'message'     => 'השיר נשמר במחברת.',
            'personal_id' => $personal_id,
            'redirect'    => self::notebook_url(),
        ]);
    }

    /**
     * יצירה/עדכון של שיר-משלי (CPT, parent=0). מחזיר int personal_id או WP_Error.
     * משותף לשמירה רגילה ולזרימת הפרסום, כדי ש"הצע לפרסום" תמיד ישמור גם עותק אישי.
     */
    private function persist_own_song($user_id, $personal_id, $title, $content, $performer, $capo, $folder_id) {
        if ($personal_id) {
            $post = get_post($personal_id);
            if (!$post || $post->post_type !== self::CPT
                || (int) $post->post_author !== $user_id
                || (int) $post->post_parent !== 0) {
                return new WP_Error('not_found', 'שיר לא נמצא.');
            }
            $res = wp_update_post([
                'ID'           => $personal_id,
                'post_title'   => $title,
                'post_content' => trim($content),
            ], true);
            if (is_wp_error($res)) return new WP_Error('save_failed', 'שגיאה בשמירה.');
        } else {
            if (count(self::get_own_songs($user_id)) >= self::MAX_OWN_SONGS) {
                return new WP_Error('limit', 'הגעת למגבלת ' . self::MAX_OWN_SONGS . ' שירים אישיים.');
            }
            $personal_id = wp_insert_post([
                'post_type'    => self::CPT,
                'post_title'   => $title,
                'post_content' => trim($content),
                'post_status'  => 'publish',
                'post_author'  => $user_id,
                'post_parent'  => 0,
            ], true);
            if (is_wp_error($personal_id)) return new WP_Error('save_failed', 'שגיאה בשמירה.');
            update_post_meta($personal_id, self::OWN_SONG_META, '1');
        }

        update_post_meta($personal_id, self::PERFORMER_META, $performer);
        update_post_meta($personal_id, self::CAPO_META, $capo);
        if ($folder_id !== '' && self::folder_exists($user_id, $folder_id)) {
            update_post_meta($personal_id, self::ITEM_FOLDER_META, $folder_id);
        }
        return (int) $personal_id;
    }

    /**
     * AJAX: "הצע לפרסום באתר" — שומר עותק אישי במחברת ויוצר שיר ציבורי ממתין-לאישור.
     * השיר-משלי נשאר תמיד אצל המשתמש; מקושר לשיר הציבורי דרך post_meta.
     */
    public function ajax_publish_song() {
        if (!is_user_logged_in()) {
            wp_send_json_error('יש להתחבר.');
        }
        if (!check_ajax_referer('achord_upload_nonce', 'achord_nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $user_id     = get_current_user_id();
        $personal_id = isset($_POST['personal_id']) ? intval($_POST['personal_id']) : 0;
        $title       = sanitize_text_field(wp_unslash($_POST['title'] ?? ''));
        $performer   = sanitize_text_field(wp_unslash($_POST['performer'] ?? ''));
        $capo        = isset($_POST['capo']) && is_numeric($_POST['capo']) ? intval($_POST['capo']) : 0;
        $content     = isset($_POST['version_normal'])
            ? sanitize_textarea_field(wp_unslash($_POST['version_normal'])) : '';
        $folder_id   = isset($_POST['folder']) ? sanitize_text_field(wp_unslash($_POST['folder'])) : '';

        // לפרסום ציבורי — מבצע/ת חובה (איכות הספרייה)
        if ($title === '' || trim($content) === '' || $performer === '') {
            wp_send_json_error('כדי להציע לפרסום יש למלא שם שיר, מבצע/ת ותוכן.');
        }
        // הצהרת רישיון — נדרשת בכל מסלול שמייצר שיר ציבורי, בדיוק כמו בטופס
        // ההעלאה. שמירה פרטית במחברת לא דורשת אותה.
        if (empty($_POST['license_consent'])) {
            wp_send_json_error('צריך לאשר את הצהרת הרישיון כדי להציע את השיר לפרסום.');
        }
        if (mb_strlen($content, 'UTF-8') > 50000) {
            wp_send_json_error('הטקסט ארוך מדי (מקסימום 50,000 תווים).');
        }

        // הגבלת קצב: 20 הצעות לפרסום לשעה למשתמש
        $rl_key = 'ams_nb_pub_' . $user_id;
        $rl     = (int) get_transient($rl_key);
        if ($rl >= 20) {
            wp_send_json_error('שלחת יותר מדי הצעות בשעה האחרונה. נסה שוב מאוחר יותר.');
        }

        // שלב 1: שמירת/עדכון העותק האישי (תמיד נשמר)
        $personal_id = $this->persist_own_song($user_id, $personal_id, $title, $content, $performer, $capo, $folder_id);
        if (is_wp_error($personal_id)) {
            wp_send_json_error($personal_id->get_error_message());
        }

        // שלב 2: שיר ציבורי ממתין. אם כבר הוצע — לא מכפילים.
        $existing_public = (int) get_post_meta($personal_id, self::PUBLIC_SONG_META, true);
        if ($existing_public) {
            $pub = get_post($existing_public);
            if ($pub && $pub->post_type === 'achord_song_cpt') {
                if ($pub->post_status === 'pending') {
                    // עדכון ההצעה הממתינה הקיימת
                    wp_update_post([
                        'ID'           => $existing_public,
                        'post_title'   => $title . ' – ' . $performer,
                        'post_content' => $this->build_public_song_content($title, $performer, $capo, $content),
                    ]);
                    // ההסכמה נרשמת מחדש — היא חלה על הנוסח שנשלח עכשיו.
                    if (function_exists('uc_license_consent_record')) {
                        uc_license_consent_record($existing_public);
                    }
                    set_transient($rl_key, $rl + 1, HOUR_IN_SECONDS);
                    wp_send_json_success([
                        'message'  => 'ההצעה הממתינה עודכנה.',
                        'redirect' => self::notebook_url(),
                    ]);
                }
                if ($pub->post_status === 'publish') {
                    wp_send_json_error('השיר כבר פורסם באתר. כדי לעדכן את הגרסה הציבורית — הצע תיקון מתוך עמוד השיר.');
                }
            }
        }

        $public_id = wp_insert_post([
            'post_title'   => $title . ' – ' . $performer,
            'post_content' => $this->build_public_song_content($title, $performer, $capo, $content),
            'post_status'  => 'pending',
            'post_author'  => $user_id,
            'post_type'    => 'achord_song_cpt',
        ], true);
        if (is_wp_error($public_id)) {
            wp_send_json_error('שגיאה ביצירת ההצעה לפרסום.');
        }

        // רישום ההסכמה על השיר: מתי, מי, ועל איזה נוסח בדיוק.
        if (function_exists('uc_license_consent_record')) {
            uc_license_consent_record($public_id);
        }

        // שיוך המבצע/ת — דרך אותו שער-אישור של טופס ההעלאה. שם שכבר קיים
        // משויך מיד; שם חדש נשמר כהצעה והופך לטרם אמיתי רק באישור השיר.
        // בלי זה כל משתמש רשום היה מייצר טרם `singer` חדש ישירות.
        if (function_exists('uc_assign_or_propose_terms')) {
            $proposed = [];
            if ($performer !== '') {
                uc_assign_or_propose_terms($public_id, [$performer], 'singer', $proposed);
            }
            if (!empty($proposed)) {
                update_post_meta($public_id, '_uc_proposed_terms', $proposed);
            }
        } elseif ($performer !== '') {
            wp_set_object_terms($public_id, $performer, 'singer', true);
        }

        update_post_meta($personal_id, self::PUBLIC_SONG_META, $public_id);
        update_post_meta($public_id, self::SOURCE_PERSONAL_META, $personal_id);
        set_transient($rl_key, $rl + 1, HOUR_IN_SECONDS);

        wp_send_json_success([
            'message'     => 'נשלח לאישור. הגרסה שלך שמורה במחברת.',
            'personal_id' => $personal_id,
            'redirect'    => self::notebook_url(),
        ]);
    }

    /** בונה את תוכן השיר הציבורי בפורמט [achord_song] (כמו טופס ההעלאה). */
    private function build_public_song_content($title, $performer, $capo, $content) {
        // אבטחה: `[/achord_song]` בתוך שדה סוגר את השורטקוד העוטף מוקדם וכל
        // מה שאחריו מורץ כשורטקוד עצמאי בכל צפייה. אקורדים `[Am]` לא נפגעים.
        $title     = AMS_Content_Guard::strip_structural_tags($title);
        $performer = AMS_Content_Guard::strip_structural_tags($performer);
        $content   = AMS_Content_Guard::strip_structural_tags($content);

        return "[achord_song]\n"
            . "[song_title]{$title}[/song_title]\n"
            . "[performer]{$performer}[/performer]\n"
            . "[capo]{$capo}[/capo]\n"
            . "[version=normal]\n" . trim($content) . "\n[/version]\n"
            . "[/achord_song]";
    }

    public function ajax_delete_song() {
        if (!is_user_logged_in()) wp_send_json_error('יש להתחבר.');
        if (!check_ajax_referer(self::NONCE, 'nonce', false)) wp_send_json_error('שגיאת אבטחה.');

        $user_id     = get_current_user_id();
        $personal_id = isset($_POST['personal_id']) ? intval($_POST['personal_id']) : 0;
        $post        = $personal_id ? get_post($personal_id) : null;

        if (!$post || $post->post_type !== self::CPT
            || (int) $post->post_author !== $user_id
            || (int) $post->post_parent !== 0) {
            wp_send_json_error('שיר לא נמצא.');
        }
        wp_delete_post($personal_id, true);
        wp_send_json_success(['message' => 'השיר נמחק.']);
    }

    /* ════════════════════════ עזרי URL/תצוגה ════════════════════════ */

    public static function notebook_url($args = []) {
        $base = get_permalink(get_page_by_path('notebook'));
        if (!$base) $base = home_url('/notebook/');
        return $args ? add_query_arg($args, $base) : $base;
    }

    /** בונה בלוק [achord_song] לרינדור דרך ה-renderer הקיים של עמוד השיר */
    private function build_song_block($post) {
        $performer = get_post_meta($post->ID, self::PERFORMER_META, true);
        $capo      = (int) get_post_meta($post->ID, self::CAPO_META, true);
        // אבטחה: הבלוק הזה עובר do_shortcode. `[/achord_song]` בכותרת או בגוף
        // סוגר את השורטקוד העוטף מוקדם, וכל מה שאחריו מורץ כשורטקוד עצמאי.
        // אקורדים (`[Am]`) שורדים — ראה AMS_Content_Guard.
        $title     = AMS_Content_Guard::strip_structural_tags($post->post_title);
        $performer = AMS_Content_Guard::strip_structural_tags($performer);
        $content   = AMS_Content_Guard::strip_structural_tags($post->post_content);
        $block  = "[achord_song]\n";
        $block .= '[song_title]' . $title . "[/song_title]\n";
        if ($performer !== '') $block .= '[performer]' . $performer . "[/performer]\n";
        if ($capo > 0)         $block .= '[capo]' . $capo . "[/capo]\n";
        $block .= "[version=normal]\n" . $content . "\n[/version]\n";
        $block .= '[/achord_song]';
        return $block;
    }

    /* ════════════════════════ שורטקוד ראשי ════════════════════════ */

    public function render_notebook($atts = []) {
        if (!is_user_logged_in()) {
            return '<p class="ams-notice">יש להתחבר כדי לפתוח את המחברת האישית שלך.</p>';
        }

        $np = isset($_GET['np']) ? sanitize_text_field(wp_unslash($_GET['np'])) : '';

        // מצב עריכה / יצירה — מציג את העורך
        if ($np === 'new') {
            return $this->render_editor(['personal_id' => 0]);
        }
        if (strpos($np, 'edit-') === 0) {
            $pid = intval(substr($np, 5));
            return $this->render_editor(['personal_id' => $pid]);
        }
        // מצב צפייה בשיר-משלי
        if (strpos($np, 'view-') === 0) {
            return $this->render_own_song_view(intval(substr($np, 5)));
        }

        return $this->render_list();
    }

    private function render_own_song_view($pid) {
        $user_id = get_current_user_id();
        $post    = $pid ? get_post($pid) : null;
        if (!$post || $post->post_type !== self::CPT
            || (int) $post->post_author !== $user_id || (int) $post->post_parent !== 0) {
            return '<p class="ams-notice">השיר לא נמצא.</p>';
        }

        ob_start(); ?>
        <div class="ams-nb-view" dir="rtl">
            <div class="ams-nb-view-bar">
                <a class="ams-nb-btn ams-nb-btn--ghost" href="<?php echo esc_url(self::notebook_url()); ?>">→ חזרה למחברת</a>
                <a class="ams-nb-btn" href="<?php echo esc_url(self::notebook_url(['np' => 'edit-' . $post->ID])); ?>">✏️ עריכה</a>
            </div>
            <?php echo do_shortcode($this->build_song_block($post)); ?>
        </div>
        <?php
        return ob_get_clean();
    }

    private function render_list() {
        $user_id   = get_current_user_id();
        $folders   = self::get_folders($user_id);
        $own_songs = self::get_own_songs($user_id);

        // גרסאות אישיות לשירי הספרייה (parent != 0)
        $personals = get_posts([
            'post_type'      => self::CPT,
            'author'         => $user_id,
            'post_status'    => 'publish',
            'posts_per_page' => 200,
            'no_found_rows'  => true,
            'orderby'        => 'modified',
            'order'          => 'DESC',
        ]);
        $versions = array_filter($personals, fn($p) => (int) $p->post_parent !== 0);

        $saved_ids   = AMS_Saved_Songs_Handler::get_saved_ids($user_id);
        $saved_map   = get_user_meta($user_id, self::SAVED_FOLDERS_META, true);
        if (!is_array($saved_map)) $saved_map = [];

        // Prime לקאש: אוספים את כל ה-IDs החיצוניים (שירי-אב לגרסאות, שירים שמורים,
        // ושירים ציבוריים מקושרים) ומחממים פוסטים+מטא+טרמינים בשאילתה אחת — מבטל N+1.
        $prime_ids = $saved_ids;
        foreach ($versions as $vp) { $prime_ids[] = (int) $vp->post_parent; }
        foreach ($own_songs as $op) {
            $linked = (int) get_post_meta($op->ID, self::PUBLIC_SONG_META, true);
            if ($linked) $prime_ids[] = $linked;
        }
        $prime_ids = array_filter(array_unique(array_map('intval', $prime_ids)));
        if ($prime_ids) {
            _prime_post_caches($prime_ids, true, true);
        }

        // בניית רשימת פריטים מאוחדת
        $items = [];
        foreach ($own_songs as $p) {
            // מצב פרסום: נגזר חי מסטטוס השיר הציבורי המקושר (משקף אישור מנהל אוטומטית)
            $pub = '';
            $pub_link = '';
            $pub_id = (int) get_post_meta($p->ID, self::PUBLIC_SONG_META, true);
            if ($pub_id) {
                $st = get_post_status($pub_id);
                if ($st === 'pending')      { $pub = 'pending'; }
                elseif ($st === 'publish')  { $pub = 'published'; $pub_link = get_permalink($pub_id); }
            }
            $items[] = [
                'key'    => 'personal:' . $p->ID,
                'type'   => 'own',
                'id'     => $p->ID,
                'title'  => $p->post_title,
                'sub'    => get_post_meta($p->ID, self::PERFORMER_META, true),
                'url'    => self::notebook_url(['np' => 'view-' . $p->ID]),
                'edit'   => self::notebook_url(['np' => 'edit-' . $p->ID]),
                'folder' => (string) get_post_meta($p->ID, self::ITEM_FOLDER_META, true),
                'assign' => ['item_type' => 'personal', 'item_id' => $p->ID],
                'badge'  => '✍️ שלי',
                'pub'    => $pub,
                'pub_link' => $pub_link,
            ];
        }
        foreach ($versions as $p) {
            $song = get_post($p->post_parent);
            if (!$song) continue;
            $items[] = [
                'key'    => 'personal:' . $p->ID,
                'type'   => 'version',
                'id'     => $p->ID,
                'title'  => get_the_title($song->ID),
                'sub'    => '',
                'url'    => get_permalink($song->ID),
                'edit'   => get_permalink($song->ID),
                'folder' => (string) get_post_meta($p->ID, self::ITEM_FOLDER_META, true),
                'assign' => ['item_type' => 'personal', 'item_id' => $p->ID],
                'badge'  => '🎸 גרסה שלי',
            ];
        }
        foreach ($saved_ids as $sid) {
            $song = get_post($sid);
            if (!$song || $song->post_type !== 'achord_song_cpt') continue;
            $singers = get_the_terms($sid, 'singer');
            $items[] = [
                'key'    => 'saved:' . $sid,
                'type'   => 'saved',
                'id'     => $sid,
                'title'  => $song->post_title,
                'sub'    => (!empty($singers) && !is_wp_error($singers)) ? $singers[0]->name : '',
                'url'    => get_permalink($sid),
                'edit'   => '',
                'folder' => isset($saved_map[$sid]) ? (string) $saved_map[$sid] : '',
                'assign' => ['item_type' => 'saved', 'item_id' => $sid],
                'badge'  => '🔖 שמור',
            ];
        }

        // קיבוץ לפי תיקייה
        $by_folder = ['' => []];
        foreach ($folders as $f) $by_folder[$f['id']] = [];
        foreach ($items as $it) {
            $fid = ($it['folder'] !== '' && isset($by_folder[$it['folder']])) ? $it['folder'] : '';
            $by_folder[$fid][] = $it;
        }

        // אפשרויות בחירת תיקייה ל-JS
        $folder_options = $folders;

        ob_start(); ?>
        <div class="ams-notebook" dir="rtl"
             data-nonce="<?php echo esc_attr(wp_create_nonce(self::NONCE)); ?>"
             data-ajax="<?php echo esc_attr(admin_url('admin-ajax.php')); ?>"
             data-folders="<?php echo esc_attr(wp_json_encode($folder_options)); ?>">

            <header class="ams-nb-head">
                <h1 class="ams-nb-title">📓 המחברת שלי</h1>
                <p class="ams-nb-tagline">השירים, האקורדים והגרסאות שלך — במקום אחד, פרטי לחלוטין.</p>
                <div class="ams-nb-head-actions">
                    <a class="ams-nb-btn ams-nb-btn--primary" href="<?php echo esc_url(self::notebook_url(['np' => 'new'])); ?>">✍️ כתוב שיר חדש</a>
                    <button type="button" class="ams-nb-btn ams-nb-btn--ghost" id="ams-nb-add-folder">📁 תיקייה חדשה</button>
                </div>
            </header>

            <?php if (empty($items)): ?>
                <div class="ams-nb-empty">
                    <p>המחברת שלך עדיין ריקה.</p>
                    <p class="ams-nb-empty-sub">לחץ על <strong>✍️ כתוב שיר חדש</strong> כדי לכתוב שיר משלך, או שמור שירים מהספרייה והם יופיעו כאן.</p>
                </div>
            <?php else: ?>

                <div class="ams-nb-filters" role="group" aria-label="סינון">
                    <button type="button" class="ams-nb-chip is-active" data-filter="all">הכל</button>
                    <button type="button" class="ams-nb-chip" data-filter="own">✍️ שלי</button>
                    <button type="button" class="ams-nb-chip" data-filter="version">🎸 גרסאות</button>
                    <button type="button" class="ams-nb-chip" data-filter="saved">🔖 שמורים</button>
                    <button type="button" class="ams-nb-chip" data-filter="published">✅ מפורסמים</button>
                </div>

                <div class="ams-nb-folders">
                    <?php
                    // סדר תצוגה: כל תיקייה (לפי סדר המשתמש) ואז "ללא תיקייה"
                    $render_order = $folders;
                    $render_order[] = ['id' => '', 'name' => 'ללא תיקייה'];
                    foreach ($render_order as $f):
                        $fid     = $f['id'];
                        $f_items = $by_folder[$fid] ?? [];
                        // לא מציגים תיקיית "ללא תיקייה" אם ריקה
                        if ($fid === '' && empty($f_items)) continue;
                    ?>
                    <section class="ams-nb-folder" data-folder-id="<?php echo esc_attr($fid); ?>">
                        <header class="ams-nb-folder-head">
                            <span class="ams-nb-folder-name">
                                <?php echo ($fid === '') ? '🗂️' : '📁'; ?>
                                <span class="ams-nb-folder-label"><?php echo esc_html($f['name']); ?></span>
                                <span class="ams-nb-folder-count"><?php echo count($f_items); ?></span>
                            </span>
                            <?php if ($fid !== ''): ?>
                            <span class="ams-nb-folder-tools">
                                <button type="button" class="ams-nb-icon-btn ams-nb-rename" title="שנה שם">✎</button>
                                <button type="button" class="ams-nb-icon-btn ams-nb-del-folder" title="מחק תיקייה">🗑</button>
                            </span>
                            <?php endif; ?>
                        </header>
                        <ul class="ams-nb-items">
                            <?php foreach ($f_items as $it): ?>
                            <?php $pub = $it['pub'] ?? ''; ?>
                            <li class="ams-nb-item"
                                data-key="<?php echo esc_attr($it['key']); ?>"
                                data-type="<?php echo esc_attr($it['type']); ?>"
                                data-pub="<?php echo esc_attr($pub); ?>"
                                data-assign-type="<?php echo esc_attr($it['assign']['item_type']); ?>"
                                data-assign-id="<?php echo esc_attr($it['assign']['item_id']); ?>">
                                <a class="ams-nb-item-main" href="<?php echo esc_url($it['url']); ?>">
                                    <span class="ams-nb-item-badge"><?php echo esc_html($it['badge']); ?></span>
                                    <span class="ams-nb-item-title"><?php echo esc_html($it['title']); ?></span>
                                    <?php if ($it['sub']): ?><span class="ams-nb-item-sub"><?php echo esc_html($it['sub']); ?></span><?php endif; ?>
                                    <?php if ($pub === 'pending'): ?>
                                        <span class="ams-nb-status ams-nb-status--pending">⏳ ממתין לאישור</span>
                                    <?php elseif ($pub === 'published'): ?>
                                        <span class="ams-nb-status ams-nb-status--published">✅ פורסם</span>
                                    <?php endif; ?>
                                </a>
                                <div class="ams-nb-item-actions">
                                    <select class="ams-nb-move" aria-label="העבר לתיקייה">
                                        <option value="">ללא תיקייה</option>
                                        <?php foreach ($folders as $fo): ?>
                                        <option value="<?php echo esc_attr($fo['id']); ?>" <?php selected($fo['id'], $it['folder']); ?>><?php echo esc_html($fo['name']); ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                    <?php if ($it['type'] === 'own'): ?>
                                    <a class="ams-nb-icon-btn" href="<?php echo esc_url($it['edit']); ?>" title="עריכה">✏️</a>
                                    <button type="button" class="ams-nb-icon-btn ams-nb-del-song" title="מחק שיר">🗑</button>
                                    <?php endif; ?>
                                </div>
                            </li>
                            <?php endforeach; ?>
                            <?php if (empty($f_items)): ?>
                            <li class="ams-nb-item ams-nb-item--empty">אין פריטים בתיקייה זו עדיין.</li>
                            <?php endif; ?>
                        </ul>
                    </section>
                    <?php endforeach; ?>
                </div>

            <?php endif; ?>
        </div>
        <?php
        $this->print_list_script();
        return ob_get_clean();
    }

    private function print_list_script() {
        ?>
        <script>
        (function () {
            var root = document.querySelector('.ams-notebook');
            if (!root) return;
            var AJAX  = root.dataset.ajax;
            var NONCE = root.dataset.nonce;

            function post(action, data) {
                var fd = new FormData();
                fd.append('action', action);
                fd.append('nonce', NONCE);
                Object.keys(data).forEach(function (k) { fd.append(k, data[k]); });
                return fetch(AJAX, { method: 'POST', body: fd }).then(function (r) { return r.json(); });
            }

            // תיקייה חדשה
            var addBtn = document.getElementById('ams-nb-add-folder');
            if (addBtn) addBtn.addEventListener('click', function () {
                var name = prompt('שם התיקייה החדשה:');
                if (!name) return;
                post('achord_nb_create_folder', { name: name }).then(function (res) {
                    if (res.success) location.reload();
                    else alert(res.data || 'שגיאה');
                });
            });

            // שינוי שם / מחיקת תיקייה
            root.querySelectorAll('.ams-nb-folder').forEach(function (sec) {
                var fid = sec.dataset.folderId;
                var rename = sec.querySelector('.ams-nb-rename');
                if (rename) rename.addEventListener('click', function () {
                    var cur = sec.querySelector('.ams-nb-folder-label').textContent.trim();
                    var name = prompt('שם חדש לתיקייה:', cur);
                    if (!name || name === cur) return;
                    post('achord_nb_rename_folder', { folder_id: fid, name: name }).then(function (res) {
                        if (res.success) location.reload(); else alert(res.data || 'שגיאה');
                    });
                });
                var del = sec.querySelector('.ams-nb-del-folder');
                if (del) del.addEventListener('click', function () {
                    if (!confirm('למחוק את התיקייה? הפריטים יישארו במחברת ללא תיקייה.')) return;
                    post('achord_nb_delete_folder', { folder_id: fid }).then(function (res) {
                        if (res.success) location.reload(); else alert(res.data || 'שגיאה');
                    });
                });
            });

            // העברת פריט בין תיקיות
            root.querySelectorAll('.ams-nb-item').forEach(function (li) {
                var sel = li.querySelector('.ams-nb-move');
                if (sel) sel.addEventListener('change', function () {
                    post('achord_nb_assign', {
                        item_type: li.dataset.assignType,
                        item_id:   li.dataset.assignId,
                        folder_id: sel.value
                    }).then(function (res) {
                        if (res.success) location.reload(); else alert(res.data || 'שגיאה');
                    });
                });
                // מחיקת שיר-משלי
                var del = li.querySelector('.ams-nb-del-song');
                if (del) del.addEventListener('click', function () {
                    if (!confirm('למחוק את השיר מהמחברת? פעולה זו אינה הפיכה.')) return;
                    var id = li.dataset.assignId;
                    post('achord_notebook_delete_song', { personal_id: id }).then(function (res) {
                        if (res.success) { li.style.opacity = '0'; setTimeout(function () { li.remove(); }, 250); }
                        else alert(res.data || 'שגיאה');
                    });
                });
            });

            // סינון לפי צ'יפים (סוג פריט / מפורסמים)
            var chips = root.querySelectorAll('.ams-nb-chip');
            chips.forEach(function (chip) {
                chip.addEventListener('click', function () {
                    chips.forEach(function (c) { c.classList.remove('is-active'); });
                    chip.classList.add('is-active');
                    var f = chip.dataset.filter;
                    root.querySelectorAll('.ams-nb-item').forEach(function (li) {
                        if (li.classList.contains('ams-nb-item--empty')) return;
                        var show = (f === 'all')
                            ? true
                            : (f === 'published')
                                ? (li.dataset.pub === 'published')
                                : (li.dataset.type === f);
                        li.style.display = show ? '' : 'none';
                    });
                    // הסתרת תיקיות שכל פריטיהן הוסתרו
                    root.querySelectorAll('.ams-nb-folder').forEach(function (sec) {
                        var visible = sec.querySelectorAll('.ams-nb-item:not(.ams-nb-item--empty)');
                        var any = Array.prototype.some.call(visible, function (li) { return li.style.display !== 'none'; });
                        sec.style.display = any ? '' : 'none';
                    });
                });
            });
        })();
        </script>
        <?php
    }

    /* ════════════════════════ שורטקוד עורך ════════════════════════ */

    /**
     * [achord_notebook_editor] — עורך כתיבת שיר-משלי. ממחזר את achord-upload.js.
     */
    public function render_editor($atts = []) {
        if (!is_user_logged_in()) {
            return '<p class="ams-notice">יש להתחבר כדי לכתוב שיר.</p>';
        }
        $atts = shortcode_atts(['personal_id' => 0], $atts, 'achord_notebook_editor');
        $personal_id = intval($atts['personal_id']);
        $user_id     = get_current_user_id();

        $prefill = ['title' => '', 'performer' => '', 'capo' => 0, 'content' => ''];
        if ($personal_id) {
            $post = get_post($personal_id);
            if (!$post || $post->post_type !== self::CPT
                || (int) $post->post_author !== $user_id || (int) $post->post_parent !== 0) {
                return '<p class="ams-notice">השיר לא נמצא.</p>';
            }
            $prefill['title']     = $post->post_title;
            $prefill['performer'] = get_post_meta($post->ID, self::PERFORMER_META, true);
            $prefill['capo']      = (int) get_post_meta($post->ID, self::CAPO_META, true);
            $prefill['content']   = $post->post_content;
        }

        // ספריית האקורדים המלאה (כמו בטופס ההעלאה)
        $qualities = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim', 'aug', '6', 'm6', '9', 'm9', 'add9', 'dim7', 'm7b5'];
        $order     = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        $full_chord_library = [];
        foreach ($order as $root) {
            $chords = [];
            foreach ($qualities as $q) $chords[] = $root . $q;
            $full_chord_library[$root] = $chords;
        }

        $bridge = [
            'prefill'         => ['title' => $prefill['title'], 'performer' => $prefill['performer'],
                                  'content' => $prefill['content'], 'reco' => []],
            'library'         => $full_chord_library,
            'ajaxUrl'         => admin_url('admin-ajax.php'),
            'nonce'           => wp_create_nonce('achord_upload_nonce'),
            'mode'            => 'notebook',
            'submitAction'    => 'achord_notebook_save_song',
            'requirePerformer'=> false,
            'successMsg'      => 'השיר נשמר במחברת ✓',
            'redirectUrl'     => self::notebook_url(),
            'publishAction'   => 'achord_notebook_publish_song',
            'publishMsg'      => 'נשלח לאישור! 🎉 הגרסה שלך נשמרה במחברת.',
        ];

        ob_start(); ?>
        <script>window.ACHORD_UPLOAD_DATA = <?php echo wp_json_encode($bridge); ?>;</script>

        <div class="ams-nb-editor-wrap" dir="rtl">
            <div class="ams-nb-view-bar">
                <a class="ams-nb-btn ams-nb-btn--ghost" href="<?php echo esc_url(self::notebook_url()); ?>">→ חזרה למחברת</a>
                <span class="ams-nb-editor-heading"><?php echo $personal_id ? '✏️ עריכת שיר במחברת' : '✍️ שיר חדש'; ?></span>
            </div>

            <div class="ams-nb-context-banner" role="note">
                <span class="ams-nb-context-banner__icon" aria-hidden="true">🔒</span>
                <div class="ams-nb-context-banner__text">
                    <strong><?php echo $personal_id ? 'אתה עורך שיר במחברת האישית שלך (פרטי).' : 'אתה כותב שיר חדש במחברת האישית שלך (פרטי).'; ?></strong>
                    בסיום תוכל לבחור: <em>🔒 לשמור רק לעצמך במחברת</em>, או <em>🌐 להציע אותו לפרסום באתר לכולם</em>.
                </div>
            </div>

            <form id="achord-upload-form" class="auf-form" dir="rtl" novalidate>
                <input type="hidden" name="personal_id" value="<?php echo esc_attr($personal_id); ?>">

                <section class="auf-section" data-section="details">
                    <header class="auf-section__head"><h2 class="auf-section__title">פרטי השיר</h2></header>
                    <div class="auf-section__body">
                        <div class="auf-field-row">
                            <div class="auf-field auf-field--required">
                                <label class="auf-label" for="auf-title">שם השיר</label>
                                <input class="auf-input" id="auf-title" type="text" name="title"
                                       value="<?php echo esc_attr($prefill['title']); ?>" autocomplete="off" required>
                            </div>
                            <div class="auf-field">
                                <label class="auf-label" for="auf-performer">מבצע/ת <span class="auf-muted">(אופציונלי)</span></label>
                                <input class="auf-input" id="auf-performer" type="text" name="performer"
                                       value="<?php echo esc_attr($prefill['performer']); ?>" autocomplete="off">
                            </div>
                        </div>
                    </div>
                </section>

                <section class="auf-section" data-section="capo">
                    <header class="auf-section__head"><h2 class="auf-section__title">קאפו</h2></header>
                    <div class="auf-section__body">
                        <div class="auf-capo-pills" role="group" aria-label="בחירת קאפו">
                            <?php for ($c = 0; $c <= 12; $c++): ?>
                            <label class="auf-capo-pill">
                                <input type="radio" name="capo" value="<?php echo $c; ?>"
                                       <?php checked($c, (int) $prefill['capo']); ?> hidden>
                                <span><?php echo ($c === 0) ? 'ללא' : $c; ?></span>
                            </label>
                            <?php endfor; ?>
                        </div>
                    </div>
                </section>

                <section class="auf-section auf-section--main" data-section="chords">
                    <header class="auf-section__head"><h2 class="auf-section__title">אקורדים ומילים</h2></header>
                    <div class="auf-section__body">
                        <div class="auf-rec-bar-wrap">
                            <div class="auf-rec-bar-header">
                                <span class="auf-label">אקורדים שנבחרו</span>
                                <div class="auf-rec-bar-actions">
                                    <button type="button" id="auf-edit-rec-btn" class="auf-ghost-btn" aria-pressed="false">עריכה</button>
                                    <button type="button" id="auf-open-library-btn" class="auf-ghost-btn">טבלת אקורדים</button>
                                </div>
                            </div>
                            <div id="auf-recommended-bar" class="auf-rec-bar" role="toolbar" aria-label="אקורדים שנבחרו"></div>
                        </div>

                        <div class="auf-toolbar">
                            <div class="auf-chord-input-wrap">
                                <input type="text" class="auf-input auf-input--sm" id="auf-chord-input"
                                       placeholder="אקורד..." autocomplete="off" spellcheck="false">
                                <button type="button" id="auf-add-chord-btn" class="auf-ghost-btn">+</button>
                            </div>
                        </div>

                        <div class="auf-editor-wrap">
                            <div class="auf-editor-mode-bar">
                                <button type="button" id="auf-mode-text" class="auf-mode-btn auf-mode-btn--active" aria-pressed="true">✏️ עריכת מילים</button>
                                <button type="button" id="auf-mode-chords" class="auf-mode-btn" aria-pressed="false">🎸 הוסף אקורדים</button>
                                <button type="button" id="auf-preview-btn" class="auf-ghost-btn">👁 תצוגה חיה</button>
                            </div>
                            <div id="auf-text-mode" class="auf-editor-panel">
                                <textarea class="auf-textarea" id="auf-editor-normal" name="version_normal"
                                          rows="14" dir="rtl" spellcheck="true"
                                          placeholder="הקלד/י את מילות השיר כאן..."
                                          required><?php echo esc_textarea($prefill['content']); ?></textarea>
                            </div>
                            <div id="auf-chord-mode" class="auf-editor-panel" hidden>
                                <div class="auf-chord-hint">לחץ/י על מילה → בחר/י אקורד מהסרגל או גרור/י ישירות</div>
                                <div id="auf-token-canvas" class="auf-token-canvas" dir="rtl" role="group" aria-label="בחירת מיקום אקורדים"></div>
                            </div>
                            <div id="auf-preview-panel" class="auf-editor-panel" hidden>
                                <div id="auf-song-preview" class="auf-preview-content"></div>
                            </div>
                        </div>
                    </div>
                </section>

                <div class="auf-submit-bar">
                    <div id="auf-upload-msg" class="auf-msg" role="status" aria-live="polite"></div>

                    <?php
                    // הצהרת רישיון — רלוונטית רק להצעה לפרסום, ולכן אינה `required`
                    // (שמירה פרטית במחברת לא דורשת אותה). האכיפה שקובעת היא בשרת,
                    // ב-ajax_publish_song. הנוסח מגיע מ-mu-plugin אחד כדי שמה
                    // שנרשם בבסיס הנתונים יהיה בדיוק מה שהמשתמש ראה.
                    $license_text = function_exists('uc_license_consent_text')
                        ? uc_license_consent_text()
                        : 'בשליחת השיר אני מאשר שהתמלול הוא עבודה שלי, ומשחרר אותו לשימוש חופשי תחת הרישיון של האתר.';
                    ?>
                    <div class="auf-consent" style="display:flex;gap:8px;align-items:flex-start;margin:0 0 14px;font-size:14px;line-height:1.55;">
                        <input type="checkbox" name="license_consent" id="auf-license-consent" value="1"
                               style="margin-top:3px;flex:0 0 auto;">
                        <label for="auf-license-consent" style="cursor:pointer;">
                            <?php echo esc_html($license_text); ?>
                            <span class="auf-muted">(נדרש רק כדי להציע לפרסום)</span>
                        </label>
                    </div>

                    <div class="achord-save-bar" role="group" aria-label="שמירת השיר">
                        <button type="submit" id="auf-submit-btn" class="achord-save-bar__btn achord-save-bar__btn--personal">
                            <span class="achord-save-bar__title">🔒 <?php echo $personal_id ? 'שמור שינויים' : 'שמור במחברת'; ?></span>
                            <span class="achord-save-bar__sub">פרטי — רק אצלך במחברת</span>
                        </button>
                        <button type="button" id="auf-publish-btn" class="achord-save-bar__btn achord-save-bar__btn--public">
                            <span class="achord-save-bar__title">🌐 הצע לפרסום באתר</span>
                            <span class="achord-save-bar__sub">יישלח לאישור ויתווסף לספרייה הציבורית. נשמר גם אצלך.</span>
                        </button>
                    </div>
                </div>

                <input type="hidden" name="achord_nonce" value="<?php echo wp_create_nonce('achord_upload_nonce'); ?>">
            </form>

            <div id="auf-library-modal" class="auf-modal" hidden role="dialog" aria-modal="true" aria-labelledby="auf-modal-title">
                <div class="auf-modal__overlay"></div>
                <div class="auf-modal__content">
                    <div class="auf-modal__header">
                        <h3 id="auf-modal-title" class="auf-section__title">ספריית אקורדים מלאה</h3>
                        <button type="button" class="auf-modal__close" aria-label="סגור">✕</button>
                    </div>
                    <div class="auf-modal__body">
                        <input type="text" id="auf-library-search" class="auf-input" placeholder="חיפוש אקורד... (לדוגמה: Am7)" autocomplete="off">
                        <div id="auf-library-grid" class="auf-library-grid"></div>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}
