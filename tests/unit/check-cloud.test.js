'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validate } = require('../../tools/check-cloud');

const ROOT = path.join(__dirname, '..', '..');
const good = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'northlight.cloud.json'), 'utf8'));
const run = (config) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-cloud-'));
  const file = path.join(dir, 'cloud.json');
  fs.writeFileSync(file, typeof config === 'string' ? config : JSON.stringify(config));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check-cloud.js'), file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
};

test('the committed northlight.cloud.json is valid and the CLI exits 0', () => {
  assert.deepEqual(validate(good()), []);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check-cloud.js')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PASS/);
});

test('a missing tag fails with exit code 1 and names the tag', () => {
  for (const tag of ['owner', 'env', 'cost-center']) {
    const c = good();
    delete c.resources[0].tags[tag];
    assert.ok(validate(c).some((e) => e.includes(`missing required tag "${tag}"`)), tag);
    const r = run(c);
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(`missing required tag "${tag}"`));
  }
});
test('an empty tag value counts as missing; resource group is checked too', () => {
  const c = good(); c.resourceGroup.tags.owner = '  ';
  assert.ok(validate(c).some((e) => e.includes('resourceGroup') && e.includes('owner')));
});
test('an invalid resource name fails', () => {
  const bad = [
    ['webApp', 'MyWebApp'], ['webApp', 'app-northlight-prod-1'], ['webApp', 'app-northlight-web-staging'], ['storage', 'st-northlight-prod'],
    ['storage', 'stNorthlight'], ['storage', 'st' + 'a'.repeat(23)],
  ];
  for (const [type, name] of bad) {
    const c = good();
    c.resources.find((r) => r.type === type).name = name;
    assert.ok(validate(c).some((e) => e.includes('invalid name')), `${type} ${name}`);
    assert.equal(run(c).status, 1);
  }
  const c = good(); c.resourceGroup.name = 'rg_northlight';
  assert.ok(validate(c).some((e) => e.includes('invalid name')));
});
test('inconsistent environment and bad tag values fail', () => {
  const c = good(); c.resources[0].tags.env = 'dev';
  assert.ok(validate(c).some((e) => e.includes('does not match environment')));
  const d = good(); d.resources[1].tags['cost-center'] = 'finance';
  assert.ok(validate(d).some((e) => e.includes('CC-1234')));
  const e = good(); e.resources[0].name = 'app-northlight-web-dev';
  assert.ok(validate(e).some((x) => x.includes('is for "dev"')));
});
test('missing resource types, duplicates and unreadable files fail', () => {
  const c = good(); c.resources = c.resources.filter((r) => r.type !== 'storage');
  assert.ok(validate(c).some((e) => e.includes('"storage" resource is required')));
  const d = good(); d.resources[1].name = d.resources[0].name;
  assert.ok(validate(d).some((e) => e.includes('Duplicate')));
  assert.equal(run('{ not json').status, 1);
  assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check-cloud.js'), path.join(os.tmpdir(), 'does-not-exist.json')]).status, 1);
});
test('configuration structure is validated', () => {
  assert.ok(validate({}).length >= 4);
  assert.ok(validate([]).length === 1);
  const c = good(); delete c.resourceGroup;
  assert.ok(validate(c).some((e) => e.includes('resourceGroup')));
  const d = good(); d.resources = 'nope';
  assert.ok(validate(d).some((e) => e.includes('"resources" array')));
  assert.equal(good().resourceGroup.name, 'rg-northlight-web-prod');
});
test('health.json has name, version and build date', () => {
  const h = JSON.parse(fs.readFileSync(path.join(ROOT, 'health.json'), 'utf8'));
  assert.ok(h.name && /^\d+\.\d+\.\d+$/.test(h.version) && /^\d{4}-\d{2}-\d{2}$/.test(h.buildDate));
});
