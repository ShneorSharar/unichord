<?php
// אבטחה: מניעת גישה ישירה
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Class AMS_Setup_Handler
 * מטפל בכל ההגדרות הראשוניות של התוסף:
 * - רישום סוגי תוכן מותאמים (CPTs)
 * - רישום טקסונומיות
 * - הוספת תיבות מטא (Meta Boxes) לממשק הניהול
 */
class AMS_Setup_Handler {

    public function __construct() {
        // רותם את פונקציות הרישום ל-hook המתאים בוורדפרס
        add_action('init', [$this, 'register_all']);
        add_action('add_meta_boxes', [$this, 'add_meta_boxes']);
        add_action('save_post', [$this, 'save_meta_boxes']); // קיים (עבור תווים)
        add_action('save_post', [$this, 'save_song_extras']); // חדש (עבור שירים)
        add_action('save_post_achord_song_cpt', [$this, 'index_song_data_on_save'], 10, 3);
        add_action('save_post_achord_song_cpt', [$this, 'set_is_easy_on_save'], 10, 3);
    }

    /**
     * פונקציה מרכזית שרושמת את כל סוגי התוכן והטקסונומיות.
     */
    public function register_all() {
        $this->register_taxonomies();
        $this->register_post_types();
    }

    /**
     * רושם את כל הטקסונומיות של המערכת פעם אחת.
     */
    private function register_taxonomies() {
        // הגדרת כל סוגי התוכן שישתמשו בטקסונומיות אלו
        $post_types = ['achord_song_cpt', 'lesson', 'tavim_score'];

        register_taxonomy('genre', $post_types, ['labels' => ['name' => 'ז\'אנרים'], 'hierarchical' => false, 'show_ui' => true, 'show_admin_column' => true, 'rewrite' => ['slug' => 'genre'], 'show_in_rest' => true]);
        register_taxonomy('singer', $post_types, ['labels' => ['name' => 'מבצעים'], 'hierarchical' => false, 'show_ui' => true, 'show_admin_column' => true, 'rewrite' => ['slug' => 'singer'], 'show_in_rest' => true]);
        register_taxonomy('level', $post_types, ['labels' => ['name' => 'רמות קושי'], 'hierarchical' => true, 'show_ui' => true, 'show_admin_column' => true, 'rewrite' => ['slug' => 'level'], 'show_in_rest' => true]);

        // ספריית תווים — טקסונומיה אחת היררכית: מסורת (ישראלי/יהודי/אירי) כהורים, תת-ז'אנרים כילדים.
        // "יש תווים" עצמו אינו טקסונומיה אלא דגל (_achord_content_flags מכיל "score"); הטקסונומיה היא רק לסיווג.
        register_taxonomy('tune_category', ['achord_song_cpt'], [
            'labels' => [
                'name'          => 'קטגוריות תווים',
                'singular_name' => 'קטגוריית תווים',
                'all_items'     => 'כל הקטגוריות',
                'parent_item'   => 'קטגוריית-אם',
                'edit_item'     => 'עריכת קטגוריה',
                'add_new_item'  => 'הוספת קטגוריה',
                'search_items'  => 'חיפוש קטגוריות',
                'menu_name'     => 'קטגוריות תווים',
            ],
            'hierarchical'      => true,
            'show_ui'           => true,
            'show_admin_column' => true,
            'rewrite'           => ['slug' => 'tunes', 'hierarchical' => true],
            'show_in_rest'      => true,
        ]);
    }

    /**
     * רושם את כל סוגי התוכן המותאמים של המערכת.
     */
    private function register_post_types() {
        // CPT: שירים (מתוסף 1)
        register_post_type('achord_song_cpt', [
            'labels' => ['name' => 'שירים', 'singular_name' => 'שיר'],
            'public' => true, 'show_ui' => true, 'show_in_menu' => true,
            'rewrite' => ['slug' => 'shirim'], 'has_archive' => true,
            'menu_icon' => 'dashicons-format-audio', 'supports' => ['title', 'editor', 'author', 'revisions']
        ]);

    }

