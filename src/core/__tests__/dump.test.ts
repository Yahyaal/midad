// Renders debug SVGs when DUMP_DIR is set: DUMP_DIR=/tmp/x npx vitest run dump
import fs from 'node:fs';
import { it } from 'vitest';
import { layoutBlock } from '../layout';
import { newBlock } from '../model';
import { nodeFont } from './helpers';
import { matToSvg } from '../geometry';

const dir = process.env.DUMP_DIR;
it.skipIf(!dir)('dump debug renders', () => {
  const cases: Record<string, ReturnType<typeof newBlock>> = {
    plain: newBlock({ x: 800, y: 450 }),
    edited: newBlock({
      x: 800, y: 450,
      edits: {
        'c2.0': { ty: 120, rot: -10 },
        'j2.0': { extend: 300, bend: 0.25 },
        'c3.0': { stretch: 250 },
        'c0.0.d1': { tx: 60, ty: -40 },
        'g10': { ty: -150, rot: 8 },
      },
    }),
    yahya: newBlock({ x: 800, y: 500, size: 380, text: 'يحيى', edits: { 'c1.0': { ty: -90, tx: 60 }, 'j2.0': { extend: 260, bend: 0.2 }, 'c0.0': { ty: 120, rot: 12 } } }),
    yahya2: newBlock({ x: 800, y: 500, size: 380, text: 'يحيى', edits: { 'c3.0': { stretch: 320, cut: 0.45 }, 'c2.0.d1': { tx: -80 }, 'j0.0': { extend: 150 } } }),
    tashkil: newBlock({ x: 800, y: 450, size: 120, text: 'الخَطُّ هَنْدَسَةٌ رُوحَانِيَّة' }),
  };
  for (const [name, block] of Object.entries(cases)) {
    const lb = layoutBlock(block, nodeFont(block.font));
    const parts: string[] = [];
    for (const g of lb.glyphs) for (const p of g.pieces) parts.push(`<path transform="${matToSvg(p.world)}" d="${p.d}" fill="${process.env.DEBUG_COLORS && p.kind === 'dot' ? '#a33' : process.env.DEBUG_COLORS && p.kind === 'mark' ? '#36a' : '#3b2514'}" fill-opacity="0.85"/>`);
    for (const j of lb.joins) if (j.d) parts.push(`<path d="${j.d}" fill="${process.env.DEBUG_COLORS ? '#2a7' : '#3b2514'}" fill-opacity="0.85"/>`);
    fs.writeFileSync(`${dir}/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><rect width="1600" height="900" fill="#f4efe4"/>${parts.join('')}</svg>`);
  }
});
