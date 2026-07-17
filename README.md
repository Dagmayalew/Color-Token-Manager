# Color Token Manager

Color Token Manager helps projects manage color tokens from `colors.ts`, `theme.ts`, `themes.ts`, `tokens.ts`, or `designTokens.ts`.

## Demo

<video src="resources/demo.mov" controls width="100%"></video>

It can:

- Set up a workspace
- Preview hardcoded colors before changes are applied
- Scan JavaScript, TypeScript, CSS-family files, and HTML inline styles
- Replace colors with tokens or CSS variables when it is safe to do so
- Audit contrast, find unused tokens, and export tokens to common formats

## Start Here

If you’re new, use this path:

1. Run **Set Up Color Token Manager**.
2. Open **Color Token Manager**.
3. Use **Preview Current File** before applying any changes.

## First Run

1. Run **Set Up Color Token Manager** or click **Set up Colors** in the status bar.
2. Let the setup wizard find or create the right file.
3. Open **Color Token Manager** or use **Preview Current File**.

## Multi-Language Support

Color Token Manager uses language-specific rules so each file type can decide what is safe to edit. Safe mode is the default: JavaScript, TypeScript, CSS/SCSS/LESS, and HTML inline styles can be replaced after preview; other popular languages are scanned only.

The main workflow is simple:

1. Pick a setup style.
2. Let the extension detect or create the right file.
3. Preview before applying changes.

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

The preview panel groups findings by language and shows whether each item can be applied.

### Language Settings

Use this to choose which languages are scanned:

```json
"colorTokenManager.enabledLanguages": [
  "javascript",
  "typescript",
  "css",
  "html",
  "dart"
]
```

Use this to choose how edits are handled:

```json
"colorTokenManager.languageMode": "safe"
```

Modes:

| Value          | Behavior                                        |
| -------------- | ----------------------------------------------- |
| `safe`         | Replace only languages that support safe edits. |
| `scanOnly`     | Scan and preview, but do not apply edits.       |
| `experimental` | Allow edits for supported languages.            |

CSS output uses:

```json
"colorTokenManager.cssTokenFormat": "cssVariable"
```

## Editor Quick Fix

Open a supported file and hardcoded color literals are underlined with inline swatches. Supported languages can offer quick fixes; other languages open the extraction preview instead.

## Contrast Checks

Text-like tokens are checked against background-like tokens in the selected file. The default target is AA (`4.5:1`), and it can be changed to AAA.

## Theme Audits

Run **Audit Design Tokens** to open a theme-aware report. It checks:

- light/dark token groups
- missing counterparts
- duplicate values
- aliases
- unused tokens
- contrast risks
- next steps

Run **Audit Contrast** when you only want the contrast section.

## Primitive And Semantic Layers

By default, `colorTokenManager.tokenPathMode` is `auto`: flat files keep flat references, and nested files keep nested references.

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

For design-system workflows, turn on semantic-first mode:

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

Use `colorTokenManager.themeTokenPrefix` to generate themed paths like `colors.dark.background.primary` or `colors.semantic.dark.background.primary`.

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

`colorTokenManager.tokenFilePath` is resolved relative to the workspace folder of the active file. `colorTokenManager.colorsFilePath` is still supported as a legacy fallback.

Set `colorTokenManager.tokenExportName` when your token object uses a custom export name. The default is `auto`, which detects `colors`, `theme`, `themes`, `tokens`, or `designTokens`.

## Import mode

Generated imports use `colorTokenManager.importMode`:

| Value             | Example                                      |
| ----------------- | -------------------------------------------- |
| `named` (default) | `import { colors } from '../theme/colors';`  |
| `default`         | `import colors from '../theme/colors';`      |
| `namespace`       | `import * as colors from '../theme/colors';` |

Use `colorTokenManager.importIdentifier` to change the `colors` identifier in code and imports.

The older setting `colorTokenManager.importStyle` is deprecated and will be removed in **v1.0.0**. Use `colorTokenManager.importMode` instead.

## Safety

Folder-wide extraction can change many files. Use **Preview Colors From Folder** first, filter the proposed replacements, review the language groups, uncheck anything you do not want to apply, edit token names if needed, and then apply selected changes from the preview panel. Preview-only language findings are shown for review but are not applied.

## MCP Server

Color Token Manager can share your workspace tokens with AI coding tools over MCP stdio. It includes a standalone MCP process (`dist/mcp-server.js`) that clients such as Cursor can start.

Quick setup:

1. Run **Color Token Manager: Connect AI Agent**.
2. Pick your client.
3. Reload the client.
4. Ask the agent to read `colors://help` first.
5. Run **Color Token Manager: Test MCP Server** if you want to verify the MCP process.

Client behavior:

- Cursor: installs `.cursor/mcp.json`
- Claude Code: installs `.mcp.json`
- Windsurf: installs `~/.codeium/windsurf/mcp_config.json`
- Codex: installs `~/.codex/config.toml`
- Custom MCP Client: copies a JSON snippet

The installer keeps existing `mcpServers` entries and only adds or updates `color-token-manager`.

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

Every tool requires a `dryRun` boolean. Agent paths stay inside the active workspace.

Example prompts:

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

The extension is intentionally lightweight: the minified bundle is about **90 KB** and the packaged `.vsix` is about **103 KB**.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, testing, and pull request guidance.

CI runs on pull requests via GitHub Actions (typecheck, lint, format check, tests, integration test compile, compile).

## Theme Token Support

Color Token Manager works with simple color files, theme objects, custom token files, and light/dark theme files.

For a basic colors file:

```json
{
  "colorTokenManager.tokenFile": "src/theme/colors.ts",
  "colorTokenManager.tokenObject": "colors",
  "colorTokenManager.referencePrefix": "colors"
}
```

For a theme file:

```json
{
  "colorTokenManager.tokenFile": "src/theme/theme.ts",
  "colorTokenManager.tokenObject": "theme",
  "colorTokenManager.referencePrefix": "theme.colors"
}
```

For a custom token file:

```json
{
  "colorTokenManager.tokenFile": "src/tokens.ts",
  "colorTokenManager.tokenObject": "tokens",
  "colorTokenManager.referencePrefix": "tokens.color"
}
```

Use a light/dark theme file when your project keeps both modes in one object. Automatic light/dark pairing is planned for a future release. Existing `colors.ts` users do not need to change anything, and the newer settings are optional.

## Automatic Detection

Run **Color Token Manager: Detect Theme/Color Setup** to scan your workspace for token and theme files. The extension ranks candidates by confidence and lets you choose the file to use.

After detection, all settings are saved to your workspace configuration automatically.

## Color Series Naming

When extracting hardcoded colors, the extension suggests organized token names using built-in palettes:

| Color     | Suggested Name |
| --------- | -------------- |
| `#3B82F6` | `primary.500`  |
| `#111827` | `neutral.900`  |
| `#22C55E` | `success.500`  |
| `#F59E0B` | `warning.500`  |
| `#EF4444` | `danger.500`   |

Property name context is also used.

## Reset Setup

Run **Color Token Manager: Reset Token Setup** to clear token file settings and start fresh.
