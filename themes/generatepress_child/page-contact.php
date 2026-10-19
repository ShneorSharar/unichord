<?php
/**
 * page-contact.php — "יצירת קשר" של unichord
 * נטען אוטומטית לעמוד עם ה-slug "contact".
 * התוכן הישן (HTML) נשמר ב-DB וניתן לשחזור — ראה _backups/.../pages/page_754.html.
 * עיצוב בטוקני --uc-* (ראה achord-child.css, בלוק "עמודי תוכן/שיווק").
 *
 * טופס "צור קשר": shortcode [uc_contact_form] מ-mu-plugins/uc-contact-form.php (9.10.26).
 * אם ה-mu-plugin הוסר, ה-shortcode לא קיים ומוצג במקומו הבאנר הישן (ראה הבלוק "שליחת הודעה").
 */
if ( ! defined( 'ABSPATH' ) ) exit;

$uc_home  = home_url( '/' );
$uc_add   = home_url( '/add-song/' );
$uc_req   = home_url( '/requests/' );
$uc_guide = home_url( '/madrich/' );
$uc_contr = home_url( '/contributors/' );

get_header();
?>

<main class="uc-page" role="main" dir="rtl">

  <!-- ══ HERO ══ -->
  <header class="uc-phero">
    <div class="uc-phero__bg" aria-hidden="true"></div>
    <div class="uc-phero__inner">
      <span class="uc-phero__eyebrow">יצירת קשר</span>
      <h1 class="uc-phero__title">נשמח <span>לשמוע מכם</span></h1>
      <p class="uc-phero__sub">
        שאלה, הצעה, שיר שחסר או סתם מילה טובה. אנחנו קוראים הכול.
        את רוב הדברים אפשר לעשות ישירות מהאתר, בקליק, בלי להמתין לתשובה.
      </p>
    </div>
  </header>

  <div class="uc-prose">

    <!-- ══ ערוצים מהירים מהאתר ══ -->
    <h2>הכי מהר, ישירות מהאתר</h2>
    <p>חלק גדול מהפניות נפתרות מיד, בלי תור ובלי המתנה. הנה הדרכים המהירות:</p>
    <div class="uc-feature-grid">
      <div class="uc-feature">
        <span class="uc-feature__icon"><?php echo ams_icon( 'plus' ); ?></span>
        <div class="uc-feature__title">שיר שחסר?</div>
        <div class="uc-feature__desc">הוסיפו אותו בעצמכם בעורך הפשוט, או בקשו מהקהילה. <a href="<?php echo esc_url( $uc_add ); ?>">להוספת שיר ←</a> · <a href="<?php echo esc_url( $uc_req ); ?>">לבקשת שיר ←</a></div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon"><?php echo ams_icon( 'pencil' ); ?></span>
        <div class="uc-feature__title">אקורד או מילה שגויים?</div>
        <div class="uc-feature__desc">בכל דף שיר יש כפתור "הצעת תיקון" (לאחר התחברות). סמנו את הטעות, ואנחנו נבדוק ונעדכן.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon"><?php echo ams_icon( 'handshake' ); ?></span>
        <div class="uc-feature__title">רוצים לתרום?</div>
        <div class="uc-feature__desc">כל תרומה של שיר, תווים או שיעור מקבלת קרדיט ונשארת חופשית לכולם. <a href="<?php echo esc_url( $uc_guide ); ?>">איך תורמים ←</a></div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon"><?php echo ams_icon( 'book-open' ); ?></span>
        <div class="uc-feature__title">לא בטוחים איך?</div>
        <div class="uc-feature__desc">רוב התשובות כבר נמצאות במדריך השימוש, צעד-אחר-צעד. <a href="<?php echo esc_url( $uc_guide ); ?>">למדריך ←</a></div>
      </div>
    </div>

    <!-- ══ שליחת הודעה (טופס) ══
         [uc_contact_form] מוגדר ב-mu-plugins/uc-contact-form.php. אם הקובץ הוסר, מוצג הבאנר הישן. -->
    <?php if ( shortcode_exists( 'uc_contact_form' ) ) : ?>
    <?php echo do_shortcode( '[uc_contact_form]' ); ?>
    <?php else : ?>
    <div class="uc-cta-band">
      <div class="uc-cta-band__bg" aria-hidden="true"></div>
      <div class="uc-cta-band__inner">
        <h2 class="uc-cta-band__title">משהו אחר על הלב?</h2>
        <p class="uc-cta-band__sub">
          טופס יצירת הקשר בדרך. בינתיים, אם חסר שיר, ספרו לנו דרך עמוד בקשות השירים,
          ואנחנו או הקהילה נדאג לו.
        </p>
        <div class="uc-btn-row">
          <a class="uc-btn uc-btn--primary" href="<?php echo esc_url( $uc_req ); ?>">לבקשות השירים</a>
          <a class="uc-btn uc-btn--ghost" href="<?php echo esc_url( $uc_contr ); ?>">הצטרפו לתורמים</a>
        </div>
      </div>
    </div>
    <?php endif; ?>

  </div>
</main>

<?php get_footer(); ?>
