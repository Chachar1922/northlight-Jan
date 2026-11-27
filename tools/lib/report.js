'use strict';
/** Console formatting shared by the CLI tools. */
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColour ? `\x1b[${code}m${s}\x1b[0m` : s);
const badge = (status) => (status === 'PASS' ? paint('32;1', 'PASS') : status === 'FAIL' ? paint('31;1', 'FAIL') : paint('33;1', 'SKIP'));

function wrap(text, indent = '        ', width = 88) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width - indent.length) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join('\n');
}

function printChecks(title, checks) {
  console.log(`\n${paint('1', title)}\n${'='.repeat(title.length)}`);
  for (const c of checks) {
    console.log(`\n[${badge(c.status)}] ${c.name}`);
    console.log(`        ${c.detail}`);
    console.log(wrap(`What it means: ${c.meaning}`));
  }
}
/** Plain-text version of a report (no colours), used for saved files. */
function formatChecks(title, checks, extra = []) {
  const lines = [title, '='.repeat(title.length), `Generated: ${new Date().toISOString()}`];
  for (const c of checks) lines.push('', `[${c.status}] ${c.name}`, `        ${c.detail}`, wrap(`What it means: ${c.meaning}`));
  return lines.concat(extra, ['']).join('\n');
}

/**
 * Save a report as a dated file in ./reports (only when the user passes --save).
 * This writes ONE new text file inside the project folder. It never changes system settings.
 */
function saveReport(kind, text, dir = require('node:path').join(__dirname, '..', '..', 'reports'), now = new Date()) {
  const fs = require('node:fs');
  const path = require('node:path');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 19);       // 2026-11-27-14-05-09
  const file = path.join(dir, `${kind}-${stamp}.txt`);
  fs.writeFileSync(file, text, { flag: 'wx' });                              // never overwrite an existing report
  return file;
}
module.exports = { printChecks, formatChecks, saveReport, wrap, paint, badge };
