// HarfBuzz shaping of a block's text into logical-order glyph runs.
import * as hb from 'harfbuzzjs';
import type { LoadedFont } from './fonts';
import { hasArabic, joinType } from './arabic';

export interface ShapedGlyph {
  gid: number;
  /** UTF-16 index into the block text of the cluster start */
  cluster: number;
  /** index of this glyph among glyphs of the same cluster (logical order) */
  k: number;
  /** pen x of the glyph origin, measured from the visual left of the line (font units) */
  x: number;
  y: number;
  advance: number;
  isMark: boolean;
  line: number;
}

export interface ShapedLine {
  index: number;
  start: number;
  end: number;
  width: number;
  /** logical order (reading order) */
  glyphs: ShapedGlyph[];
}

export interface FeatureRange {
  tag: string;
  value: number;
  start: number;
  end: number;
}

export function parseFeature(s: string, start = 0, end = Feature_END): FeatureRange {
  const [tag, v] = s.split('=');
  return { tag, value: v === undefined ? 1 : Number(v), start, end };
}

const Feature_END = 4294967295;

export function shapeText(font: LoadedFont, text: string, features: FeatureRange[] = []): ShapedLine[] {
  const lines: ShapedLine[] = [];
  let start = 0;
  let lineIndex = 0;
  const hbFeatures = features.map((f) => new hb.Feature(f.tag, f.value, f.start, f.end));
  while (start <= text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const buf = new hb.Buffer();
    buf.addText(text, start, end - start);
    if (hasArabic(text.slice(start, end)) || start === end) {
      buf.setDirection(hb.Direction.RTL);
      buf.setScript('Arab');
      buf.setLanguage('ar');
    } else {
      buf.guessSegmentProperties();
    }
    buf.setClusterLevel(hb.ClusterLevel.MONOTONE_CHARACTERS);
    hb.shape(font.font, buf, hbFeatures);
    const infos = buf.getGlyphInfosAndPositions();
    let x = 0;
    const visual: ShapedGlyph[] = [];
    for (const g of infos) {
      const cp = text.charCodeAt(g.cluster);
      const cls = font.face.getGlyphClass(g.codepoint);
      // GDEF mark class, or a zero-width glyph from a combining character. Some fonts
      // (e.g. Noto Nastaliq) emit their dots as separate mark glyphs on the base's cluster.
      const isMark = cls === 3 || ((g.xAdvance ?? 0) === 0 && joinType(cp) === 'T');
      visual.push({
        gid: g.codepoint,
        cluster: g.cluster,
        k: 0,
        x: x + (g.xOffset ?? 0),
        y: g.yOffset ?? 0,
        advance: g.xAdvance ?? 0,
        isMark,
        line: lineIndex,
      });
      x += g.xAdvance ?? 0;
    }
    const rtl = hasArabic(text.slice(start, end)) || start === end;
    const logical = rtl ? visual.reverse() : visual;
    const seen = new Map<number, number>();
    for (const g of logical) {
      const k = seen.get(g.cluster) ?? 0;
      g.k = k;
      seen.set(g.cluster, k + 1);
    }
    lines.push({ index: lineIndex, start, end, width: x, glyphs: logical });
    lineIndex++;
    start = end + 1;
    if (end === text.length) break;
  }
  return lines;
}
