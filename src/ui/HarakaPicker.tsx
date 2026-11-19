// Ḥarakāt for the selected letter: one vowel choice plus a Shadda toggle,
// limited to what Arabic orthography allows for the letter in its position.
import { chooseVowel, harakaOptions, type HarakaState, readHaraka, toggleShadda, VOWEL_LABEL, VOWEL_MARK, withHaraka } from '../core/harakat';
import type { ElemRef, Project } from '../core/model';
import { setText, type Store } from '../core/store';
import type { Preview } from './VariantPicker';

const SHADDA = 'ّ';

export function HarakaPicker({ store, project, r, onPreview, layout }: { store: Store; project: Project; r: ElemRef; onPreview: (p: Preview | null) => void; layout: 'strip' | 'grid' }) {
  const block = project.blocks.find((b) => b.id === r.block);
  if (!block) return null;
  const i = Number(r.key.slice(1).split('.')[0]);
  const ch = block.text[i];
  const cur = readHaraka(block.text, i);
  const opts = harakaOptions(block.text, i);
  const apply = (st: HarakaState) => (p: Project) => {
    const b = p.blocks.find((x) => x.id === r.block)!;
    return setText(p, r.block, withHaraka(b.text, i, st));
  };
  const preview = (st: HarakaState) => (ev: React.PointerEvent) => ev.pointerType === 'mouse' && onPreview({ ref: r, edit: {}, replace: apply(st) });
  const commit = (st: HarakaState) => () => {
    onPreview(null);
    store.update(apply(st));
  };
  const shaddaNext = toggleShadda(cur);
  return (
    <div className={`haraka-wrap ${layout}`}>
      <div className={`haraka-picker variant-picker ${layout}`} role="listbox" aria-label="Vowel" onPointerLeave={() => onPreview(null)}>
        {opts.vowels.map((v) => {
          const st = chooseVowel(cur, v, opts);
          return (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={cur.vowel === v}
              className={`variant haraka${cur.vowel === v ? ' on' : ''}`}
              title={VOWEL_LABEL[v]}
              onPointerEnter={preview(st)}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={commit(st)}
            >
              <span className="haraka-glyph" dir="rtl" lang="ar">
                {ch}
                {cur.shadda && st.shadda ? SHADDA : ''}
                {VOWEL_MARK[v]}
              </span>
              <small>{VOWEL_LABEL[v]}</small>
            </button>
          );
        })}
        {opts.shadda && (
          <button
            type="button"
            role="switch"
            aria-checked={cur.shadda}
            className={`variant haraka shadda-toggle${cur.shadda ? ' on' : ''}`}
            title={cur.shadda ? 'Remove shadda' : 'Add shadda (doubles the letter; combines with the vowel)'}
            onPointerEnter={preview(shaddaNext)}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={commit(shaddaNext)}
          >
            <span className="haraka-glyph" dir="rtl" lang="ar">
              {ch}
              {SHADDA}
            </span>
            <small>Shadda {cur.shadda ? '✓' : '+'}</small>
          </button>
        )}
      </div>
      {opts.note && opts.vowels.length < 4 && <p className="haraka-note">{opts.note}</p>}
    </div>
  );
}
