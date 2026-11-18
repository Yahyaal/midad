// Layout: turns a block (text + sparse edits) into positioned, transformed
// glyph pieces, synthesised joining strokes and selectable element info.
import { segment, type Segmentation } from './arabic';
import { fontInfo, type GlyphOutline, type LoadedFont } from './fonts';
import {
  type BBox,
  type Mat,
  type Pt,
  type PointFn,
  apply,
  applyVec,
  bboxCenter,
  bboxOf,
  bboxValid,
  compose,
  contoursToD,
  cubicPoint,
  det,
  distToPolys,
  EMPTY_BBOX,
  flattenContour,
  IDENTITY,
  insideShape,
  lerp,
  rotate,
  scale,
  translate,
  unionBBox,
} from './geometry';
import {
  type Block,
  type Edit,
  type ElemKind,
  type ElemRef,
  dotKey,
  glyphKey,
  groupKey,
  joinKey,
  wordKey,
} from './model';
import { type FeatureRange, parseFeature, shapeText, type ShapedGlyph, type ShapedLine } from './shaping';

export interface LaidPiece {
  key: string; // glyph key or dot key
  kind: 'body' | 'dot' | 'mark';
  glyphKey: string;
  d: string; // path in outline coords
  /** outline coords → artboard */
  world: Mat;
  bbox: BBox; // artboard
}

export interface LaidGlyph {
  key: string;
  cluster: number;
  k: number;
  gid: number;
  isMark: boolean;
  baseKey: string;
  groupKey: string;
  wordKey: string;
  line: number;
  char: string;
  /** natural origin in block-local font units (y up) */
  origin: Pt;
  shift: number;
  pieces: LaidPiece[];
  outline: GlyphOutline;
  /** outline coords → artboard (body) */
  world: Mat;
  /** stretch cut line in outline coords (if stretched) */
  cutX?: number;
}

export interface LaidJoin {
  key: string;
  a: string;
  b: string;
  /** artboard coordinates */
  pA: Pt;
  pB: Pt;
  mid: Pt;
  /** ribbon path in artboard coordinates ('' when the letters still touch) */
  d: string;
  edit: Edit;
  visible: boolean;
}

export interface ElemInfo {
  ref: ElemRef;
  /** artboard ← parent space */
  parent: Mat;
  /** pivot in parent space */
  pivot: Pt;
  edit: Edit;
  bbox: BBox; // artboard
  label: string;
}

export interface LaidBlock {
  block: Block;
  font: LoadedFont;
  seg: Segmentation;
  lines: ShapedLine[];
  glyphs: LaidGlyph[];
  joins: LaidJoin[];
  elems: Map<string, ElemInfo>;
  /** block-local (font units, y up) → artboard */
  base: Mat;
  bbox: BBox;
  /** maps a glyph key to the element that owns it at each level */
  owners: Map<string, { word: string; group: string; letter: string }>;
}

export function editMat(e: Edit | undefined, pivot: Pt): Mat {
  if (!e) return IDENTITY;
  const { tx = 0, ty = 0, sx = 1, sy = 1, rot = 0 } = e;
  if (!tx && !ty && sx === 1 && sy === 1 && !rot) return IDENTITY;
  return compose(translate(pivot[0] + tx, pivot[1] + ty), rotate(rot), scale(sx, sy), translate(-pivot[0], -pivot[1]));
}

function stretchFn(e: Edit | undefined, o: GlyphOutline): { f?: PointFn; cutX?: number; amount: number } {
  const s = e?.stretch ?? 0;
  const pts = e?.points;
  if (!s && !pts) return { amount: 0 };
  const cutX = lerp(o.bbox.x0, o.bbox.x1, e?.cut ?? 0.5);
  const f: PointFn = (x, y) => (s && x < cutX ? [x - s, y] : [x, y]);
  return { f, cutX: s ? cutX : undefined, amount: s };
}

