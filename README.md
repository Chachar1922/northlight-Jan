# Northlight Studio – IT Management Platform

A complete, working IT management website for **Northlight Studio**, a fictional 25-person design studio (departments: Design, Sales and IT) that has just moved into a new office. A new employee, Maya, starts on Monday, so the studio needs employees, devices, networking, customer enquiries, support tickets, automation and security in one place.

It is an individual portfolio project built with **plain HTML, CSS and JavaScript** (no frameworks), **localStorage** for persistence, **Node.js** only for diagnostic scripts and tests, **Playwright** (plus axe-core) for automated tests and **GitHub Actions** for CI/CD to GitHub Pages.

> **All data is fictional.** Names, e-mail addresses, customers and credentials are made up. Nothing is sent to a server or e-mail address. See [RISKS.md](RISKS.md) for security risks and the limits of a browser-only demo.

**Live site:** https://chachar1922.github.io/northlight-Jan/ (deployed by GitHub Actions on every push to `main`).

## The nine modules

| # | Module | Page / files | What it does |
|---|--------|--------------|--------------|
| 1 | Help Desk | `helpdesk.html`, `js/helpdesk.js`, `css/helpdesk.css`, `js/tickets.js` | Tickets with P1/P2/P3 priority (P1 1 hour, P2 1 working day, P3 3 working days), overdue labels, status updates, incident-response steps for security tickets, reply history, JSON/CSV export, 5 sample tickets |
| 2 | PC & network tools | `tools/pc-health.js`, `tools/network-doctor.js`, `troubleshoot.html` | Read-only diagnostics with PASS/FAIL (SKIP when unavailable) and plain explanations, optional dated report files, click-through "No internet connection" guide |
| 3 | Staff directory & MFA | `staff.html`, `js/auth.js`, `js/staff.js` | 6 employees with roles and groups, PBKDF2 hashing and TOTP (Web Crypto), IT-admin-only admin section, joiner / leaver workflows, CSV import, sessions ended on leaving |
| 4 | Public website | `index.html`, `js/site.js` | Company site with services, FAQ (JSON-LD), validated enquiry form |
| 5 | CRM | `crm.html`, `js/crm.js`, `js/crm-data.js` | Leads, accounts, contacts, opportunities, support cases, lead conversion, won/lost reasons, plain-SVG stage chart |
| 6 | Automation | `automation.html`, `js/automation.js`, `rules.json` | Rule engine driven by `rules.json`: enquiry → lead + ticket, "urgent" → P1 + outbox alert, logs with times, rule names and results |
| 7 | Cloud-ready config & CI/CD | `health.json`, `config.js`, `northlight.cloud.json`, `tools/check-cloud.js`, `settings.html`, `.github/workflows/deploy.yml` | Central settings, "Export all data", cloud description validated before deployment |
| 8 | Security tests | `tests/`, `RISKS.md` | Playwright security tests, secret scan, axe-core accessibility scan, unit tests |
| 9 | Unique UI | `ui-prompt.md`, `css/` | "Harbour Light": an editorial paper-and-lantern design (top navigation, serif headings, ruled tables, hard offset shadows) used on every page |

### How the modules talk to each other

```
 Public website (index.html)
        │ contact form submit
        ▼
 Automation engine (js/automation.js) ── reads ──► rules.json
        │ executes rules in order
        ├── R1 create_lead ───────► CRM        (nl.leads)
        ├── R2 create_ticket ─────► Help Desk  (nl.tickets)
        ├── R3 word "urgent"? ────► ticket priority → P1
        ├── R4 word "urgent"? ────► Outbox     (nl.outbox, never sent)
        └── every executed rule ──► Log        (nl.autolog) + run result (nl.autoruns)

 All modules read/write through js/storage.js (one namespaced key per collection),
 so "Export all data" (settings.html) can download everything as a single JSON file.
```

Shared pieces: `js/storage.js` (the only code touching storage), `js/ui.js` (safe DOM building, navigation, validation, notifications, downloads), `config.js` (central settings), `js/seed.js` (sample data) and `css/` (one design system).

## Design ("Harbour Light")

