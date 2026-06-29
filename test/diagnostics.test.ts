import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import * as path from 'path';
import * as vscode from 'vscode';
import { colorCodeActionProvider } from '../src/diagnostics';
import { setColorTokenManagerConfig, resetColorTokenManagerConfig } from './helpers/config';
import { fixturePath } from './helpers/paths';
import { __setWorkspaceRoot } from './stubs/vscode';

beforeEach(() => {
  resetColorTokenManagerConfig();
  __setWorkspaceRoot(fixturePath());
});

afterEach(() => {
  resetColorTokenManagerConfig();
});

test('colorCodeActionProvider returns replacement quick fix when matching token exists', async () => {
  // Configure colorsFilePath to point to colors/flat.ts fixture
  setColorTokenManagerConfig({
    colorsFilePath: 'colors/flat.ts',
  });

  const sourceText = `const style = { color: '#FF6B00' };`;
  const document = {
    uri: vscode.Uri.file(path.join(fixturePath(), 'src/app.tsx')),
    fileName: path.join(fixturePath(), 'src/app.tsx'),
    languageId: 'typescriptreact',
    getText() {
      return sourceText;
    },
    positionAt(offset: number) {
      if (offset === 23) return new vscode.Position(0, 23);
      if (offset === 32) return new vscode.Position(0, 32);
      return new vscode.Position(0, 0);
    },
    offsetAt(pos: vscode.Position) {
      if (pos.line === 0 && pos.character === 23) return 23;
      if (pos.line === 0 && pos.character === 32) return 32;
      return 0;
    },
  } as vscode.TextDocument;

  const range = new vscode.Range(new vscode.Position(0, 23), new vscode.Position(0, 32));
  const diagnostic = new vscode.Diagnostic(
    range,
    'Hardcoded color #FF6B00 can be extracted to colors.ts.',
    vscode.DiagnosticSeverity.Hint,
  );
  diagnostic.source = 'Color Token Manager';
  diagnostic.code = 'hardcoded-color';

  const context = {
    diagnostics: [diagnostic],
  } as unknown as vscode.CodeActionContext;

  const token = {} as vscode.CancellationToken;

  const actions = (await colorCodeActionProvider.provideCodeActions(
    document,
    range,
    context,
    token,
  )) as vscode.CodeAction[];

  // We expect two actions:
  // 1. Replace with colors.primary (QuickFix, preferred, edit configured)
  // 2. Extract this color (QuickFix, not preferred, command configured)
  assert.ok(actions);
  assert.equal(actions.length, 2);

  const replaceAction = actions.find((a) => a.title === 'Replace with colors.primary');
  assert.ok(replaceAction);
  assert.equal(replaceAction.kind, vscode.CodeActionKind.QuickFix);
  assert.equal(replaceAction.isPreferred, true);
  assert.ok(replaceAction.edit);

  const replacements = (replaceAction.edit as any).replacements;
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].newText, 'colors.primary');

  const extractAction = actions.find((a) => a.title === 'Extract this color');
  assert.ok(extractAction);
  assert.equal(extractAction.kind, vscode.CodeActionKind.QuickFix);
  assert.equal(extractAction.isPreferred, false);
  assert.ok(extractAction.command);
  assert.equal(extractAction.command!.command, 'colorTokenManager.previewColorAtRange');
});

test('colorCodeActionProvider returns only extraction action when matching token does not exist', async () => {
  setColorTokenManagerConfig({
    colorsFilePath: 'colors/flat.ts',
  });

  const sourceText = `const style = { color: '#000000' };`;
  const document = {
    uri: vscode.Uri.file(path.join(fixturePath(), 'src/app.tsx')),
    fileName: path.join(fixturePath(), 'src/app.tsx'),
    languageId: 'typescriptreact',
    getText() {
      return sourceText;
    },
    positionAt(offset: number) {
      if (offset === 23) return new vscode.Position(0, 23);
      if (offset === 32) return new vscode.Position(0, 32);
      return new vscode.Position(0, 0);
    },
    offsetAt(pos: vscode.Position) {
      if (pos.line === 0 && pos.character === 23) return 23;
      if (pos.line === 0 && pos.character === 32) return 32;
      return 0;
    },
  } as vscode.TextDocument;

  const range = new vscode.Range(new vscode.Position(0, 23), new vscode.Position(0, 32));
  const diagnostic = new vscode.Diagnostic(
    range,
    'Hardcoded color #000000 can be extracted to colors.ts.',
    vscode.DiagnosticSeverity.Hint,
  );
  diagnostic.source = 'Color Token Manager';
  diagnostic.code = 'hardcoded-color';

  const context = {
    diagnostics: [diagnostic],
  } as unknown as vscode.CodeActionContext;

  const token = {} as vscode.CancellationToken;

  const actions = (await colorCodeActionProvider.provideCodeActions(
    document,
    range,
    context,
    token,
  )) as vscode.CodeAction[];

  // Phase 8: when no matching token exists, theme-aware suggestions are added
  // plus the always-present "Extract this color" fallback action.
  assert.ok(actions);
  assert.ok(actions.length >= 1, `expected at least 1 action, got ${actions.length}`);

  // The "Extract this color" action must always be present
  const extractAction = actions.find((a) => a.title === 'Extract this color');
  assert.ok(extractAction, '"Extract this color" action should always be present');
  assert.equal(extractAction.kind, vscode.CodeActionKind.QuickFix);
  assert.ok(extractAction.command);
});

