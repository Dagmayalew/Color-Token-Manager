# Changelog

All notable changes to **Color Token Manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## v0.4.0 — Multi-Language Foundation

### Added

- Added language adapter architecture.
- Added CSS/SCSS/LESS scanning and replacement using CSS variables.
- Added HTML inline style scanning and replacement.
- Added preview-only scanning for Dart, Swift, Kotlin, Java, Go, Python, PHP, Ruby, JSON, YAML, XML, SVG, and Markdown.
- Added enabled languages setting.
- Added safe/scan-only/experimental language modes.
- Added language grouping in preview.

### Added

- Added automatic token/theme file detection (`src/tokenDetection.ts`) with confidence ranking for `src/theme/colors.ts`, `src/theme/theme.ts`, `src/tokens.ts`, and other common paths.
- Added `colorTokenManager.detectSetup` command to scan the workspace and set the active token file from a ranked list.
- Added `colorTokenManager.resetSetup` command to clear all token file settings from workspace configuration.
- Added color series naming system (`src/tokenNaming.ts`) with Tailwind-compatible palettes for primary, neutral, success, warning, danger, and secondary scales.
- Added `suggestTokenName`, `suggestSeriesName`, `suggestSemanticName`, and `normalizeTokenName` utilities for professional token name generation.
- Added `buildThemeAwarePlans` utility that groups extracted colors by value and enriches each with ranked name suggestions and occurrence counts.
- Added three new token file templates: `colorSeries` (organized numeric-scale palette), `lightDark` (separate `lightTheme`/`darkTheme` exports), and `reactNative` (single `theme` object with `light`/`dark` sub-objects).
- Added `addMultipleImportEdit` to support inserting `import { lightTheme, darkTheme }` style multi-identifier imports.
- Added theme-aware quick fix suggestions in the editor: when a hardcoded color has no exact token match, the lightbulb now shows up to 2 ranked suggestions (e.g. `Extract as colors.background (high confidence)`).
- Added "Detected" tab in the Color Token Manager webview showing hardcoded colors from the active editor grouped by value with suggested token references and occurrence counts.
- Added empty state to the Color Token Manager webview with "Start Setup" and "Detect Automatically" buttons.
- Added `buildTokenReference` helper that uses bracket notation for numeric path segments (e.g. `colors.primary[500]` instead of the invalid `colors.primary.500`).
- Added `ThemeAwareColorPlan`, `ColorOccurrence`, `TokenNameSuggestion`, `TokenFileCandidate`, `TokenFileKind`, `TokenReferenceMode`, and `TokenTarget` types.
- Added `tokenFileKind` setting (auto/colors/theme/tokens/custom) to describe the structural style of the token file.
- Added `colorSeriesMode` setting (auto/semantic/scale/off) to control how extracted colors are named.
- Added `tokenFile`, `tokenObject`, and `referencePrefix` settings for configurable theme token support, enabling references like `theme.colors.primary` and `tokens.color.primary`.
- Added support for generating multi-part token reference prefixes (e.g., `theme.colors`) with correct single-identifier import insertion (e.g., `import { theme } from '../theme/theme'`).
- MCP stdio server for AI coding agents, exposing color-token resources, export resources, extraction previews, token-name suggestions, and WCAG contrast checks.
- Theme-aware design token audit report for light/dark token groups, missing counterparts, duplicate values, aliases, unused tokens, contrast risks, and suggested next actions.
- **Audit Design Tokens** and **Audit Contrast** commands, plus manager UI entry points.
- MCP `colors://report`, `audit_project`, and `audit_contrast` for agent-readable theme audits.
- Token/theme file detection for `theme.ts`, `themes.ts`, `tokens.ts`, and `designTokens.ts`, with `tokenFilePath` and `tokenExportName` settings while preserving `colorsFilePath`.
- MCP onboarding helpers: `colors://help`, copyable client setup snippets, manager webview controls, and status-bar log access.
- One-click Cursor MCP setup command that creates or updates `.cursor/mcp.json` for the active workspace.
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

### Changed

- Updated first-time setup wizard with three theme-style options: Simple color series, Light/Dark theme, and React Native theme object.
- Updated Color Token Manager webview to include a "Detected" tab for real-time hardcoded color analysis with naming suggestions.
- Improved diagnostic wording from "can be extracted to colors.ts" to "can be extracted to a color token" for theme-agnostic messaging.
- Contrast diagnostic messages now use the configured token identifier instead of the hardcoded `colors` prefix.

### Deprecated

- `colorTokenManager.importStyle` — use `importMode` instead; one-time activation warning; Settings UI `deprecationMessage`; removal planned for **v1.0.0** ([DEPRECATIONS.md](DEPRECATIONS.md)).

### Fixed

- Preserved full backward compatibility for existing `colors.ts` workflows when no new theme settings are configured.
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
