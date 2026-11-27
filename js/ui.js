/**
 * Shared UI helpers: safe DOM building, navigation shell, toasts, validation, downloads.
 *
 * SECURITY NOTE: user-supplied text is ALWAYS inserted with textContent
 * (via UI.el / UI.text). innerHTML is never used with user data. This is what the
 * Playwright XSS test verifies.
 */
(function (global) {
  'use strict';

  const CFG = global.NL_CONFIG;

  /**
   * Build an element safely.
   *   UI.el('td', { class: 'x', dataset: { id: 1 }, onclick: fn }, 'text', childNode)
   * Strings become text nodes (never HTML).
   */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { node.dataset[dk] = dv; });
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
  }

  /** Replace all children of a node. */
  function mount(node, ...children) { node.replaceChildren(...children.flat().filter(Boolean)); return node; }

  // ---- Formatting ---------------------------------------------------------
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  /** Time with seconds, e.g. 14:05:09. */
  function fmtTime(iso) { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleTimeString(undefined, { hour12: false }); }
  /** "in 2h 5m" / "3h 10m overdue". */
  function fmtDelta(iso, now = Date.now()) {
    const ms = new Date(iso).getTime() - now;
    const abs = Math.abs(ms);
    const m = Math.round(abs / 60000);
    const txt = m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
    return ms >= 0 ? `due in ${txt}` : `${txt} overdue`;
  }

  // ---- Toasts -------------------------------------------------------------
  function toast(message, type = 'success') {
    let region = document.getElementById('toast-region');
    if (!region) {
      region = el('div', { id: 'toast-region', class: 'toast-region', role: 'status', 'aria-live': 'polite' });
      document.body.append(region);
    }
    const t = el('div', { class: `toast ${type}` }, message);
    region.append(t);
    setTimeout(() => t.remove(), 5000);
  }

  /** Inline alert block. type: success | warning | error | info */
  function alertBox(type, title, body) {
    return el('div', { class: `alert ${type}`, role: type === 'error' ? 'alert' : 'status' },
      title ? el('strong', {}, title) : null, body ? el('span', {}, body) : null);
  }

  // ---- Form validation ----------------------------------------------------
  /** Show an error under a field and flag it for assistive tech. */
  function setFieldError(input, message) {
    const field = input.closest('.field');
    clearFieldError(input);
    if (!message) return;
    field.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    const err = el('p', { class: 'field-error', id: `${input.id}-error` }, message);
    field.append(err);
    const described = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    described.push(err.id);
    input.setAttribute('aria-describedby', described.join(' '));
  }
  function clearFieldError(input) {
    const field = input.closest('.field');
    if (!field) return;
    field.classList.remove('invalid');
    input.removeAttribute('aria-invalid');
    field.querySelectorAll('.field-error').forEach((e) => e.remove());
    const keep = (input.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && !id.endsWith('-error'));
    if (keep.length) input.setAttribute('aria-describedby', keep.join(' ')); else input.removeAttribute('aria-describedby');
  }
  function clearErrors(form) { form.querySelectorAll('input, select, textarea').forEach(clearFieldError); }

  /**
   * Validate a form against rules: { fieldName: [ (value) => errorMessage|null, ... ] }.
   * Shows messages, focuses the first invalid field, returns { ok, values }.
   */
  function validateForm(form, rules) {
    clearErrors(form);
    const values = {};
    let firstBad = null;
    Object.entries(rules).forEach(([name, checks]) => {
      const input = form.elements[name];
      const value = (input.value || '').trim();
      values[name] = value;
      for (const check of checks) {
        const msg = check(value);
        if (msg) { setFieldError(input, msg); if (!firstBad) firstBad = input; break; }
      }
    });
    if (firstBad) firstBad.focus();
    return { ok: !firstBad, values };
  }
  const rules = {
    required: (label) => (v) => (v ? null : `${label} is required.`),
    email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Enter a valid e-mail address, for example name@example.com.'),
    minLen: (label, n) => (v) => (!v || v.length >= n ? null : `${label} must be at least ${n} characters.`),
    maxLen: (label, n) => (v) => (v.length <= n ? null : `${label} must be at most ${n} characters.`),
    oneOf: (label, list) => (v) => (list.includes(v) ? null : `Choose a valid ${label.toLowerCase()}.`),
  };

  // ---- Files --------------------------------------------------------------
  function download(filename, text, mime = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  /** CSV with formula-injection protection (cells starting with = + - @ get a leading apostrophe). */
  function toCsv(rows, columns) {
    const cell = (v) => {
      let s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    return [columns.map(cell).join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n');
  }

  // ---- Shell (sidebar + topbar) for internal pages ------------------------
  function buildShell() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const page = document.body.dataset.page;
    const groups = [];
    CFG.nav.forEach((item) => {
      let g = groups.find((x) => x.name === item.group);
      if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
      g.items.push(item);
    });
    const nav = el('nav', { 'aria-label': 'Main navigation' }, groups.map((g) => el('div', {},
      el('div', { class: 'nav-group' }, g.name),
      el('ul', { class: 'nav-list' }, g.items.map((i) => el('li', {},
        el('a', { href: i.href, 'aria-current': i.id === page ? 'page' : null },
          el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, i.icon), i.label)))))));
    mount(sidebar,
      el('a', { class: 'brand', href: 'index.html' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'N'), 'Northlight IT'),
      nav,
      el('div', { class: 'sidebar-foot', id: 'sidebar-user' }, 'Demo data – stored only in this browser.'));

    const toggle = document.getElementById('menu-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const open = sidebar.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) { sidebar.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
      });
    }
  }

  /** Called once per page, before page scripts run their own logic. */
  function init() {
    Store.seed();
    buildShell();
  }

  global.UI = { el, mount, fmtTime, fmtDate, fmtDelta, toast, alertBox, setFieldError, clearFieldError, clearErrors, validateForm, rules, download, toCsv, init };
})(window);
