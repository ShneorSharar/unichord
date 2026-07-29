<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Activity_Log_Handler
 *
 * יומן פעילות — מתעד את כל הפעולות המשמעותיות במערכת:
 *   - הגשת הצעת עריכה
 *   - אישור / דחיית הצעה
 *   - עריכה ישירה של שיר (על ידי עורך/מנהל)
 *   - הרשמת משתמש
 *   - שינוי תפקיד (קידום/שדרוג)
 *   - שחזור גרסה (rollback)
 *
 * טבלת DB: {prefix}achord_activity_log
 */
class AMS_Activity_Log_Handler {

    const TABLE_SUFFIX  = 'achord_activity_log';
    const VERSION_KEY   = 'achord_actlog_ver';
    const VERSION       = '1';

    // תוויות קריאות לפי action
    private static $labels = [
        'proposal_submitted' => 'הגשת הצעת עריכה',
        'proposal_approved'  => 'אישור הצעת עריכה',
        'proposal_rejected'  => 'דחיית הצעת עריכה',
        'song_edited_direct' => 'עריכה ישירה של שיר',
        'user_registered'    => 'הרשמת משתמש',
        'role_changed'       => 'שינוי תפקיד',
        'revision_restored'  => 'שחזור גרסה',
    ];

    // צבעים לפי action (badge)
    private static $colors = [
        'proposal_submitted' => '#2271b1',
        'proposal_approved'  => '#00a32a',
        'proposal_rejected'  => '#d63638',
        'song_edited_direct' => '#dba617',
        'user_registered'    => '#8c8f94',
        'role_changed'       => '#9b59b6',
        'revision_restored'  => '#e67e22',
    ];

    public function __construct() {
        add_action('init', [$this, 'maybe_create_table']);

        // הצעות — transition_post_status מופעל על שינוי סטטוס
        add_action('transition_post_status', [$this, 'on_proposal_transition'], 10, 3);

        // עריכה ישירה של שיר
        add_action('post_updated', [$this, 'on_song_edit'], 10, 3);

        // הרשמת משתמש
        add_action('user_register', [$this, 'on_user_register'], 20, 1);

        // שינוי תפקיד — do_action מ-User_Role_Handler::set_role()
        add_action('achord_role_changed', [$this, 'on_role_changed'], 10, 3);

        // שחזור גרסה — do_action מ-Revision_History_Handler
        add_action('achord_revision_restored', [$this, 'on_revision_restored'], 10, 3);

        // עמוד אדמין
        add_action('admin_menu', [$this, 'register_admin_page']);
    }

    // ─────────────────────────────────────────────
    // יצירת טבלה
    // ─────────────────────────────────────────────

    public function maybe_create_table() {
        if (get_option(self::VERSION_KEY) === self::VERSION) return;
        $this->create_table();
        update_option(self::VERSION_KEY, self::VERSION);
    }

    private function create_table() {
        global $wpdb;
        $table   = $wpdb->prefix . self::TABLE_SUFFIX;
        $charset = $wpdb->get_charset_collate();
        $sql     = "CREATE TABLE IF NOT EXISTS {$table} (
            id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
            action     VARCHAR(50)     NOT NULL,
            object_type VARCHAR(30)    NOT NULL DEFAULT '',
            object_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
            details    TEXT,
            created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY action     (action),
            KEY user_id    (user_id),
            KEY created_at (created_at)
        ) {$charset};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    // ─────────────────────────────────────────────
    // שיטת לוג סטטית — להפעלה מכל מקום
    // ─────────────────────────────────────────────

    /**
     * @param string $action      מזהה פעולה (ראה $labels)
     * @param string $object_type סוג אובייקט: song / proposal / user
     * @param int    $object_id   מזהה האובייקט
     * @param array  $details     פרטים נוספים (יאוחסנו כ-JSON)
     * @param int|null $user_id   מי ביצע (null = get_current_user_id)
     */
    public static function log($action, $object_type, $object_id, $details = [], $user_id = null) {
        global $wpdb;
        if ($user_id === null) $user_id = get_current_user_id();

        $wpdb->insert(
            $wpdb->prefix . self::TABLE_SUFFIX,
            [
                'user_id'     => (int) $user_id,
                'action'      => sanitize_key($action),
                'object_type' => sanitize_key($object_type),
                'object_id'   => (int) $object_id,
                'details'     => wp_json_encode($details, JSON_UNESCAPED_UNICODE),
                'created_at'  => current_time('mysql'),
            ],
            ['%d', '%s', '%s', '%d', '%s', '%s']
        );
    }

    // ─────────────────────────────────────────────
    // Hooks
    // ─────────────────────────────────────────────

