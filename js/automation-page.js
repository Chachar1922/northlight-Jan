/**
 * Automation page: shows rules.json, execution results, outbox alerts and logs.
 * Includes a test form that fires the same trigger as the public contact form.
 */
(function () {
  'use strict';
  const { el, mount, validateForm, rules } = UI;
  const $ = (id) => document.getElementById(id);
  const emptyRow = (cols, text) => el('tr', {}, el('td', { colspan: String(cols), class: 'empty' }, text));
  const statusBadge = (s) => el('span', { class: `badge ${s === 'executed' ? 'ok' : s === 'error' ? 'danger' : 'neutral'}` }, s);

  UI.init();

  async function renderRules() {
    try {
      const list = await Automation.loadRules();
      mount($('rule-rows'), list.map((r) => el('tr', { dataset: { rule: r.id } },
        el('td', { class: 'mono' }, r.id), el('td', { class: 'cell-title' }, r.name),
        el('td', {}, r.when ? `${r.when.field} contains the word "${r.when.containsWord}"` : 'Always'),
        el('td', { class: 'mono small' }, (r.actions || []).map((a) => a.type).join(', ')))));
    } catch (err) { mount($('rule-rows'), emptyRow(4, `Could not load rules: ${err.message}`)); }
  }

  function renderData() {
    const runs = Store.all('autoruns').slice().reverse();
    const logs = Store.all('autolog').slice().reverse();
    const outbox = Store.all('outbox').slice().reverse();

    const stat = (v, l) => el('div', { class: 'card stat' }, el('span', { class: 'stat-value' }, v), el('span', { class: 'stat-label' }, l));
    mount($('auto-stats'), stat(runs.length, 'Automation runs'), stat(logs.filter((l) => l.status === 'executed').length, 'Rules executed'), stat(outbox.length, 'Outbox alerts'));

    mount($('run-rows'), runs.length ? runs.map((r) => el('tr', { dataset: { run: r.id } },
      el('td', { class: 'mono nowrap' }, r.id),
      el('td', { class: 'nowrap' }, UI.fmtDate(r.startedAt)),
      el('td', {}, el('span', { class: `badge ${r.ok ? 'ok' : 'danger'}` }, r.ok ? 'Success' : 'Failed'),
        r.summary ? el('div', { class: 'cell-sub' }, `${r.summary.name || ''} → ${r.summary.ticketId || 'no ticket'}${r.summary.priority ? ' (' + r.summary.priority + ')' : ''}`) : null,
        r.error ? el('div', { class: 'cell-sub' }, r.error) : null),
      el('td', {}, (r.results || []).map((x) => el('div', {}, statusBadge(x.status), ' ', el('span', { class: 'small' }, `${x.ruleId} ${x.name}`)))))) : emptyRow(4, 'No runs yet. Submit the website contact form or use the test form above.'));

    mount($('outbox-rows'), outbox.length ? outbox.map((m) => el('tr', { class: 'outbox-item' },
      el('td', { class: 'mono nowrap' }, m.id),
      el('td', {}, el('div', { class: 'cell-title' }, m.subject), el('div', { class: 'cell-sub' }, `To: ${m.to} · ${m.channel}`), el('div', { class: 'cell-sub pre-wrap' }, m.body)),
      el('td', {}, el('span', { class: 'badge warn' }, m.status)))) : emptyRow(3, 'No alerts. Urgent enquiries create one.'));

    mount($('log-rows'), logs.length ? logs.map((l) => el('tr', { class: 'log-item' },
      el('td', { class: 'nowrap small' }, UI.fmtDate(l.createdAt)),
      el('td', { class: 'nowrap' }, statusBadge(l.status), ' ', el('span', { class: 'mono small' }, l.ruleId)),
      el('td', { class: 'log-line' }, l.message))) : emptyRow(3, 'No log entries yet.'));
  }

  $('test-form').addEventListener('submit', async (e) => {
    e.preventDefault(); mount($('test-result'));
    const { ok, values } = validateForm(e.target, {
      name: [rules.required('Name'), rules.maxLen('Name', 80)], email: [rules.required('E-mail'), rules.email],
      message: [rules.required('Message'), rules.minLen('Message', 10), rules.maxLen('Message', 2000)],
    });
    if (!ok) { mount($('test-result'), UI.alertBox('error', 'Please fix the highlighted fields.')); return; }
    const out = await Automation.run('contact_form_submitted', Object.assign({ company: '', service: '' }, values));
    mount($('test-result'), out.ok
      ? UI.alertBox('success', `Run ${out.runId} finished.`, `Lead ${out.lead.id}, ticket ${out.ticket.id} (${out.ticket.priority})${out.alert ? ', alert ' + out.alert.id : ''}.`)
      : UI.alertBox('error', `Run ${out.runId} had errors.`, out.error || 'See the execution results below.'));
    e.target.reset(); renderData();
  });

  renderRules();
  renderData();
})();
