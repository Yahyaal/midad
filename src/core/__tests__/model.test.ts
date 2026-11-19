import { describe, expect, it } from 'vitest';
import { cleanEdit, isIdentityEdit, keyCharIndex, newProject, remapEdits, validateProject } from '../model';

describe('remapEdits', () => {
  it('shifts edits after an insertion', () => {
    const out = remapEdits('يحيى سامي', 'يحيى و سامي', { 'c0.0': { tx: 1 }, 'c5.0': { ty: 2 }, g5: { rot: 3 }, 'j5.0': { extend: 9 } });
    expect(out['c0.0']).toEqual({ tx: 1 });
    expect(out['c7.0']).toEqual({ ty: 2 });
    expect(out.g7).toEqual({ rot: 3 });
    expect(out['j7.0']).toEqual({ extend: 9 });
  });

  it('drops edits inside a replaced span', () => {
    const out = remapEdits('سامي', 'سالي', { 'c2.0': { tx: 5 }, 'c3.0': { tx: 1 }, 'c0.0.d1': { ty: 4 } });
    expect(out['c2.0']).toBeUndefined();
    expect(out['c3.0']).toEqual({ tx: 1 });
    expect(out['c0.0.d1']).toEqual({ ty: 4 });
  });

  it('parses key indices', () => {
    expect(keyCharIndex('c12.0.d1')).toBe(12);
    expect(keyCharIndex('w3')).toBe(3);
    expect(keyCharIndex('j4.1')).toBe(4);
  });
});

describe('edits', () => {
  it('cleans identity values', () => {
    expect(cleanEdit({ tx: 0, sx: 1, rot: 0 })).toBeUndefined();
    expect(cleanEdit({ tx: 3, sx: 1 })).toEqual({ tx: 3 });
    expect(isIdentityEdit({ sx: 1, weight: 1 })).toBe(true);
  });

  it('validates project files', () => {
    const p = newProject('x');
    expect(validateProject(JSON.parse(JSON.stringify(p))).name).toBe('x');
    expect(() => validateProject({ hello: 1 })).toThrow();
  });
});

describe('artboard and mirror', () => {
  it('resizing keeps the composition centred', async () => {
    const { resizeArtboard } = await import('../model');
    const p = newProject('x');
    const b0 = p.blocks[0];
    const q = resizeArtboard(p, 1080, 1080);
    expect(q.width).toBe(1080);
    expect(q.blocks[0].x - 540).toBeCloseTo(b0.x - 800);
    expect(q.blocks[0].y - 540).toBeCloseTo(b0.y - 450);
  });

  it('mirror copy flips the block and places it symmetrically', async () => {
    const { mirrorCopy } = await import('../model');
    const p = newProject('x');
    p.blocks[0].x = 1100;
    const r = mirrorCopy(p, p.blocks[0].id)!;
    const copy = r.project.blocks[1];
    expect(copy.x).toBe(500);
    expect(copy.transform.sx).toBe(-1);
    expect(copy.id).not.toBe(p.blocks[0].id);
  });
});
