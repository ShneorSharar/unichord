<?php
/**
 * page-contributors.php — עמוד "תורמים" של unichord
 * נטען אוטומטית לעמוד עם ה-slug "contributors".
 * רשימת התורמים מגיעה מהפלאגין: shortcode [achord_contributors].
 */
if ( ! defined( 'ABSPATH' ) ) exit;

$uc_add   = home_url( '/add-song/' );
$uc_guide = home_url( '/madrich/' );

get_header();
?>

<main class="uc-page" role="main" dir="rtl">

  <header class="uc-phero">
    <div class="uc-phero__bg" aria-hidden="true"></div>
    <div class="uc-phero__inner">
      <span class="uc-phero__eyebrow">קהילה</span>
      <h1 class="uc-phero__title">האנשים ש<span>בונים</span> את unichord</h1>
      <p class="uc-phero__sub">
        כל שיר, כל תיקון וכל שיעור כאן הם מתנה של מישהו לנגן הבא. אלה האנשים שמרחיבים את המאגר
        החופשי — והשם של כל אחד מהם מופיע גם בעמודי השירים שתרמו להם.
      </p>
    </div>
  </header>

  <div class="uc-prose">
    <?php echo do_shortcode( '[achord_contributors]' ); ?>

    <div class="uc-cta-band">
      <div class="uc-cta-band__bg" aria-hidden="true"></div>
      <div class="uc-cta-band__inner">
        <h2 class="uc-cta-band__title">רוצים להופיע כאן?</h2>
        <p class="uc-cta-band__sub">הוסיפו שיר, תקנו אקורד או העלו שיעור — והצטרפו לאנשים שבונים את המאגר החופשי לשירי ארץ ישראל.</p>
        <div class="uc-btn-row">
          <a class="uc-btn uc-btn--primary" href="<?php echo esc_url( $uc_add ); ?>">הוסיפו שיר</a>
          <a class="uc-btn uc-btn--ghost" href="<?php echo esc_url( $uc_guide ); ?>">איך תורמים?</a>
        </div>
      </div>
    </div>
  </div>
</main>

<?php get_footer(); ?>
