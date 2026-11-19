import { describe, expect, it } from 'vitest';
import { bridgePath, layoutBlock } from '../layout';
import { newBlock } from '../model';
import { nodeFont } from './helpers';
import { TASHKIL_TEXT } from '../samples';

const font = () => nodeFont('amiri');

describe('layoutBlock', () => {
  it('shapes يحيى into four connected letters with three joins', () => {
    const lb = layoutBlock(newBlock({ text: 'يحيى' }), font());
    expect(lb.glyphs.map((g) => g.key)).toEqual(['c0.0', 'c1.0', 'c2.0', 'c3.0']);
    expect(lb.joins.map((j) => j.key)).toEqual(['j0.0', 'j1.0', 'j2.0']);
    // untouched letters still touch: no synthetic join strokes are drawn
    expect(lb.joins.every((j) => j.d === '')).toBe(true);
  });

  it('has no join across the breaks in سامي', () => {
    const lb = layoutBlock(newBlock({ text: 'سامي' }), font());
    expect(lb.joins.map((j) => `${j.a}>${j.b}`)).toEqual(['c0.0>c1.0', 'c2.0>c3.0']);
  });

  it('separates dots into independently movable pieces', () => {
    const lb = layoutBlock(newBlock({ text: 'يحيى' }), font());
    const dots = lb.glyphs.flatMap((g) => g.pieces.filter((p) => p.kind === 'dot'));
    expect(dots.length).toBeGreaterThanOrEqual(2);
    expect(lb.elems.has(`${lb.block.id}/${dots[0].key}`)).toBe(true);
  });

  it('draws a joining stroke when a letter is pulled away', () => {
    const lb = layoutBlock(newBlock({ text: 'يحيى', edits: { 'c1.0': { ty: 200 } } }), font());
    const j0 = lb.joins.find((j) => j.key === 'j0.0')!;
    const j1 = lb.joins.find((j) => j.key === 'j1.0')!;
    expect(j0.d).not.toBe('');
    expect(j1.d).not.toBe('');
    expect(lb.joins.find((j) => j.key === 'j2.0')!.d).toBe('');
  });

  it('kashida extension shifts following letters left and keeps them connected', () => {
    const plain = layoutBlock(newBlock({ text: 'سامي', align: 'right' }), font());
    const ext = layoutBlock(newBlock({ text: 'سامي', align: 'right', edits: { 'j0.0': { extend: 300 } } }), font());
    const x = (lb: typeof plain, k: string) => lb.glyphs.find((g) => g.key === k)!.world[4];
    expect(x(ext, 'c0.0')).toBeCloseTo(x(plain, 'c0.0'));
    expect(x(plain, 'c1.0') - x(ext, 'c1.0')).toBeCloseTo((300 * 180) / 1000, 0);
    const j = ext.joins.find((jj) => jj.key === 'j0.0')!;
    expect(j.d).not.toBe('');
    expect(Math.abs(j.pA[1] - j.pB[1])).toBeLessThan(0.01);
  });

  it('elongation lengthens the letter and pushes later letters', () => {
    const plain = layoutBlock(newBlock({ text: 'يحيى', align: 'right' }), font());
    const st = layoutBlock(newBlock({ text: 'يحيى', align: 'right', edits: { 'c3.0': { stretch: 200 } } }), font());
    const w = (lb: typeof plain) => lb.bbox.x1 - lb.bbox.x0;
    expect(w(st) - w(plain)).toBeCloseTo(200 * 0.18, 0);
    expect(st.glyphs[3].cutX).toBeDefined();
  });

  it('treats tashkil as marks owned by their letters', () => {
    const lb = layoutBlock(newBlock({ text: TASHKIL_TEXT }), font());
    const marks = lb.glyphs.filter((g) => g.isMark);
    expect(marks.length).toBeGreaterThanOrEqual(6);
    for (const m of marks) {
      expect(m.baseKey).not.toBe(m.key);
      expect(lb.owners.get(m.key)!.letter).toBe(m.baseKey);
    }
  });

  it('moving a base letter carries its marks', () => {
    const t = 'خَط';
    const a = layoutBlock(newBlock({ text: t }), font());
    const b = layoutBlock(newBlock({ text: t, edits: { 'c0.0': { tx: 100, ty: 50 } } }), font());
    const mark = (lb: typeof a) => lb.glyphs.find((g) => g.isMark)!.world;
    expect(mark(b)[4] - mark(a)[4]).toBeCloseTo(100 * 0.18, 1);
    expect(mark(b)[5] - mark(a)[5]).toBeCloseTo(-50 * 0.18, 1);
  });

  it('supports multiple lines', () => {
    const lb = layoutBlock(newBlock({ text: 'يحيى\nسامي' }), font());
    const y0 = lb.glyphs.find((g) => g.line === 0)!.world[5];
    const y1 = lb.glyphs.find((g) => g.line === 1)!.world[5];
    expect(y1).toBeGreaterThan(y0);
  });

  it('lays out every bundled font without throwing', () => {
    for (const id of ['amiri', 'aref-ruqaa', 'nastaliq', 'reem-kufi', 'scheherazade', 'katibeh', 'rakkas']) {
      const lb = layoutBlock(newBlock({ text: 'يحيى، سامي، رامي', font: id, edits: { 'c1.0': { ty: 100 }, 'j2.0': { extend: 200 } } }), nodeFont(id));
      expect(lb.glyphs.length).toBeGreaterThan(8);
    }
  });
});

