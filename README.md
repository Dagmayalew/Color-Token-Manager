# Color Token Manager

Color Token Manager helps React Native and TypeScript projects manage color tokens from a `colors.ts` file.

It can:

- Read and edit color tokens from `colors.ts`
- Detect hardcoded colors in TypeScript, JavaScript, Vue, and CSS-family files
- Support `#RGB`, `#RRGGBB`, `rgb()`, `rgba()`, `hsl()`, and `hsla()` literals
- Underline hardcoded colors and offer an editor quick fix
- Show inline color swatches next to hardcoded colors
- Warn when text-like tokens fail WCAG contrast against background tokens
- Extract hardcoded colors into reusable tokens
- Replace hardcoded values with `colors.tokenName`
- Preview current selection or folder-wide extraction before applying edits
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
- Export Design Tokens
- Pick Colors File
- Refresh Color Tokens

## First Run

Run **Set Up Color Token Manager** or click **Set up Colors** in the status bar.

The setup wizard can:

- Find an existing `colors.ts`
- Create `src/theme/colors.ts`
- Create a custom `colors.ts` path
- Set `tokenPathMode` to auto, flat, or nested

After setup, choose **Open Manager** or **Preview Current File** to continue safely.

## Editor Quick Fix

Open a supported `.ts`, `.tsx`, `.js`, `.jsx`, `.vue`, `.css`, `.scss`, or `.less` file. Hardcoded color literals are underlined with a hint diagnostic and shown with inline swatches. Use the lightbulb action **Extract this color** to open a preview for that exact occurrence.

## Contrast Checks

In `colors.ts`, text-like tokens such as `text.muted` are checked against background-like tokens such as `background.white`. The default target is WCAG AA (`4.5:1`), and it can be changed to AAA.

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

`colorTokenManager.colorsFilePath` is resolved relative to the **workspace folder of the active file**, so each root in a multi-root workspace can use its own path (for example in that root’s `.vscode/settings.json`). Folder pickers and export dialogs default to the same folder.

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

Folder-wide extraction can change many files. Use **Preview Colors From Folder** first, filter the proposed replacements, uncheck anything you do not want to apply, edit token names if needed, and then apply selected changes from the preview panel.

## MCP Server

Color Token Manager can expose your workspace color-token graph to local AI coding agents over MCP stdio. The extension includes a small standalone MCP process (`dist/mcp-server.js`) that clients such as Cursor can spawn directly.

Quick setup:

1. Run **Color Token Manager: Connect AI Agent** or click **Connect AI Agent** in the manager.
2. Pick your client: Cursor, Claude Code, Windsurf, or Custom MCP Client.
3. Reload the selected client.
4. Ask the agent to read `colors://help` first.

Client behavior:

- Cursor: installs `.cursor/mcp.json` in the active workspace
- Claude Code: installs `.mcp.json` in the active workspace
- Windsurf: installs `~/.codeium/windsurf/mcp_config.json`
- Custom MCP Client: copies a standard JSON snippet to your clipboard

The installer preserves any existing `mcpServers` entries and only adds or updates the `color-token-manager` server. Use **Copy MCP Client Config** if you prefer to paste the JSON manually.

Resources:

- `colors://help` — agent workflow, safety rules, resources, tools, and example prompts
- `colors://tokens` — full token tree plus flat token metadata
- `colors://tokens/flat` — `{ "path.to.token": "#FFFFFF" }`
- `colors://tokens/unused` — unused token report
- `colors://exports/{format}` — `json`, `css`, `tailwind`, `w3c`, or `figma`

Tools:

- `extract_from_file({ dryRun, path })`
- `suggest_token_name({ dryRun, context, colorValue? })`
- `get_contrast({ dryRun, tokenPath, againstTokenPath })`

Every tool requires an explicit `dryRun` boolean. Agent paths are resolved against the active workspace folder and rejected if they escape it.

Example prompts for an MCP-capable coding agent:

- "List unused color tokens and suggest which ones can be removed."
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
