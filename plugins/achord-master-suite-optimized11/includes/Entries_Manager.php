<?php
// אבטחה: מניעת גישה ישירה לקובץ
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Entries_Manager
 *
 * מנהל מערכת Entries כמו בתוסף Achord Unified: ייבוא שירים בפורמט Labeled, יצירת CPT ייעודי,
 * שדות מטא, עמודי ניהול ורישום שורטקוד לטופס עריכה/מילוי של שיר.
 */
final class AMS_Entries_Manager {

    /* ====== CPT + מטא ====== */
    const CPT                = 'achord_entry';
    const META_LYRICS        = '_achord_entry_lyrics';
    const META_PDF_URL       = '_achord_entry_pdf_url';
    const META_RECO_CHORDS   = '_achord_entry_recommended_chords'; // JSON array
    const META_ASSIGNED_UID  = '_achord_entry_assigned_user';
    const META_TOKEN         = '_achord_entry_token';
    const META_STATUS        = '_achord_entry_status';               // open|done

    /**
     * Additional meta keys for extended entry data. These store
     * performer, lyrics author, music composer and capo position.  When
     * importing labeled songs or editing entries in the admin, these
     * values can be set and later used to prefill the multi‑step
     * uploader form.  Keeping them as constants avoids typos in
     * multiple locations.
     */
    const META_PERFORMER     = '_achord_entry_performer';
    const META_LYRICS_BY     = '_achord_entry_lyrics_by';
    const META_MUSIC_BY      = '_achord_entry_music_by';
    const META_CAPO          = '_achord_entry_capo';

    /* מטא לפוסט הסופי */
    const POSTMETA_PDF       = '_achord_pdf_url';

    /* רנדר נכסים */
    private static $should_load_assets = false;
    private static $prefill_data = null;

    public function __construct() {
        add_action('init',                                          [$this, 'register_cpt']);

        /* --- הטופס המקורי (שורטקוד) --- */
        add_shortcode('achord_standalone_uploader',                 [$this, 'render_form_shortcode']);
        add_action('wp_footer',                                     [$this, 'print_assets_in_footer']);
        add_action('init',                                          [$this, 'handle_form_submission']);

        /* --- Admin: Entries + Import --- */
        add_action('add_meta_boxes',                                [$this, 'add_entry_metaboxes']);
        add_action('save_post',                                     [$this, 'save_entry_meta'], 10, 2);
        add_filter('manage_' . self::CPT . '_posts_columns',        [$this, 'admin_cols']);
        add_action('manage_' . self::CPT . '_posts_custom_column',  [$this, 'admin_cols_render'], 10, 2);
        add_filter('post_row_actions',                              [$this, 'row_actions'], 10, 2);
        add_action('admin_menu',                                    [$this, 'admin_menu']);
        add_action('admin_menu',                                    [$this, 'add_bulk_file_menu']);
        add_action('admin_post_achord_labeled_preview_entries',     [$this, 'handle_labeled_preview_entries']);
        add_action('admin_post_achord_labeled_import_entries',      [$this, 'handle_labeled_import_entries']);
        
        // הוספת תפריט ייצוא
        add_action('admin_menu', [$this, 'add_export_menu']);
        // הוספת הפעולה שמטפלת בהורדת הקובץ (admin-post)
        add_action('admin_post_achord_export_songs', [$this, 'handle_export_songs']);
        add_action('admin_post_achord_delete_all_songs', [$this, 'handle_delete_all_songs']);
    }

    /* =========================================================
     * CPT Entries
     * =======================================================*/
    public function register_cpt() {
        register_post_type(self::CPT, [
            'label'        => 'Achord Entries',
            'labels'       => ['name'=>'Achord Entries','singular_name'=>'Achord Entry'],
            'public'       => false,
            'show_ui'      => false,
            'show_in_menu' => false,
            'rewrite'      => false,
            'supports'     => ['title'],
            'menu_icon'    => 'dashicons-forms',
        ]);
    }

