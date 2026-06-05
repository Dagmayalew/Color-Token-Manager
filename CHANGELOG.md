# Changelog

All notable changes to **Color Token Manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- MCP stdio server for AI coding agents, exposing color-token resources, export resources, extraction previews, token-name suggestions, and WCAG contrast checks.
- MCP onboarding helpers: `colors://help`, copyable client setup snippets, manager webview controls, and status-bar log access.
- Standalone `dist/mcp-server.js` MCP stdio process for Cursor, Claude Code, Windsurf, and other clients that spawn local MCP servers.
- Unit test harness: `npm test` (Node `node:test`, `tsconfig.test.json`, `out-test/`).
- Unit tests for `colorUtils`, `colorFile` (validate, normalize, read, update), `colorExtractor` (scan, comments, imports, embedded colors); `test/fixtures/colors/` and vscode stub for tests.
- Shared `globToRegExp` in `src/globUtils.ts` with unit tests (replaces duplicate helpers in `colorExtractor` and `tokenTools`).
- GitHub Actions CI: typecheck, test, and compile on push/PR to `main` / `master`.
- Refactor: split `colorExtractor.ts` into `colorScan.ts`, `colorPlan.ts`, and `colorApply.ts` (barrel re-exports unchanged API).
- Command discoverability: default keybindings for opening the manager and previewing selections, plus editor-aware palette/context menu visibility for supported source files.
- Workspace trust guard: folder-wide extraction and preview apply now stop with a warning in untrusted workspaces.
- Activation events: removed redundant command activators for VS Code 1.90+ and added workspace activation for projects containing `colors.ts`.
- HSL color support: validate, scan, preview, parse, and diagnose `hsl()` / `hsla()` color literals.
- Source file support: scan `.vue`, `.css`, `.scss`, and `.less` files; style files replace hardcoded colors with CSS variables.
- Integration tests: `@vscode/test-electron` smoke suite for activation, configuration, and command registration.
- Lint/format tooling: ESLint flat config, Prettier config, npm scripts, and CI checks.
- Packaging hygiene: `.vscodeignore` excludes source, tests, generated test output, and local tooling from VSIX artifacts.
- First-run setup wizard with existing-file selection, default/custom `colors.ts` creation, and token path mode setup.
- Status bar entry for opening or setting up Color Token Manager.
- **Preview Colors From Current File** command and manager button.
- Preview panel filters for new, alias, reused, and skipped replacements.
- Preview panel select/deselect visible controls, live selected counts, and clearer `From` / `To` replacement rows with color swatches.

### Deprecated

- `colorTokenManager.importStyle` — use `importMode` instead; one-time activation warning; Settings UI `deprecationMessage`; removal planned for **v1.0.0** ([DEPRECATIONS.md](DEPRECATIONS.md)).

### Fixed

- Multi-root workspaces: resolve `colorsFilePath` and default dialogs from the active editor’s workspace folder (not always the first root).
- Flat token projects: generated semantic suggestions now stay flat/reuse existing flat tokens, preventing invalid references like `colors.text.black` when `colors.ts` only exposes `colors.black`.
- `colors.ts` writer: adding a token after a trailing inline comment no longer creates a standalone comma line.

## [0.0.2] - 2026-06-04

Documentation and Marketplace metadata only; no change to extension runtime behavior.

### Added

- [CHANGELOG.md](CHANGELOG.md) and [VERSIONING.md](VERSIONING.md).

### Changed

- README: contributor links, accurate bundle vs VSIX size notes.
- PROJECT_SUMMARY.md: maintainer-only guide; corrected packaging sizes and publish steps.
- Marketplace metadata: `homepage`, `bugs`, `galleryBanner`, `qna`, expanded keywords, `Linters` category, clearer description.

## [0.0.1] - 2026-06-04

Initial Marketplace release.

### Added

- Color Token Manager webview: list, search, edit, copy, and refresh tokens from `colors.ts`
- Pick or configure a custom `colors.ts` path
- Extract hardcoded colors from the current file, a folder, or the current editor selection
- Folder and selection preview with checkboxes, editable token names, and jump-to-occurrence
- Editor diagnostics: underline hardcoded colors with inline swatches and **Extract this color** quick fix
- WCAG contrast warnings for text-like tokens against background tokens in `colors.ts` (AA / AAA)
- Semantic token naming (`background.white`, `button.background`, etc.) with configurable strategies
- Optional primitive + semantic token layers (`tokenLayerMode: semanticFirst`)
- Optional theme token prefix for dark/light style paths
- Reuse existing tokens, semantic aliases, and auto-replace matching values
- Rename tokens and update references across the project
- Find unused color tokens (markdown report)
- Export design tokens: JSON, CSS variables, Tailwind config, Figma Tokens, W3C Design Tokens
- Timestamped backups before folder-wide extraction (configurable)
- Configurable import modes: named, default, namespace
- Optional extraction of colors embedded in longer quoted strings (e.g. `boxShadow`)
- Explorer context menu: **Preview Colors From Folder**

### Supported

- Source files: `.ts`, `.tsx`, `.js`, `.jsx`
- Color literals: `#RGB`, `#RRGGBB`, `rgb()`, `rgba()`
- Nested `colors.ts` objects and runtime / design-token aliases

[Unreleased]: https://github.com/dagmayalew489/color-token-manager/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/dagmayalew489/color-token-manager/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/dagmayalew489/color-token-manager/releases/tag/v0.0.1
