// Where two cursively joined glyphs meet: contact points and stroke cross-sections.
// Shared by the layout (join strokes) and by letter-variant placement.
import type { LoadedFont } from './fonts';
import { type BBox, type Pt, bboxOf, distToPolys, EMPTY_BBOX, insideShape, pointInPolygon, unionBBox } from './geometry';
import type { ShapedGlyph } from './shaping';

export interface JoinContact {
  /** where the stroke leaves A / enters B, block-local natural coords (equal when the letters touch) */
  cA: Pt;
  cB: Pt;
  /** thinnest ink chord of A through cA (resp. B through cB), as two offsets */
  chordA: [Pt, Pt] | null;
  chordB: [Pt, Pt] | null;
  /** unit stroke directions at cA / cB, both pointing from A towards B (natural coords) */
  tA: Pt;
  tB: Pt;
}

const contactCache = new Map<string, JoinContact>();

/**
 * Find where glyph A hands over to glyph B and the cross-section of the ink
 * stroke there. Works for baseline joins, stacked contextual forms, and for
 * swapped letterforms that no longer touch their neighbour.
 */
export function contact(font: LoadedFont, a: ShapedGlyph, b: ShapedGlyph, oa: Pt, ob: Pt): JoinContact {
  const key = `${font.info.id}:${a.gid}:${b.gid}:${Math.round(ob[0] - oa[0])}:${Math.round(ob[1] - oa[1])}`;
  let hit = contactCache.get(key);
  if (!hit) {
    hit = computeContact(font, a.gid, b.gid, [ob[0] - oa[0], ob[1] - oa[1]]);
    contactCache.set(key, hit);
  }
  return { cA: [hit.cA[0] + oa[0], hit.cA[1] + oa[1]], cB: [hit.cB[0] + oa[0], hit.cB[1] + oa[1]], chordA: hit.chordA, chordB: hit.chordB, tA: hit.tA, tB: hit.tB };
}

