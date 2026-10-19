<?php
/*
Plugin Name: UC Schema.org (JSON-LD)
Description: Emits schema.org JSON-LD structured data in <head> for unichord song pages and the homepage, to improve Google visibility. No external HTTP requests, pure PHP + WordPress APIs.
Author: unichord
Version: 1.0.0
*/

// מנע גישה ישירה
if (!defined('ABSPATH')) exit;

/**
 * חילוץ הערך הראשון של shortcode פשוט מתוך תוכן הפוסט.
 * מחזיר מחרוזת מנוקה (trim), או '' אם לא נמצא / ריק.
 *
 * @param string $tag     שם התג, למשל 'song_title'
 * @param string $content תוכן הפוסט
 * @return string
 */
function uc_schema_extract($tag, $content) {
    // regex לא-חמדני עם דגל /s כדי לתפוס גם שורות מרובות
    $pattern = '/\[' . preg_quote($tag, '/') . '\](.*?)\[\/' . preg_quote($tag, '/') . '\]/s';
    if (preg_match($pattern, $content, $m) && isset($m[1])) {
        return trim($m[1]);
    }
    return '';
}

/**
 * מדפיס מערך אסוציאטיבי כבלוק JSON-LD.
 * wp_json_encode מטפל נכון ב-UTF-8 עברי ולא מוסיף לוכסנים.
 *
 * @param array $data
 * @return void
 */
function uc_schema_print($data) {
    $json = wp_json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return;
    }
    echo '<script type="application/ld+json">' . $json . '</script>' . "\n";
}

/**
 * ה-hook הראשי — מזריק JSON-LD ל-<head>.
 *
 * @return void
 */
function uc_schema_output() {
    // דלג לחלוטין בממשק ניהול או בפידים
    if (is_admin() || is_feed()) {
        return;
    }

    // ── עמוד שיר בודד ──────────────────────────────────────────────
    if (is_singular('achord_song_cpt')) {
        $post_id   = get_the_ID();
        $content   = get_post_field('post_content', $post_id);
        $permalink = get_permalink($post_id);

        // חילוץ שדות מתוך ה-shortcodes; נפילה לכותרת הפוסט
        $title = uc_schema_extract('song_title', $content);
        if ($title === '') {
            $title = get_the_title($post_id);
        }
        $performer = uc_schema_extract('performer', $content);
        $writer    = uc_schema_extract('writer', $content);

        // MusicComposition
        $composition = array(
            '@type'      => 'MusicComposition',
            'name'       => $title,
            'url'        => $permalink,
            'inLanguage' => 'he-IL',
        );
        if ($writer !== '') {
            $composition['composer'] = array('@type' => 'Person', 'name' => $writer);
            $composition['lyricist'] = array('@type' => 'Person', 'name' => $writer);
        }
        if ($performer !== '') {
            $composition['recordedAs'] = array(
                '@type'    => 'MusicRecording',
                'name'     => $title,
                'byArtist' => array('@type' => 'MusicGroup', 'name' => $performer),
            );
        }

        // BreadcrumbList: בית → שיר
        $breadcrumbs = array(
            '@type'           => 'BreadcrumbList',
            'itemListElement' => array(
                array(
                    '@type'    => 'ListItem',
                    'position' => 1,
                    'name'     => 'בית',
                    'item'     => home_url('/'),
                ),
                array(
                    '@type'    => 'ListItem',
                    'position' => 2,
                    'name'     => $title,
                    'item'     => $permalink,
                ),
            ),
        );

        // גרף אחד עם @context פעם אחת בראש
        uc_schema_print(array(
            '@context' => 'https://schema.org',
            '@graph'   => array($composition, $breadcrumbs),
        ));
        return;
    }

    // ── עמוד הבית ──────────────────────────────────────────────────
    if (is_front_page() || is_home()) {
        uc_schema_print(array(
            '@context'   => 'https://schema.org',
            '@type'      => 'WebSite',
            'name'       => 'unichord',
            'alternateName' => 'יוניקורד',
            'url'        => home_url('/'),
            'inLanguage' => 'he-IL',
        ));
        return;
    }
}
add_action('wp_head', 'uc_schema_output', 5);
