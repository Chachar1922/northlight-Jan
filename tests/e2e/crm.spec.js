// Module 5 – CRM.
const { test, expect } = require('@playwright/test');

const count = (page, stage) => page.locator(`#stage-chart g[data-stage="${stage}"]`).getAttribute('data-count');

test.describe('crm', () => {
  test('dashboard draws an SVG chart with all five stages', async ({ page }) => {
    await page.goto('crm.html');
    await expect(page.locator('#stage-chart svg')).toBeVisible();
    await expect(page.locator('#stage-chart g[data-stage]')).toHaveCount(5);
    expect(await count(page, 'Quote')).toBe('1');
    expect(await count(page, 'Lead')).toBe('0');
    expect(await page.locator('svg.chart').getAttribute('aria-label')).toContain('Won: 1');
  });

  test('has three sample leads and one open support case', async ({ page }) => {
    await page.goto('crm.html');
    await page.click('#tab-leads');
    await expect(page.locator('#lead-rows tr')).toHaveCount(3);
    await page.click('#tab-cases');
    await expect(page.locator('#case-rows tr')).toHaveCount(1);
    await expect(page.locator('#case-rows tr .badge.warn')).toHaveText('Open');
  });

  test('converting a lead creates account, contact, opportunity and updates the chart', async ({ page }) => {
    await page.goto('crm.html');
    await page.click('#tab-leads');
    await page.click('tr[data-lead="L-1001"] .convert-btn');
    await expect(page.locator('#page-result')).toContainText('Lead L-1001 converted');
    await expect(page.locator('tr[data-lead="L-1001"] .badge.ok')).toHaveText('Converted');
    const counts = await page.evaluate(() => ({ a: Store.all('accounts').length, c: Store.all('contacts').length, o: Store.all('opportunities').length }));
    expect(counts).toEqual({ a: 3, c: 3, o: 5 });
    await page.click('#tab-dashboard');
    expect(await count(page, 'Lead')).toBe('1');
    // cannot convert twice
    const err = await page.evaluate(() => { try { CRM.convertLead('L-1001'); return null; } catch (e) { return e.message; } });
    expect(err).toMatch(/already been converted/);
    // persists
    await page.reload();
    await page.click('#tab-dashboard');
    expect(await count(page, 'Lead')).toBe('1');
  });

  test('changing an opportunity stage updates the chart', async ({ page }) => {
    await page.goto('crm.html');
    await page.click('#tab-opportunities');
    await page.selectOption('select[data-id="O-1002"]', 'Won');
    await page.click('#tab-dashboard');
    expect(await count(page, 'Won')).toBe('2');
    expect(await count(page, 'Qualified')).toBe('0');
  });

  test('won and lost opportunities record a reason', async ({ page }) => {
    await page.goto('crm.html');
    await page.click('#tab-opportunities');
    await expect(page.locator('#reason-O-1003')).toHaveValue('Existing relationship and a fast turnaround.');
    await expect(page.locator('tr[data-opp="O-1001"]')).not.toContainText('Reason needed');     // Quote stage: no reason column input
    await page.selectOption('select[data-id="O-1001"]', 'Lost');
    await expect(page.locator('tr[data-opp="O-1001"]')).toContainText('Reason needed');
    await page.fill('#reason-O-1001', 'Budget was cut <b>entirely</b>.');
    await page.click('tr[data-opp="O-1001"] button:has-text("Save")');
    await expect(page.locator('tr[data-opp="O-1001"]')).not.toContainText('Reason needed');
    await page.reload();
    await page.click('#tab-opportunities');
    await expect(page.locator('#reason-O-1001')).toHaveValue('Budget was cut <b>entirely</b>.');
    expect(await page.evaluate(() => Store.get('opportunities', 'O-1001').reason)).toBe('Budget was cut <b>entirely</b>.');
  });

  test('lead and case forms validate input', async ({ page }) => {
    await page.goto('crm.html');
    await page.click('#tab-leads');
    await page.click('#lead-form button[type=submit]');
    await expect(page.locator('#lead-name-error')).toHaveText(/name is required/i);
    await expect(page.locator('#lead-email-error')).toHaveText(/e-mail is required/i);
    await page.click('#tab-cases');
    await page.click('#case-form button[type=submit]');
    await expect(page.locator('#case-subject-error')).toHaveText(/subject is required/i);
  });

  test('case with a past due time shows an overdue indicator', async ({ page }) => {
    await page.goto('crm.html');
    await page.click('#tab-cases');
    await page.fill('#case-subject', 'Client cannot access shared proofs');
    await page.selectOption('#case-priority', 'P1');
    await page.fill('#case-due', '2020-01-01T09:00');
    await page.click('#case-form button[type=submit]');
    await expect(page.locator('#case-rows tr').first().locator('.badge.overdue')).toBeVisible();
    await page.click('#tab-dashboard');
    await expect(page.locator('#crm-stats')).toContainText('1 / 2');
  });
});
