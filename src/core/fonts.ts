// Font registry, HarfBuzz loading and per-glyph outline analysis.
import * as hb from 'harfbuzzjs';
import {
  type BBox,
  type Contour,
  type Pt,
  bboxOf,
  flattenContour,
  insideShape,
  polygonArea,
  splitContours,
  type Cmd,
} from './geometry';

export interface FontInfo {
  id: string;
  name: string;
  /** Script / style family shown in the UI. */
  style: string;
  arabicName: string;
  file: string;
  license: string;
  /** Suggested pen angle (degrees from baseline) for synthesised joining strokes. */
  nibAngle: number;
  notes?: string;
}

export const FONTS: FontInfo[] = [
  { id: 'amiri', name: 'Amiri', style: 'Naskh', arabicName: 'نسخ', file: 'Amiri-Regular.ttf', license: 'OFL-1.1', nibAngle: 70, notes: 'Classical Bulaq naskh; best mark positioning and contextual forms.' },
  { id: 'amiri-bold', name: 'Amiri Bold', style: 'Naskh', arabicName: 'نسخ عريض', file: 'Amiri-Bold.ttf', license: 'OFL-1.1', nibAngle: 70 },
  { id: 'aref-ruqaa', name: 'Aref Ruqaa', style: 'Ruqʿa', arabicName: 'رقعة', file: 'ArefRuqaa-Regular.ttf', license: 'OFL-1.1', nibAngle: 60 },
  { id: 'aref-ruqaa-bold', name: 'Aref Ruqaa Bold', style: 'Ruqʿa', arabicName: 'رقعة عريض', file: 'ArefRuqaa-Bold.ttf', license: 'OFL-1.1', nibAngle: 60 },
  { id: 'nastaliq', name: 'Noto Nastaliq Urdu', style: 'Nastaʿlīq', arabicName: 'نستعليق', file: 'NotoNastaliqUrdu.ttf', license: 'OFL-1.1', nibAngle: 65, notes: 'Cascading nastaʿlīq; joins are steep.' },
  { id: 'scheherazade', name: 'Scheherazade New', style: 'Naskh', arabicName: 'نسخ', file: 'ScheherazadeNew-Regular.ttf', license: 'OFL-1.1', nibAngle: 70 },
  { id: 'reem-kufi', name: 'Reem Kufi', style: 'Kufi', arabicName: 'كوفي', file: 'ReemKufi.ttf', license: 'OFL-1.1', nibAngle: 90 },
  { id: 'katibeh', name: 'Katibeh', style: 'Display', arabicName: 'زخرفي', file: 'Katibeh-Regular.ttf', license: 'OFL-1.1', nibAngle: 75 },
  { id: 'rakkas', name: 'Rakkas', style: 'Display', arabicName: 'زخرفي', file: 'Rakkas-Regular.ttf', license: 'OFL-1.1', nibAngle: 80 },
];

export const DEFAULT_FONT = 'amiri';

