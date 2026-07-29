<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_User_Role_Handler
 *
 * מנהל היררכיית המשתמשים של אקורדים:
 *   guest (אורח)        — ללא חשבון
 *   follower (עוקב)     — הרשמה + אימות מייל
 *   contributor (תורם)  — אוטומטי: 48 שעות אחרי אימות + WP role = contributor
 *   editor (עורך)       — ידני ע"י מנהל + WP role = editor
 *   admin (מנהל)        — ידני בלבד + WP role = administrator
 *
 * ה-user_meta `achord_role` שומר את התפקיד כ-string.
 * WP role משמש לבדיקות הרשאות (current_user_can).
 */
class AMS_User_Role_Handler {

    const META_KEY          = 'achord_role';
    const META_VERIFIED_AT  = 'achord_email_verified_at';  // timestamp אימות מייל
    const CRON_HOOK         = 'achord_promote_followers_cron';

    // סף המלצה על קידום תורם→עורך
    const EDITOR_MIN_APPROVED  = 5;
    const EDITOR_MIN_PCT       = 75;   // אחוז אישור מינימלי

    public function __construct() {
        // קידום אוטומטי: cron job יומי
        add_action('init',               [$this, 'schedule_cron']);
        add_action(self::CRON_HOOK,      [$this, 'promote_followers_to_contributors']);

        // כאשר WP מאמת מייל (user_register עם אימות מייל) — מסמנים timestamp
        add_action('user_register',      [$this, 'on_user_register'], 10, 1);
        add_action('wp_login',           [$this, 'on_user_login'],    10, 2);

        // AJAX: קידום ידני לעורך (אדמין בלבד)
        add_action('wp_ajax_achord_promote_to_editor', [$this, 'ajax_promote_to_editor']);

        // עמוד אדמין: מועמדים לקידום
        add_action('admin_menu', [$this, 'register_admin_page']);

        // חסימת גישה ל-wp-admin לכל מי שאינו מנהל (לפי הנחיה: לא להכניס אף אחד למסך הניהול)
        add_action('admin_init',      [$this, 'block_admin_access'], 1);
        add_action('after_setup_theme',[$this, 'hide_admin_bar_for_non_admins']);

        // Google Login: ניתוב ברירת-מחדל לאחר התחברות → עמוד הבית (לא wp-admin)
        add_filter('rtcamp.google_default_redirect', function() {
            return home_url('/');
        });
    }

    // ─────────────────────────────────────────────
    // חסימת מסך הניהול (wp-admin) ללא-מנהלים
    // ─────────────────────────────────────────────

    /**
     * מנתב כל משתמש שאינו מנהל החוצה מ-wp-admin בחזרה לעמוד הבית.
     * admin-ajax.php מורשה תמיד כדי שבקשות ה-AJAX של החזית ימשיכו לעבוד.
     */
    public function block_admin_access() {
        if (wp_doing_ajax()) return;                 // אל תחסום admin-ajax.php
        if (!is_user_logged_in()) return;            // משאיר לוורדפרס לטפל בהתחברות
        if (current_user_can('manage_options')) return; // מנהלים בלבד

        wp_safe_redirect(home_url('/'));
        exit;
    }

    /**
     * מסתיר את סרגל הניהול בחזית לכל מי שאינו מנהל.
     */
    public function hide_admin_bar_for_non_admins() {
        if (is_user_logged_in() && !current_user_can('manage_options')) {
            show_admin_bar(false);
        }
    }

    // ─────────────────────────────────────────────
    // Helpers: קריאה/כתיבה של achord_role
    // ─────────────────────────────────────────────

    /**
     * מחזיר את התפקיד של משתמש (guest/follower/contributor/editor/admin).
     */
    public static function get_role($user_id = null) {
        if (!$user_id) $user_id = get_current_user_id();
        if (!$user_id) return 'guest';

        $role = get_user_meta($user_id, self::META_KEY, true);
        if ($role) return $role;

        // fallback: גזור מ-WP role
        $user = get_userdata($user_id);
        if (!$user) return 'guest';

        if (in_array('administrator', $user->roles, true)) return 'admin';
        if (in_array('editor', $user->roles, true))        return 'editor';
        if (in_array('contributor', $user->roles, true))   return 'contributor';
        if (in_array('subscriber', $user->roles, true))    return 'follower';

        return 'follower';
    }

