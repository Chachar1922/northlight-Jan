/**
 * CRM page: tabs, leads (+ convert), accounts, contacts, opportunities, support cases,
 * and the plain-SVG "opportunities by stage" chart (no chart library).
 */
(function () {
  'use strict';
  const { el, mount, validateForm, rules } = UI;
  const CFG = NL_CONFIG;
  const $ = (id) => document.getElementById(id);
  const money = (n) => Number(n || 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

  UI.init();

  // ---- tabs ----------------------------------------------------------------
  const TABS = [['dashboard', 'Dashboard'], ['leads', 'Leads'], ['accounts', 'Accounts'], ['contacts', 'Contacts'], ['opportunities', 'Opportunities'], ['cases', 'Support cases']];
  function showTab(id) {
    TABS.forEach(([t]) => {
      $(`panel-${t}`).hidden = t !== id;
      const b = $(`tab-${t}`);
      b.setAttribute('aria-selected', String(t === id));
      b.tabIndex = t === id ? 0 : -1;
    });
  }
  mount($('tabs'), TABS.map(([id, label], i) => el('button', {
    class: 'tab', role: 'tab', id: `tab-${id}`, 'aria-controls': `panel-${id}`, type: 'button',
    onclick: () => showTab(id),
    onkeydown: (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      const next = TABS[(i + dir + TABS.length) % TABS.length][0];
      showTab(next); $(`tab-${next}`).focus();
    },
  }, label)));
  showTab('dashboard');

  const accountName = (id) => { const a = Store.get('accounts', id); return a ? a.name : '—'; };
  const empty = (cols, text) => el('tr', {}, el('td', { colspan: String(cols), class: 'empty' }, text));

  // ---- SVG chart -----------------------------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, text) {
    const n = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function drawChart(summary) {
    const W = 560, H = 280, L = 44, R = 16, T = 20, B = 44;
    const max = Math.max(4, ...summary.map((s) => s.count));
    const plotW = W - L - R, plotH = H - T - B;
    const slot = plotW / summary.length, barW = Math.min(64, slot * 0.6);
    const y = (v) => T + plotH - (v / max) * plotH;

    const total = summary.reduce((s, x) => s + x.count, 0);
    const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Bar chart of opportunities by stage. ${summary.map((s) => `${s.stage}: ${s.count}`).join(', ')}. Total ${total}.` });
    // Grid lines + y-axis labels (integers only).
    const step = max <= 8 ? 1 : Math.ceil(max / 8);
    for (let v = 0; v <= max; v += step) {
      root.append(svg('line', { class: 'grid-line', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      root.append(svg('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11 }, v));
    }
    root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(0), y2: y(0) }));
    summary.forEach((s, i) => {
      const cx = L + slot * i + slot / 2;
      const h = (s.count / max) * plotH;
      const g = svg('g', { 'data-stage': s.stage, 'data-count': s.count });
      g.append(svg('title', {}, `${s.stage}: ${s.count} opportunities, ${money(s.value)}`));
      g.append(svg('rect', { class: `bar bar-${s.stage.toLowerCase()}`, x: cx - barW / 2, y: y(s.count), width: barW, height: h, rx: 4 }));
      g.append(svg('text', { x: cx, y: y(s.count) - 6, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700 }, s.count));
      g.append(svg('text', { x: cx, y: H - 22, 'text-anchor': 'middle', 'font-size': 12 }, s.stage));
      g.append(svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle', 'font-size': 10 }, money(s.value)));
      root.append(g);
    });
    mount($('stage-chart'), root);
    $('stage-summary').textContent = `${total} opportunities in total. Value shown under each stage.`;
  }

  // ---- renderers -----------------------------------------------------------
  function renderDashboard() {
    const summary = CRM.stageSummary();
    drawChart(summary);
    const by = (stage) => summary.find((s) => s.stage === stage);
    const openCases = Store.all('cases').filter((c) => c.status === 'Open');
    const stat = (v, l) => el('div', { class: 'card stat' }, el('span', { class: 'stat-value' }, v), el('span', { class: 'stat-label' }, l));
    mount($('crm-stats'),
      stat(Store.all('leads').filter((l) => l.status === 'New').length, 'New leads'),
      stat(summary.filter((s) => !['Won', 'Lost'].includes(s.stage)).reduce((n, s) => n + s.value, 0) ? money(summary.filter((s) => !['Won', 'Lost'].includes(s.stage)).reduce((n, s) => n + s.value, 0)) : money(0), 'Open pipeline value'),
      stat(money(by('Won').value), 'Won value'),
      stat(openCases.filter((c) => CRM.isCaseOverdue(c)).length + ' / ' + openCases.length, 'Overdue / open cases'));
  }

  function renderLeads() {
    const leads = Store.all('leads').slice().reverse();
    mount($('lead-rows'), leads.length ? leads.map((l) => el('tr', { dataset: { lead: l.id } },
      el('td', { class: 'mono nowrap' }, l.id),
      el('td', {}, el('div', { class: 'cell-title' }, l.name), el('div', { class: 'cell-sub' }, `${l.company || 'No company'} · ${l.email}`),
        l.message ? el('div', { class: 'cell-sub pre-wrap' }, l.message) : null),
      el('td', {}, l.source),
      el('td', {}, el('span', { class: `badge ${l.status === 'Converted' ? 'ok' : l.status === 'Disqualified' ? 'neutral' : 'info'}` }, l.status)),
      el('td', {}, l.status === 'Converted' || l.status === 'Disqualified' ? el('span', { class: 'cell-sub' }, l.status === 'Converted' ? 'Done' : '—') : [
        el('button', { class: 'btn small convert-btn', type: 'button', onclick: () => convert(l.id) }, 'Convert'),
        el('button', { class: 'btn small secondary', type: 'button', onclick: () => { CRM.setLeadStatus(l.id, 'Disqualified'); renderAll(); } }, 'Disqualify')])))
      : empty(5, 'No leads yet.'));
  }

  function renderAccounts() {
    const rows = Store.all('accounts');
    const contacts = Store.all('contacts'), opps = Store.all('opportunities');
    mount($('account-rows'), rows.length ? rows.map((a) => el('tr', {},
      el('td', { class: 'mono' }, a.id), el('td', { class: 'cell-title' }, a.name), el('td', {}, a.industry || '—'),
      el('td', {}, contacts.filter((c) => c.accountId === a.id).length), el('td', {}, opps.filter((o) => o.accountId === a.id).length))) : empty(5, 'No accounts yet.'));
  }
  function renderContacts() {
    const rows = Store.all('contacts');
    mount($('contact-rows'), rows.length ? rows.map((c) => el('tr', {},
      el('td', { class: 'mono' }, c.id), el('td', { class: 'cell-title' }, c.name), el('td', {}, c.email), el('td', {}, accountName(c.accountId)))) : empty(4, 'No contacts yet.'));
  }
  function renderOpportunities() {
    const rows = Store.all('opportunities');
    mount($('opportunity-rows'), rows.length ? rows.map((o) => el('tr', { dataset: { opp: o.id } },
      el('td', { class: 'mono' }, o.id), el('td', { class: 'cell-title' }, o.name), el('td', {}, accountName(o.accountId)), el('td', {}, money(o.value)),
      el('td', {}, el('select', { 'aria-label': `Stage of ${o.id}`, dataset: { id: o.id }, onchange: (e) => { CRM.setOpportunityStage(o.id, e.target.value); UI.toast(`${o.id} moved to ${e.target.value}.`); renderAll(); } },
        CRM.STAGES.map((s) => el('option', { value: s, selected: s === o.stage }, s)))),
      reasonCell(o))) : empty(6, 'No opportunities yet.'));
  }
  /** Won/lost opportunities record why. Other stages show a dash. */
  function reasonCell(o) {
    if (o.stage !== 'Won' && o.stage !== 'Lost') return el('td', { class: 'muted' }, '—');
    const input = el('input', { type: 'text', class: 'reason-input', id: `reason-${o.id}`, 'aria-label': `Why was ${o.id} ${o.stage.toLowerCase()}?`, value: o.reason || '', maxlength: '300', placeholder: o.stage === 'Won' ? 'Why did we win?' : 'Why did we lose?' });
    const save = () => { CRM.setOpportunityReason(o.id, input.value); UI.toast(`Reason saved for ${o.id}.`); renderAll(); };
    return el('td', {}, el('div', { class: 'row' }, input,
      el('button', { class: 'btn small secondary', type: 'button', onclick: save }, 'Save')),
      o.reason ? null : el('span', { class: 'badge warn' }, 'Reason needed'));
  }

  function renderCases() {
    const cases = Store.all('cases').slice().reverse();
    mount($('case-account'), el('option', { value: '' }, 'No account'), Store.all('accounts').map((a) => el('option', { value: a.id }, a.name)));
    mount($('case-rows'), cases.length ? cases.map((c) => {
      const overdue = CRM.isCaseOverdue(c);
      return el('tr', { dataset: { case: c.id } },
        el('td', { class: 'mono' }, c.id),
        el('td', {}, el('div', { class: 'cell-title' }, c.subject), el('div', { class: 'cell-sub' }, accountName(c.accountId))),
        el('td', {}, el('span', { class: `badge ${c.priority.toLowerCase()}` }, c.priority)),
        el('td', { class: 'nowrap' }, UI.fmtDate(c.dueAt), el('br'),
          c.status === 'Open' ? (overdue ? el('span', { class: 'badge overdue' }, 'Overdue') : el('span', { class: 'cell-sub' }, UI.fmtDelta(c.dueAt))) : null),
        el('td', {}, c.status === 'Open'
          ? [el('span', { class: 'badge warn' }, 'Open'), ' ', el('button', { class: 'btn small secondary', type: 'button', onclick: () => { CRM.closeCase(c.id); renderAll(); } }, 'Close')]
          : el('span', { class: 'badge ok' }, 'Closed')));
    }) : empty(5, 'No support cases.'));
  }

  function renderAll() { renderDashboard(); renderLeads(); renderAccounts(); renderContacts(); renderOpportunities(); renderCases(); }

  // ---- actions -------------------------------------------------------------
  function convert(leadId) {
    try {
      const { account, contact, opportunity } = CRM.convertLead(leadId);
      mount($('page-result'), UI.alertBox('success', `Lead ${leadId} converted.`, `Created account ${account.name} (${account.id}), contact ${contact.name} (${contact.id}) and opportunity ${opportunity.id} at stage "Lead".`));
      renderAll();
    } catch (err) { mount($('page-result'), UI.alertBox('error', 'Could not convert lead.', err.message)); }
  }

  $('lead-form').addEventListener('submit', (e) => {
    e.preventDefault(); mount($('lead-result'));
    const f = e.target;
    const { ok, values } = validateForm(f, {
      name: [rules.required('Name'), rules.maxLen('Name', 80)], email: [rules.required('E-mail'), rules.email],
      company: [rules.maxLen('Company', 80)], service: [], message: [rules.maxLen('Notes', 2000)],
    });
    if (!ok) { mount($('lead-result'), UI.alertBox('error', 'Please fix the highlighted fields.')); return; }
    const lead = CRM.createLead(Object.assign({}, values, { source: 'crm' }));
    mount($('lead-result'), UI.alertBox('success', `Lead ${lead.id} added.`));
    f.reset(); renderAll();
  });

  $('case-form').addEventListener('submit', (e) => {
    e.preventDefault(); mount($('case-result'));
    const f = e.target;
    const { ok, values } = validateForm(f, {
      subject: [rules.required('Subject'), rules.minLen('Subject', 5), rules.maxLen('Subject', 120)],
      accountId: [], priority: [rules.oneOf('Priority', ['P1', 'P2', 'P3'])], dueAt: [],
    });
    if (!ok) { mount($('case-result'), UI.alertBox('error', 'Please fix the highlighted fields.')); return; }
    const due = values.dueAt ? new Date(values.dueAt) : null;
    if (values.dueAt && isNaN(due)) { UI.setFieldError($('case-due'), 'Enter a valid date and time.'); return; }
    const c = CRM.createCase({ subject: values.subject, accountId: values.accountId, priority: values.priority, dueAt: due ? due.toISOString() : null });
    mount($('case-result'), UI.alertBox('success', `Case ${c.id} created.`, `Due ${UI.fmtDate(c.dueAt)}.`));
    f.reset(); renderAll();
  });

  renderAll();
  setInterval(renderCases, 60000);
})();
