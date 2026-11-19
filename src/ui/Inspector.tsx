import { stylisticFeatures } from '../core/alternates';
import { type Preview, useVariants, VariantPicker } from './VariantPicker';
import { groupTarget, useWordStyles, WordStylePicker } from './WordStylePicker';
import { HarakaPicker } from './HarakaPicker';
import { takesHarakat } from '../core/harakat';
import { FONTS, getLoadedFont } from '../core/fonts';
import { type Pt, applyVec, det, invert } from '../core/geometry';
import type { LaidBlock } from '../core/layout';
import { ARTBOARD_PRESETS, type Block, type Edit, type ElemRef, type InkStyle, mirrorCopy, newBlock, type Project, resizeArtboard } from '../core/model';
import { getEdit, mapBlock, reconnect, setEdit, setText, type Store, useStore } from '../core/store';
import { NumberField, Section, Segmented, Slider } from './controls';
import { elemInfo } from './selection';

const KIND_LABEL: Record<string, string> = {
  block: 'Text block',
  word: 'Word',
  group: 'Connected group',
  glyph: 'Letter',
  dot: 'Dot',
  join: 'Join stroke',
};

export function Inspector({ store, layouts, onPreview }: { store: Store; layouts: Map<string, LaidBlock>; onPreview?: (p: Preview | null) => void }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const blockId = selection[0]?.block ?? (project.blocks.length === 1 ? project.blocks[0].id : undefined);
  const block = project.blocks.find((b) => b.id === blockId);
  return (
    <div className="inspector">
      {selection.length > 0 ? <SelectionPanel store={store} layouts={layouts} project={project} selection={selection} onPreview={onPreview} /> : <EmptyHint />}
      {block && <BlockPanel store={store} block={block} layouts={layouts} />}
      <BlocksList store={store} project={project} activeId={blockId} />
      <InkPanel store={store} project={project} />
    </div>
  );
}

function EmptyHint() {
  return (
    <Section title="Selection">
      <p className="muted">
        Tap any letter on the canvas. Choose what a tap grabs with the level buttons: whole block, word, connected group, single letter, or dots &amp; marks.
      </p>
    </Section>
  );
}

function describe(ref: ElemRef, layouts: Map<string, LaidBlock>, project: Project): string {
  const b = project.blocks.find((x) => x.id === ref.block);
  if (!b) return '';
  const lb = layouts.get(ref.block);
  if (ref.kind === 'block') return b.text.replace(/\n/g, ' / ');
  if (ref.kind === 'word' || ref.kind === 'group') {
    const start = Number(ref.key.slice(1));
    let end = start;
    const seg = lb?.seg;
    if (seg) while (end < b.text.length && (ref.kind === 'word' ? seg.wordOf[end] : seg.groupOf[end]) === start) end++;
    return b.text.slice(start, end);
  }
  if (ref.kind === 'glyph' || ref.kind === 'dot') {
    const cl = Number(ref.key.slice(1).split('.')[0]);
    return b.text[cl] ?? '';
  }
  if (ref.kind === 'join') {
    const j = lb?.joins.find((x) => x.key === ref.key);
    if (!j || !lb) return '';
    const ga = lb.glyphs.find((g) => g.key === j.a);
    const gb = lb.glyphs.find((g) => g.key === j.b);
    return `${ga?.char ?? ""} ← ${gb?.char ?? ""}`;
  }
  return '';
}