    /**
     * ריכוז כל תיבות המטא לממשק הניהול.
     */
    public function add_meta_boxes() {
        // תוספות לשיר (וידאו ותווים באותו עמוד)
        add_meta_box('ams_song_extras', 'תוספות לשיר (שיעור ותווים)', [$this, 'render_song_extras'], 'achord_song_cpt', 'normal', 'high');
    }

    /**
     * HTML עבור תיבת המטא של קוד ה-ABC.
     */
    public function abc_meta_box_html($post) {
        wp_nonce_field('ams_save_meta', 'ams_nonce');
        $abc = get_post_meta($post->ID, '_ams_abc_code', true);
        echo '<textarea style="width:100%;height:250px;direction:ltr;" name="ams_abc_code">' . esc_textarea($abc) . '</textarea>';
    }

    /**
     * HTML עבור תיבת המטא של הגדרות הנגן.
     */
    public function settings_meta_box_html($post) {
        $tempo = get_post_meta($post->ID, '_ams_tempo', true) ?: 120;
        $auto_play = get_post_meta($post->ID, '_ams_auto_play', true);
        echo '<p><strong>טמפו (BPM):</strong><br><input type="number" name="ams_tempo" value="' . esc_attr($tempo) . '" min="40" max="240"></p>';
        echo '<p><input type="checkbox" name="ams_auto_play" ' . checked($auto_play, '1', false) . '> ניגון אוטומטי</p>';
    }

    /**
     * שומר את הנתונים מתיבות המטא.
     */
    public function save_meta_boxes($post_id) {
        if (!isset($_POST['ams_nonce']) || !wp_verify_nonce($_POST['ams_nonce'], 'ams_save_meta')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!current_user_can('edit_post', $post_id)) return;

        if (isset($_POST['ams_abc_code'])) {
            update_post_meta($post_id, '_ams_abc_code', sanitize_textarea_field($_POST['ams_abc_code']));
        }
        if (isset($_POST['ams_tempo'])) {
            update_post_meta($post_id, '_ams_tempo', intval($_POST['ams_tempo']));
        }
        update_post_meta($post_id, '_ams_auto_play', isset($_POST['ams_auto_play']) ? '1' : '0');
    }

    /**
     * פונקציות חדשות לשיר (New Single Page Logic)
     */

    /**
     * מציג את תיבת המטא של תוספות השיר (וידאו ותווים).
     */
    public function render_song_extras($post) {
        wp_nonce_field('ams_song_extras_save', 'ams_song_extras_nonce');
        
        // שליפת נתונים
        $video_guitar = get_post_meta($post->ID, 'lesson_video_guitar', true);
        $video_piano  = get_post_meta($post->ID, 'lesson_video_piano', true);
        $abc          = get_post_meta($post->ID, '_ams_abc_code', true);
        
        echo '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">';
        
        // שיעור גיטרה
        echo '<div style="background:#f0f9ff; padding:15px; border:1px solid #bae6fd; border-radius:8px;">';
        echo '<p style="margin-top:0;"><strong>🎸 שיעור גיטרה (YouTube):</strong></p>';
        echo '<input type="url" name="lesson_video_guitar" value="' . esc_attr($video_guitar) . '" style="width:100%;" placeholder="https://youtu.be/...">';
        echo '</div>';

        // שיעור פסנתר
        echo '<div style="background:#fdf4ff; padding:15px; border:1px solid #f5d0fe; border-radius:8px;">';
        echo '<p style="margin-top:0;"><strong>🎹 שיעור פסנתר (YouTube):</strong></p>';
        echo '<input type="url" name="lesson_video_piano" value="' . esc_attr($video_piano) . '" style="width:100%;" placeholder="https://youtu.be/...">';
        echo '</div>';
        
        echo '</div>'; // סגירת Grid

        // תווים
        echo '<div style="background:#f9f9f9; padding:15px; border:1px solid #ddd; border-radius:8px;">';
        echo '<p style="margin-top:0;"><strong>🎼 קוד תווים (ABC Notation):</strong></p>';
        echo '<textarea name="ams_abc_code" rows="6" style="width:100%; direction:ltr; font-family:monospace;" placeholder="X:1...">' . esc_textarea($abc) . '</textarea>';
        echo '</div>';
    }

