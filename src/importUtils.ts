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
  const configuration = vscode.workspace.getConfiguration('colorTokenManager');

  // referencePrefix takes priority — use first segment as import identifier
  const referencePrefix = configuration.get<string>('referencePrefix', '').trim();
  if (referencePrefix) {
    return referencePrefix.split('.')[0];
  }

  // tokenObject is next priority
  const tokenObject = configuration.get<string>('tokenObject', '').trim();
  if (tokenObject) {
    return tokenObject;
  }

  // Existing logic: importIdentifier or tokenExportName
  const configured = configuration.get<string>('importIdentifier', 'colors').trim();
  const hasExplicitImportIdentifier = hasExplicitConfigValue<string>(
    configuration,
    'importIdentifier',
  );

  if (!hasExplicitImportIdentifier) {
    const tokenExportName = getConfiguredTokenExportName(configuration);
    if (tokenExportName !== 'auto') {
      return tokenExportName;
    }
  }

  return configured || 'colors';
}

export function getTokenReferencePrefix(): string {
  const configuration = vscode.workspace.getConfiguration('colorTokenManager');
  const referencePrefix = configuration.get<string>('referencePrefix', '').trim();
  if (referencePrefix) {
    return referencePrefix;
  }

  return getColorsIdentifier();
}

export function buildColorsImportEdit(
  document: vscode.TextDocument,
  importPath: string,
  identifier: string,
): vscode.TextEdit[] {
  const exportedName = getTokenExportNameForImport();
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

    if (hasColorsImport(clause, identifier, exportedName, importMode)) {
      return [];
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
    const importedName =
      identifier === exportedName ? exportedName : `${exportedName} as ${identifier}`;
    return [
      vscode.TextEdit.insert(document.positionAt(insertOffset), `${separator}${importedName}`),
    ];
  }

  const importText = getImportText(importPath, identifier, exportedName, importMode);
  return [
    vscode.TextEdit.insert(
      document.positionAt(lastImportEnd),
      lastImportEnd > 0 ? `\n${importText}` : importText,
    ),
  ];
}

export function addColorsImportEdit(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  colorsFileUri: vscode.Uri,
): void {
  const importPath = getColorsImportPath(document, colorsFileUri);
  const identifier = getColorsIdentifier();
  const textEdits = buildColorsImportEdit(document, importPath, identifier);
  for (const textEdit of textEdits) {
    edit.insert(document.uri, textEdit.range.start, textEdit.newText);
  }
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
  exportedName: string,
  importMode: 'named' | 'default' | 'namespace',
): string {
  if (importMode === 'default') {
    return `import ${identifier} from '${importPath}';\n`;
  }

  if (importMode === 'namespace') {
    return `import * as ${identifier} from '${importPath}';\n`;
  }

  return `import { ${identifier === exportedName ? exportedName : `${exportedName} as ${identifier}`} } from '${importPath}';\n`;
}

function hasColorsImport(
  importClause: string,
  identifier: string,
  exportedName: string,
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
        (imported === exportedName && identifier === exportedName)
      );
    });
}

function getTokenExportNameForImport(): string {
  const tokenExportName = getConfiguredTokenExportName(
    vscode.workspace.getConfiguration('colorTokenManager'),
  );
  return tokenExportName === 'auto' ? 'colors' : tokenExportName;
}

function getConfiguredTokenExportName(configuration: vscode.WorkspaceConfiguration): string {
  const tokenObject = configuration.get<string>('tokenObject', '').trim();
  if (tokenObject) {
    return tokenObject;
  }

  const value = configuration.get<string>('tokenExportName', 'auto').trim();
  return value || 'auto';
}

function hasExplicitConfigValue<T>(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
): boolean {
  const inspect = (
    configuration as vscode.WorkspaceConfiguration & {
      inspect?: <Value>(section: string) => {
        globalValue?: Value;
        workspaceValue?: Value;
        workspaceFolderValue?: Value;
      };
    }
  ).inspect?.<T>(key);
  return Boolean(inspect?.globalValue ?? inspect?.workspaceValue ?? inspect?.workspaceFolderValue);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Add or update an import statement that brings multiple named identifiers
 * into scope from the token file. Handles deduplication of already-imported
 * names and merges with existing imports from the same source path.
 *
 * Falls back to `addColorsImportEdit` when only one identifier is needed.
 */
export function addMultipleImportEdit(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  colorsFileUri: vscode.Uri,
  identifiers: string[],
): void {
  if (identifiers.length === 0) {
    return;
  }

  if (identifiers.length === 1) {
    addColorsImportEdit(edit, document, colorsFileUri);
    return;
  }

  const importPath = getColorsImportPath(document, colorsFileUri);
  const text = document.getText();
  const importRegex = /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm;
  let lastImportEnd = 0;
  let match: RegExpExecArray | null;

  const needed = new Set(identifiers);

  while ((match = importRegex.exec(text))) {
    lastImportEnd = match.index + match[0].length;
    const clause = match[1];
    const source = match[2];

    if (source !== importPath) {
      continue;
    }

    // Remove already-imported names from the needed set
    const namedMatch = clause.match(/\{([^}]*)\}/);
    if (namedMatch) {
      for (const part of namedMatch[1].split(',').map((p) => p.trim())) {
        if (part) {
          needed.delete(part);
        }
      }

      if (needed.size === 0) {
        return; // all identifiers already imported
      }

      // Append missing names inside the existing braces
      if (namedMatch.index !== undefined) {
        const insertAt = match.index + namedMatch.index + namedMatch[0].length - 1;
        const toAdd = [...needed].join(', ');
        edit.insert(document.uri, document.positionAt(insertAt), `, ${toAdd}`);
      }
    }

    return;
  }

  // No existing import from this path — insert a fresh one
  const importText = `import { ${identifiers.join(', ')} } from '${importPath}';
`;
  edit.insert(
    document.uri,
    document.positionAt(lastImportEnd),
    lastImportEnd > 0
      ? `
${importText}`
      : importText,
  );
}
