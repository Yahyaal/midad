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

describe('reconnect', () => {
  it('drops moves in the group but keeps forms, elongation and kashida', async () => {
    const { reconnect } = await import('../store');
    const p = newProject('t');
    const b = p.blocks[0];
    b.text = 'يحيى سامي';
    b.edits = {
      'c0.0': { tx: 50, ty: 90, swap: 'amiri:3249' },
      'c1.0': { ty: 40, rot: 12 },
      'c1.0.d1': { tx: 5 },
      'c3.0': { stretch: 200, ty: 10 },
      'j0.0': { extend: 120 },
      g0: { ty: 30 },
      'c5.0': { ty: 70 },
    };
    const groupOf = (k: string) => (Number(k.slice(1).split('.')[0]) < 4 ? 'g0' : 'g5');
    const out = reconnect(p, b.id, ['c1.0'], groupOf).blocks[0].edits;
    expect(out['c0.0']).toEqual({ swap: 'amiri:3249' });
    expect(out['c1.0']).toBeUndefined();
    expect(out['c3.0']).toEqual({ stretch: 200 });
    expect(out['j0.0']).toEqual({ extend: 120 });
    expect(out.g0).toBeUndefined();
    expect(out['c5.0']).toEqual({ ty: 70 }); // other word untouched
  });
});
