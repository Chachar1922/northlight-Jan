/**
 * Help Desk domain logic, shared by helpdesk.html, the public website (via automation) and the CRM.
 * Pure functions where possible, so the priority rules are easy to test and read.
 */
(function (global) {
  'use strict';

  const CFG = global.NL_CONFIG;
  const PRIORITY_ORDER = { P1: 1, P2: 2, P3: 3 };

  /** Options shown in the ticket form. */
  const IMPACT = [
    { value: 'many', label: 'Many people are affected' },
    { value: 'one', label: 'One person is blocked' },
    { value: 'minor', label: 'Minor issue – work can continue' },
  ];
  const URGENCY = [
    { value: 'security', label: 'Active security incident' },
    { value: 'money', label: 'Money or a client is at risk' },
    { value: 'deadline', label: 'A deadline is affected' },
    { value: 'none', label: 'No deadline' },
  ];

  /**
   * Priority rules:
   *  P1 – many people affected, money at risk, or a security risk happening now
   *  P2 – one person blocked, or a deadline affected
   *  P3 – minor issue, work can continue
   */
  function computePriority(impact, urgency) {
    if (impact === 'many' || urgency === 'security' || urgency === 'money') return 'P1';
    if (impact === 'one' || urgency === 'deadline') return 'P2';
    return 'P3';
  }
  function priorityReason(impact, urgency) {
    if (impact === 'many') return 'Many people are affected.';
    if (urgency === 'security') return 'Active security incident.';
    if (urgency === 'money') return 'Money or a client is at risk.';
    if (impact === 'one') return 'One person is blocked.';
    if (urgency === 'deadline') return 'A deadline is affected.';
    return 'Minor issue; work can continue.';
  }

  /** Add whole working days (Mon–Fri). A result that lands on a weekend moves to Monday, same time. */
  function addWorkingDays(startIso, days) {
    const d = new Date(startIso);
    let left = days;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) left--;
    }
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  function targetFor(priority) { return CFG.responseTargets[priority] || CFG.responseTargets.P3; }
  /** The moment a ticket must be answered by, from its creation time and priority. */
  function dueAtFor(createdAtIso, priority) {
    const t = targetFor(priority);
    return t.unit === 'hours'
      ? new Date(new Date(createdAtIso).getTime() + t.value * 3600000).toISOString()
      : addWorkingDays(createdAtIso, t.value);
  }
  function targetLabel(priority) {
    const t = targetFor(priority);
    const plural = t.value === 1 ? '' : 's';
    return t.unit === 'hours' ? `${t.value} hour${plural}` : `${t.value} working day${plural}`;
  }
  /** Incident-response steps for security tickets (null otherwise). */
  function guidanceFor(ticket) { return ticket.urgency === 'security' ? CFG.incidentResponse : null; }

  /** Add a reply (or note) to a ticket's history. */
  function addReply(id, author, text) {
    return Store.update('tickets', id, (t) => {
      const at = new Date().toISOString();
      return { updatedAt: at, history: (t.history || []).concat({ at, type: 'reply', author, text }) };
    });
  }

  /** A ticket is overdue when it is not resolved and its response target has passed. */
  function isOverdue(ticket, now = Date.now()) {
    return ticket.status !== 'Resolved' && new Date(ticket.dueAt).getTime() < now;
  }

  /** Sort by priority (P1 first), then oldest first. */
  function sortByPriority(tickets) {
    return tickets.slice().sort((a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || (new Date(a.createdAt) - new Date(b.createdAt)));
  }

  /** Create and store a ticket. `data`: requester, email, title, description, impact, urgency, source, priority? */
  function create(data) {
    const createdAt = new Date().toISOString();
    const priority = data.priority || computePriority(data.impact, data.urgency);
    return Store.add('tickets', {
      requester: data.requester, email: data.email || '', title: data.title, description: data.description || '',
      impact: data.impact, urgency: data.urgency, priority, status: 'New', source: data.source || 'helpdesk',
      leadId: data.leadId || null, category: data.category || null,
      createdAt, dueAt: dueAtFor(createdAt, priority), updatedAt: createdAt,
      history: [{ at: createdAt, text: `Ticket created with priority ${priority}. ${priorityReason(data.impact, data.urgency)}` }],
    });
  }

  function setStatus(id, status) {
    return Store.update('tickets', id, (t) => ({
      status, updatedAt: new Date().toISOString(),
      history: (t.history || []).concat({ at: new Date().toISOString(), text: `Status changed to ${status}.` }),
    }));
  }

  /** Change priority and recalculate the response target from the original creation time. */
  function setPriority(id, priority, reason) {
    return Store.update('tickets', id, (t) => ({
      priority, dueAt: dueAtFor(t.createdAt, priority), updatedAt: new Date().toISOString(),
      history: (t.history || []).concat({ at: new Date().toISOString(), text: `Priority set to ${priority}${reason ? ': ' + reason : '.'}` }),
    }));
  }

  global.Tickets = { IMPACT, URGENCY, computePriority, priorityReason, targetLabel, addWorkingDays, dueAtFor, guidanceFor, addReply, isOverdue, sortByPriority, create, setStatus, setPriority };
})(window);
