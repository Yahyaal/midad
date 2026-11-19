// "Tidy": clean up a composition after free editing while keeping its intent.
//
// Passes (each conservative, scaled by `strength`):
//  1. smooth   – even out vertical jumps and rotations along each connected word
//  2. kashida  – turn sideways pulls between joined letters into kashida on the baseline
//  3. forms    – where a join still bridges a long gap, try the letter's other forms
//  4. spacing  – push apart words/groups that collide or lost their space
//  5. dots     – bring far-flung dots back near their letter
// The result is plain edits, so one undo restores everything.
import type { LoadedFont } from './fonts';
import { type BBox, bboxValid, EMPTY_BBOX, unionBBox } from './geometry';
import { layoutBlock, type LaidBlock } from './layout';
import { type Block, cleanEdit, type Edit } from './model';
import { fitNeighbours, letterVariants, naturalGid } from './variants';

export interface TidyOptions {
  /** 0..1 — how far to go */
  strength: number;
  /** only these connected groups (keys like "g0"); all when omitted */
  groups?: Set<string>;
}

export interface TidyReport {
  /** letter sizes evened out / sideways stretching turned into elongation */
  pen: number;
  smoothed: number;
  kashidas: number;
  forms: number;
  spaced: number;
  dots: number;
}

type Edits = Record<string, Edit>;

const letterKeyRe = /^c\d+\.\d+$/;

function setE(edits: Edits, key: string, e: Edit) {
  const c = cleanEdit(e);
  if (c) edits[key] = c;
  else delete edits[key];
}

/** Letters (non-mark base glyphs) of each connected group, in reading order. */
function groupsOf(lb: LaidBlock): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const g of lb.glyphs) {
    if (g.isMark || g.outline.empty || !g.groupKey) continue;
    out.set(g.groupKey, [...(out.get(g.groupKey) ?? []), g.key]);
  }
  return out;
}

function inkBox(lb: LaidBlock, keys: Set<string>): BBox {
  let b: BBox = { ...EMPTY_BBOX };
  for (const g of lb.glyphs) if (keys.has(g.key) || keys.has(g.baseKey)) for (const p of g.pieces) if (bboxValid(p.bbox)) b = unionBBox(b, p.bbox);
  return b;
}

