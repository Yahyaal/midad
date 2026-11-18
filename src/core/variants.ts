// Letter variants that match the current style.
//
// Calligraphic fonts such as Amiri, Aref Ruqaa and Noto Nastaliq draw most
// letters in several shapes, each picked automatically for particular
// neighbours. We harvest those designer-drawn forms by shaping the letter in
// many contexts (same joining position), add the font's stylistic sets, drop
// near-duplicates, and offer them as swaps.
import { joinType, segment } from './arabic';
import type { LoadedFont } from './fonts';
import { type BBox, EMPTY_BBOX, bboxValid, contoursToD, pointInPolygon, unionBBox } from './geometry';
import type { Block } from './model';
import { parseFeature, shapeText } from './shaping';
import { stylisticFeatures } from './alternates';
import { type Anchors, anchorsInContext } from './anchors';

export type JoinPos = 'isol' | 'init' | 'medi' | 'fina';

export interface LetterVariant {
  /** unique id for the UI */
  id: string;
  kind: 'default' | 'form' | 'long';
  label: string;
  gid: number;
  /** elongation preset (font units) for kind 'long' */
  stretch?: number;
  d: string;
  bbox: BBox;
}

const DUAL = [...'بتجحسصطعفقكلمنهي'];
const RIGHT = [...'ادرو'];
const TATWEEL = 'ـ';

/** Joining position of the character at index i in its text. */
export function joinPosition(text: string, i: number): JoinPos {
  const seg = segment(text);
  let p = i - 1;
  while (p >= 0 && joinType(text.charCodeAt(p)) === 'T') p--;
  const prev = p >= 0 && seg.joinsNext[p] && seg.groupOf[p] === seg.groupOf[i];
  const next = seg.joinsNext[i];
  return prev && next ? 'medi' : prev ? 'fina' : next ? 'init' : 'isol';
}

const harvestCache = new Map<string, number[]>();
const sampleContext = new Map<string, { text: string; at: number; features: string }>();

/** All glyphs the font uses for `ch` in joining position `pos`, most common first. */
export function harvestForms(font: LoadedFont, ch: string, pos: JoinPos): number[] {
  const key = `${font.info.id}|${ch}|${pos}`;
  const hit = harvestCache.get(key);
  if (hit) return hit;
  const contexts: [string, string][] = [];
  const nexts = [...DUAL, ...RIGHT, TATWEEL];
  if (pos === 'isol') contexts.push(['', ''], ['ا', ''], ['د', ''], ['', ' ']);
  if (pos === 'fina') for (const p of [...DUAL, TATWEEL]) contexts.push([p, '']);
  if (pos === 'init') for (const n of nexts) contexts.push(['', n]);
  if (pos === 'medi') for (const p of [...DUAL, TATWEEL]) for (const n of nexts) contexts.push([p, n]);
  const feats = ['', ...stylisticFeatures(font)];
  const count = new Map<number, number>();
  for (const f of feats) {
    for (const [p, n] of contexts) {
      const text = p + ch + n;
      const features = f ? [parseFeature(f, p.length, p.length + 1)] : [];
      const glyphs = shapeText(font, text, features)[0].glyphs.filter((g) => !g.isMark);
      const mine = glyphs.filter((g) => g.cluster === p.length);
      // skip ligatures and contexts where the letter merged with a neighbour
      if (mine.length !== 1 || new Set(glyphs.map((g) => g.cluster)).size !== text.length) continue;
      if (font.outline(mine[0].gid).empty) continue;
      const sk = `${font.info.id}|${pos}|${mine[0].gid}`;
      if (!sampleContext.has(sk)) sampleContext.set(sk, { text, at: p.length, features: f });
      count.set(mine[0].gid, (count.get(mine[0].gid) ?? 0) + 1);
    }
  }
  const out = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  harvestCache.set(key, out);
  return out;
}

/** Coarse bitmap of a glyph on a shared frame, for spotting near-duplicates. */
function signature(font: LoadedFont, gid: number, frame: BBox, n = 28): Uint8Array {
  const o = font.outline(gid);
  const bits = new Uint8Array(n * n);
  const polys = o.polys;
  const w = frame.x1 - frame.x0 || 1;
  const h = frame.y1 - frame.y0 || 1;
  for (let yi = 0; yi < n; yi++)
    for (let xi = 0; xi < n; xi++) {
      const p: [number, number] = [frame.x0 + ((xi + 0.5) / n) * w, frame.y0 + ((yi + 0.5) / n) * h];
      let c = 0;
      for (const poly of polys) if (pointInPolygon(p, poly)) c++;
      bits[yi * n + xi] = c % 2;
    }
  return bits;
}

