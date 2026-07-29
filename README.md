# unichord — אקורדים | החופש לנגן

**unichord** (בעברית: אקורדים) הוא פלטפורמת תווי אקורדים לשירים בעברית, בקוד פתוח. המטרה: לתת לכל מי שרוצה לנגן — בבית, במעגל שירה, בכיתה — גישה חופשית וברורה לתווי אקורדים, בלי חומות תשלום ובלי פרסומות מטרידות.

הליבה הטכנית של unichord — התוסף (plugin) המציג ומעבד את תווי האקורדים, וערכת ה-theme הנלווית — היא **קוד פתוח**, ומפורסמת כאן תחת רישיון AGPL-3.0.

> האתר החי: **https://unichord.co.il**

---

## הרעיון: "החופש לנגן"

unichord נולד מתוך אמונה פשוטה: הידע המוזיקלי הבסיסי — אקורד, טרנספוזיציה, מבנה שיר — לא צריך להיות נעול מאחורי מנוי או אפליקציה קניינית. הפרויקט בנוי במודל **"ליבה פתוחה"** (open-core):

- **הליבה — חינמית, פתוחה, שקופה.** הקוד שמריץ את תצוגת האקורדים, החיפוש, המחברת האישית והמועדפים — נגיש כאן לכולם, לשימוש, לבדיקה ולתרומה.
- **כלים מסחריים נפרדים** (סטודיו אינטראקטיבי ללימוד נגינה, מנועי שיעורים) מתקיימים כמוצר סגור ונפרד, ואינם חלק ממאגר קוד זה. הם מממנים את המשך התחזוקה וההתפתחות של הליבה הפתוחה.

המודל הזה נבחר במכוון: שקיפות היא הבסיס לאמון, לא הסתרה.

---

## מה כולל המאגר הזה

מאגר זה מכיל את **הליבה** של unichord כפי שהיא רצה בפועל על גבי וורדפרס:

