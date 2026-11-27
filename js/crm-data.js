/**
 * CRM domain logic: leads, accounts, contacts, opportunities, support cases.
 * Shared by crm.html and the automation engine so both write identical records.
 */
(function (global) {
  'use strict';

  const CFG = global.NL_CONFIG;
  const STAGES = CFG.opportunityStages;

  function createLead(data) {
    return Store.add('leads', {
      name: data.name, company: data.company || '', email: data.email, service: data.service || '',
      message: data.message || '', source: data.source || 'crm', status: 'New',
    });
  }

  /**
   * Convert a lead into an account + contact + opportunity (stage "Lead").
   * Re-uses an existing account with the same name. Refuses to convert twice.
   */
  function convertLead(leadId) {
    const lead = Store.get('leads', leadId);
    if (!lead) throw new Error('Lead not found.');
    if (lead.status === 'Converted') throw new Error('This lead has already been converted.');

    const accountName = lead.company || `${lead.name} (individual)`;
    let account = Store.all('accounts').find((a) => a.name.toLowerCase() === accountName.toLowerCase());
    if (!account) account = Store.add('accounts', { name: accountName, industry: '' });
    const contact = Store.add('contacts', { accountId: account.id, name: lead.name, email: lead.email, phone: '' });
    const opportunity = Store.add('opportunities', {
      accountId: account.id, name: `${lead.service || 'New project'} – ${accountName}`, stage: 'Lead', value: 0, leadId: lead.id,
    });
    Store.update('leads', lead.id, { status: 'Converted', convertedTo: { accountId: account.id, contactId: contact.id, opportunityId: opportunity.id } });
    return { account, contact, opportunity };
  }

  function setLeadStatus(id, status) { return Store.update('leads', id, { status }); }
  function setOpportunityStage(id, stage) {
    if (!STAGES.includes(stage)) throw new Error('Unknown stage.');
    return Store.update('opportunities', id, { stage });
  }

  /** Record why an opportunity was won or lost. */
  function setOpportunityReason(id, reason) { return Store.update('opportunities', id, { reason: String(reason).trim().slice(0, 300) }); }

  /** Count and total value of opportunities per stage, in pipeline order. */
  function stageSummary() {
    const opps = Store.all('opportunities');
    return STAGES.map((stage) => {
      const rows = opps.filter((o) => o.stage === stage);
      return { stage, count: rows.length, value: rows.reduce((s, o) => s + (Number(o.value) || 0), 0) };
    });
  }

  function createCase(data) {
    const createdAt = new Date().toISOString();
    return Store.add('cases', {
      accountId: data.accountId || '', subject: data.subject, priority: data.priority, status: 'Open', createdAt,
      dueAt: data.dueAt || global.Tickets.dueAtFor(createdAt, data.priority),
    });
  }
  function closeCase(id) { return Store.update('cases', id, { status: 'Closed', closedAt: new Date().toISOString() }); }
  function isCaseOverdue(c, now = Date.now()) { return c.status === 'Open' && new Date(c.dueAt).getTime() < now; }

  global.CRM = { setOpportunityReason, STAGES, createLead, convertLead, setLeadStatus, setOpportunityStage, stageSummary, createCase, closeCase, isCaseOverdue };
})(window);
