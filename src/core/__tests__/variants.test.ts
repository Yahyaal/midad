import { describe, expect, it } from 'vitest';
import { layoutBlock } from '../layout';
import { newBlock } from '../model';
import { harvestForms, joinPosition, letterVariants } from '../variants';
import { nodeFont } from './helpers';

describe('joinPosition', () => {
  it('reads positions in يحيى and سامي', () => {
    expect(['يحيى', 'يحيى', 'يحيى', 'يحيى'].map((t, i) => joinPosition(t, i))).toEqual(['init', 'medi', 'medi', 'fina']);
    expect([0, 1, 2, 3].map((i) => joinPosition('سامي', i))).toEqual(['init', 'fina', 'init', 'fina']);
    expect(joinPosition('ر', 0)).toBe('isol');
  });
});

describe('letter variants', () => {
  it('harvests several designer-drawn forms in Amiri', () => {
    expect(harvestForms(nodeFont('amiri'), 'ه', 'medi').length).toBeGreaterThan(4);
    expect(harvestForms(nodeFont('amiri'), 'ح', 'medi').length).toBeGreaterThan(4);
  });

  it('offers deduplicated options with the current form first', () => {
    const font = nodeFont('amiri');
    const block = newBlock({ text: 'سهم' });
    const lb = layoutBlock(block, font);
    const cur = lb.glyphs.find((g) => g.key === 'c1.0')!.gid;
    const vs = letterVariants(font, block, 1, cur);
    expect(vs[0].kind).toBe('default');
    expect(vs[0].gid).toBe(cur);
    expect(vs.length).toBeGreaterThanOrEqual(4);
    expect(new Set(vs.map((v) => v.gid)).size).toBe(vs.length);
  });

  it('adds elongated presets for final letters that stretch well', () => {
    const font = nodeFont('amiri');
    const block = newBlock({ text: 'يحيى' });
    const cur = layoutBlock(block, font).glyphs.find((g) => g.key === 'c3.0')!.gid;
    const vs = letterVariants(font, block, 3, cur);
    expect(vs.filter((v) => v.kind === 'long').length).toBe(2);
  });

  it('swapping a form keeps the word connected with a bridge when the shapes no longer touch', () => {
    const font = nodeFont('amiri');
    const block = newBlock({ text: 'يحيى' });
    const cur = layoutBlock(block, font).glyphs.find((g) => g.key === 'c0.0')!.gid;
    const vs = letterVariants(font, block, 0, cur).filter((v) => v.kind === 'form');
    expect(vs.length).toBeGreaterThan(1);
    for (const v of vs) {
      const lb = layoutBlock(newBlock({ text: 'يحيى', edits: { 'c0.0': { swap: `amiri:${v.gid}` } } }), font);
      expect(lb.glyphs[0].gid).toBe(v.gid);
      expect(lb.joins.length).toBe(3);
    }
  });

  it('ignores a swap saved for a different font', () => {
    const lb = layoutBlock(newBlock({ text: 'يحيى', font: 'aref-ruqaa', edits: { 'c0.0': { swap: 'amiri:12' } } }), nodeFont('aref-ruqaa'));
    expect(lb.glyphs[0].gid).not.toBe(12);
  });
});

describe('neighbour fitting', () => {
  it('re-forms the ح when the initial ي of يحيى takes a baseline shape', async () => {
    const { fitNeighbours } = await import('../variants');
    const font = nodeFont('amiri');
    const block = newBlock({ text: 'يحيى' });
    const cur = layoutBlock(block, font).glyphs[0].gid;
    const forms = letterVariants(font, block, 0, cur).filter((v) => v.kind === 'form');
    const fits = forms.map((v) => fitNeighbours(font, block, 0, v.gid));
    // at least one alternative ي needs a different ح to go with it
    expect(fits.some((f) => f.some((x) => x.key === 'c1.0' && x.gid !== null))).toBe(true);
  });
});
