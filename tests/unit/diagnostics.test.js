'use strict';
// Unit tests for the read-only diagnostic tools. They use FAKE command output (tests/fixtures/outputs.json),
// so they behave the same on Windows, Linux and macOS and never touch the real system.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../../tools/lib/diagnostics');
const F = require('../fixtures/outputs.json');

const GB = 1024 ** 3;
const NOW = new Date('2026-11-27T12:00:00Z');

/** Fake command runner: routes by "program arg arg" substring; an Error value simulates a failing command. */
function fakeExec(routes) {
  return (cmd, args) => {
    const line = `${cmd} ${args.join(' ')}`;
    for (const [match, out] of routes) {
      if (line.includes(match)) {
        if (out instanceof Error) { const e = out; e.stdout = e.stdout || ''; throw e; }
        return out;
      }
    }
    throw new Error(`unexpected command in test: ${line}`);
  };
}
const nic = (address, extra = {}) => ({ eth0: [Object.assign({ address, family: 'IPv4', internal: false }, extra)], lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] });

// ---------------------------------------------------------------- parsers
test('parsers understand fake firewall output', () => {
  assert.equal(D.parseWindowsFirewall(F.winFirewallAllOn).allOn, true);
  assert.equal(D.parseWindowsFirewall(F.winFirewallPublicOff).allOn, false);
  assert.equal(D.parseWindowsFirewall('garbage'), null);
  assert.equal(D.parseUfw(F.ufwActive), true);
  assert.equal(D.parseUfw(F.ufwInactive), false);
  assert.equal(D.parseUfw('nonsense'), null);
  assert.equal(D.parseFirewalld(F.firewalldRunning), true);
  assert.equal(D.parseFirewalld(F.firewalldStopped), false);
  assert.equal(D.parseSocketFilter(F.macFirewallOn), true);
  assert.equal(D.parseSocketFilter(F.macFirewallOff), false);
});
test('parsers understand fake update and route output', () => {
  assert.equal(D.parseAptUpgradable(F.aptNone), 0);
  assert.equal(D.parseAptUpgradable(F.aptSome), 2);
  assert.equal(D.parseMacSoftwareUpdate(F.macUpdatesNone), 0);
  assert.equal(D.parseMacSoftwareUpdate(F.macUpdatesSome), 1);
  assert.equal(D.parseGatewayLinux(F.linuxRoute), '192.168.1.1');
  assert.equal(D.parseGatewayMac(F.macRoute), '10.0.0.1');
  assert.equal(D.parseGatewayWindows(F.winGateway), '192.168.1.254');
  assert.equal(D.parseGatewayWindows(F.winGatewayOnLink), null);
  assert.equal(D.parseIsoDate(F.winHotfixRecent).getUTCFullYear(), 2026);
});
test('parsePing: success needs a real reply, not just exit code', () => {
  assert.deepEqual(D.parsePing(F.pingWinOk), { success: true, timeMs: 2 });
  assert.equal(D.parsePing(F.pingWinUnreachable).success, false);   // "Reply from" but unreachable
  assert.equal(D.parsePing(F.pingWinTimeout).success, false);
  assert.equal(D.parsePing(F.pingLinuxOk).success, true);
  assert.equal(D.parsePing(F.pingLinuxOk).timeMs, 11.3);
  assert.equal(D.parsePing(F.pingLinuxLoss).success, false);
});

