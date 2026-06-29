import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { addMultipleImportEdit } from '../src/importUtils';
import * as vscode from 'vscode';
import { resetColorTokenManagerConfig } from './helpers/config';

beforeEach(() => resetColorTokenManagerConfig());
afterEach(() => resetColorTokenManagerConfig());

type StubEdit = {
  insertions: Array<{ uri: unknown; position: unknown; newText: string }>;
  replacements: Array<{ uri: unknown; range: unknown; newText: string }>;
};

function asStub(edit: vscode.WorkspaceEdit): StubEdit {
  return edit as unknown as StubEdit;
}

function makeDocument(text: string, fsPath = '/workspace/src/App.tsx'): vscode.TextDocument {
  return {
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

test('addMultipleImportEdit inserts named import for two identifiers when none exist', () => {
  const text = `import React from 'react';\nconst x = '#FF0000';`;
  const document = makeDocument(text);
  const colorsFileUri = vscode.Uri.file('/workspace/src/theme/theme.ts');
  const edit = new vscode.WorkspaceEdit();

  addMultipleImportEdit(edit, document, colorsFileUri, ['lightTheme', 'darkTheme']);

  const stub = asStub(edit);
  assert.ok(stub.insertions.length > 0, 'should produce at least one insertion');
  const importText = stub.insertions.map((i) => i.newText).join('');
  assert.ok(importText.includes('lightTheme'), 'import should include lightTheme');
  assert.ok(importText.includes('darkTheme'), 'import should include darkTheme');
  assert.ok(importText.includes("from './theme/theme'"), 'import path should be relative');
});

test('addMultipleImportEdit delegates to single import when only one identifier', () => {
  const text = `const x = '#FF0000';`;
  const document = makeDocument(text);
  const colorsFileUri = vscode.Uri.file('/workspace/src/theme/colors.ts');
  const edit = new vscode.WorkspaceEdit();

  addMultipleImportEdit(edit, document, colorsFileUri, ['colors']);

  const stub = asStub(edit);
  assert.ok(stub.insertions.length > 0, 'should insert import');
  const importText = stub.insertions.map((i) => i.newText).join('');
  assert.ok(importText.includes('colors'), 'should import colors');
});

test('addMultipleImportEdit skips identifiers already imported', () => {
  const text = `import { lightTheme } from './theme/theme';\nconst x = 1;`;
  const document = makeDocument(text);
  const colorsFileUri = vscode.Uri.file('/workspace/src/theme/theme.ts');
  const edit = new vscode.WorkspaceEdit();

  addMultipleImportEdit(edit, document, colorsFileUri, ['lightTheme', 'darkTheme']);

  const stub = asStub(edit);
  const insertionText = stub.insertions.map((i) => i.newText).join('');
  if (stub.insertions.length > 0) {
    assert.ok(insertionText.includes('darkTheme'), 'should add missing darkTheme');
    assert.ok(!insertionText.includes('lightTheme'), 'should not re-add lightTheme');
  }
});

test('addMultipleImportEdit does nothing when identifiers array is empty', () => {
  const text = `const x = 1;`;
  const document = makeDocument(text);
  const colorsFileUri = vscode.Uri.file('/workspace/src/theme/colors.ts');
  const edit = new vscode.WorkspaceEdit();

  addMultipleImportEdit(edit, document, colorsFileUri, []);

  const stub = asStub(edit);
  assert.equal(stub.insertions.length, 0, 'no insertions for empty identifiers');
  assert.equal(stub.replacements.length, 0, 'no replacements for empty identifiers');
});
