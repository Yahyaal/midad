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
/** contexts that trigger special ligatures (the Allah ligature brings its own shadda) */
const SPECIAL = /لل|له/;
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
      if (SPECIAL.test(text)) continue;
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

// ---------------------------------------------------------------------------
// Neighbour fitting: when a letter takes a new shape, ask the font which shapes
// it pairs with that shape on either side, and use them.

const pairCache = new Map<string, Map<number, Map<number, number>>>();

/**
 * For the letter pair (first, second) in their joining positions, which glyph
 * of `first` does the font use next to each glyph of `second`, and vice versa.
 * Returns map: glyph of the *known* letter → (glyph of the other letter → count).
 */
function pairTable(
  font: LoadedFont,
  first: string,
  firstPos: JoinPos,
  second: string,
  secondPos: JoinPos,
  known: 'first' | 'second',
  /** the real letters around the pair, when known (the neighbour's shape depends on its other side too) */
  before?: string,
  after?: string,
) {
  const key = `${font.info.id}|${before ?? '*'}${first}${firstPos}|${second}${secondPos}${after ?? '*'}|${known}`;
  let table = pairCache.get(key);
  if (table) return table;
  table = new Map();
  const pres = firstPos === 'medi' ? (before ? [before] : [...DUAL, TATWEEL]) : [''];
  const posts = secondPos === 'medi' ? (after ? [after] : [...DUAL, ...RIGHT, TATWEEL]) : [''];
  const feats = ['', ...stylisticFeatures(font)];
  for (const f of feats)
    for (const pre of pres)
      for (const post of posts) {
        const text = pre + first + second + post;
        if (SPECIAL.test(text)) continue;
        const i1 = pre.length;
        const i2 = i1 + 1;
        const at = known === 'first' ? i1 : i2;
        const features = f ? [parseFeature(f, at, at + 1)] : [];
        const glyphs = shapeText(font, text, features)[0].glyphs.filter((g) => !g.isMark);
        if (new Set(glyphs.map((g) => g.cluster)).size !== text.length) continue;
        const g1 = glyphs.find((g) => g.cluster === i1);
        const g2 = glyphs.find((g) => g.cluster === i2);
        if (!g1 || !g2) continue;
        const [k, o] = known === 'first' ? [g1.gid, g2.gid] : [g2.gid, g1.gid];
        let row = table.get(k);
        if (!row) table.set(k, (row = new Map()));
        row.set(o, (row.get(o) ?? 0) + 1);
      }
  pairCache.set(key, table);
  return table;
}

function joinedNeighbour(text: string, cluster: number, dir: -1 | 1): number {
  const seg = segment(text);
  let j = cluster + dir;
  while (j >= 0 && j < text.length && joinType(text.charCodeAt(j)) === 'T') j += dir;
  if (j < 0 || j >= text.length) return -1;
  const [a, b] = dir < 0 ? [j, cluster] : [cluster, j];
  return seg.joinsNext[a] && seg.groupOf[a] === seg.groupOf[b] ? j : -1;
}

export interface NeighbourFit {
  key: string;
  /** the shape the font pairs with the new form, or null to return to the font's own choice */
  gid: number | null;
}

/** Shapes for the joined neighbours that the font itself pairs with `newGid` at `cluster`. */
export function fitNeighbours(font: LoadedFont, block: Block, cluster: number, newGid: number): NeighbourFit[] {
  const text = block.text;
  const out: NeighbourFit[] = [];
  const pos = joinPosition(text, cluster);
  for (const dir of [-1, 1] as const) {
    const n = joinedNeighbour(text, cluster, dir);
    if (n < 0) continue;
    const nPos = joinPosition(text, n);
    // the neighbour's own other neighbour, so the font answers for this exact spelling
    const far = joinedNeighbour(text, n, dir);
    const farCh = far >= 0 ? text[far] : undefined;
    const table =
      dir < 0
        ? pairTable(font, text[n], nPos, text[cluster], pos, 'second', farCh, undefined)
        : pairTable(font, text[cluster], pos, text[n], nPos, 'first', undefined, farCh);
    const natural = naturalGid(font, { ...block, edits: {} }, n);
    const row = table.get(newGid);
    let best: number | undefined;
    if (row && row.size) best = [...row.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // The font never pairs these shapes: pick the neighbour form that chains on without
    // colliding and without pushing the rest of the word off its line.
    else best = geometricFit(font, text[cluster], pos, newGid, text[n], nPos, dir, natural);
    if (best === undefined) continue;
    out.push({ key: `c${n}.0`, gid: best === natural ? null : best });
  }
  return out;
}

function geometricFit(font: LoadedFont, ch: string, pos: JoinPos, gid: number, nCh: string, nPos: JoinPos, dir: -1 | 1, natural?: number): number | undefined {
  const a = formAnchors(font, ch, pos, gid);
  const join = dir < 0 ? a?.entry : a?.exit;
  if (!join) return undefined;
  const forms = harvestForms(font, nCh, nPos);
  const G = font.outline(gid).polys;
  const inside = (p: [number, number], polys: [number, number][][]) => {
    let c = 0;
    for (const poly of polys) if (pointInPolygon(p, poly)) c++;
    return c % 2 === 1;
  };
  // reference: where the neighbour's far side should stay (its natural form, chained the same way)
  let best: number | undefined;
  let bestScore = Infinity;
  const far = (na: Anchors | null) => (dir < 0 ? na?.entry : na?.exit);
  const near = (na: Anchors | null) => (dir < 0 ? na?.exit : na?.entry);
  const placeOf = (na: Anchors | null): [number, number] | null => {
    const nj = near(na);
    return nj ? [join[0] - nj[0], join[1] - nj[1]] : null;
  };
  let naturalOverlap = 0;
  for (const f of forms) {
    const na = formAnchors(font, nCh, nPos, f);
    const at = placeOf(na);
    if (!at) continue;
    const N = font.outline(f).polys.map((poly) => poly.map(([x, y]) => [x + at[0], y + at[1]] as [number, number]));
    let hits = 0;
    let total = 0;
    for (const poly of N)
      for (let i = 0; i < poly.length; i += 2) {
        total++;
        if (inside(poly[i], G)) hits++;
      }
    for (const poly of G)
      for (let i = 0; i < poly.length; i += 2) {
        total++;
        if (inside(poly[i], N)) hits++;
      }
    const overlap = total ? hits / total : 0;
    // vertical drift of the neighbour's far join (moves the rest of the word up or down)
    let drift = 0;
    const fj = far(na);
    if (fj) drift = Math.abs(at[1] + fj[1]) / font.upem;
    else drift = Math.abs(at[1]) / font.upem;
    if (f === natural) naturalOverlap = overlap;
    const score = overlap * 3 + drift * 0.5 + (f === natural ? -0.02 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  // only re-form the neighbour when its current shape clearly collides with the new one
  if (naturalOverlap < 0.06) return natural;
  return best;
}