The visual identity is written down in [ui-prompt.md](ui-prompt.md): paper background `#F4EFE4`, harbour-navy ink `#14304A`, lantern-amber accent `#F2A71B`, book-serif headings with system sans body text, a top navigation bar (no sidebar), ruled tables and cards with hard offset shadows. It uses only local/system fonts and has no external dependencies. The direction was chosen by the assistant because the owner asked for "something default"; change the tokens in `css/base.css` to restyle everything. Colour pairs are verified by a unit test and every page is scanned with axe-core.

## Quick start

Requirements: Node.js 20+ and npm. (No build step.)

```bash
npm install                 # installs Playwright and axe-core (dev dependencies only)
npx playwright install chromium
npm run serve               # http://localhost:4173/
```

Open <http://localhost:4173/>. Sample data is created automatically on first load. Use **Data & Cloud → Reset demo data** to start over.

> Opening the files with `file://` will not work (the page loads `rules.json` and `health.json`, and Web Crypto needs `localhost` or HTTPS). Use `npm run serve`.

### Demo accounts (fictional, published on purpose)

Sign in at `staff.html`. Step 1 is e-mail + password; step 2 is the 6-digit code. The page lists a *live code* for each demo account in place of an authenticator app.

| Name | Department / group | E-mail | Password |
|------|-------------------|--------|----------|
| Elena Marsh | IT, IT Admins | elena.marsh@northlight.example | `Demo-Pass-1!` |
| Jonas Berg | IT, IT Admins | jonas.berg@northlight.example | `Demo-Pass-2!` |
| Priya Nair | Design, Design Team | priya.nair@northlight.example | `Demo-Pass-3!` |
| Liam Okafor | Design, Design Team | liam.okafor@northlight.example | `Demo-Pass-4!` |
| Tomas Hale | Sales, Sales Team | tomas.hale@northlight.example | `Demo-Pass-5!` |
| Sofia Reyes | Sales, Sales Team | sofia.reyes@northlight.example | `Demo-Pass-6!` |

These credentials are fake and only exist to try the demo. **Never use real credentials in this project.**

## Manual test walkthrough ("Maya starts Monday")

1. **Public site** (`index.html`): submit the empty form to see validation. Then send an enquiry containing the word *urgent*.
2. **Help Desk**: the enquiry is a new **P1** ticket at the top with a 1-hour target. Note the sample ticket T-1004 (a phishing e-mail) with its incident-response steps. Change a status, add a reply, reload to see it persist. Export tickets as JSON/CSV.
3. **CRM → Leads**: the enquiry is a new lead. Click **Convert**: an account, contact and opportunity (stage *Lead*) appear and the **Dashboard** chart updates. Mark an opportunity Won or Lost and record the reason.
4. **Automation**: see the outbox alert, four log entries, the run duration and the per-rule results with times. Use the test form to run the rules yourself.
5. **Staff & MFA**: sign in as Elena (IT) and add Maya Kovacs (Sales) with the joiner form (pick a group; MFA is required). Sign in as Maya using the welcome pack. Sign in as Tomas (Sales): no admin section. As Elena, disable Maya (leaver): her sessions end and she can no longer sign in. Try the CSV import (columns `name,department,role`).
6. **Troubleshooter**: walk through "No internet connection". Run `npm run network-doctor` and `npm run pc-health`.
7. **Data & Cloud**: click **Export all data** (one JSON file with every collection).
8. **Mobile**: narrow the browser window: the navigation collapses behind a Menu button.

## Diagnostic tools (read-only)

```bash
npm run pc-health         # OS, free disk space, firewall status, update status
npm run network-doctor    # connection → IP → router → 1.1.1.1 → DNS; names the first failing step
npm run check:cloud       # validates northlight.cloud.json
node tools/pc-health.js --save        # also writes a dated report to ./reports (ignored by Git)
```

