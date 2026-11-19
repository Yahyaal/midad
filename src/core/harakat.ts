// Tashkīl on a letter, as one vowel plus an optional shadda, offering only what
// Arabic orthography allows for that letter in that position.
import { joinType } from './arabic';

export type Vowel = 'none' | 'fatha' | 'damma' | 'kasra' | 'sukun' | 'fathatan' | 'dammatan' | 'kasratan' | 'dagger';

export const VOWEL_MARK: Record<Vowel, string> = {
  none: '',
  fatha: 'َ',
  damma: 'ُ',
  kasra: 'ِ',
  sukun: 'ْ',
  fathatan: 'ً',
  dammatan: 'ٌ',
  kasratan: 'ٍ',
  dagger: 'ٰ',
};

export const VOWEL_LABEL: Record<Vowel, string> = {
  none: 'None',
  fatha: 'Fatḥa',
  damma: 'Ḍamma',
  kasra: 'Kasra',
  sukun: 'Sukūn',
  fathatan: 'Tanwīn a',
  dammatan: 'Tanwīn u',
  kasratan: 'Tanwīn i',
  dagger: 'Dagger alif',
};

export const SHADDA = 'ّ';

export interface HarakaState {
  vowel: Vowel;
  shadda: boolean;
}

export interface HarakaOptions {
  vowels: Vowel[];
  /** may this letter carry a shadda here? */
  shadda: boolean;
  /** why some choices are missing (shown to the user) */
  note?: string;
}

const isLetter = (ch: string | undefined) => !!ch && /[\u0621-\u063f\u0641-\u064a\u066e-\u06d3]/.test(ch); // letters, not tatweel

/** Can this character carry ḥarakāt at all? (letters only, not punctuation, digits or marks) */
export function takesHarakat(text: string, i: number): boolean {
  return isLetter(text[i]) && joinType(text.charCodeAt(i)) !== 'T';
}

/** Index of the next / previous letter, skipping combining marks; -1 when the word ends. */
function neighbourLetter(text: string, i: number, dir: 1 | -1): number {
  let j = i + dir;
  while (j >= 0 && j < text.length && joinType(text.charCodeAt(j)) === 'T') j += dir;
  return j >= 0 && j < text.length && isLetter(text[j]) ? j : -1;
}

/** The run of combining marks right after the letter at i. */
export function marksAfter(text: string, i: number): [number, number] {
  let j = i + 1;
  while (j < text.length && joinType(text.charCodeAt(j)) === 'T') j++;
  return [i + 1, j];
}

export function readHaraka(text: string, i: number): HarakaState {
  const [a, b] = marksAfter(text, i);
  const m = text.slice(a, b);
  const vowel = (Object.keys(VOWEL_MARK) as Vowel[]).find((v) => v !== 'none' && m.includes(VOWEL_MARK[v])) ?? 'none';
  return { vowel, shadda: m.includes(SHADDA) };
}

export function marksFor(st: HarakaState): string {
  return (st.shadda ? SHADDA : '') + VOWEL_MARK[st.vowel];
}

/** Replace the marks after letter i; returns the new text. */
export function withHaraka(text: string, i: number, st: HarakaState): string {
  const [a, b] = marksAfter(text, i);
  return text.slice(0, a) + marksFor(st) + text.slice(b);
}

/** Letters where a dagger (superscript) alif is actually written: هٰذا، ذٰلك، الرحمٰن، لٰكن، إلٰه، السمٰوات */
const DAGGER_LETTERS = new Set([...'هذلمنكو']);

export function harakaOptions(text: string, i: number): HarakaOptions {
  const ch = text[i];
  const prev = neighbourLetter(text, i, -1);
  const next = neighbourLetter(text, i, 1);
  const wordStart = prev < 0;
  const wordEnd = next < 0;
  // tanwīn fatḥ sits on the letter before a final alif (كتابًا) or alif maqṣūra (هُدًى)
  const beforeFinalAlif = next >= 0 && neighbourLetter(text, next, 1) < 0 && (text[next] === 'ا' || text[next] === 'ى') && ch !== 'ا';
  const tanwin: Vowel[] = wordEnd ? ['fathatan', 'dammatan', 'kasratan'] : beforeFinalAlif ? ['fathatan'] : [];

  switch (ch) {
    case 'ا':
      return wordStart
        ? { vowels: ['none', 'fatha', 'kasra'], shadda: false, note: 'At the start of a word alif carries the vowel of its (silent) hamza.' }
        : { vowels: ['none'], shadda: false, note: 'Here alif is a long vowel: it takes no ḥaraka (put the fatḥa on the letter before it).' };
    case 'ٱ':
    case 'آ':
    case 'ى':
      return { vowels: ['none'], shadda: false, note: `${ch} takes no ḥaraka.` };
    case 'أ':
      return { vowels: ['none', 'fatha', 'damma', ...(wordStart ? [] : (['sukun'] as Vowel[])), ...tanwin.filter((v) => v !== 'kasratan')], shadda: false, note: 'أ takes fatḥa, ḍamma or sukūn; for kasra use إ.' };
    case 'إ':
      return { vowels: ['none', 'kasra', ...tanwin.filter((v) => v === 'kasratan')], shadda: false, note: 'إ takes kasra only.' };
    case 'ة':
      return { vowels: ['none', 'fatha', 'damma', 'kasra', 'fathatan', 'dammatan', 'kasratan'], shadda: false };
    default: {
      const vowels: Vowel[] = ['none', 'fatha', 'damma', 'kasra'];
      if (!wordStart) vowels.push('sukun'); // no Arabic word starts with a sukūn
      vowels.push(...tanwin);
      if (DAGGER_LETTERS.has(ch)) vowels.push('dagger'); // هٰذا، ذٰلك، لٰكن start with it
      return { vowels, shadda: !wordStart }; // shadda doubles a consonant: never on the first letter
    }
  }
}

/** Combine a choice with the current state, keeping it valid (shadda never with sukūn). */
export function chooseVowel(cur: HarakaState, vowel: Vowel, opts: HarakaOptions): HarakaState {
  return { vowel, shadda: cur.shadda && opts.shadda && vowel !== 'sukun' && vowel !== 'dagger' };
}

export function toggleShadda(cur: HarakaState): HarakaState {
  const on = !cur.shadda;
  return { vowel: on && (cur.vowel === 'sukun' || cur.vowel === 'dagger') ? 'none' : cur.vowel, shadda: on };
}
