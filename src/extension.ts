import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  applyFolderExtractionPreview,
  extractColorsFromCurrentFile,
  extractColorsFromFolder,
  extractHardcodedColorsFromText,
  isSupportedExtractionDocument,
  previewColorsFromCurrentFile,
  previewColorsFromFolder,
  previewColorsFromSelection,
  type SelectionPreviewTarget,
} from './colorExtractor';
import {
  getConfiguredColorsFile,
  getKnownColorsFile,
  pickColorsFile,
  readColors,
  updateColor,
  validateColorValue,
} from './colorFile';
import { getTokenReferencePrefix, warnDeprecatedImportStyleIfNeeded } from './importUtils';
import { buildThemeAwarePlans } from './tokenNaming';
import { registerColorDiagnostics } from './diagnostics';
import {
  ColorTokenMcpServer,
  createMcpStatusBarItem,
  getAiAgentChoices,
  getMcpClientConfig,
  getMcpClientSetupSnippet,
  upsertCodexMcpConfigToml,
} from './mcpServer';
import { getPreviewWebviewHtml } from './previewWebview';
import { getResultsWebviewHtml } from './resultsWebview';
import { runSetupWizard } from './setup';
import { findTokenFiles } from './tokenDetection';
import { buildThemeAuditMarkdown, buildThemeAuditReport } from './themeAudit';
import { exportDesignTokens, renameTokenAcrossProject, showUnusedTokens } from './tokenTools';
import {
  type AppColor,
  type FolderApplyResult,
  type FolderExtractionPreview,
  type ThemeAwareColorPlan,
} from './types';
import { getWebviewHtml } from './webview';

