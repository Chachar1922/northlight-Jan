// Module 1 – Help Desk.
const { test, expect } = require('@playwright/test');

test.describe('help desk', () => {
  test('shows five sample tickets sorted by priority, with response targets and an overdue label', async ({ page }) => {
    await page.goto('helpdesk.html');
    const rows = page.locator('#ticket-rows tr');
    await expect(rows).toHaveCount(5);
    const priorities = await rows.locator('td:nth-child(2)').allTextContents();
    expect(priorities).toEqual(['P1', 'P1', 'P2', 'P3', 'P3']);
    await expect(page.locator('#priority-guide')).toContainText('respond within 1 hour');
    await expect(page.locator('#priority-guide')).toContainText('respond within 1 working day');
    await expect(page.locator('#priority-guide')).toContainText('respond within 3 working days');
    await expect(page.locator('tr[data-ticket="T-1004"] .badge.overdue')).toBeVisible();   // P1 incident open for 75 min (target 1 hour)
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

  test('the five sample tickets get the expected priorities', async ({ page }) => {
    await page.goto('helpdesk.html');
    const got = await page.evaluate(() => Object.fromEntries(Store.all('tickets').map((t) => [t.id, t.priority])));
    expect(got).toEqual({ 'T-1001': 'P1', 'T-1002': 'P3', 'T-1003': 'P2', 'T-1004': 'P1', 'T-1005': 'P3' });
    // priorities are not just stored: they follow from impact + urgency
    const computed = await page.evaluate(() => Store.all('tickets').map((t) => Tickets.computePriority(t.impact, t.urgency) === t.priority));
    expect(computed.every(Boolean)).toBe(true);
  });

  test('only the security incident ticket shows incident response steps', async ({ page }) => {
    await page.goto('helpdesk.html');
    await expect(page.locator('.incident-guide')).toHaveCount(1);
    const guide = page.locator('tr[data-ticket="T-1004"] .incident-guide');
    await expect(guide).toContainText('Isolate the affected device');
    await expect(guide).toContainText('Do not delete the suspicious email');
    await expect(guide).toContainText('Warn staff');
    await expect(guide).toContainText('Escalate');
  });

  test('response targets: P1 1 hour, P2 1 working day, P3 3 working days (weekends skipped)', async ({ page }) => {
    await page.goto('helpdesk.html');
    const r = await page.evaluate(() => {
      const fri = '2026-11-27T10:00:00';        // a Friday (local time)
      const day = (iso) => new Date(iso).getDay();
      const date = (iso) => new Date(iso).getDate();
      return {
        p1h: (new Date(Tickets.dueAtFor(fri, 'P1')) - new Date(fri)) / 3600000,
        p2: [day(Tickets.dueAtFor(fri, 'P2')), date(Tickets.dueAtFor(fri, 'P2'))],        // Monday 30th
        p3: [day(Tickets.dueAtFor(fri, 'P3')), date(Tickets.dueAtFor(fri, 'P3'))],        // Wednesday 2nd
        thu: [day(Tickets.addWorkingDays('2026-11-26T10:00:00', 3)), date(Tickets.addWorkingDays('2026-11-26T10:00:00', 3))], // Tuesday 1st
      };
    });
    expect(r.p1h).toBe(1);
    expect(r.p2).toEqual([1, 30]);
    expect(r.p3).toEqual([3, 2]);
    expect(r.thu).toEqual([2, 1]);
  });

  test('replies are added to ticket history, persist, and are plain text', async ({ page }) => {
    await page.goto('helpdesk.html');
    await page.locator('tr[data-ticket="T-1002"] .ticket-thread summary').click();
    await page.fill('#reply-T-1002', 'Checked the toner <b id="x">now</b>.');
    await page.click('tr[data-ticket="T-1002"] .thread-form button');
    await page.reload();
    const thread = page.locator('tr[data-ticket="T-1002"] .ticket-thread');
    await thread.locator('summary').click();
    await expect(thread.locator('.thread-item.reply')).toContainText('Checked the toner <b id="x">now</b>.');
    await expect(thread.locator('#x')).toHaveCount(0);
    await expect(thread.locator('summary')).toContainText('(2)');
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
    await expect(page.locator('#ticket-rows tr')).toHaveCount(1);
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
