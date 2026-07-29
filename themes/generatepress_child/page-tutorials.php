<?php
/**
 * Template Name: מדריך וידאו (unichord)
 * page-tutorials.php — עמוד הדרכה ויזואלי עם סרטוני משתמש
 *
 * הסרטונים הם סצנות HTML/CSS חיות (אנימציה דטרמיניסטית) מתוך
 * assets/tutorials/ — אותו מקור שממנו מרונדרים גם קובצי ה-MP4 לרשתות.
 * ראה _video-studio/VIDEO-PRODUCTION.md לדרך ההפקה והעדכון.
 */
get_header();

$uc_tut_base = get_stylesheet_directory_uri() . '/assets/tutorials/scenes/';

/* הסרטונים הקצרים (לפי הסדר שבו כדאי ללמוד) */
$uc_tuts = [
    [ 'f' => 'search',       'icon' => '🔎', 'title' => 'מוצאים שיר',          'desc' => 'מקלידים שם של שיר — והאקורדים, המילים והתווים נפתחים מיד.' ],
    [ 'f' => 'song-tools',   'icon' => '🎚️', 'title' => 'כלי עמוד השיר',       'desc' => 'שינוי סולם, גלילה אוטומטית, בחירת גופן ושמירה למועדפים.' ],
    [ 'f' => 'chord-editor', 'icon' => '🎸', 'title' => 'תורמים שיר',          'desc' => 'גוררים אקורד מעל מילה — וזהו. כל אחד יכול לתרום, חינם.' ],
    [ 'f' => 'learn-chords', 'icon' => '🎤', 'title' => 'לומדים אקורדים',      'desc' => 'מנגנים, והמנוע מקשיב למיקרופון ומאשר את האקורד בזמן אמת.' ],
    [ 'f' => 'learn-flute',  'icon' => '🎵', 'title' => 'לומדים חליל',         'desc' => 'תרשים אצבוע ברור לכל תו — לחלילית או לחליל אירי.' ],
    [ 'f' => 'request-song', 'icon' => '✉️', 'title' => 'מבקשים שיר חסר',      'desc' => 'לא מצאתם שיר? בקשו אותו בלחיצה — נוסיף אותו בקרוב.' ],
    [ 'f' => 'install-pwa',  'icon' => '📲', 'title' => 'מתקינים כאפליקציה',   'desc' => 'הוסיפו את unichord למסך הבית — ועובד מצוין גם בלי אינטרנט.' ],
];
?>

<main id="uc-tut" class="uc-tut" role="main">

    <header class="uc-tut__hero">
        <span class="uc-tut__kicker">מדריך וידאו</span>
        <h1 class="uc-tut__title">ככה משתמשים ב-<span class="uc-tut__mark">uni<b>chord</b></span></h1>
        <p class="uc-tut__sub">סרטונים קצרים שמראים בדיוק איך עושים כל דבר באתר. בלי הסברים מסובכים — פשוט מסתכלים.</p>
    </header>

    <!-- ══ סרטון הסבר מלא ══ -->
    <section class="uc-tut__feature" aria-label="סרטון הסבר מלא">
        <div class="uc-embed uc-embed--wide">
            <iframe src="<?php echo esc_url( $uc_tut_base . 'explainer.html' ); ?>"
                    title="unichord — סרטון הסבר מלא" loading="lazy" allowfullscreen></iframe>
        </div>
        <p class="uc-tut__hint">▶ הסרטון רץ אוטומטית · הקליקו עליו כדי לעצור ולהמשיך</p>
    </section>

    <!-- ══ מדריכים קצרים ══ -->
    <section class="uc-tut__grid-wrap" aria-label="מדריכים קצרים">
        <h2 class="uc-tut__h2">מדריכים קצרים</h2>
        <div class="uc-tut__grid">
            <?php foreach ( $uc_tuts as $t ) : ?>
                <article class="uc-tcard">
                    <div class="uc-embed">
                        <iframe src="<?php echo esc_url( $uc_tut_base . $t['f'] . '.html' ); ?>"
                                title="<?php echo esc_attr( $t['title'] ); ?>" loading="lazy"></iframe>
                    </div>
                    <div class="uc-tcard__body">
                        <h3 class="uc-tcard__title"><span aria-hidden="true"><?php echo $t['icon']; ?></span> <?php echo esc_html( $t['title'] ); ?></h3>
                        <p class="uc-tcard__desc"><?php echo esc_html( $t['desc'] ); ?></p>
                    </div>
                </article>
            <?php endforeach; ?>
        </div>
    </section>

    <!-- ══ CTA ══ -->
    <section class="uc-tut__cta">
        <h2>מוכנים לנגן?</h2>
        <div class="uc-btn-row">
            <a class="uc-btn uc-btn--primary" href="<?php echo esc_url( home_url( '/' ) ); ?>">מצאו שיר</a>
            <a class="uc-btn uc-btn--ghost" href="<?php echo esc_url( home_url( '/add-song/' ) ); ?>">תרמו שיר</a>
        </div>
    </section>

