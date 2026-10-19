# mu-plugins

Must-use plugins that run on unichord.co.il next to the main plugin. Copy them to `wp-content/mu-plugins/`.
Each one stands alone: deleting its file turns the feature off.

| File | What it does |
|---|---|
| `uc-display.php` + `uc-display/` | Guitar and piano chord diagrams, chord library on the song page (option `uc_display_v2`) |
| `uc-writers.php` | Lyricists and composers as a `writer` taxonomy, writer pages, linked credits |
| `uc-new-editor.php`, `uc-editor-lab.php` + `uc-editor-lab/` | Mobile-first song editor (add and edit), behind option `uc_new_editor` |
| `uc-easy-queue.php` | Queue of songs whose easy version needs refreshing after edits |
| `uc-artist-filter.php` | Search box for the artist list |
| `uc-proposal-guard.php` | Checks on edit proposals before they reach review |
| `uc-term-approval.php` | New artists and tags wait for approval |
| `uc-license-consent.php` | Content license consent on upload |
| `uc-schema.php` | schema.org data for songs |
| `uc-analytics.php` + `.js` | Cookieless first-party usage counters (`wp uc wru`) |
| `uc-contact-form.php` | Contact form. Set `UC_CONTACT_TO` in wp-config.php |

Login, admin access and security hardening plugins are not published.
