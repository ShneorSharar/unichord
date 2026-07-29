# Contributing to unichord

תודה על העניין לתרום ל-unichord! המאגר הזה הוא הליבה הפתוחה של הפרויקט (התוסף + ה-child theme), ותרומות — קוד, תיקוני באגים, שיפורי נגישות, תיעוד — מתקבלות בברכה.

Thanks for your interest in contributing to unichord! This repository is the open core of the project (the WordPress plugin + child theme), and contributions — code, bug fixes, accessibility improvements, documentation — are welcome.

## איך להציע שינוי / How to propose a change

1. **פתחו issue לפני PR גדול** — עבור שינויים לא-טריוויאליים (פיצ'ר חדש, שינוי ארכיטקטורה), פתחו issue לדיון לפני שמשקיעים זמן בקוד, כדי לוודא שהכיוון מתאים לפרויקט.
   *Open an issue before a large PR* — for non-trivial changes (a new feature, an architectural change), open an issue to discuss direction before investing time in code.
2. **Fork + branch** — עבדו על branch ייעודי בפורק שלכם, לא ישירות על `main`.
   Work on a dedicated branch in your fork, not directly on `main`.
3. **PR קטן וממוקד** — PR אחד = שינוי לוגי אחד. קל יותר לבדוק ולמזג.
   Keep pull requests small and focused — one logical change per PR.
4. **תארו את השינוי** — מה השתנה, למה, ואיך נבדק (ידנית / אוטומטית).
   Describe what changed, why, and how it was tested (manual / automated).

## ציפיות קוד / Coding expectations

- עמידה בסטנדרטים של WordPress Coding Standards (PHP, JS, CSS) ככל האפשר.
  Follow WordPress Coding Standards (PHP, JS, CSS) where practical.
- כבדו את מבנה ה-i18n/RTL הקיים — הפרויקט משרת קהל עברי דובר RTL; אל תשברו כיווניות טקסט או תמיכת Hebrew/RTL קיימת.
  Respect the existing i18n/RTL setup — this project serves a Hebrew-speaking, RTL audience; don't break existing text-direction or Hebrew/RTL support.
- הימנעו מתלות חדשות כבדות ללא הצדקה ברורה ב-issue/PR.
  Avoid adding heavy new dependencies without clear justification in the issue/PR.
- אם השינוי נוגע לנגישות (accessibility) — ציינו זאת מפורשות ב-PR; לפרויקט יש הצהרת נגישות פעילה שיש לשמור עליה.
  If a change touches accessibility, call it out explicitly in the PR — the project maintains a published accessibility statement.
- אל תוסיפו לתוך ה-repo תוכן שירים המוגן בזכויות יוצרים של צד שלישי — ראו [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md). קוד בלבד ותוכן בנחלת הכלל/CC שייכים כאן.
  Do not add third-party copyrighted song content to this repo — see [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md). Only code and public-domain/CC-licensed content belong here.

## רישיון תרומות / License of contributions

בשליחת PR, אתם מסכימים שהתרומה שלכם תפורסם תחת אותו רישיון של המאגר — **GNU AGPL-3.0** לקוד (ראו [`LICENSE`](LICENSE)).

By submitting a pull request, you agree that your contribution will be licensed under the same license as this repository — **GNU AGPL-3.0** for code (see [`LICENSE`](LICENSE)).

## אבטחה / Security

**אל תפתחו issue ציבורי עבור פרצת אבטחה או חשד לחשיפת מידע רגיש.** ראו את תהליך הדיווח הפרטי ב-[`SECURITY.md`](SECURITY.md).

**Do not open a public issue for a security vulnerability or suspected exposure of sensitive data.** See the private disclosure process in [`SECURITY.md`](SECURITY.md).
