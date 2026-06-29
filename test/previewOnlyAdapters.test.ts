import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { buildPreviewForDocument, createPreviewPlanner } from '../src/colorPlan';
import { genericAdapter } from '../src/languages/genericAdapter';
import { getAdapterByLanguageId, getReplaceableAdapters } from '../src/languages/registry';
import { dartAdapter, swiftAdapter, kotlinAdapter } from '../src/languages/previewOnlyAdapters';
import { getPreviewWebviewHtml } from '../src/previewWebview';
import { __resetTestConfig } from './stubs/vscode';
import * as vscode from 'vscode';

beforeEach(() => {
  __resetTestConfig();
});

function makeDocument(text: string, languageId: string, fsPath: string): vscode.TextDocument {
  return {
    languageId,
    fileName: fsPath,
    uri: vscode.Uri.file(fsPath),
    getText() {
      return text;
    },
    positionAt(offset: number) {
      const before = text.slice(0, offset);
      const lines = before.split('\n');
      return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
    },
  } as unknown as vscode.TextDocument;
}

test('preview-only adapters stay scan-only', () => {
  assert.equal(dartAdapter.canScan, true);
  assert.equal(dartAdapter.canReplace, false);
  assert.equal(swiftAdapter.canReplace, false);
  assert.equal(kotlinAdapter.canReplace, false);
  assert.ok(!getReplaceableAdapters().includes(dartAdapter));
  assert.ok(!getReplaceableAdapters().includes(swiftAdapter));
  assert.ok(!getReplaceableAdapters().includes(kotlinAdapter));
});

test('preview-only previews are marked as preview only', () => {
  const document = makeDocument("const color = '#3B82F6';", 'dart', '/workspace/lib/main.dart');
  const preview = buildPreviewForDocument(
    document,
    [
      {
        value: '#3B82F6',
        type: 'hex',
        start: 14,
        end: 24,
        suggestedName: 'primary',
        replacementKind: 'literal',
      },
    ],
    createPreviewPlanner([]),
    getAdapterByLanguageId('dart').id,
    true,
    getAdapterByLanguageId('dart').displayName,
  );

  assert.equal(preview.isPreviewOnly, true);
  assert.equal(preview.adapterId, 'dart');
  assert.equal(preview.languageName, 'Dart');
  assert.equal(preview.replacementStatus, 'Preview only');
  assert.equal(preview.replacements[0].enabled, false);
  assert.equal(preview.replacements[0].tokenName.length > 0, true);
});

test('generic adapter remains scan-only fallback', () => {
  assert.equal(genericAdapter.canScan, true);
  assert.equal(genericAdapter.canReplace, false);
});

test('preview webview includes grouped language and replacement status UI', () => {
  const html = getPreviewWebviewHtml({
    id: 'preview-1',
    folderPath: 'workspace',
    folderUri: vscode.Uri.file('/workspace').toString(),
    colorsFilePath: 'src/colors.ts',
    filesScanned: 2,
    filesWithColors: 2,
    colorsFound: 2,
    tokensToAdd: 2,
    tokensToReuse: 0,
    supportedLanguages: ['TypeScript', 'CSS', 'Dart'],
    files: [
      {
        filePath: 'src/App.tsx',
        fileUri: vscode.Uri.file('/workspace/src/App.tsx').toString(),
        adapterId: 'typescript',
        languageName: 'TypeScript',
        isPreviewOnly: false,
        replacementStatus: 'Replacement enabled',
        replacements: [
          {
            value: '#111827',
            tokenName: 'neutral.900',
            action: 'add',
            enabled: true,
            line: 12,
            start: 24,
          },
        ],
      },
      {
        filePath: 'lib/main.dart',
        fileUri: vscode.Uri.file('/workspace/lib/main.dart').toString(),
        adapterId: 'dart',
        languageName: 'Dart',
        isPreviewOnly: true,
        replacementStatus: 'Preview only',
        replacements: [
          {
            value: '#3B82F6',
            tokenName: 'primary.500',
            action: 'add',
            enabled: false,
            line: 3,
            start: 15,
          },
        ],
      },
    ],
  });

  assert.match(html, /groupFilesByLanguage/);
  assert.match(html, /Replacement enabled/);
  assert.match(html, /Preview only/);
  assert.match(html, /Supported languages:/);
});
