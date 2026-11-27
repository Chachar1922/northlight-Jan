/**
 * Demo authentication: password hashing + TOTP, using only the browser's Web Crypto API.
 *
 * !! LEARNING MODEL ONLY – NOT PRODUCTION SECURITY !!
 * Everything here runs in the visitor's browser, so anyone with DevTools can read
 * localStorage, edit the staff list, or skip the checks entirely. Real systems must
 * verify passwords, MFA codes and roles SERVER-SIDE. See RISKS.md.
 *
 * What it does demonstrate correctly:
 *  - passwords are never stored in plain text (salted PBKDF2-SHA256 hashes),
 *  - TOTP follows RFC 6238 (HMAC-SHA1, 30 s step, 6 digits),
 *  - a disabled account cannot complete sign-in.
 */
(function (global) {
  'use strict';

  const CFG = global.NL_CONFIG;
  const A = CFG.auth;
  const enc = new TextEncoder();
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  // ---- encoding helpers ----------------------------------------------------
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  function base32Decode(str) {
    const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const c of clean) bits += B32.indexOf(c).toString(2).padStart(5, '0');
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return new Uint8Array(bytes);
  }
  function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function randomSecret() { return Array.from(randomBytes(10)).map((b) => B32[b % 32]).join('').padEnd(16, 'A').slice(0, 16); }
  function randomPassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(randomBytes(12)).map((b) => chars[b % chars.length]).join('') + '!';
  }

  // ---- password hashing (PBKDF2-SHA256) -----------------------------------
  async function hashPassword(password, saltHex, iterations) {
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return toHex(bits);
  }
  /** Create the credential fields to store for a new password. */
  async function makeCredential(password) {
    const salt = toHex(randomBytes(16));
    return { salt, iterations: A.pbkdf2Iterations, passwordHash: await hashPassword(password, salt, A.pbkdf2Iterations) };
  }
  /** Constant-time-ish string compare (good practice even in a demo). */
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  // ---- TOTP (RFC 6238) -----------------------------------------------------
  async function hotp(secretB32, counter) {
    const key = await crypto.subtle.importKey('raw', base32Decode(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const msg = new ArrayBuffer(8);
    const view = new DataView(msg);
    view.setUint32(0, Math.floor(counter / 4294967296));
    view.setUint32(4, counter >>> 0);
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
    const off = h[h.length - 1] & 0x0f;
    const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
    return String(code % 10 ** A.totpDigits).padStart(A.totpDigits, '0');
  }
  async function totp(secretB32, nowMs = Date.now()) { return hotp(secretB32, Math.floor(nowMs / 1000 / A.totpStepSeconds)); }
  async function verifyTotp(secretB32, code, nowMs = Date.now()) {
    const counter = Math.floor(nowMs / 1000 / A.totpStepSeconds);
    for (let w = -A.totpWindow; w <= A.totpWindow; w++) {
      if (safeEqual(await hotp(secretB32, counter + w), String(code).trim())) return true;
    }
    return false;
  }
  function secondsLeft(nowMs = Date.now()) { return A.totpStepSeconds - (Math.floor(nowMs / 1000) % A.totpStepSeconds); }

  // ---- staff seeding -------------------------------------------------------
  /** Hash the sample staff passwords once (async, so it cannot live in Store.seed). */
  async function ensureSeeded() {
    Store.seed();
    const meta = Store.meta();
    if (meta.staffSeeded) return;
    const rows = [];
    for (const s of NL_SEED.staffSpec) {
      const cred = await makeCredential(s.demoPassword);
      rows.push({
        id: s.id, name: s.name, email: s.email, department: s.department, role: s.role, status: 'Active',
        startDate: '2025-01-06', createdAt: new Date().toISOString(),
        passwordHash: cred.passwordHash, salt: cred.salt, iterations: cred.iterations, totpSecret: s.totpSecret,
      });
    }
    Store.save('staff', rows);
    const m = Store.meta(); m.staffSeeded = true; m.counters = Object.assign({}, m.counters, { E: Math.max((m.counters || {}).E || 0, 1006) }); Store.saveMeta(m);
  }

  // ---- sign-in flow --------------------------------------------------------
  const PENDING = 'pending-mfa';
  const SESSION = A.sessionKey;
  const isAdmin = (user) => !!user && user.department === 'IT' && user.status === 'Active';

  /** Step 1: e-mail + password. On success the user must still pass MFA. */
  async function checkPassword(email, password) {
    const user = Store.all('staff').find((s) => s.email.toLowerCase() === String(email).trim().toLowerCase());
    // Hash even for unknown users so timing does not reveal whether an account exists.
    const probe = user || { salt: '00'.repeat(16), iterations: A.pbkdf2Iterations, passwordHash: '' };
    const hash = await hashPassword(password, probe.salt, probe.iterations);
    if (!user || !safeEqual(hash, user.passwordHash)) return { ok: false, reason: 'invalid', message: 'Incorrect e-mail or password.' };
    if (user.status !== 'Active') return { ok: false, reason: 'disabled', message: 'This account has been disabled. Please contact IT.' };
    Store.session.set(PENDING, { userId: user.id, at: Date.now() });
    return { ok: true, user };
  }
  /** Step 2: one-time code. Creates the session. */
  async function checkCode(code) {
    const pending = Store.session.get(PENDING);
    if (!pending || Date.now() - pending.at > 5 * 60000) { Store.session.del(PENDING); return { ok: false, reason: 'expired', message: 'Your sign-in expired. Please start again.' }; }
    const user = Store.get('staff', pending.userId);
    if (!user || user.status !== 'Active') { Store.session.del(PENDING); return { ok: false, reason: 'disabled', message: 'This account has been disabled. Please contact IT.' }; }
    if (!(await verifyTotp(user.totpSecret, code))) return { ok: false, reason: 'code', message: 'That code is not correct or has expired.' };
    Store.session.del(PENDING);
    Store.session.set(SESSION, { userId: user.id, at: Date.now() });
    return { ok: true, user };
  }
  /** The signed-in user, re-read from storage so a disabled user loses access immediately. */
  function currentUser() {
    const s = Store.session.get(SESSION);
    if (!s) return null;
    const user = Store.get('staff', s.userId);
    if (!user || user.status !== 'Active') { Store.session.del(SESSION); return null; }
    return user;
  }
  function signOut() { Store.session.del(SESSION); Store.session.del(PENDING); }
  function cancelPending() { Store.session.del(PENDING); }
  function hasPending() { return !!Store.session.get(PENDING); }

  global.Auth = { ensureSeeded, hashPassword, makeCredential, totp, verifyTotp, secondsLeft, base32Decode, randomSecret, randomPassword, checkPassword, checkCode, currentUser, signOut, cancelPending, hasPending, isAdmin };
})(window);
