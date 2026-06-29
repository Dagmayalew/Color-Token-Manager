import * as vscode from 'vscode';
import * as path from 'path';
import { getContrastRatio, getSwatchBorderColor, parseColor } from './colorUtils';
import {
  extractHardcodedColorsFromText,
  isSupportedExtractionDocument,
  type SelectionPreviewTarget,
} from './colorExtractor';
import { getKnownColorsFile, normalizeColorValue, readColors } from './colorFile';
import { getReplacementText } from './colorScan';
import { addColorsImportEdit, getColorsIdentifier } from './importUtils';
import { getContextText } from './colorPlan';
import { suggestTokenName } from './tokenNaming';
import { type AppColor } from './types';
import { getAdapterForDocument } from './languages/registry';

const DIAGNOSTIC_SOURCE = 'Color Token Manager';
const DIAGNOSTIC_CODE = 'hardcoded-color';
const CONTRAST_CODE = 'color-contrast';
const STYLE_EXTENSIONS = new Set(['.css', '.scss', '.less']);

export function registerColorDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('colorTokenManager');
  const swatchDecorations = new Map<string, vscode.TextEditorDecorationType>();

  const getSwatchDecoration = (value: string) => {
    const key = value.toLowerCase();
    const existing = swatchDecorations.get(key);
    if (existing) {
      return existing;
    }

    const decoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ' ',
        backgroundColor: value,
        border: `1px solid ${getSwatchBorderColor(value)}`,
        margin: '0 0 0 0.35em',
        width: '0.85em',
        height: '0.85em',
      },
    });

    swatchDecorations.set(key, decoration);
    context.subscriptions.push(decoration);
    return decoration;
  };

  const refresh = async (document: vscode.TextDocument) => {
    const diagnostics: vscode.Diagnostic[] = [];

    if (isSupportedExtractionDocument(document)) {
      diagnostics.push(...getHardcodedColorDiagnostics(document));
    }

    diagnostics.push(...(await getContrastDiagnostics(document)));

    collection.set(document.uri, diagnostics);
  };

  const refreshVisible = () => {
    for (const editor of vscode.window.visibleTextEditors) {
      void refresh(editor.document);
      refreshSwatches(editor, swatchDecorations, getSwatchDecoration);
    }
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument((document) => void refresh(document)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      void refresh(event.document);
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === event.document.uri.toString()) {
          refreshSwatches(editor, swatchDecorations, getSwatchDecoration);
        }
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.window.onDidChangeVisibleTextEditors(refreshVisible),
    vscode.languages.registerCodeActionsProvider(
      [
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'vue' },
        { scheme: 'file', language: 'css' },
        { scheme: 'file', language: 'scss' },
        { scheme: 'file', language: 'less' },
      ],
      colorCodeActionProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  refreshVisible();
}

function getHardcodedColorDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
  const adapter = getAdapterForDocument(document);
  return extractHardcodedColorsFromText(
    document.getText(),
    getExtractionOptions(document),
    adapter,
  ).map((color) => {
    const range = new vscode.Range(
      document.positionAt(color.start),
      document.positionAt(color.end),
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      `Hardcoded color ${color.value} can be extracted to a color token.`,
      vscode.DiagnosticSeverity.Hint,
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = DIAGNOSTIC_CODE;
    return diagnostic;
  });
}

