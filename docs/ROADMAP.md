# Roadmap — making Midad more useful and friendlier

## What the research says

**Design-tool selection conventions** (Rive, Figma-style editors, InDesign, site builders):
double-click drills one level deeper, **Esc** goes back up, **Cmd/Ctrl-click** selects the deepest item
directly, and a **breadcrumb** shows where you are and lets you jump to any level.
Midad's levels (block › word › connected › letter › dot/mark) map onto this directly.

**What calligraphy apps sell** (CalliPro, Ana Muhtarif al-Khaṭṭ, ArabiKhat): many fonts, alternate letter
shapes, "wide forms", dot removal, editing glyphs as paths, Qurʾān text, export. Midad already covers
forms, madd/kashida, dots, path points and export — its gaps are *composition* and *ease of use*.

**Classical composition forms** (Met Museum, LoC, calligraphy guides): circular roundels and bands
(*tarkīb*), mirror-image *musannā* compositions, justified panels where kashida fills each line, and the
second ink colour often used for vowel marks in manuscripts.

## Plan (in priority order) — status: all eight built, Nov 19

| # | Feature | Why |
|---|---------|-----|
| 1 | **Faster selection**: double-click grows the selection (letter → connected → word → text); a breadcrumb on the selection strip; Esc steps back down; Ctrl/⌘-click picks the single letter in any mode | Moving a whole word no longer needs the mode bar; matches design-tool habits |
| 2 | **Arrange text on an arc or circle** (curvature slider; full circle for roundels) | The most-requested calligraphy composition; impossible by hand today |
| 3 | **Justify with kashida** for multi-line text | Real calligraphic panels fill lines with kashida, not spaces |
| 4 | **Artboard presets** (square post, story, A4/A3, wide banner) | People make art for a destination |
| 5 | **Second colour for dots and ḥarakāt** | Classic manuscript look; one toggle |
| 6 | **Mirror (*musannā*)**: one click makes a mirrored copy | A signature calligraphic form |
| 7 | **Smart guides**: blocks snap to the artboard's centre lines and to each other | Precise composition without fiddling |
| 8 | **First-run welcome**: three tips + quick starts | New users find the levels, forms, Tidy and Library |

Later candidates: Arabic UI language, decorative frames/ornaments, version history, per-word colours,
sharing links, Quran text picker with verse lookup.

## Done (overnight, Nov 19)

1. Faster selection — double-click/double-tap grows, breadcrumb, Esc steps down, Ctrl/⌘-click deep select,
   pressing on any part of a selected word drags the whole word.
2. Arrange on an arc (−100…+100 %) or around a circle (wrap 30–98 %); connected groups move rigidly.
3. Justify with kashida for multi-line text (1–3 mid-word joins in the longest words per line).
4. Artboard presets (wide, square/portrait post, story, A4 portrait/landscape, banner), centred resize.
5. Second colour for ḥarakāt (optionally dots).
6. ⇋ Mirror copy (musannā) in Layers.
7. Smart guides for word/group/block drags (artboard centre lines, other blocks' centres/baselines).
8. First-run welcome with four tips and quick starts; phone layout pass for the new overlays.

## Next ideas
* Roundel helper: auto-size the circle so words never collide; text inside vs outside the ring.
* Arabic interface language (RTL UI).
* Decorative frames, rules and medallions around compositions.
* Version history / named snapshots per project.
* Per-word colour and gold highlights.
