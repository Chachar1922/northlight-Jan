'use strict';
/**
 * Read-only diagnostics shared by tools/pc-health.js and tools/network-doctor.js.
 *
 * SAFETY RULES
 *  - Only READ information. No command here changes a setting, writes a file or installs anything.
 *  - Commands are never run through a shell (execFile, no string concatenation) and must be on ALLOWED.
 *  - Every check takes its inputs (platform, command runner, interfaces ...) as parameters, so the unit
 *    tests can feed FAKE command output and run identically on Windows, Linux and macOS.
 *
 * Status values: PASS, FAIL, or SKIP (the information is not available on this system).
 */
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const GB = 1024 ** 3;
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const isIPv4 = (s) => IPV4.test(String(s || '').trim());

/** The only programs these tools may start. All are used with read-only arguments. */
const ALLOWED = new Set([
  'powershell', 'ping', 'ip', 'route', 'ufw', 'firewall-cmd', 'apt', 'softwareupdate',
  '/usr/libexec/ApplicationFirewall/socketfilterfw',
]);

/** Real command runner. Returns stdout; throws (with .stdout attached) on failure or timeout. */
function realExec(cmd, args, timeoutMs = 20000) {
  if (!ALLOWED.has(cmd)) throw new Error(`Command not allowed: ${cmd}`);
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}
/** Run a command; never throws. */
function tryRun(exec, cmd, args) {
  try { return { ok: true, out: String(exec(cmd, args)) }; }
  catch (e) { return { ok: false, out: String((e && e.stdout) || ''), error: e && e.message }; }
}
const ps = (script) => ['-NoProfile', '-NonInteractive', '-Command', script];

const result = (id, name, status, detail, meaning) => ({ id, name, status, detail, meaning });