let panel: vscode.WebviewPanel | undefined;
let previewPanel: vscode.WebviewPanel | undefined;
let resultsPanel: vscode.WebviewPanel | undefined;
let selectedFile: vscode.Uri | undefined;
let lastExtractionTarget: vscode.Uri | undefined;
let lastSelectionTarget: SelectionPreviewTarget | undefined;
let lastFolderPreview: FolderExtractionPreview | undefined;
let watcher: vscode.FileSystemWatcher | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let mcpStatusBarItem: vscode.StatusBarItem | undefined;
let mcpServer: ColorTokenMcpServer | undefined;
let mcpOutput: vscode.OutputChannel | undefined;
let extensionRootPath: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
  extensionRootPath = context.extensionUri.fsPath;
  warnDeprecatedImportStyleIfNeeded(context);
  registerColorDiagnostics(context);
  rememberExtractionTarget(vscode.window.activeTextEditor);
  rememberSelectionTarget(vscode.window.activeTextEditor);

  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    rememberExtractionTarget(editor);
    void updateStatusBar();
  });
  const selectionDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
    rememberSelectionTarget(event.textEditor);
  });

  const openDisposable = vscode.commands.registerCommand('colorTokenManager.open', async () => {
    try {
      const fileUri = await getColorsFileOrSetup(
        context,
        vscode.window.activeTextEditor?.document.uri,
      );
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

  const extractDisposable = vscode.commands.registerCommand(
    'colorTokenManager.extractFromCurrentFile',
    async () => {
      try {
        await extractColorsFromCurrentFile(lastExtractionTarget);
        if (selectedFile) {
          await refreshWebview(selectedFile, 'Extracted colors from current file.');
        }
      } catch (error) {
        showError(error);
      }
    },
  );

  const previewCurrentFileDisposable = vscode.commands.registerCommand(
    'colorTokenManager.previewFromCurrentFile',
    async () => {
      try {
        await openCurrentFilePreview(context);
      } catch (error) {
        showError(error);
      }
    },
  );

  const setupDisposable = vscode.commands.registerCommand('colorTokenManager.setup', async () => {
    try {
      await handleSetup(context);
    } catch (error) {
      showError(error);
    }
  });

  const extractFolderDisposable = vscode.commands.registerCommand(
    'colorTokenManager.extractFromFolder',
    async (folderUri?: vscode.Uri) => {
      try {
        await extractColorsFromFolder(folderUri);
        if (selectedFile) {
          await refreshWebview(selectedFile, 'Extracted colors from folder.');
        }
      } catch (error) {
        showError(error);
      }
    },
  );

  const previewFolderDisposable = vscode.commands.registerCommand(
    'colorTokenManager.previewFromFolder',
    async (folderUri?: vscode.Uri) => {
      try {
        await openFolderPreview(context, folderUri);
      } catch (error) {
        showError(error);
      }
    },
  );

  const previewSelectionDisposable = vscode.commands.registerCommand(
    'colorTokenManager.previewFromSelection',
    async () => {
      try {
        await openSelectionPreview(context);
      } catch (error) {
        showError(error);
      }
    },
  );

  const previewColorAtRangeDisposable = vscode.commands.registerCommand(
    'colorTokenManager.previewColorAtRange',
    async (target: SelectionPreviewTarget) => {
      try {
        await openSelectionPreview(context, target);
      } catch (error) {
        showError(error);
      }
    },
  );

  const renameTokenDisposable = vscode.commands.registerCommand(
    'colorTokenManager.renameToken',
    async () => {
      try {
        await renameTokenAcrossProject();
        if (selectedFile) {
          await refreshWebview(selectedFile, 'Renamed token across project.');
        }
      } catch (error) {
        showError(error);
      }
    },
  );

  const unusedTokensDisposable = vscode.commands.registerCommand(
    'colorTokenManager.findUnusedTokens',
    async () => {
      try {
        await showUnusedTokens();
      } catch (error) {
        showError(error);
      }
    },
  );

  const auditDesignTokensDisposable = vscode.commands.registerCommand(
    'colorTokenManager.auditDesignTokens',
    async () => {
      try {
        await showThemeAudit('all');
      } catch (error) {
        showError(error);
      }
    },
  );

  const auditContrastDisposable = vscode.commands.registerCommand(
    'colorTokenManager.auditContrast',
    async () => {
      try {
        await showThemeAudit('contrast');
      } catch (error) {
        showError(error);
      }
    },
  );

  const exportTokensDisposable = vscode.commands.registerCommand(
    'colorTokenManager.exportTokens',
    async () => {
      try {
        await exportDesignTokens();
      } catch (error) {
        showError(error);
      }
    },
  );

  const pickDisposable = vscode.commands.registerCommand(
    'colorTokenManager.pickColorsFile',
    async () => {
      try {
        await handlePickFileAgain(context);
      } catch (error) {
        showError(error);
      }
    },
  );

  const refreshDisposable = vscode.commands.registerCommand(
    'colorTokenManager.refresh',
    async () => {
      try {
        if (!selectedFile) {
          const fileUri = await getConfiguredColorsFile(
            vscode.window.activeTextEditor?.document.uri,
          );
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
    },
  );

  const startMcpDisposable = vscode.commands.registerCommand(
    'colorTokenManager.startMcpServer',
    () => {
      try {
        startMcpServer();
      } catch (error) {
        showError(error);
      }
    },
  );

  const copyMcpConfigDisposable = vscode.commands.registerCommand(
    'colorTokenManager.copyMcpClientConfig',
    async () => {
      try {
        await copyMcpClientConfig();
      } catch (error) {
        showError(error);
      }
    },
  );

  const connectAiAgentDisposable = vscode.commands.registerCommand(
    'colorTokenManager.connectAiAgent',
    async () => {
      try {
        await connectAiAgent();
      } catch (error) {
        showError(error);
      }
    },
  );

  const installCursorMcpConfigDisposable = vscode.commands.registerCommand(
    'colorTokenManager.installCursorMcpConfig',
    async () => {
      try {
        await installCursorMcpConfig();
      } catch (error) {
        showError(error);
      }
    },
  );

  const testMcpServerDisposable = vscode.commands.registerCommand(
    'colorTokenManager.testMcpServer',
    async () => {
      try {
        await testMcpServer();
      } catch (error) {
        showError(error);
      }
    },
  );

  const showMcpOutputDisposable = vscode.commands.registerCommand(
    'colorTokenManager.showMcpOutput',
    () => {
      try {
        showMcpOutput();
      } catch (error) {
        showError(error);
      }
    },
  );

  const detectSetupDisposable = vscode.commands.registerCommand(
    'colorTokenManager.detectSetup',
    async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('Open a workspace first.');
          return;
        }

        const candidates = await findTokenFiles(workspaceFolder);
        if (!candidates.length) {
          vscode.window.showInformationMessage(
            'No token/theme files detected. Use "Set Up Color Token Manager" to create one.',
          );
          return;
        }

        const items = candidates.map((c) => ({
          label: `$(file-code) ${c.filePath}`,
          description: `${c.kind} · confidence ${c.confidence}`,
          detail: c.reason,
          candidate: c,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          title: 'Detected Token/Theme Files',
          placeHolder: 'Select a file to use as your token file',
        });
        if (!selected) {
          return;
        }

        const config = vscode.workspace.getConfiguration('colorTokenManager', workspaceFolder.uri);
        await config.update(
          'tokenFile',
          selected.candidate.filePath,
          vscode.ConfigurationTarget.Workspace,
        );
        await config.update(
          'tokenExportName',
          selected.candidate.exportNames[0] ?? 'auto',
          vscode.ConfigurationTarget.Workspace,
        );
        await config.update(
          'tokenFileKind',
          selected.candidate.kind,
          vscode.ConfigurationTarget.Workspace,
        );
        vscode.window.showInformationMessage(`Token file set to ${selected.candidate.filePath}.`);
        await updateStatusBar();
      } catch (error) {
        showError(error);
      }
    },
  );

  const resetSetupDisposable = vscode.commands.registerCommand(
    'colorTokenManager.resetSetup',
    async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('Open a workspace first.');
          return;
        }

        const action = await vscode.window.showWarningMessage(
          'Reset Color Token Manager setup? This clears all token file settings from workspace configuration.',
          { modal: true },
          'Reset',
        );
        if (action !== 'Reset') {
          return;
        }

        const config = vscode.workspace.getConfiguration('colorTokenManager', workspaceFolder.uri);
        const keysToReset = [
          'tokenFile',
          'tokenFilePath',
          'colorsFilePath',
          'tokenExportName',
          'tokenObject',
          'referencePrefix',
          'tokenFileKind',
          'tokenPathMode',
        ];
        for (const key of keysToReset) {
          await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
        }

        selectedFile = undefined;
        watcher?.dispose();
        watcher = undefined;
        await updateStatusBar();
        vscode.window.showInformationMessage('Color Token Manager setup has been reset.');
      } catch (error) {
        showError(error);
      }
    },
  );

  context.subscriptions.push(
    activeEditorDisposable,
    selectionDisposable,
    openDisposable,
    extractDisposable,
    extractFolderDisposable,
    previewCurrentFileDisposable,
    previewFolderDisposable,
    previewSelectionDisposable,
    previewColorAtRangeDisposable,
    renameTokenDisposable,
    unusedTokensDisposable,
    auditDesignTokensDisposable,
    auditContrastDisposable,
    exportTokensDisposable,
    setupDisposable,
    pickDisposable,
    refreshDisposable,
    startMcpDisposable,
    copyMcpConfigDisposable,
    connectAiAgentDisposable,
    installCursorMcpConfigDisposable,
    testMcpServerDisposable,
    showMcpOutputDisposable,
    detectSetupDisposable,
    resetSetupDisposable,
  );

  setupStatusBar(context);
  setupMcpStatusBar(context);
  startMcpServer();
  void updateStatusBar();
}

