import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  addColorToken,
  createColorsFile,
  findExistingTokenByValue,
  getKnownColorsFile,
  getColorType,
  inspectTokenFile,
  normalizeColorValue,
  readColors,
  addColorAlias,
  updateColor,
  validateColorValue,
} from '../src/colorFile';
import * as vscode from 'vscode';
import { fixturePath } from './helpers/paths';

function colorsUri(...segments: string[]): vscode.Uri {
  return vscode.Uri.file(fixturePath(...segments)) as vscode.Uri;
}

test('validateColorValue accepts hex, rgb, rgba, hsl, and hsla', () => {
  assert.equal(validateColorValue('#FFF'), true);
  assert.equal(validateColorValue('#ffffff'), true);
  assert.equal(validateColorValue('rgb(255, 255, 255)'), true);
  assert.equal(validateColorValue('rgba(0, 0, 0, 0.5)'), true);
  assert.equal(validateColorValue('hsl(210, 50%, 40%)'), true);
  assert.equal(validateColorValue('hsla(210, 50%, 40%, 0.75)'), true);
});

test('validateColorValue rejects invalid literals', () => {
  assert.equal(validateColorValue('#GGGGGG'), false);
  assert.equal(validateColorValue('hsl(361, 0%, 100%)'), false);
  assert.equal(validateColorValue('hsl(0, 101%, 100%)'), false);
  assert.equal(validateColorValue('hsla(0, 0%, 100%, 1.5)'), false);
  assert.equal(validateColorValue('white'), false);
  assert.equal(validateColorValue(''), false);
});

test('normalizeColorValue expands short hex to six digits', () => {
  assert.equal(normalizeColorValue('#fff'), '#FFFFFF');
  assert.equal(normalizeColorValue('  #AbC  '), '#AABBCC');
});

test('normalizeColorValue normalizes rgb spacing', () => {
  assert.equal(normalizeColorValue('rgb(255, 255, 255)'), 'rgb(255,255,255)');
  assert.equal(normalizeColorValue('rgba(0, 0, 0, 0.5)'), 'rgba(0,0,0,0.5)');
});

test('normalizeColorValue normalizes hsl spacing', () => {
  assert.equal(normalizeColorValue('hsl(210, 50%, 40%)'), 'hsl(210,50%,40%)');
  assert.equal(normalizeColorValue('hsla(210, 50%, 40%, 0.75)'), 'hsla(210,50%,40%,0.75)');
});

test('getColorType classifies literals', () => {
  assert.equal(getColorType('#FFFFFF'), 'hex');
  assert.equal(getColorType('rgb(0, 0, 0)'), 'rgb');
  assert.equal(getColorType('rgba(0, 0, 0, 1)'), 'rgba');
  assert.equal(getColorType('hsl(0, 0%, 100%)'), 'hsl');
  assert.equal(getColorType('hsla(0, 0%, 100%, 0.5)'), 'hsla');
  assert.equal(getColorType('not-a-color'), 'unknown');
});

test('findExistingTokenByValue matches normalized hex', () => {
  const match = findExistingTokenByValue(
    [{ key: 'primary', value: '#FF6B00', type: 'hex' }],
    '#ff6b00',
  );
  assert.equal(match?.key, 'primary');
});

test('readColors parses flat colors.ts fixture', async () => {
  const colors = await readColors(colorsUri('colors', 'flat.ts'));
  const keys = colors.map((color) => color.key).sort();
  assert.deepEqual(keys, ['primary', 'secondary']);
  assert.equal(colors.find((color) => color.key === 'primary')?.value, '#FF6B00');
});

test('readColors parses nested token paths', async () => {
  const colors = await readColors(colorsUri('colors', 'nested.ts'));
  const keys = colors.map((color) => color.key).sort();
  assert.deepEqual(keys, ['background.white', 'text.black']);
});

