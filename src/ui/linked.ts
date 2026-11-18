// Letters move as part of a word: neighbour weights for "follow" drags and
// positions where a dragged letter joins its neighbours seamlessly.
import type { Pt } from '../core/geometry';
import type { LaidBlock } from '../core/layout';

/** Joined neighbours of the given letters, with how strongly each follows (1 = fully). */
export function neighbourWeights(lb: LaidBlock, selected: Set<string>, falloff = [0.5, 0.2]): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const j of lb.joins) {
    adj.set(j.a, [...(adj.get(j.a) ?? []), j.b]);
    adj.set(j.b, [...(adj.get(j.b) ?? []), j.a]);
  }
  const out = new Map<string, number>();
  let frontier = [...selected];
  const seen = new Set(selected);
  for (const w of falloff) {
    const next: string[] = [];
    for (const k of frontier)
      for (const n of adj.get(k) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        out.set(n, w);
        next.push(n);
      }
    frontier = next;
  }
  return out;
}

/**
 * Translations (in the letter's parent space) where it meets its neighbours
 * without a gap: its original place, or the offset of an adjacent letter
 * (moving together with it keeps that join intact).
 */
export function seamlessTargets(lb: LaidBlock, key: string): { t: Pt; label: string }[] {
  const out: { t: Pt; label: string }[] = [{ t: [0, 0], label: 'Joined — original place' }];
  for (const j of lb.joins) {
    const other = j.a === key ? j.b : j.b === key ? j.a : null;
    if (!other) continue;
    const e = lb.block.edits[other];
    if (!e || (!e.tx && !e.ty)) continue;
    const g = lb.glyphs.find((x) => x.key === other);
    out.push({ t: [e.tx ?? 0, e.ty ?? 0], label: `Joined to ${g?.char ?? 'neighbour'}` });
  }
  return out;
}
