// Module 8 – security tests.
//  1. user text is rendered as plain text (no HTML/JS execution)
//  2. Sales user cannot see the admin section
//  3. empty forms show clear validation messages
//  4. every page has a Content Security Policy meta tag
//  5. no secrets committed to the repository
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { scanRepo } = require('../../tools/scan-secrets');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();

// ---------------------------------------------------------------------------
test.describe('1. contact-form text is rendered as plain text', () => {
  const PAYLOADS = {
    name: '<img src=x onerror="window.__xss=1">Mallory',
    company: '"><svg onload="window.__xss=1"></svg>',
    message: '<script>window.__xss=1</script> <b id="injected">bold?</b> <a href="javascript:window.__xss=1">click</a> urgent',
  };

  test('payload appears as literal text in Help Desk, CRM and Automation and never executes', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

    await page.goto('index.html#contact');
    await page.fill('#name', PAYLOADS.name);
    await page.fill('#email', 'mallory@example.com');
    await page.fill('#company', PAYLOADS.company);
    await page.fill('#message', PAYLOADS.message);
    await page.click('#submit-btn');
    // Confirmation message echoes the name: must be text, not an <img>.
    await expect(page.locator('#form-result')).toContainText('T-1006');
    await expect(page.locator('#form-result')).toContainText('<img src=x');
    await expect(page.locator('#form-result img, #form-result script')).toHaveCount(0);

    // Help Desk
    await page.goto('helpdesk.html');
    const row = page.locator('tr[data-ticket="T-1006"]');
    await expect(row.locator('.ticket-description')).toHaveText(PAYLOADS.message);   // literal, unrendered
    await expect(row).toContainText('<img src=x onerror="window.__xss=1">Mallory');
    await expect(page.locator('#ticket-rows img, #ticket-rows svg, #ticket-rows script, #ticket-rows b, #ticket-rows a[href^="javascript"]')).toHaveCount(0);
    await expect(page.locator('#injected')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    // CRM lead list
    await page.goto('crm.html');
    await page.click('#tab-leads');
    await expect(page.locator('#lead-rows')).toContainText('<img src=x onerror="window.__xss=1">Mallory');
    await expect(page.locator('#lead-rows img, #lead-rows svg, #lead-rows script, #injected')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    // Automation outbox + log (the alert body contains the message)
    await page.goto('automation.html');
    await expect(page.locator('.outbox-item')).toContainText('<script>window.__xss=1</script>');
    await expect(page.locator('#main script, #main img, #main svg:not(.chart), #injected')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test('helpdesk form text is also rendered as plain text', async ({ page }) => {
    await page.goto('helpdesk.html');
    await page.fill('#requester', '<i id="x">Eve</i>');
    await page.fill('#title', '<img src=x onerror=window.__xss=1> broken');
    await page.click('#ticket-form button[type=submit]');
    await expect(page.locator('tr[data-ticket="T-1006"]')).toContainText('<img src=x onerror=window.__xss=1> broken');
    await expect(page.locator('#ticket-rows img, #ticket-rows i')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('CSV export neutralises spreadsheet formulas', async ({ page }) => {
    await page.goto('helpdesk.html');
    const csv = await page.evaluate(() => UI.toCsv([{ a: '=HYPERLINK("http://x")', b: '+1', c: 'ok' }], ['a', 'b', 'c']));
    expect(csv.split('\r\n')[1]).toBe(`"'=HYPERLINK(""http://x"")","'+1","ok"`);
  });
});

// ---------------------------------------------------------------------------
test.describe('2. Sales user cannot see the admin section', () => {
  test('Sales sees the directory but no admin section; IT does', async ({ page }) => {
    async function signIn(email, password) {
      await page.goto('staff.html');
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.demo-code') && document.querySelector('.demo-code').textContent !== '------');
      await page.fill('#login-email', email);
      await page.fill('#login-password', password);
      await page.click('#login-form button[type=submit]');
      const code = await page.evaluate((m) => Auth.totp(NL_SEED.staffSpec.find((s) => s.email === m).totpSecret), email);
      await page.fill('#mfa-code', code);
      await page.click('#mfa-form button[type=submit]');
      await expect(page.locator('#app-view')).toBeVisible();
    }
    await signIn('sofia.reyes@northlight.example', 'Demo-Pass-6!');          // Sales
    await expect(page.locator('#whoami')).toContainText('Sales');
    await expect(page.locator('#admin-section')).toHaveCount(0);
    await expect(page.locator('#joiner-form')).toHaveCount(0);
    await expect(page.getByText('Joiner: add an employee')).toHaveCount(0);
    await expect(page.locator('button', { hasText: /Disable/ })).toHaveCount(0);
    await signIn('jonas.berg@northlight.example', 'Demo-Pass-2!');           // IT
    await expect(page.locator('#admin-section')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
test.describe('3. empty forms show clear validation messages', () => {
  test('every form rejects empty input with visible, associated messages', async ({ page }) => {
    const cases = [
      { url: 'index.html#contact', submit: '#contact-form button[type=submit]', errors: ['#name-error', '#email-error', '#message-error'], input: '#name' },
      { url: 'helpdesk.html', submit: '#ticket-form button[type=submit]', errors: ['#requester-error', '#title-error'], input: '#requester' },
      { url: 'automation.html', submit: '#test-form button[type=submit]', errors: ['#t-name-error', '#t-email-error', '#t-message-error'], input: '#t-name' },
      { url: 'staff.html', submit: '#login-form button[type=submit]', errors: ['#login-email-error', '#login-password-error'], input: '#login-email' },
    ];
    for (const c of cases) {
      await page.goto(c.url);
      await page.click(c.submit);
      for (const e of c.errors) {
        await expect(page.locator(e), `${c.url} ${e}`).toBeVisible();
        expect((await page.locator(e).textContent()).trim().length).toBeGreaterThan(8);
      }
      await expect(page.locator(c.input)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator(c.input)).toHaveAttribute('aria-describedby', /error/);
    }
    // CRM has tabs
    await page.goto('crm.html');
    await page.click('#tab-leads');
    await page.click('#lead-form button[type=submit]');
    await expect(page.locator('#lead-name-error')).toBeVisible();
    await page.click('#tab-cases');
    await page.click('#case-form button[type=submit]');
    await expect(page.locator('#case-subject-error')).toBeVisible();
    // Joiner form (IT admin) is covered in staff.spec.js
  });
});

// ---------------------------------------------------------------------------
test.describe('4. Content Security Policy on every page', () => {
  test('there is at least one page to test', () => { expect(PAGES.length).toBeGreaterThanOrEqual(7); });

  for (const file of PAGES) {
    test(`${file} has a strict CSP meta tag, no inline code, and no CSP violations`, async ({ page }) => {
      const violations = [];
      page.on('console', (m) => { if (/content security policy/i.test(m.text())) violations.push(m.text()); });
      page.on('pageerror', (e) => violations.push(String(e)));

      await page.goto(file);
      const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
      expect(csp, `${file} is missing the CSP meta tag`).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);

      // The CSP must come before any script so it protects the whole page.
      const order = await page.evaluate(() => {
        const head = Array.from(document.head.children);
        const cspIdx = head.findIndex((n) => n.matches('meta[http-equiv="Content-Security-Policy"]'));
        const scriptIdx = head.findIndex((n) => n.tagName === 'SCRIPT' && n.src);
        return { cspIdx, scriptIdx };
      });
      expect(order.cspIdx).toBeGreaterThanOrEqual(0);
      if (order.scriptIdx >= 0) expect(order.cspIdx).toBeLessThan(order.scriptIdx);

      // No inline scripts (JSON-LD data blocks are fine), inline event handlers or style attributes.
      const inline = await page.evaluate(() => ({
        scripts: Array.from(document.scripts).filter((s) => !s.src && s.type !== 'application/ld+json').length,
        handlers: Array.from(document.querySelectorAll('*')).filter((n) => Array.from(n.attributes).some((a) => /^on/i.test(a.name))).length,
        styles: document.querySelectorAll('[style], style').length,
      }));
      expect(inline).toEqual({ scripts: 0, handlers: 0, styles: 0 });

      await page.waitForTimeout(400);                      // let page scripts run
      expect(violations).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
test.describe('5. no committed secrets', () => {
  test('repository scan finds no passwords, API keys or tokens', async ({}, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Repository scan only needs to run once.');
    const findings = scanRepo();
    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
  });

  test('the only credentials in the repo are the marked fictional demo ones', async ({}, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Repository scan only needs to run once.');
    const seed = fs.readFileSync(path.join(ROOT, 'js', 'seed.js'), 'utf8');
    const lines = seed.split('\n').filter((l) => /demoPassword|totpSecret/.test(l) && l.includes("'"));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toContain('fake-demo');
  });
});
