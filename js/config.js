/**
 * Centralised application settings for Northlight Studio IT.
 * Every module reads its settings from here – nothing is hard-coded elsewhere.
 * All values are fictional / demo values. No secrets belong in this file.
 */
(function (global) {
  'use strict';

  const config = {
    appName: 'Northlight Studio IT',
    company: 'Northlight Studio',
    version: '1.0.0',
    env: 'demo',

    /** All localStorage keys start with this prefix (github.io origins are shared between projects). */
    storagePrefix: 'nl.',

    /** Files fetched at runtime (relative URLs so the site works under /<repo>/ on GitHub Pages). */
    rulesUrl: 'rules.json',
    healthUrl: 'health.json',

    /** Help Desk response targets in minutes, per priority. */
    responseTargetsMinutes: { P1: 15, P2: 240, P3: 1440 },
    priorityLabels: {
      P1: 'Many people affected, money at risk, or a security risk happening now',
      P2: 'One person blocked, or a deadline is affected',
      P3: 'Minor issue – work can continue',
    },
    ticketStatuses: ['New', 'In progress', 'Resolved'],

    /** CRM */
    opportunityStages: ['Lead', 'Qualified', 'Quote', 'Won', 'Lost'],
    leadStatuses: ['New', 'Contacted', 'Converted', 'Disqualified'],

    /** Fictional staff domain used for demo e-mail addresses. */
    demoDomain: 'northlight.example',

    /** Demo authentication settings (learning model only – see RISKS.md). */
    auth: {
      pbkdf2Iterations: 100000,
      totpStepSeconds: 30,
      totpDigits: 6,
      totpWindow: 1,          // accept the previous/next 30 s code for clock drift
      sessionKey: 'session',  // sessionStorage key (prefixed)
    },

    /** Shared navigation, rendered by js/ui.js on every internal page. */
    nav: [
      { id: 'site', label: 'Public website', href: 'index.html', icon: '⌂', group: 'Studio' },
      { id: 'helpdesk', label: 'Help Desk', href: 'helpdesk.html', icon: '✉', group: 'Operations' },
      { id: 'crm', label: 'CRM', href: 'crm.html', icon: '▦', group: 'Operations' },
      { id: 'automation', label: 'Automation', href: 'automation.html', icon: '↻', group: 'Operations' },
      { id: 'staff', label: 'Staff & MFA', href: 'staff.html', icon: '☺', group: 'People & IT' },
      { id: 'troubleshoot', label: 'Troubleshooter', href: 'troubleshoot.html', icon: '⚒', group: 'People & IT' },
      { id: 'settings', label: 'Data & Cloud', href: 'settings.html', icon: '☁', group: 'People & IT' },
    ],
  };

  global.NL_CONFIG = Object.freeze(config);
})(window);
