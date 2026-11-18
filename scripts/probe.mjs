import * as hb from 'harfbuzzjs';
import fs from 'node:fs';
const file = process.argv[2]; const text = process.argv[3]; const feats = process.argv[4];
const face = new hb.Face(new hb.Blob(fs.readFileSync(file)));
const font = new hb.Font(face);
console.log('upem', face.upem, 'GSUB feats', face.getTableFeatureTags('GSUB').join(' '));
const buf = new hb.Buffer(); buf.addText(text); buf.guessSegmentProperties();
hb.shape(font, buf, feats ? feats.split(',').map(f=>hb.Feature.fromString(f)) : undefined);
for (const g of buf.getGlyphInfosAndPositions()) {
  const p = font.glyphToJson(g.codepoint);
  const contours = p.filter(c=>c.type==='M').length;
  console.log(g.cluster, font.glyphName(g.codepoint), 'adv', g.xAdvance, 'off', g.xOffset, g.yOffset, 'contours', contours, 'class', face.getGlyphClass(g.codepoint));
}
