<?php
/**
 * 404.php — עמוד שגיאה
 * Achord Child Theme
 */
get_header();
?>

<main id="achord-404" class="achord-404" role="main">
    <div class="achord-404__inner">
        <div class="achord-404__code">404</div>
        <h1 class="achord-404__title">העמוד לא נמצא</h1>
        <p class="achord-404__text">הדף שחיפשת אינו קיים. אולי הוא הועבר או שהכתובת שגויה.</p>
        <a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="achord-404__btn">
            חזרה לדף הבית
        </a>
        <p class="achord-404__text" style="margin-top:18px">חיפשתם שיר שלא מצאתם? <a href="<?php echo esc_url( home_url( '/requests/' ) ); ?>">בקשו שנוסיף אותו ←</a></p>
    </div>
</main>

<?php get_footer(); ?>
