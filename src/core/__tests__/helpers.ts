import fs from 'node:fs';
import path from 'node:path';
import { fontInfo, wrapFont, type LoadedFont } from '../fonts';

const cache = new Map<string, LoadedFont>();
export function nodeFont(id = 'amiri'): LoadedFont {
  let f = cache.get(id);
  if (!f) {
    const info = fontInfo(id);
    f = wrapFont(info, fs.readFileSync(path.resolve(import.meta.dirname, '../../../public/fonts', info.file)));
    cache.set(id, f);
  }
  return f;
}
