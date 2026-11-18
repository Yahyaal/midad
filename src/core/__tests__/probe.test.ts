import { it } from 'vitest';
import { shapeText } from '../shaping';
import { nodeFont } from './helpers';
it.skipIf(!process.env.DUMP_DIR)('probe', () => {
  const f = nodeFont(process.env.FONT || 'nastaliq');
  for (const g of shapeText(f, process.env.TEXT || 'يحيى')[0].glyphs) {
    const o = f.outline(g.gid);
    process.stdout.write(`\nPRB c${g.cluster}.${g.k} gid${g.gid} mark=${g.isMark} x=${Math.round(g.x)} y=${Math.round(g.y)} adv=${g.advance} cls=${f.face.getGlyphClass(g.gid)} pieces=${o.pieces.map((p) => p.kind + Math.round(p.bbox.x1 - p.bbox.x0) + 'x' + Math.round(p.bbox.y1 - p.bbox.y0)).join(',')} contours=${o.contours.length}`);
  }
  process.stdout.write(`\nPRB upem=${f.upem} kashida=${f.kashidaThickness}`);
});
