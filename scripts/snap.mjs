// usage: node scripts/snap.mjs <file-or-url> <out.png> [w] [h]
import { chromium } from '@playwright/test';
const [src, out, w='1400', h='800'] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(src.startsWith('http') ? src : 'file://' + src); await p.waitForTimeout(300);
await p.screenshot({ path: out }); await b.close();
