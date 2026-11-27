'use strict';
// Proves the secret scanner catches secrets. Sample "secrets" are assembled at runtime so that
// no secret-looking string is committed in this file.
const test = require('node:test');
const assert = require('node:assert/strict');
const { scanText } = require('../../tools/scan-secrets');

const rules = (text) => scanText(text).map((f) => f.rule);

test('detects common secret shapes', () => {
  assert.ok(rules('-----BEGIN ' + 'PRIVATE KEY-----').includes('private key block'));
  assert.ok(rules('key = AKIA' + 'ABCDEFGHIJKLMNOP').includes('AWS access key id'));
  assert.ok(rules('t = ghp_' + 'a'.repeat(36)).includes('GitHub token'));
  assert.ok(rules('const password = "' + 'hunter2hunter2' + '";').includes('hard-coded credential assignment'));
  assert.ok(rules("api_key: '" + 'abcdef123456' + "'").includes('hard-coded credential assignment'));
  assert.ok(rules('db = "postgres://admin:' + 'p4ssw0rd' + '@db.example.com/app"').includes('URL with embedded credentials'));
});
test('ignores harmless text and allow-listed fake demo credentials', () => {
  assert.deepEqual(scanText('const label = "Password";\nfunction checkPassword(password) {}'), []);
  assert.deepEqual(scanText("demoPassword: 'Demo-Pass-1!', // fake-demo"), []);
  assert.deepEqual(scanText('See https://example.com/docs for details'), []);
});
