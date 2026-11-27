#!/usr/bin/env node
/**
 * PC health report (read-only).
 * Checks: operating system, free disk space, firewall status, update status.
 * Prints PASS / FAIL / SKIP (SKIP = the information is not available on this system).
 * Exit code: 1 if any check FAILS, otherwise 0.
 *
 * Usage:  node tools/pc-health.js [--json] [--save]
 *          --save writes a dated report file into ./reports (nothing else is written).
 */
'use strict';
const { runPcHealth } = require('./lib/diagnostics');
const { printChecks, formatChecks, saveReport, wrap } = require('./lib/report');

const report = runPcHealth();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printChecks('Northlight PC health report (read-only)', report.checks);
  const skipped = report.checks.filter((c) => c.status === 'SKIP').length;
  console.log(`\nSummary: ${report.checks.length - report.failed - skipped} passed, ${report.failed} failed, ${skipped} skipped.`);
  if (skipped) console.log(wrap('SKIP means the information could not be read on this computer (missing tool or permissions). It is not a pass.', ''));
  console.log('This tool only reads information. It never changes settings.\n');
}
if (process.argv.includes('--save')) console.log(`Report saved: ${saveReport('pc-health', formatChecks('Northlight PC health report', report.checks, [`Summary: ${report.failed} failed.`]))}`);
process.exitCode = report.failed ? 1 : 0;
