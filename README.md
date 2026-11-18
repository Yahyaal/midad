# Midad · مِداد

Compose artistic Arabic calligraphy in the browser. Type Arabic, pick a script, then shape the composition
letter by letter: move, scale and rotate words, connected groups, single letters, dots and tashkīl, stretch
letters and joins, and finish it in ink on paper. Everything is vector; exports match the canvas exactly.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Type-check and build a static site into `dist/` (works from any sub-path) |
| `npm run check` | Type-check, lint and unit tests |
| `npm test` | Unit tests (Vitest, runs HarfBuzz in Node against the real fonts) |
| `npm run test:e2e` | Browser tests (Playwright: desktop + emulated phone with real touch events) |

## How it works

* **Shaping**: [HarfBuzz](https://harfbuzz.github.io/) (via `harfbuzzjs`, WebAssembly) shapes the text right-to-left
  with the font's own contextual forms, ligatures and mark positioning. Each glyph is turned into an SVG outline.
* **Editing model**: a block keeps the text plus a sparse map of edits keyed by character position, so edits survive
  text changes around them. Transforms nest: block → word → connected group → letter → dot/mark.
* **Joins**: when a letter is pulled away from its neighbour, Midad finds where the two outlines touch and the ink's
  cross-section there, then draws a *broad-pen* connecting stroke whose width follows the font's pen angle (full on
  horizontal kashida, thin on steep strokes). Each join can be lengthened (kashida) and bent.
* **Elongation**: a letter's outline is cut at an adjustable point and the left part is slid outwards, so long
  strokes (ى، ن، ب، س…) grow without the stroke thinning that plain horizontal scaling causes.
* **Dots**: separate small contours in each glyph are detected and become independently movable pieces.
* **Ink**: SVG filters for wet ink (ragged edge, pooling, darker rims), sumi bleed and gold leaf; overlap darkening
  comes from translucent layered strokes. The same SVG is used for export, so PNG/SVG match the preview.
* **Storage**: projects autosave to `localStorage`; save/open `.midad.json` files to move them between devices.

## Layout

```
src/core     shaping, geometry, layout/joins, model, store (undo/redo), persistence
src/ui       canvas + interactions, inspector panels, artwork renderer, exporters
e2e          Playwright tests
public/fonts OFL fonts and their licenses
```

## Licenses

Code: MIT. Fonts: SIL Open Font License 1.1 (see `public/fonts`).
