# Color Token Manager

Color Token Manager helps React Native and TypeScript projects manage color tokens from `colors.ts`, `theme.ts`, `themes.ts`, `tokens.ts`, or `designTokens.ts`.

It can:

- Read and edit color tokens from existing color, theme, or token files
- Detect hardcoded colors across JavaScript, TypeScript, CSS-family files, HTML inline styles, and preview-only languages
- Support `#RGB`, `#RRGGBB`, `rgb()`, `rgba()`, `hsl()`, and `hsla()` literals
- Underline hardcoded colors and offer an editor quick fix
- Show inline color swatches next to hardcoded colors
- Warn when text-like tokens fail WCAG contrast against background tokens
- Audit theme readiness for light/dark token groups, duplicate values, unused tokens, and contrast risks
- Extract hardcoded colors into reusable tokens
- Replace hardcoded JavaScript/TypeScript values with token references and CSS/HTML inline values with CSS variables
- Preview current selection or folder-wide extraction before applying edits
- Group extraction previews by language with clear replacement-enabled or preview-only status
- Filter preview rows by new, alias, reused, or skipped replacements
- Apply only selected preview rows with checkboxes and select/deselect visible controls
- Rename a token and update project references
- Find unused tokens
- Export tokens to JSON, CSS variables, Tailwind config, Figma Tokens, or W3C Design Tokens
- Generate nested semantic token groups like `background.white`, `text.gray500`, and `button.background`
- Optionally generate primitive + semantic token layers for design-system workflows
- First-run setup wizard and status bar entry for faster onboarding

## Commands

- Open Color Token Manager
- Set Up Color Token Manager
- Extract Colors From Current File
- Preview Colors From Current File
- Extract Colors From Folder
- Preview Colors From Folder
- Preview Colors From Selection
- Rename Color Token
- Find Unused Color Tokens
- Audit Design Tokens
- Audit Contrast
- Export Design Tokens
- Pick Colors File
- Refresh Color Tokens

## First Run

Run **Set Up Color Token Manager** or click **Set up Colors** in the status bar.

The setup wizard can:

- Find an existing `colors.ts`
- Find an existing `theme.ts`, `themes.ts`, `tokens.ts`, or `designTokens.ts`
- Create `src/theme/colors.ts`
- Create a custom `colors.ts` path
- Set `tokenPathMode` to auto, flat, or nested

After setup, choose **Open Manager** or **Preview Current File** to continue safely.

## Multi-Language Support

Color Token Manager uses language adapters so each file type can define safe scan and replacement behavior. Safe mode is the default: JavaScript, TypeScript, CSS/SCSS/LESS, and HTML inline styles can be replaced after preview; other popular languages are scanned for visibility but stay preview-only.

| Language                   | Scan |      Replace |
| -------------------------- | ---: | -----------: |
| JavaScript                 |  yes |          yes |
| TypeScript                 |  yes |          yes |
| JSX/TSX                    |  yes |          yes |
| CSS/SCSS/LESS              |  yes |          yes |
| HTML inline styles         |  yes |          yes |
| Dart                       |  yes | Preview only |
| Swift                      |  yes | Preview only |
| Kotlin                     |  yes | Preview only |
| Java                       |  yes | Preview only |
| Go                         |  yes | Preview only |
| Python                     |  yes | Preview only |
| PHP                        |  yes | Preview only |
| Ruby                       |  yes | Preview only |
| JSON/YAML/XML/SVG/Markdown |  yes | Preview only |

CSS, SCSS, LESS, and HTML inline style replacements use CSS variables:

```css
color: var(--color-primary-500);
background-color: var(--color-background);
```

The preview panel groups findings by language and shows whether replacements are enabled or preview-only before anything is applied.

### Language Settings

Control scanned languages with:

```json
"colorTokenManager.enabledLanguages": [
  "javascript",
  "typescript",
  "css",
  "html",
  "dart"
]
```

Control replacement aggressiveness with:

```json
"colorTokenManager.languageMode": "safe"
```

Modes:

| Value          | Behavior                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `safe`         | Replace only adapters with safe replacement support; preview-only languages cannot apply edits. |
| `scanOnly`     | Scan enabled languages and show previews, but do not replace anything.                          |
| `experimental` | Allow replacement only for adapters that explicitly support replacement.                        |

CSS token output currently supports:

```json
"colorTokenManager.cssTokenFormat": "cssVariable"
```

## Editor Quick Fix

Open a supported file. Hardcoded color literals are underlined with a hint diagnostic and shown with inline swatches. Replaceable languages can offer direct quick fixes when an exact token exists. Preview-only languages offer **Open extraction preview** instead of unsafe edits.

## Contrast Checks

