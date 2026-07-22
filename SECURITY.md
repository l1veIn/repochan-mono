# Security Policy

## Supported versions

RepoChan is released as a coordinated set of npm packages. Security fixes are
targeted at the current codebase and the package versions on npm's `latest`
dist-tag.

| Version | Security support |
| --- | --- |
| Current `latest` version of each published package | Supported |
| Older releases and other dist-tags | No guaranteed backports |
| Unreleased code on `main` | Reports welcome; not a supported release |

## Report a vulnerability privately

Do not disclose a suspected vulnerability in a public issue, pull request, or
discussion. Use GitHub Private Vulnerability Reporting:

1. Open the repository's
   [private vulnerability report form](https://github.com/l1veIn/repochan-mono/security/advisories/new).
2. Describe the affected package and version, impact, prerequisites, and the
   smallest safe reproduction you can provide.
3. Include any suggested mitigation and whether you have a preferred disclosure
   timeline.

Do not include live API keys, access tokens, personal data, or credentials in a
reproduction. Use clearly fake values and redact logs and paths where needed.

If GitHub does not show the **Report a vulnerability** form, private
vulnerability reporting has not yet been enabled for this repository. No
alternate private email or reporting service is currently published. Please do
not fall back to a public issue containing exploit details; the repository owner
must enable GitHub Private Vulnerability Reporting before private reports can be
accepted through this documented channel.

## Scope

Examples of security-relevant reports include:

- exposure or unsafe persistence of image endpoint credentials, Codex auth
  material, or npm authentication;
- command injection, path traversal, arbitrary file access, or unsafe archive
  handling in the CLI and package/install flows;
- a protocol operation crossing its documented trust boundary in a way that
  corrupts immutable history or permits an unintended write; and
- vulnerabilities in shipped dependencies that are reachable through RepoChan.

An actor who can already rewrite the entire local workspace and its transaction
anchors is outside the protocol recovery mechanism's security boundary. Ordinary
bugs, feature requests, and documentation corrections that do not expose
sensitive details may be filed in the public issue tracker after the repository
is public.

## What to expect

Maintainers will use the private GitHub advisory to validate the report,
coordinate a fix and release when needed, and agree on disclosure timing with
the reporter. Please allow the maintainers a reasonable opportunity to
investigate and publish a fix before public disclosure.
