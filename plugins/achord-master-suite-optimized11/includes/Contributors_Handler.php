<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Contributors_Handler
 *
 * הכרה בתורמים: מי הוסיף שיר / תיקן אקורדים / הוסיף תווים / הוסיף שיעור.
 *
 * עיצוב:
 *  - מקור אמת לתפקידים פעילים: post-meta `_ams_contributors` על השיר —
 *    מערך JSON של רשומות ייחודיות { uid, role, ts }.
 *  - התפקיד 'added' (מי הוסיף את השיר) נגזר ב-runtime מ-post_author.
 *  - חשבונות מערכת (ברירת מחדל: ID 1 = חשבון הייבוא, ו-0) מוחרגים תמיד —
 *    כך 1,447 השירים המיובאים לא מקבלים קרדיט, והקרדיט "מתעורר" עם הקהילה.
 *  - רישום מבוסס-hooks בלבד (אפס עריכות לקבצי ה-handler הקיימים).
 *
 * תצוגה:
 *  - שורת קרדיט עדינה בתחתית עמוד שיר (filter the_content, priority 21).
 *  - shortcode [achord_contributors] לעמוד "תורמים".
 */
class AMS_Contributors_Handler {

    const META_KEY  = '_ams_contributors';
    const SONG_CPT  = 'achord_song_cpt';
    const CACHE_KEY = 'achord_top_contributors';

    /** תוויות תפקיד (עברית) */
    public static function role_labels() {
        return [
            'added'    => 'הוסיף/ה את השיר',
            'chords'   => 'תיקן/שיפר אקורדים',
            'notation' => 'הוסיף/ה תווים',
            'lesson'   => 'הוסיף/ה שיעור',
        ];
    }

    public function __construct() {
        // רישום: אישור הצעת עריכה (proposal pending → publish) = תיקון אקורדים ע"י המגיש
        add_action('transition_post_status', [$this, 'on_proposal_transition'], 20, 3);

        // רישום: הוספת/עדכון תווים או שיעור (כל מי ששומר את ה-meta, פרט לחשבון מערכת)
        add_action('added_post_meta',   [$this, 'on_song_meta'], 10, 4);
        add_action('updated_post_meta', [$this, 'on_song_meta'], 10, 4);

        // ניקוי cache של עמוד התורמים כשמשתנה תרומה
        add_action('updated_post_meta', [$this, 'maybe_bust_cache'], 10, 4);
        add_action('added_post_meta',   [$this, 'maybe_bust_cache'], 10, 4);

        // תצוגת קרדיט בתחתית עמוד השיר
        add_filter('the_content', [$this, 'append_song_credit'], 21);

        // shortcode לעמוד "תורמים"
        add_shortcode('achord_contributors', [$this, 'render_contributors_shortcode']);
    }

    // ─────────────────────────────────────────────
    // החרגת חשבונות מערכת
    // ─────────────────────────────────────────────

    /** מזהי משתמשים שלא מקבלים קרדיט (חשבון ייבוא/מערכת). ניתן לפילטור. */
    public static function system_ids() {
        return array_map('intval', (array) apply_filters('achord_contributor_system_ids', [1]));
    }

    public static function is_system_user($uid) {
        $uid = (int) $uid;
        return $uid <= 0 || in_array($uid, self::system_ids(), true);
    }

    // ─────────────────────────────────────────────
    // רישום תרומה
    // ─────────────────────────────────────────────

    /**
     * מתעד תרומה של משתמש לשיר בתפקיד מסוים (dedupe לפי uid+role).
     */
    public static function record($song_id, $user_id, $role) {
        $song_id = (int) $song_id;
        $user_id = (int) $user_id;
        if (!$song_id || self::is_system_user($user_id)) return;
        if (!array_key_exists($role, self::role_labels())) return;
        if (get_post_type($song_id) !== self::SONG_CPT) return;

        $list = get_post_meta($song_id, self::META_KEY, true);
        if (!is_array($list)) $list = [];

        foreach ($list as $entry) {
            if ((int) ($entry['uid'] ?? 0) === $user_id && ($entry['role'] ?? '') === $role) {
                return; // כבר קיים
            }
        }

        $list[] = ['uid' => $user_id, 'role' => $role, 'ts' => current_time('mysql')];
        update_post_meta($song_id, self::META_KEY, $list);
        delete_transient(self::CACHE_KEY);
    }

