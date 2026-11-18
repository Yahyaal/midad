import { describe, expect, it } from 'vitest';
import { newProject } from '../model';
import { createStore, getEdit, setEdit, setText } from '../store';

describe('store history', () => {
  it('undoes and redoes edits', () => {
    const s = createStore(newProject('t'));
    const b = s.get().project.blocks[0].id;
    const ref = { block: b, kind: 'glyph' as const, key: 'c0.0' };
    s.update((p) => setEdit(p, ref, { tx: 5 }));
    s.update((p) => setEdit(p, ref, { tx: 9 }));
    expect(getEdit(s.get().project, ref).tx).toBe(9);
    s.undo();
    expect(getEdit(s.get().project, ref).tx).toBe(5);
    s.undo();
    expect(getEdit(s.get().project, ref).tx).toBeUndefined();
    s.redo();
    expect(getEdit(s.get().project, ref).tx).toBe(5);
  });

  it('groups a gesture into a single undo step', () => {
    const s = createStore(newProject('t'));
    const b = s.get().project.blocks[0].id;
    const ref = { block: b, kind: 'glyph' as const, key: 'c1.0' };
    s.beginGesture();
    for (let i = 1; i <= 10; i++) s.update((p) => setEdit(p, ref, { ty: i }), { record: false });
    s.endGesture();
    expect(s.get().past.length).toBe(1);
    s.undo();
    expect(getEdit(s.get().project, ref).ty).toBeUndefined();
  });

  it('keeps edits attached when text changes', () => {
    const s = createStore(newProject('t'));
    const b = s.get().project.blocks[0];
    s.update((p) => setEdit(p, { block: b.id, kind: 'glyph', key: 'c6.0' }, { tx: 1 }));
    s.update((p) => setText(p, b.id, `ـ${b.text}`));
    expect(s.get().project.blocks[0].edits['c7.0']).toEqual({ tx: 1 });
  });
});
