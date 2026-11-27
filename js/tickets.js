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
    { value: 'security', label: 'Security risk happening now' },
    { value: 'money', label: 'Money is at risk' },
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
    if (urgency === 'security') return 'Security risk happening now.';
    if (urgency === 'money') return 'Money is at risk.';
    if (impact === 'one') return 'One person is blocked.';
    if (urgency === 'deadline') return 'A deadline is affected.';
    return 'Minor issue; work can continue.';
  }

  function targetMinutes(priority) { return CFG.responseTargetsMinutes[priority] || CFG.responseTargetsMinutes.P3; }
  function dueAtFor(createdAtIso, priority) { return new Date(new Date(createdAtIso).getTime() + targetMinutes(priority) * 60000).toISOString(); }
  function targetLabel(priority) {
    const m = targetMinutes(priority);
    return m >= 1440 ? `${m / 1440} day` : m >= 60 ? `${m / 60} h` : `${m} min`;
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

  global.Tickets = { IMPACT, URGENCY, computePriority, priorityReason, targetMinutes, targetLabel, dueAtFor, isOverdue, sortByPriority, create, setStatus, setPriority };
})(window);
