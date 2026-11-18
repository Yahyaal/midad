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

## Smoother letter edits (v0.3)
* Join strokes now leave A and enter B along each letter's own stroke direction (perpendicular to the
  thinnest ink chord at the join), so lifted/lowered letters connect with curves instead of straight rods.
* *Neighbours follow*: dragging a letter moves joined neighbours by 50% (next) and 20% (one further),
  fully for vertical motion and a quarter for horizontal (horizontal moves read as spacing).
* Snapping while dragging a single letter: back to its original place, to the same offset as a moved
  neighbour (that join closes), or onto the baseline. Alt disables follow and snapping.

## Swaps that fit the word (v0.4)
* **Chain reflow**: after swaps, each letter's entry point is placed on the previous letter's exit point
  (the font's own hand-over points), so the word re-flows: no collisions, no synthetic joins; later words
  keep their spacing.
* **Neighbour fitting**: when a letter takes a new shape, the font is asked which shapes it pairs with it
  on each side (shaping the real neighbour letters around it); those are applied in the same undo step.
  If the font never pairs them, a neighbour is re-formed only when its shape clearly collides.
* Join strokes are drawn only where an edit opened a gap (the font's own hairline gaps stay as designed).
* **Reconnect word** drops moves/rotations/scales inside a connected group and keeps forms, madd, kashida.

## Tidy (v0.5)
One button (or `T`) runs five conservative passes over the selection's groups, or the whole composition:
1. **smooth** – Laplacian smoothing of vertical offsets and rotations along each connected word
   (keeps the overall rise, removes jagged steps);
2. **kashida** – a sideways gap between joined letters becomes join `extend`, with later letters
   compensated so nothing else moves; small leftovers snap to zero;
3. **forms** – joins still bridging a long gap try both letters' other forms (with neighbour fitting) and
   keep the set with the shortest bridges, if clearly better;
4. **spacing** – groups that sit closer than the font's own spacing are pushed apart (reading order);
5. **dots** – dots dragged further than ~0.45 em are pulled back.
Everything is plain edits, written as a single undo step. The bar's strength slider re-runs from the
original and replaces the result in place (still one undo step); *Hold to compare* shows the original.

## Known limits
* Pulling letters along steep joins can leave small shards where the pen stroke meets the outline.
* Elongation is a straight cut, so it suits horizontal strokes (ى ن ب س ص ك), not vertical ones.
* A few context-specific forms (e.g. ح drawn for after ط) still leave the stacked ي perched above; pick a flatter ي.
* Nastaʿlīq dots are separate GPOS-placed marks and keep their original position after a swap.
* Outline point editing is per-glyph and low level (no smoothing of neighbouring handles yet).
* Kashida shifts assume right-to-left lines.
