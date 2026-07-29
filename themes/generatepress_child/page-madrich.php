<?php
/**
 * page-madrich.php — "מדריך השימוש" של unichord
 * נטען אוטומטית לעמוד עם ה-slug "madrich".
 * עיצוב בטוקני --uc-* (ראה achord-child.css, בלוק "עמודי תוכן/שיווק").
 */
if ( ! defined( 'ABSPATH' ) ) exit;

$uc_total = wp_count_posts( 'achord_song_cpt' );
$uc_total = isset( $uc_total->publish ) ? (int) $uc_total->publish : 0;

$uc_home   = home_url( '/' );
$uc_tavim  = home_url( '/tavim-library/' );
$uc_add    = home_url( '/add-song/' );
$uc_saved  = home_url( '/saved-songs/' );
$uc_login  = home_url( '/login/' );

get_header();
?>

<main class="uc-page" role="main" dir="rtl">

  <!-- ══ HERO ══ -->
  <header class="uc-phero">
    <div class="uc-phero__bg" aria-hidden="true"></div>
    <div class="uc-phero__inner">
      <span class="uc-phero__eyebrow">מדריך השימוש</span>
      <h1 class="uc-phero__title">איך מתחילים <span>לנגן</span> ב-unichord</h1>
      <p class="uc-phero__sub">
        מצאתם שיר, פתחתם אותו — וכל הכלים כבר מחכים: אקורדים מעל המילים, שינוי סולם בלחיצה,
        גרסה קלה למתחילים, תווים ושיעורי וידאו. הנה כל מה שצריך לדעת.
      </p>
    </div>
  </header>

  <div class="uc-prose">

    <!-- ══ 3 צעדים ראשונים ══ -->
    <h2>בשלושה צעדים</h2>
    <div class="uc-steps">
      <div class="uc-step">
        <span class="uc-step__num"></span>
        <div class="uc-step__body">
          <div class="uc-step__title">מצאו שיר</div>
          <div class="uc-step__desc">
            הקלידו שם שיר או אמן בתיבת החיפוש שב<a href="<?php echo esc_url( $uc_home ); ?>">עמוד הבית</a>,
            או דפדפו לפי סגנון (פופ, רוק, ים-תיכוני) ולפי רמת קושי.
          </div>
        </div>
      </div>
      <div class="uc-step">
        <span class="uc-step__num"></span>
        <div class="uc-step__body">
          <div class="uc-step__title">פתחו את דף השיר</div>
          <div class="uc-step__desc">
            האקורדים מופיעים בדיוק מעל המילה שבה מנגנים אותם. לחיצה על אקורד פותחת דיאגרמה
            לגיטרה או לפסנתר — כך רואים בדיוק איפה לשים את האצבעות.
          </div>
        </div>
      </div>
      <div class="uc-step">
        <span class="uc-step__num"></span>
        <div class="uc-step__body">
          <div class="uc-step__title">התאימו לעצמכם ותנגנו</div>
          <div class="uc-step__desc">
            שנו סולם כדי שיתאים לקול שלכם, הפעילו גלילה אוטומטית, ועברו לגרסה קלה אם רק התחלתם.
            הכול חינם, בלי הרשמה.
          </div>
        </div>
      </div>
    </div>

    <!-- ══ כלים בדף השיר ══ -->
    <h2>הכלים שבדף השיר</h2>
    <p>כל שיר מגיע עם ארגז כלים שנועד להפוך נגינה לפשוטה — בדיוק כמו שאתם מכירים מהאתרים הגדולים, רק בחינם ובלי פרסומות.</p>
    <div class="uc-feature-grid">
      <div class="uc-feature">
        <span class="uc-feature__icon">🔄</span>
        <div class="uc-feature__title">שינוי סולם (טרנספוז)</div>
        <div class="uc-feature__desc">מעלים או מורידים את כל האקורדים בלחיצה, כדי שהשיר יתאים לטווח הקול שלכם או לכלי שבידיכם.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">⭐</span>
        <div class="uc-feature__title">גרסה קלה</div>
        <div class="uc-feature__desc">מחליפה אקורדים מורכבים בפשוטים יותר — מושלם לצעדים הראשונים עם הגיטרה או היוקלילי.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">📜</span>
        <div class="uc-feature__title">גלילה אוטומטית</div>
        <div class="uc-feature__desc">הדף גולל לבד בקצב שתבחרו, כדי שהידיים יישארו על הכלי לאורך כל השיר.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🎹</span>
        <div class="uc-feature__title">דיאגרמות אקורד</div>
        <div class="uc-feature__desc">לחיצה על כל אקורד מציגה את אופן האחיזה לגיטרה ולפסנתר — בלי לנחש.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🎼</span>
        <div class="uc-feature__title">תווים ונגן חי</div>
        <div class="uc-feature__desc">לשירים רבים יש תווים מלאים שאפשר אפילו להשמיע — לפסנתר, גיטרה וחליל. <a href="<?php echo esc_url( $uc_tavim ); ?>">לספריית התווים ←</a></div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🎬</span>
        <div class="uc-feature__title">שיעורי וידאו</div>
        <div class="uc-feature__desc">לשירים שיש להם שיעור, סרטון ההסבר מוטמע בדף — לומדים לנגן צעד-צעד מול המסך.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🔖</span>
        <div class="uc-feature__title">שמירת מועדפים</div>
        <div class="uc-feature__desc">שומרים שירים ל<a href="<?php echo esc_url( $uc_saved ); ?>">"שירים שמורים"</a> כדי לחזור אליהם בקליק. דורש התחברות מהירה.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🌙</span>
        <div class="uc-feature__title">מצב לילה וגופנים</div>
        <div class="uc-feature__desc">מצב כהה נוח לנגינה בערב, גודל טקסט מתכוונן וגופנים מיוחדים — מתאימים את התצוגה אליכם.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">📲</span>
        <div class="uc-feature__title">אפליקציה ומצב לא-מקוון</div>
        <div class="uc-feature__desc">אפשר להתקין את unichord כאפליקציה ולשמור שירים לנגינה גם בלי אינטרנט — מתפריט ☰.</div>
      </div>
    </div>

    <!-- ══ גלריית וידאו: רואים את זה בפעולה ══ -->
    <?php
    $uc_vdir = get_theme_file_uri( '/assets/videos/guide' );
    // רק סרטונים שכבר קיימים בתיקייה יוצגו (נמנע ממסגרות ריקות)
    $uc_vdir_path = get_theme_file_path( '/assets/videos/guide' );
    $uc_demos = array(
      array( 'slug' => 'search',        'e' => '🔍', 'label' => 'מוצאים שיר' ),
      array( 'slug' => 'transpose',     'e' => '🔄', 'label' => 'שינוי סולם' ),
      array( 'slug' => 'chord-diagrams','e' => '🎹', 'label' => 'תרשים אקורד' ),
      array( 'slug' => 'easy-version',  'e' => '⭐', 'label' => 'גרסה קלה' ),
      array( 'slug' => 'autoscroll',    'e' => '📜', 'label' => 'גלילה אוטומטית' ),
      array( 'slug' => 'chordlist',     'e' => '🎸', 'label' => 'כל האקורדים של השיר' ),
      array( 'slug' => 'favorites',     'e' => '🔖', 'label' => 'שמירת מועדפים' ),
      array( 'slug' => 'night-mode',    'e' => '🌙', 'label' => 'מצב לילה' ),
      array( 'slug' => 'add-song',      'e' => '➕', 'label' => 'מוסיפים שיר' ),
    );
    $uc_demos = array_values( array_filter( $uc_demos, function ( $d ) use ( $uc_vdir_path ) {
      return file_exists( $uc_vdir_path . '/feat-' . $d['slug'] . '.9x16.mp4' );
    } ) );
    if ( $uc_demos ) : ?>
    <h2>רואים את זה בפעולה</h2>
    <p>הדגמות אמת מתוך האתר — בדיוק מה שתראו על המסך. הסרטונים מתנגנים בשקט תוך כדי הגלילה.</p>
    <div class="uc-demos">
      <?php foreach ( $uc_demos as $d ) :
        $vsrc = $uc_vdir . '/feat-' . $d['slug'] . '.9x16.mp4';
        $poster = file_exists( $uc_vdir_path . '/feat-' . $d['slug'] . '.9x16.jpg' ) ? $uc_vdir . '/feat-' . $d['slug'] . '.9x16.jpg' : '';
      ?>
      <figure class="uc-demo">
        <div class="uc-demo__frame"<?php if ( $poster ) echo ' style="background-image:url(' . esc_url( $poster ) . ')"'; ?>>
          <video class="uc-demo__video" muted loop playsinline preload="none"
                 <?php if ( $poster ) echo 'poster="' . esc_url( $poster ) . '"'; ?>
                 aria-label="<?php echo esc_attr( $d['label'] ); ?>">
            <source src="<?php echo esc_url( $vsrc ); ?>" type="video/mp4">
          </video>
        </div>
        <figcaption class="uc-demo__cap"><span class="e"><?php echo esc_html( $d['e'] ); ?></span><?php echo esc_html( $d['label'] ); ?></figcaption>
      </figure>
      <?php endforeach; ?>
    </div>
    <script>
    (function () {
      var demos = document.querySelectorAll('.uc-demo__video');
      if (!demos.length) return;
      if (!('IntersectionObserver' in window)) { return; }
      // חימום: מתחילים להוריד את הווידאו ~800px לפני הכניסה לתצוגה,
      // כדי שכשהאריח מגיע למרכז הוא כבר טעון ומתנגן מיד (בלי המתנה לבנה).
      var warm = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var v = en.target;
          if (v.preload !== 'auto') { v.preload = 'auto'; try { v.load(); } catch (e) {} }
          warm.unobserve(v);
        });
      }, { rootMargin: '800px 0px' });
      demos.forEach(function (v) { warm.observe(v); });
      // ניגון/השהיה לפי מיקום בתצוגה בפועל
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var v = en.target, frame = v.parentElement;
          if (en.isIntersecting && en.intersectionRatio > 0.5) {
            var p = v.play();
            if (p && p.then) { p.then(function () { frame.classList.add('is-playing'); }).catch(function () {}); }
            else { frame.classList.add('is-playing'); }
          } else {
            v.pause(); frame.classList.remove('is-playing');
          }
        });
      }, { threshold: [0, 0.5, 1] });
      demos.forEach(function (v) { io.observe(v); });
    })();
    </script>
    <?php endif; ?>

    <!-- ══ תרומה לקהילה ══ -->
    <h2>רוצים לתרום? הצטרפו אלינו</h2>
    <p>
      unichord נבנה ביחד. כל שיר שמתווסף, כל תיקון וכל שיעור הופכים את המאגר לטוב יותר עבור כולם —
      ונשארים <strong>חופשיים, חינמיים ופתוחים</strong> לכל אחד. וכשאתם תורמים — השם שלכם מופיע בעמוד השיר
      וב<a href="<?php echo esc_url( home_url( '/contributors/' ) ); ?>">עמוד התורמים</a>.
    </p>
    <div class="uc-feature-grid">
      <div class="uc-feature">
        <span class="uc-feature__icon">➕</span>
        <div class="uc-feature__title">הוספת שיר</div>
        <div class="uc-feature__desc">מכירים את האקורדים לשיר שעדיין לא אצלנו? הוסיפו אותו בעורך הפשוט שלנו. <a href="<?php echo esc_url( $uc_add ); ?>">להוספת שיר ←</a></div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">✏️</span>
        <div class="uc-feature__title">תיקון והצעת עריכה</div>
        <div class="uc-feature__desc">ראיתם אקורד או מילה לא מדויקים? אפשר להציע תיקון ישירות מדף השיר — אנחנו נבדוק ונעדכן.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🎥</span>
        <div class="uc-feature__title">העלאת שיעור וידאו</div>
        <div class="uc-feature__desc">מורים ונגנים: קשרו סרטון שיעור לשיר (גיטרה או פסנתר) ועזרו לאלפים ללמוד לנגן אותו.</div>
      </div>
      <div class="uc-feature">
        <span class="uc-feature__icon">🎼</span>
        <div class="uc-feature__title">יצירת תווים</div>
        <div class="uc-feature__desc">יודעים לכתוב תווים? הוסיפו תווים לשירים שעדיין אין להם — והפכו אותם לזמינים לכולם.</div>
      </div>
    </div>

    <!-- ══ CTA ══ -->
    <div class="uc-cta-band">
      <div class="uc-cta-band__bg" aria-hidden="true"></div>
      <div class="uc-cta-band__inner">
        <h2 class="uc-cta-band__title">מוכנים להתחיל?</h2>
        <p class="uc-cta-band__sub">
          <?php if ( $uc_total > 100 ) : ?>
            <?php echo esc_html( number_format_i18n( $uc_total ) ); ?> שירים מחכים לכם — בחרו אחד ותנגנו.
          <?php else : ?>
            בחרו שיר ותנגנו — חינם, בלי הרשמה.
          <?php endif; ?>
        </p>
        <div class="uc-btn-row">
          <a class="uc-btn uc-btn--primary" href="<?php echo esc_url( $uc_home ); ?>">לספריית האקורדים</a>
          <a class="uc-btn uc-btn--ghost" href="<?php echo esc_url( $uc_add ); ?>">להוספת שיר</a>
        </div>
      </div>
    </div>

    <!-- ══ FAQ ══ -->
    <h2>שאלות נפוצות</h2>
    <div class="uc-faq">
      <details>
        <summary>האם השימוש באמת חינמי?</summary>
        <p>כן, לחלוטין. כל הפונקציות באתר — חיפוש, אקורדים, תווים, שיעורים וכלי הנגינה — חינמיות לתמיד, בלי פרסומות ובלי תשלום נסתר.</p>
      </details>
      <details>
        <summary>צריך להירשם כדי לנגן?</summary>
        <p>לא. אפשר לחפש שיר, לפתוח אותו ולנגן בלי שום הרשמה. הרשמה (מהירה, עם Google) נדרשת רק כדי לשמור מועדפים, לתרום שירים או להציע עריכות.</p>
      </details>
      <details>
        <summary>מאיפה מגיעים השירים?</summary>
        <p>הבסיס שלנו הוא ספר האקורדים הישראלי — מאות שירי מופת של ארץ ישראל. מעבר לזה, המאגר גדל בכל יום בזכות תרומות הקהילה.</p>
      </details>
      <details>
        <summary>לא מצאתי שיר שחיפשתי — מה עושים?</summary>
        <p>אפשר להוסיף אותו בעצמכם דרך <a href="<?php echo esc_url( $uc_add ); ?>">הוספת שיר</a>, ואם תרצו — לבקש מאיתנו או מהקהילה להוסיף אותו דרך <a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>">יצירת קשר</a>.</p>
      </details>
      <details>
        <summary>אפשר להשתמש באתר מהנייד?</summary>
        <p>בהחלט. האתר מותאם למובייל, ואפשר אפילו להתקין אותו כאפליקציה ולשמור שירים לנגינה גם בלי חיבור לאינטרנט.</p>
      </details>
    </div>

  </div>
</main>

<?php get_footer(); ?>
