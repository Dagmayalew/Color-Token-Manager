import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, test } from 'node:test';
import { extractHardcodedColorsFromText } from '../src/colorExtractor';
import { getColorsIdentifier, getTokenReferencePrefix } from '../src/importUtils';
import { getReplacementText } from '../src/colorScan';
import { getKnownColorsFile } from '../src/colorFile';
import * as vscode from 'vscode';
import { resetColorTokenManagerConfig, setColorTokenManagerConfig } from './helpers/config';

const tempDirs: string[] = [];

beforeEach(() => {
  tempDirs.length = 0;
  resetColorTokenManagerConfig();
});

afterEach(() => {
  resetColorTokenManagerConfig();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── getTokenReferencePrefix ──────────────────────────────────────────────────

test('getTokenReferencePrefix returns referencePrefix when configured', () => {
  setColorTokenManagerConfig({ referencePrefix: 'theme.colors' });
  assert.equal(getTokenReferencePrefix(), 'theme.colors');
});

test('getTokenReferencePrefix returns multi-part prefix unchanged', () => {
  setColorTokenManagerConfig({ referencePrefix: 'tokens.color' });
  assert.equal(getTokenReferencePrefix(), 'tokens.color');
});

test('getTokenReferencePrefix falls back to getColorsIdentifier when not set', () => {
  // No new settings; falls back to default identifier 'colors'
  assert.equal(getTokenReferencePrefix(), 'colors');
});

test('getTokenReferencePrefix uses tokenObject as fallback when referencePrefix is absent', () => {
  setColorTokenManagerConfig({ tokenObject: 'theme' });
  assert.equal(getTokenReferencePrefix(), 'theme');
});

// ── getColorsIdentifier ──────────────────────────────────────────────────────

test('getColorsIdentifier returns first segment of referencePrefix', () => {
  setColorTokenManagerConfig({ referencePrefix: 'theme.colors' });
  assert.equal(getColorsIdentifier(), 'theme');
});

test('getColorsIdentifier returns tokenObject when no referencePrefix is set', () => {
  setColorTokenManagerConfig({ tokenObject: 'theme' });
  assert.equal(getColorsIdentifier(), 'theme');
});

test('getColorsIdentifier returns tokenObject for tokens file', () => {
  setColorTokenManagerConfig({ tokenObject: 'tokens' });
  assert.equal(getColorsIdentifier(), 'tokens');
});

test('getColorsIdentifier defaults to colors when no new settings are configured', () => {
  // Backward compatibility: no new settings → 'colors'
  assert.equal(getColorsIdentifier(), 'colors');
});

test('getColorsIdentifier referencePrefix takes priority over tokenObject', () => {
  setColorTokenManagerConfig({ referencePrefix: 'theme.colors', tokenObject: 'theme' });
  // Should return first segment of referencePrefix
  assert.equal(getColorsIdentifier(), 'theme');
});

test('getColorsIdentifier single-segment referencePrefix works', () => {
  setColorTokenManagerConfig({ referencePrefix: 'colors' });
  assert.equal(getColorsIdentifier(), 'colors');
});

// ── getReplacementText ───────────────────────────────────────────────────────

test('getReplacementText uses referencePrefix for literal color replacement', () => {
  setColorTokenManagerConfig({ referencePrefix: 'theme.colors' });
  const [color] = extractHardcodedColorsFromText(`const x = '#2563EB';`);
  assert.equal(getReplacementText(color, 'primary'), 'theme.colors.primary');
});

test('getReplacementText uses referencePrefix tokens.color for replacement', () => {
  setColorTokenManagerConfig({ referencePrefix: 'tokens.color' });
  const [color] = extractHardcodedColorsFromText(`const x = '#2563EB';`);
  assert.equal(getReplacementText(color, 'primary'), 'tokens.color.primary');
});

test('getReplacementText defaults to colors.tokenName when no prefix is configured', () => {
  const [color] = extractHardcodedColorsFromText(`const x = '#111827';`);
  assert.equal(getReplacementText(color, 'textBlack'), 'colors.textBlack');
});

test('getReplacementText uses tokenObject as prefix when referencePrefix is absent', () => {
  setColorTokenManagerConfig({ tokenObject: 'theme' });
  const [color] = extractHardcodedColorsFromText(`const x = '#111827';`);
  assert.equal(getReplacementText(color, 'textBlack'), 'theme.textBlack');
});

test('getReplacementText uses referencePrefix for embedded string colors', () => {
  setColorTokenManagerConfig({ referencePrefix: 'theme.colors', extractEmbeddedColors: true });
  const [color] = extractHardcodedColorsFromText(`const shadow = '0 0 8px #000000';`);
  assert.equal(color.replacementKind, 'embeddedString');
  assert.equal(getReplacementText(color, 'shadowDark'), '`0 0 8px ${theme.colors.shadowDark}`');
});

import { cssAdapter } from '../src/languages/cssAdapter';

test('getReplacementText still returns CSS variable for cssLiteral kind regardless of prefix', () => {
  setColorTokenManagerConfig({ referencePrefix: 'theme.colors' });
  const [color] = extractHardcodedColorsFromText(`.button { color: #ffffff; }`, {
    includeUnquotedColors: true,
  });
  assert.equal(color.replacementKind, 'cssLiteral');
  // CSS literals always become CSS variables, prefix is not used
  assert.equal(
    getReplacementText(color, 'buttonBackground', cssAdapter),
    'var(--color-button-background)',
  );
});

// ── Token file resolution (tokenFile setting) ────────────────────────────────

test('getKnownColorsFile uses tokenFile setting over tokenFilePath', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-theme-'));
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
      tokenFilePath: 'colors.ts',
      tokenFile: 'theme.ts',
    },
  );

  const known = await getKnownColorsFile();
  assert.equal(known?.fsPath, path.join(dir, 'theme.ts'));
});

test('getKnownColorsFile falls back to tokenFilePath when tokenFile is not set', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-theme-'));
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

// ── Backward compatibility ───────────────────────────────────────────────────

test('existing colors.ts workflow: getReplacementText produces colors.tokenName', () => {
  // No new settings configured — should behave exactly as before
  const [color] = extractHardcodedColorsFromText(`const style = { color: '#111827' };`);
  assert.equal(getReplacementText(color, 'textBlack'), 'colors.textBlack');
});

test('existing colors.ts workflow: getColorsIdentifier returns colors', () => {
  // No new settings configured
  assert.equal(getColorsIdentifier(), 'colors');
});
