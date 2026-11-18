# Design notes (v0.1)

## Why outlines from real fonts + HarfBuzz
Hand-built stroke skeletons would allow deeper reshaping, but would take a long time to reach the quality
of a mature naskh font. Shaping real OFL fonts with HarfBuzz gives correct contextual forms, ligatures and
mark placement from day one; every glyph becomes an SVG outline we can transform, cut and re-join.

## The hard part: moving a letter inside a connected word
Approaches tried while prototyping on يحيى (Amiri stacks ي on ح, so joins are not simple baseline joins):

1. **Group-level only** – move whole connected runs. Always readable, but no letter control.
   Kept as the *Connected* selection level.
2. **Bridge between cross-sections** – connect A's exit cross-section to B's entry cross-section. Looked
   seamless for small moves but collapsed to a thin lens when a letter was pulled along the stroke.
3. **Broad-pen stroke (chosen)** – find the contact point of the two outlines, then sweep a pen of the
   font's kashida thickness along a bendable cubic. Width follows the pen angle (full when horizontal,
   thin when steep), so pulled-apart letters read like a calligrapher's connection. The two ends start on
   each letter's own thinnest ink chord at the contact, which hides the seams.

Each join has kashida length / bend / waist controls, plus an on-canvas handle (drag sideways = kashida,
drag across = bend).

**Elongation** (madd) cuts a letter's outline at an adjustable x and slides the left part outwards. This
lengthens bowls and tails without thinning them, which horizontal scaling would do.

## Letter forms (v0.2)
Fonts like Amiri, Aref Ruqaa and Noto Nastaliq draw most letters several ways and pick one by context.
Midad shapes the selected letter beside every dual/right-joining neighbour in the same joining position,
collects the distinct glyphs (plus stylistic-set results), drops near-duplicates with a coarse bitmap
comparison on a shared frame, and offers them as swaps. A swap is stored as `swap: "font:glyphId"`.
Placement: compute the old form's entry/exit points against its real neighbours and the new form's
entry/exit points in the context it was designed for, then translate by the average mismatch.
Scheherazade New has no contextual alternates, so it offers only elongations.

## Known limits
* Pulling letters along steep joins can leave small shards where the pen stroke meets the outline.
* Elongation is a straight cut, so it suits horizontal strokes (ى ن ب س ص ك), not vertical ones.
* Medial forms can only line up one side exactly; the other side is bridged by a join stroke.
* Nastaʿlīq dots are separate GPOS-placed marks and keep their original position after a swap.
* Outline point editing is per-glyph and low level (no smoothing of neighbouring handles yet).
* Kashida shifts assume right-to-left lines.
