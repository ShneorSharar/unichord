<?php
// אבטחה: מניעת גישה ישירה
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Class AMS_Shortcode_Handler
 * מרכז את הרישום והלוגיקה של כל השורטקודים של המערכת.
 */
class AMS_Shortcode_Handler {

    public function __construct() {
        // הסרת שורטקודים ישנים אם קיימים למניעת כפילויות
        $this->remove_old_shortcodes();

        // רישום כל השורטקודים החדשים
        add_shortcode('achord_song', [$this, 'render_song_shortcode']);
        add_shortcode('achord_categorized_accordion', [$this, 'render_accordion_shortcode']);
        add_shortcode('achord_lessons_accordion', [$this, 'render_accordion_shortcode']);
        add_shortcode('achord_tavim_accordion', [$this, 'render_accordion_shortcode']);
        add_shortcode('achord_related_posts', [$this, 'render_related_posts_shortcode']);
        add_shortcode('achord_upload_song', [$this, 'render_upload_form_shortcode']);
// ✚ Add: Song Index shortcode
add_shortcode('achord_song_index', [$this, 'render_song_index_shortcode']);

// ✚ Add: Search Form shortcodes (Simple & Advanced)
add_shortcode('achord_song_search', [$this, 'render_simple_search_form_shortcode']);
add_shortcode('achord_song_search_advanced', [$this, 'render_search_form_shortcode']);

add_shortcode('achord_my_versions',       [$this, 'render_my_versions_shortcode']);
add_shortcode('achord_review_proposals',  [$this, 'render_review_proposals_shortcode']);
add_shortcode('achord_saved_songs',       [$this, 'render_saved_songs_shortcode']);
add_shortcode('achord_user_profile',      [$this, 'render_user_profile_shortcode']);
add_shortcode('achord_tunes_library',     [$this, 'render_tunes_library_shortcode']);

add_shortcode('achord_run_bulk_indexer', function() {
    if (!current_user_can('manage_options')) return 'אין לך הרשאה.';
    
    $songs = get_posts(['post_type' => 'achord_song_cpt', 'numberposts' => -1]);
    $count = 0;
    foreach ($songs as $song) {
        Achord_Master_Suite::instance()->setup_handler->index_song_data_on_save($song->ID, $song, true);
        $count++;
    }
    return "✅ האינדקס עודכן בהצלחה! סונכרנו {$count} שירים.";
});
    }

    private function remove_old_shortcodes() {
        $legacy_functions = ['achord_render_song_v30'];
        foreach ($legacy_functions as $func) {
            if (function_exists($func)) {
                remove_shortcode('achord_song');
            }
        }
    }
// הוסף את כל הבלוק הזה לפני render_song_shortcode
    private function format_song_content_advanced($text) {
        $text = strip_tags($text);
        $lines = preg_split('/\r\n|\r|\n/', trim($text));
        $output = '';
        $lineCount = count($lines);
        $li = 0;

        while ($li < $lineCount) {
            $line = $lines[$li];
            $trimmed_line = trim($line);

            // בלוק טאבלטורה (טאבים) — יישור מונוספייס LTR, מנותק מהטוקנייזר של המילים/אקורדים
            if ($trimmed_line !== '' && $this->is_tab_line($trimmed_line)) {
                $output .= "<div class='achord-tab-block' dir='ltr'>";
                while ($li < $lineCount) {
                    $tl = trim($lines[$li]);
                    if ($tl === '' || !$this->is_tab_line($tl)) break;
                    // נרמול em/en-dash חזרה למקף (wptexturize/OCR הפכו --- ל-— בטאב)
                    $tl = preg_replace('/[\x{2013}\x{2014}]/u', '-', $tl);
                    $output .= "<div class='achord-tab-line'>".esc_html($tl)."</div>";
                    $li++;
                }
                $output .= "</div>";
                continue;
            }

            if (empty($trimmed_line)) {
                $output .= "<div class='achord-line'>&nbsp;</div>";
                $li++;
                continue;
            }
            
            $htmlLine = '';

            // כל טוקן = רצף רציף ללא רווחים (מילה, אקורד, או מילה עם אקורדים בתוכה: המ[Eb]רצע[A])
            $tokens = preg_split('/\s+/u', $trimmed_line);

            foreach ($tokens as $part) {
                if ($part === '') continue;

                // פירוק הטוקן לרצף פריטי טקסט/אקורד
                preg_match_all('/\[([^\]]+)\]|([^\[\]]+)/u', $part, $m, PREG_SET_ORDER);
                $items = [];
                foreach ($m as $it) {
                    if (isset($it[1]) && $it[1] !== '') {
                        $items[] = ['chord', $it[1]];
                    } elseif (isset($it[2]) && $it[2] !== '') {
                        $items[] = ['text', $it[2]];
                    }
                }
                if (empty($items)) continue;

                $n = count($items);
                $allChords = true;
                foreach ($items as $it) { if ($it[0] === 'text') { $allChords = false; break; } }

                // אקורד(ים) עצמאיים - [Am]
                if ($allChords) {
                    foreach ($items as $it) {
                        $chord = $it[1];
                        $htmlLine .= "<span class='achord-word-group'>";
                        $htmlLine .= "<span class='achord-chord' data-original='".esc_attr($chord)."' data-current='".esc_attr($chord)."'>".esc_html($chord)."</span>";
                        $htmlLine .= "<span class='achord-lyrics'>&nbsp;</span></span> ";
                    }
                }
                // מילה רגילה
                elseif ($n === 1) {
                    $htmlLine .= "<span class='achord-word-group'>";
                    $htmlLine .= "<span class='achord-chord achord-placeholder-chord'>&nbsp;</span>";
                    $htmlLine .= "<span class='achord-lyrics'>".esc_html($items[0][1])."</span></span> ";
                }
                // מילה עם אקורד בסופה - מילה[Am]
                elseif ($n === 2 && $items[0][0] === 'text' && $items[1][0] === 'chord') {
                    $htmlLine .= "<span class='achord-word-group'>";
                    $htmlLine .= "<span class='achord-chord' data-original='".esc_attr($items[1][1])."' data-current='".esc_attr($items[1][1])."'>".esc_html($items[1][1])."</span>";
                    $htmlLine .= "<span class='achord-lyrics'>".esc_html($items[0][1])."</span></span> ";
                }
                // פורמט ישן [Am]מילה - אקורד עצמאי ואז המילה (התנהגות קיימת)
                elseif ($n === 2 && $items[0][0] === 'chord' && $items[1][0] === 'text') {
                    $chord = $items[0][1];
                    $htmlLine .= "<span class='achord-word-group'>";
                    $htmlLine .= "<span class='achord-chord' data-original='".esc_attr($chord)."' data-current='".esc_attr($chord)."'>".esc_html($chord)."</span>";
                    $htmlLine .= "<span class='achord-lyrics'>&nbsp;</span></span> ";
                    $htmlLine .= "<span class='achord-word-group'>";
                    $htmlLine .= "<span class='achord-chord achord-placeholder-chord'>&nbsp;</span>";
                    $htmlLine .= "<span class='achord-lyrics'>".esc_html($items[1][1])."</span></span> ";
                }
                // אקורד באמצע מילה - המ[Eb]רצע[A]: המילה מוצגת רציפה, כל אקורד מעל ההברה שלו
                else {
                    $htmlLine .= "<span class='achord-word-group achord-midword'>";
                    $htmlLine .= "<span class='achord-chord achord-placeholder-chord'>&nbsp;</span>";
                    $htmlLine .= "<span class='achord-lyrics'>";
                    $i = 0;
                    while ($i < $n) {
                        if ($items[$i][0] === 'text') {
                            $segHtml = esc_html($items[$i][1]);
                            if ($i + 1 < $n && $items[$i + 1][0] === 'chord') {
                                $chord = $items[$i + 1][1];
                                $segHtml .= "<span class='achord-chord' data-original='".esc_attr($chord)."' data-current='".esc_attr($chord)."'>".esc_html($chord)."</span>";
                                $i += 2;
                            } else {
                                $i += 1;
                            }
                            $htmlLine .= "<span class='achord-seg'>".$segHtml."</span>";
                        } else {
                            // אקורד ללא הברה לפניו (נדיר) - עוגן ברוחב-אפס בתחילת המילה
                            $chord = $items[$i][1];
                            $htmlLine .= "<span class='achord-seg achord-seg-bare'><span class='achord-chord' data-original='".esc_attr($chord)."' data-current='".esc_attr($chord)."'>".esc_html($chord)."</span></span>";
                            $i += 1;
                        }
                    }
                    $htmlLine .= "</span></span> ";
                }
            }
            
            $output .= "<div class='achord-line'>".trim($htmlLine)."</div>";
            $li++;
        }

        return $output;
    }

