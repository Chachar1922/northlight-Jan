/**
 * Automation engine – connects the public website, the Help Desk and the CRM.
 *
 * Rules live in rules.json (not in this file). This file only knows how to:
 *   1. load the rules,
 *   2. check each rule's trigger and "when" condition,
 *   3. run the rule's actions through a small registry of action handlers,
 *   4. write a log entry for every executed rule and store the run result.
 *
 * Everything is local. The "outbox" is just a list in localStorage – nothing is sent anywhere.
 */
(function (global) {
  'use strict';

  const CFG = global.NL_CONFIG;

  // ---- helpers -------------------------------------------------------------
  /** Resolve "ticket.id" style paths inside the context object. */
  function lookup(ctx, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), ctx);
  }
  /** Replace {{path}} placeholders. Missing values become an empty string. */
  function render(template, ctx) {
    return String(template == null ? '' : template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => {
      const v = lookup(ctx, p);
      return v === undefined || v === null ? '' : String(v);
    });
  }
  /** Whole-word, case-insensitive match ("URGENT!" matches "urgent", "urgently" does not). */
  function containsWord(text, word) {
    const esc = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^\\p{L}\\p{N}_])' + esc + '(?![\\p{L}\\p{N}_])', 'iu').test(String(text || ''));
  }

  /** Evaluate a rule's "when" condition. null/undefined = always. */
  function conditionMet(when, ctx) {
    if (!when) return true;
    const value = lookup(ctx, when.field);
    if (when.containsWord !== undefined) return containsWord(value, when.containsWord);
    if (when.equals !== undefined) return String(value) === String(when.equals);
    return false;
  }

  // ---- action handlers -----------------------------------------------------
  const actions = {
    create_lead(params, ctx) {
      ctx.lead = CRM.createLead({ name: ctx.name, company: ctx.company, email: ctx.email, service: ctx.service, message: ctx.message, source: params.source || 'automation' });
    },
    create_ticket(params, ctx) {
      ctx.ticket = Tickets.create({
        requester: ctx.name, email: ctx.email, title: render(params.title, ctx) || 'Enquiry', description: ctx.message,
        impact: params.impact || 'minor', urgency: params.urgency || 'none', source: params.source || 'automation',
        category: params.category || null, leadId: ctx.lead ? ctx.lead.id : null,
      });
    },
    set_ticket_priority(params, ctx) {
      if (!ctx.ticket) throw new Error('No ticket exists yet (rule order matters).');
      ctx.ticket = Tickets.setPriority(ctx.ticket.id, params.priority, render(params.reason, ctx));
    },
    create_outbox_alert(params, ctx) {
      ctx.alert = Store.add('outbox', {
        channel: params.channel || 'internal', to: params.to || '', subject: render(params.subject, ctx), body: render(params.body, ctx),
        status: 'Queued locally (never sent)', ticketId: ctx.ticket ? ctx.ticket.id : null,
      });
    },
  };

  // ---- rule loading --------------------------------------------------------
  async function loadRules() {
    const res = await fetch(CFG.rulesUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load ${CFG.rulesUrl} (HTTP ${res.status}).`);
    const json = await res.json();
    if (!json || !Array.isArray(json.rules)) throw new Error('rules.json has no "rules" array.');
    return json.rules;
  }

  function logEntry(runId, rule, status, message, trigger) {
    return Store.add('autolog', { runId, ruleId: rule ? rule.id : '—', ruleName: rule ? rule.name : 'Rule loader', trigger, status, message });
  }

  /**
   * Run every rule that listens to `trigger`.
   * @returns {Promise<{ok:boolean, runId:string, results:Array, lead?:object, ticket?:object, alert?:object, error?:string}>}
   */
  async function run(trigger, payload) {
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const runId = Store.nextId('autoruns');
    const ctx = Object.assign({ name: '', email: '', company: '', service: '', message: '', lead: null, ticket: null, alert: null }, payload);
    const results = [];
    let rules;

    try { rules = await loadRules(); } catch (err) {
      logEntry(runId, null, 'error', err.message, trigger);
      Store.add('autoruns', { id: runId, trigger, startedAt, durationMs: Math.round(performance.now() - t0), ok: false, error: err.message, results: [] });
      return { ok: false, runId, results, error: err.message };
    }

    for (const rule of rules.filter((r) => r.trigger === trigger)) {
      if (!conditionMet(rule.when, ctx)) {
        results.push({ ruleId: rule.id, name: rule.name, status: 'skipped', detail: 'Condition not met.', at: new Date().toISOString() });
        continue;
      }
      try {
        for (const action of rule.actions || []) {
          const handler = actions[action.type];
          if (!handler) throw new Error(`Unknown action type "${action.type}".`);
          handler(action, ctx);
        }
        const message = render(rule.log || rule.name, ctx);
        logEntry(runId, rule, 'executed', message, trigger);
        results.push({ ruleId: rule.id, name: rule.name, status: 'executed', detail: message, at: new Date().toISOString() });
      } catch (err) {
        logEntry(runId, rule, 'error', err.message, trigger);
        results.push({ ruleId: rule.id, name: rule.name, status: 'error', detail: err.message, at: new Date().toISOString() });
      }
    }

    const ok = results.every((r) => r.status !== 'error');
    Store.add('autoruns', {
      id: runId, trigger, startedAt, durationMs: Math.round(performance.now() - t0), ok, results,
      summary: { name: ctx.name, leadId: ctx.lead && ctx.lead.id, ticketId: ctx.ticket && ctx.ticket.id, priority: ctx.ticket && ctx.ticket.priority, alertId: ctx.alert && ctx.alert.id },
    });
    return { ok, runId, results, lead: ctx.lead, ticket: ctx.ticket, alert: ctx.alert };
  }

  global.Automation = { run, loadRules, render, containsWord, conditionMet };
})(window);
