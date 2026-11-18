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
