/**
 * Help Desk page: ticket form, sortable list, status updates, overdue labels, export.
 * All ticket text is rendered through UI.el (textContent), so HTML in a ticket is shown as plain text.
 */
(function () {
  'use strict';
  const { el, mount, validateForm, rules } = UI;
  const CFG = NL_CONFIG;

  UI.init();

  const $ = (id) => document.getElementById(id);
  const form = $('ticket-form');

  // ---- static pieces -------------------------------------------------------
  Tickets.IMPACT.forEach((o) => $('impact').append(el('option', { value: o.value }, o.label)));
  Tickets.URGENCY.forEach((o) => $('urgency').append(el('option', { value: o.value }, o.label)));
  $('impact').value = 'minor';
  $('urgency').value = 'none';
  CFG.ticketStatuses.forEach((s) => $('filter-status').append(el('option', { value: s }, s)));

  mount($('priority-guide'), ['P1', 'P2', 'P3'].map((p) => el('li', {},
    el('span', { class: `badge ${p.toLowerCase()}` }, p), ' ', CFG.priorityLabels[p], ' ',
    el('strong', {}, `(respond within ${Tickets.targetLabel(p)})`))));

  function updatePreview() {
    const p = Tickets.computePriority($('impact').value, $('urgency').value);
    mount($('priority-preview'), `Calculated priority: ${p} – ${Tickets.priorityReason($('impact').value, $('urgency').value)} Response target: ${Tickets.targetLabel(p)}.`);
  }
  $('impact').addEventListener('change', updatePreview);
  $('urgency').addEventListener('change', updatePreview);
  updatePreview();

  // ---- rendering -----------------------------------------------------------
  function statCard(value, label) { return el('div', { class: 'card stat' }, el('span', { class: 'stat-value' }, value), el('span', { class: 'stat-label' }, label)); }

  function render() {
    const now = Date.now();
    const all = Store.all('tickets');
    const open = all.filter((t) => t.status !== 'Resolved');
    mount($('stats'),
      statCard(open.length, 'Open tickets'),
      statCard(open.filter((t) => t.priority === 'P1').length, 'Open P1 tickets'),
      statCard(open.filter((t) => Tickets.isOverdue(t, now)).length, 'Overdue'),
      statCard(all.length - open.length, 'Resolved'));

    let rows = all.filter((t) => !$('filter-status').value || t.status === $('filter-status').value);
    rows = $('sort-by').value === 'newest'
      ? rows.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      : Tickets.sortByPriority(rows);

    if (!rows.length) { mount($('ticket-rows'), el('tr', {}, el('td', { colspan: '5', class: 'empty' }, 'No tickets match this filter.'))); return; }
    mount($('ticket-rows'), rows.map((t) => ticketRow(t, now)));
  }

  function ticketRow(t, now) {
    const overdue = Tickets.isOverdue(t, now);
    const select = el('select', { 'aria-label': `Status of ${t.id}`, dataset: { id: t.id },
      onchange: (e) => { Tickets.setStatus(t.id, e.target.value); UI.toast(`${t.id} is now ${e.target.value}.`); render(); } },
      CFG.ticketStatuses.map((s) => el('option', { value: s, selected: s === t.status }, s)));
    return el('tr', { dataset: { ticket: t.id } },
      el('td', { class: 'nowrap mono' }, t.id),
      el('td', {}, el('span', { class: `badge ${t.priority.toLowerCase()}` }, t.priority)),
      el('td', {},
        el('div', { class: 'cell-title' }, t.title),
        el('div', { class: 'cell-sub' }, `${t.requester}${t.requesterRole ? ' (' + t.requesterRole + ')' : ''}${t.email ? ' · ' + t.email : ''} · via ${t.source}`),
        t.description ? el('div', { class: 'cell-sub pre-wrap ticket-description' }, t.description) : null,
        guidanceBox(t), threadBox(t)),
      el('td', { class: 'nowrap' },
        el('div', {}, UI.fmtDate(t.dueAt)),
        t.status === 'Resolved' ? el('span', { class: 'badge ok' }, 'Met / closed')
          : overdue ? el('span', { class: 'badge overdue' }, 'Overdue') : el('span', { class: 'cell-sub' }, UI.fmtDelta(t.dueAt, now))),
      el('td', {}, select));
  }

  /** Incident-response checklist for active security incidents. */
  function guidanceBox(t) {
    const steps = Tickets.guidanceFor(t);
    return steps ? el('div', { class: 'incident-guide' }, el('strong', {}, 'Incident response'), el('ol', {}, steps.map((s) => el('li', {}, s)))) : null;
  }

  /** Who is writing a reply: the signed-in staff member if there is one, otherwise "Help Desk". */
  function replyAuthor() {
    const session = Store.session.get(CFG.auth.sessionKey);
    const user = session && Store.get('staff', session.userId);
    return user ? user.name : 'Help Desk';
  }

  /** Collapsible history + reply form. Replies are plain text (rendered with textContent). */
  function threadBox(t) {
    const history = t.history || [];
    const box = el('textarea', { id: `reply-${t.id}`, 'aria-label': `Reply to ${t.id}`, placeholder: 'Write a reply or note…', maxlength: '1000' });
    const detailsEl = el('details', { class: 'ticket-thread', dataset: { thread: t.id }, open: openThreads.has(t.id) ? true : null },
      el('summary', {}, `History and replies (${history.length})`),
      el('ul', { class: 'thread-list' }, history.map((h) => el('li', { class: `thread-item ${h.type === 'reply' ? 'reply' : ''}` },
        el('span', { class: 'thread-meta' }, `${UI.fmtDate(h.at)}${h.author ? ' · ' + h.author : ''}`), h.text))),
      el('div', { class: 'thread-form' }, box,
        el('button', { class: 'btn small secondary', type: 'button', onclick: () => {
          const text = box.value.trim();
          if (!text) { UI.toast('Write a reply first.', 'warning'); box.focus(); return; }
          Tickets.addReply(t.id, replyAuthor(), text.slice(0, 1000));
          openThreads.add(t.id); UI.toast(`Reply added to ${t.id}.`); render();
        } }, 'Add reply')));
    detailsEl.addEventListener('toggle', () => { if (detailsEl.open) openThreads.add(t.id); else openThreads.delete(t.id); });
    return detailsEl;
  }
  const openThreads = new Set();

  // ---- events --------------------------------------------------------------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    mount($('form-result'));
    const { ok, values } = validateForm(form, {
      requester: [rules.required('Requester'), rules.maxLen('Requester', 80)],
      title: [rules.required('Issue'), rules.minLen('Issue', 5), rules.maxLen('Issue', 120)],
      description: [rules.maxLen('Details', 2000)],
      impact: [rules.oneOf('Impact', Tickets.IMPACT.map((o) => o.value))],
      urgency: [rules.oneOf('Urgency', Tickets.URGENCY.map((o) => o.value))],
    });
    if (!ok) { mount($('form-result'), UI.alertBox('error', 'Please fix the highlighted fields.')); return; }
    const t = Tickets.create(Object.assign({}, values, { source: 'helpdesk' }));
    mount($('form-result'), UI.alertBox('success', `Ticket ${t.id} created with priority ${t.priority}.`, `Response target: ${Tickets.targetLabel(t.priority)}.`));
    form.reset(); $('impact').value = 'minor'; $('urgency').value = 'none'; updatePreview();
    render();
  });
  $('filter-status').addEventListener('change', render);
  $('sort-by').addEventListener('change', render);

  const stamp = () => new Date().toISOString().slice(0, 10);
  $('export-json').addEventListener('click', () => { UI.download(`northlight-tickets-${stamp()}.json`, JSON.stringify(Store.all('tickets'), null, 2)); UI.toast('Tickets exported as JSON.'); });
  $('export-csv').addEventListener('click', () => {
    const cols = ['id', 'priority', 'status', 'title', 'requester', 'email', 'impact', 'urgency', 'source', 'createdAt', 'dueAt', 'description'];
    UI.download(`northlight-tickets-${stamp()}.csv`, UI.toCsv(Store.all('tickets'), cols), 'text/csv'); UI.toast('Tickets exported as CSV.');
  });

  render();
  setInterval(render, 60000);      // refresh overdue labels
})();