function SelectionPanel({
  store,
  layouts,
  project,
  selection,
  onPreview,
}: {
  store: Store;
  layouts: Map<string, LaidBlock>;
  project: Project;
  selection: ElemRef[];
  onPreview?: (p: Preview | null) => void;
}) {
  const single = selection.length === 1 ? selection[0] : null;
  const curveEdit = useStore(store, (s) => s.curveEdit);
  const update = (fn: (e: Edit, ref: ElemRef) => Edit, record = true) => store.update((p) => selection.reduce((acc, r) => setEdit(acc, r, fn(getEdit(acc, r), r)), p), { record });
  const reset = () => update(() => ({}));
  const lbSel = single ? layouts.get(single.block) : undefined;
  const selGlyph = single?.kind === 'glyph' ? lbSel?.glyphs.find((g) => g.key === single.key) : undefined;
  const isMark = !!selGlyph?.isMark;
  const title = single ? (isMark ? 'Mark (ḥaraka)' : single.kind === 'dot' ? 'Dots (nuqaṭ)' : KIND_LABEL[single.kind]) : `${selection.length} items`;
  let label = single ? describe(single, layouts, project) : '';
  // a lone combining mark needs a dotted-circle carrier to display
  if (isMark && /^[\u064b-\u065f\u0670\u06d6-\u06ed]$/.test(label)) label = `\u25cc${label}`;

  if (single?.kind === 'join') return <JoinPanel store={store} r={single} project={project} label={label} />;

  const el = single ? elemInfo(layouts, single) : undefined;
  const e = single ? getEdit(project, single) : {};
  // translate/rotate shown in screen terms
  const shownT: Pt = el ? applyVec(el.parent, [e.tx ?? 0, e.ty ?? 0]) : [0, 0];
  const sign = el && det(el.parent) < 0 ? -1 : 1;
  const setShownT = (axis: 0 | 1, v: number) => {
    if (!el) return;
    const t: Pt = [...shownT];
    t[axis] = v;
    const local = applyVec(invert(el.parent), t);
    update((ed) => ({ ...ed, tx: local[0], ty: local[1] }));
  };
  const lb = single ? layouts.get(single.block) : undefined;
  const glyph = single?.kind === 'glyph' ? lb?.glyphs.find((g) => g.key === single.key) : undefined;

  return (
    <Section
      title={title}
      aside={
        <button type="button" className="ghost small" onClick={reset} title="Reset to the font's original shape (Delete)">
          Reset
        </button>
      }
    >
      {label && (
        <div className="sel-label" dir="rtl">
          {label}
        </div>
      )}
      {single && (single.kind === 'glyph' || single.kind === 'group') && (
        <button
          type="button"
          className="small reconnect"
          title="Put the letters of this connected group back together; keeps chosen forms, elongation and kashida"
          onClick={() => {
            const lb = layouts.get(single.block);
            if (!lb) return;
            const keys = single.kind === 'group' ? lb.glyphs.filter((g) => g.groupKey === single.key).map((g) => g.key) : [single.key];
            store.update((p) => reconnect(p, single.block, keys, (k) => lb.owners.get(k)?.group));
          }}
        >
          ⟲ Reconnect word
        </button>
      )}
      {single && (single.kind === 'group' || single.kind === 'word') && <WordStylesSection store={store} project={project} r={single} onPreview={onPreview} />}
      {single?.kind === 'group' && <p className="muted small">Moves the whole connected run together, so its joins stay intact. Switch to Letter to pull letters apart. The join then stretches to follow.</p>}
      {single?.kind === 'glyph' && !glyph?.isMark && <p className="muted small">Joins to neighbouring letters stretch to follow. Drag the round join handles to add kashida or bend the join.</p>}
      {single && el && (
        <div className="grid2">
          <NumberField label="Move X" value={shownT[0]} onCommit={(v) => setShownT(0, v)} suffix="px" />
          <NumberField label="Move Y" value={shownT[1]} onCommit={(v) => setShownT(1, v)} suffix="px" />
          <NumberField label="Scale X" value={(e.sx ?? 1) * 100} onCommit={(v) => update((ed) => ({ ...ed, sx: v / 100 }))} suffix="%" />
          <NumberField label="Scale Y" value={(e.sy ?? 1) * 100} onCommit={(v) => update((ed) => ({ ...ed, sy: v / 100 }))} suffix="%" />
          <NumberField label="Rotate" value={sign * (e.rot ?? 0)} onCommit={(v) => update((ed) => ({ ...ed, rot: sign * v }))} suffix="°" />
        </div>
      )}
      {!single && <p className="muted small">Drag on the canvas to move all, or use the handles to scale and rotate them around their shared centre.</p>}
      {glyph && !glyph.isMark && single && (
        <>
          <Slider
            store={store}
            label="Elongate (madd)"
            hint="Stretch the letter's horizontal stroke without thinning it"
            value={e.stretch ?? 0}
            min={0}
            max={1200}
            step={5}
            onChange={(v) => update((ed) => ({ ...ed, stretch: v }), false)}
          />
          {(e.stretch ?? 0) > 0 && (
            <Slider store={store} label="Cut position" value={e.cut ?? 0.5} min={0.05} max={0.95} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update((ed) => ({ ...ed, cut: v }), false)} />
          )}
          <label className="check">
            <input type="checkbox" checked={curveEdit} onChange={(ev) => store.set({ curveEdit: ev.target.checked })} /> Edit outline points
          </label>
          {e.points && Object.keys(e.points).length > 0 && (
            <button type="button" className="ghost small" onClick={() => update((ed) => ({ ...ed, points: undefined }))}>
              Reset outline points
            </button>
          )}
          <FormsSection store={store} r={single} project={project} onPreview={onPreview} />
          {(() => {
            const b = project.blocks.find((x) => x.id === single.block);
            const i = Number(single.key.slice(1).split('.')[0]);
            return b && takesHarakat(b.text, i) ? (
              <div className="alternates">
                <span className="field-label">Ḥarakāt (tashkīl)</span>
                <HarakaPicker store={store} project={project} r={single} onPreview={onPreview ?? (() => {})} layout="grid" />
              </div>
            ) : null;
          })()}
        </>
      )}
    </Section>
  );
}

