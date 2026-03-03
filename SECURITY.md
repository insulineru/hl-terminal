# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

## Security Model

hl-terminal stores account credentials locally at `~/.hyperliquid/config.json` with strict file permissions:

- **File permissions:** `0o600` (owner read/write only)
- **Directory permissions:** `0o700` (owner only)
- **Private keys never leave your machine** — all signing happens locally
- **Watch-only accounts** are supported for read-only access without a private key

## Reporting a Vulnerability

If you discover a security vulnerability, please report it through [GitHub Security Advisories](https://github.com/insulineru/hl-terminal/security/advisories/new).

**Do not open a public issue for security vulnerabilities.**

When reporting, please include:

- Description of the vulnerability
- Steps to reproduce
- Severity assessment (Critical / High / Medium / Low)
- Any potential impact

## Response Timeline

- **Acknowledgment:** within 72 hours
- **Critical fixes:** within 7 days
- **Non-critical fixes:** included in the next release

## Out of Scope

The following are not considered vulnerabilities in hl-terminal:

- Compromised local machine (if an attacker has access to your filesystem, local key storage cannot protect you)
- Social engineering attacks
- Issues in upstream dependencies (report these to the respective projects)
