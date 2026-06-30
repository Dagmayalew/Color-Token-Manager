import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  detectExportNames,
  detectTokenFileKind,
  findTokenFiles,
  findThemeProviderFiles,
  rankTokenFileCandidate,
} from '../src/tokenDetection';
import type { WorkspaceFolder } from 'vscode';
import * as vscode from 'vscode';

const tempDirs: string[] = [];

beforeEach(() => {
  tempDirs.length = 0;
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  (vscode as unknown as { __resetTestConfig(): void }).__resetTestConfig();
});

// ── detectExportNames ─────────────────────────────────────────────────────────

test('detectExportNames finds named exports', () => {
  const text = `
    export const colors = { primary: '#FF0000' };
    export const theme = {};
  `;
  assert.deepEqual(detectExportNames(text), ['colors', 'theme']);
});

test('detectExportNames finds lightTheme and darkTheme', () => {
  const text = `
    export const lightTheme = { background: '#FFFFFF' };
    export const darkTheme = { background: '#111827' };
  `;
  assert.deepEqual(detectExportNames(text), ['lightTheme', 'darkTheme']);
});

test('detectExportNames deduplicates', () => {
  const text = `export const colors = {};\nexport const colors = {};`;
  assert.deepEqual(detectExportNames(text), ['colors']);
});

test('detectExportNames ignores non-exported vars', () => {
  const text = `const local = {}; export const colors = {};`;
  assert.deepEqual(detectExportNames(text), ['colors']);
});

// ── detectTokenFileKind ───────────────────────────────────────────────────────

test('detectTokenFileKind returns colors for colors export', () => {
  assert.equal(detectTokenFileKind(`export const colors = {};`), 'colors');
});

test('detectTokenFileKind returns theme for theme export', () => {
  assert.equal(detectTokenFileKind(`export const theme = {};`), 'theme');
});

test('detectTokenFileKind returns theme for lightTheme + darkTheme', () => {
  const text = `
    export const lightTheme = { background: '#FFF' };
    export const darkTheme = { background: '#000' };
  `;
  assert.equal(detectTokenFileKind(text), 'theme');
});

test('detectTokenFileKind returns tokens for tokens export', () => {
  assert.equal(detectTokenFileKind(`export const tokens = {};`), 'tokens');
});

test('detectTokenFileKind returns tokens for designTokens export', () => {
  assert.equal(detectTokenFileKind(`export const designTokens = {};`), 'tokens');
});

test('detectTokenFileKind returns custom for unknown exports', () => {
  assert.equal(detectTokenFileKind(`export const myConfig = {};`), 'custom');
});

// ── rankTokenFileCandidate ────────────────────────────────────────────────────

test('rankTokenFileCandidate returns candidate confidence', () => {
  const candidate = {
    filePath: 'src/theme/colors.ts',
    kind: 'colors' as const,
    confidence: 85,
    exportNames: ['colors'],
    reason: 'test',
  };
  assert.equal(rankTokenFileCandidate(candidate), 85);
});

// ── findTokenFiles ────────────────────────────────────────────────────────────

test('findTokenFiles discovers colors.ts and returns it ranked', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-detect-'));
  tempDirs.push(dir);

  const themeDir = path.join(dir, 'src', 'theme');
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(
    path.join(themeDir, 'colors.ts'),
    `export const colors = { primary: '#3B82F6' };`,
  );

  (vscode as unknown as { __setWorkspaceRoot(v: string): void }).__setWorkspaceRoot(dir);
  const folder = vscode.workspace.workspaceFolders![0];
  const candidates = await findTokenFiles(folder as unknown as WorkspaceFolder);

  assert.ok(candidates.length >= 1, 'should find at least one candidate');
  assert.ok(
    candidates[0].filePath.endsWith('colors.ts'),
    `expected colors.ts but got ${candidates[0].filePath}`,
  );
  assert.equal(candidates[0].kind, 'colors');
  assert.ok(candidates[0].confidence >= 80);
});

