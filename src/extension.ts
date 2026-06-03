import * as path from 'path';
import * as vscode from 'vscode';
import {
  applyFolderExtractionPreview,
  extractColorsFromCurrentFile,
  extractColorsFromFolder,
  isSupportedExtractionDocument,
  previewColorsFromFolder
} from './colorExtractor';
import { getConfiguredColorsFile, pickColorsFile, readColors, updateColor, validateColorValue } from './colorFile';
import { getPreviewWebviewHtml } from './previewWebview';
import { getResultsWebviewHtml } from './resultsWebview';
import { AppColor, FolderApplyResult, FolderExtractionPreview } from './types';
import { getWebviewHtml } from './webview';

let panel: vscode.WebviewPanel | undefined;
let previewPanel: vscode.WebviewPanel | undefined;
let resultsPanel: vscode.WebviewPanel | undefined;
let selectedFile: vscode.Uri | undefined;
let lastExtractionTarget: vscode.Uri | undefined;
let lastFolderPreview: FolderExtractionPreview | undefined;
let watcher: vscode.FileSystemWatcher | undefined;

export function activate(context: vscode.ExtensionContext): void {
  rememberExtractionTarget(vscode.window.activeTextEditor);

  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    rememberExtractionTarget(editor);
  });

  const openDisposable = vscode.commands.registerCommand('colorTokenManager.open', async () => {
    try {
      const fileUri = await getConfiguredColorsFile();
      if (!fileUri) {
        return;
      }

      selectedFile = fileUri;
      await rememberColorsFile(selectedFile);
      await openColorManager(context, selectedFile);
    } catch (error) {
      showError(error);
    }
  });

  const extractDisposable = vscode.commands.registerCommand('colorTokenManager.extractFromCurrentFile', async () => {
    try {
      await extractColorsFromCurrentFile(lastExtractionTarget);
      if (selectedFile) {
        await refreshWebview(selectedFile, 'Extracted colors from current file.');
      }
    } catch (error) {
      showError(error);
    }
  });

  const extractFolderDisposable = vscode.commands.registerCommand('colorTokenManager.extractFromFolder', async (folderUri?: vscode.Uri) => {
    try {
      await extractColorsFromFolder(folderUri);
      if (selectedFile) {
        await refreshWebview(selectedFile, 'Extracted colors from folder.');
      }
    } catch (error) {
      showError(error);
    }
  });

  const previewFolderDisposable = vscode.commands.registerCommand('colorTokenManager.previewFromFolder', async (folderUri?: vscode.Uri) => {
    try {
      await openFolderPreview(context, folderUri);
    } catch (error) {
      showError(error);
    }
  });

  const pickDisposable = vscode.commands.registerCommand('colorTokenManager.pickColorsFile', async () => {
    try {
      await handlePickFileAgain(context);
    } catch (error) {
      showError(error);
    }
  });

  const refreshDisposable = vscode.commands.registerCommand('colorTokenManager.refresh', async () => {
    try {
      if (!selectedFile) {
        const fileUri = await getConfiguredColorsFile();
        if (fileUri) {
          selectedFile = fileUri;
        }
      }

      if (selectedFile) {
        await refreshWebview(selectedFile, 'Refreshed colors.');
      }
    } catch (error) {
      showError(error);
    }
  });

  context.subscriptions.push(
    activeEditorDisposable,
    openDisposable,
    extractDisposable,
    extractFolderDisposable,
    previewFolderDisposable,
    pickDisposable,
    refreshDisposable
  );
}

export function deactivate(): void {
  watcher?.dispose();
}

async function openColorManager(context: vscode.ExtensionContext, fileUri: vscode.Uri): Promise<void> {
  const colors = await readColors(fileUri);

  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
  } else {
    panel = vscode.window.createWebviewPanel(
      'colorTokenManager',
      'Color Token Manager',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [context.extensionUri]
      }
    );

    panel.onDidDispose(() => {
      panel = undefined;
      watcher?.dispose();
      watcher = undefined;
    }, undefined, context.subscriptions);

    panel.webview.onDidReceiveMessage((message) => {
      void handleWebviewMessage(message);
    }, undefined, context.subscriptions);
  }

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri, fileUri, colors);
  setupWatcher(fileUri);
}

