import { describe, expect, it } from 'vitest';
import { chooseVowel, harakaOptions, readHaraka, takesHarakat, toggleShadda, withHaraka } from '../harakat';
import { remapEdits } from '../model';

const opts = (t: string, i: number) => harakaOptions(t, i);

describe('harakat model', () => {
  it('reads and writes one vowel plus an optional shadda', () => {
    const t = 'يحيى';
    expect(readHaraka(t, 1)).toEqual({ vowel: 'none', shadda: false });
    const a = withHaraka(t, 1, { vowel: 'fatha', shadda: false });
    expect(a).toBe('يحَيى');
    const b = withHaraka(a, 1, toggleShadda(readHaraka(a, 1)));
    expect(readHaraka(b, 1)).toEqual({ vowel: 'fatha', shadda: true });
    expect(b).toBe('يحَّيى');
    expect(withHaraka(b, 1, { vowel: 'none', shadda: false })).toBe(t);
  });

  it('never combines shadda with sukūn', () => {
    expect(chooseVowel({ vowel: 'fatha', shadda: true }, 'sukun', opts('سامي', 2))).toEqual({ vowel: 'sukun', shadda: false });
    expect(toggleShadda({ vowel: 'sukun', shadda: false })).toEqual({ vowel: 'none', shadda: true });
  });
});

describe('what each letter is offered', () => {
  it('a letter inside a word: vowels, sukūn and shadda, but no tanwīn', () => {
    const o = opts('يحيى', 1); // ح
    expect(o.vowels).toEqual(['none', 'fatha', 'damma', 'kasra', 'sukun']);
    expect(o.shadda).toBe(true);
  });

  it('the first letter of a word: no sukūn and no shadda', () => {
    const o = opts('يحيى', 0);
    expect(o.vowels).not.toContain('sukun');
    expect(o.shadda).toBe(false);
  });

  it('tanwīn only at the end of a word, and tanwīn fatḥ before a final alif', () => {
    expect(opts('كتاب', 3).vowels).toEqual(expect.arrayContaining(['fathatan', 'dammatan', 'kasratan']));
    expect(opts('كتابا', 3).vowels).toContain('fathatan'); // كتابًا
    expect(opts('كتابا', 3).vowels).not.toContain('dammatan');
    expect(opts('هدى', 1).vowels).toContain('fathatan'); // هُدًى
    expect(opts('كتاب', 1).vowels).not.toContain('fathatan');
  });

  it('alif: nothing inside a word, fatḥa or kasra at its start, never ḍamma', () => {
    expect(opts('سامي', 1).vowels).toEqual(['none']);
    expect(opts('اسم', 0).vowels).toEqual(['none', 'fatha', 'kasra']);
    expect(opts('أخذ', 0).vowels).toEqual(['none', 'fatha', 'damma']);
    expect(opts('إسلام', 0).vowels).toEqual(['none', 'kasra']);
    expect(opts('مدرسة', 4).vowels).not.toContain('sukun');
  });

  it('dagger alif only where it is written', () => {
    expect(opts('هذا', 0).vowels).toContain('dagger'); // هٰذا
    expect(opts('لكن', 0).vowels).toContain('dagger'); // لٰكن
    expect(opts('سمع', 1).vowels).toContain('dagger');
    expect(opts('بحر', 1).vowels).not.toContain('dagger');
  });

  it('only letters take ḥarakāt', () => {
    expect(takesHarakat('يحيى، سامي', 4)).toBe(false);
    expect(takesHarakat('يحيى، سامي', 6)).toBe(true);
    expect(takesHarakat('يـحيى', 1)).toBe(false); // tatweel
  });

  it('edits on later letters follow the text change', () => {
    const t = 'يحيى سامي';
    const t2 = withHaraka(t, 1, { vowel: 'fatha', shadda: true });
    const out = remapEdits(t, t2, { 'c1.0': { swap: 'amiri:5' }, 'c6.0': { ty: 10 } });
    expect(out['c1.0']).toEqual({ swap: 'amiri:5' });
    expect(out['c8.0']).toEqual({ ty: 10 });
  });
});
