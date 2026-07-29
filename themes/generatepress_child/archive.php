<?php
/**
 * archive.php — ארכיון ז'אנר / אמן / רמה / תווים (unichord)
 * מציג שירים ככרטיסי unichord במקום רשימת הבלוג הגנרית של GeneratePress.
 */
get_header();

global $wp_query;
$uc_term  = get_queried_object();
$uc_count = (int) $wp_query->found_posts;

/* תווית סוג הטקסונומיה (ז'אנר / מבצע / רמה …) */
$uc_kind = '';
if ( $uc_term && isset( $uc_term->taxonomy ) ) {
    $tax_obj = get_taxonomy( $uc_term->taxonomy );
    $labels  = [ 'genre' => 'ז\'אנר', 'singer' => 'מבצע', 'level' => 'רמת קושי', 'tune_category' => 'תווים' ];
    $uc_kind = isset( $labels[ $uc_term->taxonomy ] ) ? $labels[ $uc_term->taxonomy ]
               : ( $tax_obj ? $tax_obj->labels->singular_name : '' );
}
$uc_title = $uc_term && isset( $uc_term->name ) ? $uc_term->name : get_the_archive_title();
$uc_desc  = $uc_term && isset( $uc_term->description ) ? $uc_term->description : '';
?>

<main id="achord-homepage" class="achord-homepage achord-archive" role="main">

    <!-- ══ כותרת ארכיון ══ -->
    <header class="uc-archive-hero">
        <div class="uc-archive-hero__bg" aria-hidden="true"></div>
        <div class="uc-archive-hero__inner">
            <a class="uc-archive-hero__back" href="<?php echo esc_url( home_url( '/' ) ); ?>">← לכל השירים</a>
            <?php if ( $uc_kind ) : ?>
                <span class="uc-archive-hero__kind"><?php echo esc_html( $uc_kind ); ?></span>
            <?php endif; ?>
            <h1 class="uc-archive-hero__title"><?php echo esc_html( $uc_title ); ?></h1>
            <?php if ( $uc_count ) : ?>
                <p class="uc-archive-hero__count"><?php echo esc_html( number_format_i18n( $uc_count ) ); ?> שירים</p>
            <?php endif; ?>
            <?php if ( $uc_desc ) : ?>
                <p class="uc-archive-hero__desc"><?php echo esc_html( $uc_desc ); ?></p>
            <?php endif; ?>
        </div>
    </header>

    <!-- ══ רשימת שירים ══ -->
    <?php if ( have_posts() ) : ?>
        <div class="uc-cards uc-cards--archive">
            <?php while ( have_posts() ) : the_post();
                echo uc_render_song_card( get_the_ID() );
            endwhile; ?>
        </div>

        <?php
        $uc_pagination = paginate_links( [
            'mid_size'  => 1,
            'prev_text' => '→ הקודם',
            'next_text' => 'הבא ←',
            'type'      => 'list',
        ] );
        if ( $uc_pagination ) : ?>
            <nav class="uc-pagination" aria-label="ניווט עמודים"><?php echo $uc_pagination; ?></nav>
        <?php endif; ?>

    <?php else : ?>
        <p class="uc-archive-empty">לא נמצאו שירים בקטגוריה זו.</p>
    <?php endif; ?>

</main>

<?php get_footer(); ?>
