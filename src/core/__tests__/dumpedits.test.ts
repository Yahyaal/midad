// Visual regression sheet for letter edits: DUMP_DIR=/tmp/x npx vitest run dumpedits
import fs from 'node:fs';
import { it } from 'vitest';
import { layoutBlock } from '../layout';
import { type Edit, newBlock } from '../model';
import { matToSvg } from '../geometry';
import { nodeFont } from './helpers';

export const EDIT_CASES: [string, string, Record<string, Edit>][] = [
  ['plain', 'يحيى', {}],
  ['ح up', 'يحيى', { 'c1.0': { ty: 160 } }],
  ['ح down', 'يحيى', { 'c1.0': { ty: -140 } }],
  ['ح left', 'يحيى', { 'c1.0': { tx: -160 } }],
  ['ي rot', 'يحيى', { 'c2.0': { rot: 18 } }],
  ['ى big', 'يحيى', { 'c3.0': { sx: 1.35, sy: 1.35 } }],
  ['م up', 'سامي', { 'c2.0': { ty: 150 } }],
  ['ي down', 'سامي', { 'c3.0': { ty: -120, tx: -60 } }],
  ['kashida', 'سامي', { 'j0.0': { extend: 300 } }],
  ['ه swap', 'سهم', { 'c1.0': { swap: 'amiri:4829' } }],
  ['user', 'يحيى', { 'c0.0': { tx: 636, ty: 530, swap: 'amiri:3249' }, 'c1.0': { tx: 80, ty: 265, swap: 'amiri:1756' }, 'c2.0': { tx: 32, ty: 106 } }],
  ['user-swaps', 'يحيى', { 'c0.0': { swap: 'amiri:3249' }, 'c1.0': { swap: 'amiri:1756' } }],
  ['user-move', 'يحيى', { 'c0.0': { tx: 636, ty: 530 }, 'c1.0': { tx: 80, ty: 265 }, 'c2.0': { tx: 32, ty: 106 } }],
];

it.skipIf(!process.env.DUMP_DIR)('dump edit sheet', () => {
  const font = nodeFont();
  const parts: string[] = [];
  EDIT_CASES.forEach(([label, text, edits], i) => {
    const col = i % 5;
    if (process.env.ONLY && !label.startsWith(process.env.ONLY)) return;
    const row = Math.floor(i / 5);
    const lb = layoutBlock(newBlock({ text, size: 230, align: 'center', x: 190 + col * 380, y: 260 + row * 420, edits }), font);
    const debug = !!process.env.DEBUG_COLORS;
    for (const g of lb.glyphs) for (const pc of g.pieces) parts.push(`<path transform="${matToSvg(pc.world)}" d="${pc.d}" fill="#3b2514"/>`);
    for (const j of lb.joins) if (j.d) parts.push(`<path d="${j.d}" fill="${debug ? '#2a7' : '#3b2514'}"/>`);
    parts.push(`<text x="${190 + col * 380}" y="${400 + row * 420}" font-size="22" text-anchor="middle" fill="#999">${label}</text>`);
  });
  fs.writeFileSync(`${process.env.DUMP_DIR}/${process.env.NAME || 'edits'}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1900 1280" width="1900" height="1280"><rect width="1900" height="1280" fill="#f4efe4"/>${parts.join('')}</svg>`);
}, 60000);
