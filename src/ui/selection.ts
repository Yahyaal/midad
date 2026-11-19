// Selection helpers: resolve clicks to elements and apply transform gestures.
import {
  type BBox,
  type Mat,
  type Pt,
  apply,
  applyVec,
  bboxValid,
  det,
  EMPTY_BBOX,
  invert,
  rotate as rotMat,
  unionBBox,
} from '../core/geometry';
import type { ElemInfo, LaidBlock } from '../core/layout';
import { type Edit, type ElemRef, refId } from '../core/model';
import type { Mode } from '../core/store';

export interface HitTarget {
  block: string;
  glyph?: string;
  piece?: string;
  kind?: string;
  join?: string;
}

export function hitFromElement(el: Element | null): HitTarget | null {
  let node: Element | null = el;
  while (node && node instanceof SVGElement) {
    const d = (node as SVGElement).dataset;
    if (d.join && d.block) return { block: d.block, join: d.join };
    if (d.piece && d.block) return { block: d.block, glyph: d.glyph, piece: d.piece, kind: d.kind };
    node = node.parentElement;
  }
  return null;
}

/** Map a clicked piece to the element that should be selected in this mode. */
export function resolveRef(hit: HitTarget, mode: Mode, layouts: Map<string, LaidBlock>): ElemRef | null {
  const lb = layouts.get(hit.block);
  if (!lb) return null;
  if (hit.join) return mode === 'block' || mode === 'word' ? { block: hit.block, kind: 'block', key: '' } : { block: hit.block, kind: 'join', key: hit.join };
  if (!hit.glyph) return null;
  const own = lb.owners.get(hit.glyph);
  if (!own) return null;
  switch (mode) {
    case 'block':
      return { block: hit.block, kind: 'block', key: '' };
    case 'word':
      return own.word ? { block: hit.block, kind: 'word', key: own.word } : null;
    case 'group':
      return own.group ? { block: hit.block, kind: 'group', key: own.group } : null;
    case 'letter':
      return { block: hit.block, kind: 'glyph', key: own.letter };
    case 'mark':
      if (hit.kind === 'dot' && hit.piece) return { block: hit.block, kind: 'dot', key: hit.piece };
      if (hit.kind === 'mark') return { block: hit.block, kind: 'glyph', key: hit.glyph };
      return null;
  }
}

export function elemInfo(layouts: Map<string, LaidBlock>, ref: ElemRef): ElemInfo | undefined {
  return layouts.get(ref.block)?.elems.get(refId(ref));
}

export function selectionBBox(layouts: Map<string, LaidBlock>, sel: ElemRef[]): BBox | null {
  let b: BBox = { ...EMPTY_BBOX };
  for (const r of sel) {
    const el = elemInfo(layouts, r);
    if (el && bboxValid(el.bbox)) b = unionBBox(b, el.bbox);
  }
  return bboxValid(b) ? b : null;
}

// Transform math -------------------------------------------------------------

/** World position of the element's pivot (after its own translation). */
function pivotWorld(el: ElemInfo, e: Edit): Pt {
  return apply(el.parent, [el.pivot[0] + (e.tx ?? 0), el.pivot[1] + (e.ty ?? 0)]);
}

function placePivot(el: ElemInfo, e: Edit, world: Pt): Edit {
  const local = apply(invert(el.parent), world);
  return { ...e, tx: local[0] - el.pivot[0], ty: local[1] - el.pivot[1] };
}

export function moveEdit(el: ElemInfo, e0: Edit, dv: Pt): Edit {
  const d = applyVec(invert(el.parent), dv);
  return { ...e0, tx: (e0.tx ?? 0) + d[0], ty: (e0.ty ?? 0) + d[1] };
}

export function rotateEdit(el: ElemInfo, e0: Edit, center: Pt, radians: number): Edit {
  const p = pivotWorld(el, e0);
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const v: Pt = [p[0] - center[0], p[1] - center[1]];
  const p2: Pt = [center[0] + v[0] * c - v[1] * s, center[1] + v[0] * s + v[1] * c];
  const sign = det(el.parent) >= 0 ? 1 : -1;
  const out = placePivot(el, e0, p2);
  return { ...out, rot: normDeg((e0.rot ?? 0) + (sign * radians * 180) / Math.PI) };
}

