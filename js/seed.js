/**
 * Sample (fictional) data, created once on first load by Store.seed().
 * Every name, address and credential below is made up.
 * Lines carrying the marker "fake-demo" are intentional demo credentials and are
 * allow-listed by the secret scanner (tests/e2e/secrets.spec.js).
 */
(function (global) {
  'use strict';

  const DEMO_DOMAIN = global.NL_CONFIG.demoDomain;
  const TARGET = global.NL_CONFIG.responseTargetsMinutes;

  /** Staff blueprint. Passwords are hashed with PBKDF2 at runtime (js/auth.js) – never stored in plain text. */
  const staffSpec = [
    { name: 'Elena Marsh',  department: 'IT',     role: 'IT Manager',            demoPassword: 'Demo-Pass-1!', totpSecret: 'JBSWY3DPEHPK3PXP' },       // fake-demo
    { name: 'Jonas Berg',   department: 'IT',     role: 'Systems Technician',    demoPassword: 'Demo-Pass-2!', totpSecret: 'KRSXG5CTMVRXEZLU' },       // fake-demo
    { name: 'Priya Nair',   department: 'Design', role: 'Senior Designer',       demoPassword: 'Demo-Pass-3!', totpSecret: 'MFRGGZDFMZTWQ2LK' },       // fake-demo
    { name: 'Liam Okafor',  department: 'Design', role: 'Product Designer',      demoPassword: 'Demo-Pass-4!', totpSecret: 'NBSWY3DPFQQHO33S' },       // fake-demo
    { name: 'Tomas Hale',   department: 'Sales',  role: 'Sales Manager',         demoPassword: 'Demo-Pass-5!', totpSecret: 'ORSXG5BAON2HE2LO' },       // fake-demo
    { name: 'Sofia Reyes',  department: 'Sales',  role: 'Account Executive',     demoPassword: 'Demo-Pass-6!', totpSecret: 'PFXXK4TBNVSXG43F' },       // fake-demo
  ];
  staffSpec.forEach((s, i) => {
    s.id = 'E-' + (1001 + i);
    s.email = s.name.toLowerCase().replace(/[^a-z]+/g, '.') + '@' + DEMO_DOMAIN;
  });

  function build(now) {
    const t = now.getTime();
    const ago = (min) => new Date(t - min * 60000).toISOString();
    const due = (createdMin, priority) => new Date(t - createdMin * 60000 + TARGET[priority] * 60000).toISOString();

    const ticket = (id, requester, title, description, impact, urgency, priority, status, createdMin, source) => ({
      id, requester, email: requester.toLowerCase().replace(/[^a-z]+/g, '.') + '@' + DEMO_DOMAIN,
      title, description, impact, urgency, priority, status, source: source || 'helpdesk',
      createdAt: ago(createdMin), dueAt: due(createdMin, priority), updatedAt: ago(createdMin),
      history: [{ at: ago(createdMin), text: 'Ticket created (sample data).' }],
    });

    return {
      tickets: [
        ticket('T-1001', 'Priya Nair', 'Wi-Fi down on the second floor', 'Nobody on the design floor can connect to the office Wi-Fi since 09:00. Wired desks work.', 'many', 'none', 'P1', 'In progress', 40),
        ticket('T-1002', 'Tomas Hale', 'New laptop for Maya must be ready by Monday', 'Maya (Sales) starts Monday. Needs a laptop, accounts, MFA enrolment and a headset.', 'one', 'deadline', 'P2', 'New', 70),
        ticket('T-1003', 'Liam Okafor', 'Meeting-room printer shows offline', 'Printer in Meeting Room B says offline. I can use the one in the hallway meanwhile.', 'minor', 'none', 'P3', 'New', 180),
        ticket('T-1004', 'Sofia Reyes', 'Suspicious e-mail asking to pay an invoice', 'Received an e-mail from "accounts@northlight-billing.example" asking for urgent bank-detail changes. I have not clicked anything.', 'one', 'security', 'P1', 'In progress', 8),
        ticket('T-1005', 'Elena Marsh', 'Design software licence expired for intern', 'Licence lapsed over the weekend; renewal has now been applied.', 'one', 'none', 'P2', 'Resolved', 1500),
      ],
      leads: [
        { id: 'L-1001', name: 'Hannah Cole', company: 'Brightfield Bakery', email: 'hannah.cole@brightfield.example', service: 'Brand identity', message: 'We are opening a second shop and want a fresh brand.', source: 'seed', status: 'New', createdAt: ago(2880) },
        { id: 'L-1002', name: 'Marcus Lee', company: 'Orbit Fitness', email: 'marcus.lee@orbitfit.example', service: 'Web design', message: 'Our booking website is slow and outdated.', source: 'seed', status: 'New', createdAt: ago(1500) },
        { id: 'L-1003', name: 'Ines Duarte', company: 'Harbour Books', email: 'ines.duarte@harbourbooks.example', service: 'Product design', message: 'Interested in designing a reading app prototype.', source: 'seed', status: 'New', createdAt: ago(300) },
      ],
      accounts: [
        { id: 'A-1001', name: 'Alder & Finch Architects', industry: 'Architecture', createdAt: ago(20000) },
        { id: 'A-1002', name: 'Kestrel Outdoor Co.', industry: 'Retail', createdAt: ago(15000) },
      ],
      contacts: [
        { id: 'C-1001', accountId: 'A-1001', name: 'Rosa Finch', email: 'rosa.finch@alderfinch.example', phone: '+44 20 7946 0101', createdAt: ago(20000) },
        { id: 'C-1002', accountId: 'A-1002', name: 'Dan Whitlock', email: 'dan.whitlock@kestrel.example', phone: '+44 20 7946 0102', createdAt: ago(15000) },
      ],
      opportunities: [
        { id: 'O-1001', accountId: 'A-1001', name: 'Alder & Finch brand refresh', stage: 'Quote', value: 18000, createdAt: ago(9000) },
        { id: 'O-1002', accountId: 'A-1002', name: 'Kestrel website redesign', stage: 'Qualified', value: 32000, createdAt: ago(7000) },
        { id: 'O-1003', accountId: 'A-1002', name: 'Kestrel packaging design', stage: 'Won', value: 9500, createdAt: ago(12000) },
        { id: 'O-1004', accountId: 'A-1001', name: 'Alder & Finch annual report', stage: 'Lost', value: 6000, createdAt: ago(11000) },
      ],
      cases: [
        { id: 'S-1001', accountId: 'A-1002', subject: 'Kestrel cannot open delivered logo files', priority: 'P2', status: 'Open', createdAt: ago(60), dueAt: due(60, 'P2') },
      ],
      staff: [],     // filled by Auth.ensureSeeded() because password hashing is asynchronous
      outbox: [],
      autolog: [],
      autoruns: [],
    };
  }

  global.NL_SEED = { build, staffSpec };
})(window);