async function handleWebviewMessage(message: { type?: string; key?: string; value?: string }): Promise<void> {
  if (!selectedFile || !panel) {
    return;
  }

  try {
    switch (message.type) {
      case 'updateColor':
        await handleUpdateColor(selectedFile, message.key, message.value);
        break;
      case 'copyColor':
        await handleCopyColor(message.value);
        break;
      case 'refresh':
        await refreshWebview(selectedFile, 'Refreshed colors.');
        break;
      case 'pickFileAgain':
        await handlePickFileAgain();
        break;
      case 'extractFromCurrentFile':
        await extractColorsFromCurrentFile(lastExtractionTarget);
        await refreshWebview(selectedFile, 'Extracted colors from current file.');
        break;
      case 'extractFromFolder':
        await extractColorsFromFolder();
        await refreshWebview(selectedFile, 'Extracted colors from folder.');
        break;
      case 'previewFromFolder':
        await openFolderPreview();
        break;
      default:
        break;
    }
  } catch (error) {
    showError(error);
    postStatus(error instanceof Error ? error.message : 'Something went wrong.');
  }
}

async function openFolderPreview(context?: vscode.ExtensionContext, folderUri?: vscode.Uri): Promise<void> {
  const preview = await previewColorsFromFolder(folderUri);
  if (!preview) {
    return;
  }

  lastFolderPreview = preview;

  if (previewPanel) {
    previewPanel.reveal(vscode.ViewColumn.One);
  } else {
    previewPanel = vscode.window.createWebviewPanel(
      'colorTokenManagerPreview',
      'Color Extraction Preview',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: context ? [context.extensionUri] : []
      }
    );

    previewPanel.onDidDispose(() => {
      previewPanel = undefined;
    });

    previewPanel.webview.onDidReceiveMessage((message: {
      type?: string;
      previewId?: string;
      preview?: FolderExtractionPreview;
      fileUri?: string;
      start?: number;
      line?: number;
    }) => {
      void handlePreviewMessage(message);
    });
  }

  previewPanel.webview.html = getPreviewWebviewHtml(preview);
}

async function handlePreviewMessage(message: {
  type?: string;
  previewId?: string;
  preview?: FolderExtractionPreview;
  fileUri?: string;
  start?: number;
  line?: number;
}): Promise<void> {
  try {
    if (message.type === 'openPreviewOccurrence') {
      await openPreviewOccurrence(message);
      return;
    }

    if (message.type !== 'applyPreview' || !lastFolderPreview || message.previewId !== lastFolderPreview.id) {
      return;
    }

    const result = await applyFolderExtractionPreview(message.preview ?? lastFolderPreview);
    vscode.window.showInformationMessage('Applied color extraction preview.');

    if (result) {
      openResultsPanel(result);
    }

    if (selectedFile) {
      await refreshWebview(selectedFile, 'Applied folder extraction preview.');
    }
  } catch (error) {
    showError(error);
  }
}

function openResultsPanel(result: FolderApplyResult): void {
  if (resultsPanel) {
    resultsPanel.reveal(vscode.ViewColumn.One);
  } else {
    resultsPanel = vscode.window.createWebviewPanel(
      'colorTokenManagerResults',
      'Color Extraction Results',
      vscode.ViewColumn.One,
      {
        enableScripts: true
      }
    );

    resultsPanel.onDidDispose(() => {
      resultsPanel = undefined;
    });

    resultsPanel.webview.onDidReceiveMessage((message: { type?: string; fileUri?: string; line?: number }) => {
      void handleResultsMessage(message);
    });
  }

  resultsPanel.webview.html = getResultsWebviewHtml(result);
}

