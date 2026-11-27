// Module 6 – Automation, and cross-module integration (website -> automation -> help desk + CRM).
const { test, expect } = require('@playwright/test');

test.describe('automation', () => {
  test('rules are loaded from rules.json and listed', async ({ page }) => {
    await page.goto('automation.html');
    await expect(page.locator('#rule-rows tr')).toHaveCount(4);
    await expect(page.locator('tr[data-rule="R3"]')).toContainText('urgent');
  });

  test('urgent website enquiry shows up in every module', async ({ page }) => {
    await page.goto('index.html#contact');
    await page.fill('#name', 'Grace Hopper');
    await page.fill('#email', 'grace@example.com');
    await page.fill('#message', 'This is urgent - our launch is tomorrow and the logo is wrong.');
    await page.click('#submit-btn');
    await expect(page.locator('#form-result')).toContainText('T-1006');

    // Automation page: outbox, logs, execution results.
    await page.goto('automation.html');
    await expect(page.locator('.outbox-item')).toHaveCount(1);
    await expect(page.locator('.outbox-item')).toContainText('Queued locally (never sent)');
    await expect(page.locator('.log-item')).toHaveCount(4);
    await expect(page.locator('#run-rows tr')).toHaveCount(1);
    await expect(page.locator('#run-rows tr')).toContainText('T-1006 (P1)');
    // execution time, duration, rule names and per-rule results
    await expect(page.locator('#run-rows .run-time')).toContainText(/\d{2}:\d{2}:\d{2}/);
    await expect(page.locator('#run-rows .run-duration')).toHaveText(/^\d+ ms$/);
    await expect(page.locator('#run-rows .rule-name')).toHaveText([/R1 Create CRM lead/, /R2 Create Help Desk ticket/, /R3 Urgent enquiries/, /R4 Create outbox alert/]);
    await expect(page.locator('.log-item').first()).toContainText(/\d{2}:\d{2}:\d{2}/);

    // Help Desk: P1 ticket at top.
    await page.goto('helpdesk.html');
    await expect(page.locator('#ticket-rows tr[data-ticket="T-1006"] .badge.p1')).toBeVisible();
    // CRM: new lead from website.
    await page.goto('crm.html');
    await page.click('#tab-leads');
    await expect(page.locator('#lead-rows')).toContainText('Grace Hopper');
    await expect(page.locator('#lead-rows')).toContainText('website');
  });

  test('simulate form on the automation page validates and runs', async ({ page }) => {
    await page.goto('automation.html');
    await page.click('#test-form button[type=submit]');
    await expect(page.locator('#t-name-error')).toBeVisible();
    await page.fill('#t-name', 'Test Runner');
    await page.fill('#t-email', 'runner@example.com');
    await page.fill('#t-message', 'Just a normal question about pricing.');
    await page.click('#test-form button[type=submit]');
    await expect(page.locator('#test-result')).toContainText('ticket T-1006 (P3)');
    await expect(page.locator('.outbox-item')).toHaveCount(0);
  });

  test('a broken rules file is reported, not silently ignored', async ({ page }) => {
    await page.route('**/rules.json', (route) => route.fulfill({ status: 500, body: 'nope' }));
    await page.goto('index.html#contact');
    await page.fill('#name', 'Ada');
    await page.fill('#email', 'ada@example.com');
    await page.fill('#message', 'Hello, this should fail loudly.');
    await page.click('#submit-btn');
    await expect(page.locator('#form-result .alert.error')).toContainText('Could not load rules.json');
    expect(await page.evaluate(() => Store.all('autolog').at(-1).status)).toBe('error');
  });
});
