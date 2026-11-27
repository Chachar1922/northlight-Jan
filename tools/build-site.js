#!/usr/bin/env node
/**
 * Builds the publishable site into ./_site (used by the GitHub Pages deployment).
 * Copies only public files (no tests, tools, workflows or docs) and stamps the build date
 * into the COPY of health.json, so the repository file never changes during CI.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_site');
const DIRS = ['css', 'js', 'assets'];
const FILES = ['config.js', 'rules.json', 'health.json', 'northlight.cloud.json'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const f of fs.readdirSync(ROOT)) if (f.endsWith('.html')) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
for (const d of DIRS) fs.cpSync(path.join(ROOT, d), path.join(OUT, d), { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));

const health = JSON.parse(fs.readFileSync(path.join(OUT, 'health.json'), 'utf8'));
health.buildDate = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, 'health.json'), JSON.stringify(health, null, 2) + '\n');

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`Built ${count(OUT)} files into _site (buildDate ${health.buildDate}).`);
