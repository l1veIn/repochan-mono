# Changelog

This changelog records coordinated public package sets.

## 2026-07-15 release candidate

This candidate publishes the current CLI, libraries, skills, templates, and
starters as one dependency-closed set.

| Package | Candidate | Role in this set |
| --- | --- | --- |
| `@repochan/core` | `0.2.0` | Protocol schemas, deterministic rules, and recoverable order-result transactions. |
| `@repochan/image-edit` | `0.2.0` | Local page-assembly and pixel operations. |
| `@repochan/image-gen` | `0.2.0` | Image endpoint routing and generation. |
| `@repochan/skill` | `0.2.0` | Wizard and specialist workflow contracts. |
| `@repochan/templates` | `0.2.0` | Asset prompt and composition templates. |
| `@repochan/starters` | `0.1.0` | `minimal` and `registry-modular` website scaffolds. |
| `repochan` | `0.3.0` | Sole CLI binding surface for the complete set. |

Release verification uses a fresh-source, registry-aware preflight, explicit
public npm metadata, MIT license payloads, finite command timeouts, and tarball
checks that reject compiled test artifacts. Its isolated smoke installs the
candidate into an empty project.
