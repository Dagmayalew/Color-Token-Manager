import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import * as vscode from 'vscode';
import { getReplacementText } from '../src/colorScan';
import { javascriptAdapter } from '../src/languages/javascriptAdapter';
import { typescriptAdapter } from '../src/languages/typescriptAdapter';
import type { ExtractedColor } from '../src/types';
import { resetColorTokenManagerConfig, setColorTokenManagerConfig } from './helpers/config';

beforeEach(() => resetColorTokenManagerConfig());
afterEach(() => resetColorTokenManagerConfig());

function makeDocument(text: string, fsPath = '/workspace/src/App.tsx'): vscode.TextDocument {
  return {
    uri: vscode.Uri.file(fsPath),
    languageId: fsPath.endsWith('.js') ? 'javascript' : 'typescriptreact',
    fileName: fsPath,
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

function literalColor(): ExtractedColor {
  return {
    value: '#ffffff',
    type: 'hex',
    start: 0,
    end: 9,
    suggestedName: 'primary.500',
    replacementKind: 'literal',
  };
}

test('TypeScript adapter preserves nested and numeric token references', () => {
  assert.equal(
    typescriptAdapter.buildTokenReference({
      tokenPath: 'theme.colors',
      tokenName: 'primary.500',
      tokenParts: ['primary', '500'],
    }),
    'theme.colors.primary[500]',
  );

  assert.equal(
    typescriptAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'primary.500',
      tokenParts: ['primary', '500'],
    }),
    'colors.primary[500]',
  );

  assert.equal(
    typescriptAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'primary',
      tokenParts: ['primary'],
    }),
    'colors.primary',
  );
});

test('JavaScript adapter preserves nested and numeric token references', () => {
  assert.equal(
    javascriptAdapter.buildTokenReference({
      tokenPath: 'theme.colors',
      tokenName: 'primary.500',
      tokenParts: ['primary', '500'],
    }),
    'theme.colors.primary[500]',
  );

  assert.equal(
    javascriptAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'primary.500',
      tokenParts: ['primary', '500'],
    }),
    'colors.primary[500]',
  );

  assert.equal(
    javascriptAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'primary',
      tokenParts: ['primary'],
    }),
    'colors.primary',
  );
});

test('getReplacementText delegates TypeScript references to adapter', () => {
  setColorTokenManagerConfig({ referencePrefix: 'theme.colors' });

  assert.equal(
    getReplacementText(literalColor(), 'primary.500', typescriptAdapter),
    'theme.colors.primary[500]',
  );
});

test('JS/TS adapters insert imports without duplicating existing imports', () => {
  const document = makeDocument("import { colors } from './theme/colors';\nconst x = '#fff';");

  assert.deepEqual(
    typescriptAdapter.buildImportEdit?.({
      document,
      tokenFilePath: './theme/colors',
      referencePrefix: 'colors',
    }),
    [],
  );

  assert.deepEqual(
    javascriptAdapter.buildImportEdit?.({
      document,
      tokenFilePath: './theme/colors',
      referencePrefix: 'colors',
    }),
    [],
  );
});

test('JS/TS adapters import only the first segment of a nested reference prefix', () => {
  setColorTokenManagerConfig({ tokenExportName: 'theme' });
  const document = makeDocument("const x = '#fff';");

  const [edit] =
    typescriptAdapter.buildImportEdit?.({
      document,
      tokenFilePath: './theme/theme',
      referencePrefix: 'theme.colors',
    }) ?? [];

  assert.ok(edit, 'expected an import edit');
  assert.equal(edit.newText, "import { theme } from './theme/theme';\n");
});
