import * as path from 'path';
import * as vscode from 'vscode';
import {
  addColorAlias,
  addColorToken,
  findExistingTokenByValue,
  getColorType,
  getConfiguredColorsFile,
  normalizeColorValue,
  readColors,
  validateColorValue
} from './colorFile';
import { addColorsImportEdit, getColorsIdentifier } from './importUtils';
import {
  AppColor,
  AppliedColorReplacement,
  ExtractedColor,
  FileApplyResult,
  FileExtractionPreview,
  FolderApplyResult,
  FolderExtractionPreview
} from './types';

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const BLOCKED_PATH_PARTS = ['/node_modules/', '/build/', '/dist/'];
type ExtractionResult = { extracted: number; added: number; reused: number; skipped: number };
type PreviewFileApplyResult = ExtractionResult & { appliedReplacements: AppliedColorReplacement[] };

export function extractHardcodedColorsFromText(text: string): ExtractedColor[] {
  const ignoredRanges = [
    ...findCommentRanges(text),
    ...findImportRanges(text)
  ];
  const extractEmbeddedColors = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('extractEmbeddedColors', false);
  const colorLiteralRegex = /(['"])(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgb\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*\)|rgba\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\))\1/g;
  const extracted: ExtractedColor[] = [];
  const literalRanges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = colorLiteralRegex.exec(text))) {
    const start = match.index;
    const end = match.index + match[0].length;

    if (isInsideRange(start, ignoredRanges)) {
      continue;
    }

    const value = match[2];
    if (!validateColorValue(value)) {
      continue;
    }

    extracted.push({
      value,
      type: getColorType(value),
      start,
      end,
      suggestedName: generateTokenName(value, getContextText(text, start)),
      replacementKind: 'literal'
    });
    literalRanges.push({ start, end });
  }

  if (extractEmbeddedColors) {
    extracted.push(...extractEmbeddedColorsFromText(text, ignoredRanges, literalRanges));
  }

  return extracted;
}

export function generateTokenName(value: string, contextText = ''): string {
  const prefix = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string>('generatedNamePrefix', '')
    .trim();
  const baseName = getTokenBaseName(value, contextText);
  const tokenName = `${prefix}${capitalizeIfNeeded(baseName, prefix)}`;

  return sanitizeTokenPath(tokenName);
}

export async function replaceColorsInDocument(
  document: vscode.TextDocument,
  extractedColors: ExtractedColor[],
  colorsFileUri: vscode.Uri
): Promise<ExtractionResult> {
  let existingColors = await readColors(colorsFileUri);
  const knownTokenNames = new Set(existingColors.map((color) => color.key));
  const tokenByNormalizedValue = new Map<string, string>();
  const replacementByRange = new Map<string, string>();
  const autoReplaceExistingColors = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('autoReplaceExistingColors', true);
  let added = 0;
  let reused = 0;
  let skipped = 0;
  const createAliases = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('createSemanticAliases', true);

  for (const color of existingColors) {
    tokenByNormalizedValue.set(normalizeColorValue(color.value), color.key);
  }

  for (const extracted of extractedColors) {
    const normalized = normalizeColorValue(extracted.value);
    const existingToken = tokenByNormalizedValue.get(normalized) ?? findExistingTokenByValue(existingColors, extracted.value)?.key;

    if (existingToken) {
      if (autoReplaceExistingColors) {
        if (createAliases && shouldCreateAlias(existingToken, extracted.suggestedName, knownTokenNames)) {
          const aliasName = getUniqueTokenName(extracted.suggestedName, knownTokenNames);
          await addColorAlias(colorsFileUri, aliasName, existingToken);
          existingColors = await readColors(colorsFileUri);
          knownTokenNames.add(aliasName);
          replacementByRange.set(getRangeKey(extracted), aliasName);
          added++;
        } else {
          replacementByRange.set(getRangeKey(extracted), existingToken);
          reused++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    const tokenName = getUniqueTokenName(extracted.suggestedName, knownTokenNames);
    await addColorToken(colorsFileUri, tokenName, extracted.value);
    existingColors = await readColors(colorsFileUri);
    knownTokenNames.add(tokenName);
    tokenByNormalizedValue.set(normalized, tokenName);
    replacementByRange.set(getRangeKey(extracted), tokenName);
    added++;
  }

  if (!replacementByRange.size) {
    return {
      extracted: extractedColors.length,
      added,
      reused,
      skipped: extractedColors.length
    };
  }

  const edit = new vscode.WorkspaceEdit();
  const replacements = extractedColors
    .filter((color) => replacementByRange.has(getRangeKey(color)))
    .sort((a, b) => b.start - a.start);

  for (const color of replacements) {
    const tokenName = replacementByRange.get(getRangeKey(color));
    if (!tokenName) {
      continue;
    }

    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(color.start), document.positionAt(color.end)),
      getReplacementText(color, tokenName)
    );
  }

  addColorsImportEdit(edit, document, colorsFileUri);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error('Failed to replace colors in the current file.');
  }

  await document.save();

  return {
    extracted: extractedColors.length,
    added,
    reused,
    skipped
  };
}

