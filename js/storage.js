/**
 * Shared storage layer – the ONLY code that touches localStorage / sessionStorage.
 *
 * Every collection is one JSON array under `nl.<name>`:
 *   tickets, leads, accounts, contacts, opportunities, cases,
 *   staff, outbox, autolog, autoruns
 * plus `nl.meta` (an object: id counters and the seed flag).
 *
 * Because all modules go through this file, there are no duplicate or
 * conflicting structures, and "Export all data" can find everything.
 */
(function (global) {
  'use strict';

  const CFG = global.NL_CONFIG;
  const PREFIX = CFG.storagePrefix;
  const COLLECTIONS = ['tickets', 'leads', 'accounts', 'contacts', 'opportunities', 'cases', 'staff', 'outbox', 'autolog', 'autoruns'];
  const ID_PREFIX = {
    tickets: 'T', leads: 'L', accounts: 'A', contacts: 'C', opportunities: 'O', cases: 'S',
    staff: 'E', outbox: 'M', autolog: 'G', autoruns: 'R',
  };

  /** localStorage can throw (private mode, blocked cookies). Fall back to memory so pages still work. */
  function makeSafe(kind) {
    const memory = new Map();
    let backing = null;
    try { backing = global[kind]; backing.setItem('__nl_probe', '1'); backing.removeItem('__nl_probe'); } catch (e) { backing = null; }
    return {
      get(k) { try { return backing ? backing.getItem(k) : (memory.has(k) ? memory.get(k) : null); } catch (e) { return null; } },
      set(k, v) { try { if (backing) backing.setItem(k, v); else memory.set(k, v); } catch (e) { memory.set(k, v); } },
      del(k) { try { if (backing) backing.removeItem(k); else memory.delete(k); } catch (e) { memory.delete(k); } },
      keys() {
        const out = [];
        try { if (backing) for (let i = 0; i < backing.length; i++) out.push(backing.key(i)); else memory.forEach((_, k) => out.push(k)); } catch (e) { /* ignore */ }
        return out;
      },
    };
  }
  const local = makeSafe('localStorage');
  const session = makeSafe('sessionStorage');

  function parse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  const Store = {
    COLLECTIONS,

    /** Read a whole collection (always returns an array). */
    all(name) {
      const v = parse(local.get(PREFIX + name), []);
      return Array.isArray(v) ? v : [];
    },
    /** Replace a whole collection. */
    save(name, rows) { local.set(PREFIX + name, JSON.stringify(rows)); },
    get(name, id) { return this.all(name).find((r) => r.id === id) || null; },

    /** Meta object: id counters + seed flag. */
    meta() { const m = parse(local.get(PREFIX + 'meta'), {}); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; },
    saveMeta(m) { local.set(PREFIX + 'meta', JSON.stringify(m)); },

    /** Next readable ID such as T-1006. Counters live in meta so IDs are never reused. */
    nextId(name) {
      const meta = this.meta();
      meta.counters = meta.counters || {};
      const p = ID_PREFIX[name] || 'X';
      meta.counters[p] = (meta.counters[p] || 1000) + 1;
      this.saveMeta(meta);
      return p + '-' + meta.counters[p];
    },

    /** Insert a record; assigns id + createdAt when missing. Returns the stored record. */
    add(name, record) {
      const rows = this.all(name);
      const rec = Object.assign({ id: this.nextId(name), createdAt: new Date().toISOString() }, record);
      rows.push(rec);
      this.save(name, rows);
      return rec;
    },
    /** Merge a patch into a record. Returns the updated record or null. */
    update(name, id, patch) {
      const rows = this.all(name);
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return null;
      rows[i] = Object.assign({}, rows[i], typeof patch === 'function' ? patch(rows[i]) : patch);
      this.save(name, rows);
      return rows[i];
    },
    remove(name, id) { this.save(name, this.all(name).filter((r) => r.id !== id)); },

    /**
     * Seed sample data once. Only collections that do not exist yet are filled,
     * so user data is never overwritten. `global.NL_SEED` is defined in js/seed.js.
     */
    seed() {
      const meta = this.meta();
      if (meta.seeded || !global.NL_SEED) return false;
      const data = global.NL_SEED.build(new Date());
      COLLECTIONS.forEach((name) => {
        if (local.get(PREFIX + name) === null) this.save(name, data[name] || []);
      });
      meta.seeded = true;
      meta.counters = Object.assign({ T: 1005, L: 1003, A: 1002, C: 1002, O: 1004, S: 1001 }, meta.counters || {});
      this.saveMeta(meta);
      return true;
    },

    /** Every `nl.*` record as one object – used by "Export all data". */
    exportAll() {
      const data = {};
      local.keys().filter((k) => k && k.startsWith(PREFIX)).sort().forEach((k) => {
        data[k.slice(PREFIX.length)] = parse(local.get(k), null);
      });
      return {
        exportedAt: new Date().toISOString(),
        app: CFG.appName,
        version: CFG.version,
        note: 'Fictional demo data only. Password hashes and MFA demo secrets are included as stored.',
        data,
      };
    },

    /** Delete every `nl.*` key (used by "Reset demo data"). */
    resetAll() { local.keys().filter((k) => k && k.startsWith(PREFIX)).forEach((k) => local.del(k)); session.del(PREFIX + CFG.auth.sessionKey); },

    /** sessionStorage helpers – only for temporary session data (signed-in user, pending MFA step). */
    session: {
      get(key) { return parse(session.get(PREFIX + key), null); },
      set(key, value) { session.set(PREFIX + key, JSON.stringify(value)); },
      del(key) { session.del(PREFIX + key); },
    },
  };

  global.Store = Store;
})(window);