    // זיהוי שורת טאבלטורת גיטרה: מתחילה בשם מיתר (e/B/G/D/A/E), אופציונלית '|', ואז תוכן-טאב;
    // מחייב לפחות 4 מקפים (כולל en/em-dash) כדי למנוע התאמות-שווא בשורות מילים.
    private function is_tab_line($s) {
        if (!preg_match('/^[eEBGDA][ \t]*\|?[-\x{2013}\x{2014}\d]/u', $s)) return false;
        return preg_match_all('/[-\x{2013}\x{2014}]/u', $s) >= 4;
    }
    
public function render_song_shortcode($atts, $content = '') {

        $atts = shortcode_atts([

            'easy_transpose_semitones' => null,

            'capo' => 0,

            'version_easy' => ''

        ], $atts, 'achord_song');

        

        // חילוץ נתונים

        preg_match('/\[song_title\](.*?)\[\/song_title\]/s', $content, $titleMatch);

        preg_match('/\[performer\](.*?)\[\/performer\]/s', $content, $performerMatch);

        preg_match('/\[writer\](.*?)\[\/writer\]/s', $content, $writerMatch);

        preg_match('/\[lyrics_by\](.*?)\[\/lyrics_by\]/s', $content, $lyricsByMatch);

        preg_match('/\[music_by\](.*?)\[\/music_by\]/s', $content, $musicByMatch);

        preg_match('/\[youtube\](.*?)\[\/youtube\]/s', $content, $youtubeMatch);

        preg_match('/\[version=normal\](.*?)\[\/version\]/s', $content, $normalMatch);

        preg_match('/\[version=easy\](.*?)\[\/version\]/s', $content, $easyMatch);

        preg_match('/\[easy_transpose\](.*?)\[\/easy_transpose\]/s', $content, $easyTransposeMatch);

        preg_match('/\[capo\](.*?)\[\/capo\]/s', $content, $capoMatch);

        preg_match('/\[tempo\](.*?)\[\/tempo\]/s', $content, $tempoMatch);

        preg_match('/\[strumming\](.*?)\[\/strumming\]/s', $content, $strummingMatch);



        $tempo = isset($tempoMatch[1]) ? intval(trim($tempoMatch[1])) : null;

        $strumming = isset($strummingMatch[1]) ? esc_html(trim($strummingMatch[1])) : '';

        $title = isset($titleMatch[1]) ? esc_html(trim($titleMatch[1])) : '';

        $performer = isset($performerMatch[1]) ? esc_html(trim($performerMatch[1])) : '';

        $writer = isset($writerMatch[1]) ? esc_html(trim($writerMatch[1])) : '';

        $lyrics_by = isset($lyricsByMatch[1]) ? esc_html(trim($lyricsByMatch[1])) : '';

        $music_by = isset($musicByMatch[1]) ? esc_html(trim($musicByMatch[1])) : '';

        $youtube_original = isset($youtubeMatch[1]) ? esc_url(trim($youtubeMatch[1])) : '';

        $baseCapo = isset($capoMatch[1]) ? floatval(trim($capoMatch[1])) : 0;

        

        $easyTranspose = 0;

        if (isset($easyTransposeMatch[1])) $easyTranspose = floatval(trim($easyTransposeMatch[1]));

        

        $normalRawText = isset($normalMatch[1]) ? trim($normalMatch[1]) : '';

        $easyRawText = isset($easyMatch[1]) ? trim($easyMatch[1]) : '';

        

        $normal = $normalRawText ? $this->format_song_content_advanced($normalRawText) : '';

        $easy = (!empty($easyRawText)) ? $this->format_song_content_advanced($easyRawText) : ((!empty($atts['version_easy'])) ? $this->format_song_content_advanced($atts['version_easy']) : (($easyTranspose != 0) ? $normal : ''));

        // האם יש תוכן אקורדים — קובע אם להציג סרגל כלים וטאב אקורדים
        $has_chords = !empty($normal);



        // נתוני טאבים

        $post_id = get_the_ID();

        // גרסה אישית: אם המשתמש מחובר ויש לו גרסה משלו — נדרוס את הגרסה הקנונית
        $has_personal_version = false;
        if (is_user_logged_in() && $post_id) {
            $personal_post = AMS_Personal_Version_Handler::get_personal_version($post_id);
            if ($personal_post) {
                $has_personal_version = true;
                $normalRawText        = $personal_post->post_content;
                $normal               = $this->format_song_content_advanced($normalRawText);
                // שמירת $has_chords מהגרסה הקנונית — ✏️ נשאר גלוי גם אם הגרסה האישית ריקה
                if (!empty($normal)) $has_chords = true;
            }
        }

        // גרסה משותפת: אם יש query params של shared_version + share_token — טען את הגרסה המשותפת
        $is_shared_view = false;
        $shared_by_name = '';
        if ($post_id) {
            $shared_song_id = isset($_GET['shared_version']) ? intval($_GET['shared_version']) : 0;
            $share_token    = isset($_GET['share_token'])    ? sanitize_text_field($_GET['share_token']) : '';
            if ($shared_song_id === $post_id && $share_token) {
                $shared_post = AMS_Personal_Version_Handler::get_by_share_token($post_id, $share_token);
                if ($shared_post) {
                    $is_shared_view = true;
                    $normalRawText  = $shared_post->post_content;
                    $normal         = $this->format_song_content_advanced($normalRawText);
                    $author         = get_userdata($shared_post->post_author);
                    $shared_by_name = $author ? $author->display_name : '';
                    if (!empty($normal)) $has_chords = true;
                }
            }
        }

        // מקור-גולמי נקי לתיבת-העריכה (data-song-raw):
        // הגרסה האישית/משותפת כבר גולמית (מ-post_content). הגרסה הקנונית הגיעה דרך the_content
        // → wpautop/wptexturize הזריקו <br>/<p>/ישויות (&#8211; וכו') ל-$normalRawText. התצוגה מנקה עם strip_tags,
        // אבל data-song-raw לא — אז קוראים את גוף-version=normal ישירות מה-DB הגולמי (context=raw, ללא פילטרים).
        if ($has_personal_version || $is_shared_view) {
            $editRawText = $normalRawText;
        } else {
            $rawStored = $post_id ? get_post_field('post_content', $post_id, 'raw') : '';
            $editRawText = ($rawStored && preg_match('/\[version=normal\](.*?)\[\/version\]/s', $rawStored, $rawNormalMatch))
                ? trim($rawNormalMatch[1])
                : $normalRawText;
        }

        // בדיקה אם למשתמש יש הצעת עריכה ממתינה לשיר זה
        $has_pending_proposal = false;
        if (is_user_logged_in() && $post_id) {
            $pending_proposals = get_posts([
                'post_type'      => AMS_Edit_Proposal_Handler::CPT,
                'author'         => get_current_user_id(),
                'post_parent'    => $post_id,
                'post_status'    => 'pending',
                'posts_per_page' => 1,
                'no_found_rows'  => true,
            ]);
            $has_pending_proposal = !empty($pending_proposals);
        }

        $lesson_guitar = get_post_meta($post_id, 'lesson_video_guitar', true);

        if (!$lesson_guitar) $lesson_guitar = get_post_meta($post_id, 'lesson_video', true); // Legacy fallback

        

        $lesson_piano = get_post_meta($post_id, 'lesson_video_piano', true);

        $abc_code = get_post_meta($post_id, '_ams_abc_code', true);

        // קביעת הטאב הראשון הפעיל — אקורדים אם קיים, אחרת הראשון שיש
        if ($has_chords) {
            $first_tab = 'chords';
        } elseif ($youtube_original) {
            $first_tab = 'original';
        } elseif ($lesson_guitar) {
            $first_tab = 'lesson_guitar';
        } elseif ($lesson_piano) {
            $first_tab = 'lesson_piano';
        } elseif ($abc_code) {
            $first_tab = 'score';
        } else {
            $first_tab = 'chords';
        }

        ob_start();

        ?>

        <div class="achord-song-wrapper"

             dir="rtl"

             data-transpose-current="0"

             data-base-capo="<?php echo esc_attr($baseCapo); ?>"

             data-easy-transpose="<?php echo esc_attr($easyTranspose * 2); ?>"

             data-post-id="<?php echo esc_attr($post_id); ?>"

             data-is-logged-in="<?php echo is_user_logged_in() ? '1' : '0'; ?>"

             data-has-personal="<?php echo $has_personal_version ? '1' : '0'; ?>"

             data-has-pending-proposal="<?php echo $has_pending_proposal ? '1' : '0'; ?>"

             data-is-saved="<?php echo (is_user_logged_in() && AMS_Saved_Songs_Handler::is_saved($post_id)) ? '1' : '0'; ?>"

             data-song-raw="<?php echo esc_attr($editRawText); ?>"

             data-easy-start="<?php echo (Achord_Master_Suite::easy_mode_on() && !empty($easy) && get_post_meta($post_id, '_ams_is_easy', true) === '1') ? '1' : '0'; ?>">
            <script>
            /* מונע הבהוב-תמה (FOUC): מחיל את מחלקת-התמה + dark-mode מ-localStorage באופן
               סינכרוני, לפני הצביעה הראשונה — כך האקורדים כחולים והתמה נכונה כבר מהפריים
               הראשון, במקום להמתין ש-main.js (רץ אחרי jQuery, ~שנייה) יוסיף את המחלקות.
               initTheme/initDarkMode ב-main.js מאשררים בדיוק אותו מצב → אין קפיצה. */
            (function(){
                var w = document.currentScript.parentElement;
                try {
                    var t = localStorage.getItem('achordTheme');
                    w.classList.add(t === 'theme-studio' ? 'theme-studio' : 'theme-conductor');
                    if (localStorage.getItem('achordDarkMode') === 'enabled') w.classList.add('dark-mode');
                } catch(e) { w.classList.add('theme-conductor'); }
            })();
            </script>

            

            <div class="achord-song">

                <header class="achord-header">

                    <?php if ($title): ?><h1 class="achord-title"><?php echo $title; ?></h1><?php endif; ?>

                    <?php if ($performer): ?><h2 class="achord-performer"><?php echo $performer; ?></h2><?php endif; ?>

                    <?php if ($lyrics_by || $music_by): ?>

                        <p class="achord-writer">

                            <?php if ($lyrics_by): ?>מילים: <?php echo $lyrics_by; ?><?php endif; ?>

                            <?php if ($lyrics_by && $music_by): ?> | <?php endif; ?>

                            <?php if ($music_by): ?>לחן: <?php echo $music_by; ?><?php endif; ?>

                        </p>

                    <?php elseif ($writer): ?>

                        <p class="achord-writer">מילים ולחן: <?php echo $writer; ?></p>

                    <?php endif; ?>

                    <?php if ($tempo || $strumming): ?>

                        <p class="achord-song-details">

                            <?php if ($tempo): ?>קצב: <?php echo $tempo; ?> BPM<?php endif; ?>

                            <?php if ($tempo && $strumming): ?> | <?php endif; ?>

                            <?php if ($strumming): ?>פריטה: <?php echo $strumming; ?><?php endif; ?>

                        </p>

                    <?php endif; ?>

                    <?php if ($is_shared_view && $shared_by_name): ?>
                    <div class="ams-shared-banner">
                        🔗 גרסה אישית של <strong><?php echo esc_html($shared_by_name); ?></strong>
                        <a href="<?php echo esc_url(get_permalink($post_id)); ?>" class="ams-shared-back">← לגרסה הרשמית</a>
                    </div>
                    <?php endif; ?>

                </header>



                <div class="achord-tabs-nav">

                    <?php if ($has_chords): ?><button type="button" class="tab-btn <?php echo $first_tab === 'chords' ? 'active' : ''; ?>" data-tab="chords">🎸 אקורדים</button><?php endif; ?>

                    <?php if ($youtube_original): ?><button type="button" class="tab-btn <?php echo $first_tab === 'original' ? 'active' : ''; ?>" data-tab="original">🎧 שיר מקורי</button><?php endif; ?>

                    <?php if ($lesson_guitar): ?><button type="button" class="tab-btn <?php echo $first_tab === 'lesson_guitar' ? 'active' : ''; ?>" data-tab="lesson_guitar">🎸 שיעור גיטרה</button><?php endif; ?>

                    <?php if ($lesson_piano): ?><button type="button" class="tab-btn <?php echo $first_tab === 'lesson_piano' ? 'active' : ''; ?>" data-tab="lesson_piano">🎹 שיעור פסנתר</button><?php endif; ?>

                    <?php if ($abc_code): ?><button type="button" class="tab-btn <?php echo $first_tab === 'score' ? 'active' : ''; ?>" data-tab="score">🎼 תווים</button><?php endif; ?>

                </div>



                <?php if ($has_chords): ?>
                <div id="tab-chords" class="achord-tab-content <?php echo $first_tab === 'chords' ? 'active' : ''; ?>">

                    <div class="achord-content" id="achord-content-area">

                        <?php echo $this->get_barre_badge( $post_id ); ?>

                        <div class="achord-version" data-version="normal"><?php echo $normal; ?></div>

                        <div class="achord-version" data-version="easy" style="display:none;"><?php echo $easy; ?></div>

                    </div>

                </div>
                <?php endif; ?>



                <?php
                /* --- פונקציית עזר: נגן מהיר וקל (Lazy Load) --- */
                $render_clean_player = function($url) {
                    // חילוץ ID יעיל
                    $pattern = '%(?:youtube(?:-nocookie)?\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)/|.*[?&]v=)|youtu\.be/)([^"&?/ ]{11})%i';
                    if (preg_match($pattern, $url, $match)) {
                        $video_id = $match[1];
                        // בניית IFRAME ידנית
                        // loading="lazy" -> מונע טעינה כבדה עד שהמשתמש צופה
                        return '<iframe 
                            src="https://www.youtube.com/embed/' . esc_attr($video_id) . '?rel=0&modestbranding=1" 
                            frameborder="0" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowfullscreen
                            loading="lazy"
                        ></iframe>';
                    }
                    return '';
                };
                ?>

                <?php if ($youtube_original): ?>
                <div id="tab-original" class="achord-tab-content video-tab <?php echo $first_tab === 'original' ? 'active' : ''; ?>"<?php echo $first_tab === 'original' ? '' : ' style="display:none;"'; ?>>
                    <div class="achord-clean-embed">
                        <?php echo $render_clean_player($youtube_original); ?>
                    </div>
                </div>
                <?php endif; ?>

                <?php if ($lesson_guitar): ?>
                <div id="tab-lesson_guitar" class="achord-tab-content video-tab <?php echo $first_tab === 'lesson_guitar' ? 'active' : ''; ?>"<?php echo $first_tab === 'lesson_guitar' ? '' : ' style="display:none;"'; ?>>
                    <div class="achord-clean-embed">
                        <?php echo $render_clean_player($lesson_guitar); ?>
                    </div>
                </div>
                <?php endif; ?>

                <?php if ($lesson_piano): ?>
                <div id="tab-lesson_piano" class="achord-tab-content video-tab <?php echo $first_tab === 'lesson_piano' ? 'active' : ''; ?>"<?php echo $first_tab === 'lesson_piano' ? '' : ' style="display:none;"'; ?>>
                    <div class="achord-clean-embed">
                        <?php echo $render_clean_player($lesson_piano); ?>
                    </div>
                </div>
                <?php endif; ?>



                <?php if ($abc_code): ?>
                <div id="tab-score" class="achord-tab-content <?php echo $first_tab === 'score' ? 'active' : ''; ?>"<?php echo $first_tab === 'score' ? '' : ' style="display:none;"'; ?>>
                    <div class="tavim-wrapper" style="margin-top:20px;">
                        <div class="tavim-notation"></div>
                        <div class="tavim-controls">
                            <button id="tavim-play" class="button">נגן ▶️</button>
                            <button id="tavim-pause" class="button">השהה ⏸️</button>
                            <button id="tavim-stop" class="button">עצור ⏹️</button>
                            
                            <button id="tavim-tempo" class="button">קצב 🎵</button>
                            
                            <div class="tempo-controls hidden" style="display:inline-flex; align-items:center; gap:10px; margin-right:10px;">
                                <div class="tempo-display">טמפו: <span class="tempo-value"><?php echo $tempo ? $tempo : 120; ?></span> BPM</div>
                                <input type="range" id="tempo-slider" class="tempo-slider" min="40" max="240" value="<?php echo $tempo ? $tempo : 120; ?>">
                            </div>
                            
                            <span id="metronome-icon" class="metronome-icon" style="margin-right:auto;"></span>
                        </div>
                    </div>
                    <script>
                        window.tavimProPlusData = { abc: <?php echo wp_json_encode($abc_code); ?>, tempo: <?php echo intval($tempo ? $tempo : 120); ?>, autoPlay: false };
                    </script>
                </div>
                <?php endif; ?>



                <div id="achord-popup" class="achord-popup hidden">

                    <div class="achord-popup-content"><span class="achord-close">✖</span><div id="achord-diagram"></div></div>

                </div>

            </div>



            <div class="achord-bottom-controls-cluster">

                <div class="achord-options-drawer" id="achord-options-drawer">

                    <div class="drawer-head">
                        <span class="drawer-head-title">אפשרויות</span>
                        <button type="button" class="drawer-close-btn" id="achord-options-close" aria-label="סגירת האפשרויות" title="סגירה">&times;</button>
                    </div>

                     <div class="drawer-grid">

                        <div class="drawer-group">

                            <span class="drawer-label">תצוגה</span>

                            <div class="drawer-buttons-row">

                                <button type="button" class="drawer-button" id="achord-font-decrease" title="הקטן גופן">א-</button>

                                <button type="button" class="drawer-button" id="achord-font-increase" title="הגדל גופן">א+</button>

                                <button type="button" class="drawer-button icon-button" id="achord-dark-mode" title="מצב לילה">🌙</button>

                                <button type="button" class="drawer-button icon-button" id="achord-toggle-theme" title="החלף ערכת עיצוב">🎨</button>

                                <button type="button" class="drawer-button icon-button" id="achord-print" title="הדפסה">🖨️</button>

                                <button type="button" class="drawer-button icon-button" id="uc-save-offline" title="שמור לצפייה לא מקוונת" aria-label="שמור לצפייה לא מקוונת"><svg class="uc-ic uc-ic-save" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg><svg class="uc-ic uc-ic-saved" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button>

                                <button type="button" class="drawer-button icon-button" id="uc-offline-manage" title="שירים שמורים במכשיר" aria-label="שירים שמורים במכשיר"><svg class="uc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></button>

                            </div>

                        </div>


                        <div class="drawer-combined-row">

                            <div class="drawer-group">

                                <span class="drawer-label">כלי נגינה</span>

                                <div class="drawer-buttons-row"><button type="button" class="drawer-button icon-button" id="achord-toggle-instrument" title="החלף כלי נגינה">🎸</button></div>

                            </div>

                            <div class="drawer-group">

                                <span class="drawer-label">גופן 'אות חיים'</span>

                                <div class="drawer-buttons-row"><button type="button" class="drawer-button" id="achord-open-font-drawer-btn">בחר גופן</button></div>

                            </div>

                        </div>

                        <div class="drawer-group">

                            <span class="drawer-label">קישורים</span>

                            <div class="drawer-buttons-row">

                                <?php if ($youtube_original): ?><button type="button" class="drawer-button special-link" onclick="document.querySelector('.tab-btn[data-tab=\'original\']').click();">לשיר המקורי</button><?php endif; ?>

                                <?php if ($lesson_guitar): ?><button type="button" class="drawer-button special-link" onclick="document.querySelector('.tab-btn[data-tab=\'lesson_guitar\']').click();">שיעור גיטרה</button><?php endif; ?>

                                <?php if ($lesson_piano): ?><button type="button" class="drawer-button special-link" onclick="document.querySelector('.tab-btn[data-tab=\'lesson_piano\']').click();">שיעור פסנתר</button><?php endif; ?>

                                <button type="button" class="drawer-button" id="achord-share-song" title="שתף שיר זה"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-inline-start:5px"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path></svg>שתף</button>

                            </div>

                        </div>

                        <?php if (is_user_logged_in() && $has_chords): ?>
                        <div class="drawer-group">

                            <span class="drawer-label">גרסה שלי</span>

                            <div class="drawer-buttons-row">

                                <button type="button" class="drawer-button <?php echo $has_personal_version ? 'has-personal' : ''; ?>" id="achord-personal-edit" title="ערוך גרסה אישית">✏️ ערוך</button>

                                <?php if ($has_personal_version): ?>
                                <button type="button" class="drawer-button" id="achord-share-personal" title="שתף גרסה אישית">🔗 שתף</button>
                                <?php endif; ?>

                            </div>

                        </div>
                        <?php endif; ?>

                    </div>

                </div>

                <div class="achord-options-drawer" id="achord-font-selector-drawer">

                    <div class="new-drawer-body">

                         <button id="achord-close-font-drawer-btn" class="font-drawer-close-btn">✖</button>

                        <div class="new-drawer-header"><h4>פרויקט אות.חיים</h4></div>

                        <div class="new-drawer-content">

                            <p>בחרו גופן מהרשימה כדי לשנות את תצוגת השיר. לחצו על סמל המידע ⓘ שליד כל שם כדי לעבור לעמוד ההנצחה.</p>

                            <a href="https://ot-hayim.co.il/" target="_blank" rel="noopener" class="drawer-button">לאתר הראשי של המיזם</a>

                        </div>

                        <div class="new-drawer-selector-wrapper"><div class="font-list-loader"></div><ul id="oot-haim-font-list" class="new-drawer-font-list hidden"></ul></div>

                    </div>

                </div>



                <div class="achord-main-controls">

                    <div class="control-row">

                        <?php if ($has_chords): ?>

                        <button type="button" class="control-button" id="achord-transpose-down" title="הורד חצי טון">♭</button>

                        <span class="control-info" id="achord-transpose-info">0</span>

                        <button type="button" class="control-button" id="achord-transpose-up" title="העלה חצי טון">♯</button>

                        <span class="control-info" id="achord-capo-info">קאפו <?php echo esc_html($baseCapo); ?></span>

                        <?php if (!empty($easy) || $easyTranspose != 0): ?>

                        <button type="button" class="control-button" id="achord-toggle-version" title="גרסה קלה">★</button>

                        <?php endif; ?>

                        <button type="button" class="control-button" id="achord-chord-strip-toggle" title="הצג רשימת אקורדים">🎵</button>

                        <?php endif; ?>

                        <?php if (is_user_logged_in()): ?>
                        <button type="button"
                            class="control-button ams-save-btn <?php echo AMS_Saved_Songs_Handler::is_saved($post_id) ? 'is-saved' : ''; ?>"
                            id="achord-save-song"
                            aria-label="מועדפים"
                            title="מועדפים — שמור שיר זה לרשימה שלך"><svg class="ams-bookmark-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z"/></svg></button>
                        <?php endif; ?>


                        <button type="button" class="control-button" id="achord-options-toggle" title="אפשרויות" aria-label="אפשרויות" aria-expanded="false" aria-controls="achord-options-drawer"><svg class="uc-ic-dots" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="19" cy="12" r="2.1"/></svg><svg class="uc-ic-x" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>

                    </div>

                    <div class="control-row scroll-controls">

                        <button type="button" class="control-button" id="achord-scroll-down" title="האט גלילה">-</button>

                        <button type="button" class="control-button" id="achord-scroll-toggle" title="נגן/השהה">▶️</button>

                        <button type="button" class="control-button" id="achord-scroll-up" title="הגבר גלילה">+</button>

                    </div>

                </div>

            </div>

            <?php if (is_user_logged_in() && $has_chords): ?>
            <div class="achord-personal-modal" id="achord-personal-modal" hidden>
                <div class="achord-personal-modal-inner">
                    <div class="achord-personal-modal-header">
                        <h3>✏️ עריכת השיר — הגרסה שלך</h3>
                        <button type="button" class="achord-personal-modal-close" id="achord-personal-modal-close">✖</button>
                    </div>
                    <p class="achord-personal-modal-hint">ערוך את האקורדים בפורמט: <code>מילה[Am]</code>, ואז בחר:
                        <strong>🔒 גרסה אישית</strong> = פרטי, רק במחברת שלך · <strong>🌐 הצע תיקון</strong> = יישלח לאישור ויעדכן את כולם.
                        <em>(זה לא קשור לכפתור המועדפים ★)</em></p>
                    <textarea class="achord-personal-textarea" id="achord-personal-textarea" rows="14" dir="rtl" spellcheck="false"></textarea>

                    <input type="text" class="achord-proposal-note" id="achord-personal-note" dir="rtl"
                           placeholder="הערה קצרה לעורך — רלוונטי רק ל'הצע תיקון לכולם' (לא חובה)" maxlength="200" />

                    <div class="achord-save-bar" role="group" aria-label="שמירת הגרסה">
                        <button type="button" class="achord-save-bar__btn achord-save-bar__btn--personal" id="achord-personal-save">
                            <span class="achord-save-bar__title">🔒 שמור גרסה אישית</span>
                            <span class="achord-save-bar__sub">רק אצלך — תחליף את מה שאתה רואה בשיר הזה</span>
                        </button>
                        <button type="button" class="achord-save-bar__btn achord-save-bar__btn--public" id="achord-personal-propose">
                            <span class="achord-save-bar__title">🌐 הצע תיקון לכולם</span>
                            <span class="achord-save-bar__sub">יישלח לאישור; אם יאושר — יעדכן את הגרסה הרשמית. נשמר גם אצלך.</span>
                        </button>
                    </div>
                    <div class="achord-personal-modal-actions">
                        <?php if ($has_personal_version): ?>
                        <button type="button" class="achord-personal-btn-reset" id="achord-personal-reset">חזור למקורי</button>
                        <?php else: ?>
                        <button type="button" class="achord-personal-btn-reset" id="achord-personal-reset" style="display:none;">חזור למקורי</button>
                        <?php endif; ?>
                        <button type="button" class="achord-personal-btn-cancel" id="achord-personal-cancel">ביטול</button>
                    </div>
                    <p class="achord-personal-modal-status" id="achord-personal-status"></p>
                </div>
            </div>
            <?php endif; ?>

            <script>
            /* מונע קפיצת-מיקום: ממקם אקורדי-מידוורד (מילים קצרות עם 2+ אקורדים) כבר לפני
               הצביעה הראשונה — סינכרונית בזמן פענוח ה-DOM — במקום להמתין ל-ui.init של
               main.js שרץ רק אחרי jQuery (~שנייה). זהו מקור-האמת היחיד לגיאומטריה;
               main.js קורא ל-window.__amsMidwordFix כדי להריץ שוב על אירועים חיים.
               הגיאומטריה זהה לחלוטין ל-fixMidwordChordOverlaps ההיסטורי (main.js). */
            window.__amsMidwordFix = function(root){
                var GAP = 4; // מרווח ויזואלי מינימלי בין תוויות-אקורד סמוכות
                root.querySelectorAll('.achord-midword').forEach(function(group){
                    var chordEls = [].slice.call(group.querySelectorAll('.achord-seg > .achord-chord'));
                    chordEls.forEach(function(el){ el.style.transform = ''; });
                    group.querySelectorAll('.achord-seg').forEach(function(seg){ seg.style.marginLeft = ''; });
                    group.style.marginLeft = '';
                    group.style.marginRight = '';
                    if (chordEls.length < 2) return;
                    var nat = chordEls.map(function(el){
                        var r = el.getBoundingClientRect();
                        return { el: el, w: r.width, c0: (r.left + r.right) / 2 };
                    }).sort(function(a, b){ return a.c0 - b.c0; });
                    var finalC = nat.map(function(n){ return n.c0; });
                    for (var i = 1; i < nat.length; i++) {
                        var need = finalC[i - 1] + nat[i - 1].w / 2 + GAP + nat[i].w / 2;
                        if (finalC[i] < need) finalC[i] = need;
                    }
                    var drift = 0;
                    for (var j = 0; j < nat.length; j++) drift += finalC[j] - nat[j].c0;
                    drift /= nat.length;
                    for (var k = 0; k < nat.length; k++) finalC[k] -= drift;
                    for (var m = 0; m < nat.length; m++) {
                        var shift = finalC[m] - nat[m].c0;
                        if (Math.abs(shift) > 0.5)
                            nat[m].el.style.transform = 'translateX(calc(50% + ' + shift.toFixed(1) + 'px))';
                    }
                    var box = group.getBoundingClientRect();
                    var lefts = nat.map(function(n, idx){ return finalC[idx] - n.w / 2; });
                    var rights = nat.map(function(n, idx){ return finalC[idx] + n.w / 2; });
                    var clusterLeft = Math.min.apply(Math, lefts);
                    var clusterRight = Math.max.apply(Math, rights);
                    var overL = box.left - clusterLeft;
                    var overR = clusterRight - box.right;
                    if (overL > 0.5) group.style.marginLeft = Math.ceil(overL) + 'px';
                    if (overR > 0.5) group.style.marginRight = Math.ceil(overR) + 'px';
                });
            };
            (function(){
                var w = document.currentScript.closest('.achord-song-wrapper');
                if (!w) return;
                function run(){ try { window.__amsMidwordFix(w); } catch(e){} }
                run(); // סינכרוני, לפני-paint (גופן-המילים זמין מיד → מדידה יציבה)
                if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
            })();
            </script>

        </div>



        <script>

        document.addEventListener('DOMContentLoaded', function() {

            const tabs = document.querySelectorAll('.tab-btn');

            const contents = document.querySelectorAll('.achord-tab-content');

            

            tabs.forEach(btn => {

                btn.addEventListener('click', function() {

                    // 1. הסרת Active מכולם

                    tabs.forEach(t => t.classList.remove('active'));

                    

                    // 2. עצירת וידאו בטאבים האחרים (מניעת זליגת אודיו)

                    contents.forEach(c => {

                        c.style.display = 'none';

                        c.classList.remove('active');

                        // מציאת Iframe ואיפוס ה-SRC כדי לעצור ניגון

                        const iframe = c.querySelector('iframe');

                        if(iframe) {

                            const src = iframe.src;

                            iframe.src = src; 

                        }

                    });

                    

                    // 3. הפעלת הטאב שנבחר

                    this.classList.add('active');

                    const targetId = 'tab-' + this.getAttribute('data-tab');

                    const targetContent = document.getElementById(targetId);

                    if (targetContent) {

                        targetContent.style.display = 'block';

                        targetContent.classList.add('active');

                    }

                    if (this.getAttribute('data-tab') === 'score' && typeof initTavimProPlus === 'function') {

                         setTimeout(initTavimProPlus, 50);

                    }

                });

            });

        });

        </script>

        <?php

        return ob_get_clean();

    }

