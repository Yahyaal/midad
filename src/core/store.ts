// Tiny app store with undo/redo history over the project document.
import { useSyncExternalStore } from 'react';
import { cleanEdit, type Edit, type ElemRef, type Project, type Block, remapEdits, refId } from './model';

export type Mode = 'block' | 'word' | 'group' | 'letter' | 'mark';

export const MODES: { id: Mode; label: string; arabic: string; key: string; hint: string }[] = [
  { id: 'block', label: 'Block', arabic: 'نص', key: '1', hint: 'Whole text block' },
  { id: 'word', label: 'Word', arabic: 'كلمة', key: '2', hint: 'Space-separated words' },
  { id: 'group', label: 'Connected', arabic: 'مقطع', key: '3', hint: 'Letters joined together (e.g. سا / مي)' },
  { id: 'letter', label: 'Letter', arabic: 'حرف', key: '4', hint: 'Single letters — joins stretch to follow' },
  { id: 'mark', label: 'Dots & marks', arabic: 'نقط', key: '5', hint: 'Dots (نقاط) and tashkīl, placed independently' },
];

export interface State {
  project: Project;
  selection: ElemRef[];
  mode: Mode;
  past: Project[];
  future: Project[];
  /** bumps on every change so autosave can watch */
  rev: number;
  showGuides: boolean;
  curveEdit: boolean;
}

const HISTORY_LIMIT = 200;

type Listener = () => void;

export function createStore(initial: Project) {
  let state: State = { project: initial, selection: [], mode: 'letter', past: [], future: [], rev: 0, showGuides: true, curveEdit: false };
  const listeners = new Set<Listener>();
  let gestureSnapshot: Project | null = null;
  let gestureRecorded = false;

  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    emit();
  };

  const api = {
    get: () => state,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set,
    /** Replace the project (e.g. open file); clears history. */
    load(project: Project) {
      set({ project, past: [], future: [], selection: [], rev: state.rev + 1 });
    },
    /** Apply a change to the project. Recorded in history unless inside a gesture that already recorded. */
    update(fn: (p: Project) => Project, opts: { record?: boolean } = {}) {
      const next = fn(state.project);
      if (next === state.project) return;
      next.updatedAt = Date.now();
      const record = opts.record ?? true;
      let past = state.past;
      if (gestureSnapshot) {
        if (!gestureRecorded) {
          past = [...past, gestureSnapshot].slice(-HISTORY_LIMIT);
          gestureRecorded = true;
        }
      } else if (record) {
        past = [...past, state.project].slice(-HISTORY_LIMIT);
      }
      set({ project: next, past, future: gestureSnapshot || record ? [] : state.future, rev: state.rev + 1 });
    },
    /** Start a continuous gesture (drag/slider): all updates until endGesture form one undo step. */
    beginGesture() {
      gestureSnapshot = state.project;
      gestureRecorded = false;
    },
    endGesture() {
      gestureSnapshot = null;
      gestureRecorded = false;
    },
    undo() {
      const prev = state.past[state.past.length - 1];
      if (!prev) return;
      set({ project: prev, past: state.past.slice(0, -1), future: [state.project, ...state.future], rev: state.rev + 1, selection: validSelection(prev, state.selection) });
    },
    redo() {
      const next = state.future[0];
      if (!next) return;
      set({ project: next, past: [...state.past, state.project], future: state.future.slice(1), rev: state.rev + 1, selection: validSelection(next, state.selection) });
    },
    select(sel: ElemRef[]) {
      set({ selection: sel });
    },
    setMode(mode: Mode) {
      set({ mode, selection: [] });
    },
  };
  return api;
}

export type Store = ReturnType<typeof createStore>;

function validSelection(p: Project, sel: ElemRef[]): ElemRef[] {
  return sel.filter((r) => p.blocks.some((b) => b.id === r.block));
}

export function useStore<T>(store: Store, pick: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => pick(store.get()));
}

// Pure project helpers ---------------------------------------------------------

export function mapBlock(p: Project, id: string, fn: (b: Block) => Block): Project {
  return { ...p, blocks: p.blocks.map((b) => (b.id === id ? fn(b) : b)) };
}

export function getEdit(p: Project, ref: ElemRef): Edit {
  const b = p.blocks.find((x) => x.id === ref.block);
  if (!b) return {};
  return (ref.kind === 'block' ? b.transform : b.edits[ref.key]) ?? {};
}

export function setEdit(p: Project, ref: ElemRef, e: Edit): Project {
  return mapBlock(p, ref.block, (b) => {
    if (ref.kind === 'block') return { ...b, transform: cleanEdit(e) ?? {} };
    const edits = { ...b.edits };
    const c = cleanEdit(e);
    if (c) edits[ref.key] = c;
    else delete edits[ref.key];
    return { ...b, edits };
  });
}

export function setText(p: Project, blockId: string, text: string): Project {
  return mapBlock(p, blockId, (b) => ({ ...b, text, edits: remapEdits(b.text, text, b.edits) }));
}

export const sameRef = (a: ElemRef, b: ElemRef) => refId(a) === refId(b);
