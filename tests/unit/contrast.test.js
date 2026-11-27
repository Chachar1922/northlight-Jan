'use strict';
// Colour contrast check (WCAG 2.1) for the design tokens in css/base.css.
// Text needs 4.5:1; large text and UI boundaries need 3:1.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'base.css'), 'utf8');
const root = /:root\s*\{([\s\S]*?)\}/.exec(css)[1];
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(root);
  assert.ok(m, `token --${name} not found`);
  return m[1];
};
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// [foreground, background, minimum ratio, description]
const PAIRS = [
  ['text', 'bg', 4.5, 'body text on paper'], ['text', 'surface', 4.5, 'body text on raised paper'],
  ['muted', 'bg', 4.5, 'muted text on paper'], ['muted', 'surface', 4.5, 'muted text on raised paper'],
  ['ink', 'bg', 4.5, 'headings and links on paper'], ['ink', 'accent', 4.5, 'button text on amber'],
  ['kicker', 'bg', 4.5, 'kicker text on paper'],
  ['ok', 'ok-bg', 4.5, 'success badge'], ['warn', 'warn-bg', 4.5, 'warning badge'],
  ['danger', 'danger-bg', 4.5, 'danger badge'], ['info', 'info-bg', 4.5, 'info badge'],
  ['danger', 'surface', 4.5, 'error text on raised paper'],
  ['ink', 'paper-tint', 4.5, 'table header text'],
  ['ink', 'field', 3, 'input border on white (UI component)'], ['ink', 'bg', 3, 'card border on paper (UI component)'],
];

for (const [fg, bg, min, what] of PAIRS) {
  test(`contrast: ${what} (${fg} on ${bg}) is at least ${min}:1`, () => {
    const r = ratio(token(fg), token(bg));
    assert.ok(r >= min, `${fg} ${token(fg)} on ${bg} ${token(bg)} = ${r.toFixed(2)}:1 (< ${min})`);
  });
}
test('light text on the navy header meets 4.5:1', () => {
  assert.ok(ratio('#E9E3D4', token('ink')) >= 4.5);
  assert.ok(ratio('#C9D3E0', token('ink')) >= 4.5);
  assert.ok(ratio('#FFFBF2', token('danger')) >= 4.5, 'overdue badge text');
});
