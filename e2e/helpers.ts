import { expect, type Page } from '@playwright/test';

export async function freshApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('[data-piece]').first()).toBeVisible();
}

/** A point (page coords) that hits the given glyph piece. */
export async function pointOn(page: Page, piece: string): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((key) => {
    const el = document.querySelector(`[data-piece="${key}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let fy = 0.5; fy < 1; fy += 0.04)
      for (const s of [1, -1]) {
        const y = r.y + r.height * (0.5 + (fy - 0.5) * s);
        for (let fx = 0.05; fx < 0.96; fx += 0.03) {
          const x = r.x + r.width * fx;
          const hit = document.elementFromPoint(x, y) as SVGElement | null;
          if (hit?.dataset?.piece === key) return { x, y };
        }
      }
    return null;
  }, piece);
  if (!p) throw new Error(`no hittable point on ${piece}`);
  return p;
}

export async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (dx * i) / 6, from.y + (dy * i) / 6);
  await page.mouse.up();
}

export async function savedProject(page: Page) {
  await page.waitForTimeout(700); // autosave debounce
  return page.evaluate(() => {
    const id = localStorage.getItem('midad:last');
    return id ? JSON.parse(localStorage.getItem(`midad:project:${id}`) ?? 'null') : null;
  });
}
