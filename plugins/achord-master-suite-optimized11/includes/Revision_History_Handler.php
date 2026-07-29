<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Revision_History_Handler
 *
 * היסטוריית גרסאות שירים — בנוי על WP Revisions הקיים.
 *
 * תכונות:
 *   - בחירת שיר ← רשימת גרסאות שמורות
 *   - הצגת diff של [version=normal] בין כל גרסה לגרסה הנוכחית
 *   - שחזור (rollback) לגרסה קודמת — עורך ומנהל בלבד
 *   - לוג פעולת שחזור ב-Activity Log
 *
 * דרישה: CPT achord_song_cpt תומך ב-'revisions' (כבר מוגדר ב-Setup_Handler.php).
 */
class AMS_Revision_History_Handler {

    public function __construct() {
        add_action('admin_menu', [$this, 'register_admin_page']);
        add_action('wp_ajax_achord_rollback_revision', [$this, 'ajax_rollback']);
    }

    // ─────────────────────────────────────────────
    // עמוד אדמין
    // ─────────────────────────────────────────────

    public function register_admin_page() {
        add_submenu_page(
            'edit.php?post_type=achord_song_cpt',
            'היסטוריית גרסאות',
            'היסטוריית גרסאות',
            'edit_others_posts',
            'achord-revision-history',
            [$this, 'render_admin_page']
        );
    }