export function computeContact(font: LoadedFont, gidA: number, gidB: number, rel: Pt): JoinContact {
  const A = font.outline(gidA);
  const B = font.outline(gidB);
  const polysA = (A.pieces[0]?.contours ?? []).map((i) => A.polys[i]);
  const polysB = (B.pieces[0]?.contours ?? []).map((i) => B.polys[i].map(([x, y]) => [x + rel[0], y + rel[1]] as Pt));
  const upem = font.upem;
  const tol = upem * 0.012;
  const step = upem * 0.005;
  const maxLen = upem * 0.35;
  // bounding boxes let most point-in-shape tests bail out early
  const boxed = (polys: Pt[][]) => polys.map((poly) => ({ poly, b: bboxOf(poly) }));
  const bA = boxed(polysA);
  const bB = boxed(polysB);
  const insideFast = (p: Pt, set: { poly: Pt[]; b: BBox }[]) => {
    let n = 0;
    for (const { poly, b } of set) if (p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 && pointInPolygon(p, poly)) n++;
    return n % 2 === 1;
  };
  const insideOf = (polys: Pt[][]) => (polys === polysA ? (p: Pt) => insideFast(p, bA) : polys === polysB ? (p: Pt) => insideFast(p, bB) : (p: Pt) => insideShape(p, polys));
  const unionB = bB.reduce((u, x) => unionBBox(u, x.b), { ...EMPTY_BBOX } as BBox);
  const unionA = bA.reduce((u, x) => unionBBox(u, x.b), { ...EMPTY_BBOX } as BBox);
  // distance from `at` along `dir` until leaving the ink: coarse march, then bisect
  const coarse = upem * 0.02;
  const ray = (ins: (p: Pt) => boolean, at: Pt, dir: Pt, sgn: number) => {
    const P = (t: number): Pt => [at[0] + dir[0] * t * sgn, at[1] + dir[1] * t * sgn];
    let t = 0;
    while (t < maxLen && ins(P(t + coarse))) t += coarse;
    let lo = t;
    let hi = t + coarse;
    while (hi - lo > step) {
      const m = (lo + hi) / 2;
      if (ins(P(m))) lo = m;
      else hi = m;
    }
    return Math.min(lo, maxLen);
  };
  const near = (p: Pt, u: BBox) => p[0] >= u.x0 - tol && p[0] <= u.x1 + tol && p[1] >= u.y0 - tol && p[1] <= u.y1 + tol;

  // thinnest chord of one glyph through a point
  const chord = (polys: Pt[][], at: Pt): [Pt, Pt] | null => {
    const ins = insideOf(polys);
    let best: [Pt, Pt] | null = null;
    let bl = Infinity;
    for (let deg = 0; deg < 180; deg += 7.5) {
      const r = (deg * Math.PI) / 180;
      const dir: Pt = [Math.cos(r), Math.sin(r)];
      const ts = [1, -1].map((sgn) => ray(ins, at, dir, sgn));
      const len = ts[0] + ts[1];
      if (len > 0 && len < bl) {
        bl = len;
        best = [
          [dir[0] * ts[0], dir[1] * ts[0]],
          [-dir[0] * ts[1], -dir[1] * ts[1]],
        ];
      }
    }
    return best;
  };
  // recentre a point onto the middle of the stroke it sits in
  const centre = (polys: Pt[][], p: Pt): Pt => {
    const ch = chord(polys, p);
    if (!ch) return p;
    return [p[0] + (ch[0][0] + ch[1][0]) / 2, p[1] + (ch[0][1] + ch[1][1]) / 2];
  };

  // Stroke direction at each end: perpendicular to the thinnest chord, oriented from A's ink
  // towards B's ink near the join, so a join stroke can leave A and enter B smoothly.
  const inkNear = (polys: Pt[][], at: Pt, r: number): Pt | null => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const poly of polys)
      for (const p of poly)
        if (Math.hypot(p[0] - at[0], p[1] - at[1]) < r) {
          sx += p[0];
          sy += p[1];
          n++;
        }
    return n ? [sx / n, sy / n] : null;
  };
  const withTangents = (cA: Pt, cB: Pt, chordA: [Pt, Pt] | null, chordB: [Pt, Pt] | null): JoinContact => {
    const r = upem * 0.22;
    const mA = inkNear(polysA, cA, r) ?? cA;
    const mB = inkNear(polysB, cB, r) ?? cB;
    let dir: Pt = [mB[0] - mA[0], mB[1] - mA[1]];
    if (Math.hypot(dir[0], dir[1]) < 1e-6) dir = [-1, 0];
    const along = (ch: [Pt, Pt] | null): Pt => {
      const l0 = Math.hypot(dir[0], dir[1]);
      if (!ch) return [dir[0] / l0, dir[1] / l0];
      const v: Pt = [ch[0][0] - ch[1][0], ch[0][1] - ch[1][1]];
      const l = Math.hypot(v[0], v[1]) || 1;
      let t: Pt = [-v[1] / l, v[0] / l];
      if (t[0] * dir[0] + t[1] * dir[1] < 0) t = [-t[0], -t[1]];
      return t;
    };
    return { cA, cB, chordA, chordB, tA: along(chordA), tB: along(chordB) };
  };

  const pts: Pt[] = [];
  for (const poly of polysA) for (const p of poly) if (near(p, unionB) && (insideFast(p, bB) || distToPolys(p, polysB) < tol)) pts.push(p);
  for (const poly of polysB) for (const p of poly) if (near(p, unionA) && (insideFast(p, bA) || distToPolys(p, polysA) < tol)) pts.push(p);

  if (!pts.length) {
    // Not touching (e.g. a swapped letterform): bridge between the closest ink of each letter.
    let best: [Pt, Pt] | null = null;
    let bd = Infinity;
    for (const pa of polysA.flat())
      for (const pb of polysB.flat()) {
        const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
        if (d < bd) {
          bd = d;
          best = [pa, pb];
        }
      }
    if (!best) return { cA: [0, font.kashidaY], cB: [0, font.kashidaY], chordA: null, chordB: null, tA: [-1, 0], tB: [-1, 0] };
    // nudge each end into its stroke so the bridge starts inside the ink
    const inward = (polys: Pt[][], p: Pt, toward: Pt): Pt => {
      const v: Pt = [p[0] - toward[0], p[1] - toward[1]];
      const l = Math.hypot(v[0], v[1]) || 1;
      for (let t = step; t < maxLen; t += step) {
        const q: Pt = [p[0] + (v[0] / l) * t, p[1] + (v[1] / l) * t];
        if (insideOf(polys)(q)) return centre(polys, q);
      }
      return p;
    };
    const cA = inward(polysA, best[0], best[1]);
    const cB = inward(polysB, best[1], best[0]);
    return withTangents(cA, cB, chord(polysA, cA), chord(polysB, cB));
  }

  let c: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const inside = (p: Pt) => insideFast(p, bA) || insideFast(p, bB);
  if (!inside(c)) {
    let best: Pt | null = null;
    let bd = Infinity;
    for (const p of pts) {
      for (const [ox, oy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const q: Pt = [p[0] + ox, p[1] + oy];
        const d = Math.hypot(q[0] - c[0], q[1] - c[1]);
        if (d < bd && inside(q)) {
          bd = d;
          best = q;
        }
      }
    }
    if (best) c = best;
  }
  // centre of the thinnest cross-section of the combined ink
  let bestLen = Infinity;
  let mid = c;
  for (let deg = 0; deg < 180; deg += 7.5) {
    const r = (deg * Math.PI) / 180;
    const dir: Pt = [Math.cos(r), Math.sin(r)];
    const ts = [1, -1].map((sgn) => ray(inside, c, dir, sgn));
    if (ts[0] + ts[1] < bestLen) {
      bestLen = ts[0] + ts[1];
      mid = [c[0] + (dir[0] * (ts[0] - ts[1])) / 2, c[1] + (dir[1] * (ts[0] - ts[1])) / 2];
    }
  }
  return withTangents(mid, mid, chord(polysA, mid), chord(polysB, mid));
}


