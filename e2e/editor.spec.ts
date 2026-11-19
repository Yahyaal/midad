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

const MESSY = {
  'c0.0': { tx: 636, ty: 530, swap: 'amiri:3249' },
  'c1.0': { tx: 80, ty: 265, swap: 'amiri:1756' },
  'c2.0': { tx: 32, ty: 106 },
  'c7.0': { tx: -15, ty: 218, swap: 'amiri:4260' },
  'c6.0': { tx: 225, swap: 'amiri:2675' },
  'j6.0': { bend: 0.11 },
};

async function loadMessy(page: import('@playwright/test').Page) {
  await page.evaluate((edits) => {
    const id = localStorage.getItem('midad:last')!;
    const p = JSON.parse(localStorage.getItem(`midad:project:${id}`)!);
    p.blocks[0].edits = edits;
    localStorage.setItem(`midad:project:${id}`, JSON.stringify(p));
  }, MESSY);
  await page.reload();
  await expect(page.locator('[data-join]').first()).toBeVisible();
}

test('Tidy cleans up in one step; compare, strength and undo all work', async ({ page }) => {
  await savedProject(page);
  await loadMessy(page);
  const steep = () =>
    page.$$eval('[data-join]', (els) =>
      els.reduce((a, e) => {
        const r = e.getBoundingClientRect();
        return a + r.height;
      }, 0),
    );
  const before = await steep();
  const pieceBefore = await page.locator('[data-piece="c1.0"]').getAttribute('transform');

  await page.getByRole('button', { name: /Tidy/ }).click();
  await expect(page.locator('.tidy-bar')).toBeVisible();
  await expect(page.locator('.tidy-report')).not.toHaveText(/nothing/);
  expect(await steep()).toBeLessThan(before * 0.7);

  // hold to compare shows the original
  const cmp = page.getByRole('button', { name: 'Hold to compare' });
  const box = (await cmp.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator('[data-piece="c1.0"]')).toHaveAttribute('transform', pieceBefore!);
  await page.mouse.up();
  await expect(page.locator('[data-piece="c1.0"]')).not.toHaveAttribute('transform', pieceBefore!);

  // strength changes keep a single undo step
  await page.getByLabel('Tidy strength').fill('1');
  await page.waitForTimeout(200);
  await expect(page.locator('.tidy-bar')).toBeVisible();

  await page.getByRole('button', { name: /Undo tidy/ }).click();
  await expect(page.locator('.tidy-bar')).toHaveCount(0);
  await expect(page.locator('[data-piece="c1.0"]')).toHaveAttribute('transform', pieceBefore!);
  const e = (await savedProject(page)).blocks[0].edits;
  expect(e).toEqual(MESSY);

  // and the regular undo/redo cycle works too
  await page.keyboard.press('t');
  await expect(page.locator('.tidy-bar')).toBeVisible();
  await page.keyboard.press('Control+z');
  expect((await savedProject(page)).blocks[0].edits).toEqual(MESSY);
  await page.keyboard.press('Control+Shift+z');
  expect((await savedProject(page)).blocks[0].edits).not.toEqual(MESSY);
});

test('Tidy on a clean composition changes nothing', async ({ page }) => {
  await page.getByRole('button', { name: /Tidy/ }).click();
  await expect(page.locator('.toast')).toContainText('Already tidy');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('word styles: preview on hover, apply on click, undo restores', async ({ page }) => {
  await page.getByRole('button', { name: /Connected/ }).click();
  const p = await pointOn(page, 'c1.0');
  await page.mouse.click(p.x, p.y);
  const strip = page.locator('.variant-float .variant.word');
  await expect(strip.first()).toBeVisible({ timeout: 15000 });
  expect(await strip.count()).toBeGreaterThanOrEqual(2);
  await expect(strip.first()).toHaveAttribute('aria-selected', 'true');
  const wordSig = () => page.$$eval('[data-piece^="c0."], [data-piece^="c1."], [data-piece^="c2."], [data-piece^="c3."]', (els) => els.map((e) => e.getAttribute('d') + e.getAttribute('transform')).join('|'));
  const before = await wordSig();

  await strip.nth(1).hover();
  await expect.poll(wordSig).not.toBe(before);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  await strip.nth(1).click();
  await expect(strip.nth(1)).toHaveAttribute('aria-selected', 'true');
  const e = (await savedProject(page)).blocks[0].edits;
  expect(Object.keys(e).length).toBeGreaterThan(0);
  expect(Object.keys(e).every((k) => Number(k.slice(1).split('.')[0]) < 4)).toBe(true);

  await page.mouse.move(5, 300);
  await page.keyboard.press('Control+z');
  expect((await savedProject(page)).blocks[0].edits).toEqual({});
  await expect.poll(wordSig).toBe(before);
});

test('a letter’s Haraka tab: vowel plus shadda toggle, only valid choices, with undo', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  const p = await pointOn(page, 'c1.0'); // ح inside يحيى
  await page.mouse.click(p.x, p.y);
  await page.getByRole('tab', { name: /Haraka/ }).click();
  const vowels = page.locator('.variant-float .variant.haraka:not(.shadda-toggle)');
  await expect(vowels).toHaveCount(5); // none, fatha, damma, kasra, sukun — no tanwin mid-word
  await vowels.filter({ hasText: 'Fatḥa' }).click();
  await expect(page.locator('.text-input')).toHaveValue('يحَيى، سامي، رامي');
  await page.locator('.variant-float').getByRole('switch').click();
  await expect(page.locator('.text-input')).toHaveValue('يح\u0651\u064eيى، سامي، رامي');
  await expect(page.locator('[data-kind="mark"]')).toHaveCount(2);
  await vowels.filter({ hasText: 'Sukūn' }).click(); // sukun drops the shadda
  await expect(page.locator('.text-input')).toHaveValue('يح\u0652يى، سامي، رامي');
  await vowels.filter({ hasText: 'None' }).click();
  await expect(page.locator('.text-input')).toHaveValue('يحيى، سامي، رامي');
  await page.mouse.move(5, 300);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
  await expect(page.locator('.text-input')).toHaveValue('يح\u0651\u064eيى، سامي، رامي'.slice(0, 0) + 'يحَيى، سامي، رامي');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.text-input')).toHaveValue('يحيى، سامي، رامي');
});

test('the alif inside سامي offers no ḥaraka and says why; the last letter offers tanwīn', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  let p = await pointOn(page, 'c7.0');
  await page.mouse.click(p.x, p.y);
  await page.getByRole('tab', { name: /Haraka/ }).click().catch(() => {});
  await expect(page.locator('.variant-float .variant.haraka')).toHaveCount(1);
  await expect(page.locator('.variant-float .haraka-note')).toContainText('long vowel');
  p = await pointOn(page, 'c9.0'); // final ي of سامي
  await page.mouse.click(p.x, p.y);
  await page.getByRole('tab', { name: /Haraka/ }).click();
  await expect(page.locator('.variant-float .variant.haraka', { hasText: 'Tanwīn u' })).toBeVisible();
});