    private function format_song_content($text) {
        $text = strip_tags($text);
        $lines = preg_split('/\r\n|\r|\n/', trim($text));
        $output = '';
        foreach ($lines as $line) {
            $trimmed_line = trim($line);
            if (empty($trimmed_line)) { $output .= "<div class='achord-line'>&nbsp;</div>"; continue; }
            preg_match_all('/([^\[\]]*)(\[[^\]]+\])?/', $trimmed_line, $matches, PREG_SET_ORDER);
            $htmlLine = '';
            foreach ($matches as $match) {
                if (empty($match[0])) continue;
                $lyrics = isset($match[1]) ? esc_html($match[1]) : '';
                $chord = isset($match[2]) ? esc_html(trim($match[2], '[]')) : '';
                $htmlLine .= "<span class='achord-word-group'>";
                if (!empty($chord)) {
                    $htmlLine .= "<span class='achord-chord' data-original='".esc_attr($chord)."' data-current='".esc_attr($chord)."'>{$chord}</span>";
                } else {
                    $htmlLine .= "<span class='achord-chord achord-placeholder-chord'>&nbsp;</span>";
                }
                $htmlLine .= "<span class='achord-lyrics'>{$lyrics}</span></span> ";
            }
            $output .= "<div class='achord-line'>".trim($htmlLine)."</div>";
        }
        return $output;
    }
    
    public function render_accordion_shortcode($atts, $content, $tag) {
        $post_type = 'achord_song_cpt';
        if ($tag === 'achord_lessons_accordion') $post_type = 'lesson';
        if ($tag === 'achord_tavim_accordion') $post_type = 'tavim_score';
        $taxonomies_to_include = ['genre', 'singer', 'level'];
        ob_start();
        $posts_query = new WP_Query(['post_type' => $post_type, 'posts_per_page' => -1, 'post_status' => 'publish', 'orderby' => 'title', 'order' => 'ASC']);
        if ($posts_query->have_posts()) {
            $categorized_posts = [];
            foreach ($taxonomies_to_include as $taxonomy) $categorized_posts[$taxonomy] = [];
            while ($posts_query->have_posts()) {
                $posts_query->the_post();
                foreach ($taxonomies_to_include as $taxonomy) {
                    $terms = get_the_terms(get_the_ID(), $taxonomy);
                    if ($terms && !is_wp_error($terms)) {
                        foreach ($terms as $term) $categorized_posts[$taxonomy][$term->name][get_the_title()] = get_permalink();
                    }
                }
            }
            wp_reset_postdata();
            echo '<div class="achord-accordion-container">';
            foreach ($taxonomies_to_include as $taxonomy) {
                $taxonomy_obj = get_taxonomy($taxonomy);
                $section_title = is_object($taxonomy_obj) ? $taxonomy_obj->labels->name : ucfirst($taxonomy);
                if (!empty($categorized_posts[$taxonomy])) {
                    echo '<h3 class="achord-accordion-section-title">' . esc_html($section_title) . '</h3>';
                    ksort($categorized_posts[$taxonomy]);
                    foreach ($categorized_posts[$taxonomy] as $term_name => $posts) {
                        uksort($posts, 'strcoll');
                        echo '<div class="achord-accordion-item"><div class="achord-accordion-header"><span>' . esc_html($term_name) . '</span><span class="arrow">▼</span></div><div class="achord-accordion-content"><ul class="achord-accordion-list">';
                        foreach ($posts as $title => $permalink) echo '<li><a href="' . esc_url($permalink) . '">' . esc_html($title) . '</a></li>';
                        echo '</ul></div></div>';
                    }
                }
            }
            echo '</div>';
        } else {
            echo '<p class="achord-accordion-no-posts">לא נמצאו פריטים.</p>';
        }
        return ob_get_clean();
    }

    
    public function render_related_posts_shortcode() {
        if (!is_singular()) return '';
        return $this->get_related_posts_html(get_the_ID());
    }
    