    /** הצעת עריכה אושרה → המגיש תרם תיקון אקורדים. */
    public function on_proposal_transition($new_status, $old_status, $post) {
        if (!$post || $post->post_type !== 'achord_edit_proposal') return;
        if ($old_status === 'pending' && $new_status === 'publish') {
            self::record((int) $post->post_parent, (int) $post->post_author, 'chords');
        }
    }

    /** נשמרו תווים/שיעור על שיר → רישום התפקיד למי ששמר. */
    public function on_song_meta($meta_id, $object_id, $meta_key, $meta_value) {
        if (get_post_type($object_id) !== self::SONG_CPT) return;

        $role = null;
        if ($meta_key === '_ams_abc_code') {
            $role = 'notation';
        } elseif ($meta_key === 'lesson_video_guitar' || $meta_key === 'lesson_video_piano') {
            $role = 'lesson';
        } else {
            return;
        }

        // ערך ריק (מחיקה) — לא רושמים
        if ($meta_value === '' || $meta_value === null) return;

        self::record((int) $object_id, get_current_user_id(), $role);
    }

    public function maybe_bust_cache($meta_id, $object_id, $meta_key, $meta_value) {
        if ($meta_key === self::META_KEY) delete_transient(self::CACHE_KEY);
    }

    // ─────────────────────────────────────────────
    // קריאה
    // ─────────────────────────────────────────────

    /**
     * מחזיר את תורמי השיר (לא-מערכת), ממוזגים מ-post_author + meta.
     * @return array<int,array{uid:int,name:string,roles:string[]}>  ממופתח לפי uid
     */
    public static function get_song_contributors($song_id) {
        $song_id = (int) $song_id;
        if (!$song_id) return [];

        $by_uid = []; // uid => ['uid'=>, 'name'=>, 'roles'=>[]]

        $add = function ($uid, $role) use (&$by_uid) {
            $uid = (int) $uid;
            if (self::is_system_user($uid)) return;
            if (!isset($by_uid[$uid])) {
                $u = get_userdata($uid);
                if (!$u) return;
                $by_uid[$uid] = ['uid' => $uid, 'name' => $u->display_name, 'roles' => []];
            }
            if (!in_array($role, $by_uid[$uid]['roles'], true)) {
                $by_uid[$uid]['roles'][] = $role;
            }
        };

        // מי שהוסיף את השיר
        $author = (int) get_post_field('post_author', $song_id);
        $add($author, 'added');

        // תפקידים שנרשמו
        $list = get_post_meta($song_id, self::META_KEY, true);
        if (is_array($list)) {
            foreach ($list as $entry) {
                $add($entry['uid'] ?? 0, $entry['role'] ?? '');
            }
        }

        return $by_uid;
    }

    /**
     * אגרגציה לעמוד "תורמים" — לכל תורם: שם, מס' שירים, פירוט תפקידים.
     * תוצאה ב-transient ל-10 דק'.
     */
    public static function get_top_contributors($limit = 100) {
        $cached = get_transient(self::CACHE_KEY);
        if (is_array($cached)) return array_slice($cached, 0, $limit);

        $agg = []; // uid => ['uid','name','songs'=>set,'roles'=>set]

        $touch = function ($uid) use (&$agg) {
            $uid = (int) $uid;
            if (self::is_system_user($uid)) return null;
            if (!isset($agg[$uid])) {
                $u = get_userdata($uid);
                if (!$u) return null;
                $agg[$uid] = ['uid' => $uid, 'name' => $u->display_name, 'songs' => [], 'roles' => []];
            }
            return $uid;
        };

        // שירים עם תרומות רשומות (מעט — זול)
        $song_ids = get_posts([
            'post_type'      => self::SONG_CPT,
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'meta_key'       => self::META_KEY,
            'no_found_rows'  => true,
        ]);

        foreach ($song_ids as $sid) {
            $list = get_post_meta($sid, self::META_KEY, true);
            if (!is_array($list)) continue;
            foreach ($list as $entry) {
                $uid = $touch($entry['uid'] ?? 0);
                if ($uid === null) continue;
                $agg[$uid]['songs'][$sid] = true;
                $role = $entry['role'] ?? '';
                if ($role) $agg[$uid]['roles'][$role] = true;
            }
        }

        // שירים שנוספו ע"י תורמים אמיתיים (post_author לא-מערכת)
        $authored = get_posts([
            'post_type'      => self::SONG_CPT,
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'author__not_in' => self::system_ids(),
            'no_found_rows'  => true,
        ]);
        foreach ($authored as $sid) {
            $uid = $touch((int) get_post_field('post_author', $sid));
            if ($uid === null) continue;
            $agg[$uid]['songs'][$sid] = true;
            $agg[$uid]['roles']['added'] = true;
        }

        // עיצוב סופי + מיון לפי מס' שירים
        $out = [];
        foreach ($agg as $uid => $d) {
            $out[] = [
                'uid'   => $uid,
                'name'  => $d['name'],
                'songs' => count($d['songs']),
                'roles' => array_keys($d['roles']),
            ];
        }
        usort($out, function ($a, $b) { return $b['songs'] <=> $a['songs']; });

        set_transient(self::CACHE_KEY, $out, 10 * MINUTE_IN_SECONDS);
        return array_slice($out, 0, $limit);
    }