export async function extractColorsFromCurrentFile(targetDocumentUri?: vscode.Uri): Promise<void> {
  const document = await getTargetDocument(targetDocumentUri);
  if (!document) {
    throw new Error('Open a file before extracting hardcoded colors.');
  }

  if (!isSupportedDocument(document)) {
    throw new Error('Open a .ts, .tsx, .js, or .jsx file to extract hardcoded colors.');
  }

  if (path.basename(document.uri.fsPath) === 'colors.ts') {
    vscode.window.showInformationMessage('Open another file to extract hardcoded colors.');
    return;
  }

  const colorsFileUri = await getConfiguredColorsFile();
  if (!colorsFileUri) {
    return;
  }

  if (document.uri.toString() === colorsFileUri.toString()) {
    vscode.window.showInformationMessage('Open another file to extract hardcoded colors.');
    return;
  }

  const result = await extractColorsFromDocument(document, colorsFileUri);
  if (!result.extracted) {
    vscode.window.showInformationMessage('No hardcoded color literals found in the current file.');
    return;
  }

  vscode.window.showInformationMessage(
    `Extracted ${result.extracted} colors, added ${result.added} new tokens, reused ${result.reused} existing tokens.`
  );
}

export async function extractColorsFromFolder(folderOverride?: vscode.Uri): Promise<void> {
  const colorsFileUri = await getConfiguredColorsFile();
  if (!colorsFileUri) {
    return;
  }

  const folderUri = folderOverride ?? await pickTargetFolder();
  if (!folderUri) {
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  if (!workspaceFolder) {
    throw new Error('Choose a folder inside the current workspace.');
  }

  const fileUris = await findSupportedFilesInFolder(folderUri, workspaceFolder, colorsFileUri);
  if (!fileUris.length) {
    vscode.window.showInformationMessage('No supported TypeScript or JavaScript files found in that folder.');
    return;
  }

  await createFolderExtractionBackup(fileUris, colorsFileUri, workspaceFolder);

  const summary = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Extracting hardcoded colors',
      cancellable: false
    },
    async (progress) => {
      const total: ExtractionResult & { filesChanged: number; filesScanned: number } = {
        extracted: 0,
        added: 0,
        reused: 0,
        skipped: 0,
        filesChanged: 0,
        filesScanned: 0
      };

      for (const [index, fileUri] of fileUris.entries()) {
        progress.report({
          message: vscode.workspace.asRelativePath(fileUri),
          increment: index === 0 ? 0 : 100 / fileUris.length
        });

        const document = await vscode.workspace.openTextDocument(fileUri);
        const result = await extractColorsFromDocument(document, colorsFileUri);

        total.filesScanned++;
        total.extracted += result.extracted;
        total.added += result.added;
        total.reused += result.reused;
        total.skipped += result.skipped;

        if (result.added || result.reused) {
          total.filesChanged++;
        }
      }

      progress.report({ increment: 100 });
      return total;
    }
  );

  vscode.window.showInformationMessage(
    `Scanned ${summary.filesScanned} files, changed ${summary.filesChanged}, extracted ${summary.extracted} colors, added ${summary.added} tokens, reused ${summary.reused}.`
  );
}

