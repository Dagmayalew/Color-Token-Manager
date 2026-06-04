import * as path from 'path';
import * as vscode from 'vscode';
import {
  addColorAlias,
  findExistingTokenByValue,
  getConfiguredColorsFile,
  normalizeColorValue,
  readColors,
} from './colorFile';
import { globToRegExp } from './globUtils';
import { addColorsImportEdit } from './importUtils';
import {
  addGeneratedColorToken,
  buildPreviewForDocument,
  createPreviewPlanner,
  ensurePreviewToken,
  getRangeKey,
  getUniqueTokenName,
  shouldCreateAlias,
  validatePreviewTokenNames,
} from './colorPlan';
import { extractHardcodedColorsFromText, getReplacementText } from './colorScan';
import { getDefaultDialogUri } from './workspaceUtils';
import {
  type AppliedColorReplacement,
  type ExtractedColor,
  type FileApplyResult,
  type FileExtractionPreview,
  type FolderApplyResult,
  type FolderExtractionPreview,
} from './types';

const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue']);
const STYLE_EXTENSIONS = new Set(['.css', '.scss', '.less']);
const SUPPORTED_EXTENSIONS = new Set([...SCRIPT_EXTENSIONS, ...STYLE_EXTENSIONS]);
const BLOCKED_PATH_PARTS = ['/node_modules/', '/build/', '/dist/'];
export type ExtractionResult = {
  extracted: number;
  added: number;
  reused: number;
  skipped: number;
};
type PreviewFileApplyResult = ExtractionResult & { appliedReplacements: AppliedColorReplacement[] };
export type SelectionPreviewTarget = { uri: vscode.Uri; start: number; end: number };
export async function replaceColorsInDocument(
  document: vscode.TextDocument,
  extractedColors: ExtractedColor[],
  colorsFileUri: vscode.Uri,
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
    const existingToken =
      tokenByNormalizedValue.get(normalized) ??
      findExistingTokenByValue(existingColors, extracted.value)?.key;

    if (existingToken) {
      if (autoReplaceExistingColors) {
        if (
          createAliases &&
          shouldCreateAlias(existingToken, extracted.suggestedName, knownTokenNames)
        ) {
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
    await addGeneratedColorToken(colorsFileUri, tokenName, extracted.value, knownTokenNames);
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
      skipped: extractedColors.length,
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
      getReplacementText(color, tokenName),
    );
  }

  if (!isStyleLikeDocument(document)) {
    addColorsImportEdit(edit, document, colorsFileUri);
  }
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error('Failed to replace colors in the current file.');
  }

  await document.save();

  return {
    extracted: extractedColors.length,
    added,
    reused,
    skipped,
  };
}

export async function extractColorsFromCurrentFile(targetDocumentUri?: vscode.Uri): Promise<void> {
  const document = await getTargetDocument(targetDocumentUri);
  if (!document) {
    throw new Error('Open a file before extracting hardcoded colors.');
  }

  if (!isSupportedDocument(document)) {
    throw new Error(
      `Open a supported source file (${getSupportedExtensionsMessage()}) to extract hardcoded colors.`,
    );
  }

  if (path.basename(document.uri.fsPath) === 'colors.ts') {
    vscode.window.showInformationMessage('Open another file to extract hardcoded colors.');
    return;
  }

  const colorsFileUri = await getConfiguredColorsFile(targetDocumentUri ?? document.uri);
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
    `Extracted ${result.extracted} colors, added ${result.added} new tokens, reused ${result.reused} existing tokens.`,
  );
}

