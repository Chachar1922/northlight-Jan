/**
 * Data & Cloud page: health.json, config summary, cloud description, "Export all data".
 */
(function () {
  'use strict';
  const { el, mount } = UI;
  const CFG = NL_CONFIG;
  const $ = (id) => document.getElementById(id);

  UI.init();

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }

  async function renderHealth() {
    try {
      const h = await getJson(CFG.healthUrl);
      mount($('health'), [['Application', h.name], ['Version', h.version], ['Build date', h.buildDate], ['Status', 'OK']].map(([k, v]) =>
        el('div', { class: 'row between' }, el('dt', { class: 'muted' }, k), el('dd', { class: 'mono health-' + k.toLowerCase().replace(' ', '-') }, v))));
    } catch (err) { mount($('health'), UI.alertBox('error', 'health.json could not be loaded.', err.message)); }
  }

  function renderConfig() {
    const rows = [
      ['App name', CFG.appName], ['Version', CFG.version], ['Environment', CFG.env], ['Storage prefix', CFG.storagePrefix], ['Rules file', CFG.rulesUrl],
      ['Response targets (min)', Object.entries(CFG.responseTargetsMinutes).map(([k, v]) => `${k}=${v}`).join(', ')],
      ['Opportunity stages', CFG.opportunityStages.join(' → ')],
      ['Password hashing', `PBKDF2-SHA256, ${CFG.auth.pbkdf2Iterations.toLocaleString()} iterations`],
      ['TOTP', `${CFG.auth.totpDigits} digits, ${CFG.auth.totpStepSeconds} s step`],
    ];
    mount($('cfg-rows'), rows.map(([k, v]) => el('tr', {}, el('th', { scope: 'row' }, k), el('td', {}, v))));
  }

  async function renderCloud() {
    try {
      const c = await getJson('northlight.cloud.json');
      const all = [Object.assign({ type: 'resourceGroup' }, c.resourceGroup)].concat(c.resources);
      mount($('cloud-rows'), all.map((r) => el('tr', {},
        el('td', {}, r.type), el('td', { class: 'mono' }, r.name),
        el('td', {}, r.tags.owner), el('td', {}, r.tags.env), el('td', {}, r.tags['cost-center']))));
    } catch (err) { mount($('cloud-rows'), el('tr', {}, el('td', { colspan: '5', class: 'empty' }, `Could not load cloud description: ${err.message}`))); }
  }

  function renderCounts() {
    const parts = Store.COLLECTIONS.map((n) => `${n}: ${Store.all(n).length}`);
    $('data-counts').textContent = parts.join(' · ');
  }

  $('export-all').addEventListener('click', async () => {
    await Auth.ensureSeeded();               // make sure the staff collection exists before exporting
    const data = Store.exportAll();
    const keys = Object.keys(data.data);
    UI.download(`northlight-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
    mount($('page-result'), UI.alertBox('success', 'Export created.', `${keys.length} collections exported: ${keys.join(', ')}.`));
    renderCounts();
  });

  $('reset-data').addEventListener('click', () => {
    if (!confirm('Delete ALL demo data stored in this browser and restore the sample data?')) return;
    Store.resetAll();
    Store.seed();
    mount($('page-result'), UI.alertBox('success', 'Demo data was reset to the sample data.'));
    renderCounts();
  });

  renderConfig(); renderCounts(); renderHealth(); renderCloud();
})();
