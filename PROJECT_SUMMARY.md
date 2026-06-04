# Project Summary: Color Token Manager VS Code Extension

This is a VS Code extension named **Color Token Manager**.

Workspace path:

```txt
/Users/dagmayalew/extentions
```

Marketplace extension id:

```txt
dagmayalew.color-token-manager
```

Marketplace URL:

```txt
https://marketplace.visualstudio.com/items?itemName=dagmayalew.color-token-manager
```

## Main Goal

Color Token Manager helps React Native, TypeScript, JavaScript, and design-system projects extract hardcoded colors into a central `colors.ts` token file.

It detects hardcoded values like:

```ts
backgroundColor: '#FFFFFF',
borderColor: '#E5E5EA',
color: '#000000',
```

Then it can add missing tokens to `colors.ts` and replace literals with token references:

```ts
backgroundColor: colors.background.white,
borderColor: colors.border.E5E5EA,
color: colors.text.black,
```

## Main Features

### Color Token Manager UI

Command:

```txt
Open Color Token Manager
```

The UI reads a configured or selected `colors.ts` file and shows color tokens in a webview.

It can:

- List color tokens
- Show swatches
- Edit token values
- Copy values
- Refresh
- Pick another `colors.ts`
- Run extraction, preview, rename, unused-token, and export workflows

Supported `colors.ts` shape:

```ts
export const colors = {
  primary: '#FF6B00',
  background: {
    white: '#FFFFFF',
  },
  text: {
    black: '#000000',
  },
};
```

### Hardcoded Color Extraction

Supported source files:

- `.ts`
- `.tsx`
- `.js`
- `.jsx`

Supported hardcoded color values:

- `'#FFF'`
- `'#FFFFFF'`
- `'rgb(255, 255, 255)'`
- `'rgba(255, 255, 255, 0.5)'`

The extractor ignores:

- Imports
- Comments
- `colors.ts`
- Excluded folders/files like `node_modules`, `dist`, tests, stories, and mocks

### Extract From Current File

Command:

```txt
Extract Colors From Current File
```

Behavior:

- Looks at the active file
- Finds hardcoded colors
- Checks `colors.ts`
- Reuses an existing token if the value already exists
- Adds a missing token if not found
- Replaces hardcoded literals with `colors.tokenName`
- Adds the colors import automatically

### Extract From Folder

Command:

```txt
Extract Colors From Folder
```

Behavior:

- User selects a folder
- Recursively scans supported files inside it
- Also enters nested folders
- Skips excluded files by default
- Applies extraction across the folder
- Creates backups before folder-wide extraction if enabled

### Preview Colors From Folder

Command:

```txt
Preview Colors From Folder
```

This is the safer folder-wide workflow.

It scans a folder and opens a preview panel showing:

- Files with hardcoded colors
- Color values found
- Suggested token names
- Whether each token will be added, reused, aliased, or skipped
- Line numbers
- Buttons to jump to exact occurrences
- Editable token names
- Checkboxes to apply only selected rows/files

### Preview Colors From Selection

Command:

```txt
Preview Colors From Selection
```

User selects part of a file, runs the command, and only colors inside that selected range are previewed and applied.

### Diagnostics And Quick Fixes

The extension activates for:

- TypeScript
- TSX
- JavaScript
- JSX

It underlines hardcoded colors with a hint diagnostic.

Quick fix:

```txt
Extract this color
```

This opens a preview for the exact hardcoded color occurrence.

### Token Rename / Refactor

Command:

```txt
Rename Color Token
```

Behavior:

- Reads existing tokens from `colors.ts`
- User picks a token
- User enters a new token name/path
- Renames the token in `colors.ts`
- Updates project references like `colors.oldName` to `colors.newName`

Nested token paths are supported:

```ts
colors.button.background
```

### Unused Token Finder

Command:

```txt
Find Unused Color Tokens
```

Behavior:

- Reads all tokens from `colors.ts`
- Scans supported project files
- Finds tokens that are never referenced
- Opens a markdown report listing unused tokens

### Design Token Export

Command:

```txt
Export Design Tokens
```

Supported export formats:

- JSON
- CSS Variables
- Tailwind Config
- Figma Tokens

Example CSS output:

```css
:root {
  --background-white: #FFFFFF;
  --text-black: #000000;
}
```

Example Figma Tokens output:

```json
{
  "background": {
    "white": {
      "value": "#FFFFFF",
      "type": "color"
    }
  }
}
```