test('colorCodeActionProvider opens preview only for preview-only languages', async () => {
  setColorTokenManagerConfig({
    colorsFilePath: 'colors/flat.ts',
  });

  const sourceText = `const color = '#FF6B00';`;
  const document = {
    uri: vscode.Uri.file(path.join(fixturePath(), 'lib/main.dart')),
    fileName: path.join(fixturePath(), 'lib/main.dart'),
    languageId: 'dart',
    getText() {
      return sourceText;
    },
    positionAt(offset: number) {
      if (offset === 14) return new vscode.Position(0, 14);
      if (offset === 23) return new vscode.Position(0, 23);
      return new vscode.Position(0, 0);
    },
    offsetAt(pos: vscode.Position) {
      if (pos.line === 0 && pos.character === 14) return 14;
      if (pos.line === 0 && pos.character === 23) return 23;
      return 0;
    },
  } as vscode.TextDocument;

  const range = new vscode.Range(new vscode.Position(0, 14), new vscode.Position(0, 23));
  const diagnostic = new vscode.Diagnostic(
    range,
    'Hardcoded color #FF6B00 can be extracted to a color token.',
    vscode.DiagnosticSeverity.Hint,
  );
  diagnostic.source = 'Color Token Manager';
  diagnostic.code = 'hardcoded-color';

  const actions = (await colorCodeActionProvider.provideCodeActions(
    document,
    range,
    { diagnostics: [diagnostic] } as unknown as vscode.CodeActionContext,
    {} as vscode.CancellationToken,
  )) as vscode.CodeAction[];

  assert.equal(actions.length, 1);
  assert.equal(actions[0].title, 'Open extraction preview');
  assert.equal(actions[0].kind, vscode.CodeActionKind.QuickFix);
  assert.equal(actions[0].isPreferred, true);
  assert.ok(actions[0].command);
  assert.equal(actions[0].command!.command, 'colorTokenManager.previewColorAtRange');
  assert.equal(actions[0].edit, undefined);
});

test('colorCodeActionProvider uses CSS variable replacements for CSS quick fixes', async () => {
  setColorTokenManagerConfig({
    colorsFilePath: 'colors/flat.ts',
  });

  const sourceText = `.button { color: #FF6B00; }`;
  const document = {
    uri: vscode.Uri.file(path.join(fixturePath(), 'src/styles.css')),
    fileName: path.join(fixturePath(), 'src/styles.css'),
    languageId: 'css',
    getText() {
      return sourceText;
    },
    positionAt(offset: number) {
      if (offset === 17) return new vscode.Position(0, 17);
      if (offset === 24) return new vscode.Position(0, 24);
      return new vscode.Position(0, 0);
    },
    offsetAt(pos: vscode.Position) {
      if (pos.line === 0 && pos.character === 17) return 17;
      if (pos.line === 0 && pos.character === 24) return 24;
      return 0;
    },
  } as vscode.TextDocument;

  const range = new vscode.Range(new vscode.Position(0, 17), new vscode.Position(0, 24));
  const diagnostic = new vscode.Diagnostic(
    range,
    'Hardcoded color #FF6B00 can be extracted to a color token.',
    vscode.DiagnosticSeverity.Hint,
  );
  diagnostic.source = 'Color Token Manager';
  diagnostic.code = 'hardcoded-color';

  const actions = (await colorCodeActionProvider.provideCodeActions(
    document,
    range,
    { diagnostics: [diagnostic] } as unknown as vscode.CodeActionContext,
    {} as vscode.CancellationToken,
  )) as vscode.CodeAction[];

  const replaceAction = actions.find((a) => a.title === 'Replace with colors.primary');
  assert.ok(replaceAction);
  assert.ok(replaceAction.edit);
  const replacements = (replaceAction.edit as any).replacements;
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].newText, 'var(--color-primary)');
});
