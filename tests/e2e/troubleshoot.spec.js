// Module 2 – click-through troubleshooting guide.
const { test, expect } = require('@playwright/test');

test.describe('troubleshooter', () => {
  test('walks the "other devices fine, numeric address works" path to a DNS result', async ({ page }) => {
    await page.goto('troubleshoot.html');
    await expect(page.locator('#guide-question')).toContainText('connected to Wi-Fi');
    await page.click('#answer-yes');    // connected
    await page.click('#answer-yes');    // other devices work
    await page.click('#answer-yes');    // numeric address works
    await expect(page.locator('#guide-result')).toContainText('DNS problem');
    await expect(page.locator('#path li')).toHaveCount(3);
  });

  test('router path ends at the provider result; back and restart work', async ({ page }) => {
    await page.goto('troubleshoot.html');
    await page.click('#answer-yes');
    await page.click('#answer-no');     // other devices cannot get online
    await page.click('#answer-no');     // router restart did not help
    await expect(page.locator('#guide-result')).toContainText('internet line or the router');
    await page.click('#back-btn');
    await expect(page.locator('#guide-question')).toContainText('Unplug the router');
    await page.click('#answer-yes');
    await expect(page.locator('#guide-result')).toContainText('back online');
    await page.click('#restart-btn');
    await expect(page.locator('#guide-question')).toContainText('connected to Wi-Fi');
    await expect(page.locator('#back-btn')).toBeDisabled();
  });

  test('every question leads somewhere (no dead ends)', async ({ page }) => {
    await page.goto('troubleshoot.html');
    // Exhaustively walk the tree with a depth-first search through the UI.
    const seen = await page.evaluate(() => 0);
    expect(seen).toBe(0);
    async function walk(depth) {
      if (depth > 8) throw new Error('loop detected');
      if (await page.locator('#guide-result').count()) return 1;
      let leaves = 0;
      for (const ans of ['yes', 'no']) {
        await page.click(`#answer-${ans}`);
        leaves += await walk(depth + 1);
        await page.click('#back-btn');
      }
      return leaves;
    }
    expect(await walk(0)).toBeGreaterThanOrEqual(6);
  });
});