/** Apply per-point edits; returns contour list with moved control points. */
function applyPointEdits(o: GlyphOutline, points: Record<string, [number, number]> | undefined) {
  if (!points || !Object.keys(points).length) return o.contours;
  return o.contours.map((contour, ci) =>
    contour.map((cmd, mi) => {
      if (cmd.t === 'Z') return cmd;
      let v = cmd.v;
      for (let pi = 0; pi < cmd.v.length / 2; pi++) {
        const off = points[`${ci}.${mi}.${pi}`];
        if (off) {
          if (v === cmd.v) v = [...cmd.v];
          v[pi * 2] += off[0];
          v[pi * 2 + 1] += off[1];
        }
      }
      return v === cmd.v ? cmd : { t: cmd.t, v };
    }),
  );
}

interface JoinContact {
  /** centre of the stroke cross-section at the join, block-local natural coords */
  c: Pt;
  /** half of the cross-section vector (from c to one edge of the stroke) */
  h: Pt;
  /** thinnest ink chord of A (resp. B) alone through c, as two offsets from c */
  chordA: [Pt, Pt] | null;
  chordB: [Pt, Pt] | null;
}

const contactCache = new Map<string, JoinContact>();

/**
 * Find where glyph A hands over to glyph B and the cross-section of the ink
 * stroke there. Works for baseline joins and for stacked contextual forms.
 */
function contact(font: LoadedFont, a: ShapedGlyph, b: ShapedGlyph, oa: Pt, ob: Pt): JoinContact {
  const key = `${font.info.id}:${a.gid}:${b.gid}:${Math.round(ob[0] - oa[0])}:${Math.round(ob[1] - oa[1])}`;
  let hit = contactCache.get(key);
  if (!hit) {
    hit = computeContact(font, a.gid, b.gid, [ob[0] - oa[0], ob[1] - oa[1]]);
    contactCache.set(key, hit);
  }
  return { c: [hit.c[0] + oa[0], hit.c[1] + oa[1]], h: hit.h, chordA: hit.chordA, chordB: hit.chordB };
}

