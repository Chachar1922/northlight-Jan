/**
 * Public website: contact / enquiry form.
 * The form does not create records itself. It hands the enquiry to the automation
 * engine (trigger "contact_form_submitted"), which applies rules.json:
 *   lead -> CRM, ticket -> Help Desk, urgent -> P1 + outbox alert, log entries.
 * Nothing leaves the browser.
 */
(function () {
  'use strict';
  const { el, validateForm, rules } = UI;

  UI.init();

  const form = document.getElementById('contact-form');
  const result = document.getElementById('form-result');
  const button = document.getElementById('submit-btn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    UI.mount(result);

    const { ok, values } = validateForm(form, {
      name: [rules.required('Your name'), rules.maxLen('Your name', 80)],
      email: [rules.required('E-mail address'), rules.email],
      company: [rules.maxLen('Company', 80)],
      service: [],
      message: [rules.required('Message'), rules.minLen('Message', 10), rules.maxLen('Message', 2000)],
    });
    if (!ok) {
      UI.mount(result, UI.alertBox('error', 'Please fix the highlighted fields.', 'Your enquiry has not been sent yet.'));
      return;
    }

    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const outcome = await Automation.run('contact_form_submitted', values);
      if (!outcome.ok || !outcome.ticket) throw new Error(outcome.error || 'An automation rule failed. See the Automation page for details.');

      const urgent = outcome.ticket.priority === 'P1';
      UI.mount(result, el('div', { class: 'alert success', role: 'status' },
        el('strong', {}, `Thank you, ${values.name}. Your enquiry has been received.`),
        el('span', {}, `Your reference is ${outcome.ticket.id}. `),
        el('span', {}, urgent
          ? 'We marked it as urgent and our IT and sales teams have been alerted. '
          : 'We will reply within one working day. '),
        el('span', { class: 'small' }, '(Demo: the enquiry is stored only in this browser.)')));
      form.reset();
      result.focus();
    } catch (err) {
      UI.mount(result, UI.alertBox('error', 'Sorry, we could not send your enquiry.', err.message));
    } finally {
      button.disabled = false;
      button.textContent = 'Send enquiry';
    }
  });
})();
