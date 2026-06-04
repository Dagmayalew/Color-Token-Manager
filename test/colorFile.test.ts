import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  addColorToken,
  findExistingTokenByValue,
  getColorType,
  normalizeColorValue,
  readColors,
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

const tempDirs: string[] = [];

beforeEach(() => {
  tempDirs.length = 0;
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
  assert.match(text, /gradientDarkNavy: 'rgba\(24, 40, 72, 1\)', \/\/ #182848\n  shimmerBackground: 'rgba\(255,255,255,0\.4\)',/);
});