In the selected token file, text-like tokens such as `text.muted` are checked against background-like tokens such as `background.white`. The default target is WCAG AA (`4.5:1`), and it can be changed to AAA.

## Theme Audits

Run **Audit Design Tokens** to open a theme-aware report in VS Code. The report checks:

- light/dark token groups such as `colors.light.background.primary` and `colors.dark.background.primary`
- missing light/dark counterparts
- duplicate color values
- alias count
- unused tokens
- contrast risks for detected text/background pairs
- suggested next actions

Run **Audit Contrast** when you only want the contrast section.

## Primitive And Semantic Layers

By default, `colorTokenManager.tokenPathMode` is `auto`: flat `colors.ts` files keep flat references, while nested token files keep nested references.

```ts
colors.black;
colors.textBlack;
colors.button.background;
```

Set it explicitly when needed:

```json
"colorTokenManager.tokenPathMode": "flat"
"colorTokenManager.tokenPathMode": "nested"
```

For design-system workflows, enable semantic-first mode:

```json
"colorTokenManager.tokenLayerMode": "semanticFirst"
```

New colors then create primitive values and semantic aliases:

```ts
export const colors = {
  primitive: {
    orange: {
      orange500: '#FF6B00',
    },
  },
  semantic: {
    button: {
      background: colors.primitive.orange.orange500,
    },
  },
};
```

Use `colorTokenManager.themeTokenPrefix` to generate themed paths like `colors.dark.background.primary` in flat mode or `colors.semantic.dark.background.primary` in semantic-first mode.

## Example

Before:

```ts
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5EA',
  },
});
```

After:

```ts
import { colors } from '../theme/colors';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card.background,
    borderColor: colors.card.border,
  },
});
```

And `colors.ts` can be updated with:

```ts
export const colors = {
  card: {
    background: '#FFFFFF',
    border: '#E5E5EA',
  },
};
```

## Multi-root workspaces

`colorTokenManager.tokenFilePath` is resolved relative to the **workspace folder of the active file**, so each root in a multi-root workspace can use its own token or theme file path (for example in that root’s `.vscode/settings.json`). `colorTokenManager.colorsFilePath` is still supported as a legacy fallback. Folder pickers and export dialogs default to the same folder.

Set `colorTokenManager.tokenExportName` when your token object uses a custom export name. The default is `auto`, which detects `colors`, `theme`, `themes`, `tokens`, or `designTokens`.

## Import mode

Generated imports use `colorTokenManager.importMode`:

| Value             | Example                                      |
| ----------------- | -------------------------------------------- |
| `named` (default) | `import { colors } from '../theme/colors';`  |
| `default`         | `import colors from '../theme/colors';`      |
| `namespace`       | `import * as colors from '../theme/colors';` |

Use `colorTokenManager.importIdentifier` to change the `colors` identifier in code and imports.

The older setting `colorTokenManager.importStyle` is deprecated and will be removed in **v1.0.0**. See [DEPRECATIONS.md](DEPRECATIONS.md).

## Safety

Folder-wide extraction can change many files. Use **Preview Colors From Folder** first, filter the proposed replacements, review the language groups, uncheck anything you do not want to apply, edit token names if needed, and then apply selected changes from the preview panel. Preview-only language findings are shown for review but are not applied.

## MCP Server

Color Token Manager can expose your workspace color-token graph to local AI coding agents over MCP stdio. The extension includes a small standalone MCP process (`dist/mcp-server.js`) that clients such as Cursor can spawn directly.

Quick setup:

1. Run **Color Token Manager: Connect AI Agent** or click **Connect AI Agent** in the manager.
2. Pick your client: Cursor, Claude Code, Windsurf, Codex, or Custom MCP Client.
3. Reload the selected client.
4. Ask the agent to read `colors://help` first.
5. Run **Color Token Manager: Test MCP Server** if you want to verify the standalone MCP process before testing in the client chat.

Client behavior:

- Cursor: installs `.cursor/mcp.json` in the active workspace
- Claude Code: installs `.mcp.json` in the active workspace
- Windsurf: installs `~/.codeium/windsurf/mcp_config.json`
- Codex: installs `~/.codex/config.toml`
- Custom MCP Client: copies a standard JSON snippet to your clipboard

The installer preserves any existing `mcpServers` entries and only adds or updates the `color-token-manager` server. Use **Copy MCP Client Config** if you prefer to paste the JSON manually.

Resources:

- `colors://help` — agent workflow, safety rules, resources, tools, and example prompts
- `colors://tokens` — full token tree plus flat token metadata
- `colors://tokens/flat` — `{ "path.to.token": "#FFFFFF" }`
- `colors://tokens/unused` — unused token report
- `colors://report` — theme-aware token audit report
- `colors://exports/{format}` — `json`, `css`, `tailwind`, `w3c`, or `figma`

Tools:

