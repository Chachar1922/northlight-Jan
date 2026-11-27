/**
 * Staff page: two-step sign-in (password + TOTP), staff directory, and a
 * demonstration admin section (joiner / leaver / CSV import) for IT admins only.
 *
 * REMINDER: this is a browser-only learning model. The admin section is simply not
 * rendered for non-IT users; that is a UI convenience, NOT a security boundary.
 */
(function () {
  'use strict';
  const { el, mount, validateForm, rules } = UI;
  const CFG = NL_CONFIG;
  const $ = (id) => document.getElementById(id);
  const DEPARTMENTS = ['Design', 'Sales', 'IT'];

  UI.init();

  // ---- view switching ------------------------------------------------------
  function showSignedOut() {
    $('app-view').hidden = true; $('signin-view').hidden = false;
    $('signout-btn').hidden = true; mount($('whoami'));
    mount($('sidebar-user'), 'Not signed in');
    const pending = Auth.hasPending();
    $('login-form').hidden = pending; $('mfa-form').hidden = !pending;
  }
  function showSignedIn(user) {
    $('signin-view').hidden = true; $('app-view').hidden = false;
    $('signout-btn').hidden = false;
    mount($('whoami'), `${user.name} · ${user.department}`);
    mount($('sidebar-user'), `Signed in: ${user.name} (${user.department})`);
    renderDirectory();
    mount($('admin-mount'), Auth.isAdmin(user) ? buildAdmin(user) : UI.alertBox('info', 'Admin section not available', `Your role (${user.department}) does not include the admin area. It is shown to IT admins only.`));
  }

  /** Leaver workflow, step 2: a signed-in page notices when its account is blocked or its sessions are revoked. */
  function watchSession() {
    if (!$('app-view').hidden && !Auth.currentUser()) {
      showSignedOut();
      mount($('signin-result'), UI.alertBox('warning', 'Your session was ended.', 'Your account was disabled or your sessions were revoked by IT.'));
    }
  }
  setInterval(watchSession, 3000);
  window.addEventListener('storage', watchSession);

  // ---- demo helper (fake accounts + live TOTP) -----------------------------
  function renderDemoAccounts() {
    mount($('demo-rows'), NL_SEED.staffSpec.map((s) => el('tr', {},
      el('td', { class: 'small' }, s.email), el('td', {}, s.department),
      el('td', { class: 'mono small' }, s.demoPassword), el('td', { class: 'mono demo-code', dataset: { secret: s.totpSecret, email: s.email } }, '------'))));
  }
  async function tickCodes() {
    $('code-timer').textContent = String(Auth.secondsLeft());
    for (const cell of document.querySelectorAll('.demo-code')) cell.textContent = await Auth.totp(cell.dataset.secret);
  }

  // ---- sign-in handlers ----------------------------------------------------
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); mount($('signin-result'));
    const { ok, values } = validateForm(e.target, { email: [rules.required('E-mail'), rules.email], password: [rules.required('Password')] });
    if (!ok) { mount($('signin-result'), UI.alertBox('error', 'Please fix the highlighted fields.')); return; }
    const res = await Auth.checkPassword(values.email, values.password);
    if (!res.ok) { mount($('signin-result'), UI.alertBox('error', 'Sign-in failed.', res.message)); return; }
    e.target.reset(); showSignedOut(); $('mfa-code').focus();
    mount($('signin-result'), UI.alertBox('info', 'Password accepted.', 'Now enter your one-time code.'));
  });

  $('mfa-form').addEventListener('submit', async (e) => {
    e.preventDefault(); mount($('signin-result'));
    const { ok, values } = validateForm(e.target, { code: [rules.required('Code'), (v) => (/^\d{6}$/.test(v) ? null : 'The code is 6 digits.')] });
    if (!ok) { mount($('signin-result'), UI.alertBox('error', 'Please fix the highlighted fields.')); return; }
    const res = await Auth.checkCode(values.code);
    if (!res.ok) {
      mount($('signin-result'), UI.alertBox('error', 'Sign-in failed.', res.message));
      if (res.reason !== 'code') showSignedOut();
      return;
    }
    e.target.reset(); showSignedIn(res.user);
  });
  $('mfa-cancel').addEventListener('click', () => { Auth.cancelPending(); mount($('signin-result')); showSignedOut(); });
  $('signout-btn').addEventListener('click', () => { Auth.signOut(); showSignedOut(); mount($('signin-result'), UI.alertBox('success', 'You have been signed out.')); });

  // ---- directory -----------------------------------------------------------
  function statusBadge(s) { return el('span', { class: `badge ${s === 'Active' ? 'ok' : 'neutral'}` }, s); }
  function renderDirectory() {
    mount($('staff-rows'), Store.all('staff').map((s) => el('tr', { dataset: { staff: s.id } },
      el('td', { class: 'mono' }, s.id),
      el('td', {}, el('div', { class: 'cell-title' }, s.name), el('div', { class: 'cell-sub' }, s.email)),
      el('td', {}, s.department),
      el('td', { class: 'directory-groups' }, (s.groups || []).join(', ')),
      el('td', {}, s.role), el('td', {}, statusBadge(s.status)))));
  }

  // ---- CSV parsing (small, quote-aware) -------------------------------------
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  }

  // ---- joiner: shared by the form and the CSV import ------------------------
  /**
   * Joiner workflow: 1) create the user, 2) add them to a group, 3) assign a role,
   * 4) require the second authentication step (TOTP). Returns { rec, tempPassword, secret } or { error }.
   */
  async function createEmployee({ name, department, role, email, group }) {
    if (!DEPARTMENTS.includes(department)) return { error: `Unknown department "${department}".` };
    const grp = group || CFG.defaultGroupByDepartment[department];
    if (!CFG.groups.includes(grp)) return { error: `Unknown group "${grp}".` };
    const mail = (email || name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@' + CFG.demoDomain).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return { error: `Invalid e-mail "${mail}".` };
    if (Store.all('staff').some((s) => s.email.toLowerCase() === mail)) return { error: `An employee with e-mail ${mail} already exists.` };
    const tempPassword = Auth.randomPassword();             // shown once, only the hash is stored
    const cred = await Auth.makeCredential(tempPassword);
    const secret = Auth.randomSecret();
    const rec = Store.add('staff', {
      name, email: mail, department, role, status: 'Active', startDate: new Date().toISOString().slice(0, 10),
      groups: Array.from(new Set([grp, 'All Staff'])), mfaRequired: true,
      passwordHash: cred.passwordHash, salt: cred.salt, iterations: cred.iterations, totpSecret: secret,
    });
    return { rec, tempPassword, secret };
  }

  // ---- admin: joiner / leaver / CSV ------------------------------------------
  function buildAdmin(admin) {
    const section = el('section', { id: 'admin-section', 'aria-labelledby': 'admin-title' });
    const result = el('div', { id: 'admin-result', tabindex: '-1', 'aria-live': 'polite' });
    const table = el('tbody', { id: 'admin-rows' });
    const pack = el('div', { id: 'welcome-pack' });

    const nameIn = el('input', { id: 'j-name', name: 'name', type: 'text' });
    const deptIn = el('select', { id: 'j-dept', name: 'department' }, DEPARTMENTS.map((d) => el('option', { value: d }, d)));
    const groupIn = el('select', { id: 'j-group', name: 'group' }, CFG.groups.map((g) => el('option', { value: g }, g)));
    const roleIn = el('input', { id: 'j-role', name: 'role', type: 'text' });
    const mailIn = el('input', { id: 'j-email', name: 'email', type: 'email' });
    const field = (label, input, hint) => el('div', { class: 'field' }, el('label', { for: input.id }, label), input, hint ? el('p', { class: 'hint' }, hint) : null);
    // Choosing a department pre-selects its default group.
    const syncGroup = () => { groupIn.value = CFG.defaultGroupByDepartment[deptIn.value]; };
    deptIn.addEventListener('change', syncGroup); syncGroup();

    const form = el('form', { id: 'joiner-form', class: 'form', novalidate: true, onsubmit: onJoin },
      field('Full name', nameIn), field('Department', deptIn), field('Group', groupIn, 'Every new user is also added to "All Staff".'),
      field('Role / job title', roleIn),
      field('Work e-mail (optional)', mailIn, `Leave empty to generate one at @${CFG.demoDomain}.`),
      el('p', { class: 'small muted mb-0', id: 'mfa-required-note' }, '✓ Second authentication step (TOTP) is required for every new user.'),
      el('div', { class: 'form-actions' }, el('button', { class: 'btn', type: 'submit' }, 'Create account (joiner)')));

    async function onJoin(e) {
      e.preventDefault(); mount(result); mount(pack);
      const { ok, values } = validateForm(form, {
        name: [rules.required('Full name'), rules.minLen('Full name', 3), rules.maxLen('Full name', 80)],
        department: [rules.oneOf('Department', DEPARTMENTS)], group: [rules.oneOf('Group', CFG.groups)],
        role: [rules.required('Role'), rules.maxLen('Role', 60)], email: [rules.email],
      });
      if (!ok) { mount(result, UI.alertBox('error', 'Please fix the highlighted fields.')); return; }
      const out = await createEmployee(values);
      if (out.error) { UI.setFieldError(mailIn, out.error); mailIn.focus(); return; }
      const { rec, tempPassword, secret } = out;
      mount(result, UI.alertBox('success', `${rec.name} (${rec.id}) added to ${rec.department} / ${rec.groups.join(', ')}.`, 'Second step (TOTP) is required at first sign-in.'));
      mount(pack, el('div', { class: 'alert info' }, el('strong', {}, 'Welcome pack (shown once, demo only)'),
        el('div', {}, 'E-mail: ', el('code', {}, rec.email)), el('div', {}, 'Temporary password: ', el('code', { id: 'temp-password' }, tempPassword)),
        el('div', {}, 'Authenticator secret: ', el('code', { id: 'temp-secret' }, secret)),
        el('div', { class: 'small' }, 'Only a salted hash of the password is stored. In a real system the user would be forced to change it at first sign-in.')));
      form.reset(); syncGroup(); renderAdminRows(); renderDirectory();
    }

    // ---- CSV import -----------------------------------------------------------
    const csvIn = el('input', { id: 'csv-file', name: 'csv', type: 'file', accept: '.csv,text/csv' });
    const csvResult = el('div', { id: 'csv-result', tabindex: '-1', 'aria-live': 'polite' });
    const csvForm = el('form', { id: 'csv-form', class: 'form', novalidate: true, onsubmit: onCsv },
      field('CSV file', csvIn, 'Columns: name, department, role (optional: email, group). First row must be the header.'),
      el('div', { class: 'form-actions' }, el('button', { class: 'btn secondary', type: 'submit' }, 'Import users from CSV')));

    async function onCsv(e) {
      e.preventDefault(); mount(csvResult); UI.clearFieldError(csvIn);
      const file = csvIn.files && csvIn.files[0];
      if (!file) { UI.setFieldError(csvIn, 'Choose a CSV file first.'); csvIn.focus(); return; }
      if (file.size > 100000) { UI.setFieldError(csvIn, 'The file is too large (limit 100 KB).'); return; }
      const rows = parseCsv(await file.text());
      const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
      const col = (n) => header.indexOf(n);
      if (['name', 'department', 'role'].some((n) => col(n) < 0)) { UI.setFieldError(csvIn, 'The header row must contain: name, department, role.'); return; }
      if (!rows.length) { UI.setFieldError(csvIn, 'The file has no data rows.'); return; }
      if (rows.length > 50) { UI.setFieldError(csvIn, 'At most 50 users per import.'); return; }
      const created = [], errors = [];
      for (const [i, r] of rows.entries()) {
        const get = (n) => (col(n) >= 0 ? (r[col(n)] || '').trim() : '');
        const name = get('name');
        if (name.length < 3) { errors.push(`Row ${i + 2}: name is too short.`); continue; }
        if (!get('role')) { errors.push(`Row ${i + 2}: role is required.`); continue; }
        const out = await createEmployee({ name, department: get('department'), role: get('role'), email: get('email'), group: get('group') });
        if (out.error) errors.push(`Row ${i + 2} (${name}): ${out.error}`); else created.push(out);
      }
      mount(csvResult,
        UI.alertBox(created.length ? 'success' : 'error', `${created.length} user(s) imported, ${errors.length} row(s) rejected.`),
        errors.length ? el('ul', { id: 'csv-errors' }, errors.map((m) => el('li', {}, m))) : null,
        created.length ? el('div', { class: 'table-wrap' }, el('table', { id: 'csv-created' }, el('caption', { class: 'visually-hidden' }, 'Imported users (shown once)'),
          el('thead', {}, el('tr', {}, ['Name', 'E-mail', 'Temporary password', 'Authenticator secret'].map((h) => el('th', { scope: 'col' }, h)))),
          el('tbody', {}, created.map((c) => el('tr', {}, el('td', {}, c.rec.name), el('td', {}, c.rec.email), el('td', { class: 'mono' }, c.tempPassword), el('td', { class: 'mono' }, c.secret)))))) : null);
      csvForm.reset(); renderAdminRows(); renderDirectory();
    }

    // ---- leaver ---------------------------------------------------------------
    /** Leaver workflow: 1) block sign-in, 2) end active sessions, 3) keep the employee record. */
    function setStatus(user, status) {
      const activeAdmins = Store.all('staff').filter((s) => Auth.isAdmin(s));
      if (status === 'Disabled' && user.id === admin.id) { mount(result, UI.alertBox('error', 'You cannot disable your own account.')); return; }
      if (status === 'Disabled' && Auth.isAdmin(user) && activeAdmins.length <= 1) { mount(result, UI.alertBox('error', 'At least one active IT administrator must remain.')); return; }
      if (status === 'Disabled' && !confirm(`Disable ${user.name}? They will no longer be able to sign in and their sessions will end.`)) return;
      if (status === 'Disabled') {
        Store.update('staff', user.id, { status, disabledAt: new Date().toISOString() });
        Auth.revokeSessions(user.id);
      } else Store.update('staff', user.id, { status, disabledAt: null });
      mount(result, UI.alertBox('success', `${user.name} is now ${status.toLowerCase()}.`, status === 'Disabled' ? 'Leaver workflow complete: sign-in is blocked, sessions are ended, and the record is kept.' : 'Account re-enabled. Old sessions stay ended.'));
      renderAdminRows(); renderDirectory();
    }
    function renderAdminRows() {
      mount(table, Store.all('staff').map((s) => el('tr', { dataset: { admin: s.id } },
        el('td', {}, el('div', { class: 'cell-title' }, s.name), el('div', { class: 'cell-sub' }, s.email)),
        el('td', {}, `${s.department} · ${s.role}`), el('td', {}, statusBadge(s.status)),
        el('td', {}, s.status === 'Active'
          ? el('button', { class: 'btn small danger', type: 'button', 'aria-label': `Disable ${s.name}`, onclick: () => setStatus(s, 'Disabled') }, 'Disable (leaver)')
          : el('button', { class: 'btn small secondary', type: 'button', 'aria-label': `Re-enable ${s.name}`, onclick: () => setStatus(s, 'Active') }, 'Re-enable')))));
    }
    renderAdminRows();

    section.append(
      el('h2', { id: 'admin-title' }, 'Admin: joiners and leavers'),
      el('p', { class: 'muted' }, 'Visible to IT admins only (demonstration of role-based access; real enforcement belongs on a server).'),
      result,
      el('div', { class: 'split' },
        el('div', { class: 'grid' },
          el('div', { class: 'card' }, el('h3', {}, 'Joiner: add an employee'), form, pack),
          el('div', { class: 'card' }, el('h3', {}, 'Joiners from a CSV file'), csvForm, csvResult)),
        el('div', {}, el('h3', {}, 'Leaver: disable an employee'), el('div', { class: 'table-wrap' },
          el('table', {}, el('caption', { class: 'visually-hidden' }, 'Manage staff'),
            el('thead', {}, el('tr', {}, ['Employee', 'Department', 'Status', 'Action'].map((h) => el('th', { scope: 'col' }, h)))), table)))));
    return section;
  }

  // ---- start ---------------------------------------------------------------
  (async function start() {
    await Auth.ensureSeeded();
    renderDemoAccounts();
    const user = Auth.currentUser();
    if (user) showSignedIn(user); else showSignedOut();
    tickCodes(); setInterval(tickCodes, 1000);
  })();
})();
