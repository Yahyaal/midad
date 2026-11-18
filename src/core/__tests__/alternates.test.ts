import { describe, expect, it } from 'vitest';
import { findAlternates } from '../alternates';
import { newBlock } from '../model';
import { nodeFont } from './helpers';

describe('findAlternates', () => {
  it('always offers the default form first', () => {
    const alts = findAlternates(nodeFont('amiri'), newBlock({ text: 'يحيى' }), 0);
    expect(alts[0].alt).toBe('');
    expect(alts[0].d.length).toBeGreaterThan(10);
  });

  it('finds per-letter stylistic alternates (Aref Ruqaa: س ه ك ن)', () => {
    const text = 'سهم كن';
    const block = newBlock({ text, font: 'aref-ruqaa' });
    const counts = [...text].map((ch, i) => (ch === ' ' ? 0 : findAlternates(nodeFont('aref-ruqaa'), block, i).length - 1));
    expect(counts[0]).toBeGreaterThan(0); // س
    expect(counts[1]).toBeGreaterThan(0); // ه
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(3);
  });

  it('applies the chosen alternate only to that letter', async () => {
    const { layoutBlock } = await import('../layout');
    const font = nodeFont('aref-ruqaa');
    const text = 'سهم سهم';
    const alts = findAlternates(font, newBlock({ text, font: 'aref-ruqaa' }), 0);
    const plain = layoutBlock(newBlock({ text, font: 'aref-ruqaa' }), font);
    const alt = layoutBlock(newBlock({ text, font: 'aref-ruqaa', edits: { 'c0.0': { alt: alts[1].alt } } }), font);
    const gid = (lb: typeof plain, cl: number) => lb.glyphs.find((g) => g.cluster === cl)!.gid;
    expect(gid(alt, 0)).not.toBe(gid(plain, 0));
    expect(gid(alt, 4)).toBe(gid(plain, 4));
  });
});
