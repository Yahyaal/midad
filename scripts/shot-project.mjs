// Screenshot the dev app with a given project JSON injected: node scripts/shot-project.mjs out.png project.json
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [out, file] = process.argv.slice(2);
const proj = JSON.parse(fs.readFileSync(file, 'utf8'));
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5179/');
await p.evaluate((pr) => { localStorage.clear(); localStorage.setItem('midad:welcomed', '1'); localStorage.setItem(`midad:project:${pr.id}`, JSON.stringify(pr)); localStorage.setItem('midad:last', pr.id); localStorage.setItem('midad:index', JSON.stringify([{ id: pr.id, name: pr.name, updatedAt: 1 }])); }, proj);
await p.goto('http://localhost:5179/');
await p.waitForSelector('[data-piece]');
await p.waitForTimeout(500);
await p.screenshot({ path: out });
await b.close();
