# Security policy

KeyCrypt is a zero-knowledge password manager: vault items are encrypted in the browser and the
server stores only ciphertext. We take reports about anything that weakens that seriously.
[`docs/threat-model.md`](docs/threat-model.md) describes what KeyCrypt protects, against whom, and
where its limits are.

## Supported versions

KeyCrypt is released continuously from the `main` branch. Only the latest commit on `main` (and a
deployment built from it) receives security fixes.

| Version                 | Supported |
| ----------------------- | --------- |
| `main` (latest)         | ✅        |
| Older commits and forks | ❌        |

Self-hosters should update to the latest `main` when a fix is announced.

## Reporting a vulnerability

**Please do not open a public issue, pull request or discussion for a security problem.**

Report it privately through GitHub's private vulnerability reporting for this repository:

**<https://github.com/kanishksharma04/KeyCrypt/security/advisories/new>**

Include as much of the following as you can:

- what is affected (the server, the browser app, the browser extension, a dependency),
- steps to reproduce, or a proof of concept,
- the impact you think it has (for example: which data an attacker could read or change),
- the commit or deployment you tested.

The same contact is published in [`/.well-known/security.txt`](public/.well-known/security.txt)
([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)).

## What to expect

| Step                                            | Target                                  |
| ----------------------------------------------- | --------------------------------------- |
| Acknowledge your report                         | within 3 business days                  |
| Initial assessment (confirmed or not, severity) | within 7 days                           |
| Fix for a critical or high-severity issue       | within 30 days of confirmation          |
| Fix for a medium or low-severity issue          | within 90 days of confirmation          |
| Public advisory                                 | when the fix is released, crediting you |

We'll keep you updated through the advisory thread, and agree a disclosure date with you. If a
fix needs longer, we'll tell you why.

## Scope

In scope: this repository's code — the web app, its server actions and API routes, the
cryptography in `src/lib/crypto`, the browser extension (`extension/`) and the self-hosting image
(`Dockerfile`, `docker-compose.yml`).

Especially interesting:

- anything that lets the server, or someone with database access, read vault contents, item
  names, folder names or the master password,
- ways to make the browser accept tampered or swapped ciphertext,
- authentication or authorisation bypasses (reading or changing another user's data),
- weaknesses in key derivation, key wrapping, the recovery key or the export format.

Out of scope: attacks the [threat model](docs/threat-model.md#attacks-not-covered) lists as not
covered (a compromised device, phishing, a malicious server shipping malicious JavaScript),
denial of service through volume, missing best-practice headers without a demonstrated impact, and
reports from automated scanners without a working attack.

## Safe harbour

We won't pursue or support legal action against good-faith research that follows this policy: test
only against your own accounts (or a local or self-hosted instance), don't access or change other
people's data, don't degrade the service for others, and give us reasonable time to fix the issue
before disclosing it.