    public function on_proposal_transition($new_status, $old_status, $post) {
        if ($post->post_type !== 'achord_edit_proposal') return;
        if ($old_status === $new_status) return;

        $song_title = $post->post_parent ? get_the_title($post->post_parent) : '';

        if ($old_status === 'new' && $new_status === 'pending') {
            self::log('proposal_submitted', 'proposal', $post->ID, [
                'song_id'    => (int) $post->post_parent,
                'song_title' => $song_title,
            ], (int) $post->post_author);

        } elseif ($old_status === 'pending' && $new_status === 'publish') {
            self::log('proposal_approved', 'proposal', $post->ID, [
                'song_id'      => (int) $post->post_parent,
                'song_title'   => $song_title,
                'proposer_id'  => (int) $post->post_author,
                'proposer'     => get_the_author_meta('display_name', $post->post_author),
            ]);

        } elseif ($old_status === 'pending' && $new_status === 'trash') {
            $reason = get_post_meta($post->ID, '_ams_reject_reason', true);
            self::log('proposal_rejected', 'proposal', $post->ID, [
                'song_id'     => (int) $post->post_parent,
                'song_title'  => $song_title,
                'proposer_id' => (int) $post->post_author,
                'proposer'    => get_the_author_meta('display_name', $post->post_author),
                'reason'      => (string) $reason,
            ]);
        }
    }

    public function on_song_edit($post_id, $post_after, $post_before) {
        if ($post_after->post_type !== 'achord_song_cpt') return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (wp_is_post_revision($post_id)) return;
        if ($post_after->post_content === $post_before->post_content) return;

        // דלג על אישור הצעה (נרשם כ-proposal_approved)
        if (defined('DOING_AJAX') && isset($_POST['action']) &&
            $_POST['action'] === 'achord_approve_proposal') return;

        self::log('song_edited_direct', 'song', $post_id, [
            'title' => get_the_title($post_id),
        ]);
    }

    public function on_user_register($user_id) {
        $user = get_userdata($user_id);
        self::log('user_registered', 'user', $user_id, [
            'name'  => $user ? $user->display_name : '',
            'email' => $user ? $user->user_email : '',
        ], (int) $user_id);
    }

    public function on_role_changed($user_id, $new_role, $old_role) {
        $user = get_userdata($user_id);
        self::log('role_changed', 'user', (int) $user_id, [
            'name'     => $user ? $user->display_name : '',
            'old_role' => (string) $old_role,
            'new_role' => (string) $new_role,
        ]);
    }

    public function on_revision_restored($song_id, $revision_id, $user_id) {
        self::log('revision_restored', 'song', (int) $song_id, [
            'title'       => get_the_title($song_id),
            'revision_id' => (int) $revision_id,
        ], (int) $user_id);
    }

    // ─────────────────────────────────────────────
    // עמוד אדמין
    // ─────────────────────────────────────────────

    public function register_admin_page() {
        add_submenu_page(
            'edit.php?post_type=achord_song_cpt',
            'יומן פעילות',
            'יומן פעילות',
            'edit_others_posts',
            'achord-activity-log',
            [$this, 'render_admin_page']
        );
    }

