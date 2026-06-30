import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, test } from 'node:test';
import * as vscode from 'vscode';
import { buildDesignSystemHealthDashboard, buildDesignSystemHealthDashboardHtml, exportDesignSystemHealthHtml } from '../src/dashboard';

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

test('buildDesignSystemHealthDashboard computes a bounded score and issues', async () => {
  const root = setupWorkspace();
  const dashboard = await buildDesignSystemHealthDashboard();

  assert.ok(dashboard.score >= 0 && dashboard.score <= 100);
  assert.ok(dashboard.criticalIssues.length >= 1);
  assert.ok(dashboard.tokens.length >= 1);
  assert.match(dashboard.workflow, /both|colorsOnly|themeOnly/);
});

test('dashboard html renderers include expected headings', async () => {
  const root = setupWorkspace();
  const dashboard = await buildDesignSystemHealthDashboard();
  const html = buildDesignSystemHealthDashboardHtml(dashboard);
  const exported = exportDesignSystemHealthHtml(dashboard);

  assert.match(html, /Design System Health Dashboard/);
  assert.match(exported, /Design System Health Dashboard/);
  void root;
});

function setupWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-dashboard-'));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'colors.ts'),
    `export const colors = {
  light: {
    background: { primary: '#FFFFFF' },
    text: { primary: '#111111' },
  },
  dark: {
    background: { primary: '#111111' },
    text: { primary: '#FFFFFF' },
  },
} as const;
`,
  );
  fs.writeFileSync(
    path.join(root, 'theme.ts'),
    `export const theme = {
  colors: {
    light: { background: { primary: '#FFFFFF' }, text: { primary: '#111111' } },
    dark: { background: { primary: '#111111' }, text: { primary: '#FFFFFF' } },
  },
} as const;
`,
  );
  fs.writeFileSync(
    path.join(root, 'src', 'Button.tsx'),
    `import { colors } from '../colors';
export const Button = { color: colors.light.text.primary };
`,
  );

  (vscode as unknown as { __setWorkspaceRoot(value: string): void }).__setWorkspaceRoot(root);
  (vscode as unknown as { __setTestConfig(values: Record<string, unknown>): void }).__setTestConfig({
    projectWorkflow: 'both',
    colorsFile: 'colors.ts',
    themeFile: 'theme.ts',
  });
  return root;
}
