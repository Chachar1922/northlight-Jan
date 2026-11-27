#!/usr/bin/env node
/**
 * Network doctor (read-only). Steps, in the order a technician would check them:
 *   1. Is there a network connection?
 *   2. Does the computer have an IP address?
 *   3. Does the default gateway (router) answer a ping?
 *   4. Does 1.1.1.1 answer a ping (internet by IP address)?
 *   5. Does a domain name resolve (DNS)?
 * The first failing step is the most likely place to start fixing.
 * Exit code: 1 if any step fails, otherwise 0.
 *
 * Usage:  node tools/network-doctor.js [--json] [--save]
 *          --save writes a dated report file into ./reports (nothing else is written).
 */
'use strict';
const { runNetworkDoctor } = require('./lib/diagnostics');
const { printChecks, formatChecks, saveReport, wrap, paint } = require('./lib/report');

(async () => {
  const report = await runNetworkDoctor();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printChecks('Northlight network doctor (read-only)', report.steps);
    console.log('');
    if (report.firstFailure) {
      console.log(paint('31;1', `First failing step: ${report.firstFailure.name}`));
      console.log(wrap(report.firstFailure.meaning, '  '));
    } else {
      console.log(paint('32;1', 'All steps passed. The network path looks healthy.'));
      console.log(wrap('If a single website still fails, the problem is with that site or the browser, not your connection.', '  '));
    }
    console.log('\nThis tool only reads information and sends a few ping packets. It never changes settings.\n');
  }
  if (process.argv.includes('--save')) console.log(`Report saved: ${saveReport('network-doctor', formatChecks('Northlight network doctor report', report.steps, [report.firstFailure ? `First failing step: ${report.firstFailure.name}` : 'All steps passed.']))}`);
  process.exitCode = report.firstFailure ? 1 : 0;
})();
