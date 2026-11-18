import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElemRef, Project } from './core/model';
import { uid } from './core/model';
import {
  deleteProject,
  downloadBlob,
  lastProjectId,
  listProjects,
  loadProject,
  parseProjectFile,
  type ProjectMeta,
  safeFileName,
  saveProject,
  serializeProject,
} from './core/persistence';
import { namesProject, SAMPLES } from './core/samples';
import { createStore, getEdit, MODES, setEdit, type Store, useStore } from './core/store';
import { Canvas } from './ui/Canvas';
import { Inspector } from './ui/Inspector';
import { projectToSvg, svgToPngBlob } from './ui/exporters';
import { moveEdit, elemInfo } from './ui/selection';
import { computeLayouts, useLayouts } from './ui/useLayouts';

function initialProject(): Project {
  const last = lastProjectId();
  const p = last ? loadProject(last) : null;
  return p ?? namesProject();
}

export default function App() {
  const store = useMemo(() => createStore(initialProject()), []);
  const project = useStore(store, (s) => s.project);
  const { layouts, loading, error } = useLayouts(project);
  const [toast, setToast] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'projects' | 'export' | 'help'>('none');
  const [sheetOpen, setSheetOpen] = useState(false);
  const notify = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600);
  };
  useAutosave(store, notify);
  useShortcuts(store, layouts, notify, () => setPanel('export'));

  return (
    <div className="app">
      <TopBar store={store} onPanel={setPanel} />
      <ModeBar store={store} />
      <main className="workspace">
        <div className="stage">
          {loading && <div className="loading">Loading letterforms…</div>}
          {error && <div className="error">Font failed to load: {error}</div>}
          <Canvas store={store} layouts={layouts} />
          <ZoomControls />
        </div>
        <aside className={`side${sheetOpen ? ' open' : ''}`}>
          <button type="button" className="sheet-toggle" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
            {sheetOpen ? 'Hide panel ▾' : 'Edit panel ▴'}
          </button>
          <Inspector store={store} layouts={layouts} />
        </aside>
      </main>
      {panel === 'projects' && <ProjectsDialog store={store} onClose={() => setPanel('none')} notify={notify} />}
      {panel === 'export' && <ExportDialog store={store} onClose={() => setPanel('none')} notify={notify} />}
      {panel === 'help' && <HelpDialog onClose={() => setPanel('none')} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function TopBar({ store, onPanel }: { store: Store; onPanel: (p: 'projects' | 'export' | 'help') => void }) {
  const name = useStore(store, (s) => s.project.name);
  const canUndo = useStore(store, (s) => s.past.length > 0);
  const canRedo = useStore(store, (s) => s.future.length > 0);
  return (
    <header className="topbar">
      <div className="brand" title="Midad — مِداد, ink">
        <span className="brand-ar">مِداد</span>
        <span className="brand-en">Midad</span>
      </div>
      <input className="project-name" value={name} aria-label="Project name" onChange={(e) => store.update((p) => ({ ...p, name: e.target.value }), { record: false })} />
      <div className="top-actions">
        <button type="button" onClick={() => store.undo()} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          ↶<span className="lbl">Undo</span>
        </button>
        <button type="button" onClick={() => store.redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          ↷<span className="lbl">Redo</span>
        </button>
        <button type="button" onClick={() => onPanel('projects')} title="Projects: open, new, save to file">
          ☰<span className="lbl">Projects</span>
        </button>
        <button type="button" className="primary" onClick={() => onPanel('export')} title="Export (Ctrl+E)">
          ⤓<span className="lbl">Export</span>
        </button>
        <button type="button" onClick={() => onPanel('help')} title="Help" aria-label="Help">
          ?
        </button>
      </div>
    </header>
  );
}

function ModeBar({ store }: { store: Store }) {
  const mode = useStore(store, (s) => s.mode);
  const showGuides = useStore(store, (s) => s.showGuides);
  return (
    <nav className="modebar" aria-label="Selection level">
      <span className="modebar-label">Select</span>
      {MODES.map((m) => (
        <button key={m.id} type="button" className={mode === m.id ? 'on' : ''} onClick={() => store.setMode(m.id)} title={`${m.hint} (${m.key})`}>
          <span className="m-ar">{m.arabic}</span>
          <span className="m-en">{m.label}</span>
        </button>
      ))}
      <span className="spacer" />
      <label className="check compact" title="Show baselines">
        <input type="checkbox" checked={showGuides} onChange={(e) => store.set({ showGuides: e.target.checked })} /> Guides
      </label>
    </nav>
  );
}

function ZoomControls() {
  const fire = (name: string, detail?: number) => window.dispatchEvent(new CustomEvent(name, { detail }));
  return (
    <div className="zoom-controls">
      <button type="button" onClick={() => fire('midad:zoom', 1 / 1.25)} aria-label="Zoom out">
        −
      </button>
      <button type="button" onClick={() => fire('midad:fit')} aria-label="Fit to screen">
        Fit
      </button>
      <button type="button" onClick={() => fire('midad:zoom', 1.25)} aria-label="Zoom in">
        +
      </button>
    </div>
  );
}

function useAutosave(store: Store, notify: (m: string) => void) {
  const rev = useStore(store, (s) => s.rev);
  const warned = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const ok = saveProject(store.get().project);
      if (!ok && !warned.current) {
        warned.current = true;
        notify('Could not autosave (browser storage full or blocked). Use Projects → Save file.');
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [rev, store, notify]);
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function useShortcuts(store: Store, layouts: ReturnType<typeof computeLayouts>, notify: (m: string) => void, openExport: () => void) {
  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e) && (e.target as HTMLElement).tagName !== 'INPUT') return;
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject(store.get().project);
        notify('Saved in this browser');
        return;
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        openExport();
        return;
      }
      if (isTyping(e)) return;
      const st = store.get();
      const m = MODES.find((x) => x.key === e.key);
      if (m && !mod) {
        store.setMode(m.id);
        return;
      }
      if (e.key === 'Escape') {
        store.select([]);
        store.set({ curveEdit: false });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection.length) {
        e.preventDefault();
        store.update((p) => st.selection.reduce((acc, r) => setEdit(acc, r, {}), p));
        notify('Reset selection to its original form');
        return;
      }
      if (e.key.startsWith('Arrow') && st.selection.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dv: [number, number] = e.key === 'ArrowLeft' ? [-d, 0] : e.key === 'ArrowRight' ? [d, 0] : e.key === 'ArrowUp' ? [0, -d] : [0, d];
        store.update((p) =>
          st.selection.reduce((acc, r: ElemRef) => {
            const el = elemInfo(layoutsRef.current, r);
            return el ? setEdit(acc, r, moveEdit(el, getEdit(acc, r), dv)) : acc;
          }, p),
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, notify, openExport]);
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ProjectsDialog({ store, onClose, notify }: { store: Store; onClose: () => void; notify: (m: string) => void }) {
  const [list, setList] = useState<ProjectMeta[]>(() => listProjects());
  const current = store.get().project;
  const fileRef = useRef<HTMLInputElement>(null);
  const open = (p: Project) => {
    saveProject(store.get().project);
    store.load(p);
    saveProject(p);
    onClose();
  };
  return (
    <Dialog title="Projects" onClose={onClose}>
      <div className="dialog-body">
        <div className="row gap wrap">
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" onClick={() => open(s.make())}>
              New: {s.name}
            </button>
          ))}
        </div>
        <div className="row gap wrap">
          <button type="button" onClick={() => downloadBlob(new Blob([serializeProject(store.get().project)], { type: 'application/json' }), `${safeFileName(current.name)}.midad.json`)}>
            Save to file…
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Open file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.midad,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const p = parseProjectFile(await f.text());
                // avoid clobbering a different local project with the same id
                if (listProjects().some((m) => m.id === p.id) && p.id !== current.id) p.id = uid('p');
                open(p);
                notify(`Opened “${p.name}”`);
              } catch (err) {
                notify(`Could not open: ${(err as Error).message}`);
              }
              e.target.value = '';
            }}
          />
        </div>
        <h4>In this browser</h4>
        <ul className="project-list">
          {list.map((m) => (
            <li key={m.id} className={m.id === current.id ? 'on' : ''}>
              <button
                type="button"
                className="project-open"
                onClick={() => {
                  const p = loadProject(m.id);
                  if (p) open(p);
                  else notify('That project could not be read');
                }}
              >
                <strong>{m.name}</strong>
                <small>{new Date(m.updatedAt).toLocaleString()}</small>
              </button>
              {m.id !== current.id && (
                <button
                  type="button"
                  className="icon danger"
                  title="Delete from this browser"
                  onClick={() => {
                    if (!window.confirm(`Delete “${m.name}” from this browser? This cannot be undone.`)) return;
                    deleteProject(m.id);
                    setList(listProjects());
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="muted small">Projects autosave in this browser as you work. Use “Save to file” to keep a copy or move it to another device.</p>
      </div>
    </Dialog>
  );
}

function ExportDialog({ store, onClose, notify }: { store: Store; onClose: () => void; notify: (m: string) => void }) {
  const [transparent, setTransparent] = useState(false);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const project = store.get().project;
  const svg = () => projectToSvg(project, computeLayouts(project), { transparent });
  const name = safeFileName(project.name);
  return (
    <Dialog title="Export artwork" onClose={onClose}>
      <div className="dialog-body">
        <div className="export-preview" dangerouslySetInnerHTML={{ __html: svg().replace(/^<\?xml[^>]*>/, '') }} />
        <label className="check">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background (ink only)
        </label>
        <div className="row gap wrap">
          <label className="field inline">
            <span className="field-label">PNG size</span>
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              {[1, 2, 3, 4].map((s) => (
                <option key={s} value={s}>
                  {s}× — {project.width * s}×{project.height * s}px
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row gap wrap">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const blob = await svgToPngBlob(svg(), project.width, project.height, scale);
                downloadBlob(blob, `${name}.png`);
                notify('PNG exported');
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Download PNG
          </button>
          <button type="button" onClick={() => (downloadBlob(new Blob([svg()], { type: 'image/svg+xml' }), `${name}.svg`), notify('SVG exported'))}>
            Download SVG
          </button>
          <button type="button" onClick={() => downloadBlob(new Blob([serializeProject(project)], { type: 'application/json' }), `${name}.midad.json`)}>
            Project file
          </button>
        </div>
        <p className="muted small">SVG keeps every letter as a vector outline (no fonts needed). Ink and paper textures are SVG filters, so both formats match the canvas.</p>
      </div>
    </Dialog>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="How Midad works" onClose={onClose}>
      <div className="dialog-body help">
        <p>
          Type Arabic in the <b>Text</b> panel. It is shaped right-to-left with HarfBuzz, so letters take their proper joined forms. Every letter on the canvas can then be moved, scaled and rotated.
        </p>
        <h4>Choose what a tap grabs</h4>
        <ul>
          <li><b>Block / Word</b>: move whole lines or words.</li>
          <li><b>Connected</b>: a run of joined letters (يحيى is one; سامي is سا + مي). Joins stay intact.</li>
          <li><b>Letter</b>: single letters. When you pull a letter away from its neighbours, a broad-pen <i>join stroke</i> is drawn to keep the word connected. Round handles on the joins add kashida (drag sideways) or bend the stroke (drag across). The ⟷ handle elongates the letter itself.</li>
          <li><b>Dots &amp; marks</b>: dots (nuqaṭ) and tashkīl move independently of their letter.</li>
        </ul>
        <h4>Keys</h4>
        <ul className="keys">
          <li><kbd>1</kbd>–<kbd>5</kbd> selection level · <kbd>Shift</kbd>+click add to selection</li>
          <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo</li>
          <li>Arrows nudge (<kbd>Shift</kbd> ×10) · <kbd>Delete</kbd> reset selection · <kbd>Esc</kbd> deselect</li>
          <li>Drag empty space to pan · <kbd>Ctrl</kbd>+wheel or pinch to zoom · Shift while rotating snaps 15°</li>
          <li>Touch: one finger drags, two fingers on a selection scale + rotate it</li>
        </ul>
        <p className="muted small">Fonts: Amiri, Aref Ruqaa, Reem Kufi, Noto Nastaliq Urdu, Scheherazade New, Katibeh, Rakkas, all under the SIL Open Font License.</p>
      </div>
    </Dialog>
  );
}