test('phrase library: search, open as new, add to canvas, replace text — all undoable or saved', async ({ page }) => {
  await page.getByRole('button', { name: /Library/ }).click();
  await page.getByLabel('Search phrases').fill('patience');
  const cards = page.locator('.lib-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  await page.getByLabel('Search phrases').fill('الصبر');
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button', { name: 'Add to canvas' }).click();
  await expect(page.locator('.layers li')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.layers li')).toHaveCount(1);

  await page.getByRole('button', { name: /Library/ }).click();
  await page.locator('.lib-cats .chip', { hasText: 'Greetings' }).click();
  await page.locator('.lib-card', { hasText: 'Good morning' }).getByRole('button', { name: 'Use for selected text' }).click();
  await expect(page.locator('.text-input')).toHaveValue('صَبَاحُ الْخَيْرِ');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.text-input')).toHaveValue('يحيى، سامي، رامي');

  await page.getByRole('button', { name: /Library/ }).click();
  await page.getByLabel('Tashkīl').uncheck();
  await page.getByLabel('Search phrases').fill('أمل');
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button', { name: 'Open as new' }).click();
  await expect(page.locator('.text-input')).toHaveValue('أمل');
  // the previous composition is kept in the browser's project list
  await page.getByRole('button', { name: /Projects/ }).click();
  await expect(page.locator('.project-list li')).toHaveCount(2);
});

test('double-click grows the selection to the whole word, which then drags as one; Esc steps back', async ({ page }) => {
  await page.getByRole('button', { name: /Letter/ }).click();
  const p = await pointOn(page, 'c1.0');
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.crumb.on .crumb-name')).toHaveText('Letter');
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator('.crumb.on .crumb-name')).toHaveText('Connected');
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator('.crumb.on .crumb-name')).toHaveText('Word');
  // drag from a different letter of the same word: the whole word moves
  await drag(page, await pointOn(page, 'c3.0'), 0, -40);
  const e = (await savedProject(page)).blocks[0].edits;
  expect(Object.keys(e)).toEqual(['w0']);
  await expect(page.locator('[data-join]')).toHaveCount(0);
  // Esc steps back down, then clears
  await page.keyboard.press('Escape');
  await expect(page.locator('.crumb.on .crumb-name')).toHaveText('Connected');
  await page.keyboard.press('Escape');
  await expect(page.locator('.crumb.on .crumb-name')).toHaveText('Letter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.crumbs')).toHaveCount(0);
  // breadcrumb jumps straight to a level (the word moved, so find the letter again)
  const q = await pointOn(page, 'c1.0');
  await page.mouse.click(q.x, q.y);
  await page.locator('.crumb', { hasText: 'Text' }).click();
  await expect(page.locator('.panel-section h3').first()).toHaveText('Text block');
});

test('Ctrl-click picks a single letter even in Word mode', async ({ page }) => {
  await page.getByRole('button', { name: /Word/ }).click();
  const p = await pointOn(page, 'c1.0');
  await page.keyboard.down('Control');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Control');
  await expect(page.locator('.crumb.on .crumb-name')).toHaveText('Letter');
});

test('ḥarakāt colour, artboard preset and mirror copy', async ({ page }) => {
  await page.getByRole('button', { name: /Library/ }).click();
  await page.getByLabel('Search phrases').fill('الصبر');
  await page.locator('.lib-card').first().getByRole('button', { name: 'Open as new' }).click();
  await page.getByRole('button', { name: 'Ḥarakāt #9b1c1c' }).click();
  const fills = await page.$$eval('[data-kind="mark"]', (els) => [...new Set(els.map((e) => e.getAttribute('fill')))]);
  expect(fills).toEqual(['#9b1c1c']);
  const bodyFill = await page.locator('[data-kind="body"]').first().getAttribute('fill');
  expect(bodyFill).not.toBe('#9b1c1c');

  await page.getByLabel('Artboard size').selectOption('square');
  const proj = await savedProject(page);
  expect([proj.width, proj.height]).toEqual([1080, 1080]);

  await page.getByTitle(/Mirror copy/).first().click();
  await expect(page.locator('.layers li')).toHaveCount(2);
  const p2 = await savedProject(page);
  expect(p2.blocks[1].transform.sx).toBe(-1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.layers li')).toHaveCount(1);
});
