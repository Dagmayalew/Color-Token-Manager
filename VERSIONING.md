# Versioning policy

This project uses [Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/).

## Current state

| Version   | Meaning                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| **0.0.1** | Initial Marketplace release (feature-complete baseline).                                                              |
| **0.0.2** | Docs + Marketplace metadata from Phase 1 (Steps 1–3). No extension behavior changes.                                  |
| **0.0.3** | Optional patch after test harness (Step 5) if publishing before broader tests.                                        |
| **0.1.0** | Target after **Phase 2** (meaningful unit tests + CI). Signals “maintained with a safety net,” not a breaking change. |
| **1.0.0** | First stable API/settings contract; remove deprecated `colorTokenManager.importStyle`.                                |

## When to bump

| Bump                | Use when                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **patch** (`0.0.x`) | Bug fixes, docs, README/CHANGELOG, `package.json` metadata, dependency patches that do not change runtime behavior.                          |
| **minor** (`0.x.0`) | New features, new settings, new commands, refactors that stay backward compatible. Prefer **0.1.0** for the first minor after tests/CI land. |
| **major** (`x.0.0`) | Breaking changes: removed settings, changed default extraction behavior, renamed commands.                                                   |

## Pre-release (`0.0.x`)

While on `0.0.x`, patch releases are fine for documentation-only updates (like **0.0.2**). Do **not** skip CHANGELOG entries for Marketplace publishes.

## Publish workflow (every release)

1. Move `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) into a dated version section.
2. Set the same `version` in [package.json](package.json).
3. `npm run compile` → `npm run package` → smoke-test VSIX.
4. `npx vsce publish patch` (from **0.0.1** → **0.0.2**) or `publish minor` / `publish major` as appropriate.
5. Git tag `v0.0.2` (optional but recommended) on the publish commit.

## What not to do

- Do not publish without updating CHANGELOG and `package.json` together.
- Do not jump to **1.0.0** until deprecated settings are removed and behavior is frozen.
- Do not use **0.1.0** for docs-only changes; use **0.0.2**, **0.0.3**, etc.

## Deprecations

| Setting                         | Replacement                    | Removed in |
| ------------------------------- | ------------------------------ | ---------- |
| `colorTokenManager.importStyle` | `colorTokenManager.importMode` | **1.0.0**  |

Details: [DEPRECATIONS.md](DEPRECATIONS.md).

## Roadmap tie-in

| Phase                             | Typical version                          |
| --------------------------------- | ---------------------------------------- |
| Phase 1 (docs, metadata)          | **0.0.2**                                |
| Phase 2 (tests, CI)               | **0.1.0**                                |
| Phase 4–5 (multi-root, HSL, etc.) | **0.2.0** or patch/minor per change size |
| Deprecation cleanup               | **1.0.0**                                |