    /* =========================================================
     * השורטקוד – הטופס המקורי שלך (עם הוספת שדה PDF בלבד)
     * =======================================================*/
    public function render_form_shortcode() {
        self::$should_load_assets = true;

        $entry_id = isset($_GET['entry']) ? (int) $_GET['entry'] : 0;
        $token    = isset($_GET['token']) ? sanitize_text_field($_GET['token']) : '';
        $prefill  = ['allow'=>true,'msg'=>'','title'=>'','lyrics'=>'','pdf'=>'','reco_json'=>'[]','entry_id'=>0,'token'=>''];

        if ($entry_id) {
            $entry = get_post($entry_id);
            if ($entry && $entry->post_type === self::CPT) {
                $assigned_uid = (int) get_post_meta($entry_id, self::META_ASSIGNED_UID, true);
                $entry_token  = get_post_meta($entry_id, self::META_TOKEN, true);
                $ok = current_user_can('manage_options');
                if (!$ok) {
                    if ($token && $entry_token && hash_equals($entry_token, $token)) $ok = true;
                    elseif ($assigned_uid && is_user_logged_in() && get_current_user_id() === $assigned_uid) $ok = true;
                }
                if (!$ok) {
                    $prefill['allow'] = false; $prefill['msg'] = 'אין הרשאה לטופס זה.';
                } elseif ((get_post_meta($entry_id, self::META_STATUS, true) ?: 'open') === 'done') {
                    $prefill['allow'] = false; $prefill['msg'] = 'הטופס כבר טופל ונשלח.';
                } else {
                    $prefill['title']     = $entry->post_title;
                    $prefill['lyrics']    = get_post_meta($entry_id, self::META_LYRICS, true);
                    $prefill['pdf']       = get_post_meta($entry_id, self::META_PDF_URL, true);
                    $prefill['reco_json'] = get_post_meta($entry_id, self::META_RECO_CHORDS, true) ?: '[]';
                    $prefill['entry_id']  = $entry_id;
                    $prefill['token']     = $entry_token;
                }
            }
        }
        self::$prefill_data = $prefill;

        $quick_chords = [ 'C','G','Am','F','Dm','E','Em','A','D','Bm','B','F#m','C7','G7','D7','A7','E7','B7','Bb','Eb','Ab','Db' ];

        ob_start();

        if (!$prefill['allow']) {
            echo '<div class="form-success-message" style="background:#fee2e2;border-color:#fecaca;color:#991b1b;">'.esc_html($prefill['msg']).'</div>';
        }
        if (isset($_GET['submission']) && $_GET['submission'] === 'success') {
            echo '<div class="form-success-message">הפוסט נשלח בהצלחה!</div>';
        }

        ?>
        <div id="achord-uploader-wrapper">

            <?php if (!empty($prefill['pdf'])) : ?>
            <div class="achord-sticky-pdf-viewer">
                <div class="pdf-viewer-header">
                    <strong class="pdf-viewer-title">תצוגת PDF</strong>
                    <button class="pdf-viewer-toggle" data-pdf-toggle-target="form-pdf-iframe" aria-expanded="true">הסתר PDF</button>
                </div>
                <iframe id="form-pdf-iframe" class="pdf-viewer-iframe" src="<?php echo esc_url($prefill['pdf']); ?>" title="PDF Viewer"></iframe>
            </div>
            <?php endif; ?>

            <form id="achord-standalone-form" method="post" action="">

                <div class="form-section">
                    <label for="achord-post-title">כותרת הפוסט</label>
                    <input type="text" id="achord-post-title" name="achord_post_title" required>
                </div>

                <div class="form-section">
                    <label for="achord-post-pdf">PDF (קישור מלא, אופציונלי)</label>
                    <input type="url" id="achord-post-pdf" name="achord_post_pdf" placeholder="https://example.com/file.pdf" inputmode="url">
                </div>

                <div class="form-section">
                    <div class="recommended-header">
                        <label>אקורדים מומלצים</label>
                        <div class="recommended-header-actions">
                            <button type="button" id="toggle-sticky-btn" class="recommended-action-btn" aria-pressed="false">הצמד לתחתית</button>
                            <button type="button" id="toggle-keyboard-btn" class="recommended-action-btn">הסתר מקלדת</button>
                            <button type="button" id="edit-recommended-btn" class="recommended-action-btn" aria-pressed="false">עריכת אקורדים</button>
                        </div>
                    </div>
                    <div id="recommended-chords-bar" class="recommended-chords-bar"></div>
                </div>

                <div class="form-section">
                    <label for="editor-normal">אקורדים ומילים</label>
                    <textarea name="achord_post_content" id="editor-normal" rows="15" placeholder="לדוגמה: [Am]מילים... [C]ועוד מילים..." required></textarea>

                    <div class="editor-toolbar" data-target="editor-normal">
                        <div class="toolbar-top-row">
                            <div class="chord-input-wrapper">
                                <input type="text" class="chord-input" placeholder="הוסף אקורד...">
                                <button type="button" class="add-chord-btn" title="הוסף (Enter)">+</button>
                            </div>
                            <button type="button" id="open-chord-library-btn" class="open-library-btn">פתח ספריית אקורדים</button>
                        </div>

                        <div class="quick-chords-wrapper">
                            <span class="toolbar-label">אקורדים מהירים:</span>
                            <?php foreach($quick_chords as $chord): ?>
                                <button type="button" class="quick-chord-btn" data-chord="<?php echo esc_attr($chord); ?>">
                                    <span class="chord-text"><?php echo esc_html($chord); ?></span>
                                    <span class="star-icon" title="הוסף/הסר מהמומלצים">★</span>
                                </button>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>

                <div class="form-actions">
                    <?php wp_nonce_field('achord_standalone_submit', 'achord_standalone_nonce'); ?>
                    <?php if ($prefill['entry_id']): ?>
                        <input type="hidden" name="achord_entry_id" value="<?php echo (int)$prefill['entry_id']; ?>">
                        <input type="hidden" name="achord_entry_token" value="<?php echo esc_attr($prefill['token']); ?>">
                    <?php endif; ?>
                    <button type="submit">שלח פוסט</button>
                </div>
            </form>

            <div id="achord-library-modal" class="achord-modal" style="display:none;">
                <div class="achord-modal-overlay"></div>
                <div class="achord-modal-content" role="dialog" aria-modal="true" aria-labelledby="achord-modal-title">
                    <div class="achord-modal-header">
                        <h3 id="achord-modal-title">ספריית אקורדים מלאה</h3>
                        <button type="button" class="achord-modal-close" aria-label="סגור">×</button>
                    </div>
                    <div class="achord-modal-body">
                        <input type="text" id="achord-library-search" class="chord-library-search" placeholder="חיפוש אקורד...">
                        <div id="achord-library-grid" class="achord-library-grid"></div>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /* =========================================================
     * שליחת הטופס – יצירת פוסט ושמירת PDF
     * =======================================================*/
    public function handle_form_submission() {
        if ('POST' !== ($_SERVER['REQUEST_METHOD'] ?? '')) return;
        if (!isset($_POST['achord_standalone_nonce'])) return;
        if (!wp_verify_nonce($_POST['achord_standalone_nonce'], 'achord_standalone_submit')) wp_die('Security check failed.');

        // אבטחה: הגבלת קצב למניעת הצפה (אנונימי 5/שעה, מחובר 20/שעה) — תואם למנגנון ב-Ajax_Handler.
        $rl_ip       = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : 'unknown';
        $rl_identity = is_user_logged_in() ? ('u' . get_current_user_id()) : ('ip' . $rl_ip);
        $rl_key      = 'ams_rl_standalone_submit_' . md5($rl_identity);
        $rl_limit    = is_user_logged_in() ? 20 : 5;
        $rl_count    = (int) get_transient($rl_key);
        if ($rl_count >= $rl_limit) wp_die('שלחת יותר מדי טפסים. נסה שוב בעוד שעה.');
        set_transient($rl_key, $rl_count + 1, HOUR_IN_SECONDS);

        $post_title   = sanitize_text_field($_POST['achord_post_title'] ?? '');
        $post_content = wp_kses_post($_POST['achord_post_content'] ?? '');
        $pdf_url      = esc_url_raw($_POST['achord_post_pdf'] ?? '');
        if (!$post_title || !$post_content) wp_die('Title and content are required.');

        // אבטחה: לא לייחס הגשות אנונימיות למשתמש המנהל (ID 1). אנונימי → ללא מחבר (0).
        $author_id = is_user_logged_in() ? get_current_user_id() : 0;
        $post_id = wp_insert_post([
            'post_title'   => $post_title,
            'post_content' => $post_content,
            'post_status'  => 'pending',
            'post_author'  => $author_id,
            'post_type'    => 'post',
        ], true);

        if (is_wp_error($post_id)) wp_die('Error creating post: ' . $post_id->get_error_message());
        if ($pdf_url) update_post_meta($post_id, self::POSTMETA_PDF, $pdf_url);

        $entry_id = isset($_POST['achord_entry_id']) ? (int) $_POST['achord_entry_id'] : 0;
        $token    = sanitize_text_field($_POST['achord_entry_token'] ?? '');
        if ($entry_id) {
            $ok = current_user_can('manage_options');
            $assigned_uid = (int) get_post_meta($entry_id, self::META_ASSIGNED_UID, true);
            $entry_token  = get_post_meta($entry_id, self::META_TOKEN, true);
            if (!$ok) {
                if ($token && $entry_token && hash_equals($entry_token, $token)) $ok = true;
                elseif ($assigned_uid && is_user_logged_in() && get_current_user_id() === $assigned_uid) $ok = true;
            }
            if ($ok) update_post_meta($entry_id, self::META_STATUS, 'done');
        }

        $redirect_url = add_query_arg('submission', 'success', remove_query_arg(['submission', 'entry', 'token']));
        wp_safe_redirect($redirect_url);
        exit;
    }

    /* =========================================================
     * Admin – Entries: מטא, עמודות, ושיתוף
     * =======================================================*/
    public function add_entry_metaboxes() {
        add_meta_box('achord_entry_meta', 'פרטי Entry', [$this, 'entry_meta_box'], self::CPT, 'normal', 'high');
    }
    public function entry_meta_box($post) {
        wp_nonce_field('achord_entry_save', 'achord_entry_nonce');

        $lyrics      = get_post_meta($post->ID, self::META_LYRICS, true);
        $pdf         = get_post_meta($post->ID, self::META_PDF_URL, true);
        $reco        = get_post_meta($post->ID, self::META_RECO_CHORDS, true);
        $reco        = $reco ? json_decode($reco, true) : [];
        $uid         = (int) get_post_meta($post->ID, self::META_ASSIGNED_UID, true);
        $token       = get_post_meta($post->ID, self::META_TOKEN, true);
        // Additional fields
        $performer   = get_post_meta($post->ID, self::META_PERFORMER, true);
        $lyrics_by   = get_post_meta($post->ID, self::META_LYRICS_BY, true);
        $music_by    = get_post_meta($post->ID, self::META_MUSIC_BY, true);
        $capo        = get_post_meta($post->ID, self::META_CAPO, true);
        if (!$token) $token = $this->gen_token();

        echo '<p><label>PDF URL: <input type="url" name="achord_entry_pdf" value="' . esc_attr($pdf) . '" style="width:100%"></label></p>';
        echo '<p><label>אקורדים מומלצים (רווח/פסיק):<br><input type="text" name="achord_entry_reco" value="' . esc_attr(implode(', ', $reco ?: [])) . '" style="width:100%"></label></p>';
        echo '<p><label>מילים (ייכנסו לטופס):<br><textarea name="achord_entry_lyrics" rows="8" style="width:100%">' . esc_textarea($lyrics) . '</textarea></label></p>';

        // Additional fields: performer, lyrics_by, music_by, capo
        echo '<p><label>מבצע/ת:<br><input type="text" name="achord_entry_performer" value="' . esc_attr($performer) . '" style="width:100%"></label></p>';
        echo '<p><label>מילים ע"י:<br><input type="text" name="achord_entry_lyrics_by" value="' . esc_attr($lyrics_by) . '" style="width:100%"></label></p>';
        echo '<p><label>לחן ע"י:<br><input type="text" name="achord_entry_music_by" value="' . esc_attr($music_by) . '" style="width:100%"></label></p>';
        echo '<p><label>קאפו (מספר):<br><input type="number" name="achord_entry_capo" value="' . esc_attr($capo) . '" style="width:100%" min="0"></label></p>';
        echo '<p><label>הוקצה למשתמש: ';
        wp_dropdown_users(['name'=>'achord_entry_assigned_user','selected'=>$uid,'show_option_none'=>'— ללא —']);
        echo '</label></p>';

        echo '<p><label>Token לשיתוף:<br><input type="text" readonly value="' . esc_attr($token) . '" style="width:320px"> ';
        echo '<a class="button" href="' . esc_url($this->get_submit_link($post->ID, $token)) . '" target="_blank">פתח טופס</a></label></p>';
        echo '<input type="hidden" name="achord_entry_token" value="' . esc_attr($token) . '">';
    }
    public function save_entry_meta($post_id, $post) {
        if ($post->post_type !== self::CPT) return;
        if (!isset($_POST['achord_entry_nonce']) || !wp_verify_nonce($_POST['achord_entry_nonce'], 'achord_entry_save')) return;
        if (!current_user_can('edit_post', $post_id)) return;

        $lyrics    = wp_kses_post($_POST['achord_entry_lyrics'] ?? '');
        $pdf       = esc_url_raw($_POST['achord_entry_pdf'] ?? '');
        $reco      = $this->normalize_chords($_POST['achord_entry_reco'] ?? '');
        $uid       = (int) ($_POST['achord_entry_assigned_user'] ?? 0);
        $token     = sanitize_text_field($_POST['achord_entry_token'] ?? $this->gen_token());

        // Additional fields
        $performer = sanitize_text_field($_POST['achord_entry_performer'] ?? '');
        $lyrics_by = sanitize_text_field($_POST['achord_entry_lyrics_by'] ?? '');
        $music_by  = sanitize_text_field($_POST['achord_entry_music_by'] ?? '');
        $capo      = isset($_POST['achord_entry_capo']) && $_POST['achord_entry_capo'] !== '' ? (int)$_POST['achord_entry_capo'] : '';

        update_post_meta($post_id, self::META_LYRICS, $lyrics);
        update_post_meta($post_id, self::META_PDF_URL, $pdf);
        update_post_meta($post_id, self::META_RECO_CHORDS, wp_json_encode($reco));
        update_post_meta($post_id, self::META_ASSIGNED_UID, $uid);
        update_post_meta($post_id, self::META_TOKEN, $token);
        if (!get_post_meta($post_id, self::META_STATUS, true)) update_post_meta($post_id, self::META_STATUS, 'open');

        // Save additional meta only if provided
        if ($performer !== '') update_post_meta($post_id, self::META_PERFORMER, $performer);
        if ($lyrics_by !== '') update_post_meta($post_id, self::META_LYRICS_BY, $lyrics_by);
        if ($music_by !== '') update_post_meta($post_id, self::META_MUSIC_BY, $music_by);
        if ($capo !== '') update_post_meta($post_id, self::META_CAPO, $capo);
    }
    private function normalize_chords($line) {
        $line = (string)$line;
        $line = str_replace(['♯','♭'], ['#','b'], $line);
        $line = preg_replace('/[,\s]+/u', ' ', trim($line));
        $parts = array_filter(array_map('trim', explode(' ', $line)));
        $seen=[]; $out=[];
        foreach ($parts as $p) if (!isset($seen[$p])) { $seen[$p]=1; $out[]=$p; }
        return $out;
    }

    public function admin_cols($cols) { $cols['assigned']='הוקצה ל'; $cols['status']='סטטוס'; $cols['share']='קישור טופס'; return $cols; }
    public function admin_cols_render($col, $post_id) {
        if ($col==='assigned') {
            $uid=(int)get_post_meta($post_id,self::META_ASSIGNED_UID,true); echo $uid?esc_html(get_the_author_meta('display_name',$uid)):'—';
        } elseif ($col==='status') {
            $st=get_post_meta($post_id,self::META_STATUS,true)?:'open'; echo $st==='done'?'טופל':'פתוח';
        } elseif ($col==='share') {
            $token=get_post_meta($post_id,self::META_TOKEN,true); $link=$this->get_submit_link($post_id,$token);
            echo '<input type="text" readonly value="'.esc_attr($link).'" style="width:100%">';
        }
    }
    public function row_actions($actions, $post) {
        if ($post->post_type!==self::CPT) return $actions;
        $token=get_post_meta($post->ID,self::META_TOKEN,true);
        $actions['achord_copy']='<a href="'.$this->get_submit_link($post->ID,$token).'" target="_blank">פתח טופס</a>';
        return $actions;
    }

    private function get_submit_link($entry_id, $token = '') {
        $form_page_url = home_url('/achord-uploader/');
        $args = ['entry' => $entry_id];
        if ($token) {
            $args['token'] = $token;
        }
        return add_query_arg($args, $form_page_url);
    }
    private function gen_token() { return bin2hex(random_bytes(8)); }

    /* =========================================================
     * Admin – מסך ייבוא Labeled
     * =======================================================*/
    public function admin_menu() {
        add_submenu_page('edit.php?post_type='.self::CPT, 'ייבוא שירים (Labeled)', 'ייבוא (Labeled)', 'manage_options', 'achord_entries_import', [$this, 'admin_import_page']);
    }
    public function admin_import_page() {
        if (!current_user_can('manage_options')) return;
        $nonce = wp_create_nonce('achord_labeled_entries');
        echo '<div class="wrap"><h1>ייבוא ל־Achord Entries (פורמט Labeled)</h1>';
        echo '<p>דוגמה לבלוק:</p><pre style="background:#f7fafc;padding:12px;border:1px solid #e2e8f0;white-space:pre-wrap;">';
        echo esc_html("=== SONG ===\nכותרת: שלום עליכם\nPDF: https://example.com/shalom.pdf\nמילים:\n[Am]שלום עליכם...\n---END---\nאקורדים מומלצים: Am, C, G, F\n=== END ===");
        echo '</pre>';
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="achord_labeled_preview_entries"><input type="hidden" name="_wpnonce" value="'.esc_attr($nonce).'"><textarea name="achord_labeled_input" rows="12" style="width:100%"></textarea><p><button class="button button-secondary">תצוגה מקדימה</button></p></form>';
        if (isset($_GET['achord_preview']) && $_GET['achord_preview']==='1') {
            $preview = get_transient('achord_labeled_entries_preview');
            if ($preview && is_array($preview)) {
                echo '<h2>תצוגה מקדימה</h2><table class="widefat"><thead><tr><th>#</th><th>כותרת</th><th>PDF</th><th>אקורדים מומלצים</th><th>מילים</th></tr></thead><tbody>';
                foreach ($preview as $i=>$song) {
                    $snip = mb_substr($song['lyrics']??'',0,80);
                    echo '<tr><td>'.(int)($i+1).'</td><td>'.esc_html($song['title']??'').'</td><td>'.esc_html($song['pdf']??'').'</td><td>'.esc_html(implode(', ', $song['reco']??[])).'</td><td><code style="white-space:pre-wrap;">'.esc_html($snip).(mb_strlen($song['lyrics']??'')>80?'…':'').'</code></td></tr>';
                }
                echo '</tbody></table>';
                echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'" style="margin-top:16px;"><input type="hidden" name="action" value="achord_labeled_import_entries"><input type="hidden" name="_wpnonce" value="'.esc_attr($nonce).'"><p><button class="button button-primary">ייבא ל־Entries</button></p></form>';
            }
        }
        if (isset($_GET['achord_imported']) && $_GET['achord_imported']==='1') {
            $report = get_transient('achord_labeled_entries_report');
            if ($report) echo '<h2>דוח ייבוא</h2><pre style="background:#f7fafc;padding:12px;border:1px solid #e2e8f0;white-space:pre-wrap;">'.esc_html($report).'</pre>';
        }
        echo '</div>';
    }
    public function handle_labeled_preview_entries() {
        if (!current_user_can('manage_options')) wp_die('Not allowed');
        check_admin_referer('achord_labeled_entries');
        $raw   = wp_unslash($_POST['achord_labeled_input'] ?? '');
        $songs = $this->parse_labeled_input($raw);
        set_transient('achord_labeled_entries_preview', $songs, 10*MINUTE_IN_SECONDS);
        wp_safe_redirect(add_query_arg(['post_type'=>self::CPT,'page'=>'achord_entries_import','achord_preview'=>'1'], admin_url('edit.php')));
        exit;
    }
    public function handle_labeled_import_entries() {
        if (!current_user_can('manage_options')) wp_die('Not allowed');
        check_admin_referer('achord_labeled_entries');
        $preview = get_transient('achord_labeled_entries_preview');
        if (!$preview || !is_array($preview) || empty($preview)) {
            wp_safe_redirect(add_query_arg(['post_type'=>self::CPT,'page'=>'achord_entries_import'], admin_url('edit.php')));
            exit;
        }
        $report=[];
        foreach ($preview as $i=>$song) {
            $title  = sanitize_text_field($song['title'] ?? '');
            $lyrics = $song['lyrics'] ?? '';
            $pdf    = esc_url_raw($song['pdf'] ?? '');
            $reco   = array_map('sanitize_text_field', $song['reco'] ?? []);
            $performer = sanitize_text_field($song['performer'] ?? '');
            $lyrics_by = sanitize_text_field($song['lyrics_by'] ?? '');
            $music_by  = sanitize_text_field($song['music_by'] ?? '');
            $capo      = $song['capo'] ?? '';
            if (!$title || !$lyrics) { $report[]="#".($i+1).": דילוג (חסר כותרת/מילים)"; continue; }
            $entry_id = wp_insert_post(['post_type'=>self::CPT,'post_status'=>'publish','post_title'=>$title], true);
            if (is_wp_error($entry_id)) { $report[]="#".($i+1).": שגיאה – ".$entry_id->get_error_message(); continue; }
            update_post_meta($entry_id, self::META_LYRICS, $lyrics);
            if ($pdf) update_post_meta($entry_id, self::META_PDF_URL, $pdf);
            if (!empty($reco)) update_post_meta($entry_id, self::META_RECO_CHORDS, wp_json_encode($reco));
            update_post_meta($entry_id, self::META_STATUS, 'open');
            update_post_meta($entry_id, self::META_TOKEN, $this->gen_token());
            // Save additional fields if provided
            if ($performer !== '') update_post_meta($entry_id, self::META_PERFORMER, $performer);
            if ($lyrics_by !== '') update_post_meta($entry_id, self::META_LYRICS_BY, $lyrics_by);
            if ($music_by !== '') update_post_meta($entry_id, self::META_MUSIC_BY, $music_by);
            if ($capo !== '' && is_numeric($capo)) update_post_meta($entry_id, self::META_CAPO, (int)$capo);
            $report[] = "#".($i+1).": נוצר Entry (ID $entry_id)";
        }
        set_transient('achord_labeled_entries_report', implode("\n",$report), 30*MINUTE_IN_SECONDS);
        wp_safe_redirect(add_query_arg(['post_type'=>self::CPT,'page'=>'achord_entries_import','achord_imported'=>'1'], admin_url('edit.php')));
        exit;
    }
    private function parse_labeled_input($raw) {
        $blocks = preg_split('/^\s*===\s*SONG\s*===\s*$/mi', (string)$raw);
        $songs=[];
        foreach ($blocks as $blk) {
            $blk = trim($blk);
            if ($blk === '' || !preg_match('/^\s*(.*?)^\s*===\s*END\s*===\s*$/ms', $blk, $m)) continue;
            $body = trim($m[1]);
            $title     = $this->match_line_value($body, 'כותרת');
            $pdf       = $this->match_line_value($body, 'PDF');
            $lyrics    = '';
            // מילים (Lyrics content) are between "מילים:" and "---END---"
            if (preg_match('/^\s*מילים:\s*\R(.*?)^\s*---END---\s*$/ms', $body, $m2)) $lyrics = trim($m2[1]);
            $reco_line = $this->match_line_value($body, 'אקורדים מומלצים');
            $reco      = $this->normalize_chords($reco_line);
            // Additional optional fields: performer, lyrics_by, music_by, capo
            $performer = $this->match_line_value($body, 'מבצע');
            // Try multiple possible labels for lyrics author
            $lyrics_by = $this->match_line_value($body, 'מילים עי');
            if ($lyrics_by === '') $lyrics_by = $this->match_line_value($body, 'מילים על ידי');
            if ($lyrics_by === '') $lyrics_by = $this->match_line_value($body, 'מילים מאת');
            // Music composer
            $music_by  = $this->match_line_value($body, 'לחן');
            // Capo position (numeric)
            $capo      = $this->match_line_value($body, 'קאפו');
            // Clean capo to numeric if set
            $capo = is_numeric($capo) ? (int)$capo : '';
            if ($title || $lyrics || $pdf || !empty($reco) || $performer || $lyrics_by || $music_by || $capo !== '') {
                $songs[] = [
                    'title'     => $title,
                    'pdf'       => $pdf,
                    'lyrics'    => $lyrics,
                    'reco'      => $reco,
                    'performer' => $performer,
                    'lyrics_by' => $lyrics_by,
                    'music_by'  => $music_by,
                    'capo'      => $capo,
                ];
            }
        }
        return $songs;
    }
    private function match_line_value($text, $label_he) {
        $p = '/^\s*' . preg_quote($label_he,'/') . '\s*:\s*(.*?)\s*$/mi';
        if (preg_match($p, $text, $m)) return trim($m[1]);
        return '';
    }

    /* =========================================================
     * נכסים (CSS/JS)
     * =======================================================*/
    public function print_assets_in_footer() {
        if (!self::$should_load_assets) return;

        echo "<style>" . $this->get_form_css() . "</style>";

        $full_chord_library = $this->get_full_chord_library();
        echo "<script>window.ACHORD_UPLOADER_DATA = { fullChordLibrary: " . wp_json_encode($full_chord_library) . " };</script>";
        echo "<script>" . $this->get_form_js() . "</script>";

        $PF = self::$prefill_data ?: ['allow'=>true,'title'=>'','lyrics'=>'','pdf'=>'','reco_json'=>'[]','entry_id'=>0,'token'=>''];
        echo "<script>window.ACHORD_PREFILL=" . wp_json_encode($PF) . ";</script>";
        echo "<script>" . $this->get_prefill_js() . "</script>";
    }

    private function get_full_chord_library() {
        $qualities = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim', 'aug', '6', 'm6', '9', 'm9', 'add9', 'dim7', 'm7b5'];
        $library = [];
        $order = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        foreach ($order as $root) {
            $chords_in_root = [];
            foreach ($qualities as $quality) $chords_in_root[] = $root . $quality;
            $library[$root] = $chords_in_root;
        }
        return $library;
    }

    private function get_form_css() {
        return <<<'CSS'
:root { --keyboard-inset-bottom: 0px; --sticky-bar-height: 0px; }
/* ...The CSS definition from Achord Unified omitted for brevity... */
CSS;
    }

    private function get_form_js() {
        return <<<'JS'
(function(){
    /* ...Script omitted in this context... */
})();
JS;
    }

    private function get_prefill_js() {
        return <<<'JS'
(function(){
    var PF = window.ACHORD_PREFILL || null;
    if (!PF || PF.allow===false) return;
    function fill(){
        var t=document.getElementById('achord-post-title');
        var p=document.getElementById('achord-post-pdf');
        var l=document.getElementById('editor-normal');
        if (PF.title && t && !t.value) t.value = PF.title;
        if (PF.pdf   && p && !p.value) p.value = PF.pdf;
        if (PF.lyrics&& l && !l.value) l.value = PF.lyrics;
        try{
            var list = JSON.parse(PF.reco_json||'[]');
            if (Array.isArray(list) && list.length){
                localStorage.setItem('achord_recommended_chords_v1', JSON.stringify(list));
                document.dispatchEvent(new CustomEvent('achordRecommendedReady', { detail: { chords: list } }));
            }
        }catch(e){}
    }
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', fill);
    else fill();
})();
JS;
    }

    // --- ייבוא המוני מקובץ (חלק 3 - הותאם ל-Single Page) ---

    public function add_bulk_file_menu() {
        add_submenu_page(
            'edit.php?post_type=achord_song_cpt', 
            'ייבוא מקובץ (Bulk)', 
            'ייבוא מקובץ', 
            'manage_options', 
            'achord_bulk_file_import', 
            [$this, 'render_bulk_file_page']
        );
    }

    public function render_bulk_file_page() {
        if (!current_user_can('manage_options')) return;
        
        // בדיקת שליחת טופס
        if (isset($_FILES['achord_import_file']) && check_admin_referer('achord_file_import_nonce')) {
            $this->process_uploaded_file($_FILES['achord_import_file']);
        }

        echo '<div class="wrap"><h1>ייבוא שירים מקובץ (Bulk Import)</h1>';
        echo '<div class="notice notice-info"><p>העלה קובץ <code>.txt</code> המכיל את השירים ברצף (מופרדים ע"י השורטקודים). המערכת תזהה אוטומטית וידאו ותווים ותציג אותם בטאבים.</p></div>';
        
        // טופס העלאה (חובה enctype)
        echo '<form method="post" action="" enctype="multipart/form-data">';
        wp_nonce_field('achord_file_import_nonce');
        
        echo '<table class="form-table"><tbody>';
        echo '<tr><th scope="row"><label for="achord_import_file">בחר קובץ שירים (.txt)</label></th>';
        echo '<td><input type="file" name="achord_import_file" id="achord_import_file" accept=".txt" required>';
        echo '<p class="description">המערכת תומכת בקבצים גדולים. כל שורטקוד ייפרס לפוסט נפרד.</p></td></tr>';
        echo '</tbody></table>';
        
        echo '<p class="submit"><button type="submit" class="button button-primary button-hero">העלה וייבא שירים</button></p>';
        echo '</form></div>';
    }

    private function process_uploaded_file($file) {
        if ($file['error'] !== UPLOAD_ERR_OK || empty($file['tmp_name'])) {
            echo '<div class="notice notice-error"><p>שגיאה בהעלאת הקובץ.</p></div>';
            return;
        }

        // אבטחה: לאמת סיומת .txt (לא לסמוך על MIME מהלקוח) ולחסום קבצים גדולים לפני קריאה לזיכרון.
        $ext = strtolower(pathinfo($file['name'] ?? '', PATHINFO_EXTENSION));
        if ($ext !== 'txt') {
            echo '<div class="notice notice-error"><p>יש להעלות קובץ טקסט (.txt) בלבד.</p></div>';
            return;
        }
        if (!empty($file['size']) && $file['size'] > 5 * 1024 * 1024) { // תקרת 5MB
            echo '<div class="notice notice-error"><p>הקובץ גדול מדי (מקסימום 5MB).</p></div>';
            return;
        }

        $content = file_get_contents($file['tmp_name']);
        if (!$content) return;

        $raw_songs = explode('[/achord_song]', $content);
        $count_success = 0;
        $count_error = 0;

        foreach ($raw_songs as $chunk) {
            $chunk = trim($chunk);
            if (empty($chunk)) continue;

            $full_shortcode = $chunk . '[/achord_song]';

            preg_match('/\[song_title\](.*?)\[\/song_title\]/s', $full_shortcode, $title_m);
            preg_match('/\[performer\](.*?)\[\/performer\]/s', $full_shortcode, $performer_m);

            $title = isset($title_m[1]) ? trim($title_m[1]) : '';
            $performer = isset($performer_m[1]) ? trim($performer_m[1]) : '';

            if (!$title) continue;

            // חילוץ נתונים חכמים
            $video_guitar = '';
            $video_piano = '';
            $abc_code = '';

            // חילוץ גיטרה (תומך גם בתגית מפורשת וגם ב-Legacy)
            if (preg_match('/\[lesson_guitar\](.*?)\[\/lesson_guitar\]/s', $full_shortcode, $g_m)) {
                $video_guitar = trim($g_m[1]);
            } elseif (preg_match('/\[lesson_url\](.*?)\[\/lesson_url\]/s', $full_shortcode, $l_m)) {
                $video_guitar = trim($l_m[1]);
            }

            // חילוץ פסנתר
            if (preg_match('/\[lesson_piano\](.*?)\[\/lesson_piano\]/s', $full_shortcode, $p_m)) {
                $video_piano = trim($p_m[1]);
            }

            // חילוץ תווים
            if (preg_match('/\[abc_code\](.*?)\[\/abc_code\]/s', $full_shortcode, $abc_m)) {
                $abc_code = trim($abc_m[1]);
            } elseif (preg_match('/X:1.*?(\r\n|\r|\n){2,}/s', $full_shortcode, $abc_raw_m)) {
                 $abc_code = trim($abc_raw_m[0]);
            }

            // Extended song meta (from export-extended tags)
            $extract_meta = function($tag) use ($full_shortcode) {
                if (preg_match('/\[' . $tag . '\](.*?)\[\/' . $tag . '\]/s', $full_shortcode, $m)) {
                    return trim($m[1]);
                }
                return '';
            };
            $song_idx     = $extract_meta('song_idx');
            $song_page    = $extract_meta('song_page');
            $song_era     = $extract_meta('song_era');
            $song_mood    = $extract_meta('song_mood');
            $song_themes  = $extract_meta('song_themes');
            $song_fame    = $extract_meta('song_fame');
            $song_recs    = $extract_meta('recommendations');

            $post_title = $title . ($performer ? ' – ' . $performer : '');
            
            $post_id = wp_insert_post([
                'post_type'    => 'achord_song_cpt',
                'post_title'   => $post_title,
                'post_content' => $full_shortcode,
                'post_status'  => 'draft',
                'post_author'  => get_current_user_id(),
            ]);

            if ($post_id && !is_wp_error($post_id)) {
                $count_success++;
                if ($performer) wp_set_object_terms($post_id, $performer, 'singer', true);
                if ($video_guitar) update_post_meta($post_id, 'lesson_video_guitar', $video_guitar);
                if ($video_piano) update_post_meta($post_id, 'lesson_video_piano', $video_piano);
                if ($abc_code) update_post_meta($post_id, '_ams_abc_code', $abc_code);

                // Extended song meta — persisted as-is.
                if ($song_idx !== '')  update_post_meta($post_id, '_song_idx', (int)$song_idx);
                if ($song_page !== '') update_post_meta($post_id, '_song_page_in_book', (int)$song_page);
                if ($song_era !== '')  update_post_meta($post_id, '_song_era', $song_era);
                if ($song_mood !== '') update_post_meta($post_id, '_song_mood', $song_mood);
                if ($song_fame !== '') update_post_meta($post_id, '_song_fame', (int)$song_fame);
                if ($song_themes !== '') {
                    $themes_arr = array_values(array_filter(array_map('trim', explode(',', $song_themes))));
                    if ($themes_arr) update_post_meta($post_id, '_song_themes', wp_json_encode($themes_arr, JSON_UNESCAPED_UNICODE));
                }
                // Recommendations come in as idx list — store as source; the
                // post-id list is rebuilt in a separate pass once all posts
                // exist (so we know every idx → post_id mapping).
                if ($song_recs !== '') {
                    $rec_idx_arr = array_values(array_filter(array_map('intval', explode(',', $song_recs))));
                    if ($rec_idx_arr) update_post_meta($post_id, '_ams_recommended_source_idx', $rec_idx_arr);
                }

                // חילוץ barre_status
                $barre_status = '';
                if ( preg_match( '/\[barre_status\](.*?)\[\/barre_status\]/s', $full_shortcode, $bs_m ) ) {
                    $barre_status = sanitize_key( trim( $bs_m[1] ) );
                }
                $valid_statuses = [ 'barre_free', 'one_f', 'one_bm', 'few_semi', 'has_barre', 'medium_only', 'none' ];
                if ( $barre_status && in_array( $barre_status, $valid_statuses, true ) ) {
                    update_post_meta( $post_id, '_ams_barre_status', $barre_status );
                }
            } else {
                $count_error++;
            }
        }

        // Second pass: resolve recommendations (idx → post_id) now that all
        // posts exist. Builds a fresh idx-to-pid map from _song_idx.
        $linked = $this->resolve_recommendation_idx_to_ids();

        echo '<div class="notice notice-success is-dismissible"><p>הייבוא הושלם! <strong>' . $count_success . '</strong> שירים הועלו';
        if ($linked > 0) echo " (כולל {$linked} קישורי הצעות)";
        echo '.</p></div>';
    }

    /**
     * Walk every song that has `_ams_recommended_source_idx` and resolve the
     * idx list to a list of WP post IDs by looking up each idx in `_song_idx`.
     * Idempotent — safe to run after every import. Returns the number of edges
     * linked.
     */
    private function resolve_recommendation_idx_to_ids() {
        global $wpdb;
        $rows = $wpdb->get_results(
            "SELECT post_id, meta_value FROM {$wpdb->postmeta}
             WHERE meta_key = '_song_idx'", ARRAY_A);
        if (!$rows) return 0;
        $idx_to_pid = [];
        foreach ($rows as $r) { $idx_to_pid[(int)$r['meta_value']] = (int)$r['post_id']; }

        $with_recs = $wpdb->get_results(
            "SELECT post_id, meta_value FROM {$wpdb->postmeta}
             WHERE meta_key = '_ams_recommended_source_idx'", ARRAY_A);
        if (!$with_recs) return 0;

        $total_edges = 0;
        foreach ($with_recs as $r) {
            $pid = (int)$r['post_id'];
            $rec_idx_arr = maybe_unserialize($r['meta_value']);
            if (!is_array($rec_idx_arr)) continue;
            $pids = [];
            foreach ($rec_idx_arr as $i) {
                $i = (int)$i;
                if (isset($idx_to_pid[$i])) { $pids[] = $idx_to_pid[$i]; $total_edges++; }
            }
            if ($pids) update_post_meta($pid, '_ams_recommended_songs', $pids);
        }
        return $total_edges;
    }

    /* =========================================================
     * ייצוא שירים (Export) - גיבוי מלא לקובץ טקסט
     * =======================================================*/

    public function add_export_menu() {
        // השינוי: הפניה לתפריט 'שירים' (achord_song_cpt) במקום ל-Entries
        add_submenu_page(
            'edit.php?post_type=achord_song_cpt', 
            'ייצוא שירים', 
            'ייצוא (גיבוי)', 
            'manage_options', 
            'achord_export_page', 
            [$this, 'render_export_page']
        );
    }

    public function render_export_page() {
        if (!current_user_can('manage_options')) return;
        ?>
        <div class="wrap">
            <h1>ייצוא כל השירים (גיבוי מלא)</h1>
            <?php if (isset($_GET['deleted'])): ?>
            <div class="notice notice-success is-dismissible"><p>כל השירים נמחקו בהצלחה.</p></div>
            <?php endif; ?>
            <div class="card" style="max-width: 600px; padding: 20px; margin-top: 20px;">
                <p>לחיצה על הכפתור תייצר קובץ <code>.txt</code> המכיל את כל השירים באתר, כולל:</p>
                <ul style="list-style: disc; margin-right: 20px;">
                    <li>מילים ואקורדים</li>
                    <li>קישורים ליוטיוב (שיר מקורי, שיעור גיטרה, שיעור פסנתר)</li>
                    <li>קוד תווים (ABC)</li>
                    <li>מבצע ופרטים טכניים</li>
                    <li>מטא-דאטה מורחב: עידן, מצב רוח, נושאים, פופולריות, מספר עמוד בספר</li>
                    <li>שירים מומלצים (כקשרים בין שירים — נשמרים כ-idx וקושרים מחדש בייבוא)</li>
                </ul>
                <p><strong>הקובץ שיוצר תואם ב-100% למערכת הייבוא.</strong> ניתן להשתמש בו לגיבוי או למעבר לאתר אחר.</p>
                <form method="post" action="<?php echo admin_url('admin-post.php'); ?>">
                    <input type="hidden" name="action" value="achord_export_songs">
                    <?php wp_nonce_field('achord_export_nonce'); ?>
                    <button type="submit" class="button button-primary button-hero">הורד קובץ גיבוי מלא</button>
                </form>
            </div>

            <div class="card" style="max-width: 600px; padding: 20px; margin-top: 20px; border-right: 4px solid #d63638;">
                <h2 style="color: #d63638; margin-top: 0;">מחיקת כל השירים</h2>
                <p>פעולה זו תמחק לצמיתות את כל השירים באתר, כולל כל המטא-דאטה וקשרי הקטגוריות שלהם. <strong>לא ניתן לשחזר!</strong></p>
                <?php
                $song_count = wp_count_posts('achord_song_cpt');
                $total = ($song_count->publish ?? 0) + ($song_count->draft ?? 0) + ($song_count->private ?? 0) + ($song_count->pending ?? 0);
                ?>
                <p>שירים קיימים כרגע: <strong><?php echo number_format($total); ?></strong></p>
                <form method="post" action="<?php echo admin_url('admin-post.php'); ?>"
                      onsubmit="return confirm('האם אתה בטוח שברצונך למחוק את כל <?php echo $total; ?> השירים?\n\nפעולה זו בלתי הפיכה!');">
                    <input type="hidden" name="action" value="achord_delete_all_songs">
                    <?php wp_nonce_field('achord_delete_all_songs_nonce'); ?>
                    <button type="submit" class="button button-hero" style="background:#d63638;border-color:#b32d2e;color:#fff;">מחק את כל השירים</button>
                </form>
            </div>
        </div>
        <?php
    }

    public function handle_delete_all_songs() {
        if (!current_user_can('manage_options')) wp_die('אין הרשאה');
        check_admin_referer('achord_delete_all_songs_nonce');

        global $wpdb;

        $wpdb->query("DELETE pm FROM {$wpdb->postmeta} pm INNER JOIN {$wpdb->posts} p ON pm.post_id = p.ID WHERE p.post_type = 'achord_song_cpt'");
        $wpdb->query("DELETE tr FROM {$wpdb->term_relationships} tr INNER JOIN {$wpdb->posts} p ON tr.object_id = p.ID WHERE p.post_type = 'achord_song_cpt'");
        $wpdb->query("DELETE FROM {$wpdb->posts} WHERE post_type = 'achord_song_cpt'");

        wp_redirect(admin_url('edit.php?post_type=achord_song_cpt&page=achord_export_page&deleted=1'));
        exit;
    }

    public function handle_export_songs() {
        if (!current_user_can('manage_options')) wp_die('אין הרשאה');
        check_admin_referer('achord_export_nonce');

        // הגדלת משאבים לייצוא כבד
        @ini_set('memory_limit', '512M');
        @set_time_limit(300);

        // 1. התיקון הקריטי: שליפת השירים האמיתיים ולא ה-Entries
        $songs = get_posts([
            'post_type'      => 'achord_song_cpt', // <--- כאן היה הבאג (self::CPT)
            'posts_per_page' => -1,
            'post_status'    => 'any',
            'orderby'        => 'title',
            'order'          => 'ASC'
        ]);

        $filename = 'achord_full_export_' . date('Y-m-d_H-i') . '.txt';
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo "\xEF\xBB\xBF"; // BOM

        foreach ($songs as $post) {
            $id = $post->ID;
            $raw_content = $post->post_content;

            // --- א. שליפת נתוני כותרת ---
            $performer_terms = get_the_terms($id, 'singer');
            $performer = ($performer_terms && !is_wp_error($performer_terms)) ? $performer_terms[0]->name : '';
            // ניקוי שם המבצע מהכותרת למניעת כפילות (למשל: "עטור מצחך – אריק איינשטיין" -> "עטור מצחך")
            $clean_title = $post->post_title;
            if ($performer) {
                $clean_title = str_replace([' – ' . $performer, ' - ' . $performer], '', $clean_title);
            }

            // --- ב. שליפת מטא (הנתונים הכי עדכניים שיש ב-DB) ---
            $video_guitar = get_post_meta($id, 'lesson_video_guitar', true);
            if (!$video_guitar) $video_guitar = get_post_meta($id, 'lesson_video', true); // Fallback
            $video_piano  = get_post_meta($id, 'lesson_video_piano', true);
            $abc_code     = get_post_meta($id, '_ams_abc_code', true);

            // Extended song meta (idx + tags from the AI-enriched dataset).
            $song_idx     = get_post_meta($id, '_song_idx', true);
            $song_page    = get_post_meta($id, '_song_page_in_book', true);
            $song_era     = get_post_meta($id, '_song_era', true);
            $song_mood    = get_post_meta($id, '_song_mood', true);
            $song_fame    = get_post_meta($id, '_song_fame', true);
            $song_themes_raw = get_post_meta($id, '_song_themes', true);
            $song_themes = '';
            if (!empty($song_themes_raw)) {
                $decoded = json_decode($song_themes_raw, true);
                if (is_array($decoded)) $song_themes = implode(',', $decoded);
            }

            // Recommendations — prefer the idx list (portable across imports);
            // if absent, fall back to post-ID list and resolve to idx via _song_idx.
            $rec_source = get_post_meta($id, '_ams_recommended_source_idx', true);
            if (!is_array($rec_source)) $rec_source = [];
            if (!$rec_source) {
                $rec_pids = get_post_meta($id, '_ams_recommended_songs', true);
                if (is_array($rec_pids)) {
                    foreach ($rec_pids as $rp) {
                        $rix = get_post_meta((int)$rp, '_song_idx', true);
                        if ($rix) $rec_source[] = (int)$rix;
                    }
                }
            }
            $song_recommendations = $rec_source ? implode(',', array_map('intval', $rec_source)) : '';

            // --- ג. חילוץ פרמטרים מתוך התוכן (Regex Helper) ---
            $extract = function($tag, $content) {
                if (preg_match('/\[' . $tag . '\](.*?)\[\/' . $tag . '\]/s', $content, $m)) {
                    return trim($m[1]);
                }
                return '';
            };

            // חילוץ נתונים שאולי קיימים רק בתוך השורטקוד
            $writer       = $extract('writer', $raw_content);
            $lyrics_by    = $extract('lyrics_by', $raw_content);
            $music_by     = $extract('music_by', $raw_content);
            $capo         = $extract('capo', $raw_content);
            $tempo        = $extract('tempo', $raw_content);
            $strumming    = $extract('strumming', $raw_content);
            $youtube_orig = $extract('youtube', $raw_content);
            $easy_trans   = $extract('easy_transpose', $raw_content);

            // --- ד. טיפול בגוף השיר (Body) ---
            // אנחנו רוצים להשאיר רק את המילים והאקורדים (כולל גרסאות), ולנקות את כל התגים שכבר חילצנו למעלה
            $body = $raw_content;
            
            // 1. הסרת המעטפת הראשית
            $body = str_replace(['[achord_song]', '[/achord_song]'], '', $body);
            
            // 2. רשימת תגים למחיקה מהתוכן (כי נבנה אותם מחדש למעלה בצורה מסודרת)
            $tags_to_strip = [
                'song_title', 'performer', 'writer', 'lyrics_by', 'music_by',
                'capo', 'tempo', 'strumming', 'easy_transpose',
                'youtube', 'lesson_url', 'lesson_guitar', 'lesson_piano', 'abc_code',
                'song_idx', 'song_page', 'song_era', 'song_mood', 'song_themes',
                'song_fame', 'recommendations'
            ];
            
            foreach ($tags_to_strip as $tag) {
                $body = preg_replace('/\[' . $tag . '\].*?\[\/' . $tag . '\]\s*/s', '', $body);
            }
            
            $body = trim($body);

            // --- ה. הרכבת הקובץ מחדש ---
            echo "[achord_song]\n";
            echo "[song_title]" . $clean_title . "[/song_title]\n";
            if ($performer) echo "[performer]" . $performer . "[/performer]\n";
            
            // קרדיטים
            if ($lyrics_by) echo "[lyrics_by]" . $lyrics_by . "[/lyrics_by]\n";
            if ($music_by) echo "[music_by]" . $music_by . "[/music_by]\n";
            if ($writer && !$lyrics_by && !$music_by) echo "[writer]" . $writer . "[/writer]\n";
            
            // טכני
            if ($capo) echo "[capo]" . $capo . "[/capo]\n";
            if ($tempo) echo "[tempo]" . $tempo . "[/tempo]\n";
            if ($strumming) echo "[strumming]" . $strumming . "[/strumming]\n";
            if ($easy_trans) echo "[easy_transpose]" . $easy_trans . "[/easy_transpose]\n";

            // מדיה (כאן המטא מנצח)
            if ($youtube_orig) echo "[youtube]" . $youtube_orig . "[/youtube]\n";
            if ($video_guitar) echo "[lesson_guitar]" . $video_guitar . "[/lesson_guitar]\n";
            if ($video_piano) echo "[lesson_piano]" . $video_piano . "[/lesson_piano]\n";

            // Extended song metadata + recommendations (portable across imports via _song_idx).
            if ($song_idx !== '')             echo "[song_idx]" . $song_idx . "[/song_idx]\n";
            if ($song_page !== '')            echo "[song_page]" . $song_page . "[/song_page]\n";
            if ($song_era !== '')             echo "[song_era]" . $song_era . "[/song_era]\n";
            if ($song_mood !== '')            echo "[song_mood]" . $song_mood . "[/song_mood]\n";
            if ($song_themes !== '')          echo "[song_themes]" . $song_themes . "[/song_themes]\n";
            if ($song_fame !== '')            echo "[song_fame]" . $song_fame . "[/song_fame]\n";
            if ($song_recommendations !== '') echo "[recommendations]" . $song_recommendations . "[/recommendations]\n";

            if ($abc_code) {
                echo "\n[abc_code]\n" . trim($abc_code) . "\n[/abc_code]\n";
            }

            // גוף השיר (מילים ואקורדים)
            if ($body) {
                echo "\n" . $body . "\n";
            }

            echo "[/achord_song]\n";
            echo "\n----------------------------------------\n\n";
        }
        exit;
    }

}