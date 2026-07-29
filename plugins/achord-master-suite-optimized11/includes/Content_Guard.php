<?php
/**
 * שכבת-הגנה על תוכן שמגיע ממשתמש ונשמר כ-post_content של שיר.
 *
 * ── הבעיה ──────────────────────────────────────────────────────────────────
 * תוכן השיר נשמר בתוך `[achord_song]…[/achord_song]` ועובר `do_shortcode`
 * בכל צפייה. לא `wp_kses_post` ולא `sanitize_textarea_field` נוגעים בסוגריים
 * מרובעים, ולכן `[/achord_song]` בתוך הטקסט **סוגר את השורטקוד העוטף מוקדם**
 * (הרג'קס של ליבת וורדפרס עוצר בסוגר הראשון), וכל מה שאחריו מורץ כשורטקוד
 * עצמאי — למשל `[achord_run_bulk_indexer]`, שסורק את כל השירים בכל טעינת עמוד
 * של מנהל.
 *
 * ── למה לא פשוט להבריח את כל הסוגריים ──────────────────────────────────────
 * כי **פורמט האקורדים עצמו בנוי על סוגריים**: `מילה[Am]`. נמדד על החי —
 * 1443 מתוך 1443 השירים המפורסמים מכילים אקורד בסוגריים. הברחה גורפת הייתה
 * הורסת את כל המאגר.
 *
 * ── הפתרון ─────────────────────────────────────────────────────────────────
 * נמחקות רק תגיות ש**שמן מוכר**: תגיות המבנה של השיר, או שורטקוד רשום בפועל.
 * `[Am]`, `[F#m7]`, `[G/B]` אינם שורטקודים רשומים ולכן אינם נפגעים.
 *
 * @package Achord_Master_Suite
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class AMS_Content_Guard {

    /**
     * תגיות המבנה של `[achord_song]`. הן נבנות בשרת בלבד ולעולם אינן
     * אמורות להגיע מהמשתמש. מקור: הרכבת ה-post_content ב-Ajax_Handler
     * וב-Notebook_Handler::build_public_song_content().
     */
    const STRUCTURAL_TAGS = [
        'achord_song', 'version', 'song_title', 'performer',
        'lyrics_by', 'music_by', 'writer', 'capo', 'youtube',
        'easy_transpose', 'tempo', 'strumming',
    ];

    /**
     * מסיר תגיות-מבנה ושורטקודים רשומים מתוך ערך שהתקבל מהמשתמש.
     * אקורדים בסוגריים נשארים כמו שהם.
     *
     * @param mixed $value ערך גולמי (מחרוזות בלבד מסוננות; שאר הטיפוסים חוזרים כמות שהם).
     * @return mixed
     */
    public static function strip_structural_tags( $value ) {
        if ( ! is_string( $value ) || strpos( $value, '[' ) === false ) {
            return $value;
        }

        // $shortcode_tags נקרא בזמן-ריצה ולא נשמר במטמון: התוסף רושם חלק
        // מהשורטקודים בהוקים מאוחרים, ורשימה שנתפסה מוקדם תחטיא אותם.
        global $shortcode_tags;
        $tags = array_unique( array_merge(
            self::STRUCTURAL_TAGS,
            array_keys( (array) $shortcode_tags )
        ) );

        $quoted = array_map(
            static function ( $tag ) { return preg_quote( $tag, '#' ); },
            array_filter( $tags, 'strlen' )
        );

        // `[tag …]` או `[/tag]`, עם רווחים אופציונליים. `\b` מבטיח שהתאמה
        // היא על שם התגית המלא — `[versions]` אינו `[version]`.
        $pattern = '#\[\s*/?\s*(?:' . implode( '|', $quoted ) . ')\b[^\]]*\]#i';
        $clean   = preg_replace( $pattern, '', $value );

        // כשל regex (backtrack limit על קלט ענק) — נכשלים סגור: מוותרים על
        // הסוגריים ולא מעבירים הלאה מחרוזת לא-מסוננת.
        if ( null === $clean ) {
            return str_replace( [ '[', ']' ], '', $value );
        }

        return $clean;
    }

    /**
     * גרסת-נוחות למספר שדות בבת-אחת. מחזירה מערך באותו סדר המפתחות.
     *
     * @param array $values
     * @return array
     */
    public static function strip_structural_tags_deep( array $values ) {
        return array_map( [ __CLASS__, 'strip_structural_tags' ], $values );
    }
}
