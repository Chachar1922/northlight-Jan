/**
 * Click-through troubleshooting guide for "No internet connection".
 * The decision tree is plain data below; the code just walks it.
 */
(function () {
  'use strict';
  const { el, mount } = UI;
  const $ = (id) => document.getElementById(id);

  UI.init();

  /**
   * question: { text, help, yes, no }   result: { result: true, tone, title, text, steps }
   * `yes`/`no` are ids of the next node.
   */
  const TREE = {
    start: {
      text: 'Does your computer show that it is connected to Wi-Fi or a network cable?',
      help: 'Look at the Wi-Fi / network icon in the taskbar or menu bar. Airplane mode must be off. (Doctor step 1)',
      yes: 'others', no: 'connect',
    },
    connect: {
      text: 'Turn Wi-Fi on (or plug in the cable) and switch off Airplane mode. Wait 20 seconds. Are you connected now?',
      help: 'On Wi-Fi, choose the office network and enter the password again if asked.',
      yes: 'fixed', no: 'adapter',
    },
    adapter: {
      result: true, tone: 'error', title: 'The network adapter is not working',
      text: 'Restart the computer once. If there is still no connection, try another cable or Wi-Fi network. If the computer still shows no adapter, the adapter may be disabled or faulty.',
      steps: ['Restart the computer.', 'Try a different cable or the guest Wi-Fi.', 'Create a Help Desk ticket (impact: one person blocked, so P2) and include what you tried.'],
    },
    others: {
      text: 'Can another device (for example your phone) on the same network get online?',
      help: 'Use the same Wi-Fi network as your computer, not mobile data. (Doctor steps 3 and 4)',
      yes: 'thisPc', no: 'router',
    },
    router: {
      text: 'Unplug the router, wait 30 seconds, plug it back in and wait 3 minutes. Does everything work again?',
      help: 'This restarts the router and clears most temporary faults. Do not press the reset button; that erases its settings.',
      yes: 'fixed', no: 'isp',
    },
    isp: {
      result: true, tone: 'warning', title: 'The internet line or the router is down',
      text: 'Nobody on the network can get online, so the problem is outside your computer: the router, the cable to the wall, or the internet provider.',
      steps: ['Check that the router’s “internet/WAN” light is on.', 'Check the status page of the internet provider or call them.', 'Tell IT. If many people are affected, this is a P1 ticket.'],
    },
    thisPc: {
      text: 'On your computer, does a website open if you type its numeric address, for example http://1.1.1.1 ?',
      help: 'If the numeric address works but names such as example.com do not, the DNS service is the problem. (Doctor steps 4 and 5)',
      yes: 'dns', no: 'restartPc',
    },
    dns: {
      result: true, tone: 'warning', title: 'Likely a DNS problem',
      text: 'The connection works, but names are not being translated into addresses.',
      steps: ['Restart the browser, then the computer.', 'Ask IT to check the DNS server on the router and on your computer (for example 1.1.1.1).', 'Run “npm run network-doctor”: step 5 will fail while step 4 passes.'],
    },
    restartPc: {
      text: 'Restart your computer and forget and re-join the Wi-Fi network. Does the internet work now?',
      help: 'Only this computer is affected, so the cause is usually its settings or Wi-Fi profile.',
      yes: 'fixed', no: 'escalate',
    },
    escalate: {
      result: true, tone: 'error', title: 'Ask IT to investigate this computer',
      text: 'Other devices work, but this computer does not, even after a restart.',
      steps: ['Create a Help Desk ticket (P2: one person blocked).', 'IT will run “npm run network-doctor” and “npm run pc-health” and fix the first failing step.'],
    },
    fixed: {
      result: true, tone: 'success', title: 'Great, you are back online',
      text: 'The problem is solved. If it keeps coming back, tell IT so the cause can be found.',
      steps: [],
    },
  };

  let history = [];           // [{id, answer}]
  let current = 'start';

  function render() {
    const node = TREE[current];
    $('progress').textContent = node.result ? 'Result' : `Question ${history.length + 1}`;
    if (node.result) {
      mount($('guide'), el('div', { class: `alert ${node.tone}`, id: 'guide-result' },
        el('strong', {}, node.title), el('span', {}, node.text)),
        node.steps.length ? el('ol', {}, node.steps.map((s) => el('li', {}, s))) : null);
    } else {
      mount($('guide'),
        el('h3', { id: 'guide-question' }, node.text),
        el('p', { class: 'muted' }, node.help),
        el('div', { class: 'form-actions' },
          el('button', { class: 'btn', type: 'button', id: 'answer-yes', onclick: () => answer('yes') }, 'Yes'),
          el('button', { class: 'btn secondary', type: 'button', id: 'answer-no', onclick: () => answer('no') }, 'No')));
    }
    mount($('path'), history.length ? history.map((h) => el('li', {}, `${TREE[h.id].text} → `, el('strong', {}, h.answer === 'yes' ? 'Yes' : 'No')))
      : el('li', { class: 'muted' }, 'No answers yet.'));
    $('back-btn').disabled = history.length === 0;
    const focusTarget = $('guide').querySelector('h3, strong');
    if (focusTarget && history.length) { focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus(); }
  }
  function answer(a) { history.push({ id: current, answer: a }); current = TREE[current][a]; render(); }

  $('back-btn').addEventListener('click', () => { const last = history.pop(); if (last) current = last.id; render(); });
  $('restart-btn').addEventListener('click', () => { history = []; current = 'start'; render(); });

  render();
})();
