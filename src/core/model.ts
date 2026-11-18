// Document model: a project is an artboard holding text blocks; each block
// keeps sparse edits keyed by element (word / group / glyph / dot / join).

export interface Edit {
  /** translation in the element's parent space */
  tx?: number;
  ty?: number;
  sx?: number;
  sy?: number;
  /** degrees, counter-clockwise in the parent space */
  rot?: number;
  /** glyph: outline elongation in font units (pulls the left part of the letter further left) */
  stretch?: number;
  /** glyph: where to cut the outline for elongation, 0..1 across the glyph width (0 = left) */
  cut?: number;
  /** join: extra kashida length in font units */
  extend?: number;
  /** join: curvature of the joining stroke, -1..1 */
  bend?: number;
  /** join: thickness multiplier of the joining stroke */
  weight?: number;
  /** glyph: per control-point offsets, keyed by "contour.cmd.pt" */
  points?: Record<string, [number, number]>;
  /** glyph: alternate form chosen (feature tag, e.g. "ss01" or "salt=2") */
  alt?: string;
}

export interface Block {
  id: string;
  text: string;
  font: string;
  /** px per em */
  size: number;
  /** anchor: right end of the first line's baseline, artboard px */
  x: number;
  y: number;
  /** line gap as a fraction of the font size */
  lineHeight: number;
  align: 'right' | 'center' | 'left';
  /** OpenType features enabled for the whole block, e.g. ["ss01"] */
  features: string[];
  /** Whole-block transform (pivot = block centre). */
  transform: Edit;
  edits: Record<string, Edit>;
  /** Optional per-block ink override */
  ink?: string;
  hidden?: boolean;
  locked?: boolean;
}

export type InkStyle = 'flat' | 'wet' | 'gold' | 'sumi';

export interface Ink {
  color: string;
  style: InkStyle;
  /** 0..1 how much overlapping strokes darken each other */
  layering: number;
  /** 0..1 strength of edge bleed / texture */
  texture: number;
}

export interface Paper {
  color: string;
  texture: number;
  /** draw a faint baseline guide on the paper (export too) */
  ruled: boolean;
}

export interface Project {
  schema: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  blocks: Block[];
  ink: Ink;
  paper: Paper;
  createdAt: number;
  updatedAt: number;
}

export type ElemKind = 'block' | 'word' | 'group' | 'glyph' | 'dot' | 'join';

export interface ElemRef {
  block: string;
  kind: ElemKind;
  /** key into block.edits ('' for block) */
  key: string;
}

export const refId = (r: ElemRef) => `${r.block}/${r.key || 'block'}`;

// Keys --------------------------------------------------------------------

export const wordKey = (charStart: number) => `w${charStart}`;
export const groupKey = (charStart: number) => `g${charStart}`;
export const glyphKey = (cluster: number, k: number) => `c${cluster}.${k}`;
export const dotKey = (glyph: string, j: number) => `${glyph}.d${j}`;
export const joinKey = (glyph: string) => `j${glyph.slice(1)}`;

/** First char index referenced by a key. */
export function keyCharIndex(key: string): number {
  const m = /^[wgcj](\d+)/.exec(key);
  return m ? Number(m[1]) : -1;
}

function replaceKeyIndex(key: string, idx: number): string {
  return key.replace(/^([wgcj])(\d+)/, `$1${idx}`);
}

/**
 * Keep edits attached to the same characters after the text changes.
 * Uses common prefix/suffix; edits in the changed span are dropped.
 */
export function remapEdits(oldText: string, newText: string, edits: Record<string, Edit>): Record<string, Edit> {
  if (oldText === newText) return edits;
  let p = 0;
  while (p < oldText.length && p < newText.length && oldText[p] === newText[p]) p++;
  let s = 0;
  while (
    s < oldText.length - p &&
    s < newText.length - p &&
    oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]
  )
    s++;
  const delta = newText.length - oldText.length;
  const out: Record<string, Edit> = {};
  for (const [key, e] of Object.entries(edits)) {
    const i = keyCharIndex(key);
    if (i < 0) continue;
    // Edits touching the start of the changed span are kept (prefix) only if strictly before it.
    if (i < p) out[key] = e;
    else if (i >= oldText.length - s) out[replaceKeyIndex(key, i + delta)] = e;
  }
  return out;
}

// Factories -----------------------------------------------------------------

export function uid(prefix = 'b'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export function newBlock(partial: Partial<Block> = {}): Block {
  return {
    id: uid('b'),
    text: 'يحيى، سامي، رامي',
    font: 'amiri',
    size: 180,
    x: 1400,
    y: 520,
    lineHeight: 1.6,
    align: 'center',
    features: [],
    transform: {},
    edits: {},
    ...partial,
  };
}

export const DEFAULT_INK: Ink = { color: '#4a2a14', style: 'wet', layering: 0.45, texture: 0.55 };
export const DEFAULT_PAPER: Paper = { color: '#f4efe4', texture: 0.5, ruled: false };

export function newProject(name = 'Untitled', blocks?: Block[]): Project {
  const now = Date.now();
  return {
    schema: 1,
    id: uid('p'),
    name,
    width: 1600,
    height: 900,
    blocks: blocks ?? [newBlock()],
    ink: { ...DEFAULT_INK },
    paper: { ...DEFAULT_PAPER },
    createdAt: now,
    updatedAt: now,
  };
}

export function isIdentityEdit(e: Edit | undefined): boolean {
  if (!e) return true;
  return (
    !e.tx &&
    !e.ty &&
    (e.sx ?? 1) === 1 &&
    (e.sy ?? 1) === 1 &&
    !e.rot &&
    !e.stretch &&
    !e.extend &&
    !e.bend &&
    (e.weight ?? 1) === 1 &&
    !e.alt &&
    !(e.points && Object.keys(e.points).length)
  );
}

/** Drop identity values so saved files stay small. */
export function cleanEdit(e: Edit): Edit | undefined {
  const out: Edit = {};
  if (e.tx) out.tx = e.tx;
  if (e.ty) out.ty = e.ty;
  if (e.sx !== undefined && e.sx !== 1) out.sx = e.sx;
  if (e.sy !== undefined && e.sy !== 1) out.sy = e.sy;
  if (e.rot) out.rot = e.rot;
  if (e.stretch) {
    out.stretch = e.stretch;
    if (e.cut !== undefined) out.cut = e.cut;
  }
  if (e.extend) out.extend = e.extend;
  if (e.bend) out.bend = e.bend;
  if (e.weight !== undefined && e.weight !== 1) out.weight = e.weight;
  if (e.points && Object.keys(e.points).length) out.points = e.points;
  if (e.alt) out.alt = e.alt;
  return Object.keys(out).length ? out : undefined;
}

export function validateProject(x: unknown): Project {
  const p = x as Project;
  if (!p || typeof p !== 'object' || p.schema !== 1 || !Array.isArray(p.blocks)) throw new Error('Not a Midad project file');
  for (const b of p.blocks) {
    if (typeof b.text !== 'string' || typeof b.font !== 'string') throw new Error('Corrupt block in project');
    b.edits ??= {};
    b.transform ??= {};
    b.features ??= [];
    b.align ??= 'center';
    b.lineHeight ??= 1.6;
  }
  p.ink = { ...DEFAULT_INK, ...p.ink };
  p.paper = { ...DEFAULT_PAPER, ...p.paper };
  return p;
}