export function deactivate(): void {
  watcher?.dispose();
  mcpServer?.dispose();
  mcpOutput?.dispose();
}

async function openColorManager(
  context: vscode.ExtensionContext,
  fileUri: vscode.Uri,
): Promise<void> {
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
        localResourceRoots: [context.extensionUri],
      },
    );

    panel.onDidDispose(
      () => {
        panel = undefined;
        watcher?.dispose();
        watcher = undefined;
      },
      undefined,
      context.subscriptions,
    );

    panel.webview.onDidReceiveMessage(
      (message) => {
        void handleWebviewMessage(message);
      },
      undefined,
      context.subscriptions,
    );
  }

  // Build theme-aware plans from the active editor's hardcoded colors
  let colorPlans: ThemeAwareColorPlan[] = [];
  try {
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc && isSupportedExtractionDocument(activeDoc)) {
      const { getAdapterForDocument } = await import('./languages/registry');
      const adapter = getAdapterForDocument(activeDoc);
      const text = activeDoc.getText();
      const extracted = extractHardcodedColorsFromText(text, {}, adapter);
      const prefix = getTokenReferencePrefix();
      colorPlans = buildThemeAwarePlans(
        extracted,
        text,
        activeDoc.uri.fsPath,
        fileUri.fsPath,
        prefix,
      );
    }
  } catch {
    // Non-fatal: proceed without detected colors
  }

  panel.webview.html = getWebviewHtml(
    panel.webview,
    context.extensionUri,
    fileUri,
    colors,
    colorPlans,
  );
  setupWatcher(fileUri);
}