test('readColors resolves alias tokens', async () => {
  const colors = await readColors(colorsUri('colors', 'with-alias.ts'));
  const button = colors.find((color) => color.key === 'button.background');
  assert.equal(button?.value, '#FF6B00');
  assert.equal(button?.aliasOf, 'primary');
});

test('readColors parses theme export token files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'theme.ts');
  fs.writeFileSync(
    filePath,
    `export const theme = {
  colors: {
    light: {
      background: {
        primary: '#FFFFFF',
      },
      text: {
        primary: '#111111',
      },
    },
  },
} as const;
`,
  );

  const colors = await readColors(vscode.Uri.file(filePath) as vscode.Uri);

  assert.equal(
    colors.find((color) => color.key === 'colors.light.background.primary')?.value,
    '#FFFFFF',
  );
  assert.equal(colors.find((color) => color.key === 'colors.light.text.primary')?.value, '#111111');
});

test('readColors parses custom themeColors exports', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'themeColors.tsx');
  fs.writeFileSync(
    filePath,
    `import { Colors } from '../style';
export const themeColors = {
  light: {
    text: {
      primaryText: '#111111',
      purpleText: '#7C3AED',
    },
    background: {
      primaryBg: '#FFFFFF',
    },
  },
  dark: {
    text: {
      primaryText: '#FFFFFF',
    },
    background: {
      primaryBg: '#262626',
    },
  },
} as const;
`,
  );

  const colors = await readColors(vscode.Uri.file(filePath) as vscode.Uri);

  assert.equal(colors.find((color) => color.key === 'light.text.primaryText')?.value, '#111111');
  assert.equal(colors.find((color) => color.key === 'dark.background.primaryBg')?.value, '#262626');
});

test('readColors parses plain JSON token files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'tokens.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        text: {
          primaryText: '#111111',
        },
        background: {
          primaryBg: '#FFFFFF',
        },
      },
      null,
      2,
    ),
  );

  const colors = await readColors(vscode.Uri.file(filePath) as vscode.Uri);
  const inspection = await inspectTokenFile(vscode.Uri.file(filePath) as vscode.Uri);

  assert.equal(colors.find((color) => color.key === 'text.primaryText')?.value, '#111111');
  assert.equal(colors.find((color) => color.key === 'background.primaryBg')?.value, '#FFFFFF');
  assert.equal(inspection.exportName, 'tokens');
  assert.equal(inspection.hasThemeShape, true);
  assert.equal(inspection.nestedTokenCount, 2);
});

test('readColors parses JSONC token files with comments and trailing commas', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'tokens.jsonc');
  fs.writeFileSync(
    filePath,
    `{
  // Semantic text tokens
  "text": {
    "primaryText": "#111111",
  },
  "background": {
    "primaryBg": "#FFFFFF",
  },
}
`,
  );

  const colors = await readColors(vscode.Uri.file(filePath) as vscode.Uri);
  const inspection = await inspectTokenFile(vscode.Uri.file(filePath) as vscode.Uri);

  assert.equal(colors.find((color) => color.key === 'text.primaryText')?.value, '#111111');
  assert.equal(colors.find((color) => color.key === 'background.primaryBg')?.value, '#FFFFFF');
  assert.equal(inspection.exportName, 'tokens');
  assert.equal(inspection.hasThemeShape, true);
});

test('addColorToken keeps JSON token files valid', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'tokens.json');
  fs.writeFileSync(filePath, `{\n  "text": {\n    "primary": "#111111"\n  }\n}\n`);

  await addColorToken(vscode.Uri.file(filePath) as vscode.Uri, 'background.primary', '#FFFFFF');

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    background?: { primary?: string };
  };
  assert.equal(parsed.background?.primary, '#FFFFFF');
});

test('addColorAlias keeps JSON token aliases as design token references', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'tokens.json');
  fs.writeFileSync(filePath, `{\n  "primary": "#FF6B00"\n}\n`);

  await addColorAlias(vscode.Uri.file(filePath) as vscode.Uri, 'button.background', 'primary');

  const colors = await readColors(vscode.Uri.file(filePath) as vscode.Uri);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    button?: { background?: string };
  };

  assert.equal(parsed.button?.background, '{primary}');
  assert.equal(colors.find((color) => color.key === 'button.background')?.value, '#FF6B00');
});

