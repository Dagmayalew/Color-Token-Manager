import * as path from 'path';
import * as vscode from 'vscode';
import { getConfiguredColorsFile, readColors, renameColorToken } from './colorFile';
import { getDefaultDialogUri } from './workspaceUtils';
import { globToRegExp } from './globUtils';
import { getColorsIdentifier } from './importUtils';
import { type AppColor } from './types';

const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx}';
const DEFAULT_EXCLUDE =
  '{**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/ios/**,**/android/**}';

export async function renameTokenAcrossProject(): Promise<void> {
  const colorsFileUri = await getConfiguredColorsFile(vscode.window.activeTextEditor?.document.uri);
  if (!colorsFileUri) {
    return;
  }

  const colors = await readColors(colorsFileUri);
  if (!colors.length) {
    vscode.window.showInformationMessage('No color tokens were found in colors.ts.');
    return;
  }

  const oldItem = await vscode.window.showQuickPick(
    colors.map((color) => ({
      label: color.key,
      description: color.value,
    })),
    { placeHolder: 'Choose a token to rename' },
  );
  if (!oldItem) {
    return;
  }

  const newKey = await vscode.window.showInputBox({
    prompt: `Rename colors.${oldItem.label} to`,
    value: oldItem.label,
    validateInput: validateTokenPath,
  });
  if (!newKey || newKey === oldItem.label) {
    return;
  }

  const files = await findProjectSourceFiles(colorsFileUri);
  await renameColorToken(colorsFileUri, oldItem.label, newKey);

  const edit = new vscode.WorkspaceEdit();
  const changedDocuments: vscode.TextDocument[] = [];

  for (const fileUri of files) {
    const document = await vscode.workspace.openTextDocument(fileUri);
    const replacements = findTokenReferences(document.getText(), oldItem.label);

    if (!replacements.length) {
      continue;
    }

    changedDocuments.push(document);
    for (const match of replacements.reverse()) {
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(match.start), document.positionAt(match.end)),
        `${match.identifier}.${newKey}`,
      );
    }
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error('Failed to update token references across the project.');
  }

  await saveDocuments(changedDocuments);
  vscode.window.showInformationMessage(
    `Renamed colors.${oldItem.label} to colors.${newKey} in ${changedDocuments.length} files.`,
  );
}

export async function showUnusedTokens(): Promise<void> {
  const colorsFileUri = await getConfiguredColorsFile(vscode.window.activeTextEditor?.document.uri);
  if (!colorsFileUri) {
    return;
  }

  const colors = await readColors(colorsFileUri);
  const files = await findProjectSourceFiles(colorsFileUri);
  const used = new Set<string>();

  for (const fileUri of files) {
    const text = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
    for (const color of colors) {
      if (findTokenReferences(text, color.key).length) {
        used.add(color.key);
      }
    }
  }

  const unused = colors.filter((color) => !used.has(color.key));
  const content = buildUnusedTokenReport(colorsFileUri, unused, colors.length);
  const document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
  await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
}

export async function exportDesignTokens(): Promise<void> {
  const colorsFileUri = await getConfiguredColorsFile(vscode.window.activeTextEditor?.document.uri);
  if (!colorsFileUri) {
    return;
  }

  const colors = await readColors(colorsFileUri);
  if (!colors.length) {
    vscode.window.showInformationMessage('No color tokens were found in colors.ts.');
    return;
  }

  const format = await vscode.window.showQuickPick(
    [
      { label: 'JSON', extension: 'json' },
      { label: 'CSS Variables', extension: 'css' },
      { label: 'Tailwind Config', extension: 'js' },
      { label: 'Figma Tokens', extension: 'json' },
      { label: 'W3C Design Tokens', extension: 'json' },
    ],
    { placeHolder: 'Choose export format' },
  );
  if (!format) {
    return;
  }

  const defaultUri = vscode.Uri.joinPath(
    getDefaultDialogUri(colorsFileUri) ?? vscode.Uri.file(path.dirname(colorsFileUri.fsPath)),
    `color-tokens.${format.extension}`,
  );
  const targetUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      [format.label]: [format.extension],
    },
  });
  if (!targetUri) {
    return;
  }

  const content = serializeTokens(colors, format.label);
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
  vscode.window.showInformationMessage(
    `Exported ${colors.length} color tokens to ${vscode.workspace.asRelativePath(targetUri)}.`,
  );
}