async function handleWebviewMessage(message: {
  type?: string;
  key?: string;
  value?: string;
}): Promise<void> {
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
      case 'previewFromCurrentFile':
        await openCurrentFilePreview();
        break;
      case 'previewFromFolder':
        await openFolderPreview();
        break;
      case 'previewFromSelection':
        await openSelectionPreview();
        break;
      case 'renameToken':
        await renameTokenAcrossProject();
        await refreshWebview(selectedFile, 'Renamed token across project.');
        break;
      case 'findUnusedTokens':
        await showUnusedTokens();
        break;
      case 'auditDesignTokens':
        await showThemeAudit('all');
        break;
      case 'auditContrast':
        await showThemeAudit('contrast');
        break;
      case 'exportTokens':
        await exportDesignTokens();
        break;
      case 'startMcpServer':
        startMcpServer();
        postStatus('Color MCP server is running.');
        break;
      case 'copyMcpClientConfig':
        await copyMcpClientConfig();
        postStatus('Copied MCP setup snippets.');
        break;
      case 'connectAiAgent':
        await connectAiAgent();
        postStatus('Connected AI agent setup is ready.');
        break;
      case 'installCursorMcpConfig':
        await installCursorMcpConfig();
        postStatus('Installed Cursor MCP config.');
        break;
      case 'testMcpServer':
        await testMcpServer();
        postStatus('MCP test completed.');
        break;
      case 'showMcpOutput':
        showMcpOutput();
        break;
      case 'detectSetup':
        await vscode.commands.executeCommand('colorTokenManager.detectSetup');
        return;
      default:
        break;
    }
  } catch (error) {
    showError(error);
    postStatus(error instanceof Error ? error.message : 'Something went wrong.');
  }
}

async function getColorsFileOrSetup(
  context: vscode.ExtensionContext,
  contextUri?: vscode.Uri,
): Promise<vscode.Uri | undefined> {
  try {
    const fileUri = await getConfiguredColorsFile(contextUri);
    if (fileUri) {
      return fileUri;
    }
  } catch (error) {
    const action = await vscode.window.showWarningMessage(
      error instanceof Error ? error.message : String(error),
      'Run Setup',
    );
    if (action !== 'Run Setup') {
      return undefined;
    }
  }

  return handleSetup(context, contextUri, false);
}

async function handleSetup(
  context: vscode.ExtensionContext,
  contextUri = vscode.window.activeTextEditor?.document.uri,
  showNextAction = true,
): Promise<vscode.Uri | undefined> {
  const fileUri = await runSetupWizard(contextUri);
  if (!fileUri) {
    return undefined;
  }

  selectedFile = fileUri;
  setupWatcher(fileUri);
  await updateStatusBar();

  if (showNextAction) {
    const action = await vscode.window.showInformationMessage(
      'Color Token Manager is ready.',
      'Open Manager',
      'Preview Current File',
    );

    if (action === 'Open Manager') {
      await openColorManager(context, fileUri);
    }

    if (action === 'Preview Current File') {
      await openCurrentFilePreview(context);
    }
  }

  return fileUri;
}

async function openSelectionPreview(
  context?: vscode.ExtensionContext,
  target?: SelectionPreviewTarget,
): Promise<void> {
  const preview = await previewColorsFromSelection(target ?? lastSelectionTarget);
  if (!preview) {
    return;
  }

  await openPreviewPanel(preview, context);
}

async function openFolderPreview(
  context?: vscode.ExtensionContext,
  folderUri?: vscode.Uri,
): Promise<void> {
  const preview = await previewColorsFromFolder(folderUri);
  if (!preview) {
    return;
  }

  await openPreviewPanel(preview, context);
}

async function openCurrentFilePreview(context?: vscode.ExtensionContext): Promise<void> {
  const preview = await previewColorsFromCurrentFile(lastExtractionTarget);
  if (!preview) {
    return;
  }

  await openPreviewPanel(preview, context);
}

