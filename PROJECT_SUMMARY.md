# Maintainer Guide — Color Token Manager

**User-facing docs:** [README.md](README.md)  
**Release history:** [CHANGELOG.md](CHANGELOG.md)  
**Version policy:** [VERSIONING.md](VERSIONING.md)

This file is for people working on the extension repo. It does not duplicate the feature list in the README.

## Identity

| Item              | Value                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- |
| Extension id      | `dagmayalew.color-token-manager`                                                   |
| Marketplace       | https://marketplace.visualstudio.com/items?itemName=dagmayalew.color-token-manager |
| Repository        | https://github.com/dagmayalew489/color-token-manager                               |
| Homepage / issues | `package.json` → `homepage`, `bugs.url`                                            |
| Entry             | `dist/extension.js` (esbuild bundle, `vscode` external)                            |
| Categories        | Linters, Other — diagnostics + token tooling                                       |

## Source layout

| File                    | Role                                                     |
| ----------------------- | -------------------------------------------------------- |
| `src/extension.ts`      | Activation, commands, webview message routing            |
| `src/workspaceUtils.ts` | Multi-root workspace folder / configured path resolution |
| `src/globUtils.ts`      | Glob → RegExp for exclude paths                          |
| `src/colorScan.ts`      | Find hardcoded color literals in source text             |
| `src/colorPlan.ts`      | Token naming, preview planning, preview validation       |
| `src/colorApply.ts`     | Apply extractions, folder/selection workflows            |
| `src/colorExtractor.ts` | Public re-exports (stable import path)                   |
| `src/colorFile.ts`      | Read/write `colors.ts` (object-literal scanner)          |
| `src/diagnostics.ts`    | Underlines, swatches, quick fixes                        |
| `src/tokenTools.ts`     | Rename, unused tokens, design-token export               |
| `src/importUtils.ts`    | Import insertion and identifier modes                    |
| `src/webview.ts`        | Main manager UI HTML                                     |
| `src/previewWebview.ts` | Extraction preview UI                                    |
| `src/resultsWebview.ts` | Post-apply results UI                                    |
| `src/types.ts`          | Shared types                                             |

## Build

```bash
npm install
npm run check      # tsc --noEmit
npm run compile    # check + esbuild → dist/extension.js
npm test           # compile test/*.ts → out-test/, run node:test
npm run test:integration # compile + launch VS Code Extension Host via @vscode/test-electron
npm run lint       # ESLint flat config
npm run format:check # Prettier check
```

CI (`.github/workflows/ci.yml`) runs on push/PR to `main` or `master`: `npm ci` → `npm run check` → `npm run lint` → `npm run format:check` → `npm test` → `npm run test:integration:compile` → `npm run compile`.

Tests live in `test/` and compile with `tsconfig.test.json` (vscode → `test/stubs/vscode.ts`, runtime hook `test/setup.cjs`). Fixtures: `test/fixtures/colors/`. Coverage: `colorUtils`, `colorFile`, `colorExtractor`, `globUtils`.

Integration tests live in `test/suite/`, compile with `tsconfig.integration.json`, and run through `test/runTest.ts` using `@vscode/test-electron`.

Debug: **F5** (`Run Extension` in `.vscode/launch.json`, `preLaunchTask`: `npm: compile`).

## Package size (verify after compile)

Sizes drift slightly with content; re-check after changes:

```bash
ls -la dist/extension.js
npm run package
ls -la color-token-manager-*.vsix
```

Reference (v0.0.2, June 2026):

| Artifact                             | Approx. size |
| ------------------------------------ | ------------ |
| `dist/extension.js` (minified)       | ~70 KB       |
| `color-token-manager-<version>.vsix` | ~99 KB       |

The VSIX includes `dist/extension.js`, `resources/icon.png`, `package.json`, `README.md`, changelog, maintainer docs, and license — not `src/`, tests, or generated test output (see `.vscodeignore`).

## Package and install locally

```bash
npm run package
```

Output: `color-token-manager-<version>.vsix` in the repo root.

Install:

- VS Code: **Extensions: Install from VSIX...**, or
- CLI: `code --install-extension ./color-token-manager-0.0.2.vsix --force`

## Publish checklist

Follow [VERSIONING.md](VERSIONING.md), then:

1. Move `[Unreleased]` → new version in [CHANGELOG.md](CHANGELOG.md).
2. Match `version` in `package.json` (current: **0.0.2** — docs/metadata; next feature milestone: **0.1.0** after tests + CI).
3. `npm run compile` → `npm run package`
4. Smoke-test the VSIX.
5. `npx vsce publish patch` (or `minor` / `major`) with Marketplace credentials.

## Settings reference

All defaults live in `package.json` under `contributes.configuration`. For a copy-pastable JSON block, see README sections and the Settings UI (**Color Token Manager**).

Deprecations: [DEPRECATIONS.md](DEPRECATIONS.md) (`importStyle` → `importMode`, removal in v1.0.0).

## Roadmap (repo hygiene)

See conversation / issue tracker for phased work: tests, CI, multi-root workspaces, module split of `colorExtractor.ts`.
