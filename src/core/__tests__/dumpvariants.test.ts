import fs from 'node:fs';
import { it } from 'vitest';
import { layoutBlock } from '../layout';
import { newBlock } from '../model';
import { fitNeighbours, letterVariants } from '../variants';
import { matToSvg } from '../geometry';
import { nodeFont } from './helpers';
it.skipIf(!process.env.DUMP_DIR)('dump swapped words', () => {
  const font = nodeFont(process.env.FONT || 'amiri');
  const cases: [string, number][] = [['يحيى', 0], ['يحيى', 1], ['يحيى', 3], ['سهم', 1], ['رامي', 3], ['كلمة', 0]];
  const parts: string[] = [];
  let y = 150;
  for (const [text, cl] of cases) {
    const base = newBlock({ text, font: font.info.id });
    const cur = layoutBlock(base, font).glyphs.find((g) => g.cluster === cl && !g.isMark)!.gid;
    const vs = letterVariants(font, base, cl, cur);
    vs.forEach((v, i) => {
      const e = v.kind === 'long' ? { stretch: v.stretch } : v.kind === 'form' ? { swap: `${font.info.id}:${v.gid}` } : {};
      const edits: Record<string, object> = { [`c${cl}.0`]: e };
      if (v.kind === 'form' && !process.env.NOFIT) for (const f of fitNeighbours(font, base, cl, v.gid)) if (f.gid !== null) edits[f.key] = { swap: `${font.info.id}:${f.gid}` };
      const lb = layoutBlock(newBlock({ text, font: font.info.id, size: 90, align: 'center', x: 110 + i * 200, y, edits }), font);
      for (const g of lb.glyphs) for (const pc of g.pieces) parts.push(`<path transform="${matToSvg(pc.world)}" d="${pc.d}" fill="${g.cluster === cl && !g.isMark ? '#b5532c' : '#3b2514'}"/>`);
      for (const j of lb.joins) if (j.d) parts.push(`<path d="${j.d}" fill="#2a7"/>`);
    });
    y += 170;
  }
  fs.writeFileSync(`${process.env.DUMP_DIR}/swaps.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 ${y}" width="2400" height="${y}"><rect width="2400" height="${y}" fill="#f4efe4"/>${parts.join('')}</svg>`);
}, 120000);