export interface Anchors {
  /** where the letter receives the stroke from the previous letter (its own outline coords) */
  entry?: Pt;
  /** where it hands over to the next letter */
  exit?: Pt;
}

/** Entry/exit points of `self` given its shaped neighbours (any may be missing). */
export function anchorsInContext(font: LoadedFont, self: ShapedGlyph, prev?: ShapedGlyph, next?: ShapedGlyph): Anchors {
  const out: Anchors = {};
  if (prev) {
    const rel: Pt = [self.x - prev.x, self.y - prev.y];
    const c = computeContactCached(font, prev.gid, self.gid, rel);
    out.entry = [c.cB[0] - rel[0], c.cB[1] - rel[1]];
  }
  if (next) {
    const rel: Pt = [next.x - self.x, next.y - self.y];
    out.exit = computeContactCached(font, self.gid, next.gid, rel).cA;
  }
  return out;
}

function computeContactCached(font: LoadedFont, a: number, b: number, rel: Pt): JoinContact {
  const key = `${font.info.id}:${a}:${b}:${Math.round(rel[0])}:${Math.round(rel[1])}`;
  let hit = contactCache.get(key);
  if (!hit) {
    hit = computeContact(font, a, b, rel);
    contactCache.set(key, hit);
  }
  return hit;
}

/**
 * Translation that puts a swapped glyph where the original one joined its
 * neighbours: average of the entry/exit mismatches that both forms have.
 */
export function swapOffset(oldA: Anchors, newA: Anchors): Pt | null {
  const d: Pt[] = [];
  if (oldA.entry && newA.entry) d.push([oldA.entry[0] - newA.entry[0], oldA.entry[1] - newA.entry[1]]);
  if (oldA.exit && newA.exit) d.push([oldA.exit[0] - newA.exit[0], oldA.exit[1] - newA.exit[1]]);
  if (!d.length) return null;
  return [d.reduce((s, v) => s + v[0], 0) / d.length, d.reduce((s, v) => s + v[1], 0) / d.length];
}