export async function applyFolderExtractionPreview(preview: FolderExtractionPreview): Promise<FolderApplyResult | undefined> {
  const colorsFileUri = await getConfiguredColorsFile();
  if (!colorsFileUri) {
    return undefined;
  }

  validatePreviewTokenNames(preview);

  const folderUri = vscode.Uri.parse(preview.folderUri);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  if (!workspaceFolder) {
    throw new Error('Open the workspace that contains the previewed folder.');
  }

  const fileUris = preview.files.map((file) => vscode.Uri.parse(file.fileUri));
  await createFolderExtractionBackup(fileUris, colorsFileUri, workspaceFolder);

  const summary = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Applying color extraction preview',
      cancellable: false
    },
    async (progress) => {
      const total: ExtractionResult & { filesChanged: number; filesScanned: number; files: FileApplyResult[] } = {
        extracted: 0,
        added: 0,
        reused: 0,
        skipped: 0,
        filesChanged: 0,
        filesScanned: 0,
        files: []
      };

      for (const [index, filePreview] of preview.files.entries()) {
        progress.report({
          message: filePreview.filePath,
          increment: index === 0 ? 0 : 100 / preview.files.length
        });

        const result = await applyPreviewForFile(filePreview, colorsFileUri);
        total.filesScanned++;
        total.extracted += result.extracted;
        total.added += result.added;
        total.reused += result.reused;
        total.skipped += result.skipped;

        if (result.appliedReplacements.length) {
          total.filesChanged++;
          total.files.push({
            filePath: filePreview.filePath,
            fileUri: filePreview.fileUri,
            replacements: result.appliedReplacements
          });
        }
      }

      progress.report({ increment: 100 });
      return total;
    }
  );

  vscode.window.showInformationMessage(
    `Applied preview: changed ${summary.filesChanged} files, extracted ${summary.extracted} colors, added ${summary.added} tokens, reused ${summary.reused}.`
  );

  return {
    id: `${Date.now()}`,
    folderPath: preview.folderPath,
    colorsFilePath: preview.colorsFilePath,
    filesScanned: summary.filesScanned,
    filesChanged: summary.filesChanged,
    colorsExtracted: summary.extracted,
    tokensAdded: summary.added,
    tokensReused: summary.reused,
    files: summary.files
  };
}

function validatePreviewTokenNames(preview: FolderExtractionPreview): void {
  const tokenNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
  const newTokenNames = new Set<string>();

  for (const file of preview.files) {
    for (const replacement of file.replacements) {
      if ((replacement.action !== 'add' && replacement.action !== 'alias') || !replacement.tokenName) {
        continue;
      }

      if (!tokenNamePattern.test(replacement.tokenName)) {
        throw new Error(`Invalid token name "${replacement.tokenName}".`);
      }

      if (newTokenNames.has(replacement.tokenName)) {
        throw new Error(`Duplicate new token name "${replacement.tokenName}" in preview.`);
      }

      newTokenNames.add(replacement.tokenName);
    }
  }
}

async function createFolderExtractionBackup(
  fileUris: vscode.Uri[],
  colorsFileUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('createBackupsBeforeFolderExtraction', true);

  if (!enabled) {
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = vscode.Uri.joinPath(workspaceFolder.uri, '.color-token-manager-backups', timestamp);
  const seen = new Set<string>();

  for (const fileUri of [colorsFileUri, ...fileUris]) {
    if (seen.has(fileUri.toString())) {
      continue;
    }

    seen.add(fileUri.toString());
    const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath).replace(/\\/g, '/');
    const backupUri = vscode.Uri.joinPath(backupRoot, ...relativePath.split('/'));
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(backupUri.fsPath)));
    await vscode.workspace.fs.writeFile(backupUri, await vscode.workspace.fs.readFile(fileUri));
  }
}