</main>

<style>
/* ════ עמוד מדריך וידאו — unichord ════ */
.uc-tut{ max-width:1140px; margin-inline:auto; padding:0 18px 80px; color:var(--uc-ink); }
.uc-tut__hero{ text-align:center; padding:54px 10px 30px; }
.uc-tut__kicker{ display:inline-block; background:var(--uc-gold-tint); color:var(--uc-gold-deep); font-weight:800; font-size:14px; padding:6px 16px; border-radius:var(--uc-r-pill); letter-spacing:.04em; }
.uc-tut__title{ font-size:clamp(1.9rem,6vw,2.8rem); font-weight:900; margin:16px 0 10px; line-height:1.15; }
.uc-tut__mark{ font-family:var(--uc-font-mark,"Poppins",sans-serif); white-space:nowrap; }
.uc-tut__mark b{ color:var(--uc-gold); }
.uc-tut__sub{ font-size:clamp(1rem,2.6vw,1.2rem); color:var(--uc-ink-soft); max-width:620px; margin-inline:auto; }
.uc-tut__hint{ text-align:center; color:var(--uc-muted); font-size:.92rem; margin-top:12px; }

/* responsive embed (auto-fits via studio.js) */
.uc-embed{ position:relative; aspect-ratio:16/9; width:100%; border-radius:var(--uc-r-lg); overflow:hidden; background:var(--uc-bg); border:1px solid var(--uc-border); box-shadow:var(--uc-shadow-md); }
.uc-embed iframe{ position:absolute; inset:0; width:100%; height:100%; border:0; display:block; }
.uc-embed--wide{ max-width:920px; margin-inline:auto; box-shadow:var(--uc-shadow-lg); }

.uc-tut__feature{ margin:8px 0 60px; }
.uc-tut__h2{ font-size:clamp(1.4rem,4vw,1.9rem); font-weight:800; text-align:center; margin:0 0 26px; }
.uc-tut__grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:26px; }
.uc-tcard{ background:var(--uc-white); border:1px solid var(--uc-border); border-radius:var(--uc-r-lg); overflow:hidden; box-shadow:var(--uc-shadow-sm); transition:transform var(--uc-t-base),box-shadow var(--uc-t-base); }
.uc-tcard:hover{ transform:translateY(-4px); box-shadow:var(--uc-shadow-lg); }
.uc-tcard .uc-embed{ border:0; border-radius:0; border-bottom:1px solid var(--uc-border); box-shadow:none; }
.uc-tcard__body{ padding:18px 20px 22px; }
.uc-tcard__title{ font-size:1.25rem; font-weight:800; margin:0 0 8px; }
.uc-tcard__desc{ color:var(--uc-ink-soft); font-size:1rem; line-height:1.6; margin:0; }

.uc-tut__cta{ text-align:center; margin-top:64px; padding:44px 20px; background:radial-gradient(120% 120% at 50% 0%,var(--uc-gold-tint),var(--uc-paper)); border-radius:var(--uc-r-lg); border:1px solid var(--uc-border); }
.uc-tut__cta h2{ font-size:clamp(1.5rem,4vw,2rem); font-weight:900; margin:0 0 20px; }
.uc-tut__cta .uc-btn-row{ display:flex; gap:14px; justify-content:center; flex-wrap:wrap; }
</style>

<?php get_footer(); ?>
