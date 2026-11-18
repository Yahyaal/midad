// Letterform picker: shows the selected letter's alternative shapes (drawn by the
// font designer for other contexts, plus elongated forms) and swaps on click.
import { useEffect, useMemo } from 'react';
import { getLoadedFont } from '../core/fonts';
import { type BBox, EMPTY_BBOX, bboxValid, unionBBox } from '../core/geometry';
import { type Edit, type ElemRef, type Project } from '../core/model';
import { getEdit, setEdit, type Store } from '../core/store';
import { type LetterVariant, letterVariants, naturalGid } from '../core/variants';

export interface Preview {
  ref: ElemRef;
  edit: Edit;
}

export function editForVariant(base: Edit, v: LetterVariant, fontId: string): Edit {
  const e: Edit = { ...base, swap: undefined, alt: undefined };
  if (v.kind === 'form') e.swap = `${fontId}:${v.gid}`;
  if (v.kind === 'long') e.stretch = v.stretch;
  if (v.kind !== 'long' && base.stretch && isPreset(base.stretch)) e.stretch = undefined;
  return e;
}

const presetValues = new Set<number>();
const isPreset = (s: number) => presetValues.has(s);

export function useVariants(project: Project, ref: ElemRef | null) {
  const block = ref ? project.blocks.find((b) => b.id === ref.block) : undefined;
  const font = block ? getLoadedFont(block.font) : undefined;
  const cluster = ref?.kind === 'glyph' ? Number(ref.key.slice(1).split('.')[0]) : -1;
  const k = ref?.kind === 'glyph' ? Number(ref.key.split('.')[1]) : -1;
  // recompute only when the text, font or features change — not on every drag
  const sig = block ? `${block.text}|${block.font}|${block.features.join()}` : '';
  return useMemo(() => {
    if (!block || !font || cluster < 0 || k !== 0) return [];
    const gid = naturalGid(font, block, cluster);
    if (gid === undefined) return [];
    const vs = letterVariants(font, block, cluster, gid);
    for (const v of vs) if (v.stretch) presetValues.add(v.stretch);
    return vs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, font, cluster, k]);
}

export function activeVariant(vs: LetterVariant[], e: Edit, fontId: string): string {
  if (e.swap) {
    const [f, g] = e.swap.split(':');
    const v = f === fontId && vs.find((x) => x.kind === 'form' && x.gid === Number(g));
    if (v) return v.id;
  }
  if (e.stretch) {
    const v = vs.find((x) => x.kind === 'long' && x.stretch === e.stretch);
    if (v) return v.id;
  }
  return vs[0]?.id ?? '';
}

export function VariantPicker({
  store,
  project,
  r,
  variants,
  onPreview,
  layout,
}: {
  store: Store;
  project: Project;
  r: ElemRef;
  variants: LetterVariant[];
  onPreview: (p: Preview | null) => void;
  layout: 'strip' | 'grid';
}) {
  const block = project.blocks.find((b) => b.id === r.block)!;
  const e = getEdit(project, r);
  const active = activeVariant(variants, e, block.font);
  const frame = useMemo(() => {
    let f: BBox = { ...EMPTY_BBOX };
    for (const v of variants) if (bboxValid(v.bbox)) f = unionBBox(f, v.bbox);
    return f;
  }, [variants]);
  const choose = (v: LetterVariant) => {
    onPreview(null);
    store.update((p) => setEdit(p, r, editForVariant(getEdit(p, r), v, block.font)));
  };

  // [ and ] cycle through the forms (strip only, so the shortcut is registered once)
  useEffect(() => {
    if (layout !== 'strip' || variants.length < 2) return;
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (ev.key !== '[' && ev.key !== ']') return;
      ev.preventDefault();
      const i = variants.findIndex((v) => v.id === active);
      const n = (i + (ev.key === ']' ? 1 : -1) + variants.length) % variants.length;
      choose(variants[n]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (variants.length < 2) return null;
  const pad = 40;
  const vb = `${frame.x0 - pad} ${-frame.y1 - pad} ${frame.x1 - frame.x0 + pad * 2} ${frame.y1 - frame.y0 + pad * 2}`;
  return (
    <div className={`variant-picker ${layout}`} role="listbox" aria-label="Letter forms" onPointerLeave={() => onPreview(null)}>
      {variants.map((v) => (
        <button
          key={v.id}
          type="button"
          role="option"
          aria-selected={v.id === active}
          className={`variant${v.id === active ? ' on' : ''}${v.kind === 'long' ? ' long' : ''}`}
          title={v.kind === 'form' ? 'Alternative form drawn by the font designer' : v.kind === 'long' ? 'Elongated (madd)' : 'The form the font chose'}
          onPointerEnter={(ev) => ev.pointerType === 'mouse' && onPreview({ ref: r, edit: editForVariant(e, v, block.font) })}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={() => choose(v)}
        >
          <svg viewBox={vb} aria-hidden="true">
            <path d={v.d} transform="scale(1 -1)" />
          </svg>
          <small>{v.kind === 'default' ? 'Font' : v.label}</small>
        </button>
      ))}
    </div>
  );
}