async function applyPreviewForFile(
  filePreview: FileExtractionPreview,
  colorsFileUri: vscode.Uri
): Promise<PreviewFileApplyResult> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(filePreview.fileUri));
  const extractedColors = extractHardcodedColorsFromText(document.getText());
  const plannedReplacements = [...filePreview.replacements];
  const replacementByRange = new Map<string, string>();
  const appliedReplacements: AppliedColorReplacement[] = [];
  let added = 0;
  let reused = 0;
  let skipped = 0;

  for (const extracted of extractedColors) {
    const line = document.positionAt(extracted.start).line + 1;
    const plannedIndex = plannedReplacements.findIndex((replacement) => {
      return replacement.line === line && normalizeColorValue(replacement.value) === normalizeColorValue(extracted.value);
    });

    if (plannedIndex === -1) {
      continue;
    }

    const planned = plannedReplacements.splice(plannedIndex, 1)[0];
    if (planned.action === 'skip') {
      skipped++;
      continue;
    }

    await ensurePreviewToken(colorsFileUri, planned);
    replacementByRange.set(getRangeKey(extracted), planned.tokenName);
    appliedReplacements.push({
      value: planned.value,
      tokenName: planned.tokenName,
      action: planned.action,
      line: planned.line,
      fileUri: filePreview.fileUri,
      aliasOf: planned.aliasOf
    });

    if (planned.action === 'reuse') {
      reused++;
    } else {
      added++;
    }
  }

  if (!replacementByRange.size) {
    return {
      extracted: filePreview.replacements.length,
      added,
      reused,
      skipped,
      appliedReplacements
    };
  }

  const edit = new vscode.WorkspaceEdit();
  const replacements = extractedColors
    .filter((color) => replacementByRange.has(getRangeKey(color)))
    .sort((a, b) => b.start - a.start);

  for (const color of replacements) {
    const tokenName = replacementByRange.get(getRangeKey(color));
    if (!tokenName) {
      continue;
    }

    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(color.start), document.positionAt(color.end)),
      getReplacementText(color, tokenName)
    );
  }

  addColorsImportEdit(edit, document, colorsFileUri);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error(`Failed to apply preview changes to ${filePreview.filePath}.`);
  }

  await document.save();

  return {
    extracted: filePreview.replacements.length,
    added,
    reused,
    skipped,
    appliedReplacements
  };
}

async function ensurePreviewToken(
  colorsFileUri: vscode.Uri,
  replacement: FileExtractionPreview['replacements'][number]
): Promise<void> {
  const colors = await readColors(colorsFileUri);
  const existing = colors.find((color) => color.key === replacement.tokenName);

  if (existing) {
    return;
  }

  if (replacement.action === 'alias' && replacement.aliasOf) {
    await addColorAlias(colorsFileUri, replacement.tokenName, replacement.aliasOf);
    return;
  }

  if (replacement.action === 'add') {
    await addColorToken(colorsFileUri, replacement.tokenName, replacement.value);
  }
}

export async function previewColorsFromFolder(folderOverride?: vscode.Uri): Promise<FolderExtractionPreview | undefined> {
  const colorsFileUri = await getConfiguredColorsFile();
  if (!colorsFileUri) {
    return undefined;
  }

  const folderUri = folderOverride ?? await pickTargetFolder('Preview Colors From Folder');
  if (!folderUri) {
    return undefined;
  }

  return buildFolderExtractionPreview(folderUri, colorsFileUri);
}

export async function buildFolderExtractionPreview(
  folderUri: vscode.Uri,
  colorsFileUri: vscode.Uri
): Promise<FolderExtractionPreview> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  if (!workspaceFolder) {
    throw new Error('Choose a folder inside the current workspace.');
  }

  const fileUris = await findSupportedFilesInFolder(folderUri, workspaceFolder, colorsFileUri);
  const existingColors = await readColors(colorsFileUri);
  const knownTokenNames = new Set(existingColors.map((color) => color.key));
  const tokenByNormalizedValue = new Map<string, string>();
  const autoReplaceExistingColors = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('autoReplaceExistingColors', true);
  const files: FileExtractionPreview[] = [];
  let colorsFound = 0;
  let tokensToAdd = 0;
  let tokensToReuse = 0;

  for (const color of existingColors) {
    tokenByNormalizedValue.set(normalizeColorValue(color.value), color.key);
  }

  for (const fileUri of fileUris) {
    const document = await vscode.workspace.openTextDocument(fileUri);
    const extractedColors = extractHardcodedColorsFromText(document.getText());
    const replacements: FileExtractionPreview['replacements'] = [];

    for (const extracted of extractedColors) {
      colorsFound++;
      const normalized = normalizeColorValue(extracted.value);
      const existingToken = tokenByNormalizedValue.get(normalized) ?? findExistingTokenByValue(existingColors, extracted.value)?.key;
      const createAliases = vscode.workspace
        .getConfiguration('colorTokenManager')
        .get<boolean>('createSemanticAliases', true);

      if (existingToken) {
        if (autoReplaceExistingColors) {
          if (createAliases && shouldCreateAlias(existingToken, extracted.suggestedName, knownTokenNames)) {
            const tokenName = getUniqueTokenName(extracted.suggestedName, knownTokenNames);
            knownTokenNames.add(tokenName);
            tokenByNormalizedValue.set(normalized, tokenName);
            tokensToAdd++;
            replacements.push({
              value: extracted.value,
              tokenName,
              action: 'alias',
              aliasOf: existingToken,
              line: document.positionAt(extracted.start).line + 1,
              start: extracted.start
            });
          } else {
            tokensToReuse++;
            replacements.push({
              value: extracted.value,
              tokenName: existingToken,
              action: 'reuse',
              line: document.positionAt(extracted.start).line + 1,
              start: extracted.start
            });
          }
        } else {
          replacements.push({
            value: extracted.value,
            tokenName: existingToken,
            action: 'skip',
            line: document.positionAt(extracted.start).line + 1,
            start: extracted.start
          });
        }
        continue;
      }

      const tokenName = getUniqueTokenName(extracted.suggestedName, knownTokenNames);
      knownTokenNames.add(tokenName);
      tokenByNormalizedValue.set(normalized, tokenName);
      tokensToAdd++;
      replacements.push({
        value: extracted.value,
        tokenName,
        action: 'add',
        line: document.positionAt(extracted.start).line + 1,
        start: extracted.start
      });
    }

    if (replacements.length) {
      files.push({
        filePath: vscode.workspace.asRelativePath(fileUri),
        fileUri: fileUri.toString(),
        replacements
      });
    }
  }

  return {
    id: `${Date.now()}`,
    folderPath: vscode.workspace.asRelativePath(folderUri),
    folderUri: folderUri.toString(),
    colorsFilePath: vscode.workspace.asRelativePath(colorsFileUri),
    filesScanned: fileUris.length,
    filesWithColors: files.length,
    colorsFound,
    tokensToAdd,
    tokensToReuse,
    files
  };
}

