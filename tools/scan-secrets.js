#!/usr/bin/env node
/**
 * Simple secret scanner for this repository (read-only).
 * Looks for private keys, well-known token formats and hard-coded password/secret/token assignments
 * in every file that is (or would be) committed. Lines that carry the marker "fake-demo" are
 * intentional, fictional demo credentials and are allowed.
 *
 * Usage: node tools/scan-secrets.js      (exit code 1 when something suspicious is found)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ALLOW_MARKER = 'fake-demo';
const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', '_site']);
const SKIP_FILES = new Set(['package-lock.json']);
const BINARY = /\.(png|jpe?g|gif|ico|woff2?|zip|pdf)$/i;

const PATTERNS = [
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'secret-key style token', re: /\bsk-[A-Za-z0-9]{24,}\b/ },
  { name: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'URL with embedded credentials', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"]+:[^\s/@'"]{3,}@[^\s'"]+/i },
  { name: 'hard-coded credential assignment', re: /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*["']?\s*[:=]\s*["'][^"'\s]{6,}["']/i },
];

/** Files that git tracks or would add (respects .gitignore). Falls back to a directory walk without git. */
function candidateFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
    return out.split('\0').filter(Boolean);
  } catch {
    const files = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full); else files.push(path.relative(ROOT, full));
      }
    })(ROOT);
    return files;
  }
}

/** Scan text and return findings [{line, rule, text}]. Pure, so the unit test can call it directly. */
function scanText(text) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const p of PATTERNS) if (p.re.test(line)) findings.push({ line: i + 1, rule: p.name, text: line.trim().slice(0, 80) });
  });
  return findings;
}

function scanRepo() {
  const findings = [];
  for (const rel of candidateFiles()) {
    const base = path.basename(rel);
    if (!fs.existsSync(path.join(ROOT, rel))) continue;      // deleted but still listed
    if (SKIP_FILES.has(base) || BINARY.test(base) || rel.split(/[\\/]/).some((p) => SKIP_DIRS.has(p))) continue;
    if (/^\.env(\.|$)/.test(base) || /\.(pem|key|p12|pfx)$/i.test(base)) { findings.push({ file: rel, line: 0, rule: 'sensitive file type should not be committed', text: base }); continue; }
    let text;
    try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    scanText(text).forEach((f) => findings.push(Object.assign({ file: rel }, f)));
  }
  return findings;
}

if (require.main === module) {
  const findings = scanRepo();
  if (findings.length) {
    console.error(`FAIL: ${findings.length} possible secret(s):`);
    findings.forEach((f) => console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.text}`));
    process.exitCode = 1;
  } else console.log('PASS: no committed secrets found.');
}
module.exports = { scanText, scanRepo, PATTERNS };
