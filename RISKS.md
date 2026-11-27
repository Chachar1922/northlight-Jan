# Northlight Studio – Security Risks and Mitigations

This document covers the risks a 25-person design studio realistically faces, how this project addresses them (where it can), and, importantly, **what this demo does *not* protect against**. All data in the project is fictional.

## 1. Risk register

| # | Risk | Realistic example at Northlight | Impact | Mitigations (organisational) | What this project demonstrates |
|---|------|----------------------------------|--------|------------------------------|--------------------------------|
| 1 | **Phishing** | An e-mail "from billing" asks Sofia to change bank details (see sample ticket T-1004). | Money loss, stolen credentials | Security-awareness training; a "report it" habit; verify payment changes by phone; mail filtering with SPF/DKIM/DMARC; MFA so a stolen password alone is not enough | Help Desk logs reports and treats a *security risk happening now* as **P1** (15-minute target); TOTP second factor (Module 3) |
| 2 | **Malware / ransomware** | A designer opens a fake "client brief.zip" and files get encrypted. | Lost work, downtime, extortion | Keep OS and apps updated; endpoint protection; least-privilege accounts (no admin for daily work); offline/immutable backups, tested restores; block macros and executables from e-mail | `tools/pc-health.js` reports firewall and update status (PASS/FAIL); `tools/network-doctor.js` helps isolate faults; cloud config describes a backup storage account |
| 3 | **Weak, reused or stolen credentials** | A staff password reused from a breached site. | Account takeover | Password manager; unique passwords; MFA everywhere; lock-out and breach monitoring | Salted PBKDF2 hashes (never plain text), TOTP, constant-time comparisons, no user enumeration in the error text |
| 4 | **Cross-site scripting (XSS) / injection through forms** | A visitor submits `<img src=x onerror=...>` in the contact form, hoping an employee's browser runs it when reading the ticket. | Session theft, defacement | Treat all input as untrusted; output encoding; Content Security Policy; validate on the server | All user text is inserted with `textContent` only (`js/ui.js`); strict CSP meta tag on every page; CSV export neutralises formula injection; **Playwright tests prove it** (`tests/e2e/security.spec.js`) |
| 5 | **Leavers and excess access** | A departed employee still signs in. | Data theft, sabotage | Same-day leaver process; role-based access; periodic access reviews | Joiner/leaver workflows; disabled users cannot sign in and an open session is invalidated (Module 3) |
| 6 | **Cloud misconfiguration** | Storage created without an owner tag or with a non-standard name; nobody knows who pays for it or who must fix it. | Exposure, cost, unmanaged assets | Naming standards; mandatory tags (owner, env, cost-center); infrastructure-as-code review; deployment gates | `tools/check-cloud.js` fails the pipeline on bad names or missing tags; the GitHub Actions workflow only deploys if it passes |
| 7 | **Leaked secrets in the repository** | Someone commits an API key or password. | Account compromise | Secret scanning; `.gitignore` for `.env`; rotate anything leaked (deleting a commit is not enough) | `tools/scan-secrets.js` and a Playwright test fail if secrets are committed; only marked fictional demo credentials exist |
| 8 | **Supply-chain / pipeline compromise** | A malicious npm package or GitHub Action runs in CI. | Compromised build and site | Few dependencies; lock file with `npm ci`; pinned major versions of Actions; minimal workflow permissions | The site has **no runtime dependencies**; the only dev dependency is Playwright; the workflow uses `permissions: contents: read` and grants Pages write access only to the deploy job |
| 9 | **Lost or stolen device** | A laptop left on a train. | Data exposure | Full-disk encryption; remote wipe; short screen-lock; no local-only data | Not covered by code; the disk check and firewall check are the closest relevant diagnostics |
| 10 | **Outage / network failure** | The office router fails on Monday morning. | Lost productivity | Monitoring; documented runbooks; spare hardware; ISP contact details | `troubleshoot.html` guided "No internet connection" flow; `network-doctor` pinpoints the first failing step |

## 2. Limitations of browser-based authentication

The sign-in in `staff.html` is a **learning model**. It teaches the concepts, but it is **not a security control**.

- **Everything runs on the visitor's machine.** The "authentication" code is delivered to the user, who can read it, change it, or skip it with the browser developer tools. A determined user can set a session, edit their role, or call the admin code directly.
- **The admin section is hidden, not protected.** For non-IT users the page does not *render* the admin section, but the code that builds it is still in `js/staff.js`. Hiding content in the browser is not authorisation. **Real systems must authenticate users and enforce roles on a server**, on every request, and never trust a role sent by the browser.
- **Password hashes and MFA secrets are readable.** They sit in `localStorage`. Anyone with access to the browser profile (or an XSS flaw) can copy them and attack the hashes offline. The TOTP secret is stored next to the hash, so it provides no protection against someone who can read storage. Production systems keep secrets server-side, encrypted, and never send hashes to the browser.
- **No brute-force or rate limiting.** A client-side counter could simply be cleared. Servers must rate-limit and lock accounts.
- **Demo credentials are published on purpose** so the demo can be tried. They are fictional. A real system would never display passwords or live MFA codes.
- **No account recovery, no audit trail, no secure session cookies.** A real system needs `HttpOnly`, `Secure`, `SameSite` cookies, session expiry, device checks and tamper-proof logs.

## 3. Limitations of localStorage

- **Not private from scripts on the same origin.** Any script running on the page, including one injected by XSS, can read all of it. The CSP and output encoding reduce this risk but cannot remove it.
- **Not shared and not durable.** Data exists only in one browser profile on one device. Clearing site data, private browsing or another browser makes it disappear. There is no backup, which is why the **Export all data** button exists.
- **No access control and no encryption at rest.** Anyone using the same browser profile can read everything.
- **Shared origin on GitHub Pages.** All sites under `<user>.github.io` share one origin, so another project hosted by the same user could read `localStorage`. This project prefixes every key with `nl.` and exports only those keys, but a prefix is a convention, not isolation. A custom domain or a separate origin gives real isolation.
- **Small and synchronous.** About 5 MB per origin; large data would block the page.
- **The Content Security Policy is delivered as a `<meta>` tag.** GitHub Pages cannot set HTTP headers, so protections that only work as headers (`frame-ancestors`, `report-uri`, HSTS settings) are not available. A real deployment should send the CSP as an HTTP header.
- **No real e-mail or alerts.** The automation "outbox" is only a list. Nothing is sent externally.

## 4. Testing and verification

| Control | How it is verified |
|---------|--------------------|
| Plain-text rendering of user input | Playwright test: payloads in the contact form are shown literally in Help Desk, CRM and Automation, no script runs |
| Role-based admin visibility | Playwright tests for Sales, Design and IT users |
| Form validation messages | Playwright tests for every form |
| CSP on every page | Playwright test iterates over every `*.html` file; checks directives, order, no inline code, no violations |
| No committed secrets | `tools/scan-secrets.js` (run by a Playwright test and unit-tested for detection) |
| Cloud naming and tags | `tools/check-cloud.js` with unit tests; runs first in CI |
| Read-only diagnostics | Unit tests with fake command output; a test also asserts no state-changing commands appear in the tool source |

## 5. Recommended next steps for a real deployment

Server-side authentication and authorisation, a managed identity provider with phishing-resistant MFA (passkeys), HTTP security headers, a real database with encryption and backups, central logging and alerting, and regular access reviews.