export async function extractColorsFromDocument(
  document: vscode.TextDocument,
  colorsFileUri: vscode.Uri
): Promise<ExtractionResult> {
  if (!isSupportedExtractionDocument(document) || document.uri.toString() === colorsFileUri.toString()) {
    return { extracted: 0, added: 0, reused: 0, skipped: 0 };
  }

  const extractedColors = extractHardcodedColorsFromText(document.getText());
  if (!extractedColors.length) {
    return { extracted: 0, added: 0, reused: 0, skipped: 0 };
  }

  return replaceColorsInDocument(document, extractedColors, colorsFileUri);
}

export function isSupportedExtractionDocument(document: vscode.TextDocument): boolean {
  return isSupportedDocument(document) && path.basename(document.uri.fsPath) !== 'colors.ts';
}

async function pickTargetFolder(title = 'Extract Colors From Folder'): Promise<vscode.Uri | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    openLabel: title,
    title: 'Choose a folder to recursively scan hardcoded colors'
  });

  return selected?.[0];
}

async function findSupportedFilesInFolder(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder,
  colorsFileUri: vscode.Uri
): Promise<vscode.Uri[]> {
  const relativeFolder = path.relative(workspaceFolder.uri.fsPath, folderUri.fsPath).replace(/\\/g, '/');
  const prefix = relativeFolder && relativeFolder !== '.' ? `${relativeFolder}/` : '';
  const pattern = new vscode.RelativePattern(workspaceFolder, `${prefix}**/*.{ts,tsx,js,jsx}`);
  const files = await vscode.workspace.findFiles(
    pattern,
    '{**/node_modules/**,**/dist/**,**/build/**,**/ios/**,**/android/**}'
  );

  return files.filter((fileUri) => {
    const relativePath = vscode.workspace.asRelativePath(fileUri).replace(/\\/g, '/');
    if (fileUri.toString() === colorsFileUri.toString()) {
      return false;
    }

    if (path.basename(fileUri.fsPath) === 'colors.ts') {
      return false;
    }

    return SUPPORTED_EXTENSIONS.has(path.extname(fileUri.fsPath)) && !matchesConfiguredExclude(relativePath);
  });
}

async function getTargetDocument(targetDocumentUri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  if (vscode.window.activeTextEditor) {
    return vscode.window.activeTextEditor.document;
  }

  const visibleEditor = vscode.window.visibleTextEditors.find((editor) => isSupportedExtractionDocument(editor.document));
  if (visibleEditor) {
    return visibleEditor.document;
  }

  if (targetDocumentUri) {
    return vscode.workspace.openTextDocument(targetDocumentUri);
  }

  return undefined;
}

