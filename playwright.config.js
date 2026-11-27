// @ts-check
/**
 * Playwright configuration.
 *  - BASE_URL env var selects the site under test (e.g. the deployed GitHub Pages URL).
 *  - Without BASE_URL, a local static server (tools/serve.js) is started automatically.
 *  - Safety: tests only run against localhost or hosts you explicitly authorise via
 *    AUTHORISED_HOSTS (comma-separated, e.g. "chachar1922.github.io"). Anything else is refused.
 */
const { defineConfig, devices } = require('@playwright/test');

const LOCAL_PORT = process.env.PORT || '4173';
const usingLocalServer = !process.env.BASE_URL;
let baseURL = process.env.BASE_URL || `http://localhost:${LOCAL_PORT}/`;
if (!baseURL.endsWith('/')) baseURL += '/';   // relative page.goto('index.html') needs a trailing slash

const host = new URL(baseURL).hostname;
const authorised = (process.env.AUTHORISED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
if (!['localhost', '127.0.0.1'].includes(host) && !authorised.includes(host.toLowerCase())) {
  throw new Error(`Refusing to test "${host}": it is not localhost and not listed in AUTHORISED_HOSTS. Only test sites you own or are authorised to test.`);
}

module.exports = defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: usingLocalServer
    ? { command: 'node tools/serve.js', url: `http://localhost:${LOCAL_PORT}/`, reuseExistingServer: !process.env.CI, env: { PORT: LOCAL_PORT }, timeout: 30000 }
    : undefined,
});
