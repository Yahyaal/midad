import { describe, expect, it } from 'vitest';
import { layoutBlock } from '../layout';
import { newBlock } from '../model';
import { tidyBlock } from '../tidy';
import { nodeFont } from './helpers';

// The composition from the user's canvas: letters dragged apart, forms swapped, سا pushed into the comma.
const MESSY = {
  'c0.0': { tx: 636, ty: 530, swap: 'amiri:3249' },
  'c1.0': { tx: 80, ty: 265, swap: 'amiri:1756' },
  'c2.0': { tx: 32, ty: 106 },
  'c7.0': { tx: -15, ty: 218, swap: 'amiri:4260' },
  'c6.0': { tx: 225, swap: 'amiri:2675' },
  'j6.0': { bend: 0.11 },
};
const text = 'يحيى، سامي، رامي';
const font = () => nodeFont('amiri');
const bridges = (b: ReturnType<typeof newBlock>) => {
  const lb = layoutBlock(b, font());
  return lb.joins.reduce((a, j) => a + (j.d ? Math.hypot(j.pB[0] - j.pA[0], j.pB[1] - j.pA[1]) : 0), 0);
};
/** how much the joins climb or drop (kashida length is intentional and not counted) */
const steepness = (b: ReturnType<typeof newBlock>) => layoutBlock(b, font()).joins.reduce((a, j) => a + (j.d ? Math.abs(j.pB[1] - j.pA[1]) : 0), 0);

describe('tidy', () => {
  it('flattens the steep join strokes of a messy composition', () => {
    const b = newBlock({ text, edits: structuredClone(MESSY) });
    const { block, report } = tidyBlock(b, font(), { strength: 0.7 });
    expect(steepness(block)).toBeLessThan(steepness(b) * 0.6);
    expect(report.smoothed + report.kashidas + report.forms).toBeGreaterThan(0);
  });

  it('keeps the chosen forms and the overall rise of the word', () => {
    const b = newBlock({ text, edits: structuredClone(MESSY) });
    const { block } = tidyBlock(b, font(), { strength: 0.7 });
    expect(block.edits['c0.0']?.swap ?? block.edits['c0.0']?.swap).toBeTruthy();
    expect((block.edits['c0.0']?.ty ?? 0) > 0).toBe(true);
  });

  it('restores the space between يحيى، and سامي', () => {
    const b = newBlock({ text, edits: structuredClone(MESSY) });
    const gap = (blk: ReturnType<typeof newBlock>) => {
      const lb = layoutBlock(blk, font());
      const comma = lb.glyphs.find((g) => g.cluster === 4)!.pieces[0].bbox;
      const sin = lb.glyphs.find((g) => g.cluster === 6)!.pieces[0].bbox;
      return comma.x0 - sin.x1;
    };
    const { block } = tidyBlock(b, font(), { strength: 1 });
    const natural = gap(newBlock({ text }));
    expect(gap(b)).toBeLessThan(natural * 0.6);
    expect(gap(block)).toBeGreaterThan(natural * 0.8);
  });

  it('turns a sideways pull into a kashida and leaves later letters in place', () => {
    const b = newBlock({ text: 'سامي', align: 'right', edits: { 'c3.0': { tx: -300 } } });
    const { block, report } = tidyBlock(b, font(), { strength: 1 });
    expect(report.kashidas).toBe(1);
    expect(block.edits['j2.0'].extend).toBeGreaterThan(250);
    const x = (blk: typeof b) => layoutBlock(blk, font()).glyphs.find((g) => g.key === 'c3.0')!.world[4];
    expect(x(block)).toBeCloseTo(x(b), 0);
  });

  it('is a no-op on an untouched block and with strength 0', () => {
    const plain = newBlock({ text });
    expect(tidyBlock(plain, font(), { strength: 1 }).block.edits).toEqual({});
    const b = newBlock({ text, edits: structuredClone(MESSY) });
    expect(bridges(tidyBlock(b, font(), { strength: 0 }).block)).toBeCloseTo(bridges(b), -1);
  });
});