function serializeTokens(colors: AppColor[], format: string): string {
  if (format === 'CSS Variables') {
    return `:root {\n${colors.map((color) => `  --${color.key.replace(/\./g, '-')}: ${color.value};`).join('\n')}\n}\n`;
  }

  if (format === 'Tailwind Config') {
    return `module.exports = {\n  theme: {\n    extend: {\n      colors: ${JSON.stringify(toNestedObject(colors), null, 8).replace(/^/gm, '      ').trimStart()}\n    }\n  }\n};\n`;
  }

  if (format === 'Figma Tokens') {
    return JSON.stringify(toReferenceTokens(colors, 'figma'), null, 2) + '\n';
  }

  if (format === 'W3C Design Tokens') {
    return JSON.stringify(toReferenceTokens(colors, 'w3c'), null, 2) + '\n';
  }

  return JSON.stringify(toNestedObject(colors), null, 2) + '\n';
}

function toNestedObject(colors: AppColor[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const color of colors) {
    setNestedValue(root, color.key, color.value);
  }
  return root;
}

function toReferenceTokens(colors: AppColor[], format: 'figma' | 'w3c'): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const color of colors) {
    const value = color.aliasOf ? `{${color.aliasOf}}` : color.value;
    setNestedValue(
      root,
      color.key,
      format === 'w3c' ? { $value: value, $type: 'color' } : { value, type: 'color' },
    );
  }
  return root;
}

function setNestedValue(root: Record<string, unknown>, tokenPath: string, value: unknown): void {
  const parts = tokenPath.split('.').filter(Boolean);
  let current = root;

  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }

    const next = current[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
}

async function findProjectSourceFiles(colorsFileUri: vscode.Uri): Promise<vscode.Uri[]> {
  const configuredExcludes = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string[]>('excludeGlobs', []);
  const files = await vscode.workspace.findFiles(SOURCE_GLOB, DEFAULT_EXCLUDE);

  return files.filter((fileUri) => {
    if (fileUri.toString() === colorsFileUri.toString()) {
      return false;
    }

    const relativePath = vscode.workspace.asRelativePath(fileUri).replace(/\\/g, '/');
    return !configuredExcludes.some((glob) => globToRegExp(glob).test(relativePath));
  });
}

function findTokenReferences(
  text: string,
  tokenKey: string,
): Array<{ start: number; end: number; identifier: string }> {
  const identifiers = Array.from(new Set(['colors', getColorsIdentifier()]));
  const references: Array<{ start: number; end: number; identifier: string }> = [];

  for (const identifier of identifiers) {
    const regex = new RegExp(`\\b${escapeRegExp(identifier)}\\.${escapeRegExp(tokenKey)}\\b`, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text))) {
      references.push({
        start: match.index,
        end: match.index + match[0].length,
        identifier,
      });
    }
  }

  return references;
}

function buildUnusedTokenReport(
  colorsFileUri: vscode.Uri,
  unused: AppColor[],
  total: number,
): string {
  const lines = [
    '# Unused Color Tokens',
    '',
    `Colors file: \`${vscode.workspace.asRelativePath(colorsFileUri)}\``,
    `Total tokens: ${total}`,
    `Unused tokens: ${unused.length}`,
    '',
  ];

  if (!unused.length) {
    lines.push('No unused tokens found.');
    return lines.join('\n');
  }

  for (const color of unused) {
    lines.push(`- \`colors.${color.key}\` = \`${color.value}\``);
  }

  return lines.join('\n');
}

async function saveDocuments(documents: vscode.TextDocument[]): Promise<void> {
  for (const document of documents) {
    await document.save();
  }
}

function validateTokenPath(value: string): string | undefined {
  return /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(value)
    ? undefined
    : 'Use a token path like primary or button.background.';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