async function getContrastDiagnostics(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  const enabled = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('enableContrastDiagnostics', true);
  if (!enabled) {
    return [];
  }

  const colorsFileUri = await getKnownColorsFile(document.uri);
  if (!colorsFileUri || document.uri.toString() !== colorsFileUri.toString()) {
    return [];
  }

  const colors = await readColors(colorsFileUri);
  const textTokens = colors.filter(isTextLikeToken);
  const backgrounds = pickContrastBackgrounds(colors);
  if (!textTokens.length || !backgrounds.length) {
    return [];
  }

  const minRatio = getContrastMinimumRatio();
  const usedRanges: Array<{ start: number; end: number }> = [];
  const diagnostics: vscode.Diagnostic[] = [];
  const identifier = getColorsIdentifier();

  for (const textToken of textTokens) {
    for (const background of backgrounds) {
      const ratio = getContrastRatio(textToken.value, background.value);
      if (ratio === undefined || ratio >= minRatio) {
        continue;
      }

      const range = findTokenRange(document, textToken, usedRanges);
      const diagnostic = new vscode.Diagnostic(
        range,
        `Contrast ${ratio.toFixed(2)}:1: ${identifier}.${textToken.key} on ${identifier}.${background.key} fails WCAG ${getContrastLevel()} (${minRatio}:1).`,
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostic.code = CONTRAST_CODE;
      diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}

function refreshSwatches(
  editor: vscode.TextEditor,
  swatchDecorations: Map<string, vscode.TextEditorDecorationType>,
  getSwatchDecoration: (value: string) => vscode.TextEditorDecorationType,
): void {
  const enabled = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('enableInlineSwatches', true);
  if (!enabled || !isSupportedExtractionDocument(editor.document)) {
    for (const decoration of swatchDecorations.values()) {
      editor.setDecorations(decoration, []);
    }
    return;
  }

  const grouped = new Map<string, vscode.DecorationOptions[]>();
  const adapter = getAdapterForDocument(editor.document);
  for (const color of extractHardcodedColorsFromText(
    editor.document.getText(),
    getExtractionOptions(editor.document),
    adapter,
  )) {
    if (!parseColor(color.value)) {
      continue;
    }

    const key = color.value.toLowerCase();
    const position = editor.document.positionAt(color.end);
    const range = new vscode.Range(position, position);
    const options = grouped.get(key) ?? [];
    options.push({
      range,
      hoverMessage: `Hardcoded color ${color.value}`,
    });
    grouped.set(key, options);
  }

  for (const [value, decoration] of grouped) {
    editor.setDecorations(getSwatchDecoration(value), decoration);
  }

  for (const [value, decoration] of swatchDecorations) {
    if (!grouped.has(value)) {
      editor.setDecorations(decoration, []);
    }
  }
}

function pickContrastBackgrounds(colors: AppColor[]): AppColor[] {
  const configured = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string[]>('contrastBackgroundTokens', []);
  const byKey = new Map(colors.map((color) => [color.key, color]));
  const configuredMatches = configured
    .map((key) => byKey.get(key))
    .filter((color): color is AppColor => Boolean(color));

  if (configuredMatches.length) {
    return configuredMatches;
  }

  const backgroundMatches = colors.filter((color) => {
    return /(^|\.)background(\.|$)|(^|\.)surface(\.|$)|(^|\.)canvas(\.|$)|(^|\.)screen(\.|$)|(^|\.)card(\.|$)|(^|\.)white$|^white$/i.test(
      color.key,
    );
  });

  return backgroundMatches.length
    ? backgroundMatches
    : [{ key: 'background.white', value: '#FFFFFF', type: 'hex' }];
}

function isTextLikeToken(color: AppColor): boolean {
  return (
    /(^|\.)text(\.|$)|(^|\.)foreground(\.|$)|(^|\.)content(\.|$)|(^|\.)label(\.|$)|(^|\.)title(\.|$)|(^|\.)body(\.|$)|(^|\.)muted$/i.test(
      color.key,
    ) && !/(^|\.)background(\.|$)|(^|\.)border(\.|$)|(^|\.)shadow(\.|$)/i.test(color.key)
  );
}

function getContrastLevel(): 'AA' | 'AAA' {
  return vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<'AA' | 'AAA'>('contrastLevel', 'AA');
}

function getContrastMinimumRatio(): number {
  return getContrastLevel() === 'AAA' ? 7 : 4.5;
}

function findTokenRange(
  document: vscode.TextDocument,
  color: AppColor,
  usedRanges: Array<{ start: number; end: number }>,
): vscode.Range {
  const text = document.getText();
  const escaped = escapeRegExp(color.value);
  const regex = new RegExp(`(['"\`])${escaped}\\1`, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const start = match.index + 1;
    const end = start + color.value.length;
    if (usedRanges.some((range) => start >= range.start && start < range.end)) {
      continue;
    }

    usedRanges.push({ start, end });
    return new vscode.Range(document.positionAt(start), document.positionAt(end));
  }

  return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
}

function createTarget(document: vscode.TextDocument, range: vscode.Range): SelectionPreviewTarget {
  return {
    uri: document.uri,
    start: document.offsetAt(range.start),
    end: document.offsetAt(range.end),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getExtractionOptions(document: vscode.TextDocument): { includeUnquotedColors?: boolean } {
  return {
    includeUnquotedColors: STYLE_EXTENSIONS.has(path.extname(document.uri.fsPath)),
  };
}

export const colorCodeActionProvider: vscode.CodeActionProvider = {
  async provideCodeActions(document, range, context) {
    const matchingDiagnostic = context.diagnostics.find((diagnostic) => {
      return diagnostic.source === DIAGNOSTIC_SOURCE && diagnostic.code === DIAGNOSTIC_CODE;
    });

    if (!matchingDiagnostic) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    // Find the corresponding ExtractedColor from the document
    const text = document.getText();
    const adapter = getAdapterForDocument(document);
    const extractedColors = extractHardcodedColorsFromText(
      text,
      getExtractionOptions(document),
      adapter,
    );
    const color = extractedColors.find((c) => {
      const startPos = document.positionAt(c.start);
      const endPos = document.positionAt(c.end);
      return (
        startPos.line === matchingDiagnostic.range.start.line &&
        startPos.character === matchingDiagnostic.range.start.character &&
        endPos.line === matchingDiagnostic.range.end.line &&
        endPos.character === matchingDiagnostic.range.end.character
      );
    });

    if (!color) {
      return [];
    }

    // Read colors.ts if configured/known
    const colorsFileUri = await getKnownColorsFile(document.uri);
    let matchingTokens: AppColor[] = [];

    if (colorsFileUri) {
      try {
        const existingColors = await readColors(colorsFileUri);
        const normalizedValue = normalizeColorValue(color.value);
        matchingTokens = existingColors.filter(
          (t) => normalizeColorValue(t.value) === normalizedValue,
        );
      } catch {
        // Ignore colors.ts parsing error
      }
    }

    // Offer quick fixes for each matching token
    if (matchingTokens.length > 0) {
      const identifier = getColorsIdentifier();
      for (const token of matchingTokens) {
        const actionText = `Replace with ${identifier}.${token.key}`;
        const replaceAction = new vscode.CodeAction(actionText, vscode.CodeActionKind.QuickFix);
        replaceAction.diagnostics = [matchingDiagnostic];
        replaceAction.isPreferred = true;
        replaceAction.edit = new vscode.WorkspaceEdit();
        replaceAction.edit.replace(
          document.uri,
          matchingDiagnostic.range,
          getReplacementText(color, token.key),
        );

        if (!STYLE_EXTENSIONS.has(path.extname(document.uri.fsPath)) && colorsFileUri) {
          addColorsImportEdit(replaceAction.edit, document, colorsFileUri);
        }

        actions.push(replaceAction);
      }
    }

    // When no exact token match, offer theme-aware suggestions from the naming system
    if (matchingTokens.length === 0) {
      const usageContext = getContextText(text, color.start);
      const suggestions = suggestTokenName(color.value, usageContext);
      for (const suggestion of suggestions.slice(0, 2)) {
        const identifier = getColorsIdentifier();
        const reference = `${identifier}.${suggestion.name}`;
        const suggestAction = new vscode.CodeAction(
          `Extract as ${reference} (${suggestion.confidence} confidence)`,
          vscode.CodeActionKind.QuickFix,
        );
        suggestAction.diagnostics = [matchingDiagnostic];
        suggestAction.command = {
          command: 'colorTokenManager.previewColorAtRange',
          title: `Extract as ${reference}`,
          arguments: [createTarget(document, matchingDiagnostic.range)],
        };
        actions.push(suggestAction);
      }
    }

    // Always offer "Extract this color" command to open the preview panel
    const extractAction = new vscode.CodeAction(
      'Extract this color',
      vscode.CodeActionKind.QuickFix,
    );
    extractAction.diagnostics = [matchingDiagnostic];
    extractAction.isPreferred = matchingTokens.length === 0;
    extractAction.command = {
      command: 'colorTokenManager.previewColorAtRange',
      title: 'Extract this color',
      arguments: [createTarget(document, matchingDiagnostic.range)],
    };
    actions.push(extractAction);

    return actions;
  },
};
