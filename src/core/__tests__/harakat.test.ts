import { describe, expect, it } from 'vitest';
import { currentHaraka, takesHarakat, withHaraka } from '../harakat';
import { remapEdits } from '../model';

describe('harakat', () => {
  it('reads, adds, changes and removes the marks after a letter', () => {
    const t = 'يحيى';
    expect(currentHaraka(t, 1)).toBe('none');
    const a = withHaraka(t, 1, 'َ');
    expect(a).toBe('يحَيى');
    expect(currentHaraka(a, 1)).toBe('fatha');
    const b = withHaraka(a, 1, 'ُّ');
    expect(currentHaraka(b, 1)).toBe('shadda-damma');
    expect(currentHaraka('حَّ', 0)).toBe('shadda-fatha'); // order of marks doesn't matter
    expect(withHaraka(b, 1, '')).toBe(t);
  });

  it('only offers harakat on letters', () => {
    expect(takesHarakat('يحيى، سامي', 4)).toBe(false); // comma
    expect(takesHarakat('يحيى، سامي', 5)).toBe(false); // space
    expect(takesHarakat('يحيى، سامي', 6)).toBe(true);
  });

  it('edits on later letters follow the text change', () => {
    const t = 'يحيى سامي';
    const t2 = withHaraka(t, 1, 'َ');
    const out = remapEdits(t, t2, { 'c1.0': { swap: 'amiri:5' }, 'c6.0': { ty: 10 } });
    expect(out['c1.0']).toEqual({ swap: 'amiri:5' });
    expect(out['c7.0']).toEqual({ ty: 10 });
  });
});