describe('bridgePath', () => {
  const pen = { width: 20, angle: 70, min: 0.35 };
  it('is empty when the ends coincide', () => {
    expect(bridgePath([0, 0], [0, 0], 1, 1, pen, 0, 1)).toBe('');
  });
  it('produces a closed outline otherwise', () => {
    const d = bridgePath([0, 0], [-100, 0], 1, 1, pen, 0.2, 1);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('arrangements', () => {
  const font = () => nodeFont('amiri');
  it('an arc lowers the ends, keeps words joined and rotates them along the curve', () => {
    const plain = layoutBlock(newBlock({ text: 'يحيى، سامي، رامي' }), font());
    const arc = layoutBlock(newBlock({ text: 'يحيى، سامي، رامي', arrange: { shape: 'arc', bend: 0.4 } }), font());
    const y = (lb: typeof plain, k: string) => lb.glyphs.find((g) => g.key === k)!.world[5];
    expect(y(arc, 'c0.0') - y(plain, 'c0.0')).toBeGreaterThan(5); // right end drops (screen y grows)
    expect(y(arc, 'c15.0') - y(plain, 'c15.0')).toBeGreaterThan(5); // left end drops
    expect(arc.joins.every((j) => j.d === '')).toBe(true);
    const rot = (lb: typeof plain, k: string) => Math.atan2(lb.glyphs.find((g) => g.key === k)!.world[1], lb.glyphs.find((g) => g.key === k)!.world[0]);
    expect(Math.sign(rot(arc, 'c0.0'))).toBe(-Math.sign(rot(arc, 'c15.0')));
  });

  it('a negative bend curves the other way', () => {
    const plain = layoutBlock(newBlock({ text: 'يحيى، سامي، رامي' }), font());
    const arc = layoutBlock(newBlock({ text: 'يحيى، سامي، رامي', arrange: { shape: 'arc', bend: -0.4 } }), font());
    expect(arc.glyphs[0].world[5]).toBeLessThan(plain.glyphs[0].world[5]);
  });

  it('justify fills shorter lines with kashida so lines match', () => {
    const text = 'الصبر مفتاح الفرج\nمن جد وجد';
    const lb = layoutBlock(newBlock({ text, align: 'justify' }), font());
    const width = (line: number) => {
      const xs = lb.glyphs.filter((g) => g.line === line && !g.outline.empty).flatMap((g) => g.pieces.map((p) => [p.bbox.x0, p.bbox.x1])).flat();
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(Math.abs(width(0) - width(1))).toBeLessThan(width(0) * 0.06);
    expect(lb.joins.filter((j) => j.d && j.edit.extend).length).toBeGreaterThan(0);
  });
});
