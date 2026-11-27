// Module 7 – health, config, cloud description, export all data.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test.describe('data & cloud', () => {
  test('shows health.json and the cloud resources with required tags', async ({ page }) => {
    await page.goto('settings.html');
    await expect(page.locator('.health-application')).toHaveText('Northlight Studio IT');
    await expect(page.locator('.health-version')).toHaveText(/^\d+\.\d+\.\d+$/);
    await expect(page.locator('.health-build-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.locator('#cloud-rows tr')).toHaveCount(3);
    await expect(page.locator('#cloud-rows')).toContainText('rg-northlight-prod-001');
    await expect(page.locator('#cloud-rows')).toContainText('CC-1001');
  });

  test('"Export all data" downloads one JSON file containing every collection', async ({ page }) => {
    // create data through the public site first, so we export real cross-module records
    await page.goto('index.html#contact');
    await page.fill('#name', 'Export Tester');
    await page.fill('#email', 'export@example.com');
    await page.fill('#message', 'urgent: please include me in the export.');
    await page.click('#submit-btn');
    await expect(page.locator('#form-result')).toContainText('T-1006');

    await page.goto('settings.html');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-all')]);
    expect(download.suggestedFilename()).toMatch(/^northlight-export-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    for (const name of ['tickets', 'leads', 'accounts', 'contacts', 'opportunities', 'cases', 'staff', 'outbox', 'autolog', 'autoruns', 'meta']) {
      expect(json.data, name).toHaveProperty(name);
    }
    expect(json.data.tickets).toHaveLength(6);
    expect(json.data.staff).toHaveLength(6);
    expect(json.data.outbox).toHaveLength(1);
    expect(json.data.leads.some((l) => l.name === 'Export Tester')).toBe(true);
    expect(JSON.stringify(json)).not.toContain('Demo-Pass');   // hashes only, never plain passwords
  });

  test('reset restores the sample data', async ({ page }) => {
    await page.goto('helpdesk.html');
    await page.evaluate(() => Store.add('tickets', { requester: 'x', title: 'extra', priority: 'P3', status: 'New', dueAt: new Date().toISOString(), source: 'test' }));
    await page.goto('settings.html');
    page.once('dialog', (d) => d.accept());
    await page.click('#reset-data');
    await expect(page.locator('#page-result')).toContainText('reset');
    expect(await page.evaluate(() => Store.all('tickets').length)).toBe(5);
  });
});