- **תוסף וורדפרס מותאם אישית** — מציג ומעבד תווי אקורדים (chord sheets) לשירים: רינדור אקורדים מעל מילים, טרנספוזיציה (העברת סולם), חיפוש שירים, טקסונומיות (ז'אנר, זמר, רמת קושי).
- **ערכת (theme) ילד המבוססת על GeneratePress** — העיצוב, המיתוג ("unichord" / זהב חם) והפריסה של האתר.

### פיצ'רים עיקריים

- הצגת תווי אקורדים מעל מילות שירים, עם תמיכה בעברית (RTL) ובכיוון-מעורב.
- טרנספוזיציה — העברת שיר לסולם אחר בלחיצה.
- מחברת אישית — שמירת שירים, גרסאות ומועדפים במרחב אישי, כולל תיקיות פרטיות.
- מועדפים — סימון שירים לגישה מהירה.
- חיפוש וסינון לפי ז'אנר, זמר ורמת קושי.
- PWA — התקנה כאפליקציה, עבודה גם עם קישוריות חלקית (manifest + service worker).
- נגישות — האתר שואף לעמידה בתקן נגישות ישראלי, עם הצהרת נגישות מפורסמת.

### מה **לא** כלול (מוצר מסחרי נפרד)

הכלים האינטראקטיביים ללימוד נגינה — סטודיו לימוד, מנועי שיעורים מונחי-מיקרופון, תרגול מקצב ומנגינה — הם **מוצר סגור ומסחרי נפרד**, ואינם חלק ממאגר קוד פתוח זה. הם מתארחים בנפרד (למשל תחת תת-דומיין ייעודי) ואינם כפופים לרישיון AGPL-3.0 של המאגר הזה.

---

## התקנה ודרישות

הפרויקט הוא תוסף וערכת נושא של **WordPress**, ולא אפליקציה עצמאית. באופן כללי:

- שרת WordPress עדכני (worth checking `readme.txt`/`style.css` של כל רכיב לגרסת המינימום המדויקת).
- PHP בגרסה נתמכת על ידי WordPress בזמן ההתקנה (ראו את דרישות ה-PHP העדכניות של WordPress).
- מסד נתונים MySQL/MariaDB תואם-WordPress.
- ערכת הנושא ההורה **GeneratePress** מותקנת (הערכה כאן היא child theme שתלוי בה).

התקנה בקצרה:

1. התקינו WordPress תקין.
2. התקינו את ערכת הנושא ההורה GeneratePress, ולאחריה את ה-child theme מתוך `themes/` במאגר זה.
3. התקינו את התוסף מתוך `plugins/` (ראו [`STRUCTURE-PROPOSAL.md`](STRUCTURE-PROPOSAL.md) למבנה המדויק של המאגר).
4. הפעילו את ה-child theme ואת התוסף מלוח הבקרה של וורדפרס.

הוראות מפורטות יותר (תלויות גרסה, migrations, seed data) יתווספו בהמשך ככל שהמאגר יתייצב.

---

## רישיון

- **הקוד** (התוסף וערכת הנושא) — רישיון **GNU AGPL-3.0**. ראו [`LICENSE`](LICENSE).
- **תוכן** (למשל תווי מוזיקה בנחלת הכלל) — רישיון נפרד, מבוסס Creative Commons. ראו [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md) להבחנה המלאה בין קוד לתוכן, כולל הבהרה לגבי שירים המוגנים בזכויות יוצרים של צד שלישי שאינם מפורסמים תחת רישיון פתוח.

## תרומה

תרומות קוד, דיווחי באגים והצעות שיפור מתקבלות בברכה. לפני שליחת Pull Request, ראו את [`CONTRIBUTING.md`](CONTRIBUTING.md). לדיווח על פרצות אבטחה — **לא** דרך issue ציבורי — ראו [`SECURITY.md`](SECURITY.md).

---

<br>

## English

**unichord** (Hebrew: אקורדים, "Chords") is an open-source Hebrew chord-sheet / song platform. The goal: give anyone who wants to play music — at home, in a singalong circle, in a classroom — free and clear access to chord sheets, without paywalls or intrusive ads.

The technical core of unichord — the WordPress plugin that renders and processes chord sheets, and its companion child theme — is **open source**, published here under the **AGPL-3.0** license.

> Live site: **https://unichord.co.il**

### The "Freedom to Play" ethos

unichord is built on a simple belief: basic musical knowledge — a chord, a key change, a song structure — shouldn't be locked behind a subscription or a proprietary app. The project follows an **open-core** model:

- **The core is free, open, and transparent.** The code that powers chord display, search, the personal notebook, and favorites is available here for anyone to use, inspect, and contribute to.
- **Commercial tools** (an interactive practice studio, lesson engines) exist as a separate, closed product and are **not** part of this repository. They fund the ongoing maintenance and development of the open core.

This split is deliberate: trust comes from transparency, not from hiding the code.

### What's in this repository

This repository contains the **core** of unichord as it runs on WordPress:

- **A custom WordPress plugin** — renders and processes chord sheets: chord-over-lyrics rendering, transposition, song search, taxonomies (genre, artist, difficulty level).
- **A GeneratePress-based child theme** — the design, branding ("unichord" / warm gold palette), and layout of the site.

**Key features:** chord-over-lyrics rendering with Hebrew (RTL) support, one-click transposition, a personal notebook (saved songs, versions, favorites, private folders), favorites, genre/artist/level search and filtering, and PWA support (installable, offline-friendly manifest + service worker).

**Not included (separate commercial product):** the interactive learning studio and lesson engines (microphone-driven practice, rhythm/pitch training) are a closed, separate commercial product and are not part of this open-source release.

### Requirements & installation (outline)

- A working **WordPress** installation, with PHP and MySQL/MariaDB versions supported by your WordPress release.
- The **GeneratePress** parent theme installed (this repo's theme is a child theme of it).
- Install the plugin from `plugins/` and the child theme from `themes/` (see [`STRUCTURE-PROPOSAL.md`](STRUCTURE-PROPOSAL.md) for the exact repo layout), then activate both from the WordPress admin.

More detailed, version-pinned installation instructions will be added as the repository stabilizes.

### License

- **Code** (plugin + theme): **GNU AGPL-3.0** — see [`LICENSE`](LICENSE).
- **Content** (e.g. public-domain tune data): a separate Creative Commons license — see [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md) for the full code-vs-content distinction, including a note on third-party copyrighted songs that are not distributed under an open license.

### Contributing

Code contributions, bug reports, and suggestions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. To report a security vulnerability, please **do not** open a public issue — see [`SECURITY.md`](SECURITY.md) instead.
