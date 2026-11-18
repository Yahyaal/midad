// Discover alternate letterforms for one cluster by trying the font's
// stylistic features on that cluster only and keeping the distinct results.
import type { LoadedFont } from './fonts';
import { type BBox, EMPTY_BBOX, bboxValid, contoursToD, unionBBox } from './geometry';
import type { Block } from './model';
import { type FeatureRange, parseFeature, shapeText } from './shaping';

export interface Alternate {
  /** feature string stored in Edit.alt ('' = default form) */
  alt: string;
  label: string;
  d: string;
  bbox: BBox;
}

const STYLISTIC = /^(ss\d\d|salt|swsh|cv\d\d|calt|dlig|hlig|titl)$/;

export function stylisticFeatures(font: LoadedFont): string[] {
  return font.gsubFeatures.filter((t) => STYLISTIC.test(t));
}

function clusterRender(font: LoadedFont, block: Block, cluster: number, extra: FeatureRange[]) {
  const features = [...block.features.map((f) => parseFeature(f)), ...extra];
  // keep other letters' chosen alternates so context stays the same
  for (const [key, e] of Object.entries(block.edits)) {
    if (!e.alt || !key.startsWith('c')) continue;
    const cl = Number(key.slice(1).split('.')[0]);
    if (cl === cluster) continue;
    for (const f of e.alt.split(',')) features.push(parseFeature(f, cl, cl + 1));
  }
  const lines = shapeText(font, block.text, features);
  const glyphs = lines.flatMap((l) => l.glyphs).filter((g) => g.cluster === cluster && !g.isMark);
  let d = '';
  let bbox: BBox = { ...EMPTY_BBOX };
  const sig = glyphs.map((g) => g.gid).join(',');
  const x0 = glyphs.length ? Math.min(...glyphs.map((g) => g.x)) : 0;
  for (const g of glyphs) {
    const o = font.outline(g.gid);
    const dx = g.x - x0;
    d += contoursToD(o.contours, (x, y) => [x + dx, y + g.y]);
    if (bboxValid(o.bbox)) bbox = unionBBox(bbox, { x0: o.bbox.x0 + dx, x1: o.bbox.x1 + dx, y0: o.bbox.y0 + g.y, y1: o.bbox.y1 + g.y });
  }
  return { sig, d, bbox };
}

export function findAlternates(font: LoadedFont, block: Block, cluster: number): Alternate[] {
  const base = clusterRender(font, block, cluster, []);
  const out: Alternate[] = [{ alt: '', label: 'Default', d: base.d, bbox: base.bbox }];
  const seen = new Set([base.sig]);
  const candidates: string[] = [];
  for (const tag of stylisticFeatures(font)) {
    candidates.push(tag);
    if (tag === 'salt' || tag === 'swsh') for (let v = 2; v <= 6; v++) candidates.push(`${tag}=${v}`);
  }
  for (const alt of candidates) {
    const r = clusterRender(font, block, cluster, [parseFeature(alt, cluster, cluster + 1)]);
    if (!r.sig || seen.has(r.sig)) continue;
    seen.add(r.sig);
    out.push({ alt, label: alt, d: r.d, bbox: r.bbox });
  }
  return out;
}
