/**
 * Sample (fictional) data, created once on first load by Store.seed().
 * Every name, address and credential below is made up.
 * Lines carrying the marker "fake-demo" are intentional demo credentials and are
 * allow-listed by the secret scanner (tests/e2e/secrets.spec.js).
 */
(function (global) {
  'use strict';

  const DEMO_DOMAIN = global.NL_CONFIG.demoDomain;

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
    s.groups = [global.NL_CONFIG.defaultGroupByDepartment[s.department], 'All Staff'];
    s.id = 'E-' + (1001 + i);
    s.email = s.name.toLowerCase().replace(/[^a-z]+/g, '.') + '@' + DEMO_DOMAIN;
  });

  function build(now) {
    const t = now.getTime();
    const ago = (min) => new Date(t - min * 60000).toISOString();
    // Response target comes from the shared Help Desk rules (js/tickets.js), so seed data and live tickets agree.
    const due = (createdMin, priority) => global.Tickets.dueAtFor(ago(createdMin), priority);

    const ticket = (id, requester, role, title, description, impact, urgency, priority, status, createdMin) => ({
      id, requester, requesterRole: role, email: requester.toLowerCase().replace(/[^a-z]+/g, '.') + '@' + DEMO_DOMAIN,
      title, description, impact, urgency, priority, status, source: 'helpdesk',
      createdAt: ago(createdMin), dueAt: due(createdMin, priority), updatedAt: ago(createdMin),
      history: [{ at: ago(createdMin), text: 'Ticket created (sample data).' }],
    });

    return {
      tickets: [
        ticket('T-1001', 'Harriet Vale', 'Studio director', "I can't open my email and my client meeting starts in 30 minutes.", 'Outlook shows a sign-in loop on the studio director’s laptop. The meeting is with our largest client.', 'one', 'money', 'P1', 'In progress', 20),
        ticket('T-1002', 'Liam Okafor', 'Designer', 'The second-floor printer prints blank pages.', 'Every job comes out blank. The hallway printer works as a workaround.', 'minor', 'none', 'P3', 'New', 180),
        ticket('T-1003', 'Nadia Brooks', 'HR', 'New starter Maya begins Monday. She needs a laptop and accounts.', 'Needs a laptop, e-mail, file access and MFA enrolment before Monday 09:00.', 'one', 'deadline', 'P2', 'New', 70),
        ticket('T-1004', 'Oskar Lindqvist', 'Finance', 'Three of us got an invoice email with an attachment. One person opened it.', 'Sender is unknown. The attachment was opened on one finance PC. Possible phishing / malware.', 'many', 'security', 'P1', 'In progress', 75),
        ticket('T-1005', 'Mira Castellan', 'Account manager', 'Wi-Fi is slow in the meeting room.', 'Video calls stutter in Meeting Room A, mostly in the afternoon.', 'minor', 'none', 'P3', 'New', 300),
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