// ===========================================================================
// Parsers (pure functions – unit-tested with fake output)
// ===========================================================================
/** Windows: Get-NetFirewallProfile | Select Name,Enabled | ConvertTo-Json  (Enabled may be true/false or 1/0/2). */
function parseWindowsFirewall(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(data) ? data : [data];
  const profiles = list.filter((p) => p && p.Name).map((p) => ({ name: String(p.Name), enabled: p.Enabled === true || p.Enabled === 1 || p.Enabled === '1' || /^true$/i.test(String(p.Enabled)) }));
  return profiles.length ? { profiles, allOn: profiles.every((p) => p.enabled) } : null;
}
const parseUfw = (t) => (/^Status:\s*(\w+)/mi.exec(t) ? /^Status:\s*active/mi.test(t) : null);
const parseFirewalld = (t) => (/not running/i.test(t) ? false : /running/i.test(t) ? true : null);
function parseSocketFilter(t) {
  if (/State\s*=\s*([12])/i.test(t) || /enabled/i.test(t)) return true;
  if (/State\s*=\s*0/i.test(t) || /disabled/i.test(t)) return false;
  return null;
}
/** First ISO-like date in the text, or null. */
function parseIsoDate(t) { const d = new Date(String(t).trim().split(/\s+/)[0]); return isNaN(d) ? null : d; }
const parseAptUpgradable = (t) => (t.match(/\[upgradable from:/g) || []).length;
function parseMacSoftwareUpdate(t) {
  if (/No new software available/i.test(t)) return 0;
  const n = (t.match(/^\s*\*\s+/gm) || []).length;
  return n || null;
}
const parseGatewayLinux = (t) => { const m = /^default via (\S+)/m.exec(t); return m && isIPv4(m[1]) ? m[1] : null; };
const parseGatewayMac = (t) => { const m = /gateway:\s*(\S+)/i.exec(t); return m && isIPv4(m[1]) ? m[1] : null; };
const parseGatewayWindows = (t) => { const v = String(t).trim().split(/\s+/)[0]; return isIPv4(v) && v !== '0.0.0.0' ? v : null; };
/** A ping succeeded only if a reply with a TTL arrived (exit codes are unreliable on Windows). */
function parsePing(text) {
  const ttl = /ttl[=:]\s*\d+/i.test(text);
  const t = /(?:time|čas)[=<]\s*([\d.,]+)\s*ms/i.exec(text);
  const unreachable = /unreachable|timed out|100% (?:packet )?loss|100,0% loss/i.test(text);
  return { success: ttl && !unreachable, timeMs: t ? Number(t[1].replace(',', '.')) : null };
}

// ===========================================================================
// PC health checks
// ===========================================================================
function checkOs({ platform, release, version, arch }) {
  const names = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' };
  const known = names[platform];
  const detail = `${known || platform} ${release || ''} (${arch || 'unknown arch'})${version ? ' – ' + String(version).slice(0, 60) : ''}`.trim();
  return known
    ? result('os', 'Operating system', 'PASS', detail, 'A supported operating system was detected. Keeping it on a vendor-supported version is what protects you from known flaws.')
    : result('os', 'Operating system', 'FAIL', detail, 'This operating system is not one the tool recognises; its support status could not be confirmed.');
}

/** Fails below 10 GB free or below 10% free. */
function checkDisk({ freeBytes, totalBytes, label = 'system drive' }) {
  if (!Number.isFinite(freeBytes) || !totalBytes) return result('disk', 'Free disk space', 'SKIP', 'Could not read disk information.', 'Disk space could not be measured on this system.');
  const pct = (freeBytes / totalBytes) * 100;
  const detail = `${(freeBytes / GB).toFixed(1)} GB free of ${(totalBytes / GB).toFixed(1)} GB on ${label} (${pct.toFixed(0)}%)`;
  const ok = freeBytes >= 10 * GB && pct >= 10;
  return result('disk', 'Free disk space', ok ? 'PASS' : 'FAIL', detail,
    ok ? 'There is enough room for updates, temporary files and normal work.' : 'The disk is nearly full. Updates can fail and the computer may slow down or crash. Free up space or add storage.');
}

function checkFirewall(platform, exec) {
  const name = 'Firewall';
  const meaningOn = 'The firewall blocks unwanted incoming connections, reducing the risk of network attacks.';
  const meaningOff = 'The firewall is off. Unwanted incoming connections are not filtered. Ask IT to turn it on.';
  if (platform === 'win32') {
    const r = tryRun(exec, 'powershell', ps('Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress'));
    const p = r.ok ? parseWindowsFirewall(r.out) : null;
    if (!p) return result('firewall', name, 'SKIP', 'Firewall status is not available (command failed or needs more rights).', 'The result could not be read, so nothing is claimed about the firewall.');
    const detail = p.profiles.map((x) => `${x.name}: ${x.enabled ? 'on' : 'OFF'}`).join(', ');
    return result('firewall', name, p.allOn ? 'PASS' : 'FAIL', detail, p.allOn ? meaningOn : meaningOff);
  }
  if (platform === 'darwin') {
    const r = tryRun(exec, '/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate']);
    const on = r.ok ? parseSocketFilter(r.out) : null;
    if (on === null) return result('firewall', name, 'SKIP', 'Firewall status is not available.', 'The result could not be read, so nothing is claimed about the firewall.');
    return result('firewall', name, on ? 'PASS' : 'FAIL', on ? 'Application firewall is enabled' : 'Application firewall is disabled', on ? meaningOn : meaningOff);
  }
  // Linux: try ufw, then firewalld.
  const ufw = tryRun(exec, 'ufw', ['status']);
  const u = ufw.ok ? parseUfw(ufw.out) : null;
  if (u !== null) return result('firewall', name, u ? 'PASS' : 'FAIL', `ufw is ${u ? 'active' : 'inactive'}`, u ? meaningOn : meaningOff);
  const fw = tryRun(exec, 'firewall-cmd', ['--state']);
  const f = fw.ok ? parseFirewalld(fw.out) : null;
  if (f !== null) return result('firewall', name, f ? 'PASS' : 'FAIL', `firewalld is ${f ? 'running' : 'not running'}`, f ? meaningOn : meaningOff);
  return result('firewall', name, 'SKIP', 'No supported firewall tool found or rights are missing (ufw status usually needs root).', 'The result could not be read, so nothing is claimed about the firewall.');
}