function isSupportedDocument(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file') {
    return false;
  }

  const filePath = document.uri.fsPath.replace(/\\/g, '/');
  if (BLOCKED_PATH_PARTS.some((part) => filePath.includes(part))) {
    return false;
  }

  return SUPPORTED_EXTENSIONS.has(path.extname(filePath));
}

function matchesConfiguredExclude(relativePath: string): boolean {
  const globs = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string[]>('excludeGlobs', []);

  return globs.some((glob) => globToRegExp(glob).test(relativePath));
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');

  return new RegExp(`^${escaped}$`);
}

function findCommentRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let i = 0;
  let quote: string | undefined;

  while (i < text.length) {
    const current = text[i];
    const next = text[i + 1];

    if (quote) {
      if (current === '\\') {
        i += 2;
        continue;
      }

      if (current === quote) {
        quote = undefined;
      }

      i++;
      continue;
    }

    if (current === '"' || current === "'") {
      quote = current;
      i++;
      continue;
    }

    if (current === '/' && next === '/') {
      const start = i;
      const end = text.indexOf('\n', i + 2);
      ranges.push({ start, end: end === -1 ? text.length : end });
      i = end === -1 ? text.length : end;
      continue;
    }

    if (current === '/' && next === '*') {
      const start = i;
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      ranges.push({ start, end });
      i = end;
      continue;
    }

    i++;
  }

  return ranges;
}

function findImportRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const importRegex = /^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/gm;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(text))) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return ranges;
}

function extractEmbeddedColorsFromText(
  text: string,
  ignoredRanges: Array<{ start: number; end: number }>,
  literalRanges: Array<{ start: number; end: number }>
): ExtractedColor[] {
  const stringRegex = /(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  const colorRegex = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgb\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*\)|rgba\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\)/g;
  const extracted: ExtractedColor[] = [];
  let stringMatch: RegExpExecArray | null;

  while ((stringMatch = stringRegex.exec(text))) {
    const stringStart = stringMatch.index;
    const stringEnd = stringStart + stringMatch[0].length;
    const content = stringMatch[2];

    if (isInsideRange(stringStart, ignoredRanges) || isRangeCovered(stringStart, stringEnd, literalRanges)) {
      continue;
    }

    const matches = [...content.matchAll(colorRegex)];
    if (matches.length !== 1) {
      continue;
    }

    const colorMatch = matches[0];
    const value = colorMatch[0];
    if (!validateColorValue(value) || colorMatch.index === undefined) {
      continue;
    }

    extracted.push({
      value,
      type: getColorType(value),
      start: stringStart,
      end: stringEnd,
      suggestedName: generateTokenName(value, getContextText(text, stringStart)),
      replacementKind: 'embeddedString',
      embeddedPrefix: content.slice(0, colorMatch.index),
      embeddedSuffix: content.slice(colorMatch.index + value.length)
    });
  }

  return extracted;
}

function isInsideRange(offset: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function isRangeCovered(start: number, end: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => start >= range.start && end <= range.end);
}

function getReplacementText(color: ExtractedColor, tokenName: string): string {
  const reference = `${getColorsIdentifier()}.${tokenName}`;

  if (color.replacementKind === 'embeddedString') {
    return `\`${escapeTemplateText(color.embeddedPrefix ?? '')}\${${reference}}${escapeTemplateText(color.embeddedSuffix ?? '')}\``;
  }

  return reference;
}

function escapeTemplateText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function getContextText(text: string, start: number): string {
  return text.slice(Math.max(0, start - 120), start);
}

function getContextPrefix(contextText: string): string {
  const match = contextText.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
  const propertyName = match?.[1] ?? 'color';
  const ownerName = getOwnerContextName(contextText, propertyName);
  const roleName = getRoleName(propertyName);

  if (ownerName && roleName) {
    return `${ownerName}${capitalize(roleName)}`;
  }

  if (roleName) {
    return roleName;
  }

  return sanitizeTokenName(propertyName);
}

function getTokenBaseName(value: string, contextText: string): string {
  const namingStrategy = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<'semantic' | 'contextValue' | 'valueOnly'>('namingStrategy', 'semantic');
  const context = getContextParts(contextText);
  const semanticColor = getSemanticColorName(value);
  const valueSuffix = getValueSuffix(value);

  if (namingStrategy === 'valueOnly') {
    return semanticColor ?? `color${valueSuffix}`;
  }

  if (namingStrategy === 'contextValue') {
    return `${context.flatPrefix}${valueSuffix}`;
  }

  if (context.owner && context.role) {
    return `${context.owner}.${context.role}`;
  }

  return semanticColor ?? `${context.role ?? context.flatPrefix}${valueSuffix}`;
}

