# Northlight Studio – Security Risks and Mitigations

This document covers the risks a 25-person design studio realistically faces, how this project addresses them (where it can), and, importantly, **what this demo does *not* protect against**. All data in the project is fictional.

Likelihood and impact are rated **Low / Medium / High** for a small studio like Northlight, before mitigation.

## 1. Risk register

### R1. Phishing
- **Description:** Staff receive e-mails or messages that imitate a supplier, bank or colleague to steal passwords or trick someone into paying a fake invoice or opening an attachment. Sample ticket T-1004 (an invoice e-mail opened by one finance user) is exactly this.
- **Likelihood:** High. It is the most common attack on small businesses.
- **Impact:** High. Stolen credentials, fraudulent payments, or a malware foothold.
- **Mitigation:** Security-awareness training and a "report it, don't click" habit; verify any payment-detail change by phone; mail filtering with SPF/DKIM/DMARC; MFA so a stolen password alone is not enough; the Help Desk treats an *active security incident* as **P1** (1-hour target) and shows an incident checklist (isolate the device, keep the e-mail, warn staff, escalate).

### R2. Malware and ransomware
- **Description:** A malicious attachment, download or fake software update installs code that steals data or encrypts files for ransom.
- **Likelihood:** Medium to High, often following a successful phishing e-mail.
- **Impact:** High. Lost client work, downtime, extortion, reputational damage.
- **Mitigation:** Keep operating systems and apps updated; endpoint protection; least-privilege accounts (no admin rights for daily work); block macros and executables from e-mail; offline or immutable backups with tested restores; isolate affected devices immediately. `tools/pc-health.js` reports firewall and update status (PASS/FAIL), and the cloud description includes a backup storage account.

### R3. Weak, reused or stolen credentials
- **Description:** Staff reuse passwords from other sites, choose weak ones, or have them leaked in a third-party breach.
- **Likelihood:** High.
- **Impact:** High. Account takeover of e-mail, files and the admin area.
- **Mitigation:** Password manager; unique passwords; MFA everywhere; lock-out and breach monitoring. The demo stores only salted PBKDF2 hashes (never plain text), uses TOTP as a second step, compares in constant time, and gives the same error for unknown users and wrong passwords.

### R4. Cross-site scripting (XSS) and injection through forms
- **Description:** A visitor submits HTML or script in the public contact form hoping an employee's browser executes it when reading the ticket, lead or alert.
- **Likelihood:** Medium. Any public form is probed.
- **Impact:** High. Session theft, data exposure, defacement.
- **Mitigation:** Treat all input as untrusted; output encoding; a strict Content Security Policy; server-side validation in a real system. Here, all user text is inserted with `textContent` only (`js/ui.js`), every page has a strict CSP meta tag and no inline code, CSV export neutralises spreadsheet formulas, and **Playwright tests prove it** (`tests/e2e/security.spec.js`).

### R5. Leavers and excess access
- **Description:** A departed employee, or someone who changed role, keeps access to systems and data.
- **Likelihood:** Medium.
- **Impact:** High. Data theft or sabotage by a former insider, or accidental exposure.
- **Mitigation:** Same-day leaver process; role- and group-based access; periodic access reviews. The demo has joiner/leaver workflows: a leaver is blocked from signing in, their sessions are ended (checked on every page load and every few seconds), and the record is kept for audit. Re-enabling an account does not revive old sessions.

### R6. Cloud misconfiguration
- **Description:** Resources are created with non-standard names or without an owner, environment or cost-centre tag, so nobody is accountable for patching, paying or deleting them.
- **Likelihood:** Medium.
- **Impact:** Medium to High. Unmanaged assets, accidental public exposure, unexpected cost.
- **Mitigation:** Naming standards; mandatory tags (owner, env, cost-center); infrastructure-as-code review; deployment gates. `tools/check-cloud.js` fails the pipeline on invalid names, missing tags or a bad structure, and the GitHub Actions workflow only deploys if it passes.

### R7. Secrets committed to the repository
- **Description:** A developer commits an API key, token or password to Git, where it can be copied from the history.
- **Likelihood:** Medium.
- **Impact:** High. Anyone with repository access (or the whole internet for a public repository) can use the credential.
- **Mitigation:** Secret scanning; `.gitignore` for `.env` files; rotate anything leaked (deleting a commit is not enough). `tools/scan-secrets.js` and a Playwright test fail the build if secrets are committed; the only credentials in the repo are the clearly marked fictional demo ones.

### R8. Supply-chain and pipeline compromise
- **Description:** A malicious npm package or GitHub Action runs inside the build and tampers with the site or steals tokens.
- **Likelihood:** Low to Medium.
- **Impact:** High. A compromised website for every visitor.
- **Mitigation:** Few dependencies; lock file with `npm ci`; pinned major versions of actions; least-privilege workflow permissions. The site has **no runtime dependencies**, the only dev dependency is Playwright, and the workflow uses `permissions: contents: read`, granting Pages write access only to the deploy job.