/** Windows: newest installed hotfix must be < 90 days old. Linux (apt): no upgradable packages. macOS: no pending updates. */
function checkUpdates(platform, exec, now = new Date()) {
  const name = 'Updates';
  const skip = () => result('updates', name, 'SKIP', 'Update status is not available on this system.', 'The result could not be read, so nothing is claimed about updates.');
  if (platform === 'win32') {
    const r = tryRun(exec, 'powershell', ps("(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('o')"));
    const d = r.ok ? parseIsoDate(r.out) : null;
    if (!d) return skip();
    const days = Math.floor((now - d) / 86400000);
    const ok = days <= 90;
    return result('updates', name, ok ? 'PASS' : 'FAIL', `Most recent installed update: ${d.toISOString().slice(0, 10)} (${days} days ago)`,
      ok ? 'Updates were installed recently, so known security fixes are likely applied.' : 'No update has been installed for over 90 days. Run Windows Update.');
  }
  if (platform === 'darwin') {
    const r = tryRun(exec, 'softwareupdate', ['-l']);
    const n = r.ok || r.out ? parseMacSoftwareUpdate(r.out) : null;
    if (n === null) return skip();
    return result('updates', name, n === 0 ? 'PASS' : 'FAIL', n === 0 ? 'No pending updates' : `${n} pending update(s)`, n === 0 ? 'The system is up to date.' : 'Updates are waiting to be installed.');
  }
  const r = tryRun(exec, 'apt', ['list', '--upgradable']);
  if (!r.ok) return skip();
  const n = parseAptUpgradable(r.out);
  return result('updates', name, n === 0 ? 'PASS' : 'FAIL', n === 0 ? 'No upgradable packages (based on the local package list)' : `${n} upgradable package(s)`,
    n === 0 ? 'No pending package updates are known locally.' : 'Package updates are available. Install them to receive security fixes.');
}

function diskInfo(platform = process.platform) {
  try {
    const target = platform === 'win32' ? `${process.env.SystemDrive || 'C:'}\\` : '/';
    const s = fs.statfsSync(target);
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize, label: target };
  } catch { return { freeBytes: NaN, totalBytes: 0 }; }
}

function runPcHealth(deps = {}) {
  const platform = deps.platform || process.platform;
  const exec = deps.exec || realExec;
  const sys = deps.system || { platform, release: os.release(), version: typeof os.version === 'function' ? os.version() : '', arch: os.arch() };
  const checks = [checkOs(sys), checkDisk(deps.disk || diskInfo(platform)), checkFirewall(platform, exec), checkUpdates(platform, exec, deps.now || new Date())];
  return { checks, failed: checks.filter((c) => c.status === 'FAIL').length };
}

// ===========================================================================
// Network doctor
// ===========================================================================
function ipv4Of(interfaces) {
  const out = [];
  for (const [name, list] of Object.entries(interfaces || {})) {
    for (const i of list || []) if ((i.family === 'IPv4' || i.family === 4) && !i.internal) out.push({ name, address: i.address });
  }
  return out;
}

function stepConnection(interfaces) {
  const nics = Object.entries(interfaces || {}).filter(([, l]) => (l || []).some((i) => !i.internal));
  return nics.length
    ? result('connection', '1. Network connection exists', 'PASS', `Active network adapter(s): ${nics.map(([n]) => n).join(', ')}`, 'The computer has at least one network adapter that is switched on and connected (Wi-Fi or cable).')
    : result('connection', '1. Network connection exists', 'FAIL', 'No active network adapter found.', 'Wi-Fi is off or not connected, the cable is unplugged, or the adapter is disabled. Fix this first; nothing else can work.');
}
function stepIp(interfaces) {
  const v4 = ipv4Of(interfaces);
  const good = v4.filter((i) => !i.address.startsWith('169.254.') && i.address !== '0.0.0.0');
  if (good.length) return result('ip', '2. Computer has an IP address', 'PASS', `IP address: ${good.map((i) => i.address).join(', ')}`, 'The router (DHCP) gave this computer an address on the network.');
  return v4.length
    ? result('ip', '2. Computer has an IP address', 'FAIL', `Only a self-assigned address: ${v4.map((i) => i.address).join(', ')}`, 'A 169.254.x.x address means the computer asked the router for an address and got no answer. The router/DHCP service or the link to it has a problem.')
    : result('ip', '2. Computer has an IP address', 'FAIL', 'No IPv4 address.', 'The adapter is connected but has no IPv4 address. Reconnect, or check the router.');
}
function findGateway(platform, exec) {
  if (platform === 'win32') { const r = tryRun(exec, 'powershell', ps('Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty NextHop')); return r.ok ? parseGatewayWindows(r.out) : null; }
  if (platform === 'darwin') { const r = tryRun(exec, 'route', ['-n', 'get', 'default']); return r.ok ? parseGatewayMac(r.out) : null; }
  const r = tryRun(exec, 'ip', ['route', 'show', 'default']); return r.ok ? parseGatewayLinux(r.out) : null;
}
function pingArgs(platform, host) {
  if (!isIPv4(host)) throw new Error('Refusing to ping a non-IPv4 value.');
  if (platform === 'win32') return ['-n', '1', '-w', '2000', host];
  if (platform === 'darwin') return ['-c', '1', '-t', '2', host];
  return ['-c', '1', '-W', '2', host];
}
function ping(platform, exec, host) { const r = tryRun(exec, 'ping', pingArgs(platform, host)); return parsePing(r.out); }

