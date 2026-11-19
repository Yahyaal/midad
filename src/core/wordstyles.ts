// Whole-word styles: complete alternative renderings of one connected group,
// assembled from the font's own letter forms plus madd and kashida, and scored
// for a few looks (compact, tall/stacked, flowing, elongated).
import { joinType } from './arabic';
import type { LoadedFont } from './fonts';
import { apply, type BBox, bboxOf, bboxValid, EMPTY_BBOX, pointInPolygon, type Pt, unionBBox } from './geometry';
import { layoutBlock, type LaidBlock } from './layout';
import { type Block, type Edit, newBlock } from './model';
import { letterVariants, naturalGid } from './variants';

export type WordStyleId = 'font' | 'compact' | 'tall' | 'flowing' | 'elongated';

export interface WordStyle {
  id: WordStyleId;
  label: string;
  /** form-related edits for the group's letters and joins, keyed in the *full* block */
  edits: Record<string, Edit>;
  /** preview: the group laid out on its own (block-local units of the mini block) */
  preview: LaidBlock;
}

const STRETCHY_FINALS = new Set([...'بتثنيىسشصضقفكلئ']);

/** The text span of a connected group (letters plus their marks). */
export function groupSpan(text: string, groupOf: number[], start: number): [number, number] {
  let end = start;
  while (end + 1 < text.length && (groupOf[end + 1] === start || joinType(text.charCodeAt(end + 1)) === 'T')) end++;
  return [start, end + 1];
}

function shiftKey(key: string, by: number): string {
  return key.replace(/^([cj])(\d+)/, (_, p: string, n: string) => `${p}${Number(n) + by}`);
}

interface Metrics {
  w: number;
  h: number;
  overlap: number;
  bridges: number;
}

function metrics(lb: LaidBlock): Metrics {
  let box: BBox = { ...EMPTY_BBOX };
  interface L {
    key: string;
    polys: Pt[][];
    boxes: BBox[];
    samples: Pt[];
  }
  const letters: L[] = [];
  for (const g of lb.glyphs) {
    if (g.isMark) continue;
    const body = g.pieces.find((p) => p.kind === 'body');
    if (!body || !bboxValid(body.bbox)) continue;
    box = unionBBox(box, body.bbox);
    const contours = g.outline.pieces[0]?.contours ?? [];
    const polys = contours.map((ci) => g.outline.polys[ci].map((p) => apply(body.world, p)));
    const samples: Pt[] = [];
    for (const poly of polys) for (let i = 0; i < poly.length; i += 5) samples.push(poly[i]);
    letters.push({ key: g.key, polys, boxes: polys.map((p) => bboxOf(p)), samples });
  }
  // ink collisions: sampled outline points of one letter that fall inside another letter,
  // ignoring the hand-over zone of joined neighbours
  const joinPts = lb.joins.flatMap((j) => [j.pA, j.pB]);
  const zone = (lb.block.size / lb.font.upem) * lb.font.upem * 0.12;
  let overlap = 0;
  for (const a of letters)
    for (const b of letters) {
      if (a === b) continue;
      for (const p of a.samples) {
        if (joinPts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < zone)) continue;
        let n = 0;
        b.polys.forEach((poly, i) => {
          const bb = b.boxes[i];
          if (p[0] >= bb.x0 && p[0] <= bb.x1 && p[1] >= bb.y0 && p[1] <= bb.y1 && pointInPolygon(p, poly)) n++;
        });
        if (n % 2 === 1) overlap++;
      }
    }
  const bridges = lb.joins.reduce((s, j) => s + (j.d && !(j.edit.extend ?? 0) ? Math.hypot(j.pB[0] - j.pA[0], j.pB[1] - j.pA[1]) : 0), 0);
  return { w: box.x1 - box.x0, h: box.y1 - box.y0, overlap, bridges };
}

const UNIT = 100; // mini blocks are laid out at size = upem / 10 so 1 px = 10 font units

