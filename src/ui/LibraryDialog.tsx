// Phrase library: browse/search well-known phrases, preview them in the current
// script, and open, add or swap them into the composition.
import { useMemo, useState } from 'react';
import { getLoadedFont, type LoadedFont } from '../core/fonts';
import { type Block, newBlock, newProject, type Project } from '../core/model';
import { saveProject } from '../core/persistence';
import { CATEGORIES, type Phrase, type PhraseCategory, phrasePreview, searchPhrases, stripTashkil } from '../core/phrases';
import { shapeText } from '../core/shaping';
import { mapBlock, setText, type Store, useStore } from '../core/store';

/** A size and position that fit the phrase nicely on the artboard. */
export function placePhrase(project: Project, font: LoadedFont, text: string, y?: number): Partial<Block> {
  const lines = shapeText(font, text);
  const widthEm = Math.max(...lines.map((l) => l.width)) / font.upem || 1;
  const n = lines.length;
  const lineHeight = 1.7;
  const size = Math.round(Math.max(40, Math.min(260, (project.width * 0.82) / widthEm, (project.height * 0.62) / (n * lineHeight))));
  const blockH = (n - 1) * lineHeight * size;
  return { text, size, lineHeight, align: 'center', x: project.width / 2, y: y ?? Math.round(project.height / 2 - blockH / 2 + size * 0.28) };
}

export function LibraryDialog({ store, onClose, notify }: { store: Store; onClose: () => void; notify: (m: string) => void }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<PhraseCategory | undefined>(undefined);
  const [tashkil, setTashkil] = useState(true);
  const activeBlock = project.blocks.find((b) => b.id === selection[0]?.block) ?? (project.blocks.length === 1 ? project.blocks[0] : undefined);
  const font = getLoadedFont(activeBlock?.font ?? project.blocks[0]?.font ?? 'amiri') ?? getLoadedFont('amiri');
  const list = useMemo(() => searchPhrases(q, cat), [q, cat]);
  if (!font) return null;
  const textOf = (p: Phrase) => (tashkil ? p.text : stripTashkil(p.text));

  const openNew = (p: Phrase) => {
    const text = textOf(p);
    saveProject(store.get().project);
    const proj = newProject(stripTashkil(p.text).split('\n')[0]);
    proj.ink = { ...project.ink };
    proj.paper = { ...project.paper };
    proj.blocks = [newBlock({ ...placePhrase(proj, font, text), font: font.info.id })];
    store.load(proj);
    saveProject(proj);
    onClose();
    notify('Opened as a new composition. Your previous one is saved in Projects.');
  };
  const addToCanvas = (p: Phrase) => {
    const text = textOf(p);
    const below = Math.max(...project.blocks.map((b) => b.y + b.size * 0.6), project.height * 0.35);
    const y = Math.min(project.height - 60, below + 140);
    const b = newBlock({ ...placePhrase(project, font, text, y), font: font.info.id });
    b.size = Math.round(b.size! * 0.7);
    store.update((pr) => ({ ...pr, blocks: [...pr.blocks, b] }));
    store.select([{ block: b.id, kind: 'block', key: '' }]);
    onClose();
    notify('Added to the canvas — drag it into place, undo to remove.');
  };
  const replace = (p: Phrase) => {
    if (!activeBlock) return;
    const text = textOf(p);
    store.update((pr) => {
      const placed = placePhrase(pr, font, text, activeBlock.y);
      return mapBlock(setText(pr, activeBlock.id, text), activeBlock.id, (b) => ({ ...b, edits: {}, size: Math.min(b.size, placed.size!), lineHeight: placed.lineHeight! }));
    });
    onClose();
    notify('Text replaced — undo to get the previous one back.');
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog library" role="dialog" aria-label="Phrase library">
        <header>
          <h2>
            Phrase library <span className="lib-ar">مكتبة العبارات</span>
          </h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="dialog-body">
          <div className="lib-controls">
            <input className="lib-search" placeholder="Search in Arabic or English…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search phrases" autoFocus />
            <label className="check compact">
              <input type="checkbox" checked={tashkil} onChange={(e) => setTashkil(e.target.checked)} /> Tashkīl
            </label>
          </div>
          <div className="chips lib-cats">
            <button type="button" className={`chip${!cat ? ' on' : ''}`} onClick={() => setCat(undefined)}>
              All
            </button>
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={`chip${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>
                <span lang="ar">{c.arabic}</span> {c.label}
              </button>
            ))}
          </div>
          <ul className="lib-list">
            {list.map((p) => {
              const pv = phrasePreview(font, textOf(p));
              return (
                <li key={p.id} className="lib-card">
                  <svg className="lib-preview" viewBox={pv.viewBox} aria-label={stripTashkil(p.text)} role="img">
                    <path d={pv.d} />
                  </svg>
                  <div className="lib-meta">
                    <div className="lib-text" dir="rtl" lang="ar">
                      {textOf(p).replace('\n', ' ۝ ')}
                    </div>
                    <div className="lib-meaning">{p.meaning}</div>
                    {p.source && <div className="lib-source">{p.source}</div>}
                  </div>
                  <div className="lib-actions">
                    <button type="button" className="primary small" onClick={() => openNew(p)}>
                      Open as new
                    </button>
                    <button type="button" className="small" onClick={() => addToCanvas(p)}>
                      Add to canvas
                    </button>
                    {activeBlock && (
                      <button type="button" className="small" onClick={() => replace(p)} title="Replace the text of the selected (or only) text block">
                        Use for selected text
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {!list.length && <li className="muted">No phrases match “{q}”.</li>}
          </ul>
          <p className="muted small">
            Shown in {font.info.name}. Sources are classical or out of copyright. Everything you open stays fully editable, and undo works as usual.
          </p>
        </div>
      </div>
    </div>
  );
}