export function tidyBlock(block: Block, font: LoadedFont, opts: TidyOptions): { block: Block; report: TidyReport } {
  const s = Math.max(0, Math.min(1, opts.strength));
  const upem = font.upem;
  const report: TidyReport = { pen: 0, smoothed: 0, kashidas: 0, forms: 0, spaced: 0, dots: 0 };
  const edits: Edits = structuredClone(block.edits);
  const inScope = (gk: string) => !opts.groups || opts.groups.has(gk);
  let lb = layoutBlock(block, font);
  const groups = groupsOf(lb);

  // 0. Leftovers: letter forms saved for another font no longer apply.
  for (const [key, e] of Object.entries(edits)) if (e.swap && !e.swap.startsWith(`${font.info.id}:`)) setE(edits, key, { ...e, swap: undefined });

  // 0b. Pen passes. A pen keeps its stroke contrast: stretching a whole letter sideways widens its
  // vertical strokes too, so convert that into elongation (madd), and let sizes change gradually
  // from letter to letter instead of jumping.
  const laplace = (v: number[], n: number) => {
    for (let it = 0; it < n; it++) {
      const next = [...v];
      for (let i = 0; i < v.length; i++) {
        const nb = [v[i - 1], v[i + 1]].filter((x) => x !== undefined) as number[];
        next[i] = v[i] + 0.5 * (nb.reduce((a, b) => a + b, 0) / nb.length - v[i]);
      }
      v.splice(0, v.length, ...next);
    }
    return v;
  };
  for (const [gk, keys] of groups) {
    if (!inScope(gk)) continue;
    for (const k of keys) {
      const e = edits[k];
      if (!e) continue;
      const sx = e.sx ?? 1;
      const sy = e.sy ?? 1;
      if (sx / sy > 1.15) {
        const g = lb.glyphs.find((x) => x.key === k);
        const w = g ? g.outline.bbox.x1 - g.outline.bbox.x0 : 0;
        const nsx = sx + (sy - sx) * s;
        const madd = (w * (sx - nsx)) / sy;
        setE(edits, k, { ...e, sx: nsx, stretch: Math.round((e.stretch ?? 0) + madd) });
        report.pen++;
      } else if (sy / sx > 1.15) {
        const m = Math.sqrt(sx * sy);
        setE(edits, k, { ...e, sx: sx + (m - sx) * s, sy: sy + (m - sy) * s });
        report.pen++;
      }
    }
    if (keys.length < 2) continue;
    const logs = keys.map((k) => Math.log(Math.sqrt((edits[k]?.sx ?? 1) * (edits[k]?.sy ?? 1))));
    if (logs.every((x) => Math.abs(x) < 0.02)) continue;
    const before = [...logs];
    laplace(logs, Math.round(1 + 5 * s));
    keys.forEach((k, i) => {
      const f = Math.exp(before[i] + (logs[i] - before[i]) * Math.min(1, s * 1.15) - before[i]);
      if (Math.abs(f - 1) < 0.01) return;
      const e = edits[k] ?? {};
      setE(edits, k, { ...e, sx: (e.sx ?? 1) * f, sy: (e.sy ?? 1) * f });
      report.pen++;
    });
  }

  // 1. Smooth vertical offsets and rotations along each word (Laplacian smoothing).
  const iterations = Math.round(1 + 5 * s);
  for (const [gk, keys] of groups) {
    if (!inScope(gk) || keys.length < 2) continue;
    for (const prop of ['ty', 'rot'] as const) {
      const v = keys.map((k) => edits[k]?.[prop] ?? 0);
      if (v.every((x) => Math.abs(x) < 1e-6)) continue;
      const before = [...v];
      for (let it = 0; it < iterations; it++) {
        const next = [...v];
        for (let i = 0; i < v.length; i++) {
          const nb = [v[i - 1], v[i + 1]].filter((x) => x !== undefined) as number[];
          const avg = nb.reduce((a, b) => a + b, 0) / nb.length;
          next[i] = v[i] + 0.5 * (avg - v[i]);
        }
        v.splice(0, v.length, ...next);
      }
      keys.forEach((k, i) => {
        const val = before[i] + (v[i] - before[i]) * Math.min(1, s * 1.15);
        if (Math.abs(val - before[i]) > (prop === 'ty' ? upem * 0.005 : 0.3)) report.smoothed++;
        setE(edits, k, { ...edits[k], [prop]: val });
      });
    }
  }

  // 2. Sideways gaps between joined letters become kashida; later letters keep their place.
  const tol = upem * 0.02;
  for (const line of lb.lines) {
    let carry = 0; // kashida added so far on this line (shifts everything after it left)
    const bases = line.glyphs.filter((g) => !g.isMark);
    const seen = new Set<string>();
    for (const g of bases) {
      const key = `c${g.cluster}.${g.k}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // compensate for kashida added earlier on the line
      if (carry) setE(edits, key, { ...edits[key], tx: (edits[key]?.tx ?? 0) + carry });
      const j = lb.joins.find((x) => x.b === key);
      if (!j) continue;
      const gk = lb.owners.get(key)?.group ?? '';
      if (!inScope(gk)) continue;
      const dx = (edits[key]?.tx ?? 0) - (edits[j.a]?.tx ?? 0);
      const je = edits[j.key] ?? {};
      if (dx < -tol) {
        const add = -dx * s;
        setE(edits, j.key, { ...je, extend: Math.round((je.extend ?? 0) + add) });
        setE(edits, key, { ...edits[key], tx: (edits[key]?.tx ?? 0) + add });
        carry += add;
        report.kashidas++;
      } else if (dx > tol && (je.extend ?? 0) > 0) {
        // pushed back into its neighbour: give back some of the kashida instead
        const take = Math.min(je.extend ?? 0, dx * s);
        setE(edits, j.key, { ...je, extend: Math.round((je.extend ?? 0) - take) });
        setE(edits, key, { ...edits[key], tx: (edits[key]?.tx ?? 0) - take });
        carry -= take;
      }
    }
  }

  // kashidas drawn by hand sag a little and thin in the middle
  for (const [key, e] of Object.entries(edits)) {
    if (!key.startsWith('j') || !(e.extend ?? 0)) continue;
    const gk = lb.owners.get(`c${key.slice(1)}`)?.group ?? '';
    if (!inScope(gk)) continue;
    const next: Edit = { ...e };
    if (e.bend === undefined) next.bend = -0.07 * s;
    if (e.weight === undefined) next.weight = 1 - 0.14 * s;
    setE(edits, key, next);
  }

  // tiny leftovers snap to zero
  for (const k of Object.keys(edits)) {
    if (!letterKeyRe.test(k)) continue;
    const e = edits[k];
    if (Math.abs(e.tx ?? 0) < tol) e.tx = 0;
    if (Math.abs(e.ty ?? 0) < tol) e.ty = 0;
    if (Math.abs(e.rot ?? 0) < 0.5) e.rot = 0;
    setE(edits, k, e);
  }

  // 3. Joins still bridging a long gap: try the letters' other forms.
  lb = layoutBlock({ ...block, edits }, font);
  const k = block.size / upem;
  const bridgeLen = (l: LaidBlock, key: string) => {
    const j = l.joins.find((x) => x.key === key);
    return j && j.d ? Math.hypot(j.pB[0] - j.pA[0], j.pB[1] - j.pA[1]) : 0;
  };
  if (s >= 0.3) {
    for (const j of lb.joins) {
      const gk = lb.owners.get(j.a)?.group ?? '';
      if (!inScope(gk) || (edits[j.key]?.extend ?? 0) > 0) continue; // kashidas are intentional
      const len = bridgeLen(lb, j.key);
      if (len < upem * 0.12 * k) continue;
      let best: { edits: Edits; len: number } | null = null;
      for (const key of [j.a, j.b]) {
        const cl = Number(key.slice(1).split('.')[0]);
        const nat = naturalGid(font, { ...block, edits }, cl);
        if (nat === undefined) continue;
        for (const v of letterVariants(font, { ...block, edits }, cl, nat)) {
          if (v.kind !== 'form' && v.kind !== 'default') continue;
          const trial: Edits = structuredClone(edits);
          setE(trial, key, { ...trial[key], swap: v.kind === 'form' ? `${font.info.id}:${v.gid}` : undefined });
          for (const f of fitNeighbours(font, { ...block, edits }, cl, v.gid)) setE(trial, f.key, { ...trial[f.key], swap: f.gid === null ? undefined : `${font.info.id}:${f.gid}` });
          const l2 = layoutBlock({ ...block, edits: trial }, font);
          const total = l2.joins.reduce((a, x) => a + bridgeLen(l2, x.key), 0);
          if (!best || total < best.len) best = { edits: trial, len: total };
        }
      }
      const current = lb.joins.reduce((a, x) => a + bridgeLen(lb, x.key), 0);
      if (best && best.len < current * 0.7) {
        Object.keys(edits).forEach((x) => delete edits[x]);
        Object.assign(edits, best.edits);
        lb = layoutBlock({ ...block, edits }, font);
        report.forms++;
      }
    }
  }

  // 4. Spacing: words/groups that collide or lost their gap get pushed apart (reading order).
  lb = layoutBlock({ ...block, edits }, font);
  const natural = layoutBlock({ ...block, edits: {} }, font);
  const order = [...groupsOf(lb).keys()];
  for (const line of lb.lines) {
    const lineGroups = order.filter((gk) => {
      const first = groupsOf(lb).get(gk)![0];
      return lb.glyphs.find((g) => g.key === first)?.line === line.index;
    });
    let push = 0; // artboard px already added to groups further along
    for (let i = 0; i + 1 < lineGroups.length; i++) {
      const a = lineGroups[i];
      const b = lineGroups[i + 1];
      const ka = new Set(groupsOf(lb).get(a));
      const kb = new Set(groupsOf(lb).get(b));
      const boxA = inkBox(lb, ka);
      const boxB = inkBox(lb, kb);
      const nA = inkBox(natural, ka);
      const nB = inkBox(natural, kb);
      if (![boxA, boxB, nA, nB].every(bboxValid)) continue;
      // only pairs that sit side by side vertically can collide
      const vOverlap = Math.min(boxA.y1, boxB.y1) - Math.max(boxA.y0, boxB.y0);
      if (vOverlap <= 0) continue;
      // earlier pushes moved A and B together, so the measured gap is still current
      const gapNow = boxA.x0 - boxB.x1;
      const gapNat = nA.x0 - nB.x1;
      // never tighter than the font's own spacing (allowing a little give)
      const want = gapNat - block.size * 0.02;
      if (gapNow < want && inScope(b)) {
        const add = (want - gapNow) * s;
        push += add;
        report.spaced++;
      }
      if (push) {
        // move this group and every later group on the line left
        const ge = edits[b] ?? {};
        setE(edits, b, { ...ge, tx: (ge.tx ?? 0) - push / k });
      }
    }
  }

  // 5. Dots dragged far from their letter come back towards it.
  const maxDot = upem * 0.45;
  for (const key of Object.keys(edits)) {
    if (!/\.d\d+$/.test(key)) continue;
    const e = edits[key];
    const d = Math.hypot(e.tx ?? 0, e.ty ?? 0);
    if (d > maxDot) {
      const f = 1 - (1 - maxDot / d) * s;
      setE(edits, key, { ...e, tx: (e.tx ?? 0) * f, ty: (e.ty ?? 0) * f });
      report.dots++;
    }
  }

  // round for tidy files
  for (const [key, e] of Object.entries(edits)) {
    const r: Edit = { ...e };
    for (const p of ['tx', 'ty'] as const) if (r[p] !== undefined) r[p] = Math.round(r[p]! * 10) / 10;
    if (r.rot !== undefined) r.rot = Math.round(r.rot * 100) / 100;
    for (const p of ['sx', 'sy'] as const) if (r[p] !== undefined) r[p] = Math.round(r[p]! * 1000) / 1000;
    setE(edits, key, r);
  }
  return { block: { ...block, edits }, report };
}

export function describeReport(r: TidyReport): string {
  const parts: string[] = [];
  if (r.pen) parts.push(`evened ${r.pen} letter size${r.pen > 1 ? 's' : ''}`);
  if (r.smoothed) parts.push(`smoothed ${r.smoothed} letter${r.smoothed > 1 ? 's' : ''}`);
  if (r.kashidas) parts.push(`${r.kashidas} gap${r.kashidas > 1 ? 's' : ''} → kashida`);
  if (r.forms) parts.push(`${r.forms} better form${r.forms > 1 ? 's' : ''}`);
  if (r.spaced) parts.push(`spaced ${r.spaced} word${r.spaced > 1 ? 's' : ''}`);
  if (r.dots) parts.push(`${r.dots} dot${r.dots > 1 ? 's' : ''} re-seated`);
  return parts.length ? parts.join(' · ') : 'Already tidy — nothing to change';
}