    public function render_admin_page() {
        $can_rollback = current_user_can('edit_others_posts');
        $nonce        = wp_create_nonce('achord_rollback_nonce');

        $song_id = isset($_GET['song_id']) ? intval($_GET['song_id']) : 0;
        $song    = $song_id ? get_post($song_id) : null;
        if ($song && $song->post_type !== 'achord_song_cpt') {
            $song = null;
            $song_id = 0;
        }

        $base_url = admin_url('edit.php?post_type=achord_song_cpt&page=achord-revision-history');
        ?>
        <div class="wrap" dir="rtl">
            <h1>היסטוריית גרסאות שירים</h1>

            <style>
                .achord-rev-table th, .achord-rev-table td { padding: 8px 12px; vertical-align: top; }
                .achord-diff-wrap { display: none; margin-top: 8px; font-family: monospace; font-size: 12px;
                    border: 1px solid #ddd; border-radius: 3px; max-height: 400px; overflow-y: auto;
                    background: #fafafa; direction: ltr; text-align: left; }
                .achord-diff-wrap.open { display: block; }
                .diff-line { padding: 2px 6px; white-space: pre-wrap; word-break: break-all; }
                .diff-added   { background: #e6ffed; color: #22863a; }
                .diff-removed { background: #ffeef0; color: #cb2431; }
                .diff-context { color: #6a737d; }
                .achord-rollback-btn { margin-right: 6px; }
                .achord-rev-current { font-weight: 600; color: #2271b1; }
            </style>

            <!-- בחירת שיר -->
            <form method="get" style="margin-bottom:20px; display:flex; gap:8px; align-items:center;">
                <input type="hidden" name="post_type" value="achord_song_cpt">
                <input type="hidden" name="page" value="achord-revision-history">
                <select name="song_id" style="min-width:300px">
                    <option value="">— בחר שיר —</option>
                    <?php
                    $songs = get_posts([
                        'post_type'      => 'achord_song_cpt',
                        'post_status'    => 'publish',
                        'posts_per_page' => -1,
                        'orderby'        => 'title',
                        'order'          => 'ASC',
                        'no_found_rows'  => true,
                    ]);
                    foreach ($songs as $s):
                    ?>
                    <option value="<?php echo esc_attr($s->ID); ?>"
                        <?php selected($song_id, $s->ID); ?>>
                        <?php echo esc_html($s->post_title); ?>
                    </option>
                    <?php endforeach; ?>
                </select>
                <button type="submit" class="button button-primary">הצג גרסאות</button>
            </form>

            <?php if ($song): ?>

            <h2><?php echo esc_html($song->post_title); ?></h2>

            <?php
            $revisions = wp_get_post_revisions($song_id, ['order' => 'DESC']);
            if (empty($revisions)):
            ?>
                <p>אין גרסאות שמורות לשיר זה.</p>
            <?php else: ?>

            <p class="description">
                גרסה נוכחית + <?php echo count($revisions); ?> גרסאות קודמות.
                לחץ "הצג שינויים" להשוואה מול הגרסה הנוכחית.
                <?php if ($can_rollback): ?>
                לחץ "שחזר" להחלפת הגרסה הנוכחית.
                <?php endif; ?>
            </p>

            <table class="wp-list-table widefat fixed striped achord-rev-table">
                <thead>
                    <tr>
                        <th style="width:160px">תאריך ושעה</th>
                        <th style="width:150px">נערך ע"י</th>
                        <th style="width:110px">גרסה</th>
                        <th>פעולות</th>
                    </tr>
                </thead>
                <tbody>

                <!-- שורה: גרסה נוכחית -->
                <tr>
                    <td style="direction:ltr;text-align:right">
                        <?php echo esc_html(get_the_modified_date('d/m/Y H:i', $song_id)); ?>
                    </td>
                    <td><?php echo esc_html(get_the_author_meta('display_name', $song->post_author)); ?></td>
                    <td><span class="achord-rev-current">גרסה נוכחית</span></td>
                    <td>—</td>
                </tr>

                <?php
                $current_normal = self::extract_version_normal($song->post_content);
                $rev_number = count($revisions);
                foreach ($revisions as $rev):
                    $rev_author = get_userdata($rev->post_author);
                    $rev_date   = get_date_from_gmt(
                        gmdate('Y-m-d H:i:s', strtotime($rev->post_modified_gmt ?: $rev->post_date_gmt)),
                        'd/m/Y H:i'
                    );
                    $rev_normal = self::extract_version_normal($rev->post_content);
                    $diff_html  = self::render_diff($rev_normal, $current_normal);
                    $diff_id    = 'achord-diff-' . $rev->ID;
                ?>
                <tr>
                    <td style="direction:ltr;text-align:right"><?php echo esc_html($rev_date); ?></td>
                    <td><?php echo esc_html($rev_author ? $rev_author->display_name : '—'); ?></td>
                    <td>גרסה <?php echo $rev_number--; ?></td>
                    <td>
                        <button type="button" class="button button-small achord-diff-toggle"
                                data-target="<?php echo esc_attr($diff_id); ?>">
                            הצג שינויים
                        </button>

                        <?php if ($can_rollback): ?>
                        <button type="button"
                                class="button button-small achord-rollback-btn"
                                data-revision-id="<?php echo esc_attr($rev->ID); ?>"
                                data-song-id="<?php echo esc_attr($song_id); ?>"
                                data-nonce="<?php echo esc_attr($nonce); ?>"
                                data-song-title="<?php echo esc_attr($song->post_title); ?>">
                            שחזר
                        </button>
                        <?php endif; ?>

                        <div id="<?php echo esc_attr($diff_id); ?>" class="achord-diff-wrap">
                            <?php echo $diff_html; ?>
                        </div>
                    </td>
                </tr>
                <?php endforeach; ?>

                </tbody>
            </table>

            <?php endif; ?>
            <?php endif; ?>
        </div>

        <script>
        document.querySelectorAll('.achord-diff-toggle').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var target = document.getElementById(this.dataset.target);
                if (!target) return;
                var isOpen = target.classList.contains('open');
                target.classList.toggle('open', !isOpen);
                this.textContent = isOpen ? 'הצג שינויים' : 'הסתר שינויים';
            });
        });

        document.querySelectorAll('.achord-rollback-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var title = this.dataset.songTitle || 'שיר זה';
                if (!confirm('האם לשחזר את "' + title + '" לגרסה זו?\n\nהגרסה הנוכחית תישמר כגרסה קודמת.')) return;

                var me = this;
                me.disabled = true;
                me.textContent = 'משחזר...';

                var fd = new FormData();
                fd.append('action',      'achord_rollback_revision');
                fd.append('revision_id', this.dataset.revisionId);
                fd.append('song_id',     this.dataset.songId);
                fd.append('nonce',       this.dataset.nonce);

                fetch(ajaxurl, { method: 'POST', body: fd })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) {
                            alert('השחזור בוצע בהצלחה!');
                            location.reload();
                        } else {
                            alert('שגיאה: ' + (data.data || 'לא ידוע'));
                            me.disabled = false;
                            me.textContent = 'שחזר';
                        }
                    })
                    .catch(function() {
                        alert('שגיאת רשת');
                        me.disabled = false;
                        me.textContent = 'שחזר';
                    });
            });
        });
        </script>
        <?php
    }

    // ─────────────────────────────────────────────
    // AJAX: rollback
    // ─────────────────────────────────────────────

    public function ajax_rollback() {
        if (!current_user_can('edit_others_posts')) {
            wp_send_json_error('אין הרשאה.');
        }
        if (!check_ajax_referer('achord_rollback_nonce', 'nonce', false)) {
            wp_send_json_error('שגיאת אבטחה.');
        }

        $revision_id = isset($_POST['revision_id']) ? intval($_POST['revision_id']) : 0;
        $song_id     = isset($_POST['song_id'])     ? intval($_POST['song_id'])     : 0;

        $revision = $revision_id ? get_post($revision_id) : null;
        if (!$revision || !wp_is_post_revision($revision_id)) {
            wp_send_json_error('גרסה לא נמצאה.');
        }

        $song = $song_id ? get_post($song_id) : null;
        if (!$song || $song->post_type !== 'achord_song_cpt') {
            wp_send_json_error('שיר לא נמצא.');
        }

        // ודא שה-revision שייך לשיר
        if ((int) $revision->post_parent !== $song_id) {
            wp_send_json_error('הגרסה אינה שייכת לשיר זה.');
        }

        $result = wp_restore_post_revision($revision_id);
        if (!$result) {
            error_log('[achord] wp_restore_post_revision נכשל עבור revision ' . $revision_id . ' (song ' . $song_id . ')');
            wp_send_json_error('השחזור נכשל.');
        }

        // לוג ב-Activity Log
        do_action('achord_revision_restored', $song_id, $revision_id, get_current_user_id());

        wp_send_json_success(['message' => 'השחזור בוצע בהצלחה.']);
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    /**
     * מחלץ את תוכן [version=normal]...[/version] מתוך post_content.
     * אם לא נמצא — מחזיר את כל התוכן (fallback).
     */
    private static function extract_version_normal($content) {
        if (preg_match('/\[version=normal\](.*?)\[\/version\]/s', $content, $m)) {
            return trim($m[1]);
        }
        return trim(strip_tags($content));
    }

    /**
     * בונה HTML של diff שורה-שורה בין $old ל-$new (LCS-based).
     * מציג: שורות שהוסרו (אדום), שורות שנוספו (ירוק), ללא שינוי (אפור).
     */
    private static function render_diff($old, $new) {
        if ($old === $new) {
            return '<div class="diff-line diff-context">← אין שינויים בין הגרסאות</div>';
        }

        $a = explode("\n", $old);
        $b = explode("\n", $new);
        $n = count($a);
        $m = count($b);

        // בנה טבלת LCS (DP)
        $dp = array_fill(0, $n + 1, array_fill(0, $m + 1, 0));
        for ($i = 1; $i <= $n; $i++) {
            for ($j = 1; $j <= $m; $j++) {
                if ($a[$i - 1] === $b[$j - 1]) {
                    $dp[$i][$j] = $dp[$i - 1][$j - 1] + 1;
                } else {
                    $dp[$i][$j] = max($dp[$i - 1][$j], $dp[$i][$j - 1]);
                }
            }
        }

        // backtrack
        $diff = [];
        $i = $n;
        $j = $m;
        while ($i > 0 || $j > 0) {
            if ($i > 0 && $j > 0 && $a[$i - 1] === $b[$j - 1]) {
                array_unshift($diff, ['=', $a[$i - 1]]);
                $i--; $j--;
            } elseif ($j > 0 && ($i === 0 || $dp[$i][$j - 1] >= $dp[$i - 1][$j])) {
                array_unshift($diff, ['+', $b[$j - 1]]);
                $j--;
            } else {
                array_unshift($diff, ['-', $a[$i - 1]]);
                $i--;
            }
        }

        // רינדור — מציג הקשר של 2 שורות סביב כל שינוי
        $changed_indices = [];
        foreach ($diff as $idx => [$type]) {
            if ($type !== '=') $changed_indices[$idx] = true;
        }

        $context = 2;
        $visible = [];
        foreach ($changed_indices as $idx => $_) {
            for ($k = max(0, $idx - $context); $k <= min(count($diff) - 1, $idx + $context); $k++) {
                $visible[$k] = true;
            }
        }
        ksort($visible);

        $html     = '';
        $prev_idx = -2;
        foreach ($visible as $idx => $_) {
            if ($idx > $prev_idx + 1 && $prev_idx >= 0) {
                $html .= '<div class="diff-line diff-context" style="color:#aaa">···</div>';
            }
            [$type, $text] = $diff[$idx];
            $text = esc_html($text === '' ? ' ' : $text);
            if ($type === '+') {
                $html .= "<div class=\"diff-line diff-added\">+ <bdi dir=\"rtl\">{$text}</bdi></div>";
            } elseif ($type === '-') {
                $html .= "<div class=\"diff-line diff-removed\">- <bdi dir=\"rtl\">{$text}</bdi></div>";
            } else {
                $html .= "<div class=\"diff-line diff-context\">&nbsp; <bdi dir=\"rtl\">{$text}</bdi></div>";
            }
            $prev_idx = $idx;
        }

        return $html ?: '<div class="diff-line diff-context">← אין שינויים גלויים</div>';
    }
}