- Both scripts only **read** information (the network doctor also sends a few ping packets). Commands are run without a shell and must be on an allow-list in `tools/lib/diagnostics.js`. `--save` writes one new text file in `./reports`; it never changes system settings.
- Each result prints **PASS**, **FAIL** or **SKIP**. `SKIP` means the information is not available on that computer (missing tool or permissions); it is never reported as a pass.
- Each result explains *what it means*. An IP starting with 169.254 means the PC did not get an address from the router; if 1.1.1.1 works but a website name does not, suspect DNS. Add `--json` for machine-readable output. Exit code is `1` when something fails.
- If the router ignores ping but the internet works through it, step 3 is reported as `SKIP` (not a fault).
- Windows, Linux and macOS are supported. The unit tests use **fake command output** (`tests/fixtures/outputs.json`) so they run on any system. Real runs have only been tried on Windows.

### Cloud naming rules (`tools/check-cloud.js`)

| Resource | Pattern | Example |
|----------|---------|---------|
| Resource group | `rg-<project>-<workload>-<dev\|test\|prod>` | `rg-northlight-web-prod` |
| Web app | `app-<project>-<workload>-<env>` | `app-northlight-web-prod` |
| Storage | `st` + lowercase letters/digits, 3–24 chars | `stnorthlightwebprod` |

Required tags on every resource: `owner` (an e-mail), `env` (`dev`/`test`/`prod`, matching the environment) and `cost-center` (`CC-1234`). The checker also validates the file structure and exits with an error when a name is invalid or a tag is missing.

## Tests

```bash
npm test                  # unit tests + Playwright tests
npm run test:unit         # node:test: diagnostics (fake output), cloud checker, secret scanner, colour contrast
npm run test:e2e          # Playwright: desktop + mobile viewport projects, security, validation, axe-core
```

Playwright starts the local static server automatically. To test a deployed site instead:

```bash
BASE_URL=https://chachar1922.github.io/northlight-Jan/ AUTHORISED_HOSTS=chachar1922.github.io npx playwright test
```

Tests run only against `localhost`, or against hosts you list in `AUTHORISED_HOSTS`. Any other address is refused.

The security tests cover: plain-text rendering of form input (no script execution), Sales users not seeing the admin section, validation messages on empty forms, a CSP meta tag on every page (plus no inline code), and no committed secrets.

## Deployment (GitHub Pages)

1. In the GitHub repository open **Settings → Pages** and set **Source** to **GitHub Actions** (one-time step; already done for this repository).
2. Push to `main`. The workflow in `.github/workflows/deploy.yml` runs automatically:
   1. **check-cloud**: `node tools/check-cloud.js` (a failure stops everything),
   2. **test**: unit tests and Playwright tests,
   3. **build**: `tools/build-site.js` copies the public files to `_site/` and stamps the build date,
   4. **deploy**: publishes to GitHub Pages **only if every earlier job passed** and only for pushes to `main`.
3. The site is served from a sub-path (`/<repo>/`), so all links and fetches are relative.

## Project structure

```
index.html  helpdesk.html  crm.html  automation.html  staff.html  troubleshoot.html  settings.html
config.js  rules.json  health.json  northlight.cloud.json  ui-prompt.md  RISKS.md  README.md
css/        base.css (tokens) · layout.css · components.css · helpdesk.css
js/         storage · seed · ui · tickets · crm-data · automation · auth
            site · helpdesk · crm · automation-page · staff · troubleshoot · settings
tools/      pc-health.js · network-doctor.js · check-cloud.js · scan-secrets.js
            build-site.js · serve.js · lib/diagnostics.js · lib/report.js
tests/      e2e/ (Playwright + axe) · unit/ (node:test) · fixtures/
.github/workflows/deploy.yml
```

`settings.html` was added as a home for the export button, health and cloud views; `package.json` exists only for tests and npm scripts (there are no runtime dependencies and no bundler).

## Known limitations

- Browser-only authentication and localStorage are **learning models**, not production security (see [RISKS.md](RISKS.md)). Session revocation only reaches the browser where IT is working.
- Data lives in one browser; export it to keep a copy.
- The CSP is a `<meta>` tag because GitHub Pages cannot send headers.
- Alerts are only listed in a local outbox; nothing is e-mailed.
- Not implemented (optional stretch goals): a scheduled daily-summary GitHub Action, and an Azure cost estimate.
