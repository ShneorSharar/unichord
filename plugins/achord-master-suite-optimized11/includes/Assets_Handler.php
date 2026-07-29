<?php
// אבטחה: מניעת גישה ישירה
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Class AMS_Assets_Handler
 * מטפל ברישום וטעינה של כל נכסי ה-CSS וה-JavaScript של התוסף.
 */
class AMS_Assets_Handler {

    public function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_head', [$this, 'add_preload_headers']);
        // Add defer attribute to our main script to prevent render blocking
        add_filter('script_loader_tag', [$this, 'add_defer_to_scripts'], 10, 2);
    }

    /**
     * פונקציית עזר שבודקת אם צריך לטעון את ספריית התווים abcjs.
     * @return bool
     */
    private function should_load_abcjs() {
        global $post;
        if (!is_a($post, 'WP_Post')) return false;

        if (has_shortcode($post->post_content, 'tavim_player')) return true;
        // טופס ההעלאה לא צורך יותר abcjs — סקשן התווים הוסר ממנו.

        // 2. בדיקה חדשה (Single Page): האם לשיר הנוכחי יש קוד תווים במטא?
        if (is_singular('achord_song_cpt')) {
            $abc_meta = get_post_meta($post->ID, '_ams_abc_code', true);
            if (!empty($abc_meta)) {
                return true; // יש תווים -> טען את הספרייה!
            }
        }
        
        return false;
    }

    /**
     * פונקציית עזר שבודקת אם אנחנו בעמוד שדורש את הנכסים הכלליים של התוסף.
     * @return bool
     */
    private function is_ams_page() {
        // דפים שיש בהם תמיד חיפוש בהדר — טען תמיד
        if (is_front_page() || is_404() || is_search()) return true;

        global $post;
        if (!is_a($post, 'WP_Post')) return false;
        if (has_shortcode($post->post_content, 'achord_upload_song')) return true;
        
        // הוספת השורטקוד החדש לרשימת המעקב כדי שהסקריפטים ייטענו
        $shortcodes = [
            'achord_song_search',
            'achord_song_search_advanced',
            'achord_song',
            'achord_categorized_accordion',
            'achord_upload_song',
            'achord_lessons_accordion',
            'achord_tavim_accordion',
            'achord_tunes_library',
            'achord_related_posts',
            // עמודי משתמש — חייב CSS/JS
            'achord_my_versions',
            'achord_review_proposals',
            'achord_saved_songs',
            'achord_user_profile',
            // המחברת האישית
            'achord_notebook',
            'achord_notebook_editor',
        ];
        
        foreach ($shortcodes as $shortcode) {
            if (has_shortcode($post->post_content, $shortcode)) return true;
        }
        
        if (is_singular('achord_song_cpt')) {
            return true;
        }
        
        if ($this->should_load_abcjs()) return true;

        return false;
    }

    /**
     * רושם וטוען את כל הנכסים באופן מותנה.
     */
    public function enqueue_assets() {
        // טען את הנכסים המרכזיים רק בעמודים שצריכים אותם
        if ($this->is_ams_page()) {
            wp_enqueue_style('ams-main-style', AMS_PLUGIN_URL . 'assets/css/main.css', [], AMS_VERSION);
            // גופן Assistant עבור הטקסט הראשי והאקורדים
            wp_enqueue_style('google-fonts-assistant', 'https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap', [], null);
            // Always load the main script in the footer. The defer attribute will be applied via filter below.
            wp_enqueue_script('ams-main-script', AMS_PLUGIN_URL . 'assets/js/main.js', ['jquery'], AMS_VERSION, true);
            
            wp_localize_script('ams-main-script', 'ams_ajax_data', [
                'ajax_url'        => admin_url('admin-ajax.php'),
                'upload_nonce'    => wp_create_nonce('achord_upload_nonce'),
                'tavim_nonce'     => wp_create_nonce('tavim_preview'),
                'search_nonce'    => wp_create_nonce('achord_search_nonce'),
                'personal_nonce'  => wp_create_nonce('achord_personal_version_nonce'),
                'saved_nonce'     => wp_create_nonce('achord_saved_songs_nonce'),
                'is_logged_in'    => is_user_logged_in() ? '1' : '0',
                'plugin_url'      => trailingslashit(AMS_PLUGIN_URL),
                'requests_url'    => home_url('/requests/'),
            ]);

            // Enqueue search script wherever the custom header (which embeds the
            // search form) is rendered — i.e. on every AMS page including
            // singular song/lesson/tavim views, archives, and shortcoded pages.
            wp_enqueue_script('ams-song-search-script', AMS_PLUGIN_URL . 'assets/js/song-search.js', [], AMS_VERSION, true);

            // Remove external Google Fonts to improve performance. Falling back to system or local fonts defined in CSS variables.
            //wp_enqueue_style('ams-google-fonts', 'https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Roboto+Slab:wght@400;700&family=Frank+Ruhl+Libre:wght@400;700&display=swap', [], null);
        }

        // טעינה מותנית של ספריית התווים abcjs, באמצעות פונקציית העזר
        if ($this->should_load_abcjs()) {
             // אירוח עצמי של abcjs 6.2.0 (ללא CDN — מסיר תלות וסיכון supply-chain).
             // ה-synth כלול בתוך build ה-basic, ולכן אין צורך בקובץ synth נפרד.
             wp_enqueue_script('abcjs-basic', AMS_PLUGIN_URL . 'assets/vendor/abcjs/abcjs-basic-min.js', [], '6.2.0', true);
             wp_enqueue_style('abcjs-audio', AMS_PLUGIN_URL . 'assets/vendor/abcjs/abcjs-audio.css', [], '6.2.0');

             // מודול אצבוע חליל/חלילון/פסנתר
             wp_enqueue_script('ams-whistle-fingering', AMS_PLUGIN_URL . 'assets/js/whistle-fingering-enhanced.js', ['abcjs-basic'], AMS_VERSION, true);
             wp_add_inline_script('ams-whistle-fingering', $this->get_whistle_integration_script());
        }
    }

    /**
     * מוסיף Preload ל-CDN של abcjs לטעינה מהירה יותר.
     */
    public function add_preload_headers() {
        // Preload לגופן הראשי (Assistant-Regular) בעמודי-התוסף: מבטיח שהגופן
        // מובא כבר לפני ה-paint הראשון, כך שה-font-display:swap לא גורם ל-reflow
        // מאוחר (החלפת fallback→Assistant) שהיה מזיז מילים וקופץ את מיקומי-האקורדים.
        if ($this->is_ams_page()) {
            echo '<link rel="preload" href="' . esc_url(AMS_PLUGIN_URL . 'assets/fonts/Assistant-Regular.woff2') . '" as="font" type="font/woff2" crossorigin>' . "\n";
        }

        // שימוש באותה פונקציית עזר כדי להבטיח סנכרון מלא
        if ($this->should_load_abcjs()) {
            echo '<link rel="preload" href="' . esc_url(AMS_PLUGIN_URL . 'assets/vendor/abcjs/abcjs-basic-min.js') . '" as="script">' . "\n";
            echo '<link rel="preload" href="' . esc_url(AMS_PLUGIN_URL . 'assets/vendor/abcjs/abcjs-audio.css') . '" as="style">' . "\n";
        }
    }

    /**
     * סקריפט אינטגרציה — מאזין לאירוע הרנדור ומאתחל את מודול האצבוע.
     * הלוגיקה המלאה נמצאת ב-whistle-fingering-enhanced.js.
     */
    private function get_whistle_integration_script() {
        return <<<'JS'
document.addEventListener('achord-tavim-rendered', function(e) {
    if (typeof WhistleFingering !== 'undefined') {
        WhistleFingering.init(e.detail.container, e.detail.visualObj);
    }
});
JS;
    }

    /**
     * Adds the defer attribute to selected scripts to improve performance.
     *
     * @param string $tag    The HTML script tag output by WordPress.
     * @param string $handle The registered script handle.
     * @return string Modified script tag.
     */
    public function add_defer_to_scripts($tag, $handle) {
        // Only add defer to our main script if it is enqueued.
        if ($handle === 'ams-main-script') {
            // If the tag already contains 'defer', return it as is.
            if (false === strpos($tag, 'defer')) {
                return str_replace('<script ', '<script defer ', $tag);
            }
        }
        return $tag;
    }
}