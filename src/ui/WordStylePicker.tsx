// Whole-word styles for a connected group: thumbnails of complete renderings,
// hover to preview, click to apply (one undo step).
import { useEffect, useState } from 'react';
import { segment } from '../core/arabic';
import { getLoadedFont } from '../core/fonts';
import { type BBox, bboxValid, EMPTY_BBOX, matToSvg, unionBBox } from '../core/geometry';
import type { ElemRef, Project } from '../core/model';
import { mapBlock, type Store } from '../core/store';
import { applyWordStyle, groupSpan, type WordStyle, wordStyles } from '../core/wordstyles';
import type { Preview } from './VariantPicker';

const cache = new Map<string, WordStyle[]>();

export interface GroupTarget {
  block: string;
  start: number;
  span: [number, number];
  cacheKey: string;
}

/** The connected group a selection refers to (group refs, or a word made of one group). */
export function groupTarget(project: Project, ref: ElemRef | null): GroupTarget | null {
  if (!ref || (ref.kind !== 'group' && ref.kind !== 'word')) return null;
  const block = project.blocks.find((b) => b.id === ref.block);
  if (!block) return null;
  const seg = segment(block.text);
  const start = Number(ref.key.slice(1));
  let gStart = start;
  if (ref.kind === 'word') {
    const groups = new Set<number>();
    for (let i = 0; i < block.text.length; i++) if (seg.wordOf[i] === start && seg.groupOf[i] >= 0) groups.add(seg.groupOf[i]);
    // a word with several groups (سامي = سا + مي) is styled group by group in Connected mode
    const letters = [...groups].filter((g) => [...block.text].some((_, i) => seg.groupOf[i] === g && /[ؠ-يٮ-ۓ]/.test(block.text[i])));
    if (letters.length !== 1) return null;
    gStart = letters[0];
  }
  const span = groupSpan(block.text, seg.groupOf, gStart);
  return { block: block.id, start: gStart, span, cacheKey: `${block.font}|${block.features.join()}|${block.text.slice(span[0], span[1])}` };
}

export function useWordStyles(project: Project, target: GroupTarget | null) {
  const [styles, setStyles] = useState<WordStyle[] | null>(null);
  const key = target?.cacheKey ?? '';
  useEffect(() => {
    if (!target) {
      setStyles(null);
      return;
    }
    const hit = cache.get(key);
    if (hit) {
      setStyles(hit);
      return;
    }
    setStyles(null);
    // let the selection render first; generation takes a moment on first use
    const t = window.setTimeout(() => {
      const block = project.blocks.find((b) => b.id === target.block);
      const font = block && getLoadedFont(block.font);
      if (!block || !font) return;
      const seg = segment(block.text);
      const out = wordStyles(font, block, target.start, seg.groupOf);
      cache.set(key, out);
      setStyles(out);
    }, 40);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, target?.block, target?.start]);
  return styles;
}

/** Which style the group currently matches (by its form-related edits). */
function activeStyle(project: Project, target: GroupTarget, styles: WordStyle[]): string {
  const block = project.blocks.find((b) => b.id === target.block)!;
  for (const st of styles) {
    const applied = applyWordStyle(block.edits, target.span, st);
    if (JSON.stringify(sortKeys(applied)) === JSON.stringify(sortKeys(block.edits))) return st.id;
  }
  return '';
}

function sortKeys(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

export function styleProject(p: Project, target: GroupTarget, st: WordStyle): Project {
  return mapBlock(p, target.block, (b) => ({ ...b, edits: applyWordStyle(b.edits, target.span, st) }));
}

function Thumb({ st }: { st: WordStyle }) {
  let box: BBox = { ...EMPTY_BBOX };
  const paths: { d: string; t: string }[] = [];
  for (const g of st.preview.glyphs)
    for (const p of g.pieces) {
      if (bboxValid(p.bbox)) box = unionBBox(box, p.bbox);
      paths.push({ d: p.d, t: matToSvg(p.world) });
    }
  for (const j of st.preview.joins) if (j.d) paths.push({ d: j.d, t: '' });
  const pad = 6;
  return (
    <svg viewBox={`${box.x0 - pad} ${box.y0 - pad} ${box.x1 - box.x0 + pad * 2} ${box.y1 - box.y0 + pad * 2}`} aria-hidden="true">
      {paths.map((p, i) => (
        <path key={i} d={p.d} transform={p.t || undefined} />
      ))}
    </svg>
  );
}

export function WordStylePicker({
  store,
  project,
  target,
  styles,
  onPreview,
  layout,
}: {
  store: Store;
  project: Project;
  target: GroupTarget;
  styles: WordStyle[] | null;
  onPreview: (p: Preview | null) => void;
  layout: 'strip' | 'grid';
}) {
  if (!styles) return <div className={`word-styles ${layout} loading-styles`}>Finding word styles…</div>;
  if (styles.length < 2) return layout === 'grid' ? <p className="muted small">No other styles for this word in this font.</p> : null;
  const active = activeStyle(project, target, styles);
  return (
    <div className={`word-styles variant-picker ${layout}`} role="listbox" aria-label="Word styles" onPointerLeave={() => onPreview(null)}>
      {styles.map((st) => (
        <button
          key={st.id}
          type="button"
          role="option"
          aria-selected={st.id === active}
          className={`variant word${st.id === active ? ' on' : ''}`}
          title={st.id === 'font' ? "The font's own rendering" : `${st.label} version of this word`}
          onPointerEnter={(ev) => ev.pointerType === 'mouse' && onPreview({ ref: { block: target.block, kind: 'block', key: '' }, edit: {}, replace: (p) => styleProject(p, target, st) })}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={() => {
            onPreview(null);
            store.update((p) => styleProject(p, target, st));
          }}
        >
          <Thumb st={st} />
          <small>{st.label}</small>
        </button>
      ))}
    </div>
  );
}