export async function extractColorsFromFolder(folderOverride?: vscode.Uri): Promise<void> {
  if (!ensureTrustedWorkspaceForFolderWrites()) {
    return;
  }

  const colorsFileUri = await getConfiguredColorsFile(folderOverride);
  if (!colorsFileUri) {
    return;
  }

  const folderUri =
    folderOverride ?? (await pickTargetFolder('Extract Colors From Folder', folderOverride));
  if (!folderUri) {
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  if (!workspaceFolder) {
    throw new Error('Choose a folder inside the current workspace.');
  }

  const fileUris = await findSupportedFilesInFolder(folderUri, workspaceFolder, colorsFileUri);
  if (!fileUris.length) {
    vscode.window.showInformationMessage('No supported source files found in that folder.');
    return;
  }

  await createFolderExtractionBackup(fileUris, colorsFileUri, workspaceFolder);

  const summary = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Extracting hardcoded colors',
      cancellable: false,
    },
    async (progress) => {
      const total: ExtractionResult & { filesChanged: number; filesScanned: number } = {
        extracted: 0,
        added: 0,
        reused: 0,
        skipped: 0,
        filesChanged: 0,
        filesScanned: 0,
      };

      for (const [index, fileUri] of fileUris.entries()) {
        progress.report({
          message: vscode.workspace.asRelativePath(fileUri),
          increment: index === 0 ? 0 : 100 / fileUris.length,
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
    },
  );

  vscode.window.showInformationMessage(
    `Scanned ${summary.filesScanned} files, changed ${summary.filesChanged}, extracted ${summary.extracted} colors, added ${summary.added} tokens, reused ${summary.reused}.`,
  );
}

export async function applyFolderExtractionPreview(
  preview: FolderExtractionPreview,
): Promise<FolderApplyResult | undefined> {
  if (!ensureTrustedWorkspaceForFolderWrites()) {
    return undefined;
  }

  const colorsFileUri = await getConfiguredColorsFile(vscode.Uri.parse(preview.folderUri));
  if (!colorsFileUri) {
    return undefined;
  }

  validatePreviewTokenNames(preview);

  const folderUri = vscode.Uri.parse(preview.folderUri);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  if (!workspaceFolder) {
    throw new Error('Open the workspace that contains the previewed folder.');
  }

  const fileUris = preview.files
    .filter((file) => file.replacements.some((replacement) => replacement.enabled !== false))
    .map((file) => vscode.Uri.parse(file.fileUri));
  await createFolderExtractionBackup(fileUris, colorsFileUri, workspaceFolder);

  const summary = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Applying color extraction preview',
      cancellable: false,
    },
    async (progress) => {
      const total: ExtractionResult & {
        filesChanged: number;
        filesScanned: number;
        files: FileApplyResult[];
      } = {
        extracted: 0,
        added: 0,
        reused: 0,
        skipped: 0,
        filesChanged: 0,
        filesScanned: 0,
        files: [],
      };

      for (const [index, filePreview] of preview.files.entries()) {
        progress.report({
          message: filePreview.filePath,
          increment: index === 0 ? 0 : 100 / preview.files.length,
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
            replacements: result.appliedReplacements,
          });
        }
      }

      progress.report({ increment: 100 });
      return total;
    },
  );

  vscode.window.showInformationMessage(
    `Applied preview: changed ${summary.filesChanged} files, extracted ${summary.extracted} colors, added ${summary.added} tokens, reused ${summary.reused}.`,
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
    files: summary.files,
  };
}

function ensureTrustedWorkspaceForFolderWrites(): boolean {
  if (vscode.workspace.isTrusted) {
    return true;
  }

  vscode.window.showWarningMessage(
    'Color Token Manager cannot apply folder-wide color extraction in an untrusted workspace. Trust this workspace first, then run the command again.',
  );
  return false;
}

async function createFolderExtractionBackup(
  fileUris: vscode.Uri[],
  colorsFileUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('createBackupsBeforeFolderExtraction', true);

  if (!enabled) {
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = vscode.Uri.joinPath(
    workspaceFolder.uri,
    '.color-token-manager-backups',
    timestamp,
  );
  const seen = new Set<string>();

  for (const fileUri of [colorsFileUri, ...fileUris]) {
    if (seen.has(fileUri.toString())) {
      continue;
    }

    seen.add(fileUri.toString());
    const relativePath = path
      .relative(workspaceFolder.uri.fsPath, fileUri.fsPath)
      .replace(/\\/g, '/');
    const backupUri = vscode.Uri.joinPath(backupRoot, ...relativePath.split('/'));
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(backupUri.fsPath)));
    await vscode.workspace.fs.writeFile(backupUri, await vscode.workspace.fs.readFile(fileUri));
  }
}

