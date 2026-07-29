<?php
/**
 * page-requests.php — עמוד "בקשות שירים" של unichord
 * נטען אוטומטית לעמוד עם ה-slug "requests".
 * טופס + רשימת בקשות מהפלאגין: shortcode [achord_song_requests].
 */
if ( ! defined( 'ABSPATH' ) ) exit;

get_header();
?>

<main class="uc-page" role="main" dir="rtl">

  <header class="uc-phero">
    <div class="uc-phero__bg" aria-hidden="true"></div>
    <div class="uc-phero__inner">
      <span class="uc-phero__eyebrow">בקשות שירים</span>
      <h1 class="uc-phero__title">חסר לכם שיר? <span>בקשו אותו</span></h1>
      <p class="uc-phero__sub">
        לא מצאתם שיר במאגר? ספרו לנו איזה. ככל שיותר אנשים מבקשים שיר — כך הוא עולה גבוה יותר
        ברשימה, והקהילה מוסיפה אותו מהר יותר. חינם, וגלוי לכולם.
      </p>
    </div>
  </header>

  <div class="uc-prose">
    <?php echo do_shortcode( '[achord_song_requests]' ); ?>
  </div>
</main>

<?php get_footer(); ?>
