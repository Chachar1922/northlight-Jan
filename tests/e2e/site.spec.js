// Module 4 – public website + enquiry integration (Help Desk, CRM, Automation).
const { test, expect } = require('@playwright/test');

async function sendEnquiry(page, { name = 'Ada Tester', email = 'ada@example.com', company = 'Test Co', message }) {
  await page.goto('index.html#contact');
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#company', company);
  await page.fill('#message', message);
  await page.click('#submit-btn');
}

test.describe('public website', () => {
  test('has SEO basics: short title, short description, one H1, FAQ JSON-LD, alt text', async ({ page }) => {
    await page.goto('index.html');
    const title = await page.title();
    expect(title.length).toBeLessThan(60);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description.length).toBeLessThan(155);
    await expect(page.locator('h1')).toHaveCount(1);
    for (const img of await page.locator('img').all()) {
      expect((await img.getAttribute('alt') || '').length).toBeGreaterThan(15);
    }
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(4);
    // JSON-LD questions must match the visible FAQ.
    const visible = await page.locator('details.faq summary').allTextContents();
    expect(visible).toEqual(ld.mainEntity.map((q) => q.name));
    await expect(page.locator('#services article')).toHaveCount(3);
    await expect(page.locator('header, main, footer, nav, section').first()).toBeVisible();
  });

  test('empty enquiry form shows clear validation messages and creates nothing', async ({ page }) => {
    await page.goto('index.html#contact');
    await page.click('#submit-btn');
    await expect(page.locator('#name-error')).toHaveText(/name is required/i);
    await expect(page.locator('#email-error')).toHaveText(/e-mail address is required/i);
    await expect(page.locator('#message-error')).toHaveText(/message is required/i);
    await expect(page.locator('#form-result .alert.error')).toBeVisible();
    await page.fill('#email', 'not-an-email');
    await page.fill('#name', 'x');
    await page.fill('#message', 'short');
    await page.click('#submit-btn');
    await expect(page.locator('#email-error')).toHaveText(/valid e-mail/i);
    await expect(page.locator('#message-error')).toHaveText(/at least 10/i);
    const tickets = await page.evaluate(() => Store.all('tickets').length);
    expect(tickets).toBe(5);       // only the five sample tickets
  });

  test('enquiry creates a lead, a P3 ticket and automation logs; no outbox alert', async ({ page }) => {
    await sendEnquiry(page, { message: 'Hello, we would like a quote for a new website.' });
    await expect(page.locator('#form-result')).toContainText('Your reference is T-1006');
    const state = await page.evaluate(() => ({
      tickets: Store.all('tickets'), leads: Store.all('leads'), outbox: Store.all('outbox'), log: Store.all('autolog'), runs: Store.all('autoruns'),
    }));
    expect(state.tickets).toHaveLength(6);
    const ticket = state.tickets.find((t) => t.id === 'T-1006');
    expect(ticket.priority).toBe('P3');
    expect(ticket.source).toBe('website');
    expect(state.leads).toHaveLength(4);
    expect(state.leads.at(-1).source).toBe('website');
    expect(state.outbox).toHaveLength(0);
    expect(state.log.map((l) => l.ruleId)).toEqual(['R1', 'R2']);      // R3/R4 skipped, only executed rules are logged
    expect(state.runs[0].results.map((r) => r.status)).toEqual(['executed', 'executed', 'skipped', 'skipped']);
  });

  test('urgent enquiry becomes P1 and queues an outbox alert', async ({ page }) => {
    await sendEnquiry(page, { message: 'URGENT: our site is down and we are losing sales!' });
    await expect(page.locator('#form-result')).toContainText('marked it as urgent');
    const state = await page.evaluate(() => ({ t: Store.get('tickets', 'T-1006'), outbox: Store.all('outbox'), log: Store.all('autolog') }));
    expect(state.t.priority).toBe('P1');
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0].subject).toContain('T-1006');
    expect(state.log.map((l) => l.ruleId)).toEqual(['R1', 'R2', 'R3', 'R4']);
  });

  test('"urgently" is not the word "urgent"', async ({ page }) => {
    await sendEnquiry(page, { message: 'We would urgently like to talk sometime soon.' });
    await expect(page.locator('#form-result')).toContainText('T-1006');
    expect(await page.evaluate(() => Store.get('tickets', 'T-1006').priority)).toBe('P3');
  });

  test('enquiry data persists after reload', async ({ page }) => {
    await sendEnquiry(page, { message: 'Persistence check for the enquiry data.' });
    await expect(page.locator('#form-result')).toContainText('T-1006');
    await page.reload();
    expect(await page.evaluate(() => Store.all('tickets').length)).toBe(6);
  });
});