// ---------------------------------------------------------------- PC health
test('operating system check', () => {
  assert.equal(D.checkOs({ platform: 'win32', release: '10.0.1', arch: 'x64' }).status, 'PASS');
  assert.equal(D.checkOs({ platform: 'plan9', release: '1', arch: 'x64' }).status, 'FAIL');
});
test('disk check: PASS with room, FAIL when low, SKIP when unreadable', () => {
  assert.equal(D.checkDisk({ freeBytes: 100 * GB, totalBytes: 500 * GB }).status, 'PASS');
  assert.equal(D.checkDisk({ freeBytes: 5 * GB, totalBytes: 500 * GB }).status, 'FAIL');
  assert.equal(D.checkDisk({ freeBytes: 40 * GB, totalBytes: 500 * GB }).status, 'FAIL');   // 8% free
  assert.equal(D.checkDisk({ freeBytes: NaN, totalBytes: 0 }).status, 'SKIP');
});
test('firewall check on Windows, macOS and Linux', () => {
  assert.equal(D.checkFirewall('win32', fakeExec([['Get-NetFirewallProfile', F.winFirewallAllOn]])).status, 'PASS');
  const off = D.checkFirewall('win32', fakeExec([['Get-NetFirewallProfile', F.winFirewallPublicOff]]));
  assert.equal(off.status, 'FAIL');
  assert.match(off.detail, /Public: OFF/);
  assert.equal(D.checkFirewall('win32', fakeExec([['Get-NetFirewallProfile', new Error('denied')]])).status, 'SKIP');
  assert.equal(D.checkFirewall('darwin', fakeExec([['--getglobalstate', F.macFirewallOn]])).status, 'PASS');
  assert.equal(D.checkFirewall('darwin', fakeExec([['--getglobalstate', F.macFirewallOff]])).status, 'FAIL');
  assert.equal(D.checkFirewall('linux', fakeExec([['ufw status', F.ufwActive]])).status, 'PASS');
  assert.equal(D.checkFirewall('linux', fakeExec([['ufw status', F.ufwInactive]])).status, 'FAIL');
  // ufw missing -> falls back to firewalld
  assert.equal(D.checkFirewall('linux', fakeExec([['ufw status', new Error('not found')], ['--state', F.firewalldRunning]])).status, 'PASS');
  assert.equal(D.checkFirewall('linux', fakeExec([['ufw status', new Error('x')], ['--state', new Error('y')]])).status, 'SKIP');
});
test('update check on Windows, Linux and macOS', () => {
  assert.equal(D.checkUpdates('win32', fakeExec([['Get-HotFix', F.winHotfixRecent]]), NOW).status, 'PASS');
  assert.equal(D.checkUpdates('win32', fakeExec([['Get-HotFix', F.winHotfixOld]]), NOW).status, 'FAIL');
  assert.equal(D.checkUpdates('win32', fakeExec([['Get-HotFix', new Error('x')]]), NOW).status, 'SKIP');
  assert.equal(D.checkUpdates('linux', fakeExec([['apt list', F.aptNone]]), NOW).status, 'PASS');
  assert.equal(D.checkUpdates('linux', fakeExec([['apt list', F.aptSome]]), NOW).status, 'FAIL');
  assert.equal(D.checkUpdates('darwin', fakeExec([['softwareupdate', F.macUpdatesNone]]), NOW).status, 'PASS');
  assert.equal(D.checkUpdates('darwin', fakeExec([['softwareupdate', F.macUpdatesSome]]), NOW).status, 'FAIL');
});
test('runPcHealth aggregates checks and counts failures', () => {
  const exec = fakeExec([['Get-NetFirewallProfile', F.winFirewallPublicOff], ['Get-HotFix', F.winHotfixRecent]]);
  const r = D.runPcHealth({ platform: 'win32', exec, now: NOW, system: { platform: 'win32', release: '10', arch: 'x64' }, disk: { freeBytes: 200 * GB, totalBytes: 500 * GB } });
  assert.deepEqual(r.checks.map((c) => c.status), ['PASS', 'PASS', 'FAIL', 'PASS']);
  assert.equal(r.failed, 1);
  for (const c of r.checks) assert.ok(c.meaning.length > 20, 'every result explains what it means');
});

// ---------------------------------------------------------------- network doctor
const lookupOk = async () => ({ address: '93.184.216.34', family: 4 });
const lookupFail = async () => { const e = new Error('getaddrinfo ENOTFOUND'); e.code = 'ENOTFOUND'; throw e; };
const linuxOk = [['ip route', F.linuxRoute], ['192.168.1.1', F.pingLinuxOk], ['1.1.1.1', F.pingLinuxOk]];

