// Accessibility: axe-core scan (WCAG 2.1 A/AA) of every page, including states with form errors.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const path = require('node:path');

const PAGES = fs.readdirSync(path.resolve(__dirname, '..', '..')).filter((f) => f.endsWith('.html')).sort();
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const summary = (v) => v.map((x) => `${x.id} (${x.impact}): ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`).join('\n');

test.describe('accessibility (axe-core)', () => {
  test.skip(({ isMobile }) => isMobile, 'Scanned once on the desktop project.');

  for (const file of PAGES) {
    test(`${file} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(file);
      await page.waitForTimeout(500);
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations, summary(violations)).toEqual([]);
    });
  }

  test('forms with validation errors showing have no violations', async ({ page }) => {
    await page.goto('index.html#contact');
    await page.click('#submit-btn');
    await expect(page.locator('#name-error')).toBeVisible();
    let r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(r.violations, summary(r.violations)).toEqual([]);
    await page.goto('helpdesk.html');
    await page.click('#ticket-form button[type=submit]');
    await expect(page.locator('#requester-error')).toBeVisible();
    r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(r.violations, summary(r.violations)).toEqual([]);
  });

  test('CRM tabs and the stage chart have no violations', async ({ page }) => {
    await page.goto('crm.html');
    for (const tab of ['dashboard', 'leads', 'opportunities', 'cases']) {
      await page.click(`#tab-${tab}`);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(r.violations, `${tab}\n${summary(r.violations)}`).toEqual([]);
    }
  });
});