test('readColors parses YAML token files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'tokens.yaml');
  fs.writeFileSync(
    filePath,
    `# Design tokens
text:
  primaryText: "#111111"
background:
  primaryBg: '#FFFFFF'
`,
  );

  const colors = await readColors(vscode.Uri.file(filePath) as vscode.Uri);
  const inspection = await inspectTokenFile(vscode.Uri.file(filePath) as vscode.Uri);

  assert.equal(colors.find((color) => color.key === 'text.primaryText')?.value, '#111111');
  assert.equal(colors.find((color) => color.key === 'background.primaryBg')?.value, '#FFFFFF');
  assert.equal(inspection.exportName, 'tokens');
  assert.equal(inspection.hasThemeShape, true);
});

test('addColorToken keeps YAML token files valid', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'tokens.yml');
  fs.writeFileSync(filePath, `text:\n  primary: "#111111"\n`);

  await addColorToken(vscode.Uri.file(filePath) as vscode.Uri, 'background.primary', '#FFFFFF');

  const text = fs.readFileSync(filePath, 'utf8');
  const colors = await readColors(vscode.Uri.file(filePath) as vscode.Uri);

  assert.match(text, /background:\n  primary: "#FFFFFF"/);
  assert.equal(colors.find((color) => color.key === 'background.primary')?.value, '#FFFFFF');
});

test('inspectTokenFile recognizes nested React Native theme paths', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'theme.ts');
  fs.writeFileSync(
    filePath,
    `import { Colors } from '../style';
export const theme = {
  text: {
    primaryText: Colors.BLACK,
    inverseText: '#FFFFFF',
  },
  background: {
    secondaryBg: Colors.WHITE,
  },
} as const;
`,
  );

  const inspection = await inspectTokenFile(vscode.Uri.file(filePath) as vscode.Uri);

  assert.equal(inspection.exportName, 'theme');
  assert.equal(inspection.hasThemeShape, true);
  assert.equal(inspection.hasTokenShape, true);
  assert.equal(inspection.referenceTokenCount, 2);
  assert.ok(inspection.pathSamples.includes('theme.text.primaryText'));
  assert.ok(inspection.pathSamples.includes('theme.background.secondaryBg'));
});

test('readColors resolves aliases against the detected export name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'tokens.ts');
  fs.writeFileSync(
    filePath,
    `export const tokens = {
  color: {
    brand: '#FF6B00',
    button: tokens.color.brand,
  },
} as const;
`,
  );

  const colors = await readColors(vscode.Uri.file(filePath) as vscode.Uri);
  const button = colors.find((color) => color.key === 'color.button');

  assert.equal(button?.value, '#FF6B00');
  assert.equal(button?.aliasOf, 'color.brand');
});

test('getKnownColorsFile prefers tokenFilePath over legacy colorsFilePath', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'colors.ts'), `export const colors = { primary: '#000000' };`);
  fs.writeFileSync(
    path.join(dir, 'theme.ts'),
    `export const theme = { colors: { primary: '#FFFFFF' } };`,
  );

  (vscode as unknown as { __setWorkspaceRoot(value: string): void }).__setWorkspaceRoot(dir);
  (vscode as unknown as { __setTestConfig(values: Record<string, unknown>): void }).__setTestConfig(
    {
      colorsFilePath: 'colors.ts',
      tokenFilePath: 'theme.ts',
    },
  );

  const known = await getKnownColorsFile();

  assert.equal(known?.fsPath, path.join(dir, 'theme.ts'));
});