function difference(a: Uint8Array, b: Uint8Array): number {
  let x = 0;
  let u = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) u++;
    if (a[i] !== b[i]) x++;
  }
  return u ? x / u : 0;
}

/** Widths in font units for the "long" presets, for letters whose final/isolated forms stretch well. */
const STRETCHY = new Set([...'بتثنيىسشصضقفكلئ']);

export function letterVariants(font: LoadedFont, block: Block, cluster: number, currentGid: number, opts: { max?: number } = {}): LetterVariant[] {
  const max = opts.max ?? 10;
  const ch = block.text[cluster];
  if (!ch || joinType(ch.charCodeAt(0)) === 'T' || /\s/.test(ch)) return [];
  const pos = joinPosition(block.text, cluster);
  const forms = harvestForms(font, ch, pos).filter((g) => g !== currentGid);
  const all = [currentGid, ...forms];
  // shared frame so the dedupe compares shape *and* placement (entry/exit height)
  let frame: BBox = { ...EMPTY_BBOX };
  for (const g of all) {
    const b = font.outline(g).bbox;
    if (bboxValid(b)) frame = unionBBox(frame, b);
  }
  const sigs = new Map(all.map((g) => [g, signature(font, g, frame)]));
  // greedy: keep a form only if it differs enough from everything kept so far
  const kept: number[] = [currentGid];
  for (const g of forms) {
    if (kept.length > max) break;
    if (kept.every((k) => difference(sigs.get(k)!, sigs.get(g)!) > 0.14)) kept.push(g);
  }
  const make = (gid: number, kind: LetterVariant['kind'], label: string, stretch?: number): LetterVariant => {
    const o = font.outline(gid);
    const cut = (o.bbox.x0 + o.bbox.x1) / 2;
    const f = stretch ? (x: number, y: number): [number, number] => (x < cut ? [x - stretch, y] : [x, y]) : undefined;
    const bbox = stretch ? { ...o.bbox, x0: o.bbox.x0 - stretch } : o.bbox;
    return { id: `${kind}:${gid}:${stretch ?? 0}`, kind, label, gid, stretch, d: contoursToD(o.contours, f), bbox };
  };
  const out = kept.map((g, i) => make(g, i === 0 ? 'default' : 'form', i === 0 ? 'Current' : `Form ${i + 1}`));
  if ((pos === 'fina' || pos === 'isol') && STRETCHY.has(ch)) {
    const w = font.outline(currentGid).bbox;
    if (w.x1 - w.x0 > font.upem * 0.3) {
      out.push(make(currentGid, 'long', 'Long', Math.round(font.upem * 0.35)));
      out.push(make(currentGid, 'long', 'Longer', Math.round(font.upem * 0.75)));
    }
  }
  return out;
}

/** Entry/exit anchors of a harvested form, measured in the context the font designed it for. */
export function formAnchors(font: LoadedFont, ch: string, pos: JoinPos, gid: number): Anchors | null {
  harvestForms(font, ch, pos);
  const ctx = sampleContext.get(`${font.info.id}|${pos}|${gid}`);
  if (!ctx) return null;
  const features = ctx.features ? [parseFeature(ctx.features, ctx.at, ctx.at + 1)] : [];
  const glyphs = shapeText(font, ctx.text, features)[0].glyphs.filter((g) => !g.isMark);
  const i = glyphs.findIndex((g) => g.cluster === ctx.at);
  if (i < 0) return null;
  const prev = pos === 'fina' || pos === 'medi' ? glyphs[i - 1] : undefined;
  const next = pos === 'init' || pos === 'medi' ? glyphs[i + 1] : undefined;
  return anchorsInContext(font, glyphs[i], prev, next);
}

/** The glyph the font itself chose for this letter (ignoring the user's swap). */
export function naturalGid(font: LoadedFont, block: Block, cluster: number): number | undefined {
  const features = block.features.map((f) => parseFeature(f));
  for (const [key, e] of Object.entries(block.edits)) {
    if (!e.alt || !key.startsWith('c')) continue;
    const cl = Number(key.slice(1).split('.')[0]);
    for (const f of e.alt.split(',')) features.push(parseFeature(f, cl, cl + 1));
  }
  for (const line of shapeText(font, block.text, features)) {
    const g = line.glyphs.find((x) => x.cluster === cluster && !x.isMark);
    if (g) return g.gid;
  }
  return undefined;
}
