'use strict';
// The deploy build must version every local asset URL so browsers never mix old and new files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

test('build stamps ?v=<id> on every local css/js/asset reference in every page', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-site.js')], { encoding: 'utf8', env: { ...process.env, GITHUB_SHA: 'abcdef1234567890' } });
  assert.equal(r.status, 0, r.stderr);
  const pages = fs.readdirSync(path.join(ROOT, '_site')).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 7);
  for (const f of pages) {
    const html = fs.readFileSync(path.join(ROOT, '_site', f), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="((?:css[/]|js[/]|assets[/])[^"]+|config[.]js[^"]*)"/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, f);
    for (const ref of refs) assert.ok(ref.endsWith('?v=abcdef1234'), `${f}: ${ref} is not versioned`);
  }
  // the original pages are untouched and the published files exist
  assert.ok(!fs.readFileSync(path.join(ROOT, 'helpdesk.html'), 'utf8').includes('?v='));
  assert.ok(fs.existsSync(path.join(ROOT, '_site', 'js', 'tickets.js')));
});
