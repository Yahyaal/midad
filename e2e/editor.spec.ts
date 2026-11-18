import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { drag, freshApp, pointOn, savedProject } from './helpers';

test.beforeEach(async ({ page }) => freshApp(page));

test('renders the starting composition as shaped glyph outlines', async ({ page }) => {
  await expect(page.locator('.text-input')).toHaveValue('يحيى، سامي، رامي');
  const pieces = await page.locator('[data-piece]').count();
  expect(pieces).toBeGreaterThan(14);
  // dots are separate pieces
  expect(await page.locator('[data-kind="dot"]').count()).toBeGreaterThan(3);
});

test('moving a letter inside يحيى keeps it joined, and undo/redo work', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  await page.getByLabel('Neighbours follow').uncheck();
  const p = await pointOn(page, 'c1.0');
  await drag(page, p, 10, -60);
  await expect(page.locator('.sel-label')).toHaveText('ح');
  await expect(page.locator('[data-join]')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-join]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('[data-join]')).toHaveCount(2);
});

test('connected-group mode moves سا as a unit without join strokes', async ({ page }) => {
  await page.getByRole('button', { name: /Connected/ }).click();
  const p = await pointOn(page, 'c6.0');
  await drag(page, p, 0, -40);
  await expect(page.locator('.panel-section h3').first()).toHaveText('Connected group');
  await expect(page.locator('.sel-label')).toHaveText('سا');
  await expect(page.locator('[data-join]')).toHaveCount(0);
  const proj = await savedProject(page);
  expect(Object.keys(proj.blocks[0].edits)).toEqual(['g6']);
});

test('dots move independently in marks mode', async ({ page }) => {
  await page.getByRole('button', { name: /Dots/ }).click();
  const p = await pointOn(page, 'c0.0.d1');
  await drag(page, p, 30, 0);
  const proj = await savedProject(page);
  expect(proj.blocks[0].edits['c0.0.d1'].tx).toBeGreaterThan(0);
  expect(proj.blocks[0].edits['c0.0']).toBeUndefined();
});

test('join handle adds kashida', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  const p = await pointOn(page, 'c8.0');
  await page.mouse.click(p.x, p.y);
  const handle = page.locator('circle.join-handle').first();
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, -80, 0);
  const proj = await savedProject(page);
  const joins = Object.entries(proj.blocks[0].edits).filter(([k]) => k.startsWith('j'));
  expect(joins.length).toBe(1);
  expect((joins[0][1] as { extend: number }).extend).toBeGreaterThan(50);
  await expect(page.locator('[data-join]')).toHaveCount(1);
});

test('edits survive a reload', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  await page.getByLabel('Neighbours follow').uncheck();
  await drag(page, await pointOn(page, 'c3.0'), -50, 0);
  await savedProject(page);
  await page.reload();
  await expect(page.locator('[data-join]')).toHaveCount(1);
  const proj = await savedProject(page);
  expect(proj.blocks[0].edits['c3.0'].tx).toBeLessThan(0);
});

test('typing text with tashkil shapes marks as separate selectable pieces', async ({ page }) => {
  await page.locator('.text-input').fill('بِسْمِ اللَّهِ');
  await expect(page.locator('[data-kind="mark"]')).not.toHaveCount(0);
  expect(await page.locator('[data-kind="mark"]').count()).toBeGreaterThanOrEqual(5);
});

test('SVG export matches the canvas artwork exactly', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  await drag(page, await pointOn(page, 'c1.0'), 10, -50);
  const canvasPaths = await page.$$eval('svg.canvas [data-piece], svg.canvas [data-join]', (els) =>
    els.map((e) => `${e.getAttribute('d')}|${e.getAttribute('transform') ?? ''}`).sort(),
  );
  await page.getByRole('button', { name: /Export/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download SVG' }).click()]);
  const svg = fs.readFileSync((await download.path())!, 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).not.toContain('data-piece');
  const exported = [...svg.matchAll(/<path d="([^"]+)"(?: transform="([^"]+)")?/g)].map((m) => `${m[1]}|${m[2] ?? ''}`).sort();
  expect(exported).toEqual(canvasPaths);
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).click()]);
  const buf = fs.readFileSync((await png.path())!);
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  expect(buf.length).toBeGreaterThan(20_000);
});

