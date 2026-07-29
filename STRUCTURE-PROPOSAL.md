# Repository Structure Proposal — unichord (core-only, public)

## Recommendation

Use a **flat, purpose-named layout at the repo root**, not a `wp-content/`-mirroring layout:

```
unichord/
├── plugins/
│   └── <plugin-slug>/          # the chord-sheet plugin (currently on disk as achord-master-suite-optimized11)
│       ├── <plugin-slug>.php   # main plugin file / header
│       ├── includes/
│       ├── assets/
│       └── ...
├── themes/
│   └── generatepress_child/    # child theme (depends on the GeneratePress parent theme, NOT bundled here)
│       ├── style.css
│       ├── functions.php
│       ├── assets/
│       └── ...
├── README.md
├── LICENSE                     # AGPL-3.0 (code)
├── LICENSE-CONTENT.md          # CC BY-SA 4.0 (public-domain content) + copyrighted-content note
├── CONTRIBUTING.md
├── SECURITY.md
├── .gitignore
└── STRUCTURE-PROPOSAL.md       # this file (can be deleted once the layout is adopted, or kept as a design note)
```

## Why `plugins/<slug>/` + `themes/<slug>/` instead of mirroring `wp-content/`

Two layouts were considered:

1. **`plugins/` + `themes/` at repo root** (recommended) — the repo root directly contains one folder per shippable unit (one plugin, one theme). No `wp-content/`, `wp-admin/`, `wp-includes/`, or WordPress core files anywhere in the tree.
2. **`wp-content/`-mirroring layout** — reproduce the exact live-server path, i.e. `wp-content/plugins/<slug>/` and `wp-content/themes/<slug>/`, so the repo folder structure matches the deployment target 1:1.

**Recommendation: option 1.** Reasons:

- **This repo ships core-only, not a WordPress install.** `wp-content/` implies "this is (part of) a WordPress content directory you drop in place," which invites confusion with `wp-admin/`/`wp-includes/`/core files that are explicitly *not* included here (see `.gitignore`, which excludes `/wp-admin/`, `/wp-includes/`, `/wp-*.php`). A flat `plugins/` + `themes/` layout signals clearly: *this repo is a set of installable components, not a site*.
- **Matches how most public WordPress-plugin/theme repos on GitHub are organized** — a plugin repo's root *is* the plugin (or, for a multi-component repo like this one, top-level folders per component). Contributors coming from the WordPress ecosystem will recognize the pattern immediately.
- **Simpler CI/tooling paths.** Linting, packaging, and release zipping scripts can target `plugins/<slug>/` and `themes/<slug>/` directly without stripping a `wp-content/` prefix first.
- **Avoids stale-path drift.** If the live server's `wp-content/` path ever changes (different install, different host, different WordPress multisite setup), a repo that mirrors that exact path becomes misleading. A flat layout has no server-path assumption baked in.
- **Deployment mapping stays a one-line note, not a folder-structure commitment.** The README/install docs can simply say "copy `plugins/<slug>/` into your site's `wp-content/plugins/`, and `themes/generatepress_child/` into `wp-content/themes/`" — that's a trivial, well-understood step for anyone who has installed a WordPress plugin before.

## Notes / open items for the repo owner

- **Plugin folder name:** on the live/local install the plugin directory is currently named `achord-master-suite-optimized11`. The `-optimized11` suffix reads like a local dev/build artifact rather than an intentional slug. Recommend renaming to a clean slug before or during the public release (e.g. `achord-master-suite` or a `unichord-`-prefixed slug for brand consistency) — flagged here for a decision, not changed by this scaffolding pass.
- **GeneratePress parent theme is not included.** It should be documented as an external dependency (available in the WordPress theme directory / via generatepress.com), not vendored into this repo.
- **No WordPress core files, uploads, or database dumps belong in this repo** — see `.gitignore`.