async function openPreviewPanel(
  preview: FolderExtractionPreview,
  context?: vscode.ExtensionContext,
): Promise<void> {
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
        localResourceRoots: context ? [context.extensionUri] : [],
      },
    );

    previewPanel.onDidDispose(() => {
      previewPanel = undefined;
    });

    previewPanel.webview.onDidReceiveMessage(
      (message: {
        type?: string;
        previewId?: string;
        preview?: FolderExtractionPreview;
        fileUri?: string;
        start?: number;
        line?: number;
      }) => {
        void handlePreviewMessage(message);
      },
    );
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

    if (
      message.type !== 'applyPreview' ||
      !lastFolderPreview ||
      message.previewId !== lastFolderPreview.id
    ) {
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
        enableScripts: true,
      },
    );

    resultsPanel.onDidDispose(() => {
      resultsPanel = undefined;
    });

    resultsPanel.webview.onDidReceiveMessage(
      (message: { type?: string; fileUri?: string; line?: number }) => {
        void handleResultsMessage(message);
      },
    );
  }

  resultsPanel.webview.html = getResultsWebviewHtml(result);
}

async function handleResultsMessage(message: {
  type?: string;
  fileUri?: string;
  line?: number;
}): Promise<void> {
  try {
    if (message.type === 'openResultOccurrence') {
      await openPreviewOccurrence(message);
    }
  } catch (error) {
    showError(error);
  }
}

async function openPreviewOccurrence(message: {
  fileUri?: string;
  start?: number;
  line?: number;
}): Promise<void> {
  if (!message.fileUri) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(message.fileUri));
  const position =
    typeof message.start === 'number'
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

function rememberSelectionTarget(editor: vscode.TextEditor | undefined): void {
  if (!editor || !isSupportedExtractionDocument(editor.document) || editor.selection.isEmpty) {
    return;
  }

  lastSelectionTarget = {
    uri: editor.document.uri,
    start: editor.document.offsetAt(editor.selection.start),
    end: editor.document.offsetAt(editor.selection.end),
  };
}

async function handlePickFileAgain(context?: vscode.ExtensionContext): Promise<void> {
  const fileUri = await pickColorsFile();
  if (!fileUri) {
    return;
  }

  selectedFile = fileUri;

  await rememberColorsFile(fileUri);
  await updateStatusBar();

  if (context) {
    await openColorManager(context, fileUri);
  } else if (panel) {
    await refreshWebview(fileUri, 'Selected colors.ts file changed.');
    setupWatcher(fileUri);
  }
}

function setupStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.name = 'Color Token Manager';
  statusBarItem.command = 'colorTokenManager.open';
  context.subscriptions.push(statusBarItem);
}

function setupMcpStatusBar(context: vscode.ExtensionContext): void {
  mcpStatusBarItem = createMcpStatusBarItem();
  context.subscriptions.push(mcpStatusBarItem);
}

function startMcpServer(): void {
  mcpOutput ??= vscode.window.createOutputChannel('Color Token Manager MCP');

  if (!mcpServer) {
    mcpServer = new ColorTokenMcpServer(mcpOutput);
  }

  mcpServer.start();
  mcpStatusBarItem?.show();
}

async function copyMcpClientConfig(): Promise<void> {
  const configContext = await getMcpConfigContext();
  const nodeCommand = await resolveNodeCommand();
  await vscode.env.clipboard.writeText(
    getMcpClientSetupSnippet(
      configContext.workspacePath,
      configContext.serverPath,
      configContext.colorsFilePath,
      nodeCommand,
      configContext.tokenExportName,
    ),
  );
  vscode.window.showInformationMessage('Copied Color Token Manager MCP setup snippets.');
}

async function connectAiAgent(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    getAiAgentChoices().map((choice) => ({
      label: choice.label,
      description: choice.description,
      agent: choice.id,
    })),
    {
      title: 'Connect AI Agent',
      placeHolder: 'Choose the AI client you want to connect to Color Token Manager',
    },
  );
  if (!picked) {
    return;
  }

  switch (picked.agent) {
    case 'cursor':
      await installCursorMcpConfig();
      await showAgentConnectedMessage('Cursor');
      return;
    case 'claude-code':
      await installClaudeCodeMcpConfig();
      await showAgentConnectedMessage('Claude Code');
      return;
    case 'windsurf':
      await installWindsurfMcpConfig();
      await showAgentConnectedMessage('Windsurf');
      return;
    case 'codex':
      await installCodexMcpConfig();
      await showAgentConnectedMessage('Codex');
      return;
    case 'gemini':
      await installGeminiMcpConfig();
      await showAgentConnectedMessage('Gemini CLI');
      return;
    case 'custom':
      await copyMcpClientConfig();
      void vscode.window.showInformationMessage(
        'Copied a standard MCP config. Paste it into your client’s MCP settings, then restart the client.',
      );
      return;
    default:
      return assertNever(picked.agent);
  }
}