test('findTokenFiles detects theme kind from lightTheme + darkTheme', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-detect-'));
  tempDirs.push(dir);

  const themeDir = path.join(dir, 'src', 'theme');
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(
    path.join(themeDir, 'theme.ts'),
    `
    export const lightTheme = { background: '#FFFFFF', text: '#111827' };
    export const darkTheme  = { background: '#111827', text: '#F9FAFB' };
    `,
  );

  (vscode as unknown as { __setWorkspaceRoot(v: string): void }).__setWorkspaceRoot(dir);
  const folder = vscode.workspace.workspaceFolders![0];
  const candidates = await findTokenFiles(folder as unknown as WorkspaceFolder);

  assert.ok(candidates.length >= 1);
  const found = candidates.find((c) => c.filePath.includes('theme.ts'));
  assert.ok(found, 'theme.ts should be a candidate');
  assert.equal(found.kind, 'theme');
});

test('findTokenFiles skips files without token exports', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-detect-'));
  tempDirs.push(dir);

  fs.writeFileSync(path.join(dir, 'colors.ts'), `export const myConfig = { borderRadius: 4 };`);

  (vscode as unknown as { __setWorkspaceRoot(v: string): void }).__setWorkspaceRoot(dir);
  const folder = vscode.workspace.workspaceFolders![0];
  const candidates = await findTokenFiles(folder as unknown as WorkspaceFolder);

  assert.equal(
    candidates.filter((c) => c.filePath.endsWith('colors.ts')).length,
    0,
    'colors.ts with no token exports should be skipped',
  );
});

test('findTokenFiles returns candidates sorted by confidence descending', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-detect-'));
  tempDirs.push(dir);

  // High-confidence path
  const themeDir = path.join(dir, 'src', 'theme');
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(
    path.join(themeDir, 'colors.ts'),
    `export const colors = { primary: '#FF0000' };`,
  );
  // Lower-confidence path
  fs.writeFileSync(path.join(dir, 'colors.ts'), `export const colors = { primary: '#00FF00' };`);

  (vscode as unknown as { __setWorkspaceRoot(v: string): void }).__setWorkspaceRoot(dir);
  const folder = vscode.workspace.workspaceFolders![0];
  const candidates = await findTokenFiles(folder as unknown as WorkspaceFolder);

  assert.ok(candidates.length >= 2);
  for (let i = 1; i < candidates.length; i++) {
    assert.ok(
      candidates[i - 1].confidence >= candidates[i].confidence,
      'candidates should be sorted by confidence descending',
    );
  }
});

test('findTokenFiles detects themeColors.tsx as a token file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-detect-'));
  tempDirs.push(dir);

  fs.writeFileSync(
    path.join(dir, 'themeColors.tsx'),
    `export const themeColors = { primary: '#123456' };`,
  );

  (vscode as unknown as { __setWorkspaceRoot(v: string): void }).__setWorkspaceRoot(dir);
  const folder = vscode.workspace.workspaceFolders![0];
  const candidates = await findTokenFiles(folder as unknown as WorkspaceFolder);

  assert.ok(candidates.some((c) => c.filePath.endsWith('themeColors.tsx')));
});

test('findThemeProviderFiles detects provider entry points', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-provider-'));
  tempDirs.push(dir);

  fs.writeFileSync(
    path.join(dir, 'ThemeProvider.tsx'),
    `
      import { ThemeProvider } from 'styled-components';
      export function AppThemeProvider({ children }) {
        return <ThemeProvider theme={{ colors: {} }}>{children}</ThemeProvider>;
      }
    `,
  );

  (vscode as unknown as { __setWorkspaceRoot(v: string): void }).__setWorkspaceRoot(dir);
  const folder = vscode.workspace.workspaceFolders![0];
  const candidates = await findThemeProviderFiles(folder as unknown as WorkspaceFolder);

  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].filePath.endsWith('ThemeProvider.tsx'));
});