export function wordStyles(font: LoadedFont, block: Block, groupStart: number, groupOf: number[], opts: { maxOptions?: number; beam?: number } = {}): WordStyle[] {
  const [s, e] = groupSpan(block.text, groupOf, groupStart);
  const text = block.text.slice(s, e);
  const letters: number[] = [];
  for (let i = 0; i < text.length; i++) if (joinType(text.charCodeAt(i)) !== 'T') letters.push(i);
  const mini = (edits: Record<string, Edit>) => newBlock({ id: 'mini', text, font: font.info.id, size: UNIT, x: 0, y: 0, align: 'right', features: block.features, edits });
  const layout = (edits: Record<string, Edit>) => layoutBlock(mini(edits), font);
  const base = layout({});
  const em = (UNIT / font.upem) * font.upem; // one em in mini-block px

  // candidate forms per letter (natural first)
  const maxOptions = opts.maxOptions ?? 5;
  const options: (number | null)[][] = letters.map((cl) => {
    const nat = naturalGid(font, mini({}), cl);
    if (nat === undefined) return [null];
    const forms = letterVariants(font, mini({}), cl, nat, { max: maxOptions })
      .filter((v) => v.kind === 'form')
      .map((v) => v.gid);
    return [null, ...forms];
  });

  const editsFor = (choice: (number | null)[]) => {
    const ed: Record<string, Edit> = {};
    choice.forEach((gid, i) => {
      if (gid !== null) ed[`c${letters[i]}.0`] = { swap: `${font.info.id}:${gid}` };
    });
    return ed;
  };

  const natural = metrics(base);
  const score = (m: Metrics, kind: 'compact' | 'tall' | 'flowing') => {
    // collisions beyond what the font itself has, and any synthetic joins, are heavily penalised
    const pen = Math.max(0, m.overlap - natural.overlap) * 0.25 + (m.bridges / em) * 4;
    if (kind === 'compact') return m.w / em + pen;
    if (kind === 'tall') return -m.h / em + (m.w / em) * 0.35 + pen;
    return -m.w / em + (m.h / em) * 0.4 + pen;
  };

  const memo = new Map<string, Metrics>();
  const measure = (choice: (number | null)[]) => {
    const k = choice.join();
    let m = memo.get(k);
    if (!m) {
      m = metrics(layout(editsFor(choice)));
      memo.set(k, m);
    }
    return m;
  };
  const beamSearch = (kind: 'compact' | 'tall' | 'flowing') => {
    const B = opts.beam ?? 2;
    let beam: { choice: (number | null)[]; s: number }[] = [{ choice: letters.map(() => null), s: Infinity }];
    for (let i = 0; i < letters.length; i++) {
      const next: { choice: (number | null)[]; s: number }[] = [];
      for (const st of beam)
        for (const opt of options[i]) {
          const choice = [...st.choice];
          choice[i] = opt;
          next.push({ choice, s: score(measure(choice), kind) });
        }
      next.sort((a, b) => a.s - b.s);
      const seen = new Set<string>();
      beam = next.filter((x) => {
        const k = x.choice.join();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, B);
    }
    return beam[0];
  };

  const styles: WordStyle[] = [];
  const push = (id: WordStyleId, label: string, miniEdits: Record<string, Edit>) => {
    const sig = JSON.stringify(miniEdits);
    if (styles.some((x) => JSON.stringify(Object.fromEntries(Object.entries(x.edits).map(([k, v]) => [shiftKey(k, -s), v]))) === sig)) return;
    const full: Record<string, Edit> = {};
    for (const [k, v] of Object.entries(miniEdits)) full[shiftKey(k, s)] = v;
    styles.push({ id, label, edits: full, preview: layout(miniEdits) });
  };
  push('font', 'Font', {});
  if (letters.length >= 2) {
    const fontScore = (kind: 'compact' | 'tall' | 'flowing') => score(metrics(base), kind);
    for (const [kind, label] of [
      ['compact', 'Compact'],
      ['tall', 'Stacked'],
      ['flowing', 'Flowing'],
    ] as const) {
      const best = beamSearch(kind);
      // only offer it when it is a real improvement on the font's own rendering for that look
      if (best && best.s < fontScore(kind) - 0.08) push(kind, label, editsFor(best.choice));
    }
  }
  // Elongated: madd on a stretchy final letter, otherwise kashida on the flattest join
  const last = letters[letters.length - 1];
  const elong: Record<string, Edit> = {};
  if (STRETCHY_FINALS.has(text[last]) && (letters.length > 1 || true)) elong[`c${last}.0`] = { stretch: Math.round(font.upem * 0.6) };
  else if (letters.length >= 2) {
    let bestJ: string | null = null;
    let bestY = Infinity;
    for (const j of base.joins) {
      const dy = Math.abs((j.pA[1] + j.pB[1]) / 2 - 0); // baseline at y = 0 in the mini block
      if (dy < bestY) {
        bestY = dy;
        bestJ = j.key;
      }
    }
    if (bestJ) elong[bestJ] = { extend: Math.round(font.upem * 0.45) };
  }
  if (Object.keys(elong).length) push('elongated', 'Elongated', elong);
  return styles;
}

/** Fields a word style controls; everything else (moves, rotations) is left alone. */
export const STYLE_FIELDS: (keyof Edit)[] = ['swap', 'stretch', 'cut', 'extend', 'alt'];

export function applyWordStyle(blockEdits: Record<string, Edit>, span: [number, number], style: WordStyle): Record<string, Edit> {
  const out: Record<string, Edit> = {};
  for (const [k, v] of Object.entries(blockEdits)) {
    const m = /^[cj](\d+)/.exec(k);
    const inSpan = m && Number(m[1]) >= span[0] && Number(m[1]) < span[1];
    if (!inSpan) {
      out[k] = v;
      continue;
    }
    const rest: Edit = { ...v };
    for (const f of STYLE_FIELDS) delete rest[f];
    if (Object.keys(rest).length) out[k] = rest;
  }
  for (const [k, v] of Object.entries(style.edits)) out[k] = { ...(out[k] ?? {}), ...v };
  return out;
}