async function installCursorMcpConfig(): Promise<void> {
  const configContext = await getMcpConfigContext();
  const cursorDir = vscode.Uri.joinPath(configContext.workspaceFolder.uri, '.cursor');
  const configUri = vscode.Uri.joinPath(cursorDir, 'mcp.json');
  await installMcpConfigFile('Cursor', configUri, configContext);
}

async function installClaudeCodeMcpConfig(): Promise<void> {
  const configContext = await getMcpConfigContext();
  const configUri = vscode.Uri.joinPath(configContext.workspaceFolder.uri, '.mcp.json');
  await installMcpConfigFile('Claude Code', configUri, configContext);
}

async function installWindsurfMcpConfig(): Promise<void> {
  const configContext = await getMcpConfigContext();
  const windsurfDir = vscode.Uri.file(path.join(os.homedir(), '.codeium', 'windsurf'));
  const configUri = vscode.Uri.joinPath(windsurfDir, 'mcp_config.json');
  await installMcpConfigFile('Windsurf', configUri, configContext, {
    isGlobal: true,
    directoryUri: windsurfDir,
  });
}

async function installGeminiMcpConfig(): Promise<void> {
  const configContext = await getMcpConfigContext();
  const geminiDir = vscode.Uri.file(path.join(os.homedir(), '.gemini'));
  const configUri = vscode.Uri.joinPath(geminiDir, 'settings.json');
  await installMcpConfigFile('Gemini CLI', configUri, configContext, {
    isGlobal: true,
    directoryUri: geminiDir,
  });
}

async function installCodexMcpConfig(): Promise<void> {
  const configContext = await getMcpConfigContext();
  const nodeCommand = await resolveNodeCommand();
  const codexDir = vscode.Uri.file(path.join(os.homedir(), '.codex'));
  const configUri = vscode.Uri.joinPath(codexDir, 'config.toml');
  const action = await vscode.window.showInformationMessage(
    `Install Color Token Manager MCP in ${configUri.fsPath} for Codex?`,
    { modal: true },
    'Install',
  );
  if (action !== 'Install') {
    return;
  }

  const existing = await readTextIfExists(configUri);
  const next = upsertCodexMcpConfigToml(
    existing,
    configContext.workspacePath,
    configContext.serverPath,
    configContext.colorsFilePath,
    nodeCommand,
    configContext.tokenExportName,
  );

  await vscode.workspace.fs.createDirectory(codexDir);
  await vscode.workspace.fs.writeFile(configUri, Buffer.from(next, 'utf8'));
}

async function installMcpConfigFile(
  clientName: string,
  configUri: vscode.Uri,
  configContext: {
    workspaceFolder: vscode.WorkspaceFolder;
    workspacePath: string;
    serverPath: string | undefined;
    colorsFilePath: string;
    tokenExportName: string;
  },
  options?: {
    isGlobal?: boolean;
    directoryUri?: vscode.Uri;
  },
): Promise<void> {
  const nodeCommand = await resolveNodeCommand();
  const targetLabel = options?.isGlobal
    ? configUri.fsPath
    : vscode.workspace.asRelativePath(configUri);
  const action = await vscode.window.showInformationMessage(
    `Install Color Token Manager MCP in ${targetLabel} for ${clientName}?`,
    { modal: true },
    'Install',
  );
  if (action !== 'Install') {
    return;
  }

  const existing = await readJsonObjectIfExists(configUri);
  const next = {
    ...existing,
    mcpServers: {
      ...asJsonObject(existing.mcpServers),
      ...getMcpClientConfig(
        configContext.workspacePath,
        configContext.serverPath,
        configContext.colorsFilePath,
        nodeCommand,
        configContext.tokenExportName,
      ).mcpServers,
    },
  };

  const parentDir = options?.directoryUri ?? vscode.Uri.file(path.dirname(configUri.fsPath));
  await vscode.workspace.fs.createDirectory(parentDir);
  await vscode.workspace.fs.writeFile(
    configUri,
    Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8'),
  );
}