export function scaleEdit(el: ElemInfo, e0: Edit, center: Pt, fx: number, fy: number, axis: 'both' | 'x' | 'y'): Edit {
  const p = pivotWorld(el, e0);
  const p2: Pt = [center[0] + (p[0] - center[0]) * (axis === 'y' ? 1 : fx), center[1] + (p[1] - center[1]) * (axis === 'x' ? 1 : fy)];
  const out = placePivot(el, e0, p2);
  const sx0 = e0.sx ?? 1;
  const sy0 = e0.sy ?? 1;
  if (axis === 'both') return { ...out, sx: clampScale(sx0 * fx), sy: clampScale(sy0 * fy) };
  // which local axis lines up with the screen axis being dragged?
  const m: Mat = [...el.parent] as Mat;
  const lin = applyVec(m, applyVec(rotMat(e0.rot ?? 0), [1, 0]));
  const localXIsScreenX = Math.abs(lin[0]) >= Math.abs(lin[1]);
  const f = axis === 'x' ? fx : fy;
  const scaleLocalX = (axis === 'x') === localXIsScreenX;
  return scaleLocalX ? { ...out, sx: clampScale(sx0 * f) } : { ...out, sy: clampScale(sy0 * f) };
}

function clampScale(v: number) {
  const s = Math.sign(v) || 1;
  return s * Math.min(20, Math.max(0.05, Math.abs(v)));
}

export function normDeg(d: number): number {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return Math.round(x * 100) / 100;
}

// Levels ---------------------------------------------------------------------

export interface Level {
  ref: ElemRef;
  /** "Letter", "Connected", "Word", "Text" … */
  name: string;
  /** what it covers, e.g. the word's text */
  label: string;
}

function spanText(lb: LaidBlock, kind: 'word' | 'group', key: string): string {
  const start = Number(key.slice(1));
  const arr = kind === 'word' ? lb.seg.wordOf : lb.seg.groupOf;
  let end = start;
  while (end < lb.block.text.length && arr[end] === start) end++;
  return lb.block.text.slice(start, end);
}

/** Every selectable level that contains the clicked piece, deepest first, without duplicates. */
export function levelsFor(layouts: Map<string, LaidBlock>, hit: HitTarget): Level[] {
  const lb = layouts.get(hit.block);
  if (!lb) return [];
  const out: Level[] = [];
  const b = hit.block;
  if (hit.join) {
    out.push({ ref: { block: b, kind: 'join', key: hit.join }, name: 'Join', label: '' });
    const j = lb.joins.find((x) => x.key === hit.join);
    if (j) return [...out, ...levelsFor(layouts, { block: b, glyph: j.a, piece: j.a, kind: 'body' }).slice(1)];
  }
  if (!hit.glyph) return out;
  const own = lb.owners.get(hit.glyph);
  if (!own) return out;
  const g = lb.glyphs.find((x) => x.key === hit.glyph);
  if (hit.kind === 'dot' && hit.piece) out.push({ ref: { block: b, kind: 'dot', key: hit.piece }, name: 'Dots', label: g?.char ?? '' });
  if (hit.kind === 'mark' && g) out.push({ ref: { block: b, kind: 'glyph', key: g.key }, name: 'Mark', label: `◌${g.char}` });
  const letter = lb.glyphs.find((x) => x.key === own.letter);
  out.push({ ref: { block: b, kind: 'glyph', key: own.letter }, name: 'Letter', label: letter?.char ?? '' });
  const groupText = own.group ? spanText(lb, 'group', own.group) : '';
  const wordText = own.word ? spanText(lb, 'word', own.word) : '';
  if (own.group && groupText.replace(/[^ؠ-يٮ-ۓ]/g, '').length > 1 && groupText !== wordText)
    out.push({ ref: { block: b, kind: 'group', key: own.group }, name: 'Connected', label: groupText });
  if (own.word) out.push({ ref: { block: b, kind: 'word', key: own.word }, name: 'Word', label: wordText });
  out.push({ ref: { block: b, kind: 'block', key: '' }, name: 'Text', label: lb.block.text.split('\n')[0] });
  return out;
}

/** Does the selected element contain the clicked piece? */
export function containsHit(layouts: Map<string, LaidBlock>, sel: ElemRef, hit: HitTarget): boolean {
  if (sel.block !== hit.block) return false;
  if (sel.kind === 'block') return true;
  return levelsFor(layouts, hit).some((l) => refId(l.ref) === refId(sel));
}

/** The deepest sensible element under a click (Ctrl/⌘-click): dot or mark, otherwise the letter. */
export function deepRef(layouts: Map<string, LaidBlock>, hit: HitTarget): ElemRef | null {
  return levelsFor(layouts, hit)[0]?.ref ?? null;
}
