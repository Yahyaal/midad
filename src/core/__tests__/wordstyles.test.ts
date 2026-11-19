import { describe, expect, it } from 'vitest';
import { segment } from '../arabic';
import { layoutBlock } from '../layout';
import { newBlock } from '../model';
import { applyWordStyle, groupSpan, wordStyles } from '../wordstyles';
import { nodeFont } from './helpers';

describe('word styles', () => {
  const font = () => nodeFont('amiri');

  it('offers the font rendering first plus real alternatives for محمد', () => {
    const b = newBlock({ text: 'محمد' });
    const st = wordStyles(font(), b, 0, segment(b.text).groupOf);
    expect(st[0].id).toBe('font');
    expect(st.length).toBeGreaterThanOrEqual(3);
    expect(new Set(st.map((s) => JSON.stringify(s.edits))).size).toBe(st.length);
  }, 30000);

  it('generated styles stay connected (no synthetic joins except kashida)', () => {
    const b = newBlock({ text: 'يحيى، سامي' });
    const seg = segment(b.text);
    for (const st of wordStyles(font(), b, 0, seg.groupOf)) {
      const lb = layoutBlock({ ...b, edits: st.edits }, font());
      const stray = lb.joins.filter((j) => j.d && !(j.edit.extend ?? 0));
      expect(stray.length).toBe(0);
    }
  }, 30000);

  it('maps style edits to the right place inside a longer text and keeps unrelated edits', () => {
    const b = newBlock({ text: 'يحيى، سامي', edits: { 'c6.0': { ty: 40 }, 'c1.0': { tx: 9, swap: 'amiri:1' } } });
    const seg = segment(b.text);
    const span = groupSpan(b.text, seg.groupOf, 0);
    expect(span).toEqual([0, 4]);
    const styles = wordStyles(font(), b, 0, seg.groupOf);
    const el = styles.find((s) => s.id === 'elongated')!;
    const out = applyWordStyle(b.edits, span, el);
    expect(out['c6.0']).toEqual({ ty: 40 }); // other word untouched
    expect(out['c1.0']).toEqual({ tx: 9 }); // moves kept, old form cleared
    expect(Object.keys(el.edits).every((k) => Number(k.slice(1).split('.')[0]) < 4)).toBe(true);
  }, 30000);
});
