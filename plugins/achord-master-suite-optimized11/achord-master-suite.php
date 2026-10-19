<?php
/**
 * Plugin Name:       Achord Master Suite
 * Description:       תוסף מאוחד לניהול, הצגה והעלאת שירים, שיעורים ותווים. כולל תצוגת אקורדים אינטראקטיבית, ארכיונים, טופס העלאה ועוד.
 * Version:           1.3.25
 * Author:            המוזיקאי שבך (נבנה ועוצב ע"י Gemini)
 * Text Domain:       achord-master-suite
 */

// אבטחה: מניעת גישה ישירה לקובץ
if (!defined('ABSPATH')) {
    exit;
}

/**
 * הקלאס הראשי של התוסף
 * הוא אחראי על טעינת כל הרכיבים, רישום ה-hooks, והפעלת המערכת כולה.
 */
final class Achord_Master_Suite {

    private static $_instance = null;
    public $version = '1.3.42';
    
    public $setup_handler;
    public $assets_handler;
    public $shortcode_handler;
    public $ajax_handler;
    public $template_handler;
    public $features_handler;
    public $entries_manager;
    public $personal_version_handler;
    public $edit_proposal_handler;

    /**
     * מנרמל טקסט מתקדם לחיפוש סלחני: פותר כתיב חסר/מלא וטעויות פונטיות (ללא QWERTY).
     */
    public static function normalize_hebrew_for_search($string) {
        if (empty($string)) return '';

        $string = mb_strtolower(trim($string), 'UTF-8');
        
        // 1. המרת אותיות סופיות לאותיות רגילות
        $string = strtr($string, ['ך'=>'כ', 'ם'=>'מ', 'ן'=>'נ', 'ף'=>'פ', 'ץ'=>'צ']);

        // 2. איחוד פונטי (אותיות שנשמעות אותו הדבר)
        $string = strtr($string, ['ט'=>'ת', 'ע'=>'א']);

        // 3. ניקוי סופי: משאיר רק אותיות בעברית, אנגלית ומספרים
        $string = preg_replace('/[^\p{Hebrew}a-z0-9 ]/u', '', $string);

        // 4. הסרת רווחים כפולים
        return trim(preg_replace('/\s+/', ' ', $string));
    }

    /**
     * מצב "גרסה קלה" גלובלי — מופעל ע"י cookie שנקבע בטוגל שבבר-החיפוש.
     * כל המוקדים (חיפוש / המלצות / ארכיב / ברירת-מחדל בשיר) נשענים על זה.
     */
    public static function easy_mode_on() {
        if (isset($_GET['easy'])) return $_GET['easy'] === '1';
        return !empty($_COOKIE['ams_easy_mode']);
    }

    /**
     * סינון שאילתות-רשימה ראשיות של שירים למצב גרסה-קלה.
     * לא נוגע בעמוד שיר בודד (is_singular) — קישור ישיר תמיד עובד.
     */
    public function filter_easy_mode_query($query) {
        if (is_admin() || !$query->is_main_query() || $query->is_singular()) return;
        if (!self::easy_mode_on()) return;

        $pt = $query->get('post_type');
        $is_song = ($pt === 'achord_song_cpt') || (is_array($pt) && in_array('achord_song_cpt', $pt, true));
        $is_song = $is_song
            || $query->is_post_type_archive('achord_song_cpt')
            || $query->is_tax(['singer', 'genre', 'level']);
        if (!$is_song) return;

        $mq = $query->get('meta_query');
        if (!is_array($mq)) $mq = [];
        $mq[] = ['key' => '_ams_is_easy', 'value' => '1', 'compare' => '='];
        $query->set('meta_query', $mq);
    }

    /**
     * ?easy=1 בכתובת מדליק את מצב גרסה-קלה (?easy=0 מכבה) — מקביל לטוגל שבבר-החיפוש,
     * כולל עוגייה מתמשכת כדי שגם בקשות ה-AJAX והעמודים הבאים יסוננו.
     */
    public function handle_easy_mode_param() {
        if (!isset($_GET['easy']) || headers_sent()) return;
        if ($_GET['easy'] === '1') {
            setcookie('ams_easy_mode', '1', time() + YEAR_IN_SECONDS, '/');
        } else {
            setcookie('ams_easy_mode', '', time() - HOUR_IN_SECONDS, '/');
        }
    }

    /**
     * ארכיוני רמת-קושי (/level/…) בוטלו — הפניית-קבע לספריית האקורדים;
     * רמות "קל" מפנות עם פילטר הגרסה-הקלה דולק.
     */
    public function redirect_level_archive() {
        if (!is_tax('level')) return;
        $term    = get_queried_object();
        $is_easy = $term && in_array(urldecode($term->slug), ['קל', 'קל-ממש'], true);
        wp_safe_redirect(home_url($is_easy ? '/chords/?easy=1' : '/chords/'), 301);
        exit;
    }

    public static function instance() {
        if (is_null(self::$_instance)) {
            self::$_instance = new self();
        }
        return self::$_instance;
    }