async function showAgentConnectedMessage(clientName: string): Promise<void> {
  void vscode.window.showInformationMessage(
    `${clientName} is configured for Color Token Manager. Reloading this window now. After VS Code reloads, restart ${clientName} and ask it to read colors://help.`,
  );
  await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

async function getMcpConfigContext(): Promise<{
  workspaceFolder: vscode.WorkspaceFolder;
  workspacePath: string;
  serverPath: string | undefined;
  colorsFilePath: string;
  tokenExportName: string;
}> {
  const contextUri = vscode.window.activeTextEditor?.document.uri;
  const colorsFileUri = await getKnownColorsFile(contextUri);
  const workspaceFolder =
    (colorsFileUri && vscode.workspace.getWorkspaceFolder(colorsFileUri)) ??
    (contextUri && vscode.workspace.getWorkspaceFolder(contextUri)) ??
    vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('Open a workspace before configuring Color Token Manager MCP.');
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const colorsFilePath = colorsFileUri
    ? path.relative(workspaceFolder.uri.fsPath, colorsFileUri.fsPath).replace(/\\/g, '/')
    : 'colors.ts';
  const tokenExportName = vscode.workspace
    .getConfiguration('colorTokenManager', workspaceFolder.uri)
    .get<string>('tokenExportName', 'auto')
    .trim();
  const serverPath = extensionRootPath
    ? path.join(extensionRootPath, 'dist', 'mcp-server.js')
    : undefined;

  return {
    workspaceFolder,
    workspacePath,
    serverPath,
    colorsFilePath,
    tokenExportName: tokenExportName || 'auto',
  };
}

function showMcpOutput(): void {
  startMcpServer();
  mcpOutput?.show();
}

async function showThemeAudit(focus: 'all' | 'contrast'): Promise<void> {
  const colorsFileUri = await getConfiguredColorsFile(vscode.window.activeTextEditor?.document.uri);
  if (!colorsFileUri) {
    return;
  }

  const report = await buildThemeAuditReport(colorsFileUri);
  const content = buildThemeAuditMarkdown(report, focus);
  const document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
  await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
}

async function testMcpServer(): Promise<void> {
  const configContext = await getMcpConfigContext();
  if (!configContext.serverPath) {
    throw new Error('Could not resolve dist/mcp-server.js for this extension.');
  }

  const result = await runStandaloneMcpProbe(configContext.serverPath, [
    '--workspace',
    configContext.workspacePath,
    '--colors-file',
    configContext.colorsFilePath,
  ]);

  const tokenCount = Object.keys(result.flatTokens).length;
  const summary = `MCP ready. Found ${tokenCount} tokens from ${result.help.colorsFile}.`;
  mcpOutput?.appendLine(summary);
  mcpOutput?.appendLine(`Workspace: ${result.help.workspace}`);
  vscode.window.showInformationMessage(summary);
}

async function runStandaloneMcpProbe(
  serverPath: string,
  args: string[],
): Promise<{
  help: { workspace?: string; colorsFile?: string };
  flatTokens: Record<string, string>;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [serverPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = Buffer.alloc(0);
    let stderr = '';
    let settled = false;
    let nextId = 1;
    const pending = new Map<
      number,
      { resolve: (value: unknown) => void; reject: (error: Error) => void }
    >();

    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
      child.kill();
    };

    const fail = (error: Error): void => {
      finish(() => {
        for (const entry of pending.values()) {
          entry.reject(error);
        }
        reject(error);
      });
    };

    child.stdout.on('data', (chunk: Buffer | string) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);

      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          return;
        }

        const header = buffer.slice(0, headerEnd).toString('utf8');
        const lengthMatch = header.match(/content-length:\s*(\d+)/i);
        if (!lengthMatch) {
          fail(new Error('Invalid MCP frame from standalone server.'));
          return;
        }

        const length = Number(lengthMatch[1]);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + length;
        if (buffer.length < bodyEnd) {
          return;
        }

        const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
        buffer = buffer.slice(bodyEnd);

        const message = JSON.parse(body) as {
          id?: number;
          result?: unknown;
          error?: { message?: string };
        };
        if (typeof message.id !== 'number') {
          continue;
        }

        const entry = pending.get(message.id);
        if (!entry) {
          continue;
        }
        pending.delete(message.id);

        if (message.error) {
          entry.reject(new Error(message.error.message || 'Unknown MCP server error.'));
        } else {
          entry.resolve(message.result);
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += Buffer.from(chunk).toString('utf8');
    });

    child.once('error', (error) => fail(error));
    child.once('exit', (code) => {
      if (settled) {
        return;
      }
      if (code === 0) {
        fail(new Error('Standalone MCP server exited before the probe finished.'));
      } else {
        fail(
          new Error(
            stderr.trim() || `Standalone MCP server exited with code ${String(code ?? 'unknown')}.`,
          ),
        );
      }
    });

    const send = (method: string, params?: unknown): Promise<unknown> => {
      const id = nextId++;
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        ...(params === undefined ? {} : { params }),
      });

      child.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);

      return new Promise((resolveCall, rejectCall) => {
        pending.set(id, { resolve: resolveCall, reject: rejectCall });
      });
    };

    void (async () => {
      try {
        await send('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'color-token-manager', version: '0.2.1' },
        });

        const helpResult = (await send('resources/read', { uri: 'colors://help' })) as {
          contents?: Array<{ text?: string }>;
        };
        const flatResult = (await send('resources/read', { uri: 'colors://tokens/flat' })) as {
          contents?: Array<{ text?: string }>;
        };

        const helpText = helpResult.contents?.[0]?.text;
        const flatText = flatResult.contents?.[0]?.text;
        if (!helpText || !flatText) {
          throw new Error('Standalone MCP server returned an incomplete probe response.');
        }

        finish(() =>
          resolve({
            help: JSON.parse(helpText) as { workspace?: string; colorsFile?: string },
            flatTokens: JSON.parse(flatText) as Record<string, string>,
          }),
        );
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
}

async function readJsonObjectIfExists(uri: vscode.Uri): Promise<Record<string, unknown>> {
  try {
    const text = Buffer.from(await vscode.workspace.fs.readFile(uri))
      .toString('utf8')
      .trim();
    if (!text) {
      return {};
    }

    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${vscode.workspace.asRelativePath(uri)} must contain a JSON object.`);
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && /ENOENT|not found|FileNotFound/i.test(error.message)) {
      return {};
    }
    throw error;
  }
}

async function readTextIfExists(uri: vscode.Uri): Promise<string> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch (error) {
    if (error instanceof Error && /ENOENT|not found|FileNotFound/i.test(error.message)) {
      return '';
    }
    throw error;
  }
}

async function resolveNodeCommand(): Promise<string> {
  const candidates = Array.from(
    new Set(
      [
        process.env.npm_node_execpath,
        process.env.NODE,
        process.execPath.includes('node') ? process.execPath : undefined,
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/usr/bin/node',
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return 'node';
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertNever(value: never): never {
  throw new Error(`Unsupported AI agent: ${String(value)}`);
}

async function updateStatusBar(): Promise<void> {
  if (!statusBarItem) {
    return;
  }

  const knownFile =
    selectedFile ?? (await getKnownColorsFile(vscode.window.activeTextEditor?.document.uri));
  if (knownFile) {
    selectedFile = knownFile;
  }

  statusBarItem.text = knownFile ? '$(symbol-color) Color Tokens' : '$(symbol-color) Set up Colors';
  statusBarItem.tooltip = knownFile
    ? `Open Color Token Manager\n${knownFile.fsPath}`
    : 'Set up Color Token Manager';
  statusBarItem.command = knownFile ? 'colorTokenManager.open' : 'colorTokenManager.setup';
  statusBarItem.show();
}

async function rememberColorsFile(fileUri: vscode.Uri): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(fileUri);
  if (!folder) {
    return;
  }

  await vscode.workspace
    .getConfiguration('colorTokenManager', folder.uri)
    .update(
      'colorsFilePath',
      vscode.workspace.asRelativePath(fileUri),
      vscode.ConfigurationTarget.Workspace,
    );
}

async function handleUpdateColor(fileUri: vscode.Uri, key?: string, value?: string): Promise<void> {
  if (!key || value === undefined) {
    throw new Error('Missing color token or color value.');
  }

  if (!validateColorValue(value)) {
    throw new Error('Invalid color value. Use #RGB, #RRGGBB, rgb(), rgba(), hsl(), or hsla().');
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
  watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, relativePath),
  );

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
      colors,
    },
  });
}

function postStatus(message: string): void {
  void panel?.webview.postMessage({
    type: 'status',
    message,
  });
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(message);
}
