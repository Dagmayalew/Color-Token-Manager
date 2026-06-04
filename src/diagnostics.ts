import * as vscode from 'vscode';
import { extractHardcodedColorsFromText, isSupportedExtractionDocument, SelectionPreviewTarget } from './colorExtractor';

const DIAGNOSTIC_SOURCE = 'Color Token Manager';
const DIAGNOSTIC_CODE = 'hardcoded-color';

export function registerColorDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('colorTokenManager');

  const refresh = (document: vscode.TextDocument) => {
    if (!isSupportedExtractionDocument(document)) {
      collection.delete(document.uri);
      return;
    }

    const diagnostics = extractHardcodedColorsFromText(document.getText()).map((color) => {
      const range = new vscode.Range(document.positionAt(color.start), document.positionAt(color.end));
      const diagnostic = new vscode.Diagnostic(
        range,
        `Hardcoded color ${color.value} can be extracted to colors.ts.`,
        vscode.DiagnosticSeverity.Hint
      );
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostic.code = DIAGNOSTIC_CODE;
      return diagnostic;
    });

    collection.set(document.uri, diagnostics);
  };

  const refreshVisible = () => {
    for (const editor of vscode.window.visibleTextEditors) {
      refresh(editor.document);
    }
  };

  const provider: vscode.CodeActionProvider = {
    provideCodeActions(document, range, context) {
      const matchingDiagnostic = context.diagnostics.find((diagnostic) => {
        return diagnostic.source === DIAGNOSTIC_SOURCE && diagnostic.code === DIAGNOSTIC_CODE;
      });

      if (!matchingDiagnostic) {
        return [];
      }

      const action = new vscode.CodeAction('Extract this color', vscode.CodeActionKind.QuickFix);
      action.diagnostics = [matchingDiagnostic];
      action.isPreferred = true;
      action.command = {
        command: 'colorTokenManager.previewColorAtRange',
        title: 'Extract this color',
        arguments: [createTarget(document, matchingDiagnostic.range)]
      };

      return [action];
    }
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.window.onDidChangeVisibleTextEditors(refreshVisible),
    vscode.languages.registerCodeActionsProvider(
      [
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'javascriptreact' }
      ],
      provider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  refreshVisible();
}

function createTarget(document: vscode.TextDocument, range: vscode.Range): SelectionPreviewTarget {
  return {
    uri: document.uri,
    start: document.offsetAt(range.start),
    end: document.offsetAt(range.end)
  };
}