    private function __construct() {
        $this->define_constants();
        $this->load_dependencies();
        $this->setup_hooks();
    }

    private function define_constants() {
        define('AMS_VERSION', $this->version);
        define('AMS_PLUGIN_DIR', plugin_dir_path(__FILE__));
        define('AMS_PLUGIN_URL', plugin_dir_url(__FILE__));
    }

    private function load_dependencies() {
        // ראשון מכל — מערכת האייקונים המרכזית (Phosphor); כל ה-handlers והערכה משתמשים בה.
        require_once AMS_PLUGIN_DIR . 'includes/Icons.php';
        // שכבת ההגנה על תוכן משתמשים; שאר ה-handlers משתמשים בה.
        require_once AMS_PLUGIN_DIR . 'includes/Content_Guard.php';
        require_once AMS_PLUGIN_DIR . 'includes/Setup_Handler.php';
        require_once AMS_PLUGIN_DIR . 'includes/Assets_Handler.php';
        require_once AMS_PLUGIN_DIR . 'includes/Shortcode_Handler.php';
        require_once AMS_PLUGIN_DIR . 'includes/Ajax_Handler.php';
        require_once AMS_PLUGIN_DIR . 'includes/Template_Handler.php';

        // טען גם את מנהל ה-Entries (ייבוא וניהול טפסים)
        require_once AMS_PLUGIN_DIR . 'includes/Entries_Manager.php';
        
        // טעינת מודול התווים העצמאי והמבודד
        require_once AMS_PLUGIN_DIR . 'includes/Tavim_Player_Module.php';

        // גרסאות אישיות למשתמשים
        require_once AMS_PLUGIN_DIR . 'includes/Personal_Version_Handler.php';

        // הצעות עריכה לגרסה הקנונית
        require_once AMS_PLUGIN_DIR . 'includes/Edit_Proposal_Handler.php';


        // שמירת שירים למועדפים
        require_once AMS_PLUGIN_DIR . 'includes/Saved_Songs_Handler.php';

        // מערכת תפקידים והיררכיית משתמשים
        require_once AMS_PLUGIN_DIR . 'includes/User_Role_Handler.php';

        // יומן פעילות
        require_once AMS_PLUGIN_DIR . 'includes/Activity_Log_Handler.php';

        // היסטוריית גרסאות שירים
        require_once AMS_PLUGIN_DIR . 'includes/Revision_History_Handler.php';

        // הכרה בתורמים (קרדיט בעמוד שיר + עמוד "תורמים")
        require_once AMS_PLUGIN_DIR . 'includes/Contributors_Handler.php';

        // בקשות שירים ("בקש שיר חסר" + עמוד "בקשות שירים")
        require_once AMS_PLUGIN_DIR . 'includes/Song_Request_Handler.php';

        // המחברת האישית (שירים-משלי, גרסאות, מועדפים + תיקיות)
        require_once AMS_PLUGIN_DIR . 'includes/Notebook_Handler.php';
    }
    private function setup_hooks() {
        $this->setup_handler = new AMS_Setup_Handler();
        $this->assets_handler = new AMS_Assets_Handler();
        $this->shortcode_handler = new AMS_Shortcode_Handler();
        $this->ajax_handler = new AMS_Ajax_Handler();
        $this->template_handler = new AMS_Template_Handler($this->shortcode_handler);
        
        // אין צורך ליצור מופע של מודול התווים, הוא מפעיל את עצמו מתוך הקובץ שלו.

        // צור מופע של מנהל ה-Entries כדי לאפשר ייבוא וניהול טפסים במסך הניהול
        $this->entries_manager = new AMS_Entries_Manager();

        // גרסאות אישיות
        $this->personal_version_handler = new AMS_Personal_Version_Handler();

        // הצעות עריכה
        $this->edit_proposal_handler = new AMS_Edit_Proposal_Handler();

        // ממשק PDF

        // מועדפים
        new AMS_Saved_Songs_Handler();

        // מערכת תפקידים
        new AMS_User_Role_Handler();

        // יומן פעילות
        new AMS_Activity_Log_Handler();

        // היסטוריית גרסאות
        new AMS_Revision_History_Handler();

        // הכרה בתורמים
        new AMS_Contributors_Handler();

        // בקשות שירים
        new AMS_Song_Request_Handler();

        // המחברת האישית
        new AMS_Notebook_Handler();

        // מצב "גרסה קלה" גלובלי — סינון שאילתות-רשימה ראשיות
        add_action('pre_get_posts', [$this, 'filter_easy_mode_query']);
        add_action('init', [$this, 'handle_easy_mode_param']);
        add_action('template_redirect', [$this, 'redirect_level_archive']);
    }
}

/**
 * הפונקציה הראשית שמפעילה את התוסף.
 *
 * @return Achord_Master_Suite
 */
function achord_master_suite() {
    return Achord_Master_Suite::instance();
}

// הפעלת התוסף
achord_master_suite();
