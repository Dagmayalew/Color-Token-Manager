import * as path from 'path';
import * as vscode from 'vscode';

/** URI used to pick the workspace root and scoped settings (multi-root safe). */
export function getContextUri(preferredUri?: vscode.Uri): vscode.Uri | undefined {
  if (preferredUri?.scheme === 'file') {
    return preferredUri;
  }

  const active = vscode.window.activeTextEditor?.document.uri;
  if (active?.scheme === 'file') {
    return active;
  }

  const visible = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.scheme === 'file',
  );
  return visible?.document.uri;
}

export function resolveWorkspaceFolder(
  contextUri?: vscode.Uri,
): vscode.WorkspaceFolder | undefined {
  const uri = getContextUri(contextUri);
  if (uri) {
    return vscode.workspace.getWorkspaceFolder(uri);
  }

  return vscode.workspace.workspaceFolders?.[0];
}

/** Join a configured relative path to a workspace folder (testable without VS Code). */
export function resolveRelativeConfiguredPath(
  workspaceFolderPath: string,
  configuredPath: string,
): string {
  const trimmed = configuredPath.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  return path.join(workspaceFolderPath, trimmed);
}

export function resolveConfiguredFileUri(
  configuredPath: string,
  contextUri?: vscode.Uri,
): vscode.Uri {
  const trimmed = configuredPath.trim();
  if (path.isAbsolute(trimmed)) {
    return vscode.Uri.file(trimmed);
  }

  const workspaceFolder = resolveWorkspaceFolder(contextUri);
  if (!workspaceFolder) {
    throw new Error('Open a workspace before using Color Token Manager.');
  }

  return vscode.Uri.file(resolveRelativeConfiguredPath(workspaceFolder.uri.fsPath, trimmed));
}

export function getDefaultDialogUri(contextUri?: vscode.Uri): vscode.Uri | undefined {
  return resolveWorkspaceFolder(contextUri)?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
}
