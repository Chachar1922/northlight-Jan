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
module.exports = { printChecks, wrap, paint, badge };
