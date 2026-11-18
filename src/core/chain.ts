// Re-chain a line after letterforms are swapped, the way cursive fonts do it:
// each letter's entry point sits on the previous letter's exit point. The word
// reflows around a swapped form (no collisions, no artificial joins) and later
// words keep their spacing.
import { segment } from './arabic';
import { computeContactCached } from './anchors';
import type { LoadedFont } from './fonts';
import type { Pt } from './geometry';
import type { ShapedLine } from './shaping';
import { formAnchors, joinPosition } from './variants';

export function chainSwaps(font: LoadedFont, text: string, lines: ShapedLine[], swaps: Map<string, number>) {
  if (!swaps.size) return;
  const seg = segment(text);
  for (const line of lines) {
    const bases = line.glyphs.filter((g) => !g.isMark);
    if (!bases.some((g) => swaps.has(`c${g.cluster}.${g.k}`))) continue;
    const old = bases.map((g) => ({ x: g.x, y: g.y, gid: g.gid, adv: g.advance }));
    const joined = (i: number) =>
      i >= 0 && i + 1 < bases.length && seg.groupOf[bases[i].cluster] >= 0 && seg.groupOf[bases[i].cluster] === seg.groupOf[bases[i + 1].cluster];
    // the font's own hand-over points between neighbouring letters
    const oldExit: (Pt | null)[] = bases.map((_, i) => {
      if (!joined(i)) return null;
      const rel: Pt = [old[i + 1].x - old[i].x, old[i + 1].y - old[i].y];
      return computeContactCached(font, old[i].gid, old[i + 1].gid, rel).cA;
    });
    const newPos: Pt[] = [];
    const exitNow: (Pt | null)[] = [];
    let off: Pt = [0, 0];
    let lineDx = 0;
    let groupStart = 0;
    for (let i = 0; i < bases.length; i++) {
      const g = bases[i];
      const prevJoined = joined(i - 1);
      if (!prevJoined) {
        off = [lineDx, 0];
        groupStart = i;
      }
      const gid = swaps.get(`c${g.cluster}.${g.k}`);
      let pos: Pt = [old[i].x + off[0], old[i].y + off[1]];
      exitNow[i] = oldExit[i];
      if (gid !== undefined && gid !== g.gid) {
        const jp = joinPosition(text, g.cluster);
        const a = formAnchors(font, text[g.cluster], jp, gid);
        const adv = font.font.glyphHAdvance(gid);
        if (prevJoined && a?.entry && exitNow[i - 1]) {
          const prevExit: Pt = [newPos[i - 1][0] + exitNow[i - 1]![0], newPos[i - 1][1] + exitNow[i - 1]![1]];
          pos = [prevExit[0] - a.entry[0], prevExit[1] - a.entry[1]];
        } else if (joined(i) && a?.exit && oldExit[i]) {
          pos = [old[i].x + off[0] + oldExit[i]![0] - a.exit[0], old[i].y + off[1] + oldExit[i]![1] - a.exit[1]];
        } else {
          // keep the right edge (where an isolated letter starts)
          pos = [old[i].x + off[0] + old[i].adv - adv, old[i].y + off[1]];
        }
        if (joined(i)) exitNow[i] = a?.exit ?? oldExit[i];
        g.gid = gid;
        g.advance = adv;
      }
      newPos[i] = pos;
      // letters after this one follow its exit point
      if (joined(i) && exitNow[i] && oldExit[i]) {
        off = [pos[0] + exitNow[i]![0] - (old[i].x + oldExit[i]![0]), pos[1] + exitNow[i]![1] - (old[i].y + oldExit[i]![1])];
      }
      if (!joined(i)) {
        // group finished: later words shift with its left end so spacing stays the same
        let mNew = Infinity;
        let mOld = Infinity;
        for (let j = groupStart; j <= i; j++) {
          mNew = Math.min(mNew, newPos[j][0]);
          mOld = Math.min(mOld, old[j].x);
        }
        lineDx = mNew - mOld;
      }
    }
    // apply, moving marks with their base letter
    const delta = new Map<number, Pt>();
    bases.forEach((g, i) => {
      delta.set(g.cluster, [newPos[i][0] - old[i].x, newPos[i][1] - old[i].y]);
      g.x = newPos[i][0];
      g.y = newPos[i][1];
    });
    let lastBaseCluster = -1;
    for (const g of line.glyphs) {
      if (!g.isMark) {
        lastBaseCluster = g.cluster;
        continue;
      }
      const d = delta.get(g.cluster) ?? delta.get(lastBaseCluster);
      if (d) {
        g.x += d[0];
        g.y += d[1];
      }
    }
    // keep the line starting at x = 0 and recompute its width
    const minX = Math.min(...line.glyphs.map((g) => g.x));
    const maxX = Math.max(...line.glyphs.map((g) => g.x + g.advance));
    for (const g of line.glyphs) g.x -= minX;
    line.width = maxX - minX;
  }
}