test('project file round-trips through save and open', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  await page.getByLabel('Neighbours follow').uncheck();
  await drag(page, await pointOn(page, 'c2.0'), 0, 30);
  await page.getByRole('button', { name: /Projects/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save to file…' }).click()]);
  const file = (await download.path())!;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(saved.blocks[0].edits['c2.0']).toBeTruthy();
  await page.getByRole('button', { name: /New: Phrase/ }).click();
  await expect(page.locator('.text-input')).not.toHaveValue('يحيى، سامي، رامي');
  await page.getByRole('button', { name: /Projects/ }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.locator('.text-input')).toHaveValue('يحيى، سامي، رامي');
  await expect(page.locator('[data-join]')).toHaveCount(2);
});

test('tapping a letter offers its other forms; hover previews, click swaps, undo restores', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  const p = await pointOn(page, 'c0.0');
  await page.mouse.click(p.x, p.y);
  const strip = page.locator('.variant-float .variant');
  await expect(strip.first()).toBeVisible();
  expect(await strip.count()).toBeGreaterThanOrEqual(4);
  await expect(strip.first()).toHaveAttribute('aria-selected', 'true');

  // hover = preview only: canvas changes, document and history do not
  const before = await page.locator('[data-piece="c0.0"]').getAttribute('d');
  await strip.nth(2).hover();
  await expect.poll(() => page.locator('[data-piece="c0.0"]').getAttribute('d')).not.toBe(before);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await page.mouse.move(5, 5);
  await expect.poll(() => page.locator('[data-piece="c0.0"]').getAttribute('d')).toBe(before);

  // click = swap, recorded and saved
  await strip.nth(2).click();
  await expect(strip.nth(2)).toHaveAttribute('aria-selected', 'true');
  const proj = await savedProject(page);
  expect(proj.blocks[0].edits['c0.0'].swap).toMatch(/^amiri:\d+$/);
  expect(await page.locator('[data-join]').count()).toBeLessThanOrEqual(3);

  // ] cycles to the next form, undo walks back
  await page.keyboard.press(']');
  await expect(strip.nth(3)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+z');
  await expect(strip.nth(2)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+z');
  await expect(strip.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-piece="c0.0"]')).toHaveAttribute('d', before!);
});

test('final letters also offer elongated forms', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  const p = await pointOn(page, 'c3.0');
  await page.mouse.click(p.x, p.y);
  await page.locator('.variant-float .variant', { hasText: 'Longer' }).click();
  const proj = await savedProject(page);
  expect(proj.blocks[0].edits['c3.0'].stretch).toBeGreaterThan(500);
});

test('dragging a letter pulls its neighbours partly along', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  await drag(page, await pointOn(page, 'c1.0'), 0, -60);
  const e = (await savedProject(page)).blocks[0].edits;
  expect(e['c1.0'].ty).toBeGreaterThan(0);
  expect(e['c0.0'].ty).toBeCloseTo(e['c1.0'].ty * 0.5, 0);
  expect(e['c2.0'].ty).toBeCloseTo(e['c1.0'].ty * 0.5, 0);
  expect(e['c3.0'].ty).toBeCloseTo(e['c1.0'].ty * 0.2, 0);
  expect(e['c6.0']).toBeUndefined(); // other words untouched
});

test('a letter dragged back near its place snaps home and the word is whole again', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  await page.getByLabel('Neighbours follow').uncheck();
  const p = await pointOn(page, 'c1.0');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(p.x, p.y - i * 12);
  await expect(page.locator('[data-join]')).toHaveCount(2);
  for (let i = 1; i <= 6; i++) await page.mouse.move(p.x + 2, p.y - 72 + i * 11.5); // ends ~3px off
  await expect(page.locator('.canvas-hint.snap')).toContainText('Joined');
  await page.mouse.up();
  await expect(page.locator('[data-join]')).toHaveCount(0);
  const e = (await savedProject(page)).blocks[0].edits;
  expect(e['c1.0']).toBeUndefined();
});

test('Reconnect word closes gaps but keeps the chosen letter form', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  const p = await pointOn(page, 'c0.0');
  await page.mouse.click(p.x, p.y);
  await page.locator('.variant-float .variant').nth(1).click();
  const swapped = (await savedProject(page)).blocks[0].edits['c0.0'].swap;
  expect(swapped).toBeTruthy();
  await drag(page, await pointOn(page, 'c0.0'), 60, -70);
  await expect(page.locator('[data-join]')).not.toHaveCount(0);
  await page.getByRole('button', { name: /Reconnect word/ }).click();
  await expect(page.locator('[data-join]')).toHaveCount(0);
  const e = (await savedProject(page)).blocks[0].edits;
  expect(e['c0.0']).toEqual({ swap: swapped });
  expect(Object.keys(e).every((k) => !e[k].tx && !e[k].ty)).toBe(true);
});
