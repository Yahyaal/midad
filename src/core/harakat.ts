// Tashkīl on a letter: read and replace the combining marks that follow it.
import { joinType } from './arabic';

export interface Haraka {
  id: string;
  label: string;
  /** short label for small buttons */
  short: string;
  /** combining marks placed after the letter ('' = none) */
  marks: string;
}

export const HARAKAT: Haraka[] = [
  { id: 'none', label: 'None', short: 'None', marks: '' },
  { id: 'fatha', label: 'Fatḥa', short: 'Fatḥa', marks: 'َ' },
  { id: 'damma', label: 'Ḍamma', short: 'Ḍamma', marks: 'ُ' },
  { id: 'kasra', label: 'Kasra', short: 'Kasra', marks: 'ِ' },
  { id: 'sukun', label: 'Sukūn', short: 'Sukūn', marks: 'ْ' },
  { id: 'shadda', label: 'Shadda', short: 'Shadda', marks: 'ّ' },
  { id: 'shadda-fatha', label: 'Shadda + fatḥa', short: 'Shadda a', marks: 'َّ' },
  { id: 'shadda-damma', label: 'Shadda + ḍamma', short: 'Shadda u', marks: 'ُّ' },
  { id: 'shadda-kasra', label: 'Shadda + kasra', short: 'Shadda i', marks: 'ِّ' },
  { id: 'fathatan', label: 'Tanwīn fatḥ', short: 'Tanwīn a', marks: 'ً' },
  { id: 'dammatan', label: 'Tanwīn ḍamm', short: 'Tanwīn u', marks: 'ٌ' },
  { id: 'kasratan', label: 'Tanwīn kasr', short: 'Tanwīn i', marks: 'ٍ' },
  { id: 'dagger', label: 'Dagger alif', short: 'Alif', marks: 'ٰ' },
];

/** Can this character carry ḥarakāt? (Arabic letters only, not punctuation or digits.) */
export function takesHarakat(text: string, i: number): boolean {
  const cp = text.charCodeAt(i);
  if (!(cp >= 0x0620 && cp <= 0x064a) && !(cp >= 0x066e && cp <= 0x06d3)) return false;
  return joinType(cp) !== 'T';
}

/** The run of combining marks right after the letter at i. */
export function marksAfter(text: string, i: number): [number, number] {
  let j = i + 1;
  while (j < text.length && joinType(text.charCodeAt(j)) === 'T') j++;
  return [i + 1, j];
}

export function currentHaraka(text: string, i: number): string {
  const [a, b] = marksAfter(text, i);
  const cur = normalise(text.slice(a, b));
  return HARAKAT.find((h) => normalise(h.marks) === cur)?.id ?? (cur ? 'custom' : 'none');
}

/** Replace the marks after letter i; returns the new text. */
export function withHaraka(text: string, i: number, marks: string): string {
  const [a, b] = marksAfter(text, i);
  return text.slice(0, a) + marks + text.slice(b);
}

function normalise(m: string): string {
  return [...m].sort().join('');
}