    /**
     * קובע את התפקיד של משתמש — מעדכן גם את WP role.
     */
    public static function set_role($user_id, $achord_role) {
        $old_role = get_user_meta($user_id, self::META_KEY, true) ?: '';

        update_user_meta($user_id, self::META_KEY, $achord_role);

        $wp_role_map = [
            'follower'    => 'subscriber',
            'contributor' => 'contributor',
            'editor'      => 'editor',
            'admin'       => 'administrator',
        ];

        if (isset($wp_role_map[$achord_role])) {
            $user = new WP_User($user_id);
            $user->set_role($wp_role_map[$achord_role]);
        }

        // Log role change (נתפס ע"י Activity_Log_Handler)
        if ($old_role !== $achord_role) {
            do_action('achord_role_changed', $user_id, $achord_role, $old_role);
        }
    }

    // ─────────────────────────────────────────────
    // הרשמה ואימות מייל
    // ─────────────────────────────────────────────

    /**
     * בזמן הרשמה: מגדיר role=follower ושומר timestamp.
     */
    public function on_user_register($user_id) {
        // רק אם עדיין אין תפקיד מוגדר
        if (!get_user_meta($user_id, self::META_KEY, true)) {
            self::set_role($user_id, 'follower');
        }
    }

    /**
     * בזמן login: אם המייל אומת ועדיין אין timestamp — שומרים אותו.
     * ב-WP הרגיל המייל תמיד "מאומת" — עדכן אם משתמשים בפלאגין אימות חיצוני.
     */
    public function on_user_login($user_login, $user) {
        if (!get_user_meta($user->ID, self::META_VERIFIED_AT, true)) {
            update_user_meta($user->ID, self::META_VERIFIED_AT, time());
        }
    }

    // ─────────────────────────────────────────────
    // Cron: קידום עוקב→תורם
    // ─────────────────────────────────────────────