- `extract_from_file({ dryRun, path })`
- `suggest_token_name({ dryRun, context, colorValue? })`
- `get_contrast({ dryRun, tokenPath, againstTokenPath })`
- `audit_project({ dryRun })`
- `audit_contrast({ dryRun })`

Every tool requires an explicit `dryRun` boolean. Agent paths are resolved against the active workspace folder and rejected if they escape it.

Example prompts for an MCP-capable coding agent:

- "List unused color tokens and suggest which ones can be removed."
- "Audit my theme tokens and list the highest priority fixes."
- "Suggest a name for the `backgroundColor` in `src/components/Button.tsx`."
- "Pick one text-like token and one background-like token, then check their contrast."

## Run Locally

```bash
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Quality Checks

```bash
npm run check
npm test
npm run test:integration
npm run lint
npm run format:check
```

`npm run test:integration` launches a VS Code Extension Host with `@vscode/test-electron`.

## Package as VSIX

```bash
npm run package
```

Install the generated `.vsix` from VS Code using **Extensions: Install from VSIX...**.

The extension is intentionally lightweight: the minified bundle (`dist/extension.js`) is about **90 KB**; a packaged `.vsix` is about **103 KB** (includes icon, manifest, README, changelog, and license).

## Contributing

- [CHANGELOG.md](CHANGELOG.md) — release notes
- [VERSIONING.md](VERSIONING.md) — when to bump patch / minor / major
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) — maintainer guide (build, publish, source map)

CI runs on pull requests via GitHub Actions (typecheck, lint, format check, tests, integration test compile, compile).

## Theme Token Support

Color Token Manager supports flat color files, structured theme objects, and React Native light/dark theme files.

### Simple colors file

```ts
export const colors = {
  primary: '#2563EB',
};
```

Settings (these are the defaults — no configuration needed):

```json
{
  "colorTokenManager.tokenFile": "src/theme/colors.ts",
  "colorTokenManager.tokenObject": "colors",
  "colorTokenManager.referencePrefix": "colors"
}
```

Generated reference: `colors.primary`

---

### Theme file

```ts
export const theme = {
  colors: {
    primary: '#2563EB',
    background: '#FFFFFF',
  },
};
```

Settings:

```json
{
  "colorTokenManager.tokenFile": "src/theme/theme.ts",
  "colorTokenManager.tokenObject": "theme",
  "colorTokenManager.referencePrefix": "theme.colors"
}
```

Generated reference: `theme.colors.primary`

Import inserted: `import { theme } from '../theme/theme';`

---

### Custom tokens file

```ts
export const tokens = {
  color: {
    primary: '#2563EB',
  },
};
```

Settings:

```json
{
  "colorTokenManager.tokenFile": "src/tokens.ts",
  "colorTokenManager.tokenObject": "tokens",
  "colorTokenManager.referencePrefix": "tokens.color"
}
```

Generated reference: `tokens.color.primary`

Import inserted: `import { tokens } from '../tokens';`

---

### React Native light/dark theme

```ts
export const theme = {
  light: {
    background: '#FFFFFF',
    text: '#111827',
  },
  dark: {
    background: '#111827',
    text: '#FFFFFF',
  },
};
```

Settings:

```json
{
  "colorTokenManager.tokenFile": "src/theme/theme.ts",
  "colorTokenManager.tokenObject": "theme",
  "colorTokenManager.referencePrefix": "theme"
}
```

> Full automatic light/dark pairing is planned for a future release. Tokens from nested objects are readable in the current release.

---

### Backward Compatibility

Existing `colors.ts` users do not need to change any settings. The extension defaults to the same behavior as before. New settings `tokenFile`, `tokenObject`, and `referencePrefix` are optional and override the existing `tokenFilePath`, `tokenExportName`, and `importIdentifier` settings respectively when set.

## Automatic Detection

Run **Color Token Manager: Detect Theme/Color Setup** from the Command Palette to automatically scan your workspace for token and theme files. The extension ranks candidates by confidence (based on path conventions like `src/theme/colors.ts`) and lets you select the file to use.

After detection, all settings are saved to your workspace configuration automatically.

## Color Series Naming

When extracting hardcoded colors, the extension suggests organized token names using built-in Tailwind-compatible palettes:

| Color     | Suggested Name |
| --------- | -------------- |
| `#3B82F6` | `primary.500`  |
| `#111827` | `neutral.900`  |
| `#22C55E` | `success.500`  |
| `#F59E0B` | `warning.500`  |
| `#EF4444` | `danger.500`   |

Property name context is also used: `backgroundColor` suggests `background`, `borderColor` suggests `border`, `color` suggests `text`.

## Reset Setup

Run **Color Token Manager: Reset Token Setup** to clear all token file settings from workspace configuration and start fresh.
