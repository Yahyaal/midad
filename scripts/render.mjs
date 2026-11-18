import * as hb from 'harfbuzzjs';
import fs from 'node:fs';
const [file, text, out, feats] = process.argv.slice(2);
const face = new hb.Face(new hb.Blob(fs.readFileSync(file)));
const font = new hb.Font(face);
const buf = new hb.Buffer(); buf.addText(text); buf.guessSegmentProperties();
hb.shape(font, buf, feats ? feats.split(',').map(f=>hb.Feature.fromString(f)) : undefined);
const colors=['#c0392b','#2471a3','#229954','#b7950b','#7d3c98','#ca6f1e','#17a589','#555'];
let x=0, parts=[];
const gs = buf.getGlyphInfosAndPositions();
gs.forEach((g,i)=>{
  const d = font.glyphToPath(g.codepoint);
  const subs = d.split(/(?=M)/);
  subs.forEach((s,j)=>parts.push(`<path transform="translate(${x+g.xOffset},${g.yOffset})" d="${s}Z" fill="${colors[(i)%colors.length]}" fill-opacity="${j?0.6:0.9}"/>`));
  parts.push(`<text transform="translate(${x+g.xOffset+20},-400) scale(1,-1)" font-size="60">${g.cluster}</text>`);
  x+=g.xAdvance;
});
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -1300 ${x+200} 2200" width="100%" height="100%" style="background:#fff"><rect x="-100" y="-1300" width="${x+200}" height="2200" fill="#fff"/><g transform="scale(1,-1)"><line x1="0" x2="${x}" y1="0" y2="0" stroke="#999" stroke-width="3"/>${parts.join('')}</g></svg>`);
