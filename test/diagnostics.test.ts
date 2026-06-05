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
    "Hardcoded color #FF6B00 can be extracted to colors.ts.",
    vscode.DiagnosticSeverity.Hint
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
    token
  )) as vscode.CodeAction[];

  // We expect two actions:
  // 1. Replace with colors.primary (QuickFix, preferred, edit configured)
  // 2. Extract this color (QuickFix, not preferred, command configured)
  assert.ok(actions);
  assert.equal(actions.length, 2);

  const replaceAction = actions.find(a => a.title === 'Replace with colors.primary');
  assert.ok(replaceAction);
  assert.equal(replaceAction.kind, vscode.CodeActionKind.QuickFix);
  assert.equal(replaceAction.isPreferred, true);
  assert.ok(replaceAction.edit);

  const replacements = (replaceAction.edit as any).replacements;
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].newText, 'colors.primary');

  const extractAction = actions.find(a => a.title === 'Extract this color');
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
    "Hardcoded color #000000 can be extracted to colors.ts.",
    vscode.DiagnosticSeverity.Hint
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
    token
  )) as vscode.CodeAction[];

  // We expect only the extract action:
  // 1. Extract this color (QuickFix, preferred, command configured)
  assert.ok(actions);
  assert.equal(actions.length, 1);

  const extractAction = actions[0];
  assert.equal(extractAction.title, 'Extract this color');
  assert.equal(extractAction.kind, vscode.CodeActionKind.QuickFix);
  assert.equal(extractAction.isPreferred, true);
  assert.ok(extractAction.command);
});
