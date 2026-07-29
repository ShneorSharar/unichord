# Security Policy / מדיניות אבטחה

## דיווח על פרצת אבטחה / Reporting a vulnerability

אם גיליתם פרצת אבטחה, בעיית פרטיות, או חשיפה של מידע רגיש בקוד הזה — **אנא אל תפתחו issue ציבורי.** דיווחים ציבוריים חושפים את הבעיה למשתמשים זדוניים לפני שיש הזדמנות לתקן.

If you discover a security vulnerability, privacy issue, or exposure of sensitive data in this codebase — **please do not open a public issue.** Public disclosure exposes the problem to bad actors before there's a chance to fix it.

**דווחו באופן פרטי:** צרו קשר עם בעל/י המאגר דרך ערוץ פרטי — לדוגמה, פרופיל GitHub של בעל המאגר, או כתובת ייעודית אם וכאשר תפורסם (למשל `security@unichord.co.il` — placeholder, יש לעדכן לכתובת אמיתית בעת פרסום המאגר). אם אינכם בטוחים כיצד ליצור קשר, חפשו את פרטי הקשר בפרופיל GitHub של בעל המאגר.

**Report privately:** contact the repository owner through a private channel — for example, the owner's GitHub profile, or a dedicated address once one is published (e.g. `security@unichord.co.il` — placeholder, update to a real address when the repo goes live). If unsure how to reach out, check the repository owner's GitHub profile for contact details.

בדיווח, נסו לכלול:
When reporting, please try to include:

- תיאור הבעיה ומידת החומרה המשוערת / a description of the issue and its estimated severity
- שלבים לשחזור, אם רלוונטי / reproduction steps, if applicable
- כל קובץ/נתיב/endpoint רלוונטי / any relevant file, path, or endpoint

נשתדל להגיב תוך זמן סביר ולתאם גילוי אחראי (responsible disclosure) לפני פרסום פומבי של הפרטים.

We'll aim to respond within a reasonable timeframe and coordinate responsible disclosure before any public details are shared.

## תזכורת חשובה / Important reminder

**לעולם אל תפרסמו סודות, סיסמאות, מפתחות API, או פרטי חיבור למסד נתונים במאגר הזה** — לא בקוד, לא ב-issues, לא ב-pull requests, לא בהיסטוריית commits. אם סוד הגיע לרפוזיטורי בטעות, אין די בהסרתו בקומיט חדש — יש **לסבב (rotate)** את הסוד עצמו ולנקות אותו מהיסטוריית git.

**Never commit secrets, passwords, API keys, or database credentials to this repository** — not in code, not in issues, not in pull requests, not in commit history. If a secret is committed by mistake, removing it in a new commit is not enough — the secret itself must be **rotated**, and the history should be scrubbed.