async function applyPreviewForFile(
  filePreview: FileExtractionPreview,
  colorsFileUri: vscode.Uri,
): Promise<PreviewFileApplyResult> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(filePreview.fileUri));
  const extractedColors = extractHardcodedColorsFromText(
    document.getText(),
    getExtractionOptions(document),
  );
  const plannedReplacements = filePreview.replacements.filter(
    (replacement) => replacement.enabled !== false,
  );
  const selectedReplacementCount = plannedReplacements.length;
  const replacementByRange = new Map<string, string>();
  const appliedReplacements: AppliedColorReplacement[] = [];
  let added = 0;
  let reused = 0;
  let skipped = 0;

  for (const extracted of extractedColors) {
    const line = document.positionAt(extracted.start).line + 1;
    const plannedIndex = plannedReplacements.findIndex((replacement) => {
      return (
        replacement.line === line &&
        normalizeColorValue(replacement.value) === normalizeColorValue(extracted.value)
      );
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
      aliasOf: planned.aliasOf,
    });

    if (planned.action === 'reuse') {
      reused++;
    } else {
      added++;
    }
  }

  if (!replacementByRange.size) {
    return {
      extracted: selectedReplacementCount,
      added,
      reused,
      skipped,
      appliedReplacements,
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
      getReplacementText(color, tokenName),
    );
  }

  if (!isStyleLikeDocument(document)) {
    addColorsImportEdit(edit, document, colorsFileUri);
  }
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error(`Failed to apply preview changes to ${filePreview.filePath}.`);
  }

  await document.save();

  return {
    extracted: selectedReplacementCount,
    added,
    reused,
    skipped,
    appliedReplacements,
  };
}

export async function previewColorsFromFolder(
  folderOverride?: vscode.Uri,
): Promise<FolderExtractionPreview | undefined> {
  const colorsFileUri = await getConfiguredColorsFile(folderOverride);
  if (!colorsFileUri) {
    return undefined;
  }

  const folderUri =
    folderOverride ?? (await pickTargetFolder('Preview Colors From Folder', folderOverride));
  if (!folderUri) {
    return undefined;
  }

  return buildFolderExtractionPreview(folderUri, colorsFileUri);
}

export async function previewColorsFromSelection(
  target?: SelectionPreviewTarget,
): Promise<FolderExtractionPreview | undefined> {
  const editor = vscode.window.activeTextEditor;
  const document = target ? await vscode.workspace.openTextDocument(target.uri) : editor?.document;
  const activeSelection =
    !target && editor && !editor.selection.isEmpty
      ? {
          start: document ? document.offsetAt(editor.selection.start) : 0,
          end: document ? document.offsetAt(editor.selection.end) : 0,
        }
      : undefined;
  const selection = activeSelection ?? target;

  if (!document || !selection || selection.start === selection.end) {
    throw new Error(
      `Select text in a supported source file (${getSupportedExtensionsMessage()}) before previewing colors from selection.`,
    );
  }

  if (!isSupportedExtractionDocument(document)) {
    throw new Error(
      `Select text in a supported source file (${getSupportedExtensionsMessage()}) before previewing colors from selection.`,
    );
  }

  const colorsFileUri = await getConfiguredColorsFile(document.uri);
  if (!colorsFileUri) {
    return undefined;
  }

  const selectionStart = Math.min(selection.start, selection.end);
  const selectionEnd = Math.max(selection.start, selection.end);
  const selectionText = document.getText(
    new vscode.Range(document.positionAt(selectionStart), document.positionAt(selectionEnd)),
  );
  const extractedColors = extractHardcodedColorsFromText(
    selectionText,
    getExtractionOptions(document),
  ).map((color) => ({
    ...color,
    start: color.start + selectionStart,
    end: color.end + selectionStart,
  }));
  const existingColors = await readColors(colorsFileUri);
  const filePreview = buildPreviewForDocument(
    document,
    extractedColors,
    createPreviewPlanner(existingColors),
  );

  return {
    id: `${Date.now()}`,
    folderPath: `${vscode.workspace.asRelativePath(document.uri)} selection`,
    folderUri: document.uri.toString(),
    colorsFilePath: vscode.workspace.asRelativePath(colorsFileUri),
    filesScanned: 1,
    filesWithColors: filePreview.replacements.length ? 1 : 0,
    colorsFound: filePreview.replacements.length,
    tokensToAdd: filePreview.replacements.filter(
      (replacement) => replacement.action === 'add' || replacement.action === 'alias',
    ).length,
    tokensToReuse: filePreview.replacements.filter((replacement) => replacement.action === 'reuse')
      .length,
    files: filePreview.replacements.length ? [filePreview] : [],
  };
}