    /**
     * שומר את הנתונים מתיבת המטא של תוספות השיר.
     */
    public function save_song_extras($post_id) {
        if (!isset($_POST['ams_song_extras_nonce']) || !wp_verify_nonce($_POST['ams_song_extras_nonce'], 'ams_song_extras_save')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!current_user_can('edit_post', $post_id)) return;

        if (isset($_POST['lesson_video_guitar'])) update_post_meta($post_id, 'lesson_video_guitar', esc_url_raw($_POST['lesson_video_guitar']));
        if (isset($_POST['lesson_video_piano'])) update_post_meta($post_id, 'lesson_video_piano', esc_url_raw($_POST['lesson_video_piano']));
        if (isset($_POST['ams_abc_code'])) update_post_meta($post_id, '_ams_abc_code', sanitize_textarea_field($_POST['ams_abc_code']));
    }

    /**
     * אוטומציה: יצירת "אינדקס מילים נקי וסלחני" וסנכרון רמת קושי בעת שמירת שיר.
     */
    public function index_song_data_on_save($post_id, $post, $update) {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (wp_is_post_revision($post_id)) return;
        if (!current_user_can('edit_post', $post_id)) return;

        $content = $post->post_content;
        $title = $post->post_title;
        
        // 1. שמירת רמת קושי לחיפוש מהיר
        $has_easy = (strpos($content, '[version=easy]') !== false);
        update_post_meta($post_id, '_achord_difficulty', $has_easy ? 'beginner' : 'advanced');

        // 2. חילוץ המילים בלבד (ללא אקורדים ו-HTML)
        $clean_lyrics = preg_replace('/\[.*?\]/', ' ', $content);
        $clean_lyrics = trim(preg_replace('/\s+/', ' ', strip_tags($clean_lyrics)));

        // 3. שם האמן (singer) — נשמר נפרד כדי שהדירוג יוכל להעדיף כותרת על אמן
        $artist = '';
        $singer_terms = get_the_terms($post_id, 'singer');
        if ($singer_terms && !is_wp_error($singer_terms)) {
            $artist = $singer_terms[0]->name;
        }

        // 4. כותרת ללא הסיומת " – <אמן>" — כדי לאנדקס נפרד כותרת בלבד
        $clean_title = $title;
        if ($artist !== '') {
            $patterns = [' – ' . $artist, ' - ' . $artist, '–' . $artist, '-' . $artist];
            foreach ($patterns as $p) {
                if (mb_substr($clean_title, -mb_strlen($p)) === $p) {
                    $clean_title = mb_substr($clean_title, 0, mb_strlen($clean_title) - mb_strlen($p));
                    break;
                }
            }
        }
        $clean_title = trim($clean_title);

        // 5. אינדקס חיפוש סלחני — שלוש שכבות (כותרת / אמן / מצורף-לכל-הטקסט)
        $n_title  = Achord_Master_Suite::normalize_hebrew_for_search($clean_title);
        $n_artist = Achord_Master_Suite::normalize_hebrew_for_search($artist);
        $n_lyrics = Achord_Master_Suite::normalize_hebrew_for_search($clean_lyrics);

        $super_search_index = trim($n_title . ' ' . $n_artist . ' ' . $n_lyrics);

        update_post_meta($post_id, '_achord_search_title',  $n_title);
        update_post_meta($post_id, '_achord_search_artist', $n_artist);
        update_post_meta($post_id, '_achord_super_search_index', $super_search_index);

        // 4. שמירת דגלי תוכן (_achord_content_flags) — מחושב פעם אחת בשמירה
        //    שימוש בחיפוש ובתיאור ה-SEO של דף השיר
        $flags = [];

        // אקורדים: קיים [version=normal] בתוכן
        if (strpos($content, '[version=normal]') !== false) {
            $flags[] = 'chords';
        }

        // תווים: קיים קוד ABC
        $abc_code = get_post_meta($post_id, '_ams_abc_code', true);
        if (!empty(trim((string)$abc_code))) {
            $flags[] = 'score';
        }

        // שיעור גיטרה: קיים וידאו גיטרה
        $lesson_guitar = get_post_meta($post_id, 'lesson_video_guitar', true);
        if (!empty(trim((string)$lesson_guitar))) {
            $flags[] = 'lesson_guitar';
        }

        // שיעור פסנתר: קיים וידאו פסנתר
        $lesson_piano = get_post_meta($post_id, 'lesson_video_piano', true);
        if (!empty(trim((string)$lesson_piano))) {
            $flags[] = 'lesson_piano';
        }

        update_post_meta($post_id, '_achord_content_flags', wp_json_encode($flags));
    }

