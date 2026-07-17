import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, test } from 'node:test';
import * as vscode from 'vscode';
import {
  getActiveProjectFiles,
  getNextProjectWriteTarget,
  getProjectWorkflow,
  getProjectProblemHint,
  getProjectSummary,
  resolveProjectFile,
} from '../src/projectRouting';

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

test('resolveProjectFile prefers configured colors and theme files', async () => {
  const root = makeWorkspace();
  fs.mkdirSync(path.join(root, 'src/theme'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/theme/colors.ts'),
    `export const colors = { primary: '#000000' };`,
  );
  fs.writeFileSync(path.join(root, 'src/theme/theme.ts'), `export const theme = { colors: {} };`);
  setConfig(root, {
    projectWorkflow: 'both',
    colorsFile: 'src/theme/colors.ts',
    themeFile: 'src/theme/theme.ts',
  });

  assert.equal(
    (await resolveProjectFile('colors'))?.fsPath,
    path.join(root, 'src/theme/colors.ts'),
  );
  assert.equal((await resolveProjectFile('theme'))?.fsPath, path.join(root, 'src/theme/theme.ts'));
});

test('themeOnly workflow resolves theme first and next write target follows theme', async () => {
  const root = makeWorkspace();
  setConfig(root, {
    projectWorkflow: 'themeOnly',
    themeFile: 'theme.ts',
  });
  fs.writeFileSync(path.join(root, 'theme.ts'), `export const theme = { colors: {} };`);

  assert.equal(getProjectWorkflow(), 'themeOnly');
  assert.equal((await resolveProjectFile('colors'))?.fsPath, path.join(root, 'theme.ts'));
  assert.equal((await getNextProjectWriteTarget()).kind, 'theme');
});

test('getActiveProjectFiles exposes both files in split projects', async () => {
  const root = makeWorkspace();
  fs.mkdirSync(path.join(root, 'src/theme'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/theme/colors.ts'),
    `export const colors = { primary: '#000000' };`,
  );
  fs.writeFileSync(
    path.join(root, 'src/theme/theme.ts'),
    `export const theme = { colors: { primary: '#FFFFFF' } };`,
  );
  setConfig(root, {
    projectWorkflow: 'both',
    colorsFile: 'src/theme/colors.ts',
    themeFile: 'src/theme/theme.ts',
  });

  const active = await getActiveProjectFiles();
  assert.equal(active.workflow, 'both');
  assert.equal(active.colorsFile?.fsPath, path.join(root, 'src/theme/colors.ts'));
  assert.equal(active.themeFile?.fsPath, path.join(root, 'src/theme/theme.ts'));
});

test('getActiveProjectFiles surfaces ThemeProvider files when present', async () => {
  const root = makeWorkspace();
  fs.mkdirSync(path.join(root, 'src/theme'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/theme/colors.ts'),
    `export const colors = { primary: '#000000' };`,
  );
  fs.writeFileSync(
    path.join(root, 'src/theme/theme.ts'),
    `export const theme = { colors: { primary: '#FFFFFF' } };`,
  );
  fs.writeFileSync(
    path.join(root, 'src', 'ThemeProvider.tsx'),
    `import { ThemeProvider } from 'styled-components';
     export function AppThemeProvider({ children }) {
       return <ThemeProvider theme={{ colors: {} }}>{children}</ThemeProvider>;
     }`,
  );
  setConfig(root, {
    projectWorkflow: 'both',
    colorsFile: 'src/theme/colors.ts',
    themeFile: 'src/theme/theme.ts',
  });

  const active = await getActiveProjectFiles();
  assert.equal(active.themeProviderFile?.fsPath, path.join(root, 'src', 'ThemeProvider.tsx'));
});

test('getProjectSummary and problem hint explain split projects', async () => {
  const root = makeWorkspace();
  fs.mkdirSync(path.join(root, 'src/theme'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/theme/colors.ts'),
    `export const colors = { primary: '#000000' };`,
  );
  fs.writeFileSync(
    path.join(root, 'src/theme/theme.ts'),
    `export const theme = { colors: { primary: '#FFFFFF' } };`,
  );
  setConfig(root, {
    projectWorkflow: 'both',
    colorsFile: 'src/theme/colors.ts',
    themeFile: 'src/theme/theme.ts',
  });

  const summary = await getProjectSummary();
  assert.equal(summary.confidence, 'high');
  assert.ok(summary.notes.some((note) => /split/i.test(note) || /separate/i.test(note)));
  assert.match(getProjectProblemHint(summary), /Split project detected/i);
});

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-routing-'));
  tempDirs.push(root);
  (vscode as unknown as { __setWorkspaceRoot(value: string): void }).__setWorkspaceRoot(root);
  return root;
}

function setConfig(root: string, values: Record<string, unknown>): void {
  (vscode as unknown as { __setTestConfig(values: Record<string, unknown>): void }).__setTestConfig(
    {
      colorsFilePath: 'colors.ts',
      ...values,
    },
  );
  void root;
}