export async function buildFolderExtractionPreview(
  folderUri: vscode.Uri,
  colorsFileUri: vscode.Uri,
): Promise<FolderExtractionPreview> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  if (!workspaceFolder) {
    throw new Error('Choose a folder inside the current workspace.');
  }

  const fileUris = await findSupportedFilesInFolder(folderUri, workspaceFolder, colorsFileUri);
  const existingColors = await readColors(colorsFileUri);
  const planner = createPreviewPlanner(existingColors);
  const files: FileExtractionPreview[] = [];
  let colorsFound = 0;
  let tokensToAdd = 0;
  let tokensToReuse = 0;

  for (const fileUri of fileUris) {
    const document = await vscode.workspace.openTextDocument(fileUri);
    const extractedColors = extractHardcodedColorsFromText(
      document.getText(),
      getExtractionOptions(document),
    );
    const filePreview = buildPreviewForDocument(document, extractedColors, planner);
    const replacements = filePreview.replacements;
    colorsFound += replacements.length;
    tokensToAdd += replacements.filter(
      (replacement) => replacement.action === 'add' || replacement.action === 'alias',
    ).length;
    tokensToReuse += replacements.filter((replacement) => replacement.action === 'reuse').length;

    if (replacements.length) {
      files.push(filePreview);
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
    files,
  };
}

export async function extractColorsFromDocument(
  document: vscode.TextDocument,
  colorsFileUri: vscode.Uri,
): Promise<ExtractionResult> {
  if (
    !isSupportedExtractionDocument(document) ||
    document.uri.toString() === colorsFileUri.toString()
  ) {
    return { extracted: 0, added: 0, reused: 0, skipped: 0 };
  }

  const extractedColors = extractHardcodedColorsFromText(
    document.getText(),
    getExtractionOptions(document),
  );
  if (!extractedColors.length) {
    return { extracted: 0, added: 0, reused: 0, skipped: 0 };
  }

  return replaceColorsInDocument(document, extractedColors, colorsFileUri);
}

export function isSupportedExtractionDocument(document: vscode.TextDocument): boolean {
  return isSupportedDocument(document) && path.basename(document.uri.fsPath) !== 'colors.ts';
}

async function pickTargetFolder(
  title = 'Extract Colors From Folder',
  contextUri?: vscode.Uri,
): Promise<vscode.Uri | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: getDefaultDialogUri(contextUri),
    openLabel: title,
    title: 'Choose a folder to recursively scan hardcoded colors',
  });

  return selected?.[0];
}

async function findSupportedFilesInFolder(
  folderUri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder,
  colorsFileUri: vscode.Uri,
): Promise<vscode.Uri[]> {
  const relativeFolder = path
    .relative(workspaceFolder.uri.fsPath, folderUri.fsPath)
    .replace(/\\/g, '/');
  const prefix = relativeFolder && relativeFolder !== '.' ? `${relativeFolder}/` : '';
  const pattern = new vscode.RelativePattern(
    workspaceFolder,
    `${prefix}**/*.{ts,tsx,js,jsx,vue,css,scss,less}`,
  );
  const files = await vscode.workspace.findFiles(
    pattern,
    '{**/node_modules/**,**/dist/**,**/build/**,**/ios/**,**/android/**}',
  );

  return files.filter((fileUri) => {
    const relativePath = vscode.workspace.asRelativePath(fileUri).replace(/\\/g, '/');
    if (fileUri.toString() === colorsFileUri.toString()) {
      return false;
    }

    if (path.basename(fileUri.fsPath) === 'colors.ts') {
      return false;
    }

    return (
      SUPPORTED_EXTENSIONS.has(path.extname(fileUri.fsPath)) &&
      !matchesConfiguredExclude(relativePath)
    );
  });
}

async function getTargetDocument(
  targetDocumentUri?: vscode.Uri,
): Promise<vscode.TextDocument | undefined> {
  if (vscode.window.activeTextEditor) {
    return vscode.window.activeTextEditor.document;
  }

  const visibleEditor = vscode.window.visibleTextEditors.find((editor) =>
    isSupportedExtractionDocument(editor.document),
  );
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

function getExtractionOptions(document: vscode.TextDocument): { includeUnquotedColors?: boolean } {
  return {
    includeUnquotedColors: isStyleLikeDocument(document),
  };
}

function isStyleLikeDocument(document: vscode.TextDocument): boolean {
  return STYLE_EXTENSIONS.has(path.extname(document.uri.fsPath));
}

function getSupportedExtensionsMessage(): string {
  return Array.from(SUPPORTED_EXTENSIONS).join(', ');
}

function matchesConfiguredExclude(relativePath: string): boolean {
  const globs = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string[]>('excludeGlobs', []);

  return globs.some((glob) => globToRegExp(glob).test(relativePath));
}
