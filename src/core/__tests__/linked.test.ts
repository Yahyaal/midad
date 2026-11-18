import { describe, expect, it } from 'vitest';
import { layoutBlock } from '../layout';
import { newBlock } from '../model';
import { neighbourWeights, seamlessTargets } from '../../ui/linked';
import { nodeFont } from './helpers';

describe('linked letters', () => {
  it('weights joined neighbours by distance and stops at breaks', () => {
    const lb = layoutBlock(newBlock({ text: 'يحيى سامي' }), nodeFont());
    const w = neighbourWeights(lb, new Set(['c1.0']));
    expect(w.get('c0.0')).toBe(0.5);
    expect(w.get('c2.0')).toBe(0.5);
    expect(w.get('c3.0')).toBe(0.2);
    expect(w.has('c5.0')).toBe(false); // سامي is another word
  });

  it('offers the original place and moved neighbours as seamless targets', () => {
    const lb = layoutBlock(newBlock({ text: 'يحيى', edits: { 'c2.0': { tx: 10, ty: 80 } } }), nodeFont());
    const t = seamlessTargets(lb, 'c1.0');
    expect(t[0].t).toEqual([0, 0]);
    expect(t.some((x) => x.t[0] === 10 && x.t[1] === 80)).toBe(true);
  });

  it('a letter moved together with its neighbour keeps that join closed', () => {
    const lb = layoutBlock(newBlock({ text: 'يحيى', edits: { 'c1.0': { ty: 80 }, 'c2.0': { ty: 80 } } }), nodeFont());
    expect(lb.joins.find((j) => j.key === 'j1.0')!.d).toBe('');
  });
});
