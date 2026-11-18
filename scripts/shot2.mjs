// Scripted interaction screenshots for manual review (needs the dev server on :5179).
// usage: node scripts/shot2.mjs out.png <points|tashkil|compose|export|gold|mobile>
import { chromium, devices } from '@playwright/test';
const [out, scenario] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = scenario.includes('mobile') ? await b.newContext({ ...devices['Pixel 7'] }) : await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://localhost:5179/');
await p.evaluate(() => localStorage.clear());
await p.goto('http://localhost:5179/');
await p.waitForSelector('[data-piece]');
const zoom = async (n) => { for (let i = 0; i < n; i++) { await p.evaluate(() => window.dispatchEvent(new CustomEvent('midad:zoom', { detail: 1.4 }))); await p.waitForTimeout(40); } };
const pointOn = (key) => p.evaluate((key) => { const el = document.querySelector(`[data-piece="${key}"]`); const r = el.getBoundingClientRect(); for (let fy = 0.5; fy < 1; fy += 0.04) for (const s of [1, -1]) { const y = r.y + r.height * (0.5 + (fy - 0.5) * s); for (let fx = 0.05; fx < 0.96; fx += 0.03) { const x = r.x + r.width * fx; const hit = document.elementFromPoint(x, y); if (hit?.dataset?.piece === key) return { x, y }; } } return null; }, key);
const drag = async (pt, dx, dy) => { await p.mouse.move(pt.x, pt.y); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(pt.x + dx * i / 8, pt.y + dy * i / 8); await p.mouse.up(); };
const center = async (loc) => { const bb = await loc.boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
if (scenario === 'points') {
  await zoom(2);
  await p.getByRole('button', { name: /Letter/ }).click();
  const pt = await pointOn('c3.0'); await p.mouse.click(pt.x, pt.y);
  await p.getByLabel('Edit outline points').check();
  await drag(await center(p.locator('.pt-handle').nth(6)), -40, 30);
}
if (scenario === 'tashkil') {
  await p.getByRole('button', { name: /Projects/ }).click();
  await p.getByRole('button', { name: /New:.*tashk/i }).click();
  await zoom(1);
  await p.getByRole('button', { name: /Dots/ }).click();
  const marks = await p.$$eval('[data-kind="mark"]', (els) => els.map((e) => e.dataset.piece));
  const pt = await pointOn(marks[2]); await drag(pt, 0, -25);
}
if (scenario === 'compose') {
  await p.getByRole('button', { name: /Letter/ }).click();
  await zoom(1);
  let pt = await pointOn('c3.0'); await p.mouse.click(pt.x, pt.y);
  await drag(await center(p.locator('[data-handle="stretch"]')), -90, 0);
  pt = await pointOn('c9.0'); await p.mouse.click(pt.x, pt.y);
  await drag(await center(p.locator('circle.join-handle').first()), -60, 12);
}
if (scenario === 'forms' || scenario === 'forms-mobile') {
  await zoom(Number(process.env.ZOOM ?? (scenario === 'forms' ? 2 : 1)));
  await p.getByRole('button', { name: scenario === 'forms' ? /Letter/ : /حرف/ }).click();
  const pt = await pointOn(process.env.KEY || 'c1.0'); await p.mouse.click(pt.x, pt.y);
  await p.waitForSelector('.variant-float .variant');
  const n = Number(process.env.PICK || 0);
  if (n) {
    const b = p.locator('.variant-float .variant').nth(n);
    if (process.env.HOVER) await b.hover(); else await b.click();
  }
}
if (scenario === 'drag') {
  await zoom(Number(process.env.ZOOM ?? 2));
  await p.getByRole('button', { name: /Letter/ }).click();
  if (process.env.FOLLOW === '0') await p.getByLabel('Neighbours follow').uncheck();
  const pt = await pointOn(process.env.KEY || 'c1.0');
  await drag(pt, Number(process.env.DX ?? 0), Number(process.env.DY ?? -60));
  await p.mouse.click(5, 300);
}
if (scenario === 'export') await p.getByRole('button', { name: /Export/ }).click();
if (scenario === 'gold') {
  await p.getByRole('radio', { name: 'Gold' }).click();
  await p.locator('.swatch').nth(4).click();
  await zoom(2);
}
if (scenario === 'mobile') {
  await p.getByRole('button', { name: /حرف/ }).click();
  const pt = await pointOn('c1.0'); await p.mouse.click(pt.x, pt.y);
}
await p.waitForTimeout(400);
await p.screenshot({ path: out });
await b.close();
