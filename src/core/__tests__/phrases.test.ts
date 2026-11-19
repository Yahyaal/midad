import { describe, expect, it } from 'vitest';
import { joinType } from '../arabic';
import { harakaOptions, readHaraka, takesHarakat } from '../harakat';
import { layoutBlock } from '../layout';
import { newBlock } from '../model';
import { shapeText } from '../shaping';
import { PHRASES, searchPhrases, stripTashkil } from '../phrases';
import { nodeFont } from './helpers';

describe('phrase library', () => {
  it('has unique ids and something in every category', () => {
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length);
    expect(new Set(PHRASES.map((p) => p.category)).size).toBe(6);
  });

  it('every phrase shapes in Amiri without missing glyphs', () => {
    const font = nodeFont('amiri');
    for (const p of PHRASES) {
      const lines = shapeText(font, p.text);
      expect(lines.flatMap((l) => l.glyphs).some((g) => g.gid === 0), p.id).toBe(false);
    }
  });

  it('a phrase lays out as an editable block', () => {
    const lb = layoutBlock(newBlock({ text: PHRASES.find((p) => p.id === 'khayl')!.text }), nodeFont('amiri'));
    expect(lb.lines.length).toBe(2);
  }, 30000);

  it('every ḥaraka in the library is valid for its letter and position', () => {
    const problems: string[] = [];
    for (const p of PHRASES) {
      for (let i = 0; i < p.text.length; i++) {
        if (!takesHarakat(p.text, i)) continue;
        const st = readHaraka(p.text, i);
        if (st.vowel === 'none' && !st.shadda) continue;
        const o = harakaOptions(p.text, i);
        if (!o.vowels.includes(st.vowel) || (st.shadda && !o.shadda)) problems.push(`${p.id}: ${p.text[i]}@${i} ${st.vowel}${st.shadda ? '+shadda' : ''}`);
      }
      // at most one vowel (+ shadda) per letter
      for (let i = 0; i < p.text.length; i++) {
        let j = i + 1;
        let n = 0;
        while (j < p.text.length && joinType(p.text.charCodeAt(j)) === 'T') {
          if (p.text[j] !== 'ّ') n++;
          j++;
        }
        if (n > 1 && !(p.text[i + 1] === 'ٰ' || p.text.slice(i + 1, j).includes('ٰ'))) problems.push(`${p.id}: two vowels after ${p.text[i]}@${i}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('searches Arabic with or without tashkīl, and English meanings', () => {
    expect(searchPhrases('الصبر').map((p) => p.id)).toContain('sabr');
    expect(searchPhrases('patience').length).toBeGreaterThanOrEqual(2);
    expect(searchPhrases('', 'poetry').every((p) => p.category === 'poetry')).toBe(true);
    expect(stripTashkil('حُبٌّ')).toBe('حب');
  });
});
