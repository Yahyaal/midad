// node scripts/shot.mjs out.png [w h] [--sample=stacked] [--zoom=2] [--select=c1.0] [--mode=Letter] [--mobile]
import { chromium, devices } from '@playwright/test';
const args = process.argv.slice(2);
const out = args[0];
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [w, h] = args.slice(1).filter((a) => !a.startsWith('--')).map(Number);
const b = await chromium.launch();
const ctx = opt.mobile ? await b.newContext({ ...devices['Pixel 7'] }) : await b.newContext({ viewport: { width: w || 1440, height: h || 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const url = opt.url || 'http://localhost:5179/';
await p.goto(url);
await p.evaluate(() => localStorage.clear());
await p.goto(url);
await p.waitForSelector('[data-piece]');
if (opt.sample) {
  await p.getByRole('button', { name: /Projects/ }).click().catch(() => p.locator('.top-actions button').nth(2).click());
  await p.getByRole('button', { name: new RegExp(`New:.*${opt.sample}`, "i") }).click();
  await p.waitForTimeout(300);
}
if (opt.eval) await p.evaluate(opt.eval);
if (opt.mode) await p.getByRole('button', { name: new RegExp(opt.mode) }).click();
if (opt.zoom) for (let i = 0; i < Number(opt.zoom); i++) { await p.evaluate(() => window.dispatchEvent(new CustomEvent('midad:zoom', { detail: 1.4 }))); await p.waitForTimeout(50); }
if (opt.select) {
  const pt = await p.evaluate((key) => { const el = document.querySelector(`[data-piece="${key}"]`); const r = el.getBoundingClientRect(); for (let fy = 0.5; fy < 1; fy += 0.04) for (const s of [1, -1]) { const y = r.y + r.height * (0.5 + (fy - 0.5) * s); for (let fx = 0.05; fx < 0.96; fx += 0.03) { const x = r.x + r.width * fx; const hit = document.elementFromPoint(x, y); if (hit?.dataset?.piece === key) return { x, y }; } } return null; }, opt.select);
  if (pt) await p.mouse.click(pt.x, pt.y);
}
await p.waitForTimeout(400);
await p.screenshot({ path: out });
await b.close();
