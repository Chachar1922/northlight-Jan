// Module 1 – Help Desk.
const { test, expect } = require('@playwright/test');

test.describe('help desk', () => {
  test('shows five sample tickets sorted by priority, with response targets and an overdue label', async ({ page }) => {
    await page.goto('helpdesk.html');
    const rows = page.locator('#ticket-rows tr');
    await expect(rows).toHaveCount(5);
    const priorities = await rows.locator('td:nth-child(2)').allTextContents();
    expect(priorities).toEqual(['P1', 'P1', 'P2', 'P2', 'P3']);
    await expect(page.locator('#priority-guide')).toContainText('respond within 15 min');
    await expect(page.locator('#priority-guide')).toContainText('respond within 4 h');
    await expect(page.locator('#priority-guide')).toContainText('respond within 1 day');
    await expect(page.locator('tr[data-ticket="T-1001"] .badge.overdue')).toBeVisible();   // P1 created 40 min ago
  });

  test('priority logic: P1 / P2 / P3', async ({ page }) => {
    await page.goto('helpdesk.html');
    const cases = [
      ['many', 'none', 'P1'], ['minor', 'security', 'P1'], ['minor', 'money', 'P1'],
      ['one', 'none', 'P2'], ['minor', 'deadline', 'P2'], ['minor', 'none', 'P3'],
    ];
    for (const [impact, urgency, expected] of cases) {
      const p = await page.evaluate(([i, u]) => Tickets.computePriority(i, u), [impact, urgency]);
      expect(p, `${impact}/${urgency}`).toBe(expected);
    }
    await page.selectOption('#impact', 'one');
    await expect(page.locator('#priority-preview')).toContainText('P2');
  });

  test('empty form shows validation messages', async ({ page }) => {
    await page.goto('helpdesk.html');
    await page.click('#ticket-form button[type=submit]');
    await expect(page.locator('#requester-error')).toHaveText(/requester is required/i);
    await expect(page.locator('#title-error')).toHaveText(/issue is required/i);
    await expect(page.locator('#ticket-rows tr')).toHaveCount(5);
  });

  test('creating a ticket works, persists after reload, and status can be updated', async ({ page }) => {
    await page.goto('helpdesk.html');
    await page.fill('#requester', 'Test Person');
    await page.fill('#title', 'Monitor flickers on desk 12');
    await page.selectOption('#impact', 'one');
    await page.click('#ticket-form button[type=submit]');
    await expect(page.locator('#form-result')).toContainText('T-1006 created with priority P2');
    await expect(page.locator('#ticket-rows tr')).toHaveCount(6);

    await page.selectOption('select[data-id="T-1006"]', 'Resolved');
    await page.reload();
    await expect(page.locator('#ticket-rows tr')).toHaveCount(6);
    await expect(page.locator('select[data-id="T-1006"]')).toHaveValue('Resolved');
    await page.selectOption('#filter-status', 'Resolved');
    await expect(page.locator('#ticket-rows tr')).toHaveCount(2);
  });

  test('exports tickets as JSON and CSV', async ({ page }) => {
    await page.goto('helpdesk.html');
    const [json] = await Promise.all([page.waitForEvent('download'), page.click('#export-json')]);
    expect(json.suggestedFilename()).toMatch(/^northlight-tickets-.*\.json$/);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('navigation links to every module', async ({ page, isMobile }) => {
    await page.goto('helpdesk.html');
    if (isMobile) await page.click('#menu-toggle');
    for (const href of ['index.html', 'crm.html', 'automation.html', 'staff.html', 'troubleshoot.html', 'settings.html']) {
      await expect(page.locator(`#sidebar .nav-list a[href="${href}"]`)).toBeVisible();
    }
    await expect(page.locator('#sidebar a[aria-current="page"]')).toHaveText(/Help Desk/);
  });
});
