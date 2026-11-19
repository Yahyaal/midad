import fs from 'node:fs';
import { it } from 'vitest';
import { segment } from '../arabic';
import { compose, matToSvg, scale, translate } from '../geometry';
import { newBlock } from '../model';
import { wordStyles } from '../wordstyles';
import { nodeFont } from './helpers';

it.skipIf(!process.env.DUMP_DIR)('dump word styles', () => {
  const font = nodeFont(process.env.FONT || 'amiri');
  const words = (process.env.WORDS || 'يحيى سامي محمد الخط سلام كتب حسين').split(' ');
  const parts: string[] = [];
  let y = 160;
  for (const w of words) {
    const b = newBlock({ text: w, font: font.info.id });
    const seg = segment(w);
    const starts = [...new Set(seg.groupOf.filter((g) => g >= 0))];
    const t0 = performance.now();
    // style the longest group of the word
    const g = starts.reduce((best, st) => (seg.groupOf.filter((x) => x === st).length > seg.groupOf.filter((x) => x === best).length ? st : best), starts[0]);
    const styles = wordStyles(font, b, g, seg.groupOf);
    const ms = performance.now() - t0;
    styles.forEach((st, i) => {
      const off = compose(translate(1700 - i * 330, y), scale(1.6));
      for (const gl of st.preview.glyphs) for (const pc of gl.pieces) parts.push(`<path transform="${matToSvg(compose(off, pc.world))}" d="${pc.d}" fill="#3b2514"/>`);
      for (const j of st.preview.joins) if (j.d) parts.push(`<path transform="${matToSvg(off)}" d="${j.d}" fill="#2a7"/>`);
      parts.push(`<text x="${1600 - i * 330}" y="${y + 90}" font-size="20" fill="#999">${st.label}</text>`);
    });
    parts.push(`<text x="20" y="${y}" font-size="20" fill="#b5532c">${ms.toFixed(0)}ms</text>`);
    y += 230;
  }
  fs.writeFileSync(`${process.env.DUMP_DIR}/styles.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1900 ${y}" width="1900" height="${y}"><rect width="1900" height="${y}" fill="#f4efe4"/>${parts.join('')}</svg>`);
}, 120000);
