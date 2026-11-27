// A stale or broken script must not blank the page: navigation stays usable and a warning explains what to do.
const { test, expect } = require('@playwright/test');

test('stale cached script: page keeps its navigation and shows a reload warning', async ({ page }) => {
  // Simulate the browser holding an OLD tickets.js that no longer matches the new config.
  await page.route('**/js/tickets.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: "window.Tickets = { IMPACT: [], URGENCY: [], dueAtFor() { throw new TypeError(\"Cannot read properties of undefined (reading 'P1')\"); } };",
  }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('helpdesk.html');
  await expect(page.locator('#load-warning')).toBeVisible();
  await expect(page.locator('#load-warning')).toContainText('Ctrl+F5');
  await expect(page.locator('#sidebar .nav-list a')).toHaveCount(7);          // the way home is still there
});