    public function get_related_posts_html($post_id) {
        $song_post_id = $post_id;
        $post_type = get_post_type($post_id);
        if ($post_type === 'lesson') $song_post_id = get_post_meta($post_id, 'related_chords_post', true);
        elseif ($post_type === 'tavim_score') {
            $related_lesson_id = get_post_meta($post_id, '_related_lesson_id', true);
            if ($related_lesson_id) $song_post_id = get_post_meta($related_lesson_id, 'related_chords_post', true);
        }
        if (!$song_post_id) return '';
        ob_start();
        // 1) אותו אמן (קיים) — ראשון
        $this->display_related_posts_by_taxonomy($song_post_id, 'singer', 'שירים נוספים מאת');
        // 2) המלצות AI (חדש) — אחרי האמן, רלוונטי יותר מהקטגוריה. fallback בטוח: אם אין מטא → לא מוצג כלום
        $has_recs = $this->display_recommended_songs($song_post_id);
        // 3) קטגוריה/ז'אנר (קיים) — אלא אם בוחרים שההמלצות יחליפו אותו (filter)
        if (!($has_recs && apply_filters('ams_recommended_replace_genre', false))) {
            $this->display_related_posts_by_taxonomy($song_post_id, 'genre', 'שירים נוספים בז\'אנר');
        }
        return ob_get_clean();
    }

    /**
     * פס "מומלצים" — שירים שחושבו ע"י AI (offline), נשמרים ב-post_meta `_ams_recommended_songs`
     * כמערך post_id מסודר. מבנה ה-HTML זהה ל-display_related_posts_by_taxonomy → אפס CSS חדש.
     * מחזיר true אם הוצג פס, false אם אין המלצות (כדי לדעת אם להחליף את פס הז'אנר).
     */
    private function display_recommended_songs($post_id, $title_prefix = 'שירים מומלצים עבורך') {
        $rec_ids = get_post_meta($post_id, '_ams_recommended_songs', true);
        if (empty($rec_ids) || !is_array($rec_ids)) return false;
        $rec_ids = array_map('intval', $rec_ids);
        $rec_args = [
            'post_type'      => 'achord_song_cpt',
            'post__in'       => $rec_ids,
            'orderby'        => 'post__in',   // שמירת סדר ההמלצות מה-AI (רלוונטי→פחות)
            'posts_per_page' => count($rec_ids),
            'post_status'    => 'publish',
            'no_found_rows'  => true,
        ];
        // מצב גרסה-קלה גלובלי — רק שירים קלים גם בהמלצות
        if (Achord_Master_Suite::easy_mode_on()) {
            $rec_args['meta_query'] = [['key' => '_ams_is_easy', 'value' => '1', 'compare' => '=']];
        }
        $rec_query = new WP_Query($rec_args);
        if (!$rec_query->have_posts()) { wp_reset_postdata(); return false; }
        echo '<section class="related-posts-section related-posts-section--recommended"><h3>' . esc_html($title_prefix) . '</h3><div class="related-posts-grid">';
        while ($rec_query->have_posts()) {
            $rec_query->the_post();
            $performer_terms = get_the_terms(get_the_ID(), 'singer');
            $performer_name = ($performer_terms && !is_wp_error($performer_terms)) ? $performer_terms[0]->name : '';
            echo '<a href="' . esc_url(get_permalink()) . '" class="related-post-card"><span class="related-post-title">' . esc_html(get_the_title()) . '</span>';
            if ($performer_name) echo '<span class="related-post-performer">' . esc_html($performer_name) . '</span>';
            echo '</a>';
        }
        echo '</div></section>';
        wp_reset_postdata();
        return true;
    }
    
