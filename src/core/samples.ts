// Starter compositions.
import { newBlock, newProject, type Project } from './model';

export const DEMO_TEXT = 'يحيى، سامي، رامي';
/** "Calligraphy is spiritual geometry" — fully vocalised to exercise tashkīl. */
export const TASHKIL_TEXT = 'الخَطُّ هَنْدَسَةٌ رُوحَانِيَّةٌ';

export function namesProject(): Project {
  return newProject('Names — يحيى، سامي، رامي', [newBlock({ text: DEMO_TEXT, x: 800, y: 520, size: 190 })]);
}

export function stackedProject(): Project {
  const p = newProject('Stacked names', [
    newBlock({
      text: 'يحيى',
      x: 860,
      y: 360,
      size: 330,
      edits: {
        'c3.0': { stretch: 520, cut: 0.42 },
        'c0.0': { ty: 40, rot: -4 },
        'c0.0.d1': { tx: 60, ty: 10 },
      },
    }),
    newBlock({ text: 'سامي', x: 1100, y: 700, size: 165, edits: { 'j2.0': { extend: 240, bend: 0.05 } } }),
    newBlock({ text: 'رامي', x: 560, y: 715, size: 165, edits: { 'c3.0': { stretch: 160 }, w0: { rot: -3 } } }),
  ]);
  p.ink = { ...p.ink, style: 'wet' };
  return p;
}

export function tashkilProject(): Project {
  return newProject('Tashkīl — الخط هندسة روحانية', [newBlock({ text: TASHKIL_TEXT, x: 800, y: 500, size: 130 })]);
}

export const SAMPLES: { id: string; name: string; make: () => Project }[] = [
  { id: 'names', name: 'Names (plain)', make: namesProject },
  { id: 'stacked', name: 'Names (stacked, edited)', make: stackedProject },
  { id: 'tashkil', name: 'Phrase with tashkīl', make: tashkilProject },
];
