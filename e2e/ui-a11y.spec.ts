import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './auth';

// Runs after smoke.spec.ts (alphabetical), so the instance is set up and has data.
test.describe.configure({ mode: 'serial' });

const PAGES = [
  '/',
  '/vehicles/1',
  '/vehicles/1/records',
  '/vehicles/1/fuel',
  '/vehicles/1/reminders',
  '/vehicles/1/odometer',
  '/vehicles/1/plan',
  '/reminders',
  '/parts',
  '/reports',
  '/search',
  '/import',
  '/log',
  '/settings',
];

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious or critical axe issues on the main pages (${scheme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    const found: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.locator('main').first().waitFor();
      await page.waitForLoadState('networkidle');
      const { violations } = await new AxeBuilder({ page }).analyze();
      for (const v of violations)
        if (v.impact === 'serious' || v.impact === 'critical')
          found.push(`${path}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target).join(' ')}`);
    }
    expect(found).toEqual([]);
  });
}

test('every control on the garage is reachable by keyboard with a visible focus ring', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/');
  await page.locator('main').first().waitFor();
  const missing: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // The ring is on the element, or on the card it stretches over (focus-within).
      const ringed = (x: Element) => {
        const s = getComputedStyle(x);
        return s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) >= 2;
      };
      const card = el.closest('article');
      return {
        name: `${el.tagName.toLowerCase()} ${el.textContent?.trim().slice(0, 30) ?? ''}`,
        ring: ringed(el) || (card != null && ringed(card)),
      };
    });
    if (info && !info.ring) missing.push(info.name);
  }
  expect(missing).toEqual([]);
});