function JoinPanel({ store, r, project, label }: { store: Store; r: ElemRef; project: Project; label: string }) {
  const e = getEdit(project, r);
  const set = (patch: Partial<Edit>, record = false) => store.update((p) => setEdit(p, r, { ...getEdit(p, r), ...patch }), { record });
  return (
    <Section
      title="Join stroke"
      aside={
        <button type="button" className="ghost small" onClick={() => set({ extend: 0, bend: 0, weight: 1 }, true)}>
          Reset
        </button>
      }
    >
      <div className="sel-label" dir="rtl">
        {label}
      </div>
      <p className="muted small">The connecting stroke is drawn with a broad pen between the two letters. Lengthen it for kashida; bend it for a swung connection.</p>
      <Slider store={store} label="Kashida length" value={e.extend ?? 0} min={0} max={1500} step={5} onChange={(v) => set({ extend: v })} />
      <Slider store={store} label="Bend" value={e.bend ?? 0} min={-1} max={1} step={0.01} onChange={(v) => set({ bend: v })} />
      <Slider store={store} label="Waist" hint="Thin the middle of the stroke" value={e.weight ?? 1} min={0.3} max={1.6} step={0.01} onChange={(v) => set({ weight: v })} />
    </Section>
  );
}

function WordStylesSection({ store, project, r, onPreview }: { store: Store; project: Project; r: ElemRef; onPreview?: (p: Preview | null) => void }) {
  const target = groupTarget(project, r);
  const styles = useWordStyles(project, target);
  if (!target) return <p className="muted small">This word has separate parts; switch to Connected to style each part.</p>;
  return (
    <div className="alternates">
      <span className="field-label">Word styles</span>
      <WordStylePicker store={store} project={project} target={target} styles={styles} onPreview={onPreview ?? (() => {})} layout="grid" />
    </div>
  );
}

function FormsSection({ store, r, project, onPreview }: { store: Store; r: ElemRef; project: Project; onPreview?: (p: Preview | null) => void }) {
  const variants = useVariants(project, r);
  const font = getLoadedFont(project.blocks.find((b) => b.id === r.block)?.font ?? '');
  if (variants.length < 2) return <p className="muted small">{font?.info.name ?? 'This font'} has no other forms for this letter here.</p>;
  return (
    <div className="alternates">
      <span className="field-label">
        Letter forms <em className="hint-key">[ ]</em>
      </span>
      <VariantPicker store={store} project={project} r={r} variants={variants} onPreview={onPreview ?? (() => {})} layout="grid" />
    </div>
  );
}

