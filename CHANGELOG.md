# Changelog

This changelog records coordinated public package sets. RepoChan remains pre-1.0;
minor versions may intentionally tighten protocol or workflow contracts.

## 2026-07-15 release candidate

| Package | Candidate | Semver reason |
| --- | --- | --- |
| `@repochan/core` | `0.2.0` | New Starter contracts and stricter, recoverable order-result transactions change pre-1.0 protocol behavior. |
| `@repochan/image-edit` | `0.2.0` | The page-assembly asset pipeline and exported operations expanded materially since `0.1.1`. |
| `@repochan/image-gen` | `0.2.0` | Endpoint routing and multi-reference request behavior changed materially since `0.1.0`. |
| `@repochan/skill` | `0.2.0` | Web Designer, Starter Productizer, and Starter Localizer responsibilities now form a new workflow contract. |
| `@repochan/templates` | `0.2.0` | Starter migration and composition templates add a materially different prompt/data contract. |
| `@repochan/starters` | `0.1.0` | First public release, containing `minimal` and `registry-modular`. |
| `repochan` | `0.3.0` | First CLI release that binds the Starter packages and current Core contracts; this version is not yet present on npm. |

The candidate also adds a fresh-source, registry-aware release preflight,
explicit public npm metadata, MIT license payloads, finite command timeouts, and
tarball checks that reject compiled test artifacts.