test('getConfiguredColorsFile uses themeFile when workflow is themeOnly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'colors.ts'), `export const colors = { primary: '#000000' };`);
  fs.writeFileSync(
    path.join(dir, 'theme.ts'),
    `export const theme = { colors: { primary: '#FFFFFF' } };`,
  );

  (vscode as unknown as { __setWorkspaceRoot(value: string): void }).__setWorkspaceRoot(dir);
  (vscode as unknown as { __setTestConfig(values: Record<string, unknown>): void }).__setTestConfig(
    {
      projectWorkflow: 'themeOnly',
      themeFile: 'theme.ts',
      colorsFile: 'colors.ts',
    },
  );

  const known = await getKnownColorsFile();

  assert.equal(known?.fsPath, path.join(dir, 'theme.ts'));
});

const tempDirs: string[] = [];

beforeEach(() => {
  tempDirs.length = 0;
  (vscode as unknown as { __resetTestConfig(): void }).__resetTestConfig();
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('updateColor edits a token in a writable copy', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'colors.ts');
  fs.copyFileSync(fixturePath('colors', 'flat.ts'), filePath);

  const uri = vscode.Uri.file(filePath) as vscode.Uri;
  await updateColor(uri, 'primary', '#010203');

  const colors = await readColors(uri);
  assert.equal(colors.find((color) => color.key === 'primary')?.value, '#010203');
});

// ── Template creation tests (Phase 3/6) ──────────────────────────────────────

test('createColorsFile creates colorSeries template with numeric scale', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-tpl-'));
  tempDirs.push(dir);
  const uri = vscode.Uri.file(path.join(dir, 'colors.ts')) as vscode.Uri;

  await createColorsFile(uri, 'colorSeries');
  const content = fs.readFileSync(uri.fsPath, 'utf8');

  assert.ok(content.includes('primary'), 'should include primary series');
  assert.ok(content.includes('neutral'), 'should include neutral series');
  assert.ok(content.includes('success'), 'should include success series');
  assert.ok(content.includes('500'), 'should include 500 scale step');
  assert.ok(content.includes('export const colors'), 'should export colors');
});

test('createColorsFile creates lightDark template with two exports', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-tpl-'));
  tempDirs.push(dir);
  const uri = vscode.Uri.file(path.join(dir, 'theme.ts')) as vscode.Uri;

  await createColorsFile(uri, 'lightDark');
  const content = fs.readFileSync(uri.fsPath, 'utf8');

  assert.ok(content.includes('export const lightTheme'), 'should export lightTheme');
  assert.ok(content.includes('export const darkTheme'), 'should export darkTheme');
  assert.ok(content.includes("background: '#FFFFFF'"), 'lightTheme should have white background');
  assert.ok(content.includes("background: '#111827'"), 'darkTheme should have dark background');
});

test('createColorsFile creates reactNative template with light and dark sub-objects', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-tpl-'));
  tempDirs.push(dir);
  const uri = vscode.Uri.file(path.join(dir, 'theme.ts')) as vscode.Uri;

  await createColorsFile(uri, 'reactNative');
  const content = fs.readFileSync(uri.fsPath, 'utf8');

  assert.ok(content.includes('export const theme'), 'should export theme');
  assert.ok(content.includes('light:'), 'should have light sub-object');
  assert.ok(content.includes('dark:'), 'should have dark sub-object');
  assert.ok(content.includes('background:'), 'should have background tokens');
  assert.ok(content.includes('text:'), 'should have text tokens');
});

test('addColorToken keeps trailing-comment commas on the same property line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'colors.ts');
  fs.writeFileSync(
    filePath,
    `export const colors = {
  gradientDarkNavy: 'rgba(24, 40, 72, 1)', // #182848
} as const;
`,
  );

  const uri = vscode.Uri.file(filePath) as vscode.Uri;
  await addColorToken(uri, 'shimmerBackground', 'rgba(255,255,255,0.4)');

  const text = fs.readFileSync(filePath, 'utf8');
  assert.equal(text.includes('\n,\n'), false);
  assert.match(
    text,
    /gradientDarkNavy: 'rgba\(24, 40, 72, 1\)', \/\/ #182848\n {2}shimmerBackground: 'rgba\(255,255,255,0\.4\)',/,
  );
});
