Developer helpers (not part of the app):

* `snap.mjs <file|url> <out.png> [w h]` – screenshot any SVG/HTML with headless Chromium.
* `shot.mjs` / `shot2.mjs` – scripted screenshots of the running dev server (port 5179) for visual review.
* `probe.mjs <font> <text>` / `render.mjs` – print/draw HarfBuzz glyph runs with per-glyph colours.
* Debug renders of layout cases: `DUMP_DIR=/tmp/x npx vitest run dump` (add `DEBUG_COLORS=1`).