export function fontInfo(id: string): FontInfo {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

export type PieceKind = 'body' | 'dot';

export interface GlyphPiece {
  kind: PieceKind;
  /** indices into GlyphOutline.contours */
  contours: number[];
  bbox: BBox;
}

export interface GlyphOutline {
  gid: number;
  cmds: Cmd[];
  contours: Contour[];
  polys: Pt[][];
  pieces: GlyphPiece[];
  bbox: BBox;
  /** true when the outline has no contours (space etc.) */
  empty: boolean;
}

export interface LoadedFont {
  info: FontInfo;
  face: hb.Face;
  font: hb.Font;
  upem: number;
  ascender: number;
  descender: number;
  /** Thickness of the font's tatweel (kashida) stroke, used for synthesised joins. */
  kashidaThickness: number;
  /** Vertical centre of the tatweel stroke. */
  kashidaY: number;
  gsubFeatures: string[];
  outline(gid: number): GlyphOutline;
}

/** Separate contours smaller than this fraction of the main body's extent are treated as detachable dots. */
const DOT_EXTENT_RATIO = 0.8;

export function analyseOutline(gid: number, cmds: Cmd[], upem: number): GlyphOutline {
  const contours = splitContours(cmds);
  const polys = contours.map((c) => flattenContour(c));
  const bbox = bboxOf(polys.flat());
  if (!contours.length) return { gid, cmds, contours, polys, pieces: [], bbox, empty: true };

  const areas = polys.map((p) => Math.abs(polygonArea(p)));
  // Which contours are holes (inside an odd number of other contours)?
  const parentOf = contours.map(() => -1);
  polys.forEach((poly, i) => {
    if (!poly.length) return;
    const probe = poly[0];
    const containers: number[] = [];
    polys.forEach((other, j) => {
      if (i !== j && areas[j] > areas[i] && insideShape(probe, [other])) containers.push(j);
    });
    if (containers.length % 2 === 1) {
      // smallest container is the direct parent
      containers.sort((a, b) => areas[a] - areas[b]);
      parentOf[i] = containers[0];
    }
  });
  const outer = contours.map((_, i) => i).filter((i) => parentOf[i] < 0);
  const diag = (i: number) => {
    const b = bboxOf(polys[i]);
    return Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  };
  // The main body is the outer contour with the largest extent.
  const mainIdx = outer.reduce((best, i) => (diag(i) > diag(best) ? i : best), outer[0]);
  const dotSize = upem * 0.38;

  const body: number[] = [];
  const pieces: GlyphPiece[] = [];
  for (const i of outer) {
    const b = bboxOf(polys[i]);
    const small = i !== mainIdx && diag(i) < diag(mainIdx) * DOT_EXTENT_RATIO && b.x1 - b.x0 < dotSize && b.y1 - b.y0 < dotSize;
    const members = [i, ...contours.map((_, k) => k).filter((k) => parentOf[k] === i)];
    if (small && outer.length > 1) pieces.push({ kind: 'dot', contours: members, bbox: bboxOf(members.flatMap((k) => polys[k])) });
    else body.push(...members);
  }
  // holes whose parent is a hole etc. — attach anything unassigned to the body
  const assigned = new Set([...body, ...pieces.flatMap((p) => p.contours)]);
  contours.forEach((_, k) => {
    if (!assigned.has(k)) body.push(k);
  });
  pieces.unshift({ kind: 'body', contours: body, bbox: bboxOf(body.flatMap((k) => polys[k])) });
  return { gid, cmds, contours, polys, pieces, bbox, empty: false };
}

export function wrapFont(info: FontInfo, data: ArrayBuffer | Uint8Array): LoadedFont {
  const blob = new hb.Blob(data);
  const face = new hb.Face(blob, 0);
  const font = new hb.Font(face);
  const upem = face.upem;
  const ext = font.hExtents();
  const cache = new Map<number, GlyphOutline>();
  const outline = (gid: number) => {
    let o = cache.get(gid);
    if (!o) {
      const cmds = font.glyphToJson(gid).map((c) => ({ t: c.type as Cmd['t'], v: c.values }));
      o = analyseOutline(gid, cmds, upem);
      cache.set(gid, o);
    }
    return o;
  };
  // Measure the tatweel stroke.
  let kashidaThickness = upem * 0.07;
  let kashidaY = upem * 0.035;
  const tatweel = font.nominalGlyph(0x0640);
  if (tatweel) {
    const o = outline(tatweel);
    if (!o.empty) {
      const h = o.bbox.y1 - o.bbox.y0;
      if (h > upem * 0.02 && h < upem * 0.25) {
        kashidaThickness = h;
        kashidaY = (o.bbox.y0 + o.bbox.y1) / 2;
      }
    }
  }
  let gsubFeatures: string[] = [];
  try {
    gsubFeatures = [...new Set(face.getTableFeatureTags('GSUB'))];
  } catch {
    /* older fonts */
  }
  return {
    info,
    face,
    font,
    upem,
    ascender: ext?.ascender ?? upem * 0.8,
    descender: ext?.descender ?? -upem * 0.3,
    kashidaThickness,
    kashidaY,
    gsubFeatures,
    outline,
  };
}

const loaded = new Map<string, LoadedFont>();
const pending = new Map<string, Promise<LoadedFont>>();

export function getLoadedFont(id: string): LoadedFont | undefined {
  return loaded.get(id);
}

export function registerFont(font: LoadedFont) {
  loaded.set(font.info.id, font);
}

export function loadFont(id: string, baseUrl = import.meta.env?.BASE_URL ?? '/'): Promise<LoadedFont> {
  const existing = loaded.get(id);
  if (existing) return Promise.resolve(existing);
  let p = pending.get(id);
  if (!p) {
    const info = fontInfo(id);
    p = fetch(`${baseUrl}fonts/${info.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${info.file}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        const f = wrapFont(info, buf);
        loaded.set(id, f);
        return f;
      });
    pending.set(id, p);
  }
  return p;
}
