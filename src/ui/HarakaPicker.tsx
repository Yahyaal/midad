// Add, change or remove the ḥaraka on the selected letter.
import { currentHaraka, HARAKAT, withHaraka } from '../core/harakat';
import type { ElemRef, Project } from '../core/model';
import { setText, type Store } from '../core/store';
import type { Preview } from './VariantPicker';

export function HarakaPicker({ store, project, r, onPreview, layout }: { store: Store; project: Project; r: ElemRef; onPreview: (p: Preview | null) => void; layout: 'strip' | 'grid' }) {
  const block = project.blocks.find((b) => b.id === r.block);
  if (!block) return null;
  const i = Number(r.key.slice(1).split('.')[0]);
  const active = currentHaraka(block.text, i);
  const apply = (marks: string) => (p: Project) => {
    const b = p.blocks.find((x) => x.id === r.block)!;
    return setText(p, r.block, withHaraka(b.text, i, marks));
  };
  return (
    <div className={`haraka-picker variant-picker ${layout}`} role="listbox" aria-label="Ḥarakāt" onPointerLeave={() => onPreview(null)}>
      {HARAKAT.map((h) => (
        <button
          key={h.id}
          type="button"
          role="option"
          aria-selected={h.id === active}
          className={`variant haraka${h.id === active ? ' on' : ''}`}
          title={h.label}
          onPointerEnter={(ev) => ev.pointerType === 'mouse' && onPreview({ ref: r, edit: {}, replace: apply(h.marks) })}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={() => {
            onPreview(null);
            store.update(apply(h.marks));
          }}
        >
          <span className="haraka-glyph" dir="rtl" lang="ar">
            {h.marks ? `${block.text[i]}${h.marks}` : block.text[i]}
          </span>
          <small>{h.short}</small>
        </button>
      ))}
    </div>
  );
}
