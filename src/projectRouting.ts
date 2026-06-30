import * as vscode from 'vscode';
import { findThemeProviderFiles, findTokenFiles } from './tokenDetection';
import { getContextUri, resolveConfiguredFileUri } from './workspaceUtils';

export type ProjectWorkflow = 'colorsOnly' | 'themeOnly' | 'both';
export type ProjectFileKind = 'colors' | 'theme';

export type ActiveProjectFiles = {
  workflow: ProjectWorkflow;
  colorsFile?: vscode.Uri;
  themeFile?: vscode.Uri;
  themeProviderFile?: vscode.Uri;
};

export type ProjectSummary = ActiveProjectFiles & {
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
};

export function describeProjectFileKind(kind: ProjectFileKind): string {
  return kind === 'theme' ? 'theme file' : 'colors file';
}

export function getProjectWorkflow(contextUri?: vscode.Uri): ProjectWorkflow {
  return vscode.workspace
    .getConfiguration('colorTokenManager', contextUri)
    .get<ProjectWorkflow>('projectWorkflow', 'colorsOnly');
}

export async function resolveProjectFile(
  kind: ProjectFileKind,
  contextUri?: vscode.Uri,
): Promise<vscode.Uri | null> {
  const context = getContextUri(contextUri);
  const workflow = getProjectWorkflow(context);
  if (kind === 'colors' && workflow === 'themeOnly') {
    return resolveProjectFile('theme', context);
  }
  if (kind === 'theme' && workflow === 'colorsOnly') {
    return null;
  }
  const configuredPath = getConfiguredProjectFilePath(context, kind);
  if (configuredPath) {
    const fileUri = resolveConfiguredFileUri(configuredPath, context);
    try {
      await vscode.workspace.fs.stat(fileUri);
      return fileUri;
    } catch {
      return null;
    }
  }

  const detected = await detectProjectFile(kind, context);
  return detected ?? null;
}

export async function getActiveProjectFiles(contextUri?: vscode.Uri): Promise<ActiveProjectFiles> {
  const workflow = getProjectWorkflow(contextUri);
  const [colorsFile, themeFile, themeProviderFile] = await Promise.all([
    resolveProjectFile('colors', contextUri),
    resolveProjectFile('theme', contextUri),
    resolveThemeProviderFile(contextUri),
  ]);

  return {
    workflow,
    colorsFile: workflow === 'themeOnly' ? undefined : colorsFile ?? undefined,
    themeFile: workflow === 'colorsOnly' ? undefined : themeFile ?? undefined,
    themeProviderFile: themeProviderFile ?? undefined,
  };
}

export async function getProjectSummary(contextUri?: vscode.Uri): Promise<ProjectSummary> {
  const active = await getActiveProjectFiles(contextUri);
  const notes: string[] = [];
  if (active.themeProviderFile) {
    notes.push('ThemeProvider detected');
  }
  if (active.colorsFile && active.themeFile) {
    notes.push('Separate colors and theme files detected');
  }
  if (active.workflow === 'themeOnly') {
    notes.push('Theme is the primary editing target');
  }

  const confidence: ProjectSummary['confidence'] =
    active.colorsFile || active.themeFile ? 'high' : active.themeProviderFile ? 'medium' : 'low';

  return { ...active, confidence, notes };
}

export function getProjectProblemHint(summary: ProjectSummary): string {
  if (summary.themeProviderFile && summary.themeFile) {
    return 'I found a ThemeProvider and a theme file, so theme edits will stay semantic.';
  }
  if (summary.workflow === 'themeOnly' && summary.themeFile) {
    return 'Theme-only project detected; I will focus on the theme file.';
  }
  if (summary.colorsFile && summary.themeFile) {
    return 'Split project detected; I will keep colors and theme separate.';
  }
  if (summary.colorsFile) {
    return 'Colors file detected; I will use it as the active token source.';
  }
  if (summary.themeFile) {
    return 'Theme file detected; I will use it as the active token source.';
  }
  return 'I could not confidently infer a token file yet.';
}

export async function getNextProjectWriteTarget(
  contextUri?: vscode.Uri,
): Promise<{ kind: ProjectFileKind; uri: vscode.Uri | null }> {
  const workflow = getProjectWorkflow(contextUri);
  if (workflow === 'themeOnly') {
    return { kind: 'theme', uri: await resolveProjectFile('theme', contextUri) };
  }

  if (workflow === 'both') {
    const themeFile = await resolveProjectFile('theme', contextUri);
    if (themeFile) {
      return { kind: 'theme', uri: themeFile };
    }
  }

  return { kind: 'colors', uri: await resolveProjectFile('colors', contextUri) };
}

export async function pickProjectFile(
  kind: ProjectFileKind,
  contextUri?: vscode.Uri,
): Promise<vscode.Uri | null> {
  return resolveProjectFile(kind, contextUri);
}

function getConfiguredProjectFilePath(
  context: vscode.Uri | undefined,
  kind: ProjectFileKind,
): string {
  const configuration = vscode.workspace.getConfiguration('colorTokenManager', context);

  if (kind === 'theme') {
    const themeFile = configuration.get<string>('themeFile', '').trim();
    if (themeFile) {
      return themeFile;
    }

    const themeFilePath = configuration.get<string>('themeFilePath', '').trim();
    if (themeFilePath) {
      return themeFilePath;
    }

    const tokenFilePath = configuration.get<string>('tokenFilePath', '').trim();
    if (tokenFilePath) {
      return tokenFilePath;
    }
  }

  const colorsFile = configuration.get<string>('colorsFile', '').trim();
  if (colorsFile) {
    return colorsFile;
  }

  const tokenFile = configuration.get<string>('tokenFile', '').trim();
  if (tokenFile) {
    return tokenFile;
  }

  const tokenFilePath = configuration.get<string>('tokenFilePath', '').trim();
  if (tokenFilePath) {
    return tokenFilePath;
  }

  return configuration.get<string>('colorsFilePath', '').trim();
}

async function detectProjectFile(
  kind: ProjectFileKind,
  contextUri?: vscode.Uri,
): Promise<vscode.Uri | undefined> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return undefined;
  }

  const context = getContextUri(contextUri);
  const workspaceFolder = context ? vscode.workspace.getWorkspaceFolder(context) : undefined;
  const candidates = await findTokenFiles(
    workspaceFolder ?? vscode.workspace.workspaceFolders[0],
  );
  const matches = candidates.filter((candidate) => candidate.kind === kind);
  const chosen = matches[0] ?? candidates.find((candidate) => candidate.kind === 'theme');
  return chosen
    ? vscode.Uri.joinPath(
        workspaceFolder?.uri ?? vscode.workspace.workspaceFolders[0].uri,
        ...chosen.filePath.split('/'),
      )
    : undefined;
}

async function resolveThemeProviderFile(contextUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return undefined;
  }

  const context = getContextUri(contextUri);
  const workspaceFolder = context ? vscode.workspace.getWorkspaceFolder(context) : undefined;
  const candidates = await findThemeProviderFiles(
    workspaceFolder ?? vscode.workspace.workspaceFolders[0],
  );

  const chosen = candidates[0];
  return chosen
    ? vscode.Uri.joinPath(
        workspaceFolder?.uri ?? vscode.workspace.workspaceFolders[0].uri,
        ...chosen.filePath.split('/'),
      )
    : undefined;
}