### Nested Color Objects

The extension supports nested token objects in `colors.ts`.

Example:

```ts
export const colors = {
  button: {
    background: '#FF6B00',
    text: '#FFFFFF',
  },
  border: {
    default: '#E5E5EA',
  },
};
```

References become:

```ts
colors.button.background
colors.button.text
colors.border.default
```

### Semantic Token Naming

Setting:

```json
"colorTokenManager.namingStrategy": "semantic"
```

Other supported strategies:

```json
"colorTokenManager.namingStrategy": "contextValue"
"colorTokenManager.namingStrategy": "valueOnly"
```

Semantic naming uses surrounding code context.

Example:

```ts
button: {
  backgroundColor: '#FF6B00'
}
```

Can become:

```ts
colors.button.background
```

Other grouping examples:

- `background.white`
- `text.gray500`
- `border.E5E5EA`
- `button.background`

### Aliases For Duplicate Values

Setting:

```json
"colorTokenManager.createSemanticAliases": true
```

If a color already exists, the extension can create a semantic alias instead of duplicating a raw value.

Example:

```ts
export const colors = {
  primary: '#FF6B00',
  button: {
    background: colors.primary,
  },
};
```

## Important Settings

```json
{
  "colorTokenManager.colorsFilePath": "",
  "colorTokenManager.importPath": "",
  "colorTokenManager.generatedNamePrefix": "",
  "colorTokenManager.namingStrategy": "semantic",
  "colorTokenManager.autoReplaceExistingColors": true,
  "colorTokenManager.excludeGlobs": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/ios/**",
    "**/android/**",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/*.stories.ts",
    "**/*.stories.tsx",
    "**/__mocks__/**"
  ],
  "colorTokenManager.createSemanticAliases": true,
  "colorTokenManager.createBackupsBeforeFolderExtraction": true,
  "colorTokenManager.importMode": "named",
  "colorTokenManager.importIdentifier": "colors",
  "colorTokenManager.extractEmbeddedColors": false
}
```

## Import Options

Default generated import:

```ts
import { colors } from '../theme/colors';
```

Supported import modes:

- `named`
- `default`
- `namespace`

Custom identifier:

```json
"colorTokenManager.importIdentifier": "themeColors"
```

Then references become:

```ts
themeColors.primary
```

## Main Source Files

```txt
src/extension.ts
```

Registers commands, webviews, diagnostics, and main extension activation.

```txt
src/colorExtractor.ts
```

Finds hardcoded colors, builds previews, applies replacements, and handles folder/current-file/selection extraction.

```txt
src/colorFile.ts
```

Reads and edits `colors.ts` using `ts-morph`. Supports nested color objects and aliases.

```txt
src/importUtils.ts
```

Handles generated import statements and import identifier settings.

```txt
src/previewWebview.ts
```

HTML for the extraction preview panel.

```txt
src/resultsWebview.ts
```

HTML for the apply-results panel.

```txt
src/webview.ts
```

HTML for the main Color Token Manager UI.

```txt
src/diagnostics.ts
```

Provides editor diagnostics and quick fixes for hardcoded colors.

```txt
src/tokenTools.ts
```

Provides token rename/refactor, unused token finder, and design token export.

```txt
src/types.ts
```

Shared TypeScript types.

## Build And Test Commands

Install dependencies:

```bash
npm install
```

Check TypeScript:

```bash
npm run check
```

Compile and bundle:

```bash
npm run compile
```

Package VSIX:

```bash
npm run package
```

Install locally:

```bash
code --install-extension /Users/dagmayalew/extentions/color-token-manager-0.0.1.vsix --force
```

Publish patch update:

```bash
npx vsce publish patch
```

## Packaging Notes

The extension uses esbuild bundling.

Main compiled file:

```txt
dist/extension.js
```

VSIX path:

```txt
/Users/dagmayalew/extentions/color-token-manager-0.0.1.vsix
```

Current VSIX size is around:

```txt
1.39 MB
```

There is a warning that `dist/extension.js` is around `5.6 MB`, mostly because `ts-morph` is bundled. This is acceptable for now, but reducing or removing `ts-morph` could make the extension smaller later.

## Publish Workflow

Before publishing the next update:

1. Add desired features.
2. Run `npm run compile`.
3. Run `npm run package`.
4. Install the local VSIX with `--force`.
5. Test in VS Code.
6. Publish with `npx vsce publish patch`.