    private function display_related_posts_by_taxonomy($post_id, $taxonomy, $title_prefix) {
        $terms = get_the_terms($post_id, $taxonomy);
        if (!$terms || is_wp_error($terms)) return;
        $term_ids = wp_list_pluck($terms, 'term_id');
        $term_names = wp_list_pluck($terms, 'name');
        $related_args = ['post_type' => 'achord_song_cpt', 'posts_per_page' => 4, 'post__not_in' => [$post_id], 'tax_query' => [['taxonomy' => $taxonomy, 'field' => 'term_id', 'terms' => $term_ids]]];
        // מצב גרסה-קלה גלובלי — רק שירים קלים גם ב"שירים נוספים"
        if (Achord_Master_Suite::easy_mode_on()) {
            $related_args['meta_query'] = [['key' => '_ams_is_easy', 'value' => '1', 'compare' => '=']];
        }
        $related_query = new WP_Query($related_args);
        if ($related_query->have_posts()) {
            echo '<section class="related-posts-section"><h3>' . esc_html($title_prefix) . ' ' . esc_html(implode(', ', $term_names)) . '</h3><div class="related-posts-grid">';
            while ($related_query->have_posts()) {
                $related_query->the_post();
                $performer_terms = get_the_terms(get_the_ID(), 'singer');
                $performer_name = ($performer_terms && !is_wp_error($performer_terms)) ? $performer_terms[0]->name : '';
                echo '<a href="' . esc_url(get_permalink()) . '" class="related-post-card"><span class="related-post-title">' . esc_html(get_the_title()) . '</span>';
                if ($performer_name) echo '<span class="related-post-performer">' . esc_html($performer_name) . '</span>';
                echo '</a>';
            }
            echo '</div></section>';
        }
        wp_reset_postdata();
    }
  // פונקציה חדשה להוספת קישורי פוטר
    public function get_footer_links_html() {
        ob_start();
        ?>
        <div class="achord-footer-links">
            <!-- רשימת ז'אנרים -->
            <div class="footer-section">
                <h4>ז'אנרים</h4>
                <div class="footer-links-row">
                    <?php
                    $genres = get_terms([
                        'taxonomy' => 'genre',
                        'hide_empty' => true,
                        'number' => 10,
                        'orderby' => 'count',
                        'order' => 'DESC'
                    ]);
                    
                    foreach ($genres as $genre) {
                        echo '<a href="' . esc_url(get_term_link($genre)) . '">' . esc_html($genre->name) . '</a>';
                    }
                    ?>
                </div>
            </div>
            
            <!-- קישורים ראשיים -->
            <div class="footer-section">
                <h4>עמודים ראשיים</h4>
                <div class="footer-links-row">
                    <a href="<?php echo home_url(); ?>">דף הבית</a>
                    <a href="<?php echo home_url('/shirim/'); ?>">אקורדים לשירים</a>
                    <a href="<?php echo home_url('/tavim/'); ?>">תווים</a>
                    <a href="<?php echo home_url('/about/'); ?>">אודות</a>
                    <a href="<?php echo home_url('/contact/'); ?>">דיווח על טעויות</a>
                    <a href="<?php echo home_url('/copyright/'); ?>">זכויות יוצרים</a>
                </div>
            </div>
            
            <!-- זכויות יוצרים -->
            <div class="footer-copyright">
                <p>&copy; <?php echo date('Y'); ?> אקורדים - Achord Master Suite. כל הזכויות שמורות.</p>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
/**
 * [achord_song_index] — אינדקס שירים לפי א-ב (עברית/אנגלית)
 * דוגמה: [achord_song_index post_type="achord_song_cpt" letters="he" strip_prefix="true" per_page="0" show_counts="true"]
 */
public function render_song_index_shortcode($atts = [], $content = '') {
    $atts = shortcode_atts([
        'post_type'    => 'achord_song_cpt', // CPT הנכון לשירים באתר
        'letters'      => 'he',          // he | en | auto
        'strip_prefix' => 'true',        // התעלמות מ"ה " / "The " בתחילת שם
        'per_page'     => '0',           // 0 = ללא עימוד
        'show_counts'  => 'true',        // הצגת מונה ליד כל אות
        'include_drafts' => 'false',     // לכלול טיוטות
        'tax'          => '',            // סינון טקסונומיה (למשל genre)
        'terms'        => '',            // ערכים מופרדים בפסיקים
    ], $atts, 'achord_song_index');

    $post_type    = sanitize_text_field($atts['post_type']);
    $strip_prefix = filter_var($atts['strip_prefix'], FILTER_VALIDATE_BOOLEAN);
    $show_counts  = filter_var($atts['show_counts'], FILTER_VALIDATE_BOOLEAN);
    $lettersMode  = sanitize_text_field($atts['letters']);
    $per_page     = intval($atts['per_page']);
    $include_drafts = filter_var($atts['include_drafts'], FILTER_VALIDATE_BOOLEAN);

    // סט אותיות
    $letters_he = ['א','ב','ג','ד','ה','ו','ז','ח','ט','י','כ','ל','מ','נ','ס','ע','פ','צ','ק','ר','ש','ת'];
    $letters_en = range('A','Z');

    // פונקציות עזר
    $normalize_title = function($title) use ($strip_prefix) {
        $title = wp_strip_all_tags($title);
        $title = trim(preg_replace('/\s+/', ' ', $title));

        if ($strip_prefix) {
            // הסרת "ה " בעברית ו"The " באנגלית (רק בתחילת המחרוזת)
            $title = preg_replace('/^(ה\s+)/u', '', $title);
            $title = preg_replace('/^(The\s+)/i', '', $title);
        }
        return $title;
    };

    $first_letter = function($title) use ($lettersMode, $letters_he, $letters_en) {
        $t = trim($title);
        if ($t === '') return '#';
        $ch = mb_substr($t, 0, 1, 'UTF-8');

        // קביעה אוטומטית אם נשתמש בעברית או אנגלית
        $mode = $lettersMode;
        if ($mode === 'auto') {
            $code = IntlChar::ord($ch);
            // טווח עברית: U+0590–U+05FF
            $mode = ($code >= 0x0590 && $code <= 0x05FF) ? 'he' : 'en';
        }

        if ($mode === 'he') {
            return in_array($ch, $letters_he, true) ? $ch : '#';
        } else {
            $ch = strtoupper($ch);
            return in_array($ch, $letters_en, true) ? $ch : '#';
        }
    };

    // הכנת WP_Query
    $query_args = [
        'post_type'      => $post_type,
        'post_status'    => $include_drafts ? ['publish','draft','pending'] : ['publish'],
        'orderby'        => 'title',
        'order'          => 'ASC',
        'posts_per_page' => $per_page > 0 ? $per_page : -1,
        'nopaging'       => $per_page > 0 ? false : true,
        'fields'         => 'ids',
    ];

    // סינון טקסונומיות (אופציונלי)
    if (!empty($atts['tax']) && !empty($atts['terms'])) {
        $tax   = sanitize_key($atts['tax']);
        $terms = array_filter(array_map('trim', explode(',', $atts['terms'])));
        $query_args['tax_query'] = [[
            'taxonomy' => $tax,
            'field'    => 'name',
            'terms'    => $terms,
        ]];
    }

    $q = new WP_Query($query_args);
    if (!$q->have_posts()) {
        return '<div class="achord-accordion-no-posts">לא נמצאו שירים.</div>';
    }

    // קיבוץ לפי אות
    $groups = [];
    foreach ($q->posts as $post_id) {
        $title = get_the_title($post_id);
        $title_norm = $normalize_title($title);
        $letter = $first_letter($title_norm);
        if (!isset($groups[$letter])) $groups[$letter] = [];
        $groups[$letter][] = [
            'id'    => $post_id,
            'title' => $title_norm,
            'link'  => get_permalink($post_id),
        ];
    }

    // קביעת סט אותיות להצגה
    $display_letters = ($lettersMode === 'he') ? $letters_he : (($lettersMode === 'en') ? $letters_en : array_merge(['#'],$letters_he,$letters_en));
    if ($lettersMode === 'auto') {
        $display_letters = array_unique(array_merge(['#'],$letters_he,$letters_en));
    } else {
        array_unshift($display_letters, '#');
    }

    // מיון פנימי של כל קבוצה
    foreach ($groups as &$items) {
        usort($items, function($a, $b) {
            return strcasecmp($a['title'], $b['title']);
        });
    }
    unset($items);

    ob_start();
    ?>
    <div class="achord-song-index" dir="rtl">
        <!-- ניווט אותיות -->
        <div class="achord-index-nav" style="display:flex;flex-wrap:wrap;gap:.5rem 1rem;margin-bottom:1rem;">
            <?php foreach ($display_letters as $L): 
                $count = isset($groups[$L]) ? count($groups[$L]) : 0;
                $disabled = $count === 0 ? 'style="opacity:.35;pointer-events:none;"' : '';
                ?>
                <a href="#achord-letter-<?php echo esc_attr($L); ?>" <?php echo $disabled; ?> class="drawer-button"><?php 
                    echo esc_html($L);
                    if ($show_counts) echo ' ('.intval($count).')';
                ?></a>
            <?php endforeach; ?>
        </div>

        <!-- קבוצות לפי אות -->
        <div class="achord-index-groups">
            <?php foreach ($display_letters as $L): 
                if (empty($groups[$L])) continue; ?>
                <h2 id="achord-letter-<?php echo esc_attr($L); ?>" class="achord-letter-title"><?php echo esc_html($L); ?></h2>
                <ul class="achord-accordion-list">
                    <?php foreach ($groups[$L] as $item): ?>
                        <li>
                            <a href="<?php echo esc_url($item['link']); ?>">
                                <?php echo esc_html($item['title']); ?>
                            </a>
                        </li>
                    <?php endforeach; ?>
                </ul>
            <?php endforeach; ?>
        </div>
    </div>
    <?php
    return ob_get_clean();
}

/**
 * [achord_song_search_advanced] — טופס חיפוש שירים מתקדם עם כל הפילטרים
 */
public function render_search_form_shortcode($atts = [], $content = '') {
    $singers = get_terms(['taxonomy' => 'singer', 'hide_empty' => true, 'orderby' => 'name']);
    $genres = get_terms(['taxonomy' => 'genre', 'hide_empty' => true, 'orderby' => 'name']);
    
    ob_start();
    ?>
    <div class="achord-search-wrapper" dir="rtl">
        <form class="achord-search-form achord-dynamic-search-form">
            <div class="achord-search-field-group achord-input-with-icon">
                <label for="achord-search-query">חיפוש חופשי (מילים/שם שיר)</label>
                <div class="achord-icon-wrapper">
                    <svg class="ams-input-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" id="achord-search-query" name="query" class="achord-search-input" placeholder="חפש שיר...">
                </div>
            </div>
            
            <div class="achord-search-field-group achord-input-with-icon">
                <label for="achord-singer-filter">זמר / אמן</label>
                <div class="achord-icon-wrapper">
                    <svg class="ams-input-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <select id="achord-singer-filter" name="singer" class="achord-search-select">
                        <option value="0">כל הזמרים</option>
                        <?php if (!is_wp_error($singers) && !empty($singers)): ?>
                            <?php foreach($singers as $singer): ?>
                                <option value="<?php echo esc_attr($singer->term_id); ?>"><?php echo esc_html($singer->name); ?></option>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </select>
                </div>
            </div>
            
            <div class="achord-search-field-group achord-input-with-icon">
                <label for="achord-genre-filter">סגנון / ז'אנר</label>
                <div class="achord-icon-wrapper">
                    <svg class="ams-input-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                    <select id="achord-genre-filter" name="genre" class="achord-search-select">
                        <option value="0">כל הסגנונות</option>
                        <?php if (!is_wp_error($genres) && !empty($genres)): ?>
                            <?php foreach($genres as $genre): ?>
                                <option value="<?php echo esc_attr($genre->term_id); ?>"><?php echo esc_html($genre->name); ?></option>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </select>
                </div>
            </div>
            
            <div class="achord-search-field-group ams-easy-mode-row" style="grid-column: 1 / -1;">
                <label class="ams-easy-toggle">
                    <input type="checkbox" class="ams-easy-toggle-input"<?php echo Achord_Master_Suite::easy_mode_on() ? ' checked' : ''; ?>>
                    <span class="ams-easy-toggle-switch"></span>
                    <span class="ams-easy-toggle-label">הצג רק שירים בגרסה קלה</span>
                </label>
            </div>
            
            <div style="display: flex; gap: 10px; width: 100%; align-items: flex-end; grid-column: 1 / -1; margin-top: 10px;">
                <button type="submit" class="achord-search-submit" style="flex: 1;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-left: 8px;"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    הפעל סינון
                </button>
                <button type="button" class="achord-search-reset" style="padding: 11px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; border: 1px solid var(--border-color, #cbd5e1); background: var(--bg-song, #fff); color: var(--text-primary, #475569); display: flex; align-items: center; gap: 5px;">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    ניקוי
                </button>
            </div>
        </form>
        
        <div class="achord-search-meta">
            <span id="achord-search-count" class="achord-search-count"></span>
            <span id="achord-search-loading" class="achord-search-loading" style="display:none;">טוען תוצאות...</span>
        </div>
        
        <div id="achord-search-results" class="achord-search-results-grid"></div>
    </div>
    <style>
        .achord-search-wrapper { max-width: 800px; margin: 0 auto 2rem auto; background: var(--bg-song, #fff); color: var(--text-primary, #1e293b); padding: 25px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid var(--border-color, #e2e8f0); }
        .achord-search-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; align-items: end; margin-bottom: 25px; }
        .achord-search-field-group { display: flex; flex-direction: column; gap: 8px; }
        .achord-search-field-group label { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); opacity: 0.9; }
        
        .achord-icon-wrapper { position: relative; display: flex; align-items: center; }
        .ams-input-icon { position: absolute; right: 12px; width: 18px; height: 18px; color: var(--text-secondary); pointer-events: none; transition: color 0.3s; }
        .achord-icon-wrapper:focus-within .ams-input-icon { color: var(--accent-primary); }
        
        .achord-search-input, .achord-search-select { width: 100%; padding: 12px 12px 12px 35px; border: 2px solid var(--border-color, #cbd5e1); border-radius: 10px; font-size: 0.95rem; background: var(--bg-page, #f8fafc); color: var(--text-primary); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        
        [dir="rtl"] .achord-search-input, [dir="rtl"] .achord-search-select { padding: 12px 38px 12px 12px; }
        
        .achord-search-input:hover, .achord-search-select:hover { border-color: color-mix(in srgb, var(--border-color) 60%, var(--accent-primary) 40%); box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
        .achord-search-input:focus, .achord-search-select:focus { outline: none; border-color: var(--accent-primary, #3b82f6); background: var(--bg-song); box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
        
        /* סימון בחירה אקטיבית ל-Select */
        .achord-search-select:not([value="0"]):not(:focus) { background-color: color-mix(in srgb, var(--accent-primary) 5%, var(--bg-page) 95%); border-color: color-mix(in srgb, var(--accent-primary) 30%, var(--border-color) 70%); }
        
        .achord-search-submit { background: var(--accent-primary, #3b82f6); color: var(--accent-primary-text, #fff); padding: 12px 24px; border: none; border-radius: 10px; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 10px color-mix(in srgb, var(--accent-primary) 30%, transparent); }
        .achord-search-submit:hover { transform: translateY(-2px); box-shadow: 0 6px 15px color-mix(in srgb, var(--accent-primary) 50%, transparent); filter: brightness(1.1); }
        .achord-search-submit:active { transform: translateY(0); box-shadow: 0 2px 5px color-mix(in srgb, var(--accent-primary) 30%, transparent); }
    </style>
    <?php
    return ob_get_clean();
}

/**
 * [achord_song_search] — טופס חיפוש שירים פשוט (Mobile First UX)
 */
public function render_simple_search_form_shortcode($atts = [], $content = '') {
    $singers = get_terms(['taxonomy' => 'singer', 'hide_empty' => true, 'orderby' => 'name']);
    ob_start();
    ?>
    <div class="ams-simple-search-wrapper" dir="rtl">
        <form class="ams-simple-search-form achord-dynamic-search-form" onsubmit="return false;">

            <div class="ams-omnibox">
                <svg class="ams-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" name="query" class="ams-omnibox-input" placeholder="חפש שיר, אמן, סגנון או מילים..." autocomplete="off">
                <button type="button" class="ams-filter-toggle" aria-expanded="false" aria-controls="ams-filter-panel" title="סינון מתקדם">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                    <span class="ams-filter-toggle-label">סינון</span>
                </button>
            </div>

            <div class="ams-easy-mode-row">
                <label class="ams-easy-toggle">
                    <input type="checkbox" class="ams-easy-toggle-input"<?php echo Achord_Master_Suite::easy_mode_on() ? ' checked' : ''; ?>>
                    <span class="ams-easy-toggle-switch"></span>
                    <span class="ams-easy-toggle-label">הצג רק שירים בגרסה קלה</span>
                </label>
            </div>

            <!-- פאנל סינון מתקדם — מוסתר כברירת מחדל -->
            <div class="ams-filter-panel" id="ams-filter-panel" hidden>

                <div class="ams-filter-row">
                    <label class="ams-filter-label">זמר / אמן</label>
                    <select name="singer" class="ams-filter-select">
                        <option value="0">כל הזמרים</option>
                        <?php if (!is_wp_error($singers) && !empty($singers)): ?>
                            <?php foreach ($singers as $s): ?>
                                <option value="<?php echo esc_attr($s->term_id); ?>"><?php echo esc_html($s->name); ?></option>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </select>
                </div>

                <div class="ams-filter-row">
                    <label class="ams-filter-label">סוג תוכן</label>
                    <div class="ams-difficulty-pills">
                        <label class="ams-pill">
                            <input type="radio" name="content_type" value="" checked>
                            <span class="ams-pill-text">הכל</span>
                        </label>
                        <label class="ams-pill">
                            <input type="radio" name="content_type" value="chords">
                            <span class="ams-pill-text">🎸 אקורדים</span>
                        </label>
                        <label class="ams-pill">
                            <input type="radio" name="content_type" value="score">
                            <span class="ams-pill-text">🎼 תווים</span>
                        </label>
                        <label class="ams-pill">
                            <input type="radio" name="content_type" value="lesson_guitar">
                            <span class="ams-pill-text">🎸 שיעור גיטרה</span>
                        </label>
                        <label class="ams-pill">
                            <input type="radio" name="content_type" value="lesson_piano">
                            <span class="ams-pill-text">🎹 שיעור פסנתר</span>
                        </label>
                    </div>
                </div>

            </div>

            <input type="hidden" name="genre" value="0">
        </form>

        <div class="achord-search-meta">
            <span class="achord-search-count"></span>
        </div>

        <div class="achord-search-results-grid"></div>
    </div>
    <?php
    return ob_get_clean();
}

    public function render_upload_form_shortcode() {
        if (!is_user_logged_in()) {
            return '<div class="achord-notice"><strong>יש להתחבר כדי להעלות שיר חדש.</strong></div>';
        }

        // אם מדובר בעריכת Entry ייעודי – ננסה למשוך ערכי מילוי מוקדם
        $entry_id = isset($_GET['entry']) ? (int) $_GET['entry'] : 0;
        $entry_token = isset($_GET['token']) ? sanitize_text_field($_GET['token']) : '';
        $prefill_upload = [
            'allow'      => true,
            'title'      => '',
            'performer'  => '',
            'lyrics_by'  => '',
            'music_by'   => '',
            'capo'       => '',
            'content'    => '',
            'pdf'        => '',
            'reco'       => []
        ];
        if ($entry_id) {
            $entry = get_post($entry_id);
            if ($entry && $entry->post_type === 'achord_entry') {
                // בדיקת הרשאות: מנהל או משתמש שהוקצה או באמצעות טוקן
                $assigned_uid = (int) get_post_meta($entry_id, '_achord_entry_assigned_user', true);
                $stored_token = get_post_meta($entry_id, '_achord_entry_token', true);
                $ok = current_user_can('manage_options');
                if (!$ok) {
                    if ($entry_token && $stored_token && hash_equals($stored_token, $entry_token)) {
                        $ok = true;
                    } elseif ($assigned_uid && is_user_logged_in() && get_current_user_id() === $assigned_uid) {
                        $ok = true;
                    }
                }
                // וודא שהסטטוס לא 'done'
                $status = get_post_meta($entry_id, '_achord_entry_status', true) ?: 'open';
                if (!$ok) {
                    $prefill_upload['allow'] = false;
                } elseif ($status === 'done') {
                    $prefill_upload['allow'] = false;
                } else {
                    $prefill_upload['title']     = $entry->post_title;
                    $prefill_upload['content']   = get_post_meta($entry_id, '_achord_entry_lyrics', true);
                    $prefill_upload['pdf']       = get_post_meta($entry_id, '_achord_entry_pdf_url', true);
                    $reco_json = get_post_meta($entry_id, '_achord_entry_recommended_chords', true);
                    $prefill_upload['reco']      = $reco_json ? json_decode($reco_json, true) : [];
                    // שדות חדשים למבצע, מילים ולחן וקאפו
                    $prefill_upload['lyrics_by'] = get_post_meta($entry_id, AMS_Entries_Manager::META_LYRICS_BY, true);
                    $prefill_upload['music_by']  = get_post_meta($entry_id, AMS_Entries_Manager::META_MUSIC_BY, true);
                    $prefill_upload['performer'] = get_post_meta($entry_id, AMS_Entries_Manager::META_PERFORMER, true);
                    $prefill_upload['capo']      = get_post_meta($entry_id, AMS_Entries_Manager::META_CAPO, true);
                }
            }
        }

        // רשימת האקורדים המהירים (Quick chords) והז'אנרים האפשריים
        // אקורדים מהירים (Quick chords) – כדי לא להעמיס על המסך הנייד, מציגים רק שבעה אקורדים שימושיים במיוחד.
        $quick_chords = [
            'C', 'G', 'Am', 'F', 'Dm', 'Em', 'E'
        ];
        // הז'אנרים נלקחים מהטקסונומיה עצמה ולא מרשימה קשיחה.
        // הרשימה הקשיחה שהייתה כאן קודם התיישנה: מתוך עשרה שמות רק
        // "שירי ארץ ישראל" תאם טרם קיים, ותשעת האחרים יצרו טרם חדש
        // בכל שליחה ("בלדות" לצד "בלדה", "שירי ילדים" לצד "ילדים"...).
        // שליפה דינמית מונעת את הדריפט הזה מלכתחילה.
        $song_genres_list = [];
        $genre_terms      = get_terms( [
            'taxonomy'   => 'genre',
            'hide_empty' => false,
            'orderby'    => 'count',
            'order'      => 'DESC',
            'number'     => 20,
        ] );

        if ( ! is_wp_error( $genre_terms ) && ! empty( $genre_terms ) ) {
            $song_genres_list = wp_list_pluck( $genre_terms, 'name' );
        }

        // רשת ביטחון: אם הטקסונומיה ריקה או לא רשומה, לא משאירים טופס בלי ז'אנרים.
        if ( empty( $song_genres_list ) ) {
            $song_genres_list = [
                'פופ', 'רוק', 'רוק אלטרנטיבי', 'בלדה', 'מזרחי',
                'פולק', 'פופ-רוק', 'ילדים', 'יהודי/חסידי', 'שירי ארץ ישראל',
            ];
        }

        // בניית ספריית האקורדים המלאה עבור ספריית האקורדים המלאה במודאל
        $qualities = [ '', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim', 'aug', '6', 'm6', '9', 'm9', 'add9', 'dim7', 'm7b5' ];
        $order = [ 'C','C#','D','D#','E','F','F#','G','G#','A','A#','B' ];
        $full_chord_library = [];
        foreach ($order as $root) {
            $chords_in_root = [];
            foreach ($qualities as $q) {
                $chords_in_root[] = $root . $q;
            }
            $full_chord_library[$root] = $chords_in_root;
        }

        ob_start();
        ?>
        <!-- data bridge for achord-upload.js -->
        <script>
        window.ACHORD_UPLOAD_DATA = {
            prefill:  <?php echo wp_json_encode($prefill_upload); ?>,
            library:  <?php echo wp_json_encode($full_chord_library); ?>,
            ajaxUrl:  <?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>,
            nonce:    <?php echo wp_json_encode(wp_create_nonce('achord_upload_nonce')); ?>
        };
        </script>

        <form id="achord-upload-form" class="auf-form" dir="rtl" novalidate>
            
            <!-- ══ סקשן 1: פרטי השיר ══ -->
            <section class="auf-section" data-section="details">
                <header class="auf-section__head">
                    <h2 class="auf-section__title">פרטי השיר</h2>
                </header>
                <div class="auf-section__body">
                    <div class="auf-field-row">
                        <div class="auf-field auf-field--required">
                            <label class="auf-label" for="auf-title">שם השיר</label>
                            <input class="auf-input" id="auf-title" type="text" name="title"
                                   value="<?php echo esc_attr($prefill_upload['title']); ?>" autocomplete="off" required>
                        </div>
                        <div class="auf-field auf-field--required">
                            <label class="auf-label" for="auf-performer">מבצע/ת</label>
                            <input class="auf-input" id="auf-performer" type="text" name="performer"
                                   value="<?php echo esc_attr($prefill_upload['performer']); ?>" autocomplete="off" required>
                        </div>
                    </div>
                    <div class="auf-field-row">
                        <div class="auf-field">
                            <label class="auf-label" for="auf-lyrics-by">מילים מאת</label>
                            <input class="auf-input" id="auf-lyrics-by" type="text" name="lyrics_by"
                                   value="<?php echo esc_attr($prefill_upload['lyrics_by']); ?>">
                        </div>
                        <div class="auf-field">
                            <label class="auf-label" for="auf-music-by">לחן מאת</label>
                            <input class="auf-input" id="auf-music-by" type="text" name="music_by"
                                   value="<?php echo esc_attr($prefill_upload['music_by']); ?>">
                        </div>
                    </div>
                    <div class="auf-field-row auf-field-row--compact">
                        <div class="auf-field">
                            <label class="auf-label" for="auf-tempo">קצב (BPM)</label>
                            <input class="auf-input auf-input--sm" id="auf-tempo" type="text" name="tempo"
                                   placeholder="120" inputmode="numeric">
                        </div>
                        <div class="auf-field">
                            <label class="auf-label" for="auf-strumming">פריטה</label>
                            <input class="auf-input" id="auf-strumming" type="text" name="strumming"
                                   placeholder="DDUUDU">
                        </div>
                    </div>
                    <div class="auf-field">
                        <label class="auf-label">ז'אנר</label>
                        <div class="auf-chips" role="group" aria-label="בחירת ז׳אנר">
                            <?php foreach ($song_genres_list as $genre) : ?>
                            <label class="auf-chip">
                                <input type="checkbox" name="song_genres[]" value="<?php echo esc_attr($genre); ?>" hidden>
                                <span><?php echo esc_html($genre); ?></span>
                            </label>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            </section>

            <!-- ══ סקשן 2: קאפו ══ -->
            <section class="auf-section" data-section="capo">
                <header class="auf-section__head">
                    <h2 class="auf-section__title">קאפו</h2>
                </header>
                <div class="auf-section__body">
                    <div class="auf-capo-pills" role="group" aria-label="בחירת קאפו">
                        <?php for ($c = 0; $c <= 12; $c++) : ?>
                        <label class="auf-capo-pill">
                            <input type="radio" name="capo" value="<?php echo $c; ?>"
                                   <?php echo ($c === 0) ? 'checked' : ''; ?> hidden>
                            <span><?php echo ($c === 0) ? 'ללא' : $c; ?></span>
                        </label>
                        <?php endfor; ?>
                    </div>
                </div>
            </section>

            <!-- ══ סקשן 3: עורך אקורדים — הלב ══ -->
            <section class="auf-section auf-section--main" data-section="chords">
                <header class="auf-section__head">
                    <h2 class="auf-section__title">אקורדים ומילים</h2>
                </header>
                <div class="auf-section__body">

                    <?php if (!empty($prefill_upload['pdf'])) : ?>
                    <div class="auf-pdf-viewer">
                        <div class="auf-pdf-viewer__header">
                            <strong>תצוגת PDF</strong>
                            <button type="button" class="auf-ghost-btn auf-pdf-toggle"
                                    data-target="auf-pdf-iframe" aria-expanded="true">הסתר</button>
                        </div>
                        <iframe id="auf-pdf-iframe" class="auf-pdf-iframe"
                                src="<?php echo esc_url($prefill_upload['pdf']); ?>" title="PDF"></iframe>
                    </div>
                    <?php endif; ?>

                    <!-- סרגל אקורדים שנבחרו -->
                    <div class="auf-rec-bar-wrap">
                        <div class="auf-rec-bar-header">
                            <span class="auf-label">אקורדים שנבחרו</span>
                            <div class="auf-rec-bar-actions">
                                <button type="button" id="auf-edit-rec-btn" class="auf-ghost-btn" aria-pressed="false">עריכה</button>
                                <button type="button" id="auf-open-library-btn" class="auf-ghost-btn">טבלת אקורדים</button>
                            </div>
                        </div>
                        <div id="auf-recommended-bar" class="auf-rec-bar" role="toolbar" aria-label="אקורדים שנבחרו"></div>
                    </div>

                    <!-- Toolbar: הוסף אקורד -->
                    <div class="auf-toolbar">
                        <div class="auf-chord-input-wrap">
                            <input type="text" class="auf-input auf-input--sm" id="auf-chord-input"
                                   placeholder="אקורד..." autocomplete="off" spellcheck="false">
                            <button type="button" id="auf-add-chord-btn" class="auf-ghost-btn">+</button>
                        </div>
                    </div>

                    <!-- מצב עריכה -->
                    <div class="auf-editor-wrap">
                        <div class="auf-editor-mode-bar">
                            <button type="button" id="auf-mode-text" class="auf-mode-btn auf-mode-btn--active" aria-pressed="true">✏️ עריכת מילים</button>
                            <button type="button" id="auf-mode-chords" class="auf-mode-btn" aria-pressed="false">🎸 הוסף אקורדים</button>
                            <button type="button" id="auf-preview-btn" class="auf-ghost-btn">👁 תצוגה חיה</button>
                        </div>

                        <!-- מצב טקסט -->
                        <div id="auf-text-mode" class="auf-editor-panel">
                            <textarea class="auf-textarea" id="auf-editor-normal" name="version_normal"
                                      rows="14" dir="rtl" spellcheck="true"
                                      placeholder="הקלד/י את מילות השיר כאן..."
                                      required><?php echo esc_textarea($prefill_upload['content']); ?></textarea>
                        </div>

                        <!-- מצב אקורדים ויזואלי -->
                        <div id="auf-chord-mode" class="auf-editor-panel" hidden>
                            <div class="auf-chord-hint">לחץ/י על מילה → בחר/י אקורד מהסרגל או גרור/י ישירות</div>
                            <div id="auf-token-canvas" class="auf-token-canvas" dir="rtl"
                                 role="group" aria-label="בחירת מיקום אקורדים"></div>
                        </div>

                        <!-- תצוגה מקדימה -->
                        <div id="auf-preview-panel" class="auf-editor-panel" hidden>
                            <div id="auf-song-preview" class="auf-preview-content"></div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- ══ סקשן 4: קישורי YouTube (מכווץ) ══ -->
            <section class="auf-section auf-section--collapsible" data-section="youtube">
                <header class="auf-section__head auf-collapsible-trigger" aria-expanded="false">
                    <h2 class="auf-section__title">
                        קישורי YouTube
                        <span class="auf-optional-badge">אופציונלי</span>
                    </h2>
                    <span class="auf-chevron" aria-hidden="true">▼</span>
                </header>
                <div class="auf-collapsible-body auf-section__body" hidden>
                    <div class="auf-field-row">
                        <div class="auf-field">
                            <label class="auf-label" for="auf-youtube">שיר מקורי</label>
                            <input class="auf-input" id="auf-youtube" type="url" name="youtube"
                                   placeholder="https://youtube.com/watch?v=...">
                        </div>
                        <div class="auf-field">
                            <label class="auf-label" for="auf-lesson-guitar">שיעור גיטרה</label>
                            <input class="auf-input" id="auf-lesson-guitar" type="url" name="lesson_video_guitar"
                                   placeholder="https://youtube.com/watch?v=...">
                        </div>
                        <div class="auf-field">
                            <label class="auf-label" for="auf-lesson-piano">שיעור פסנתר</label>
                            <input class="auf-input" id="auf-lesson-piano" type="url" name="lesson_video_piano"
                                   placeholder="https://youtube.com/watch?v=...">
                        </div>
                    </div>
                </div>
            </section>

            <!-- ══ סקשן 5: גרסה קלה (מכווץ) ══ -->
            <section class="auf-section auf-section--collapsible" data-section="easy">
                <header class="auf-section__head auf-collapsible-trigger" aria-expanded="false">
                    <h2 class="auf-section__title">
                        גרסה קלה
                        <span class="auf-optional-badge">אופציונלי</span>
                    </h2>
                    <span class="auf-chevron" aria-hidden="true">▼</span>
                </header>
                <div class="auf-collapsible-body auf-section__body" hidden>
                    <div class="auf-field">
                        <label class="auf-label">שינוי טרנספוזיציה</label>
                        <div class="auf-transpose-row">
                            <input type="range" id="auf-transpose-range" name="easy_transpose"
                                   min="-3" max="3" step="0.5" value="0" class="auf-range">
                            <output id="auf-transpose-output" class="auf-transpose-display">0</output>
                            <span class="auf-muted">טונים</span>
                        </div>
                    </div>
                    <div class="auf-field">
                        <label class="auf-label" for="auf-editor-easy">
                            מילים ואקורדים לגרסה קלה
                            <span class="auf-muted">(ריק = ייווצר אוטומטית)</span>
                        </label>
                        <textarea class="auf-textarea" id="auf-editor-easy" name="version_easy"
                                  rows="8" dir="rtl"
                                  placeholder="השאר/י ריק ליצירה אוטומטית..."><?php echo esc_textarea($prefill_upload['easy_content'] ?? ''); ?></textarea>
                    </div>
                </div>
            </section>

            <!-- ══ סקשן 6 (תווים ABC) הוסר במכוון ══
                 השדה היה מוצג אך התוכן שלו נזרק בשקט ב-Ajax_Handler (אף פעם
                 לא נכתב למטא). מעבר לכך, מי שיודע לכתוב ABC כמעט אף פעם אינו
                 מי שמעלה את האקורדים — כפיית שני התפקידים לאותו רגע הבטיחה
                 שדה ריק. הוספת תווים תיבנה כמסלול נפרד על שיר קיים, שגם פותח
                 את אלפי השירים שכבר במאגר. קוד התצוגה המקדימה נשאר בתבנית
                 (achord-upload.js `renderAbcPreview`, מוגן ב-null) לשימוש חוזר. -->

            <!-- ══ הצהרת רישיון ══ -->
            <?php
            // אקו"ם מכסה את המלחין והמחבר. את התמלול שהתורם עצמו כתב הוא לא
            // מכסה, ולכן צריך את ההסכמה שלו במפורש. הנוסח מגיע מ-mu-plugin
            // אחד כדי שמה שנרשם בבסיס הנתונים יהיה בדיוק מה שהוא ראה.
            $license_text = function_exists( 'uc_license_consent_text' )
                ? uc_license_consent_text()
                : 'בשליחת השיר אני מאשר שהתמלול הוא עבודה שלי, ומשחרר אותו לשימוש חופשי תחת הרישיון של האתר.';
            ?>
            <div class="auf-consent" style="display:flex;gap:8px;align-items:flex-start;margin:0 0 14px;font-size:14px;line-height:1.55;">
                <input type="checkbox" name="license_consent" id="auf-license-consent" value="1" required
                       style="margin-top:3px;flex:0 0 auto;">
                <label for="auf-license-consent" style="cursor:pointer;"><?php echo esc_html( $license_text ); ?></label>
            </div>

            <!-- ══ שורת שליחה ══ -->
            <div class="auf-submit-bar">
                <div id="auf-upload-msg" class="auf-msg" role="status" aria-live="polite"></div>
                <button type="submit" id="auf-submit-btn" class="auf-submit-btn">שלח שיר לאישור</button>
            </div>

            <input type="hidden" name="achord_nonce" value="<?php echo wp_create_nonce('achord_upload_nonce'); ?>">
        </form>

        <!-- מודאל ספריית אקורדים -->
        <div id="auf-library-modal" class="auf-modal" hidden role="dialog"
             aria-modal="true" aria-labelledby="auf-modal-title">
            <div class="auf-modal__overlay"></div>
            <div class="auf-modal__content">
                <div class="auf-modal__header">
                    <h3 id="auf-modal-title" class="auf-section__title">ספריית אקורדים מלאה</h3>
                    <button type="button" class="auf-modal__close" aria-label="סגור">✕</button>
                </div>
                <div class="auf-modal__body">
                    <input type="text" id="auf-library-search" class="auf-input"
                           placeholder="חיפוש אקורד... (לדוגמה: Am7)" autocomplete="off">
                    <div id="auf-library-grid" class="auf-library-grid"></div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [achord_my_versions] — עמוד "הגרסאות שלי" למשתמש מחובר.
     */
    public function render_my_versions_shortcode() {
        if (!is_user_logged_in()) {
            return '<p class="ams-notice">יש להתחבר כדי לצפות בגרסאות שלך.</p>';
        }

        $user_id   = get_current_user_id();
        $personals = get_posts([
            'post_type'      => AMS_Personal_Version_Handler::CPT,
            'author'         => $user_id,
            'post_status'    => 'publish',
            'posts_per_page' => 50,
            'no_found_rows'  => true,
        ]);

        $proposals = AMS_Edit_Proposal_Handler::get_user_proposals($user_id);

        ob_start();
        ?>
        <div class="ams-my-versions" dir="rtl">

            <section class="ams-mv-section">
                <h2 class="ams-mv-title">✏️ גרסאות אישיות</h2>
                <?php if (empty($personals)): ?>
                    <p class="ams-mv-empty">עדיין לא יצרת גרסאות אישיות. כנס לשיר ולחץ על ✏️ כדי להתחיל.</p>
                <?php else: ?>
                <ul class="ams-mv-list">
                    <?php foreach ($personals as $p):
                        $song = get_post($p->post_parent);
                        if (!$song) continue;
                        $song_url = get_permalink($song->ID);
                        $song_title = get_the_title($song->ID);
                        $singer = get_post_meta($song->ID, 'performer', true) ?: '';
                        $modified = get_the_modified_date('j.n.Y', $p);
                    ?>
                    <li class="ams-mv-item">
                        <div class="ams-mv-item-info">
                            <a class="ams-mv-song-link" href="<?php echo esc_url($song_url); ?>"><?php echo esc_html($song_title); ?></a>
                            <?php if ($singer): ?><span class="ams-mv-singer"><?php echo esc_html($singer); ?></span><?php endif; ?>
                            <span class="ams-mv-date">עודכן: <?php echo esc_html($modified); ?></span>
                        </div>
                        <div class="ams-mv-item-actions">
                            <a class="ams-mv-btn ams-mv-btn-edit" href="<?php echo esc_url($song_url); ?>">פתח ✏️</a>
                        </div>
                    </li>
                    <?php endforeach; ?>
                </ul>
                <?php endif; ?>
            </section>

            <section class="ams-mv-section">
                <h2 class="ams-mv-title">📝 הצעות עריכה שלי</h2>
                <?php if (empty($proposals)): ?>
                    <p class="ams-mv-empty">עדיין לא הצעת עריכות. כנס לשיר ולחץ על 📝 כדי להציע שינוי.</p>
                <?php else: ?>
                <ul class="ams-mv-list">
                    <?php
                    $status_labels = [
                        'pending' => ['label' => 'ממתין לאישור', 'class' => 'status-pending'],
                        'publish' => ['label' => 'אושר ✓',       'class' => 'status-approved'],
                        'trash'   => ['label' => 'נדחה',          'class' => 'status-rejected'],
                    ];
                    foreach ($proposals as $pr):
                        $song = get_post($pr->post_parent);
                        if (!$song) continue;
                        $song_url   = get_permalink($song->ID);
                        $song_title = get_the_title($song->ID);
                        $st         = $pr->post_status;
                        $sl         = $status_labels[$st] ?? ['label' => $st, 'class' => ''];
                        $submitted  = get_the_date('j.n.Y', $pr);
                        $note       = $pr->post_excerpt;
                    ?>
                    <li class="ams-mv-item">
                        <div class="ams-mv-item-info">
                            <a class="ams-mv-song-link" href="<?php echo esc_url($song_url); ?>"><?php echo esc_html($song_title); ?></a>
                            <?php if ($note): ?><span class="ams-mv-note">"<?php echo esc_html($note); ?>"</span><?php endif; ?>
                            <span class="ams-mv-date">נשלח: <?php echo esc_html($submitted); ?></span>
                        </div>
                        <span class="ams-mv-status <?php echo esc_attr($sl['class']); ?>"><?php echo esc_html($sl['label']); ?></span>
                    </li>
                    <?php endforeach; ?>
                </ul>
                <?php endif; ?>
            </section>

        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [achord_tunes_library] — עמוד ספריית התווים: שירים עם דגל score (תווי ABC),
     * מקובצים בעיצוב אקורדיון לפי קטגוריית-תווים (מסורת → תת-סוג).
     */
    public function render_tunes_library_shortcode($atts) {
        $atts = shortcode_atts(['per_category' => 0], $atts, 'achord_tunes_library');

        $parents = get_terms([
            'taxonomy'   => 'tune_category',
            'parent'     => 0,
            'hide_empty' => false,
        ]);

        // לכל מסורת (אב) → רשימת תתי-סוגים, ולכל תת-סוג רשימת שירים.
        $sections = [];
        if (!is_wp_error($parents)) {
            foreach ($parents as $parent) {
                $children = get_terms([
                    'taxonomy'   => 'tune_category',
                    'parent'     => $parent->term_id,
                    'hide_empty' => false,
                ]);
                if (is_wp_error($children) || empty($children)) continue;

                $section_total = 0;
                $items = [];
                foreach ($children as $child) {
                    $songs = get_posts([
                        'post_type'      => 'achord_song_cpt',
                        'post_status'    => 'publish',
                        'posts_per_page' => ((int)$atts['per_category'] > 0) ? (int)$atts['per_category'] : -1,
                        'orderby'        => 'title',
                        'order'          => 'ASC',
                        'no_found_rows'  => true,
                        'tax_query'      => [[
                            'taxonomy'         => 'tune_category',
                            'field'            => 'term_id',
                            'terms'            => $child->term_id,
                            'include_children' => false,
                        ]],
                    ]);
                    if (!empty($songs)) {
                        $items[] = ['term' => $child, 'songs' => $songs];
                        $section_total += count($songs);
                    }
                }
                if (!empty($items)) {
                    // תתי-סוגים — לפי שם
                    usort($items, function($a, $b){ return strcoll($a['term']->name, $b['term']->name); });
                    $sections[] = ['parent' => $parent, 'items' => $items, 'total' => $section_total];
                }
            }
            // מסורות — לפי גודל יורד
            usort($sections, function($a, $b){ return $b['total'] - $a['total']; });
        }

        ob_start();
        if (empty($sections)) {
            echo '<p class="achord-accordion-no-posts">אין עדיין תווים בספרייה.</p>';
            return ob_get_clean();
        }
        ?>
        <div class="achord-accordion-container" dir="rtl">
            <?php foreach ($sections as $sec): ?>
                <h3 class="achord-accordion-section-title">
                    <?php echo esc_html($sec['parent']->name); ?>
                    <span class="ams-tl-count"><?php echo (int)$sec['total']; ?></span>
                </h3>
                <?php foreach ($sec['items'] as $it):
                    $term  = $it['term'];
                    $songs = $it['songs'];
                ?>
                <div class="achord-accordion-item">
                    <div class="achord-accordion-header">
                        <span><?php echo esc_html($term->name); ?> <span class="ams-tl-count">(<?php echo count($songs); ?>)</span></span>
                        <span class="arrow">▼</span>
                    </div>
                    <div class="achord-accordion-content">
                        <ul class="achord-accordion-list">
                            <?php foreach ($songs as $song): ?>
                            <li><a href="<?php echo esc_url(get_permalink($song->ID)); ?>"><?php echo esc_html($song->post_title); ?></a></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                </div>
                <?php endforeach; ?>
            <?php endforeach; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [achord_saved_songs] — רשימת שירים שמורים למשתמש המחובר.
     */
    public function render_saved_songs_shortcode() {
        if (!is_user_logged_in()) {
            return '<p class="ams-notice">יש להתחבר כדי לראות שירים שמורים.</p>';
        }

        $saved_ids = AMS_Saved_Songs_Handler::get_saved_ids();

        ob_start();
        ?>
        <div class="ams-saved-songs" dir="rtl">
            <h2 class="ams-mv-title"><svg class="ams-bookmark-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z"/></svg> שירים שמורים</h2>
            <?php if (empty($saved_ids)): ?>
                <p class="ams-mv-empty">עדיין לא שמרת שירים. לחץ על <svg class="ams-bookmark-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="width:1em;height:1em;vertical-align:middle;"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z"/></svg> בכל שיר כדי לשמור אותו.</p>
            <?php else: ?>
                <p class="ams-saved-count"><?php echo count($saved_ids); ?> שירים שמורים</p>
                <ul class="ams-saved-list">
                    <?php foreach ($saved_ids as $sid):
                        $song = get_post($sid);
                        if (!$song || $song->post_type !== 'achord_song_cpt') continue;
                        $song_url = get_permalink($song->ID);
                        $singers  = get_the_terms($song->ID, 'singer');
                        $singer   = (!empty($singers) && !is_wp_error($singers)) ? $singers[0]->name : '';
                        $genres   = get_the_terms($song->ID, 'genre');
                        $genre    = (!empty($genres) && !is_wp_error($genres)) ? $genres[0]->name : '';
                        $flags    = json_decode(get_post_meta($song->ID, '_achord_content_flags', true) ?: '[]', true);
                    ?>
                    <li class="ams-saved-item" data-song-id="<?php echo esc_attr($song->ID); ?>">
                        <a class="ams-saved-song-link" href="<?php echo esc_url($song_url); ?>">
                            <span class="ams-saved-title"><?php echo esc_html($song->post_title); ?></span>
                            <?php if ($singer): ?>
                            <span class="ams-saved-singer"><?php echo esc_html($singer); ?></span>
                            <?php endif; ?>
                        </a>
                        <div class="ams-saved-badges">
                            <?php if ($genre): ?><span class="ams-saved-badge"><?php echo esc_html($genre); ?></span><?php endif; ?>
                            <?php if (in_array('chords', (array)$flags)): ?><span class="ams-saved-badge">🎸 אקורדים</span><?php endif; ?>
                            <?php if (in_array('score', (array)$flags)): ?><span class="ams-saved-badge">🎼 תווים</span><?php endif; ?>
                            <?php if (in_array('lesson_guitar', (array)$flags) || in_array('lesson_piano', (array)$flags)): ?><span class="ams-saved-badge">🎬 שיעור</span><?php endif; ?>
                        </div>
                        <button type="button" class="ams-saved-remove" data-id="<?php echo esc_attr($song->ID); ?>" title="הסר מהמועדפים">✕</button>
                    </li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>
        </div>
        <script>
        (function() {
            function getNonce() { return (typeof ams_ajax_data !== 'undefined') ? ams_ajax_data.saved_nonce : ''; }
            function getUrl()   { return (typeof ams_ajax_data !== 'undefined') ? ams_ajax_data.ajax_url : '/wp-admin/admin-ajax.php'; }

            document.querySelectorAll('.ams-saved-remove').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id   = this.dataset.id;
                    const item = this.closest('.ams-saved-item');
                    const fd   = new FormData();
                    fd.append('action',  'achord_toggle_saved_song');
                    fd.append('nonce',   getNonce());
                    fd.append('post_id', id);
                    this.disabled = true;
                    fetch(getUrl(), { method: 'POST', body: fd })
                        .then(r => r.json())
                        .then(data => {
                            if (data.success && !data.data.is_saved) {
                                item.style.transition = 'opacity 0.3s';
                                item.style.opacity    = '0';
                                setTimeout(() => item.remove(), 320);
                            } else { this.disabled = false; }
                        })
                        .catch(() => { this.disabled = false; });
                });
            });
        })();
        </script>
        <?php
        return ob_get_clean();
    }

    /**
     * [achord_review_proposals] — ממשק אישור הצעות לעורכים.
     */
    public function render_review_proposals_shortcode() {
        if (!current_user_can('edit_others_posts')) {
            return '<p class="ams-notice">גישה מוגבלת לעורכים בלבד.</p>';
        }

        $proposals = AMS_Edit_Proposal_Handler::get_pending_proposals(100);

        ob_start();
        ?>
        <div class="ams-review-proposals" dir="rtl">
            <h2 class="ams-mv-title">📋 הצעות עריכה ממתינות לאישור</h2>
            <?php if (empty($proposals)): ?>
                <p class="ams-mv-empty">אין הצעות ממתינות כרגע. 🎉</p>
            <?php else: ?>
            <ul class="ams-review-list">
                <?php foreach ($proposals as $pr):
                    $song = get_post($pr->post_parent);
                    if (!$song) continue;
                    $song_title = get_the_title($song->ID);
                    $song_url   = get_permalink($song->ID);
                    $author     = get_userdata($pr->post_author);
                    $submitted  = get_the_date('j.n.Y H:i', $pr);
                    $note       = $pr->post_excerpt;
                ?>
                <?php
                    // חילוץ התוכן הקנוני הנוכחי ([version=normal]...[/version])
                    $canonical_raw = '';
                    if (preg_match('/\[version=normal\](.*?)\[\/version\]/s', $song->post_content, $vm)) {
                        $canonical_raw = trim($vm[1]);
                    }
                    $proposal_raw = trim($pr->post_content);
                ?>
                <li class="ams-review-item"
                    data-proposal-id="<?php echo esc_attr($pr->ID); ?>"
                    data-original="<?php echo esc_attr(wp_json_encode($canonical_raw)); ?>"
                    data-proposed="<?php echo esc_attr(wp_json_encode($proposal_raw)); ?>">
                    <div class="ams-review-meta">
                        <a class="ams-mv-song-link" href="<?php echo esc_url($song_url); ?>"><?php echo esc_html($song_title); ?></a>
                        <span class="ams-review-by">הוצע ע"י <?php echo esc_html($author ? $author->display_name : '—'); ?></span>
                        <span class="ams-mv-date"><?php echo esc_html($submitted); ?></span>
                        <?php if ($note): ?><span class="ams-mv-note">"<?php echo esc_html($note); ?>"</span><?php endif; ?>
                    </div>

                    <div class="ams-diff-toolbar">
                        <button type="button" class="ams-diff-toggle" data-mode="proposal">📄 הצעה בלבד</button>
                        <button type="button" class="ams-diff-toggle active" data-mode="diff">🔍 הצג שינויים</button>
                    </div>

                    <div class="ams-diff-panel">
                        <!-- מתמלא ע"י JS -->
                    </div>
                    <pre class="ams-review-content" style="display:none;"><?php echo esc_html($proposal_raw); ?></pre>

                    <div class="ams-review-actions">
                        <button type="button" class="ams-review-btn ams-review-approve" data-id="<?php echo esc_attr($pr->ID); ?>">✓ אשר</button>
                        <div class="ams-reject-group">
                            <input type="text" class="ams-reject-reason" placeholder="סיבת הדחייה (לא חובה)" maxlength="200" dir="rtl" />
                            <button type="button" class="ams-review-btn ams-review-reject" data-id="<?php echo esc_attr($pr->ID); ?>">✕ דחה</button>
                        </div>
                    </div>
                    <p class="ams-review-status" id="ams-review-status-<?php echo esc_attr($pr->ID); ?>"></p>
                </li>
                <?php endforeach; ?>
            </ul>
            <script>
            (function() {
                // nonce נלקח בזמן הלחיצה ולא בזמן אתחול הסקריפט —
                // ams_ajax_data נטען ב-footer ולכן לא קיים בזמן שה-IIFE רץ
                function getNonce() { return (typeof ams_ajax_data !== 'undefined') ? ams_ajax_data.personal_nonce : ''; }
                function getUrl()   { return (typeof ams_ajax_data !== 'undefined') ? ams_ajax_data.ajax_url : '/wp-admin/admin-ajax.php'; }

                /* ── Line Diff (LCS-based) ── */
                function diffLines(oldLines, newLines) {
                    const m = oldLines.length, n = newLines.length;
                    // Safety: avoid O(m*n) blowup on very large content
                    if (m * n > 200000) return newLines.map(t => ({ type: 'add', text: t }));

                    const dp = [];
                    for (let i = 0; i <= m; i++) { dp[i] = []; for (let j = 0; j <= n; j++) dp[i][j] = 0; }
                    for (let i = 1; i <= m; i++)
                        for (let j = 1; j <= n; j++)
                            dp[i][j] = oldLines[i-1] === newLines[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);

                    const result = [];
                    let i = m, j = n;
                    while (i > 0 || j > 0) {
                        if (i > 0 && j > 0 && oldLines[i-1] === newLines[j-1]) {
                            result.unshift({ type: 'equal', text: oldLines[i-1] });
                            i--; j--;
                        } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
                            result.unshift({ type: 'add', text: newLines[j-1] });
                            j--;
                        } else {
                            result.unshift({ type: 'remove', text: oldLines[i-1] });
                            i--;
                        }
                    }
                    return result;
                }

                function escHtml(s) {
                    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                }

                function renderDiff(item) {
                    const panel    = item.querySelector('.ams-diff-panel');
                    let original, proposed;
                    try {
                        original = JSON.parse(item.dataset.original || '""');
                        proposed = JSON.parse(item.dataset.proposed || '""');
                    } catch (e) {
                        // JSON פגום בפריט בודד לא אמור להפיל את אתחול שאר הפריטים
                        if (panel) panel.innerHTML = '<div class="ams-diff-error">שגיאה בטעינת ההשוואה.</div>';
                        return;
                    }

                    const oldLines = original.split('\n');
                    const newLines = proposed.split('\n');
                    const hunks    = diffLines(oldLines, newLines);

                    const added   = hunks.filter(h => h.type === 'add').length;
                    const removed = hunks.filter(h => h.type === 'remove').length;

                    let html = '<div class="ams-diff-stats">';
                    html    += '<span class="ams-diff-stat-add">+' + added + ' שורות</span> ';
                    html    += '<span class="ams-diff-stat-remove">−' + removed + ' שורות</span>';
                    html    += '</div>';
                    html    += '<div class="ams-diff-table">';

                    for (const h of hunks) {
                        const cls  = h.type === 'equal' ? '' : (h.type === 'add' ? 'ams-diff-add' : 'ams-diff-remove');
                        const sign = h.type === 'equal' ? ' ' : (h.type === 'add' ? '+' : '−');
                        html += '<div class="ams-diff-row ' + cls + '">'
                              + '<span class="ams-diff-sign">' + sign + '</span>'
                              + '<span class="ams-diff-text" dir="rtl">' + escHtml(h.text) + '</span>'
                              + '</div>';
                    }
                    html += '</div>';
                    panel.innerHTML = html;
                }

                function renderProposalOnly(item) {
                    const proposed = JSON.parse(item.dataset.proposed || '""');
                    const panel    = item.querySelector('.ams-diff-panel');
                    let html = '<div class="ams-diff-table">';
                    proposed.split('\n').forEach(line => {
                        html += '<div class="ams-diff-row"><span class="ams-diff-sign"> </span>'
                              + '<span class="ams-diff-text" dir="rtl">' + escHtml(line) + '</span></div>';
                    });
                    html += '</div>';
                    panel.innerHTML = html;
                }

                /* ── Init diff panels ── */
                document.querySelectorAll('.ams-review-item').forEach(item => {
                    renderDiff(item); // default view = diff

                    item.querySelectorAll('.ams-diff-toggle').forEach(btn => {
                        btn.addEventListener('click', function() {
                            item.querySelectorAll('.ams-diff-toggle').forEach(b => b.classList.remove('active'));
                            this.classList.add('active');
                            if (this.dataset.mode === 'diff') renderDiff(item);
                            else renderProposalOnly(item);
                        });
                    });
                });

                /* ── Approve / Reject ── */
                document.querySelectorAll('.ams-review-approve, .ams-review-reject').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const id       = this.dataset.id;
                        const isReject = this.classList.contains('ams-review-reject');
                        const action   = isReject ? 'achord_reject_proposal' : 'achord_approve_proposal';
                        const statusEl = document.getElementById('ams-review-status-' + id);
                        const item     = this.closest('.ams-review-item');
                        const reason   = isReject
                            ? (item.querySelector('.ams-reject-reason')?.value.trim() || '')
                            : '';

                        const fd = new FormData();
                        fd.append('action',      action);
                        fd.append('nonce',       getNonce());
                        fd.append('proposal_id', id);
                        if (reason) fd.append('reason', reason);

                        this.disabled = true;

                        fetch(getUrl(), { method: 'POST', body: fd })
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    item.style.opacity = '0.4';
                                    item.style.pointerEvents = 'none';
                                    if (statusEl) statusEl.textContent = data.data.message;
                                } else {
                                    if (statusEl) { statusEl.textContent = data.data; statusEl.style.color = '#e53935'; }
                                    this.disabled = false;
                                }
                            })
                            .catch(() => {
                                if (statusEl) { statusEl.textContent = 'שגיאת רשת'; statusEl.style.color = '#e53935'; }
                                this.disabled = false;
                            });
                    });
                });
            })();
            </script>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * [achord_user_profile] — עמוד פרופיל מאוחד למשתמש המחובר.
     */
    public function render_user_profile_shortcode() {
        if (!is_user_logged_in()) {
            return '<p class="ams-notice">יש להתחבר כדי לראות את הפרופיל שלך.</p>';
        }

        $user    = wp_get_current_user();
        $user_id = $user->ID;

        // ── סטטיסטיקות ──
        $saved_count    = count(AMS_Saved_Songs_Handler::get_saved_ids($user_id));
        $personals      = AMS_Personal_Version_Handler::get_personal_version(0, $user_id)
                          ? [] // get_personal_version מחזיר פוסט יחיד
                          : [];
        // שליפה ישירה של כל הגרסאות האישיות של המשתמש
        $personal_posts = get_posts([
            'post_type'   => AMS_Personal_Version_Handler::CPT,
            'author'      => $user_id,
            'post_status' => 'publish',
            'numberposts' => -1,
            'no_found_rows' => true,
        ]);
        $personal_count = count($personal_posts);

        $proposals      = AMS_Edit_Proposal_Handler::get_user_proposals($user_id);
        $pending_count  = count(array_filter($proposals, fn($p) => $p->post_status === 'pending'));
        $approved_count = count(array_filter($proposals, fn($p) => $p->post_status === 'publish'));
        $rejected_count = count(array_filter($proposals, fn($p) => $p->post_status === 'trash'));

        // ── URLs לעמודים ──
        $saved_url    = get_permalink(get_page_by_path('saved-songs'))   ?: '#';
        $versions_url = get_permalink(get_page_by_path('my-versions'))   ?: '#';
        $review_url   = current_user_can('edit_others_posts')
                        ? get_permalink(get_page_by_path('review-proposals')) ?: '#'
                        : '';

        ob_start();
        ?>
        <div class="ams-profile" dir="rtl">

            <!-- כרטיס משתמש -->
            <div class="ams-profile-card">
                <div class="ams-profile-avatar">
                    <?php echo get_avatar($user_id, 80, '', '', ['class' => 'ams-avatar-img']); ?>
                </div>
                <div class="ams-profile-info">
                    <h2 class="ams-profile-name"><?php echo esc_html($user->display_name); ?></h2>
                    <p class="ams-profile-email"><?php echo esc_html($user->user_email); ?></p>
                    <p class="ams-profile-since">חבר מ-<?php echo esc_html(date_i18n('F Y', strtotime($user->user_registered))); ?></p>
                    <?php
                    $achord_role = class_exists('AMS_User_Role_Handler')
                        ? AMS_User_Role_Handler::get_role($user_id)
                        : 'follower';
                    $role_labels = [
                        'admin'       => ['label' => 'מנהל',  'class' => 'ams-role--admin'],
                        'editor'      => ['label' => 'עורך',   'class' => 'ams-role--editor'],
                        'contributor' => ['label' => 'תורם',   'class' => 'ams-role--contributor'],
                        'follower'    => ['label' => 'עוקב',   'class' => 'ams-role--follower'],
                    ];
                    if (isset($role_labels[$achord_role])):
                        $rl = $role_labels[$achord_role];
                    ?>
                        <span class="ams-profile-role-badge <?php echo esc_attr($rl['class']); ?>">✦ <?php echo esc_html($rl['label']); ?></span>
                    <?php endif; ?>
                </div>
                <a class="ams-profile-edit-link" href="<?php echo esc_url(get_edit_profile_url($user_id)); ?>">עריכת פרופיל ↗</a>
            </div>

            <!-- כרטיסי סטטיסטיקות -->
            <div class="ams-profile-stats">

                <a class="ams-stat-card" href="<?php echo esc_url($saved_url); ?>">
                    <span class="ams-stat-icon"><svg class="ams-bookmark-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z"/></svg></span>
                    <span class="ams-stat-num"><?php echo $saved_count; ?></span>
                    <span class="ams-stat-label">שירים שמורים</span>
                </a>

                <a class="ams-stat-card" href="<?php echo esc_url($versions_url); ?>">
                    <span class="ams-stat-icon">✏️</span>
                    <span class="ams-stat-num"><?php echo $personal_count; ?></span>
                    <span class="ams-stat-label">גרסאות אישיות</span>
                </a>

                <a class="ams-stat-card" href="<?php echo esc_url($versions_url); ?>#proposals">
                    <span class="ams-stat-icon">📝</span>
                    <span class="ams-stat-num"><?php echo count($proposals); ?></span>
                    <span class="ams-stat-label">הצעות עריכה</span>
                </a>

                <?php if ($review_url): ?>
                <a class="ams-stat-card ams-stat-card--editor" href="<?php echo esc_url($review_url); ?>">
                    <span class="ams-stat-icon">📋</span>
                    <span class="ams-stat-num"><?php echo $pending_count; ?></span>
                    <span class="ams-stat-label">ממתינות לאישור</span>
                </a>
                <?php endif; ?>

            </div>

            <!-- פירוט הצעות -->
            <?php if (!empty($proposals)): ?>
            <div class="ams-profile-section">
                <h3 class="ams-profile-section-title">📝 הצעות העריכה שלי</h3>
                <div class="ams-profile-proposal-summary">
                    <span class="ams-prop-badge ams-prop-pending"><?php echo $pending_count; ?> ממתינות</span>
                    <span class="ams-prop-badge ams-prop-approved"><?php echo $approved_count; ?> אושרו</span>
                    <span class="ams-prop-badge ams-prop-rejected"><?php echo $rejected_count; ?> נדחו</span>
                </div>
                <ul class="ams-profile-proposals-list">
                    <?php foreach (array_slice($proposals, 0, 10) as $pr):
                        $song_title = get_the_title($pr->post_parent);
                        $song_url   = get_permalink($pr->post_parent);
                        $status_map = ['pending' => ['label' => 'ממתין', 'cls' => 'pending'],
                                       'publish' => ['label' => 'אושר',  'cls' => 'approved'],
                                       'trash'   => ['label' => 'נדחה',  'cls' => 'rejected']];
                        $st = $status_map[$pr->post_status] ?? ['label' => $pr->post_status, 'cls' => ''];
                    ?>
                    <li class="ams-profile-proposal-item">
                        <a href="<?php echo esc_url($song_url); ?>" class="ams-profile-proposal-song"><?php echo esc_html($song_title); ?></a>
                        <span class="ams-prop-badge ams-prop-<?php echo esc_attr($st['cls']); ?>"><?php echo esc_html($st['label']); ?></span>
                        <span class="ams-profile-proposal-date"><?php echo esc_html(get_the_date('j.n.Y', $pr)); ?></span>
                    </li>
                    <?php endforeach; ?>
                    <?php if (count($proposals) > 10): ?>
                        <li><a href="<?php echo esc_url($versions_url); ?>#proposals">הצג את כל ההצעות →</a></li>
                    <?php endif; ?>
                </ul>
            </div>
            <?php endif; ?>

        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * מחזיר HTML של badge/תגית לפי מצב הבארה של השיר.
     */
    public function get_barre_badge( int $post_id ): string {
        $status = get_post_meta( $post_id, '_ams_barre_status', true );

        switch ( $status ) {
            // גרסה בינונית (ומעלה) — הודעה משולבת בראש השיר.
            case 'medium_only':
            case 'has_barre':
                return '<div class="ams-version-note ams-version-note--medium" style="display:none;">'
                     . '<strong class="ams-version-note__title">גרסה בינונית</strong>'
                     . '<span class="ams-version-note__text">פישטנו את האקורדים עד כמה שאפשר, אך השיר עדיין כולל אקורדים מתקדמים — מתאים לנגנים ברמת ביניים, פחות למתחילים.</span>'
                     . '</div>';
            // דרגות הגרסה הקלה (barre_free / one_f / one_bm / few_semi) ו-none —
            // ללא הודעה למעלה; כפתור-הכוכב משנה צבע כשהוא לחוץ.
            default:
                return '';
        }
    }
}