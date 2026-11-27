// Responsive layout: no horizontal page scrolling on phone, tablet and desktop widths; navigation usable on mobile.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const PAGES = fs.readdirSync(path.resolve(__dirname, '..', '..')).filter((f) => f.endsWith('.html')).sort();
const SIZES = [['phone', 375, 800], ['tablet', 768, 1024], ['desktop', 1280, 800]];

test.describe('responsive layout', () => {
  test.skip(({ isMobile }) => isMobile, 'Viewport sizes are set explicitly below.');

  for (const [label, width, height] of SIZES) {
    for (const file of PAGES) {
      test(`${file} fits a ${label} screen (${width}px) without horizontal scrolling`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(file);
        await page.waitForTimeout(250);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${file} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      });
    }
  }

  test('phone: sidebar is hidden behind a menu button that opens and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('helpdesk.html');
    await expect(page.locator('#menu-toggle')).toBeVisible();
    await expect(page.locator('#sidebar .nav-list a[href="crm.html"]')).not.toBeInViewport();
    await page.click('#menu-toggle');
    await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#sidebar .nav-list a[href="crm.html"]')).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  test('desktop: sidebar is always visible and the menu button is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('crm.html');
    await expect(page.locator('#menu-toggle')).toBeHidden();
    await expect(page.locator('#sidebar .nav-list a[href="crm.html"]')).toBeInViewport();
  });
});