    /**
     * אוטומציה: חישוב הדגל `_ams_is_easy` בכל שמירת שיר, כדי שסינון
     * "רק שירים קלים" יכלול גם שירים חדשים/מעודכנים (המטא הזה לא נכתב בעבר
     * בשום קוד — רק במיגרציה חד-פעמית set_is_easy.php).
     * חוקיות זהה למיגרציה:
     *   is_easy = _ams_barre_status ∈ {barre_free, few_semi, one_f, one_bm}
     *           OR (_ams_barre_status='none' וכל אקורדי הגרסה-הרגילה בתוך 20 הקלים).
     * ללא בדיקת current_user_can — כותב רק בוליאני נגזר מתוכן קיים (בטוח גם
     * לשמירה תוכניתית דרך wp_update_post), ולא נוגע בשום קלט $_POST.
     */
    public function set_is_easy_on_save($post_id, $post, $update) {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (wp_is_post_revision($post_id)) return;

        $easy_statuses = ['barre_free', 'few_semi', 'one_f', 'one_bm'];
        $bs = get_post_meta($post_id, '_ams_barre_status', true);

        if (in_array($bs, $easy_statuses, true)) {
            $is = 1;
        } elseif ($bs === 'none' && $this->ams_normal_all_easy($post->post_content)) {
            $is = 1;
        } else {
            $is = 0;
        }

        update_post_meta($post_id, '_ams_is_easy', $is);
    }

    /**
     * true רק אם בגרסה-הרגילה יש לפחות אקורד מזוהה אחד וכולם בתוך סט האקורדים
     * הקלים (מקרה 'none'-כבר-קל: שיר שהיה קל מלכתחילה ולכן אין לו גרסה-קלה נפרדת).
     */
    private function ams_normal_all_easy($content) {
        static $EASY = null;
        if ($EASY === null) {
            $EASY = array_flip([
                'C', 'Am', 'Em', 'G', 'D', 'Dm', 'A', 'E',
                'B7', 'Fmaj7', 'A7', 'D7', 'E7', 'C7', 'G7',
                'Dm7', 'Am7', 'Em7', 'Bm', 'F',
            ]);
        }
        if (preg_match('/\[version=normal\](.*?)\[\/version\]/s', $content, $m)) {
            $body = $m[1];
        } else {
            $body = $content;
        }
        $found = false;
        if (preg_match_all('/\[([^\[\]\n]+)\]/u', $body, $mm)) {
            foreach ($mm[1] as $tok) {
                $tok = trim($tok);
                if ($tok === '') continue;
                if (preg_match('/[\x{0590}-\x{05FF}]/u', $tok)) continue; // עברית
                if (preg_match('/[\s=:]/', $tok)) continue;               // תג/רווח
                if (!preg_match('/^[A-G]/', $tok)) continue;              // חייב להתחיל A-G
                $found = true;
                $c = $tok;
                if (strpos($c, '/') !== false)  $c = explode('/', $c)[0];
                if (strpos($c, '\\') !== false) $c = explode('\\', $c)[0];
                $c = trim($c);
                if (!isset($EASY[$c])) return false;
            }
        }
        return $found;
    }
}