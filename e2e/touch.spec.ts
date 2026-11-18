import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { freshApp, pointOn, savedProject } from './helpers';

let cdp: CDPSession;
async function touch(_page: Page, type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
}

test.beforeEach(async ({ page }) => {
  cdp = await page.context().newCDPSession(page);
});

test('one-finger drag moves a letter; two-finger pinch scales it', async ({ page }) => {
  await freshApp(page);
  await page.getByRole('button', { name: /حرف/ }).click();
  const p = await pointOn(page, 'c1.0');
  await touch(page, 'touchStart', [{ ...p, id: 1 }]);
  for (let i = 1; i <= 5; i++) await touch(page, 'touchMove', [{ x: p.x, y: p.y - i * 6, id: 1 }]);
  await touch(page, 'touchEnd', []);
  let proj = await savedProject(page);
  expect(proj.blocks[0].edits['c1.0'].ty).toBeGreaterThan(0); // font units are y-up
  await expect(page.locator('[data-join]')).toHaveCount(2);

  // pinch on the selected letter
  const q = await pointOn(page, 'c1.0');
  await touch(page, 'touchStart', [{ ...q, id: 1 }]);
  await touch(page, 'touchMove', [{ ...q, id: 1 }, { x: q.x + 30, y: q.y, id: 2 }]);
  for (let i = 1; i <= 5; i++) await touch(page, 'touchMove', [{ x: q.x - i * 4, y: q.y, id: 1 }, { x: q.x + 30 + i * 4, y: q.y, id: 2 }]);
  await touch(page, 'touchEnd', []);
  proj = await savedProject(page);
  expect(proj.blocks[0].edits['c1.0'].sx).toBeGreaterThan(1.3);
});

test('bottom sheet opens the editing panel on phones', async ({ page }) => {
  await freshApp(page);
  const toggle = page.getByRole('button', { name: /Edit panel/ });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('.text-input')).toBeInViewport();
});
