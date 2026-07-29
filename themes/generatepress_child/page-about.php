<?php
/**
 * page-about.php — "אודות" של unichord
 * נטען אוטומטית לעמוד עם ה-slug "about".
 * התוכן הישן (HTML) נשמר ב-DB וניתן לשחזור — ראה _backups/.../pages/page_697.html.
 * עיצוב בטוקני --uc-* (ראה achord-child.css, בלוק "עמודי תוכן/שיווק").
 */
if ( ! defined( 'ABSPATH' ) ) exit;

$uc_total = wp_count_posts( 'achord_song_cpt' );
$uc_total = isset( $uc_total->publish ) ? (int) $uc_total->publish : 0;

$uc_home    = home_url( '/' );
$uc_add     = home_url( '/add-song/' );
$uc_guide   = home_url( '/madrich/' );
$uc_contact = home_url( '/contact/' );

get_header();
?>

<main class="uc-page" role="main" dir="rtl">

  <!-- ══ HERO ══ -->
  <header class="uc-phero">
    <div class="uc-phero__bg" aria-hidden="true"></div>
    <div class="uc-phero__inner">
      <span class="uc-phero__eyebrow">אודות</span>
      <h1 class="uc-phero__title">המוזיקה הישראלית <span>שייכת לכולם</span></h1>
      <p class="uc-phero__sub">
        unichord הוא בית פתוח לשירי ארץ ישראל — אקורדים, מילים, תווים ושיעורים.
        חינם, בלי פרסומות, ובקוד פתוח. כי לכל אחד מגיע לנגן את השירים שהוא אוהב.
      </p>
    </div>
  </header>

  <div class="uc-prose">

    <!-- ══ סיפור ══ -->
    <h2>למה הקמנו את unichord</h2>
    <p>
      רצינו מקום אחד שבו אפשר פשוט למצוא שיר ולנגן אותו — בלי חומות תשלום, בלי פרסומות שקופצות באמצע
      הבית השני, ובלי להירשם רק כדי לראות אקורד. האתרים הגדולים נהדרים, אבל חלק מהכלים שהכי עוזרים ללמוד
      (להאט שיר, ללופ על קטע, גרסה קלה) נמצאים מאחורי מנוי. אצלנו <strong>הכלים האלה חינמיים</strong> —
      כי המטרה שלנו היא שתנגנו, לא שתשלמו.
    </p>
    <p>
      הבסיס שלנו הוא <strong>ספר האקורדים הישראלי</strong> — אוצר של מאות שירי מופת שליווה דורות של נגנים.
      על הבסיס הזה אנחנו בונים, ביחד עם קהילה של נגנים, מורים וחובבי מוזיקה, את ספריית האקורדים החופשית
      הגדולה בישראל.
    </p>

    <!-- ══ מספרים ══ -->
    <div class="uc-stats">
      <div class="uc-stat">
        <div class="uc-stat__num"><?php echo $uc_total > 100 ? esc_html( number_format_i18n( $uc_total ) ) : 'מאות'; ?></div>
        <div class="uc-stat__label">שירים במאגר</div>
      </div>
      <div class="uc-stat">
        <div class="uc-stat__num">100%</div>
        <div class="uc-stat__label">חינם, תמיד</div>
      </div>
      <div class="uc-stat">
        <div class="uc-stat__num">0</div>
        <div class="uc-stat__label">פרסומות</div>
      </div>
    </div>

    <!-- ══ מה מייחד אותנו ══ -->
    <h2>מה מייחד אותנו</h2>
    <div class="uc-feature-grid">
      <div class="uc-feature">
        <span class="uc-feature__icon">🎁</span>
        <div class="uc-feature__title">חינם לתמיד</div>
        <div class="uc-feature__desc">כל פונקציה באתר — כולל כאלה שיתווספו בעתיד — נשארת חינמית, בלי פרסומות ובלי תשלום נסתר. זו ההתחייבות שלנו.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🔓</span>
        <div class="uc-feature__title">קוד פתוח</div>
        <div class="uc-feature__desc">האתר נבנה כפרויקט קוד פתוח. כל אחד מוזמן לראות, ללמוד ולתרום — כי כלי שמשרת את כולם צריך להיות שקוף לכולם.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🎼</span>
        <div class="uc-feature__title">ללמוד, לא רק לקרוא</div>
        <div class="uc-feature__desc">לכל שיר — אקורדים מעל המילים, תווים שאפשר להשמיע, וגם שיעורי וידאו. מהצליל הראשון ועד לנגן את כל השיר.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🤝</span>
        <div class="uc-feature__title">הקהילה במרכז</div>
        <div class="uc-feature__desc">המאגר גדל ומשתפר בזכות נגנים ומורים שמוסיפים שירים, מתקנים טעויות ומעלים שיעורים. כל תרומה מקבלת קרדיט בעמוד השיר ונשארת חינמית לכולם.</div>
      </div>
    </div>

    <!-- ══ חזון מאגר פתוח ══ -->
    <h2>החזון: מאגר פתוח לכולם</h2>
    <p>
      אנחנו מאמינים ששירי הזמר העברי הם נכס תרבותי משותף — והם צריכים להיות נגישים בחופשיות לכל מי
      שרוצה לנגן, ללמוד או ללמד. המטרה שלנו היא להפוך את מאגר השירים למשאב פתוח ככל שניתן, תוך כיבוד מלא
      של זכויות היוצרים והיוצרים. אנחנו פועלים מול הגורמים הרלוונטיים כדי לעשות זאת נכון — בהדרגה ובאחריות.
    </p>
    <p>
      בינתיים, מה שכבר כאן פתוח לכם להשתמש, ללמוד ולתרום. וזה רק הולך וגדל.
    </p>
    <p>
      יש לכם שאלה, הצעה, או שאתם רוצים לעזור בדרך אחרת? נשמח לשמוע —
      <a href="<?php echo esc_url( $uc_contact ); ?>">כתבו לנו ←</a>
    </p>

    <!-- ══ CTA ══ -->
    <div class="uc-cta-band">
      <div class="uc-cta-band__bg" aria-hidden="true"></div>
      <div class="uc-cta-band__inner">
        <h2 class="uc-cta-band__title">בואו לבנות את זה איתנו</h2>
        <p class="uc-cta-band__sub">
          מישהו מחפש בדיוק עכשיו שיר שעוד לא אצלנו. תהיו אלה שמוסיפים אותו — השם שלכם יופיע בעמוד, והשיר יישאר חופשי לכולם.
        </p>
        <div class="uc-btn-row">
          <a class="uc-btn uc-btn--primary" href="<?php echo esc_url( $uc_add ); ?>">הוסיפו שיר</a>
          <a class="uc-btn uc-btn--ghost" href="<?php echo esc_url( $uc_guide ); ?>">איך זה עובד?</a>
        </div>
      </div>
    </div>

  </div>
</main>

<?php get_footer(); ?>