    // ─────────────────────────────────────────────
    // תצוגה — קרדיט בעמוד שיר
    // ─────────────────────────────────────────────

    public function append_song_credit($content) {
        if (!is_singular(self::SONG_CPT) || !in_the_loop() || !is_main_query()) {
            return $content;
        }

        $contributors = self::get_song_contributors(get_the_ID());
        if (empty($contributors)) return $content; // אין תורמים אמיתיים → נקי

        $labels = self::role_labels();
        $items  = '';
        foreach ($contributors as $c) {
            $roles_txt = [];
            foreach ($c['roles'] as $r) {
                if (isset($labels[$r])) $roles_txt[] = $labels[$r];
            }
            $initial = function_exists('mb_substr') ? mb_substr($c['name'], 0, 1, 'UTF-8') : substr($c['name'], 0, 1);
            $items .= '<li class="achord-credit__person">'
                . '<span class="achord-credit__avatar" aria-hidden="true">' . esc_html($initial) . '</span>'
                . '<span class="achord-credit__meta">'
                . '<span class="achord-credit__name">' . esc_html($c['name']) . '</span>'
                . ($roles_txt ? '<span class="achord-credit__roles">' . esc_html(implode(' · ', $roles_txt)) . '</span>' : '')
                . '</span></li>';
        }

        $credit = '<aside class="achord-credit" dir="rtl" aria-label="תורמים לשיר">'
            . '<span class="achord-credit__title">תרמו לשיר הזה</span>'
            . '<ul class="achord-credit__list">' . $items . '</ul>'
            . '</aside>';

        return $content . $credit;
    }

    // ─────────────────────────────────────────────
    // תצוגה — עמוד "תורמים"
    // ─────────────────────────────────────────────

    public function render_contributors_shortcode($atts = []) {
        $atts = shortcode_atts(['limit' => 100], $atts, 'achord_contributors');
        $people = self::get_top_contributors((int) $atts['limit']);
        $labels = self::role_labels();

        ob_start();

        if (empty($people)) {
            echo '<div class="uc-contrib-empty">'
               . '<p class="uc-contrib-empty__title">עוד אין תורמים — היו הראשונים 🎸</p>'
               . '<p class="uc-contrib-empty__sub">כל שיר שתוסיפו, כל תיקון וכל שיעור — והשם שלכם יופיע כאן ובעמוד השיר.</p>'
               . '<a class="uc-btn uc-btn--primary" href="' . esc_url(home_url('/add-song/')) . '">הוסיפו שיר ראשון</a>'
               . '</div>';
            return ob_get_clean();
        }

        echo '<div class="uc-contrib-grid">';
        foreach ($people as $p) {
            $initial = function_exists('mb_substr') ? mb_substr($p['name'], 0, 1, 'UTF-8') : substr($p['name'], 0, 1);
            $tags = '';
            foreach ($p['roles'] as $r) {
                if (isset($labels[$r])) $tags .= '<span class="uc-contrib__tag">' . esc_html($labels[$r]) . '</span>';
            }
            echo '<div class="uc-contrib">'
               . '<span class="uc-contrib__avatar" aria-hidden="true">' . esc_html($initial) . '</span>'
               . '<span class="uc-contrib__name">' . esc_html($p['name']) . '</span>'
               . '<span class="uc-contrib__count">' . esc_html(number_format_i18n($p['songs'])) . ' שירים</span>'
               . ($tags ? '<span class="uc-contrib__tags">' . $tags . '</span>' : '')
               . '</div>';
        }
        echo '</div>';

        return ob_get_clean();
    }
}
