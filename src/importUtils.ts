import * as path from 'path';
import * as vscode from 'vscode';

export function getColorsImportPath(document: vscode.TextDocument, colorsFileUri: vscode.Uri): string {
  const configuredImportPath = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string>('importPath', '')
    .trim();

  if (configuredImportPath) {
    return configuredImportPath;
  }

  const fromDir = path.dirname(document.uri.fsPath);
  const toFile = colorsFileUri.fsPath.replace(/\.(ts|tsx|js|jsx)$/, '');
  let relativePath = path.relative(fromDir, toFile).replace(/\\/g, '/');

  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }

  return relativePath;
}

export function getColorsIdentifier(): string {
  const configured = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string>('importIdentifier', 'colors')
    .trim();

  return configured || 'colors';
}

export function addColorsImportEdit(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  colorsFileUri: vscode.Uri
): void {
  const importPath = getColorsImportPath(document, colorsFileUri);
  const identifier = getColorsIdentifier();
  const importStyle = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<'named' | 'default'>('importStyle', 'named');
  const text = document.getText();
  const importRegex = /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm;
  let lastImportEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(text))) {
    lastImportEnd = match.index + match[0].length;
    const clause = match[1];
    const source = match[2];

    if (source !== importPath) {
      continue;
    }

    if (hasColorsImport(clause, identifier, importStyle)) {
      return;
    }

    if (importStyle === 'default') {
      continue;
    }

    const namedImportMatch = clause.match(/\{([^}]*)\}/);
    if (!namedImportMatch || namedImportMatch.index === undefined) {
      continue;
    }

    const insertOffset = match.index + namedImportMatch.index + namedImportMatch[0].length - 1;
    const existingNames = namedImportMatch[1].trim();
    const separator = existingNames ? ', ' : '';
    const importedName = identifier === 'colors' ? 'colors' : `colors as ${identifier}`;
    edit.insert(document.uri, document.positionAt(insertOffset), `${separator}${importedName}`);
    return;
  }

  const importText = importStyle === 'default'
    ? `import ${identifier} from '${importPath}';\n`
    : `import { ${identifier === 'colors' ? 'colors' : `colors as ${identifier}`} } from '${importPath}';\n`;
  edit.insert(document.uri, document.positionAt(lastImportEnd), lastImportEnd > 0 ? `\n${importText}` : importText);
}

function hasColorsImport(importClause: string, identifier: string, importStyle: 'named' | 'default'): boolean {
  if (importStyle === 'default') {
    return importClause
      .replace(/\{[\s\S]*?\}/g, '')
      .split(',')
      .map((part) => part.trim())
      .some((part) => part === identifier || part.startsWith(`${identifier} `));
  }

  const namedImportMatch = importClause.match(/\{([^}]*)\}/);
  if (!namedImportMatch) {
    return false;
  }

  return namedImportMatch[1]
    .split(',')
    .map((name) => name.trim())
    .some((name) => {
      const [imported, alias] = name.split(/\s+as\s+/i).map((part) => part.trim());
      return imported === identifier || alias === identifier || (imported === 'colors' && identifier === 'colors');
    });
}