function computeContact(font: LoadedFont, gidA: number, gidB: number, rel: Pt): JoinContact {
  const A = font.outline(gidA);
  const B = font.outline(gidB);
  const polysA = (A.pieces[0]?.contours ?? []).map((i) => A.polys[i]);
  const polysB = (B.pieces[0]?.contours ?? []).map((i) => B.polys[i].map(([x, y]) => [x + rel[0], y + rel[1]] as Pt));
  const upem = font.upem;
  const tol = upem * 0.012;
  const pts: Pt[] = [];
  for (const poly of polysA) for (const p of poly) if (insideShape(p, polysB) || distToPolys(p, polysB) < tol) pts.push(p);
  for (const poly of polysB) for (const p of poly) if (insideShape(p, polysA) || distToPolys(p, polysA) < tol) pts.push(p);
  const fallbackH: Pt = [0, font.kashidaThickness / 2];
  if (!pts.length) {
    const left = polysA.flat().reduce((best, p) => (p[0] < best[0] ? p : best), [Infinity, 0] as Pt);
    return { c: Number.isFinite(left[0]) ? left : [0, font.kashidaY], h: fallbackH, chordA: null, chordB: null };
  }
  let c: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const inside = (p: Pt) => insideShape(p, polysA) || insideShape(p, polysB);
  if (!inside(c)) {
    // nearest contact point that lies inside the ink
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
    if (!best) return { c, h: fallbackH, chordA: null, chordB: null };
    c = best;
  }
  // Thinnest chord through c = stroke cross-section.
  const step = upem * 0.004;
  const maxLen = upem * 0.35;
  let bestLen = Infinity;
  let bestSeg: [Pt, Pt] = [
    [c[0], c[1] - fallbackH[1]],
    [c[0], c[1] + fallbackH[1]],
  ];
  for (let deg = 0; deg < 180; deg += 7.5) {
    const r = (deg * Math.PI) / 180;
    const dir: Pt = [Math.cos(r), Math.sin(r)];
    const march = (sgn: number) => {
      let t = 0;
      while (t < maxLen) {
        const q: Pt = [c[0] + dir[0] * (t + step) * sgn, c[1] + dir[1] * (t + step) * sgn];
        if (!inside(q)) break;
        t += step;
      }
      return t;
    };
    const t1 = march(1);
    const t2 = march(-1);
    const len = t1 + t2;
    if (len < bestLen) {
      bestLen = len;
      bestSeg = [
        [c[0] + dir[0] * t1, c[1] + dir[1] * t1],
        [c[0] - dir[0] * t2, c[1] - dir[1] * t2],
      ];
    }
  }
  const mid: Pt = [(bestSeg[0][0] + bestSeg[1][0]) / 2, (bestSeg[0][1] + bestSeg[1][1]) / 2];
  let h: Pt = [(bestSeg[0][0] - bestSeg[1][0]) / 2, (bestSeg[0][1] - bestSeg[1][1]) / 2];
  // keep a minimum thickness so hairline joins stay visible
  const minHalf = font.kashidaThickness * 0.3;
  const hl = Math.hypot(h[0], h[1]);
  if (hl < minHalf) h = hl > 0 ? [(h[0] / hl) * minHalf, (h[1] / hl) * minHalf] : [0, minHalf];
  // canonical orientation: h points "up" (or right)
  if (h[1] < 0 || (h[1] === 0 && h[0] < 0)) h = [-h[0], -h[1]];
  // thinnest chord of each glyph alone through the recentred point
  const chord = (polys: Pt[][]): [Pt, Pt] | null => {
    let best: [Pt, Pt] | null = null;
    let bl = Infinity;
    for (let deg = 0; deg < 180; deg += 7.5) {
      const r = (deg * Math.PI) / 180;
      const dir: Pt = [Math.cos(r), Math.sin(r)];
      const ts = [1, -1].map((sgn) => {
        let t = 0;
        while (t < maxLen && insideShape([mid[0] + dir[0] * (t + step) * sgn, mid[1] + dir[1] * (t + step) * sgn], polys)) t += step;
        return t;
      });
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
  const chordA = chord(polysA);
  const chordB = chord(polysB);
  return { c: mid, h, chordA, chordB };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

export interface PenSpec {
  /** nib width (artboard units) */
  width: number;
  /** nib angle, degrees counter-clockwise from the baseline as seen on screen */
  angle: number;
  /** minimum stroke thickness as a fraction of the nib width */
  min: number;
}

/**
 * The joining stroke: a broad-pen stroke from A's exit point to B's entry
 * point along a bendable cubic. Thickness follows the pen angle, so
 * horizontal kashidas come out full and steep connections thin.
 */
export function bridgePath(
  pA: Pt,
  pB: Pt,
  sA: number,
  sB: number,
  pen: PenSpec,
  bend: number,
  weight: number,
  /** ink cross-sections (two screen points) where the stroke leaves A and enters B */
  capA?: [Pt, Pt] | null,
  capB?: [Pt, Pt] | null,
): string {
  const dx = pB[0] - pA[0];
  const dy = pB[1] - pA[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.8) return '';
  const nx = -dy / len;
  const ny = dx / len;
  const k = bend * len * 0.75;
  const c1: Pt = [pA[0] + dx / 3 + nx * k, pA[1] + dy / 3 + ny * k];
  const c2: Pt = [pA[0] + (2 * dx) / 3 + nx * k, pA[1] + (2 * dy) / 3 + ny * k];
  const steps = Math.min(48, Math.max(8, Math.round(len / 4)));
  const r = (pen.angle * Math.PI) / 180;
  const nib: Pt = [Math.cos(r), -Math.sin(r)]; // screen space, y down
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const m = cubicPoint(pA, c1, c2, pB, t);
    const m2 = cubicPoint(pA, c1, c2, pB, Math.min(1, t + 0.01));
    const m1 = cubicPoint(pA, c1, c2, pB, Math.max(0, t - 0.01));
    let tx = m2[0] - m1[0];
    let ty = m2[1] - m1[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const cross = Math.abs(tx * nib[1] - ty * nib[0]);
    const thin = 1 - (1 - weight) * Math.sin(Math.PI * t);
    const half = (pen.width * Math.max(pen.min, cross) * lerp(sA, sB, t) * thin) / 2;
    let tp: Pt = [m[0] - ty * half, m[1] + tx * half];
    let bp: Pt = [m[0] + ty * half, m[1] - tx * half];
    const ramp = 0.06 + Math.min(1, len / (pen.width * 3)) * 0.22;
    const blendCap = (cap: [Pt, Pt], u: number) => {
      // pick which cap point continues the top edge
      const n: Pt = [-ty, tx];
      const d0 = (cap[0][0] - m[0]) * n[0] + (cap[0][1] - m[1]) * n[1];
      const [ct, cb] = d0 >= 0 ? cap : [cap[1], cap[0]];
      const w = smooth(Math.min(1, u / ramp));
      tp = [lerp(ct[0], tp[0], w), lerp(ct[1], tp[1], w)];
      bp = [lerp(cb[0], bp[0], w), lerp(cb[1], bp[1], w)];
    };
    if (capA && t < ramp) blendCap(capA, t);
    if (capB && t > 1 - ramp) blendCap(capB, 1 - t);
    top.push(tp);
    bot.push(bp);
  }
  const ring = [...top, ...bot.reverse()];
  return `M${ring.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L')}Z`;
}

function transformedBBox(polys: Pt[][], m: Mat, into: BBox): BBox {
  for (const poly of polys) for (const p of poly) bboxOf([apply(m, p)], into);
  return into;
}

export function layoutBlock(block: Block, font: LoadedFont): LaidBlock {
  const text = block.text;
  const seg = segment(text);
  const features: FeatureRange[] = block.features.map((f) => parseFeature(f));
  // Per-glyph alternates are applied to the glyph's cluster range.
  for (const [key, e] of Object.entries(block.edits)) {
    if (!e.alt || !key.startsWith('c')) continue;
    const cl = Number(key.slice(1).split('.')[0]);
    for (const f of e.alt.split(',')) features.push(parseFeature(f, cl, cl + 1));
  }
  const lines = shapeText(font, text, features);
  const upem = font.upem;
  const k = block.size / upem;
  const edits = block.edits;

  // 1. Natural origins + kashida shifts --------------------------------------
  interface Pre {
    g: ShapedGlyph;
    key: string;
    origin: Pt;
    shift: number;
    outline: GlyphOutline;
    stretch: ReturnType<typeof stretchFn>;
    baseKey: string;
  }
  const pre: Pre[] = [];
  for (const line of lines) {
    let lastBase: Pre | null = null;
    let shift = 0;
    const lineStart = pre.length;
    for (const g of line.glyphs) {
      const key = glyphKey(g.cluster, g.k);
      const outline = font.outline(g.gid);
      const e = edits[key];
      const p: Pre = {
        g,
        key,
        origin: [g.x, g.y - line.index * block.lineHeight * upem],
        shift: 0,
        outline,
        stretch: g.isMark ? { amount: 0 } : stretchFn(e, outline),
        baseKey: key,
      };
      if (g.isMark && lastBase) {
        p.baseKey = lastBase.key;
        p.shift = lastBase.shift;
        // marks sitting left of the base's cut move with the stretched part
        if (lastBase.stretch.cutX !== undefined) {
          const mx = (outline.bbox.x0 + outline.bbox.x1) / 2 + p.origin[0] - lastBase.origin[0];
          if (mx < lastBase.stretch.cutX) p.shift -= lastBase.stretch.amount;
        }
      } else {
        if (lastBase) {
          const j = edits[joinKey(lastBase.key)];
          if (j?.extend) shift -= j.extend;
        }
        p.shift = shift;
        shift -= p.stretch.amount;
        lastBase = p;
      }
      pre.push(p);
    }
    const extra = -shift;
    // alignment: position the line relative to the block anchor
    // visual extent after kashida shifts is [-extra, width]
    const ox = block.align === 'right' ? -line.width : block.align === 'left' ? extra : -(line.width - extra) / 2;
    for (let i = lineStart; i < pre.length; i++) pre[i].origin = [pre[i].origin[0] + ox, pre[i].origin[1]];
  }

  // 2. Natural boxes (after shift, before edits) for pivots -------------------
  const natBox = (p: Pre): BBox => {
    const o = p.outline;
    if (o.empty) return { ...EMPTY_BBOX };
    const b = o.pieces[0]?.bbox ?? o.bbox;
    const s = p.stretch.amount;
    return { x0: b.x0 + p.origin[0] + p.shift - s, y0: b.y0 + p.origin[1], x1: b.x1 + p.origin[0] + p.shift, y1: b.y1 + p.origin[1] };
  };
  const wordBoxes = new Map<string, BBox>();
  const groupBoxes = new Map<string, BBox>();
  let blockNat: BBox = { ...EMPTY_BBOX };
  for (const p of pre) {
    const nb = natBox(p);
    if (!bboxValid(nb)) continue;
    const wi = seg.wordOf[p.g.cluster];
    const gi = seg.groupOf[p.g.cluster];
    if (wi >= 0) wordBoxes.set(wordKey(wi), unionBBox(wordBoxes.get(wordKey(wi)) ?? { ...EMPTY_BBOX }, nb));
    if (gi >= 0) groupBoxes.set(groupKey(gi), unionBBox(groupBoxes.get(groupKey(gi)) ?? { ...EMPTY_BBOX }, nb));
    blockNat = unionBBox(blockNat, nb);
  }

  const base0: Mat = compose(translate(block.x, block.y), scale(k, -k));
  const blockPivot = bboxValid(blockNat) ? apply(base0, bboxCenter(blockNat)) : ([block.x, block.y] as Pt);
  const B = compose(editMat(block.transform, blockPivot), base0);

  // 3. Final matrices ---------------------------------------------------------
  const elems = new Map<string, ElemInfo>();
  const glyphs: LaidGlyph[] = [];
  const owners = new Map<string, { word: string; group: string; letter: string }>();
  const localOf = new Map<string, Mat>(); // glyph key → block-local edit stack W·G·L (without origin)
  const WG = new Map<string, Mat>();
  const preByKey = new Map(pre.map((p) => [p.key, p]));

  const addElem = (kind: ElemKind, key: string, parent: Mat, pivot: Pt, label: string) => {
    const id = `${block.id}/${key || 'block'}`;
    let el = elems.get(id);
    if (!el) {
      el = { ref: { block: block.id, kind, key }, parent, pivot, edit: (key ? edits[key] : block.transform) ?? {}, bbox: { ...EMPTY_BBOX }, label };
      elems.set(id, el);
    }
    return el;
  };
  const blockEl = addElem('block', '', IDENTITY, blockPivot, 'Block');

  for (const p of pre) {
    const g = p.g;
    const wi = seg.wordOf[g.cluster];
    const gi = seg.groupOf[g.cluster];
    const wk = wi >= 0 ? wordKey(wi) : '';
    const gk = gi >= 0 ? groupKey(gi) : '';
    const wBox = wordBoxes.get(wk);
    const gBox = groupBoxes.get(gk);
    const W = wk && wBox ? editMat(edits[wk], bboxCenter(wBox)) : IDENTITY;
    const G = gk && gBox ? editMat(edits[gk], bboxCenter(gBox)) : IDENTITY;
    const wg = compose(W, G);
    WG.set(p.key, wg);
    const nb = natBox(p);
    const pivot = bboxValid(nb) ? bboxCenter(nb) : p.origin;
    let L: Mat;
    let letterKey = p.key;
    if (g.isMark && p.baseKey !== p.key) {
      const basePre = preByKey.get(p.baseKey)!;
      const baseNb = natBox(basePre);
      const baseOwn = editMat(edits[p.baseKey], bboxValid(baseNb) ? bboxCenter(baseNb) : basePre.origin);
      L = compose(baseOwn, editMat(edits[p.key], pivot));
      letterKey = p.baseKey;
    } else {
      L = editMat(edits[p.key], pivot);
    }
    const local = compose(wg, L);
    localOf.set(p.key, local);
    const toLocal = compose(local, translate(p.origin[0] + p.shift, p.origin[1]));
    const world = compose(B, toLocal);
    owners.set(p.key, { word: wk, group: gk, letter: letterKey });

    const laid: LaidGlyph = {
      key: p.key,
      cluster: g.cluster,
      k: g.k,
      gid: g.gid,
      isMark: g.isMark,
      baseKey: p.baseKey,
      groupKey: gk,
      wordKey: wk,
      line: g.line,
      char: block.text.slice(g.cluster, g.cluster + 1),
      origin: p.origin,
      shift: p.shift,
      pieces: [],
      outline: p.outline,
      world,
      cutX: p.stretch.cutX,
    };
    const o = p.outline;
    if (!o.empty) {
      const contours = applyPointEdits(o, edits[p.key]?.points);
      const f = p.stretch.f;
      o.pieces.forEach((piece, j) => {
        const cs = piece.contours.map((i) => contours[i]);
        if (piece.kind === 'body') {
          const d = contoursToD(cs, f);
          const polys = cs.map((c) => flattenContour(c, f, 4, 60));
          laid.pieces.push({ key: p.key, kind: g.isMark ? 'mark' : 'body', glyphKey: p.key, d, world, bbox: transformedBBox(polys, world, { ...EMPTY_BBOX }) });
        } else {
          const dk = dotKey(p.key, j);
          const c = bboxCenter(piece.bbox);
          const dShift = p.stretch.cutX !== undefined && c[0] < p.stretch.cutX ? -p.stretch.amount : 0;
          const D = compose(editMat(edits[dk], [c[0] + dShift, c[1]]), translate(dShift, 0));
          const dw = compose(world, D);
          const polys = cs.map((cc) => flattenContour(cc, undefined, 4, 60));
          laid.pieces.push({ key: dk, kind: 'dot', glyphKey: p.key, d: contoursToD(cs), world: dw, bbox: transformedBBox(polys, dw, { ...EMPTY_BBOX }) });
          const del = addElem('dot', dk, world, [c[0] + dShift, c[1]], 'Dot');
          del.bbox = unionBBox(del.bbox, laid.pieces[laid.pieces.length - 1].bbox);
        }
      });
    }
    glyphs.push(laid);

    // element infos
    const allBox = laid.pieces.reduce((b, pc) => unionBBox(b, pc.bbox), { ...EMPTY_BBOX } as BBox);
    if (g.isMark && p.baseKey !== p.key) {
      const basePre = preByKey.get(p.baseKey)!;
      const baseNb = natBox(basePre);
      const parent = compose(B, wg, editMat(edits[p.baseKey], bboxValid(baseNb) ? bboxCenter(baseNb) : basePre.origin));
      const el = addElem('glyph', p.key, parent, pivot, 'Mark');
      el.bbox = unionBBox(el.bbox, allBox);
    } else {
      const el = addElem('glyph', p.key, compose(B, wg), pivot, g.isMark ? 'Mark' : 'Letter');
      el.bbox = unionBBox(el.bbox, allBox);
    }
    if (gk && gBox) {
      const el = addElem('group', gk, compose(B, W), bboxCenter(gBox), 'Connected group');
      el.bbox = unionBBox(el.bbox, allBox);
    }
    if (wk && wBox) {
      const el = addElem('word', wk, B, bboxCenter(wBox), 'Word');
      el.bbox = unionBBox(el.bbox, allBox);
    }
    blockEl.bbox = unionBBox(blockEl.bbox, allBox);
  }
  // Letters own their marks: grow letter boxes to include marks
  for (const gl of glyphs) {
    if (gl.isMark && gl.baseKey !== gl.key) {
      const el = elems.get(`${block.id}/${gl.baseKey}`);
      const mb = elems.get(`${block.id}/${gl.key}`);
      if (el && mb) el.bbox = unionBBox(el.bbox, mb.bbox);
    }
  }

  // 4. Joins ---------------------------------------------------------------
  const joins: LaidJoin[] = [];
  const info = fontInfo(block.font);
  // rotation of the block on screen (B flips y, so measure the x axis)
  const blockAngle = (-Math.atan2(B[1], B[0]) * 180) / Math.PI;
  for (const line of lines) {
    const bases = line.glyphs.filter((g) => !g.isMark && !font.outline(g.gid).empty);
    for (let i = 0; i + 1 < bases.length; i++) {
      const a = bases[i];
      const b = bases[i + 1];
      // connected only if the chars between a and b keep joining
      const ca = a.cluster;
      if (seg.groupOf[ca] < 0 || seg.groupOf[ca] !== seg.groupOf[b.cluster]) continue;
      const pa = preByKey.get(glyphKey(a.cluster, a.k))!;
      const pb = preByKey.get(glyphKey(b.cluster, b.k))!;
      const jk = joinKey(pa.key);
      const je = edits[jk] ?? {};
      const cNat = contact(font, a, b, [a.x, pa.origin[1]], [b.x, pb.origin[1]]);
      // contact in each glyph's outline coords
      const toA = (p: Pt): Pt => [p[0] - a.x, p[1] - pa.origin[1]];
      const toB = (p: Pt): Pt => [p[0] - b.x, p[1] - pb.origin[1]];
      const fa = pa.stretch.f ?? ((x: number, y: number): Pt => [x, y]);
      const fb = pb.stretch.f ?? ((x: number, y: number): Pt => [x, y]);
      const gA = glyphs.find((g) => g.key === pa.key)!;
      const gB = glyphs.find((g) => g.key === pb.key)!;
      const qa = toA(cNat.c);
      const qb = toB(cNat.c);
      const PA = apply(gA.world, fa(qa[0], qa[1]));
      const PB = apply(gB.world, fb(qb[0], qb[1]));
      const sA = Math.sqrt(Math.abs(det(localOf.get(pa.key) ?? IDENTITY)));
      const sB = Math.sqrt(Math.abs(det(localOf.get(pb.key) ?? IDENTITY)));
      const blockScale = Math.sqrt(Math.abs(det(B)));
      const pen: PenSpec = {
        width: (font.kashidaThickness / Math.sin((info.nibAngle * Math.PI) / 180)) * blockScale,
        angle: info.nibAngle + blockAngle,
        min: 0.35,
      };
      const capFor = (chord: [Pt, Pt] | null, toLocal: (p: Pt) => Pt, f: PointFn, world: Mat): [Pt, Pt] | null => {
        if (!chord) return null;
        const m = (o: Pt) => {
          const q = toLocal([cNat.c[0] + o[0], cNat.c[1] + o[1]]);
          return apply(world, f(q[0], q[1]));
        };
        return [m(chord[0]), m(chord[1])];
      };
      const d = bridgePath(
        PA,
        PB,
        sA,
        sB,
        pen,
        je.bend ?? 0,
        je.weight ?? 1,
        capFor(cNat.chordA, toA, fa, gA.world),
        capFor(cNat.chordB, toB, fb, gB.world),
      );
      const len = Math.hypot(PB[0] - PA[0], PB[1] - PA[1]);
      const bend = je.bend ?? 0;
      const nrm: Pt = len > 0 ? [-(PB[1] - PA[1]) / len, (PB[0] - PA[0]) / len] : [0, 0];
      const mid: Pt = [
        (PA[0] + PB[0]) / 2 + nrm[0] * bend * len * 0.5625,
        (PA[1] + PB[1]) / 2 + nrm[1] * bend * len * 0.5625,
      ];
      const lj: LaidJoin = { key: jk, a: pa.key, b: pb.key, pA: PA, pB: PB, mid, d, edit: je, visible: !!d };
      joins.push(lj);
      const el = addElem('join', jk, B, apply(invertSafe(B), mid), 'Join');
      el.bbox = bboxOf([PA, PB, mid]);
    }
  }

  const bbox = blockEl.bbox;
  return { block, font, seg, lines, glyphs, joins, elems, base: B, bbox, owners };
}

function invertSafe(m: Mat): Mat {
  const d = det(m) || 1e-9;
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
}

/** Vector from artboard into an element's parent space (for drags). */
export function artToParentVec(el: ElemInfo, v: Pt): Pt {
  return applyVec(invertSafe(el.parent), v);
}
