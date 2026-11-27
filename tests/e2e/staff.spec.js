// Module 3 – staff directory, password + TOTP sign-in, role-based admin section, joiner/leaver.
const { test, expect } = require('@playwright/test');

/** Complete both sign-in steps. The TOTP code is computed in-page from the demo secret. */
async function signIn(page, email, password) {
  await page.goto('staff.html');
  await page.waitForFunction(() => document.querySelectorAll('.demo-code').length === 6 && document.querySelector('.demo-code').textContent !== '------');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-form button[type=submit]');
  await expect(page.locator('#mfa-form')).toBeVisible();
  const code = await page.evaluate(async (mail) => {
    const secret = NL_SEED.staffSpec.find((s) => s.email === mail).totpSecret;
    return Auth.totp(secret);
  }, email);
  await page.fill('#mfa-code', code);
  await page.click('#mfa-form button[type=submit]');
}

const IT = ['elena.marsh@northlight.example', 'Demo-Pass-1!'];
const SALES = ['tomas.hale@northlight.example', 'Demo-Pass-5!'];
const DESIGN = ['priya.nair@northlight.example', 'Demo-Pass-3!'];

test.describe('staff & MFA', () => {
  test('TOTP implementation matches the RFC 6238 test vector', async ({ page }) => {
    await page.goto('staff.html');
    // RFC 6238 secret "12345678901234567890" (base32), T=59s, 6 digits -> 287082
    const code = await page.evaluate(() => Auth.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000));
    expect(code).toBe('287082');
  });

  test('six fictional employees in three departments; passwords stored only as hashes', async ({ page }) => {
    await signIn(page, ...IT);
    await expect(page.locator('#staff-rows tr')).toHaveCount(6);
    const staff = await page.evaluate(() => Store.all('staff'));
    expect([...new Set(staff.map((s) => s.department))].sort()).toEqual(['Design', 'IT', 'Sales']);
    for (const s of staff) {
      expect(s.passwordHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(s)).not.toContain('Demo-Pass');
    }
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('Demo-Pass');
  });

  test('IT user sees the admin section', async ({ page }) => {
    await signIn(page, ...IT);
    await expect(page.locator('#admin-section')).toBeVisible();
    await expect(page.locator('#joiner-form')).toBeVisible();
  });

  test('Sales and Design users cannot see the admin section', async ({ page }) => {
    for (const creds of [SALES, DESIGN]) {
      await page.context().clearCookies();
      await page.goto('staff.html');
      await page.evaluate(() => sessionStorage.clear());
      await signIn(page, ...creds);
      await expect(page.locator('#staff-rows tr')).toHaveCount(6);
      await expect(page.locator('#admin-section')).toHaveCount(0);
      await expect(page.locator('#joiner-form')).toHaveCount(0);
      await expect(page.locator('#admin-mount')).toContainText('Admin section not available');
    }
  });

  test('wrong password and wrong code are rejected; empty forms validate', async ({ page }) => {
    await page.goto('staff.html');
    await page.click('#login-form button[type=submit]');
    await expect(page.locator('#login-email-error')).toBeVisible();
    await expect(page.locator('#login-password-error')).toBeVisible();
    await page.fill('#login-email', IT[0]);
    await page.fill('#login-password', 'wrong-password');
    await page.click('#login-form button[type=submit]');
    await expect(page.locator('#signin-result')).toContainText('Incorrect e-mail or password');
    await page.fill('#login-password', IT[1]);
    await page.click('#login-form button[type=submit]');
    await expect(page.locator('#mfa-form')).toBeVisible();
    await page.click('#mfa-form button[type=submit]');
    await expect(page.locator('#mfa-code-error')).toBeVisible();
    await page.fill('#mfa-code', '000000');
    await page.click('#mfa-form button[type=submit]');
    await expect(page.locator('#signin-result')).toContainText('not correct');
    await expect(page.locator('#app-view')).toBeHidden();
  });

  test('joiner creates a working account; leaver disables it and sign-in is refused', async ({ page }) => {
    await signIn(page, ...IT);
    await page.fill('#j-name', 'Maya Kovacs');
    await page.selectOption('#j-dept', 'Sales');
    await page.fill('#j-role', 'Account Executive');
    await page.click('#joiner-form button[type=submit]');
    await expect(page.locator('#admin-result')).toContainText('Maya Kovacs');
    const password = await page.locator('#temp-password').textContent();
    const secret = await page.locator('#temp-secret').textContent();
    await expect(page.locator('#staff-rows tr')).toHaveCount(7);
    // stored hashed, never plain
    expect(await page.evaluate(() => JSON.stringify(Store.all('staff')))).not.toContain(password);

    // Maya can sign in (new session context in the same browser storage).
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.fill('#login-email', 'maya.kovacs@northlight.example');
    await page.fill('#login-password', password);
    await page.click('#login-form button[type=submit]');
    await page.fill('#mfa-code', await page.evaluate((s) => Auth.totp(s), secret));
    await page.click('#mfa-form button[type=submit]');
    await expect(page.locator('#whoami')).toContainText('Maya Kovacs');
    await expect(page.locator('#admin-section')).toHaveCount(0);

    // IT disables Maya.
    await page.evaluate(() => sessionStorage.clear());
    await signIn(page, ...IT);
    page.once('dialog', (d) => d.accept());
    await page.click('button[aria-label="Disable Maya Kovacs"]');
    await expect(page.locator('#admin-result')).toContainText('sign-in is blocked');

    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.fill('#login-email', 'maya.kovacs@northlight.example');
    await page.fill('#login-password', password);
    await page.click('#login-form button[type=submit]');
    await expect(page.locator('#signin-result')).toContainText('disabled');
    await expect(page.locator('#mfa-form')).toBeHidden();
  });

  test('a disabled user with an open session loses access', async ({ page }) => {
    await signIn(page, ...SALES);
    await expect(page.locator('#whoami')).toContainText('Tomas Hale');
    await page.evaluate(() => Store.update('staff', 'E-1005', { status: 'Disabled' }));
    await page.reload();
    await expect(page.locator('#signin-view')).toBeVisible();
    await expect(page.locator('#app-view')).toBeHidden();
  });

  test('IT cannot disable the last active IT admin or themselves', async ({ page }) => {
    await signIn(page, ...IT);
    page.on('dialog', (d) => d.accept());
    await page.click('button[aria-label="Disable Jonas Berg"]');
    await page.click('button[aria-label="Disable Elena Marsh"]');
    await expect(page.locator('#admin-result')).toContainText('cannot disable your own account');
  });


  test('directory shows groups; joiner adds a group and requires MFA', async ({ page }) => {
    await signIn(page, ...IT);
    await expect(page.locator('tr[data-staff="E-1005"] .directory-groups')).toHaveText('Sales Team, All Staff');
    await expect(page.locator('tr[data-staff="E-1001"] .directory-groups')).toContainText('IT Admins');
    await expect(page.locator('#mfa-required-note')).toContainText('required');
    await page.fill('#j-name', 'Zoe Hart');
    await page.selectOption('#j-dept', 'Design');
    await expect(page.locator('#j-group')).toHaveValue('Design Team');      // department pre-selects its group
    await page.fill('#j-role', 'Motion Designer');
    await page.click('#joiner-form button[type=submit]');
    await expect(page.locator('#admin-result')).toContainText('Design / Design Team, All Staff');
    const zoe = await page.evaluate(() => Store.all('staff').find((x) => x.name === 'Zoe Hart'));
    expect(zoe.groups).toEqual(['Design Team', 'All Staff']);
    expect(zoe.mfaRequired).toBe(true);
    expect(zoe.role).toBe('Motion Designer');
  });

  test('leaver: sessions end live without a reload, and re-enabling does not revive them; record is kept', async ({ page }) => {
    await signIn(page, ...SALES);
    await expect(page.locator('#whoami')).toContainText('Tomas Hale');
    await page.evaluate(() => { Store.update('staff', 'E-1005', { status: 'Disabled' }); Auth.revokeSessions('E-1005'); });
    await expect(page.locator('#signin-view')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#signin-result')).toContainText('session was ended');
    await page.evaluate(() => Store.update('staff', 'E-1005', { status: 'Active' }));   // re-enabled
    expect(await page.evaluate(() => Auth.currentUser())).toBeNull();                     // old session stays dead
    expect(await page.evaluate(() => Store.get('staff', 'E-1005').name)).toBe('Tomas Hale'); // record kept
  });

  test('CSV import creates valid users, rejects bad rows, and never stores plain passwords', async ({ page }) => {
    await signIn(page, ...IT);
    await page.click('#csv-form button[type=submit]');
    await expect(page.locator('#csv-file-error')).toContainText('Choose a CSV file');
    const csv = [
      'name,department,role,email,group',
      'Ivy Chen,Design,Illustrator,,',
      '"Park, Jun",Sales,Account Executive,,Sales Team',
      'Bad Dept,Finance,Clerk,,',
      'X,Design,Intern,,',
      'Ivy Chen,Design,Duplicate,,',
    ].join('\n');
    await page.setInputFiles('#csv-file', { name: 'users.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.click('#csv-form button[type=submit]');
    await expect(page.locator('#csv-result')).toContainText('2 user(s) imported, 3 row(s) rejected');
    await expect(page.locator('#csv-errors li')).toHaveCount(3);
    await expect(page.locator('#csv-created tbody tr')).toHaveCount(2);
    const pw = await page.locator('#csv-created tbody tr').first().locator('td').nth(2).textContent();
    const staff = await page.evaluate(() => Store.all('staff'));
    expect(staff).toHaveLength(8);
    expect(JSON.stringify(staff)).not.toContain(pw);
    expect(staff.find((x) => x.name === 'Park, Jun').groups).toEqual(['Sales Team', 'All Staff']);
    // header validation
    await page.setInputFiles('#csv-file', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('foo,bar\n1,2') });
    await page.click('#csv-form button[type=submit]');
    await expect(page.locator('#csv-file-error')).toContainText('header row must contain');
  });

  test('page shows the learning-model warning', async ({ page }) => {
    await page.goto('staff.html');
    await expect(page.locator('.alert.warning')).toContainText('server-side');
  });
});