function stepGateway(platform, exec) {
  const name = '3. Router (default gateway) answers';
  const gw = findGateway(platform, exec);
  if (!gw) return result('gateway', name, 'FAIL', 'No default gateway found.', 'The computer does not know where the router is, so it cannot leave the local network. Usually caused by a missing IP address (step 2) or a disconnected network.');
  const p = ping(platform, exec, gw);
  return p.success
    ? result('gateway', name, 'PASS', `Gateway ${gw} replied${p.timeMs !== null ? ` in ${p.timeMs} ms` : ''}`, 'The computer can talk to the office router. Problems beyond this point are on the router, the ISP line or further away.')
    : result('gateway', name, 'FAIL', `Gateway ${gw} did not reply`, 'The router address is known but it does not answer. Check the Wi-Fi signal or cable, power-cycle the router, or the router may be down.');
}
function stepInternet(platform, exec) {
  const name = '4. Internet reachable (ping 1.1.1.1)';
  const p = ping(platform, exec, '1.1.1.1');
  return p.success
    ? result('internet', name, 'PASS', `1.1.1.1 replied${p.timeMs !== null ? ` in ${p.timeMs} ms` : ''}`, 'Traffic reaches the internet by IP address, so the ISP line and router routing work.')
    : result('internet', name, 'FAIL', '1.1.1.1 did not reply', 'The router works but the internet does not: the ISP connection is down or blocked. Contact the ISP or check the router WAN light. (Some networks block ping, so confirm with a browser.)');
}
async function stepDns(lookup, domain = 'example.com') {
  const name = `5. Domain names resolve (${domain})`;
  try {
    const r = await lookup(domain);
    const addr = r && (r.address || (Array.isArray(r) ? r[0] : r));
    if (!addr) throw new Error('empty answer');
    return result('dns', name, 'PASS', `${domain} resolved to ${addr}`, 'DNS works: names are translated into IP addresses correctly.');
  } catch (e) {
    return result('dns', name, 'FAIL', `Could not resolve ${domain} (${e.code || e.message})`, 'Names do not resolve. If step 4 passed, this is a DNS problem: the DNS server set on the router or computer is wrong or down. Try another DNS server such as 1.1.1.1.');
  }
}

async function runNetworkDoctor(deps = {}) {
  const platform = deps.platform || process.platform;
  const exec = deps.exec || realExec;
  const interfaces = deps.interfaces || os.networkInterfaces();
  const lookup = deps.lookup || ((d) => require('node:dns').promises.lookup(d, { family: 4 }));
  const steps = [stepConnection(interfaces), stepIp(interfaces), stepGateway(platform, exec), stepInternet(platform, exec), await stepDns(lookup, deps.domain)];
  // Many routers ignore ping (ICMP) but still route traffic. If the gateway "failed" only because it did not
  // answer, yet 1.1.1.1 answered through it, the router is clearly working: report SKIP, not FAIL.
  const [, , gw, net] = steps;
  if (gw.status === 'FAIL' && net.status === 'PASS' && /did not reply/.test(gw.detail)) {
    gw.status = 'SKIP';
    gw.meaning = 'The router does not answer ping, but internet traffic passes through it (step 4 passed), so the router works. Many routers block ping on purpose. This is not a fault.';
  }
  const firstFailure = steps.find((s) => s.status === 'FAIL') || null;
  return { steps, firstFailure };
}

module.exports = {
  isIPv4, ALLOWED, realExec, tryRun, pingArgs,
  parseWindowsFirewall, parseUfw, parseFirewalld, parseSocketFilter, parseIsoDate, parseAptUpgradable, parseMacSoftwareUpdate,
  parseGatewayLinux, parseGatewayMac, parseGatewayWindows, parsePing,
  checkOs, checkDisk, checkFirewall, checkUpdates, diskInfo, runPcHealth,
  stepConnection, stepIp, stepGateway, stepInternet, stepDns, runNetworkDoctor,
};