test('network doctor: healthy network passes every step', async () => {
  const r = await D.runNetworkDoctor({ platform: 'linux', interfaces: nic('192.168.1.50'), exec: fakeExec(linuxOk), lookup: lookupOk });
  assert.deepEqual(r.steps.map((s) => s.status), ['PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
  assert.equal(r.firstFailure, null);
});
test('network doctor: no connection -> step 1 is the first failure', async () => {
  const r = await D.runNetworkDoctor({ platform: 'linux', interfaces: { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }, exec: fakeExec([['ip route', new Error('x')], ['1.1.1.1', F.pingLinuxLoss]]), lookup: lookupFail });
  assert.equal(r.firstFailure.id, 'connection');
});
test('network doctor: 169.254.x.x address -> step 2 (no DHCP) is the first failure', async () => {
  const r = await D.runNetworkDoctor({ platform: 'linux', interfaces: nic('169.254.10.20'), exec: fakeExec([['ip route', new Error('x')], ['1.1.1.1', F.pingLinuxLoss]]), lookup: lookupFail });
  assert.equal(r.steps[0].status, 'PASS');
  assert.equal(r.firstFailure.id, 'ip');
  assert.match(r.firstFailure.meaning, /169\.254/);
});
test('network doctor: router down -> step 3 fails first', async () => {
  const exec = fakeExec([['ip route', F.linuxRoute], ['192.168.1.1', F.pingLinuxLoss], ['1.1.1.1', F.pingLinuxLoss]]);
  const r = await D.runNetworkDoctor({ platform: 'linux', interfaces: nic('192.168.1.50'), exec, lookup: lookupFail });
  assert.equal(r.firstFailure.id, 'gateway');
});
test('network doctor: router OK but internet down -> step 4', async () => {
  const exec = fakeExec([['ip route', F.linuxRoute], ['192.168.1.1', F.pingLinuxOk], ['1.1.1.1', F.pingLinuxLoss]]);
  const r = await D.runNetworkDoctor({ platform: 'linux', interfaces: nic('192.168.1.50'), exec, lookup: lookupFail });
  assert.equal(r.firstFailure.id, 'internet');
});
test('network doctor: pings work but names do not -> DNS problem (step 5)', async () => {
  const r = await D.runNetworkDoctor({ platform: 'linux', interfaces: nic('192.168.1.50'), exec: fakeExec(linuxOk), lookup: lookupFail });
  assert.equal(r.firstFailure.id, 'dns');
  assert.match(r.firstFailure.meaning, /DNS problem/);
});
test('network doctor: router ignoring ping while internet works is not reported as a failure', async () => {
  const exec = fakeExec([['ip route', F.linuxRoute], ['192.168.1.1', F.pingLinuxLoss], ['1.1.1.1', F.pingLinuxOk]]);
  const r = await D.runNetworkDoctor({ platform: 'linux', interfaces: nic('192.168.1.50'), exec, lookup: lookupOk });
  assert.equal(r.steps[2].status, 'SKIP');
  assert.equal(r.firstFailure, null);
});
test('network doctor works with Windows and macOS commands', async () => {
  const win = fakeExec([['Get-NetRoute', F.winGateway], ['-n 1 -w 2000 192.168.1.254', F.pingWinOk], ['-n 1 -w 2000 1.1.1.1', F.pingWinOk]]);
  assert.equal((await D.runNetworkDoctor({ platform: 'win32', interfaces: nic('192.168.1.10'), exec: win, lookup: lookupOk })).firstFailure, null);
  const mac = fakeExec([['route -n get default', F.macRoute], ['-t 2 10.0.0.1', F.pingLinuxOk], ['-t 2 1.1.1.1', F.pingLinuxOk]]);
  assert.equal((await D.runNetworkDoctor({ platform: 'darwin', interfaces: nic('10.0.0.5'), exec: mac, lookup: lookupOk })).firstFailure, null);
});

// ---------------------------------------------------------------- safety
test('safety: only allow-listed commands can run, and ping refuses non-IPv4 input', () => {
  assert.throws(() => D.realExec('rm', ['-rf', '/']), /not allowed/);
  assert.throws(() => D.realExec('netsh', ['advfirewall', 'set', 'allprofiles', 'state', 'off']), /not allowed/);
  assert.throws(() => D.pingArgs('linux', '1.1.1.1; rm -rf /'), /non-IPv4/);
  assert.deepEqual(D.pingArgs('win32', '1.1.1.1'), ['-n', '1', '-w', '2000', '1.1.1.1']);
});
test('safety: tool source contains no state-changing commands', () => {
  const files = ['tools/lib/diagnostics.js', 'tools/pc-health.js', 'tools/network-doctor.js'];
  const forbidden = /\b(Set|New|Remove|Disable|Enable|Stop|Restart|Start|Clear|Add|Install)-[A-Z]\w+|\bwriteFile|\bunlink|\brmSync|\bmkdir|\bnetsh\b|\bsudo\b/;
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
    const hit = forbidden.exec(src);
    assert.equal(hit, null, `${f} contains "${hit && hit[0]}"`);
  }
});