    public function render_admin_page() {
        global $wpdb;
        $table    = $wpdb->prefix . self::TABLE_SUFFIX;
        $per_page = 30;
        $paged    = max(1, intval($_GET['paged'] ?? 1));
        $offset   = ($paged - 1) * $per_page;

        $action_filter = isset($_GET['action_filter']) ? sanitize_key($_GET['action_filter']) : '';
        $where = '';
        $where_args = [];
        if ($action_filter && array_key_exists($action_filter, self::$labels)) {
            $where = 'WHERE action = %s';
            $where_args[] = $action_filter;
        }

        if ($where) {
            $total = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} {$where}", ...$where_args));
            $rows  = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$table} {$where} ORDER BY created_at DESC LIMIT %d OFFSET %d",
                ...array_merge($where_args, [$per_page, $offset])
            ));
        } else {
            $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
            $rows  = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT %d OFFSET %d",
                $per_page, $offset
            ));
        }

        $total_pages = max(1, (int) ceil($total / $per_page));
        $base_url    = admin_url('edit.php?post_type=achord_song_cpt&page=achord-activity-log');
        ?>
        <div class="wrap" dir="rtl">
            <h1>יומן פעילות</h1>

            <style>
                .achord-log-table th, .achord-log-table td { padding: 8px 12px; }
                .achord-log-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 3px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #fff;
                }
                .achord-log-details { font-size: 12px; color: #555; }
                .achord-log-filter { margin-bottom: 14px; display: flex; gap: 8px; align-items: center; }
            </style>

            <div class="achord-log-filter">
                <form method="get">
                    <input type="hidden" name="post_type" value="achord_song_cpt">
                    <input type="hidden" name="page" value="achord-activity-log">
                    <select name="action_filter">
                        <option value="">— כל הפעולות —</option>
                        <?php foreach (self::$labels as $key => $label): ?>
                            <option value="<?php echo esc_attr($key); ?>"
                                <?php selected($action_filter, $key); ?>>
                                <?php echo esc_html($label); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <button type="submit" class="button">סנן</button>
                    <?php if ($action_filter): ?>
                        <a href="<?php echo esc_url($base_url); ?>" class="button">נקה סינון</a>
                    <?php endif; ?>
                </form>
                <span style="margin-right: auto; color:#555;">סה"כ: <?php echo number_format($total); ?> רשומות</span>
            </div>

            <?php if (empty($rows)): ?>
                <p>אין רשומות ביומן.</p>
            <?php else: ?>
            <table class="wp-list-table widefat fixed striped achord-log-table">
                <thead>
                    <tr>
                        <th style="width:150px">תאריך ושעה</th>
                        <th style="width:140px">משתמש</th>
                        <th style="width:180px">פעולה</th>
                        <th>פרטים</th>
                    </tr>
                </thead>
                <tbody>
                <?php foreach ($rows as $row):
                    $details = json_decode($row->details, true) ?: [];
                    $label   = self::$labels[$row->action] ?? $row->action;
                    $color   = self::$colors[$row->action]  ?? '#8c8f94';
                    $user    = $row->user_id ? get_userdata($row->user_id) : null;
                    $user_display = $user ? esc_html($user->display_name) : ($row->user_id ? "#{$row->user_id}" : '[מערכת]');
                    $created = get_date_from_gmt(
                        gmdate('Y-m-d H:i:s', strtotime($row->created_at)),
                        'd/m/Y H:i'
                    );
                ?>
                <tr>
                    <td style="direction:ltr;text-align:right"><?php echo esc_html($created); ?></td>
                    <td><?php echo $user_display; ?></td>
                    <td>
                        <span class="achord-log-badge" style="background:<?php echo esc_attr($color); ?>">
                            <?php echo esc_html($label); ?>
                        </span>
                    </td>
                    <td class="achord-log-details">
                        <?php echo self::format_details($row->action, $details); ?>
                    </td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>

            <?php if ($total_pages > 1): ?>
            <div class="tablenav bottom" style="margin-top:8px">
                <div class="tablenav-pages">
                    <?php if ($paged > 1): ?>
                        <a class="button" href="<?php echo esc_url(add_query_arg(['paged' => $paged - 1, 'action_filter' => $action_filter], $base_url)); ?>">« הקודם</a>
                    <?php endif; ?>
                    <span style="margin: 0 8px">עמוד <?php echo $paged; ?> מתוך <?php echo $total_pages; ?></span>
                    <?php if ($paged < $total_pages): ?>
                        <a class="button" href="<?php echo esc_url(add_query_arg(['paged' => $paged + 1, 'action_filter' => $action_filter], $base_url)); ?>">הבא »</a>
                    <?php endif; ?>
                </div>
            </div>
            <?php endif; ?>

            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * פורמט פרטי הרשומה לתצוגה.
     */
    private static function format_details($action, $details) {
        $parts = [];

        switch ($action) {
            case 'proposal_submitted':
            case 'proposal_approved':
            case 'proposal_rejected':
                if (!empty($details['song_title'])) {
                    $link = !empty($details['song_id'])
                        ? '<a href="' . esc_url(get_permalink($details['song_id'])) . '" target="_blank">' . esc_html($details['song_title']) . '</a>'
                        : esc_html($details['song_title']);
                    $parts[] = 'שיר: ' . $link;
                }
                if (!empty($details['proposer'])) {
                    $parts[] = 'מגיש: ' . esc_html($details['proposer']);
                }
                if ($action === 'proposal_rejected' && !empty($details['reason'])) {
                    $parts[] = 'סיבה: ' . esc_html($details['reason']);
                }
                break;

            case 'song_edited_direct':
                if (!empty($details['title'])) {
                    $parts[] = 'שיר: ' . esc_html($details['title']);
                }
                break;

            case 'user_registered':
                if (!empty($details['name'])) $parts[] = esc_html($details['name']);
                if (!empty($details['email'])) $parts[] = esc_html($details['email']);
                break;

            case 'role_changed':
                if (!empty($details['name'])) $parts[] = esc_html($details['name']);
                $role_map = [
                    'guest' => 'אורח', 'follower' => 'עוקב',
                    'contributor' => 'תורם', 'editor' => 'עורך', 'admin' => 'מנהל',
                ];
                $old = $role_map[$details['old_role'] ?? ''] ?? ($details['old_role'] ?? '');
                $new = $role_map[$details['new_role'] ?? ''] ?? ($details['new_role'] ?? '');
                if ($old || $new) $parts[] = "{$old} → {$new}";
                break;

            case 'revision_restored':
                if (!empty($details['title'])) $parts[] = 'שיר: ' . esc_html($details['title']);
                if (!empty($details['revision_id'])) $parts[] = 'גרסה #' . (int) $details['revision_id'];
                break;
        }

        return $parts ? implode(' &nbsp;|&nbsp; ', $parts) : '—';
    }
}
