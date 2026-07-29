<?php
/**
 * front-page.php — עמוד הבית של unichord ("החופש לנגן")
 * Achord Child Theme
 */
get_header();

/* ── ספירת שירים כוללת (לתת-כותרת ה-hero) ── */
$uc_total = wp_count_posts( 'achord_song_cpt' );
$uc_total = isset( $uc_total->publish ) ? (int) $uc_total->publish : 0;

/* ── ז'אנרים מובילים ל-chips ── */
$uc_genres = get_terms( [
    'taxonomy'   => 'genre',
    'hide_empty' => true,
    'orderby'    => 'count',
    'order'      => 'DESC',
    'number'     => 10,
] );

/* ── שירים מומלצים: בחירה אקראית מבין שירי האקורדים ── */
$uc_featured = new WP_Query( [
    'post_type'      => 'achord_song_cpt',
    'posts_per_page' => 6,
    'post_status'    => 'publish',
    'orderby'        => 'rand',
    'no_found_rows'  => true,
    'meta_query'     => [ [ 'key' => '_achord_content_flags', 'value' => 'chords', 'compare' => 'LIKE' ] ],
] );
?>

<main id="achord-homepage" class="achord-homepage" role="main">

    <!-- ══ HERO ══ -->
    <header class="uc-hero">
        <div class="uc-hero__bg" aria-hidden="true"></div>
        <div class="uc-hero__inner">
            <span class="uc-hero__slogan">החופש לנגן</span>
            <h1 class="uc-hero__title">אקורדים לשירי <span class="uc-underline">ארץ ישראל</span></h1>
            <p class="uc-hero__sub">
                מצאו שיר, קחו גיטרה, תתחילו.
                <?php if ( $uc_total > 100 ) : ?>
                    <b><?php echo esc_html( number_format_i18n( $uc_total ) ); ?></b> שירים עם אקורדים, מילים, תווים ושיעורים — חינם לגמרי.
                <?php else : ?>
                    אקורדים, מילים, תווים ושיעורים לשירים שגדלנו עליהם — חינם לגמרי.
                <?php endif; ?>
            </p>
            <div class="uc-hero__search"><?php echo do_shortcode( '[achord_song_search]' ); ?></div>
            <p class="uc-hero__note">בלי הרשמה · בלי פרסומות · קוד פתוח</p>
        </div>
    </header>

    <!-- ══ ערכים / בידול ══ -->
    <section class="uc-values" aria-label="למה unichord">
        <div class="uc-value">
            <span class="uc-value__icon" aria-hidden="true">🎁</span>
            <span class="uc-value__title">חינם לתמיד</span>
            <span class="uc-value__desc">בלי תשלום ובלי פרסומות. הכול פתוח לכולם.</span>
        </div>
        <div class="uc-value">
            <span class="uc-value__icon" aria-hidden="true">📖</span>
            <span class="uc-value__title">מספר האקורדים הישראלי</span>
            <span class="uc-value__desc">מבוסס על מאות שירי מופת של ארץ ישראל.</span>
        </div>
        <div class="uc-value">
            <span class="uc-value__icon" aria-hidden="true">🎼</span>
            <span class="uc-value__title">לא רק אקורדים</span>
            <span class="uc-value__desc">אקורדים, תווים ושיעורי וידאו לאותו שיר.</span>
        </div>
        <div class="uc-value">
            <span class="uc-value__icon" aria-hidden="true">🤝</span>
            <span class="uc-value__title">נבנה בידי קהילה</span>
            <span class="uc-value__desc">המאגר גדל ומשתפר בכל יום — בזכותכם.</span>
        </div>
    </section>

    <p class="uc-kicker">— בחרתם כלי, עכשיו רק נשאר לבחור מאיפה מתחילים</p>

    <!-- ══ ז'אנרים מהירים ══ -->
    <?php if ( ! empty( $uc_genres ) && ! is_wp_error( $uc_genres ) ) : ?>
    <section class="uc-section" aria-label="דפדוף לפי סגנון">
        <div class="uc-section__head">
            <h2 class="uc-section__title">דפדפו לפי סגנון</h2>
            <a class="uc-section__link" href="#section-shirim">כל הז'אנרים ←</a>
        </div>
        <div class="uc-chips">
            <?php foreach ( $uc_genres as $g ) :
                $link = get_term_link( $g );
                if ( is_wp_error( $link ) ) continue; ?>
                <a class="uc-chip" href="<?php echo esc_url( $link ); ?>">
                    <?php echo esc_html( $g->name ); ?>
                    <span class="uc-chip__count"><?php echo esc_html( number_format_i18n( $g->count ) ); ?></span>
                </a>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <!-- ══ שירים לנגן (מומלצים) ══ -->
    <?php if ( $uc_featured->have_posts() ) : ?>
    <section class="uc-section" aria-label="שירים לנגן">
        <div class="uc-section__head">
            <h2 class="uc-section__title">שירים לנגן עכשיו</h2>
        </div>
        <div class="uc-cards">
            <?php while ( $uc_featured->have_posts() ) : $uc_featured->the_post();
                echo uc_render_song_card( get_the_ID() );
            endwhile; wp_reset_postdata(); ?>
        </div>
    </section>
    <?php endif; ?>

    <!-- ══ דלתות: תווים + שירים קלים ══ -->
    <section class="uc-section" aria-label="עוד ב-unichord">
        <div class="uc-doors">
            <a class="uc-door" href="<?php echo esc_url( home_url( '/tavim-library/' ) ); ?>">
                <span class="uc-door__icon"><?php echo achord_menu_icon( 'score' ); ?></span>
                <span class="uc-door__body">
                    <span class="uc-door__title">ספריית תווים</span>
                    <span class="uc-door__desc">תווים מלאים לפסנתר, גיטרה וחליל</span>
                </span>
            </a>
            <a class="uc-door" href="<?php echo esc_url( home_url( '/level/' . rawurlencode( 'קל' ) . '/' ) ); ?>">
                <span class="uc-door__icon"><?php echo achord_menu_icon( 'music' ); ?></span>
                <span class="uc-door__body">
                    <span class="uc-door__title">מתחילים כאן</span>
                    <span class="uc-door__desc">שירים קלים לנגינה — מושלם לצעדים הראשונים</span>
                </span>
            </a>
        </div>
    </section>

    <!-- ══ הצטרפו: בנייה משותפת ══ -->
    <section class="uc-section" aria-label="הצטרפו לקהילה">
        <div class="uc-cta-band">
            <div class="uc-cta-band__bg" aria-hidden="true"></div>
            <div class="uc-cta-band__inner">
                <h2 class="uc-cta-band__title">המאגר הזה נבנה בזכותכם</h2>
                <p class="uc-cta-band__sub">
                    חסר שיר? מכירים את האקורדים? יש לכם שיעור להעלות? הוסיפו אותו —
                    השם שלכם יופיע בעמוד השיר, והוא יישאר חופשי לכל מי שיבוא אחריכם.
                </p>
                <div class="uc-btn-row">
                    <a class="uc-btn uc-btn--primary" href="<?php echo esc_url( home_url( '/add-song/' ) ); ?>">הוסיפו שיר</a>
                    <a class="uc-btn uc-btn--ghost" href="<?php echo esc_url( home_url( '/requests/' ) ); ?>">בקשו שיר חסר</a>
                </div>
            </div>
        </div>
    </section>

    <!-- ══ אקורדיון ז'אנרים מלא ══ -->
    <section class="achord-home-section" id="section-shirim">
        <div class="achord-section-header">
            <span class="achord-section-icon" aria-hidden="true">🎸</span>
            <h2 class="achord-section-title">כל השירים לפי קטגוריה</h2>
        </div>
        <div class="achord-section-body">
            <?php echo do_shortcode('[achord_categorized_accordion]'); ?>
        </div>
    </section>

</main>

<?php get_footer(); ?>