async function handleResultsMessage(message: { type?: string; fileUri?: string; line?: number }): Promise<void> {
  try {
    if (message.type === 'openResultOccurrence') {
      await openPreviewOccurrence(message);
    }
  } catch (error) {
    showError(error);
  }
}

async function openPreviewOccurrence(message: { fileUri?: string; start?: number; line?: number }): Promise<void> {
  if (!message.fileUri) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(message.fileUri));
  const position = typeof message.start === 'number'
    ? document.positionAt(message.start)
    : new vscode.Position(Math.max((message.line ?? 1) - 1, 0), 0);
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
  const range = new vscode.Range(position, position.translate(0, 1));
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function rememberExtractionTarget(editor: vscode.TextEditor | undefined): void {
  if (editor && isSupportedExtractionDocument(editor.document)) {
    lastExtractionTarget = editor.document.uri;
  }
}

async function handlePickFileAgain(context?: vscode.ExtensionContext): Promise<void> {
  const fileUri = await pickColorsFile();
  if (!fileUri) {
    return;
  }

  selectedFile = fileUri;

  await rememberColorsFile(fileUri);

  if (context) {
    await openColorManager(context, fileUri);
  } else if (panel) {
    await refreshWebview(fileUri, 'Selected colors.ts file changed.');
    setupWatcher(fileUri);
  }
}

async function rememberColorsFile(fileUri: vscode.Uri): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(fileUri);
  if (!folder) {
    return;
  }

  await vscode.workspace
    .getConfiguration('colorTokenManager', folder.uri)
    .update('colorsFilePath', vscode.workspace.asRelativePath(fileUri), vscode.ConfigurationTarget.Workspace);
}

async function handleUpdateColor(fileUri: vscode.Uri, key?: string, value?: string): Promise<void> {
  if (!key || value === undefined) {
    throw new Error('Missing color token or color value.');
  }

  if (!validateColorValue(value)) {
    throw new Error('Invalid color value. Use #RGB, #RRGGBB, rgb(255, 255, 255), or rgba(255, 255, 255, 0.5).');
  }

  await updateColor(fileUri, key, value);
  vscode.window.showInformationMessage(`Updated ${key}.`);
  await refreshWebview(fileUri, `Updated ${key}.`);
}

async function handleCopyColor(value?: string): Promise<void> {
  if (!value) {
    throw new Error('No color value was provided to copy.');
  }

  await vscode.env.clipboard.writeText(value);
  postStatus('Copied color value.');
}

async function refreshWebview(fileUri: vscode.Uri, status?: string): Promise<void> {
  const colors = await readColors(fileUri);
  postColors(fileUri, colors);
  if (status) {
    postStatus(status);
  }
}

function setupWatcher(fileUri: vscode.Uri): void {
  watcher?.dispose();

  const folder = vscode.workspace.getWorkspaceFolder(fileUri);
  if (!folder) {
    return;
  }

  const relativePath = path.relative(folder.uri.fsPath, fileUri.fsPath).replace(/\\/g, '/');
  watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, relativePath));

  const refresh = (changedUri: vscode.Uri) => {
    if (changedUri.toString() === fileUri.toString()) {
      void refreshWebview(fileUri, 'colors.ts changed externally.');
    }
  };

  watcher.onDidChange(refresh);
  watcher.onDidCreate(refresh);
  watcher.onDidDelete((deletedUri) => {
    if (deletedUri.toString() === fileUri.toString()) {
      postStatus('Selected colors.ts was deleted.');
      vscode.window.showWarningMessage('Selected colors.ts was deleted.');
    }
  });
}

function postColors(fileUri: vscode.Uri, colors: AppColor[]): void {
  void panel?.webview.postMessage({
    type: 'setColors',
    payload: {
      filePath: fileUri.fsPath,
      colors
    }
  });
}

function postStatus(message: string): void {
  void panel?.webview.postMessage({
    type: 'status',
    message
  });
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(message);
}