### R9. Lost or stolen device
- **Description:** A laptop or phone is left on a train or stolen from a bag.
- **Likelihood:** Medium.
- **Impact:** Medium to High. Exposure of client files and cached logins.
- **Mitigation:** Full-disk encryption; remote wipe; short screen-lock; no local-only data. Not covered by code; the disk-space and firewall checks are the closest diagnostics.

### R10. Network outage or misconfiguration
- **Description:** The router, internet line or DNS fails, stopping everyone from working.
- **Likelihood:** Medium.
- **Impact:** Medium. Lost productivity, missed client meetings.
- **Mitigation:** Monitoring; documented runbooks; spare hardware; provider contact details. `troubleshoot.html` gives a guided "No internet connection" flow and `tools/network-doctor.js` pinpoints the first failing step (including the 169.254.x.x "no address from the router" and DNS cases).

## 2. Limitations of browser-based authentication

The sign-in in `staff.html` is a **learning model**. It teaches the concepts, but it is **not a security control**.

- **Everything runs on the visitor's machine.** The "authentication" code is delivered to the user, who can read it, change it, or skip it with the browser developer tools. A determined user can set a session, edit their role, or call the admin code directly.
- **The admin section is hidden, not protected.** For non-admin users the page does not *render* the admin section, but the code that builds it is still in `js/staff.js`. Hiding content in the browser is not authorisation. **Real systems must authenticate users and enforce roles and groups on a server**, on every request, and never trust a role sent by the browser.
- **Password hashes and MFA secrets are readable.** They sit in `localStorage`. Anyone with access to the browser profile (or an XSS flaw) can copy them and attack the hashes offline. The TOTP secret is stored next to the hash, so it provides no protection against someone who can read storage. Production systems keep secrets server-side, encrypted, and never send hashes to the browser.
- **Session revocation only reaches this browser.** The leaver workflow ends sessions the page can see (it checks on each load and every few seconds). A session in another browser or device would not be ended; a real server-side session store can end them all.
- **No brute-force or rate limiting.** A client-side counter could simply be cleared. Servers must rate-limit and lock accounts.
- **Demo credentials are published on purpose** so the demo can be tried. They are fictional. A real system would never display passwords or live MFA codes.
- **No account recovery, no audit trail, no secure session cookies.** A real system needs `HttpOnly`, `Secure`, `SameSite` cookies, session expiry, device checks and tamper-proof logs.

## 3. Limitations of localStorage

- **Not private from scripts on the same origin.** Any script running on the page, including one injected by XSS, can read all of it. The CSP and output encoding reduce this risk but cannot remove it.
- **Not shared and not durable.** Data exists only in one browser profile on one device. Clearing site data, private browsing or another browser makes it disappear. There is no backup, which is why the **Export all data** button exists.
- **No access control and no encryption at rest.** Anyone using the same browser profile can read everything.
- **Shared origin on GitHub Pages.** All sites under `<user>.github.io` share one origin, so another project hosted by the same user could read `localStorage`. This project prefixes every key with `nl.` and exports only those keys, but a prefix is a convention, not isolation. A custom domain or a separate origin gives real isolation.
- **Small and synchronous.** About 5 MB per origin; large data would block the page.

## 4. Limitations of client-side access restrictions and other controls

- **Role checks in JavaScript can always be bypassed** (see section 2). They only shape the interface.
- **The Content Security Policy is delivered as a `<meta>` tag.** GitHub Pages cannot set HTTP headers, so protections that only work as headers (`frame-ancestors`, `report-uri`, HSTS settings) are not available. A real deployment should send the CSP as an HTTP header.
- **No real e-mail or alerts.** The automation "outbox" is only a list. Nothing is sent externally.
- **Diagnostic tools see one computer.** `pc-health` and `network-doctor` only read local information; some checks need extra rights and are reported as SKIP (not as a pass) when unavailable.

## 5. Testing and verification

| Control | How it is verified |
|---------|--------------------|
| Plain-text rendering of user input | Playwright test: payloads in the contact form are shown literally in Help Desk, CRM and Automation, no script runs |
| Role-based admin visibility | Playwright tests for Sales, Design and IT users |
| Form validation messages | Playwright tests for every form |
| CSP on every page | Playwright test iterates over every `*.html` file; checks directives, order, no inline code, no violations |
| No committed secrets | `tools/scan-secrets.js` (run by a Playwright test and unit-tested for detection) |
| Cloud naming and tags | `tools/check-cloud.js` with unit tests; runs first in CI |
| Read-only diagnostics | Unit tests with fake command output; a test also asserts no state-changing commands appear in the tool source |
| Accessibility | axe-core scan of every page (see `tests/e2e/a11y.spec.js`) |

## 6. Recommended next steps for a real deployment

Server-side authentication and authorisation, a managed identity provider with phishing-resistant MFA (passkeys), HTTP security headers, a real database with encryption and backups, central logging and alerting, and regular access reviews.