    public function schedule_cron() {
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time(), 'hourly', self::CRON_HOOK);
        }
    }

    /**
     * מעלה עוקבים שעברו 48 שעות מאז אימות המייל לדרגת תורם.
     */
    public function promote_followers_to_contributors() {
        $cutoff = time() - (48 * HOUR_IN_SECONDS);

        $followers = get_users([
            'meta_query' => [
                'relation' => 'AND',
                [
                    'key'   => self::META_KEY,
                    'value' => 'follower',
                ],
                [
                    'key'     => self::META_VERIFIED_AT,
                    'value'   => $cutoff,
                    'compare' => '<=',
                    'type'    => 'NUMERIC',
                ],
            ],
            'fields' => ['ID'],
        ]);

        foreach ($followers as $u) {
            self::set_role($u->ID, 'contributor');
        }
    }

    // ─────────────────────────────────────────────
    // מגבלת 5 הצעות פתוחות (contributor)
    // ─────────────────────────────────────────────

    /**
     * מחזיר true אם לתורם יש 5 או יותר הצעות פתוחות (pending).
     */
    public static function has_reached_proposal_limit($user_id) {
        $pending = get_posts([
            'post_type'      => 'achord_edit_proposal',
            'author'         => (int) $user_id,
            'post_status'    => 'pending',
            'posts_per_page' => 5,
            'no_found_rows'  => true,
            'fields'         => 'ids',
        ]);
        return count($pending) >= 5;
    }

    // ─────────────────────────────────────────────
    // זיהוי מועמדים לקידום (תורם→עורך)
    // ─────────────────────────────────────────────

    /**
     * מחזיר רשימת contributors שעומדים בסף הקידום:
     *   5+ הצעות שאושרו + אחוז אישור 75%+
     * מחזיר: [ user_id => ['approved'=>N, 'total'=>N, 'pct'=>N], ... ]
     */
    public static function get_promotion_candidates() {
        $contributors = get_users([
            'meta_key'   => self::META_KEY,
            'meta_value' => 'contributor',
            'fields'     => ['ID'],
        ]);

        $candidates = [];

        foreach ($contributors as $u) {
            $proposals = get_posts([
                'post_type'      => 'achord_edit_proposal',
                'author'         => (int) $u->ID,
                'post_status'    => ['publish', 'trash'],
                'posts_per_page' => -1,
                'no_found_rows'  => true,
                'fields'         => 'ids',
            ]);

            $approved_proposals = get_posts([
                'post_type'      => 'achord_edit_proposal',
                'author'         => (int) $u->ID,
                'post_status'    => 'publish',
                'posts_per_page' => -1,
                'no_found_rows'  => true,
                'fields'         => 'ids',
            ]);

            $total    = count($proposals);
            $approved = count($approved_proposals);

            if ($total === 0) continue;

            $pct = round(($approved / $total) * 100);

            if ($approved >= self::EDITOR_MIN_APPROVED && $pct >= self::EDITOR_MIN_PCT) {
                $candidates[(int) $u->ID] = [
                    'approved' => $approved,
                    'total'    => $total,
                    'pct'      => $pct,
                ];
            }
        }

        return $candidates;
    }

    /**
     * בודק אם תורם חצה את סף הקידום ושולח מייל למנהל.
     * קורא לזה אחרי כל אישור הצעה.
     */
    public static function maybe_notify_admin_about_candidate($user_id) {
        $proposals = get_posts([
            'post_type'      => 'achord_edit_proposal',
            'author'         => (int) $user_id,
            'post_status'    => ['publish', 'trash'],
            'posts_per_page' => -1,
            'no_found_rows'  => true,
            'fields'         => 'ids',
        ]);

        $approved_posts = get_posts([
            'post_type'      => 'achord_edit_proposal',
            'author'         => (int) $user_id,
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'no_found_rows'  => true,
            'fields'         => 'ids',
        ]);

        $total    = count($proposals);
        $approved = count($approved_posts);

        if ($total === 0) return;
        $pct = round(($approved / $total) * 100);

        // שלח מייל רק פעם אחת — כשחוצים בדיוק את הסף
        if ($approved !== self::EDITOR_MIN_APPROVED || $pct < self::EDITOR_MIN_PCT) return;

        // בדוק שעוד לא שלחנו מייל על משתמש זה
        $notified = get_user_meta($user_id, '_achord_editor_candidate_notified', true);
        if ($notified) return;

        update_user_meta($user_id, '_achord_editor_candidate_notified', '1');

        $user       = get_userdata($user_id);
        $admin_mail = get_option('admin_email');
        $promo_url  = admin_url('admin.php?page=achord-promotion-candidates');

        $subject = sprintf('unichord — %s מוכן להיות עורך', $user->display_name);
        $body    = "שלום,\n\n";
        $body   .= sprintf("המשתמש %s עומד בסף הקידום:\n", $user->display_name);
        $body   .= sprintf("• הצעות שאושרו: %d\n", $approved);
        $body   .= sprintf("• אחוז אישור: %d%%\n\n", $pct);
        $body   .= "לקידום לעורך:\n" . $promo_url . "\n\n— מערכת unichord";

        wp_mail($admin_mail, $subject, $body);
    }

    // ─────────────────────────────────────────────
    // AJAX: קידום ידני לעורך
    // ─────────────────────────────────────────────

    public function ajax_promote_to_editor() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('אין הרשאה.');
        }
        if (!check_ajax_referer('achord_promote_editor_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $target_id = isset($_POST['user_id']) ? intval($_POST['user_id']) : 0;
        if (!$target_id) {
            wp_send_json_error('משתמש לא נמצא.');
        }

        $current_role = self::get_role($target_id);
        if (!in_array($current_role, ['follower', 'contributor'], true)) {
            wp_send_json_error('המשתמש כבר עורך או מעלה.');
        }

        self::set_role($target_id, 'editor');

        // מייל למשתמש
        $this->notify_user_promoted_to_editor($target_id);

        $user = get_userdata($target_id);
        wp_send_json_success([
            'message' => sprintf('המשתמש %s קודם לעורך.', $user ? $user->display_name : $target_id),
        ]);
    }

    /**
     * שולח מייל למשתמש שקודם לעורך.
     */
    private function notify_user_promoted_to_editor($user_id) {
        $user = get_userdata($user_id);
        if (!$user || empty($user->user_email)) return;

        $review_url = get_permalink(get_page_by_path('review-proposals')) ?: admin_url();

        $subject = 'ברוך הבא כעורך ב-unichord!';
        $body    = "שלום {$user->display_name},\n\n";
        $body   .= "אנחנו שמחים לבשר שקודמת לתפקיד עורך ב-unichord!\n\n";
        $body   .= "מה זה אומר?\n";
        $body   .= "• תוכל לאשר ולדחות הצעות עריכה ממשתמשים אחרים\n";
        $body   .= "• תוכל לערוך שירים ישירות בספרייה\n";
        $body   .= "• באחריותך לשמור על איכות ודיוק התוכן\n\n";
        $body   .= "הנחיות עריכה:\n";
        $body   .= "• בדוק שהאקורדים מדויקים ותואמים את הביצוע המקורי\n";
        $body   .= "• אשר רק הצעות שעברו בדיקה מוקפדת\n";
        $body   .= "• בעת ספק — העדף לדחות ולבקש תיקון\n\n";
        $body   .= "לסקירת הצעות:\n{$review_url}\n\n";
        $body   .= "תודה על תרומתך!\n— צוות unichord";

        wp_mail($user->user_email, $subject, $body);
    }

    // ─────────────────────────────────────────────
    // עמוד אדמין: מועמדים לקידום
    // ─────────────────────────────────────────────

    public function register_admin_page() {
        add_submenu_page(
            'users.php',
            'מועמדים לקידום לעורך',
            'מועמדים לעורך',
            'manage_options',
            'achord-promotion-candidates',
            [$this, 'render_admin_page']
        );
    }

    public function render_admin_page() {
        $candidates = self::get_promotion_candidates();
        $nonce      = wp_create_nonce('achord_promote_editor_nonce');
        ?>
        <div class="wrap" dir="rtl">
            <h1>מועמדים לקידום לעורך</h1>
            <p class="description">
                תורמים שעמדו בסף: <?php echo self::EDITOR_MIN_APPROVED; ?>+ הצעות שאושרו ואחוז אישור <?php echo self::EDITOR_MIN_PCT; ?>%+.
            </p>

            <?php if (empty($candidates)): ?>
                <p>אין מועמדים לקידום כרגע.</p>
            <?php else: ?>
            <table class="wp-list-table widefat fixed striped" style="direction:rtl;">
                <thead>
                    <tr>
                        <th>משתמש</th>
                        <th>הצעות שאושרו</th>
                        <th>סה"כ הצעות</th>
                        <th>אחוז אישור</th>
                        <th>פעולה</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($candidates as $user_id => $stats):
                        $user = get_userdata($user_id);
                        if (!$user) continue;
                    ?>
                    <tr id="achord-candidate-row-<?php echo esc_attr($user_id); ?>">
                        <td>
                            <strong><?php echo esc_html($user->display_name); ?></strong><br>
                            <small><?php echo esc_html($user->user_email); ?></small>
                        </td>
                        <td><?php echo (int) $stats['approved']; ?></td>
                        <td><?php echo (int) $stats['total']; ?></td>
                        <td><?php echo (int) $stats['pct']; ?>%</td>
                        <td>
                            <button type="button"
                                    class="button button-primary achord-promote-btn"
                                    data-user-id="<?php echo esc_attr($user_id); ?>"
                                    data-nonce="<?php echo esc_attr($nonce); ?>">
                                קדם לעורך
                            </button>
                            <span class="achord-promote-status" id="achord-status-<?php echo esc_attr($user_id); ?>"></span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php endif; ?>
        </div>
        <script>
        document.querySelectorAll('.achord-promote-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var userId = this.dataset.userId;
                var nonce  = this.dataset.nonce;
                var statusEl = document.getElementById('achord-status-' + userId);
                btn.disabled = true;
                statusEl.textContent = 'מעדכן...';

                var fd = new FormData();
                fd.append('action',  'achord_promote_to_editor');
                fd.append('user_id', userId);
                fd.append('nonce',   nonce);

                fetch(ajaxurl, { method: 'POST', body: fd })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) {
                            statusEl.textContent = '✓ ' + data.data.message;
                            document.getElementById('achord-candidate-row-' + userId)
                                    .style.opacity = '0.5';
                        } else {
                            statusEl.textContent = '✕ ' + data.data;
                            btn.disabled = false;
                        }
                    })
                    .catch(function() {
                        statusEl.textContent = '✕ שגיאת רשת';
                        btn.disabled = false;
                    });
            });
        });
        </script>
        <?php
    }
}
