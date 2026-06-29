import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, test } from 'node:test';
import * as vscode from 'vscode';
import { buildThemeAuditMarkdown, buildThemeAuditReport } from '../src/themeAudit';

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

test('buildThemeAuditReport detects theme gaps, duplicates, unused tokens, and contrast risks', async () => {
  const root = setupThemeWorkspace();
  const report = await buildThemeAuditReport(vscode.Uri.file(path.join(root, 'colors.ts')));

  assert.equal(report.totalTokens, 6);
  assert.ok(
    report.missingThemeCounterparts.some(
      (missing) => missing.expectedTokenPath === 'dark.background.secondary',
    ),
  );
  assert.ok(
    report.duplicateValues.some((duplicate) =>
      duplicate.tokens.includes('light.background.primary'),
    ),
  );
  assert.ok(report.unused.some((color) => color.tokenPath === 'light.background.secondary'));
  assert.ok(
    report.contrastRisks.some(
      (risk) =>
        risk.theme === 'light' &&
        risk.tokenPath === 'light.text.primary' &&
        risk.againstTokenPath === 'light.background.primary',
    ),
  );
  assert.ok(report.suggestedNextActions.some((action) => /contrast/i.test(action)));
});

test('buildThemeAuditMarkdown can focus on contrast', async () => {
  const root = setupThemeWorkspace();
  const report = await buildThemeAuditReport(vscode.Uri.file(path.join(root, 'colors.ts')));
  const markdown = buildThemeAuditMarkdown(report, 'contrast');

  assert.match(markdown, /^# Theme Contrast Audit/);
  assert.match(markdown, /Contrast Risks/);
  assert.doesNotMatch(markdown, /Duplicate Values/);
});

function setupThemeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-theme-'));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'colors.ts'),
    `export const colors = {
  light: {
    background: {
      primary: '#FFFFFF',
      secondary: '#F7F7F7',
    },
    text: {
      primary: '#F7F7F7',
    },
  },
  dark: {
    background: {
      primary: '#111111',
    },
    text: {
      primary: '#FFFFFF',
    },
  },
  surface: {
    default: '#FFFFFF',
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
  (vscode as unknown as { __setTestConfig(values: Record<string, unknown>): void }).__setTestConfig(
    {
      colorsFilePath: 'colors.ts',
    },
  );

  return root;
}
