# Security Policy

## Supported Versions
We generally support the latest main branch and the most recent tagged release.

## Reporting a Vulnerability

Please report security issues **privately**:

- Use GitHub’s **Private vulnerability reporting** (preferred): go to the repository page → **Security** tab → **Report a vulnerability**, or

**Do not** open public issues for security problems.

### What to Include
- A clear description of the issue and impact
- Steps to reproduce or proof-of-concept
- Affected version/commit hash
- Your environment details

## Response & Disclosure
- We aim to acknowledge reports within **3 business days**.
- We’ll validate, triage severity, and work on a fix.
- We prefer **coordinated disclosure**; we’ll agree on a disclosure timeline with you (typically 30–90 days depending on severity/complexity).
- Credit will be given to reporters who request it (unless you prefer anonymity).

## Scope
This policy covers the code and configurations in this repository. Third-party dependencies are out of scope, though we appreciate heads-up if a dependency is the root cause.

## Non-Qualifying Issues (Examples)
- Self-XSS requiring the user to paste arbitrary code into their own console
- Vulnerabilities only exploitable on development builds with non-production flags
- Denial-of-service via unrealistic resource exhaustion scenarios
