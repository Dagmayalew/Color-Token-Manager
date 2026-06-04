import * as path from 'path';
import * as vscode from 'vscode';

const IMPORT_STYLE_DEPRECATION_KEY = 'colorTokenManager.importStyleDeprecationWarned';

export function warnDeprecatedImportStyleIfNeeded(context: vscode.ExtensionContext): void {
  if (context.globalState.get<boolean>(IMPORT_STYLE_DEPRECATION_KEY)) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration('colorTokenManager');
  const importStyleInspect = configuration.inspect<'named' | 'default'>('importStyle');
  const hasExplicitImportStyle = [
    importStyleInspect?.globalValue,
    importStyleInspect?.workspaceValue,
    importStyleInspect?.workspaceFolderValue,
  ].some((value) => value !== undefined);

  if (!hasExplicitImportStyle) {
    return;
  }

  const importModeInspect = configuration.inspect<'named' | 'default' | 'namespace'>('importMode');
  const hasExplicitImportMode = [
    importModeInspect?.globalValue,
    importModeInspect?.workspaceValue,
    importModeInspect?.workspaceFolderValue,
  ].some((value) => value !== undefined);

  const message = hasExplicitImportMode
    ? 'Color Token Manager: colorTokenManager.importStyle is deprecated and ignored while colorTokenManager.importMode is set. Remove importStyle before v1.0.0.'
    : 'Color Token Manager: colorTokenManager.importStyle is deprecated. Use colorTokenManager.importMode instead (supports named, default, and namespace). importStyle will be removed in v1.0.0.';

  void vscode.window.showWarningMessage(message).then(() => undefined);
  void context.globalState.update(IMPORT_STYLE_DEPRECATION_KEY, true);
}

export function getColorsImportPath(
  document: vscode.TextDocument,
  colorsFileUri: vscode.Uri,
): string {
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
  colorsFileUri: vscode.Uri,
): void {
  const importPath = getColorsImportPath(document, colorsFileUri);
  const identifier = getColorsIdentifier();
  const importMode = getImportMode();
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

    if (hasColorsImport(clause, identifier, importMode)) {
      return;
    }

    if (importMode === 'default' || importMode === 'namespace') {
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

  const importText = getImportText(importPath, identifier, importMode);
  edit.insert(
    document.uri,
    document.positionAt(lastImportEnd),
    lastImportEnd > 0 ? `\n${importText}` : importText,
  );
}

function getImportMode(): 'named' | 'default' | 'namespace' {
  const configuration = vscode.workspace.getConfiguration('colorTokenManager');
  const importMode = configuration.get<'named' | 'default' | 'namespace' | undefined>('importMode');

  if (importMode) {
    return importMode;
  }

  return configuration.get<'named' | 'default'>('importStyle', 'named');
}

function getImportText(
  importPath: string,
  identifier: string,
  importMode: 'named' | 'default' | 'namespace',
): string {
  if (importMode === 'default') {
    return `import ${identifier} from '${importPath}';\n`;
  }

  if (importMode === 'namespace') {
    return `import * as ${identifier} from '${importPath}';\n`;
  }

  return `import { ${identifier === 'colors' ? 'colors' : `colors as ${identifier}`} } from '${importPath}';\n`;
}

function hasColorsImport(
  importClause: string,
  identifier: string,
  importMode: 'named' | 'default' | 'namespace',
): boolean {
  if (importMode === 'namespace') {
    return new RegExp(`^\\*\\s+as\\s+${escapeRegExp(identifier)}$`).test(importClause.trim());
  }

  if (importMode === 'default') {
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
      return (
        imported === identifier ||
        alias === identifier ||
        (imported === 'colors' && identifier === 'colors')
      );
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