function getContextParts(contextText: string): { flatPrefix: string; owner?: string; role?: string } {
  const match = contextText.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
  const propertyName = match?.[1] ?? 'color';
  const owner = getOwnerContextName(contextText, propertyName);
  const role = getRoleName(propertyName);
  const flatPrefix = owner && role
    ? `${owner}${capitalize(role)}`
    : role ?? sanitizeTokenName(propertyName);

  return { flatPrefix, owner, role };
}

function getRoleName(propertyName: string): string | undefined {
  if (/background/i.test(propertyName)) {
    return 'background';
  }

  if (/border/i.test(propertyName)) {
    return 'border';
  }

  if (/shadow/i.test(propertyName)) {
    return 'shadow';
  }

  if (/tint/i.test(propertyName)) {
    return 'tint';
  }

  if (propertyName === 'color' || /text/i.test(propertyName)) {
    return 'text';
  }

  return undefined;
}

function getOwnerContextName(contextText: string, currentPropertyName: string): string | undefined {
  const matches = [...contextText.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{/g)];
  const owner = matches
    .map((match) => match[1])
    .filter((name) => !['StyleSheet', 'create', currentPropertyName].includes(name))
    .at(-1);

  return owner ? sanitizeTokenName(owner) : undefined;
}

function getSemanticColorName(value: string): string | undefined {
  const hex = valueToHex(value);
  if (!hex) {
    return undefined;
  }

  const exact: Record<string, string> = {
    '#000000': 'black',
    '#FFFFFF': 'white',
    '#FF6B00': 'primaryOrange',
    '#FF3B30': 'red500',
    '#34C759': 'green500',
    '#007AFF': 'blue500',
    '#8E8E93': 'gray500'
  };

  return exact[hex];
}

function getValueSuffix(value: string): string {
  const hex = valueToHex(value);
  if (hex) {
    return hex.replace('#', '');
  }

  return normalizeColorValue(value)
    .replace(/^rgba?\(/, '')
    .replace(/\)$/, '')
    .split(',')
    .map((part) => part.trim().replace('.', '_'))
    .join('_');
}

function valueToHex(value: string): string | undefined {
  const normalized = normalizeColorValue(value);
  if (normalized.startsWith('#')) {
    return normalized;
  }

  const rgbMatch = normalized.match(/^rgba?\((\d+),(\d+),(\d+)(?:,(.+))?\)$/);
  if (!rgbMatch) {
    return undefined;
  }

  const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
  if (alpha !== 1) {
    return undefined;
  }

  return `#${toHex(Number(rgbMatch[1]))}${toHex(Number(rgbMatch[2]))}${toHex(Number(rgbMatch[3]))}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function sanitizeTokenName(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9_$]+/g, ' ')
    .trim()
    .replace(/\s+([A-Za-z0-9_$])/g, (_, character: string) => character.toUpperCase())
    .replace(/^[^A-Za-z_$]+/, '');

  return cleaned || 'color';
}

function sanitizeTokenPath(value: string): string {
  return value
    .split('.')
    .map((part) => sanitizeTokenName(part))
    .filter(Boolean)
    .join('.') || 'color';
}

function capitalizeIfNeeded(baseName: string, prefix: string): string {
  if (!prefix) {
    return baseName;
  }

  return baseName.charAt(0).toUpperCase() + baseName.slice(1);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shouldCreateAlias(existingToken: string, suggestedName: string, knownTokenNames: Set<string>): boolean {
  if (existingToken === suggestedName || knownTokenNames.has(suggestedName)) {
    return false;
  }

  return /[A-Z.]/.test(suggestedName);
}

function getUniqueTokenName(baseName: string, existingNames: Set<string>): string {
  let tokenName = sanitizeTokenPath(baseName);
  let counter = 2;

  while (existingNames.has(tokenName)) {
    tokenName = `${sanitizeTokenPath(baseName)}${counter}`;
    counter++;
  }

  return tokenName;
}

function getRangeKey(color: ExtractedColor): string {
  return `${color.start}:${color.end}`;
}
