/**
 * Staff page: two-step sign-in (password + TOTP), staff directory, and a
 * demonstration admin section (joiner / leaver workflows) for IT users only.
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
    mount($('admin-mount'), Auth.isAdmin(user) ? buildAdmin(user) : UI.alertBox('info', 'Admin section not available', `Your role (${user.department}) does not include the admin area. It is shown to IT staff only.`));
  }

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
      el('td', {}, s.department), el('td', {}, s.role), el('td', {}, statusBadge(s.status)))));
  }

  // ---- admin: joiner / leaver ---------------------------------------------
  function buildAdmin(admin) {
    const section = el('section', { id: 'admin-section', 'aria-labelledby': 'admin-title' });
    const result = el('div', { id: 'admin-result', tabindex: '-1', 'aria-live': 'polite' });
    const table = el('tbody', { id: 'admin-rows' });
    const pack = el('div', { id: 'welcome-pack' });

    const nameIn = el('input', { id: 'j-name', name: 'name', type: 'text' });
    const deptIn = el('select', { id: 'j-dept', name: 'department' }, DEPARTMENTS.map((d) => el('option', { value: d }, d)));
    const roleIn = el('input', { id: 'j-role', name: 'role', type: 'text' });
    const mailIn = el('input', { id: 'j-email', name: 'email', type: 'email' });
    const field = (label, input, hint) => el('div', { class: 'field' }, el('label', { for: input.id }, label), input, hint ? el('p', { class: 'hint' }, hint) : null);
    const form = el('form', { id: 'joiner-form', class: 'form', novalidate: true, onsubmit: onJoin },
      field('Full name', nameIn), field('Department', deptIn), field('Role / job title', roleIn),
      field('Work e-mail (optional)', mailIn, `Leave empty to generate one at @${CFG.demoDomain}.`),
      el('div', { class: 'form-actions' }, el('button', { class: 'btn', type: 'submit' }, 'Create account (joiner)')));

    async function onJoin(e) {
      e.preventDefault(); mount(result); mount(pack);
      const { ok, values } = validateForm(form, {
        name: [rules.required('Full name'), rules.minLen('Full name', 3), rules.maxLen('Full name', 80)],
        department: [rules.oneOf('Department', DEPARTMENTS)], role: [rules.required('Role'), rules.maxLen('Role', 60)],
        email: [rules.email],
      });
      if (!ok) { mount(result, UI.alertBox('error', 'Please fix the highlighted fields.')); return; }
      const email = (values.email || values.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@' + CFG.demoDomain).toLowerCase();
      if (Store.all('staff').some((s) => s.email.toLowerCase() === email)) { UI.setFieldError(mailIn, 'An employee with this e-mail already exists.'); mailIn.focus(); return; }
      const tempPassword = Auth.randomPassword();           // shown once, only the hash is stored
      const cred = await Auth.makeCredential(tempPassword);
      const secret = Auth.randomSecret();
      const rec = Store.add('staff', {
        name: values.name, email, department: values.department, role: values.role, status: 'Active', startDate: new Date().toISOString().slice(0, 10),
        passwordHash: cred.passwordHash, salt: cred.salt, iterations: cred.iterations, totpSecret: secret,
      });
      mount(result, UI.alertBox('success', `${rec.name} (${rec.id}) added to ${rec.department}.`));
      mount(pack, el('div', { class: 'alert info' }, el('strong', {}, 'Welcome pack (shown once, demo only)'),
        el('div', {}, 'E-mail: ', el('code', {}, rec.email)), el('div', {}, 'Temporary password: ', el('code', { id: 'temp-password' }, tempPassword)),
        el('div', {}, 'Authenticator secret: ', el('code', { id: 'temp-secret' }, secret)),
        el('div', { class: 'small' }, 'Only a salted hash of the password is stored. In a real system the user would be forced to change it at first sign-in.')));
      form.reset(); renderAdminRows(); renderDirectory();
    }

    function setStatus(user, status) {
      const active = Store.all('staff').filter((s) => s.status === 'Active' && s.department === 'IT');
      if (status === 'Disabled' && user.id === admin.id) { mount(result, UI.alertBox('error', 'You cannot disable your own account.')); return; }
      if (status === 'Disabled' && user.department === 'IT' && active.length <= 1) { mount(result, UI.alertBox('error', 'At least one active IT administrator must remain.')); return; }
      if (status === 'Disabled' && !confirm(`Disable ${user.name}? They will no longer be able to sign in.`)) return;
      Store.update('staff', user.id, status === 'Disabled' ? { status, disabledAt: new Date().toISOString() } : { status, disabledAt: null });
      mount(result, UI.alertBox('success', `${user.name} is now ${status.toLowerCase()}.`, status === 'Disabled' ? 'Leaver workflow complete: sign-in is blocked.' : 'Account re-enabled.'));
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
      el('p', { class: 'muted' }, 'Visible to IT staff only (demonstration of role-based access; real enforcement belongs on a server).'),
      result,
      el('div', { class: 'split' },
        el('div', { class: 'card' }, el('h3', {}, 'Joiner: add an employee'), form, pack),
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
