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
      x: 800,
      y: 430,
      size: 300,
      edits: {
        'c3.0': { stretch: 260, cut: 0.42 },
        'j2.0': { bend: 0.12 },
        'c0.0.d1': { tx: -40, ty: 10 },
      },
    }),
    newBlock({ text: 'سامي', x: 1180, y: 700, size: 170, edits: { 'j0.0': { extend: 180, bend: 0.08 } } }),
    newBlock({ text: 'رامي', x: 470, y: 700, size: 170, edits: { 'c2.0': { stretch: 120 } } }),
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