function BlockPanel({ store, block, layouts }: { store: Store; block: Block; layouts: Map<string, LaidBlock> }) {
  const upd = (fn: (b: Block) => Block, record = true) => store.update((p) => mapBlock(p, block.id, fn), { record });
  const font = getLoadedFont(block.font);
  const feats = font ? stylisticFeatures(font).filter((t) => /^ss\d\d|salt|swsh$/.test(t)) : [];
  const editCount = Object.keys(block.edits).length + (Object.keys(block.transform).length ? 1 : 0);
  void layouts;
  return (
    <Section title="Text" aside={editCount ? <span className="badge">{editCount} edits</span> : undefined}>
      <textarea
        className="text-input"
        dir="rtl"
        lang="ar"
        rows={2}
        value={block.text}
        onFocus={() => store.beginGesture()}
        onBlur={() => store.endGesture()}
        onChange={(e) => store.update((p) => setText(p, block.id, e.target.value), { record: false })}
        aria-label="Arabic text"
      />
      <label className="field">
        <span className="field-label">Script / font</span>
        <select value={block.font} onChange={(e) => upd((b) => ({ ...b, font: e.target.value, features: [] }))}>
          {groupFonts().map(([style, fonts]) => (
            <optgroup key={style} label={style}>
              {fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.arabicName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Slider store={store} label="Size" value={block.size} min={20} max={600} step={1} format={(v) => `${v}px`} onChange={(v) => upd((b) => ({ ...b, size: v }), false)} />
      {block.text.includes('\n') && (
        <Slider store={store} label="Line spacing" value={block.lineHeight} min={0.6} max={3} step={0.05} onChange={(v) => upd((b) => ({ ...b, lineHeight: v }), false)} />
      )}
      <div className="row">
        <Segmented
          label="Alignment"
          value={block.align}
          onChange={(v) => upd((b) => ({ ...b, align: v }))}
          options={[
            { id: 'right', label: 'Right', title: 'Anchor at the right (start of line)' },
            { id: 'center', label: 'Centre' },
            { id: 'left', label: 'Left' },
            ...(block.text.includes('\n') ? [{ id: 'justify' as const, label: 'Justify', title: 'Fill shorter lines with kashida so all lines match' }] : []),
          ]}
        />
      </div>
      <div className="field">
        <span className="field-label">Arrange</span>
        <Segmented
          label="Arrange"
          value={block.arrange?.shape ?? 'line'}
          onChange={(v) =>
            upd((b) => ({
              ...b,
              arrange: v === 'line' ? undefined : { shape: v, bend: v === 'circle' ? 0.9 : (b.arrange?.shape === 'arc' ? b.arrange.bend : 0.35) },
            }))
          }
          options={[
            { id: 'line', label: 'Line' },
            { id: 'arc', label: 'Arc', title: 'Lay the text along an arch or a curve' },
            { id: 'circle', label: 'Circle', title: 'A roundel: text around a circle' },
          ]}
        />
        {block.arrange?.shape === 'arc' && (
          <Slider
            store={store}
            label="Curve"
            hint="Positive arches up, negative curves down"
            value={Math.round(block.arrange.bend * 100)}
            min={-100}
            max={100}
            step={1}
            format={(v) => `${v > 0 ? '+' : ''}${v}%`}
            onChange={(v) => upd((b) => ({ ...b, arrange: { shape: 'arc', bend: v / 100 || 0.01 } }), false)}
          />
        )}
        {block.arrange?.shape === 'circle' && (
          <Slider
            store={store}
            label="Wrap"
            hint="How much of the circle the text covers"
            value={Math.round(Math.abs(block.arrange.bend) * 100)}
            min={30}
            max={98}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => upd((b) => ({ ...b, arrange: { shape: 'circle', bend: v / 100 } }), false)}
          />
        )}
      </div>
      {feats.length > 0 && (
        <div className="features">
          <span className="field-label">Stylistic sets (whole block)</span>
          <div className="chips">
            {feats.map((t) => {
              const on = block.features.includes(t);
              return (
                <button key={t} type="button" className={`chip${on ? ' on' : ''}`} onClick={() => upd((b) => ({ ...b, features: on ? b.features.filter((x) => x !== t) : [...b.features, t] }))}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="row gap">
        <button type="button" className="ghost small" onClick={() => upd((b) => ({ ...b, edits: {}, transform: {} }))} disabled={!editCount}>
          Reset all edits
        </button>
      </div>
    </Section>
  );
}

function groupFonts() {
  const m = new Map<string, typeof FONTS>();
  for (const f of FONTS) m.set(f.style, [...(m.get(f.style) ?? []), f]);
  return [...m.entries()];
}

function BlocksList({ store, project, activeId }: { store: Store; project: Project; activeId?: string }) {
  const addBlock = () => {
    const nb = newBlock({ text: 'سلام', x: project.width / 2, y: project.height / 2 + 120 * project.blocks.length * 0.5, size: 140, font: project.blocks[project.blocks.length - 1]?.font ?? 'amiri' });
    store.update((p) => ({ ...p, blocks: [...p.blocks, nb] }));
    store.select([{ block: nb.id, kind: 'block', key: '' }]);
  };
  const move = (id: string, dir: -1 | 1) =>
    store.update((p) => {
      const i = p.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (j < 0 || j >= p.blocks.length) return p;
      const blocks = [...p.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...p, blocks };
    });
  return (
    <Section
      title="Layers"
      aside={
        <button type="button" className="ghost small" onClick={addBlock}>
          + Text
        </button>
      }
    >
      <ul className="layers">
        {[...project.blocks].reverse().map((b) => (
          <li key={b.id} className={b.id === activeId ? 'on' : ''}>
            <button type="button" className="layer-name" dir="rtl" onClick={() => store.select([{ block: b.id, kind: 'block', key: '' }])}>
              {b.text.split('\n')[0] || '—'}
            </button>
            <span className="layer-actions">
              <button type="button" className="icon" title="Bring forward" onClick={() => move(b.id, 1)}>
                ↑
              </button>
              <button type="button" className="icon" title="Send backward" onClick={() => move(b.id, -1)}>
                ↓
              </button>
              <button
                type="button"
                className="icon"
                title={b.hidden ? 'Show' : 'Hide'}
                onClick={() => store.update((p) => mapBlock(p, b.id, (x) => ({ ...x, hidden: !x.hidden })))}
              >
                {b.hidden ? '◌' : '●'}
              </button>
              <button
                type="button"
                className="icon"
                title="Duplicate"
                onClick={() =>
                  store.update((p) => {
                    const copy = { ...structuredClone(b), id: newBlock().id, x: b.x - 30, y: b.y + 30 };
                    return { ...p, blocks: [...p.blocks, copy] };
                  })
                }
              >
                ⧉
              </button>
              <button
                type="button"
                className="icon"
                title="Mirror copy (musannā): a mirrored duplicate across the centre"
                onClick={() => {
                  const r = mirrorCopy(store.get().project, b.id);
                  if (!r) return;
                  store.update(() => r.project);
                  store.select([{ block: r.id, kind: 'block', key: '' }]);
                }}
              >
                ⇋
              </button>
              <button
                type="button"
                className="icon danger"
                title="Delete"
                disabled={project.blocks.length < 2}
                onClick={() => {
                  store.update((p) => ({ ...p, blocks: p.blocks.filter((x) => x.id !== b.id) }));
                  store.select([]);
                }}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const INK_STYLES: { id: InkStyle; label: string }[] = [
  { id: 'wet', label: 'Wet ink' },
  { id: 'flat', label: 'Flat' },
  { id: 'sumi', label: 'Sumi' },
  { id: 'gold', label: 'Gold' },
];

const INK_SWATCHES = ['#4a2c17', '#1d1a17', '#0e2a47', '#6b1d1d', '#2f4a2a', '#7a5a2b'];
const MARK_SWATCHES = ['#9b1c1c', '#b8860b', '#1d4e89', '#2f5d3a'];
const PAPER_SWATCHES = ['#f4efe4', '#efe3c8', '#fbfaf6', '#e9dcc0', '#1f2a36', '#2b1d14'];

function InkPanel({ store, project }: { store: Store; project: Project }) {
  const setInk = (patch: Partial<Project['ink']>, record = true) => store.update((p) => ({ ...p, ink: { ...p.ink, ...patch } }), { record });
  const setPaper = (patch: Partial<Project['paper']>, record = true) => store.update((p) => ({ ...p, paper: { ...p.paper, ...patch } }), { record });
  return (
    <Section title="Ink & paper">
      <Segmented label="Ink finish" value={project.ink.style} options={INK_STYLES} onChange={(v) => setInk({ style: v })} />
      {project.ink.style !== 'gold' && (
        <div className="swatches">
          {INK_SWATCHES.map((c) => (
            <button key={c} type="button" className={`swatch${project.ink.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setInk({ color: c })} aria-label={`Ink ${c}`} />
          ))}
          <input type="color" value={project.ink.color} onChange={(e) => setInk({ color: e.target.value }, false)} aria-label="Custom ink colour" />
        </div>
      )}
      {project.ink.style !== 'flat' && (
        <Slider store={store} label="Texture" value={project.ink.texture} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setInk({ texture: v }, false)} />
      )}
      {project.ink.style !== 'gold' && (
        <Slider store={store} label="Overlap darkening" hint="Where strokes cross, the ink layers darken" value={project.ink.layering} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setInk({ layering: v }, false)} />
      )}
      <span className="field-label">Paper</span>
      <div className="swatches">
        {PAPER_SWATCHES.map((c) => (
          <button key={c} type="button" className={`swatch${project.paper.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setPaper({ color: c })} aria-label={`Paper ${c}`} />
        ))}
        <input type="color" value={project.paper.color} onChange={(e) => setPaper({ color: e.target.value }, false)} aria-label="Custom paper colour" />
      </div>
      <Slider store={store} label="Paper grain" value={project.paper.texture} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setPaper({ texture: v }, false)} />
      <label className="check">
        <input type="checkbox" checked={project.paper.ruled} onChange={(e) => setPaper({ ruled: e.target.checked })} /> Draw baselines on the paper
      </label>
      <span className="field-label">Ḥarakāt colour</span>
      <div className="swatches">
        <button type="button" className={`swatch none${!project.ink.markColor ? ' on' : ''}`} onClick={() => setInk({ markColor: undefined })} aria-label="Same as the ink" title="Same as the ink">
          ∅
        </button>
        {MARK_SWATCHES.map((c) => (
          <button key={c} type="button" className={`swatch${project.ink.markColor === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setInk({ markColor: c })} aria-label={`Ḥarakāt ${c}`} />
        ))}
        <input type="color" value={project.ink.markColor ?? '#9b1c1c'} onChange={(e) => setInk({ markColor: e.target.value }, false)} aria-label="Custom ḥarakāt colour" />
      </div>
      {project.ink.markColor && (
        <label className="check">
          <input type="checkbox" checked={!!project.ink.markDots} onChange={(e) => setInk({ markDots: e.target.checked })} /> Dots too
        </label>
      )}
      <label className="field">
        <span className="field-label">Artboard</span>
        <select
          aria-label="Artboard size"
          value={ARTBOARD_PRESETS.find((x) => x.w === project.width && x.h === project.height)?.id ?? 'custom'}
          onChange={(e) => {
            const pr = ARTBOARD_PRESETS.find((x) => x.id === e.target.value);
            if (pr) {
              store.update((p) => resizeArtboard(p, pr.w, pr.h));
              window.dispatchEvent(new CustomEvent('midad:fit'));
            }
          }}
        >
          {ARTBOARD_PRESETS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label} — {x.w}×{x.h}
            </option>
          ))}
          <option value="custom" disabled>
            Custom
          </option>
        </select>
      </label>
      <div className="grid2">
        <NumberField label="Width" value={project.width} onCommit={(v) => store.update((p) => resizeArtboard(p, Math.max(100, Math.min(8000, Math.round(v))), p.height))} suffix="px" />
        <NumberField label="Height" value={project.height} onCommit={(v) => store.update((p) => resizeArtboard(p, p.width, Math.max(100, Math.min(8000, Math.round(v)))))} suffix="px" />
      </div>
    </Section>
  );
}

