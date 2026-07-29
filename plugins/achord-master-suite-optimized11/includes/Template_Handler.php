<?php
if (!defined('ABSPATH')) exit;

/**
 * Class AMS_Template_Handler
 * שולט על התצוגה של תבניות עמוד ייעודיות (למשל, עמוד שיעור ותווים).
 */
class AMS_Template_Handler {

    private $shortcode_handler;

    public function __construct($shortcode_handler_instance) {
        $this->shortcode_handler = $shortcode_handler_instance;
        add_filter('the_content', [$this, 'modify_content'], 20);
        add_action('wp_footer', [$this, 'add_related_posts_footer']);
    }

    public function modify_content($content) {
        if (!in_the_loop() || !is_main_query()) return $content;

        // בניית תבנית עמוד שיעור
        if (is_singular('lesson')) {
            add_filter('the_title', '__return_empty_string', 100);
            $html = $this->build_lesson_page_html();
            remove_filter('the_title', '__return_empty_string', 100);
            return $html;
        }

        // הוספת באנר לעמוד שיר
        if (is_singular('achord_song_cpt')) {
            add_filter('the_title', '__return_empty_string', 100);
            $banner_html = $this->build_song_page_banner();
            remove_filter('the_title', '__return_empty_string', 100);
            return $banner_html . $content;
        }
        
        // ========== התיקון כאן: הוספת הלוגיקה החסרה ==========
        // הזרקה אוטומטית של נגן התווים לעמודי תווים
        if (is_singular('tavim_score')) {
            // קריאה לשורטקוד כדי לייצר את הנגן ולהעביר את הנתונים ל-JS
            $player_html = do_shortcode('[tavim_player id="' . get_the_ID() . '"]');
            return $content . $player_html;
        }
        // =======================================================

        return $content;
    }
    
    public function add_related_posts_footer() {
    if (is_singular('achord_song_cpt')) {
        echo '<footer class="achord-main-footer">';
        
        // המלצות שירים (קיים)
        $related_posts_html = $this->shortcode_handler->get_related_posts_html(get_the_ID());
        echo '<div class="related-posts-container">' . $related_posts_html . '</div>';
        
        // קישורי פוטר (חדש)
        echo $this->shortcode_handler->get_footer_links_html();
        
        echo '</footer>';
    }
}

    private function build_lesson_page_html() {
        ob_start();
        $post_id = get_the_ID();
        $song_post_id = function_exists('get_field') ? get_field('related_chords_post', $post_id) : get_post_meta($post_id, 'related_chords_post', true);
        ?>
        <article class="achord-display-article lesson-article">
            <header class="lesson-header">
                <div class="achord-title-row">
                    <?php 
                    $title_text = 'שיעור שיר: <span class="achord-title">' . esc_html(get_the_title($song_post_id ?: $post_id)) . '</span>';
                    $performer_terms = get_the_terms($song_post_id, 'singer');
                    if ($performer_terms && !is_wp_error($performer_terms)) {
                        $title_text .= ' <span class="achord-performer">של ' . esc_html($performer_terms[0]->name) . '</span>';
                    }
                    echo $title_text;
                    ?>
                </div>
                <?php $level_terms = get_the_terms($song_post_id, 'level');
                if ($level_terms && !is_wp_error($level_terms)) echo '<div class="lesson-difficulty">רמת קושי: ' . esc_html($level_terms[0]->name) . '</div>'; ?>
            </header>
            <div class="lesson-author-box">
                <?php echo get_avatar(get_the_author_meta('ID'), 80); ?>
                <div class="lesson-author-info">
                    <span class="author-byline">שיעור מאת:</span>
                    <p class="author-name"><?php the_author_posts_link(); ?></p>
                    <p class="author-description"><?php echo wp_kses_post(get_the_author_meta('description')); ?></p>
                    <a href="<?php echo esc_url(get_author_posts_url(get_the_author_meta('ID'))); ?>" class="author-more-link">שיעורים נוספים</a>
                </div>
            </div>
            <?php $video_url = function_exists('get_field') ? get_field('lesson_video', $post_id) : get_post_meta($post_id, 'lesson_video', true);
            if ($video_url) echo '<section class="lesson-section lesson-video-section"><div class="lesson-video-wrapper">' . wp_oembed_get($video_url) . '</div></section>';
            
            if ($song_post_id) {
                $chords_post_content = get_post_field('post_content', $song_post_id);
                echo '<section class="lesson-section">' . do_shortcode($chords_post_content) . '</section>';
            }
            $related_tavim_id = get_post_meta($post_id, '_related_tavim_id', true);
            if ($related_tavim_id) {
                echo '<section class="lesson-section"><h3>תווים</h3>' . do_shortcode('[tavim_player id="' . $related_tavim_id . '"]') . '</section>';
            }
            ?>
            <footer class="lesson-footer">
                <?php echo $this->shortcode_handler->get_related_posts_html($song_post_id); ?>
            </footer>
        </article>
        <?php
        return ob_get_clean();
    }
    
    private function build_song_page_banner() {
        $related_lesson_id = get_post_meta(get_the_ID(), '_related_lesson_id', true);
        
        // בדיקה אם קיים שיעור מקושר
        if ($related_lesson_id) {
            // בדיקה נוספת: האם לשיעור יש ווידאו?
            $lesson_video_url = function_exists('get_field') 
                ? get_field('lesson_video', $related_lesson_id) 
                : get_post_meta($related_lesson_id, 'lesson_video', true);
            
            // רק אם יש גם שיעור וגם ווידאו - הצג את הבאנר
            if (!empty($lesson_video_url)) {
                return '<div class="lesson-link-banner"><a href="' . esc_url(get_permalink($related_lesson_id)) . '">🎵&nbsp; רוצה ללמוד איך לנגן? לחץ כאן לצפייה בשיעור המלא</a></div>';
            }
        }
        
        return '';
    }
}