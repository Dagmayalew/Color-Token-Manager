# Color Token Manager

Color Token Manager helps React Native and TypeScript projects manage color tokens from a `colors.ts` file.

It can:
- Read and edit color tokens from `colors.ts`
- Detect hardcoded colors in TypeScript and React Native files
- Extract hardcoded colors into reusable tokens
- Replace hardcoded values with `colors.tokenName`
- Preview folder-wide color extraction before applying edits

## Commands

- Open Color Token Manager
- Extract Colors From Current File
- Extract Colors From Folder
- Preview Colors From Folder
- Preview Colors From Selection
- Pick Colors File
- Refresh Color Tokens

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

## Safety

Folder-wide extraction can change many files. Use **Preview Colors From Folder** first, review the proposed replacements, edit token names if needed, and then apply changes from the preview panel.

## Run Locally

```bash
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Package as VSIX

```bash
npm run package
```

Install the generated `.vsix` from VS Code using **Extensions: Install from VSIX...**.
