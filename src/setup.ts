import * as path from 'path';
import * as vscode from 'vscode';
import {
  createColorsFile,
  findColorFiles,
  readColors,
  type ColorsFileTemplateMode,
} from './colorFile';
import { getDefaultDialogUri, resolveWorkspaceFolder } from './workspaceUtils';

const DEFAULT_COLORS_PATH = 'src/theme/colors.ts';

type TokenPathMode = 'auto' | 'flat' | 'nested';

type FileChoice =
  | { kind: 'existing'; uri: vscode.Uri }
  | { kind: 'createDefault' }
  | { kind: 'createCustom' }
  | { kind: 'browse' };
type ColorsFileSelection = { uri: vscode.Uri; tokenPathMode?: TokenPathMode };

export async function runSetupWizard(contextUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  const workspaceFolder = resolveWorkspaceFolder(contextUri);
  if (!workspaceFolder) {
    throw new Error('Open a workspace before setting up Color Token Manager.');
  }

  const selection = await chooseColorsFile(workspaceFolder, contextUri);
  if (!selection) {
    return undefined;
  }

  const tokenPathMode = selection.tokenPathMode ?? (await chooseTokenPathMode(selection.uri));
  await rememberSetup(selection.uri, tokenPathMode);

  return selection.uri;
}

async function chooseColorsFile(
  workspaceFolder: vscode.WorkspaceFolder,
  contextUri?: vscode.Uri,
): Promise<ColorsFileSelection | undefined> {
  const files = await findColorFiles();
  const inWorkspace = files.filter((file) => {
    return (
      vscode.workspace.getWorkspaceFolder(file)?.uri.toString() === workspaceFolder.uri.toString()
    );
  });
  const candidates = inWorkspace.length ? inWorkspace : files;
  const choices = getFileChoices(candidates);

  const selected = await vscode.window.showQuickPick(choices, {
    placeHolder: candidates.length
      ? 'Choose your colors.ts file or create a new one'
      : 'No colors.ts found. Create one to finish setup.',
    title: 'Set Up Color Token Manager',
  });
  if (!selected) {
    return undefined;
  }

  if (selected.choice.kind === 'existing') {
    return { uri: selected.choice.uri };
  }

  if (selected.choice.kind === 'browse') {
    const uri = await browseForColorsFile(contextUri);
    return uri ? { uri } : undefined;
  }

  if (selected.choice.kind === 'createDefault') {
    return createConfiguredColorsFile(
      vscode.Uri.joinPath(workspaceFolder.uri, ...DEFAULT_COLORS_PATH.split('/')),
    );
  }

  const customPath = await vscode.window.showInputBox({
    title: 'Create colors.ts',
    prompt: 'Enter a workspace-relative path for the colors file',
    value: DEFAULT_COLORS_PATH,
    validateInput(value) {
      const trimmed = value.trim();
      if (!trimmed) {
        return 'Enter a path like src/theme/colors.ts.';
      }

      if (!trimmed.endsWith('.ts')) {
        return 'Use a TypeScript file path ending in .ts.';
      }

      return undefined;
    },
  });
  if (!customPath) {
    return undefined;
  }

  return createConfiguredColorsFile(
    path.isAbsolute(customPath)
      ? vscode.Uri.file(customPath)
      : vscode.Uri.joinPath(workspaceFolder.uri, ...customPath.trim().split('/')),
  );
}

function getFileChoices(
  candidates: vscode.Uri[],
): Array<vscode.QuickPickItem & { choice: FileChoice }> {
  const existing = candidates.map((uri) => ({
    label: `$(file-code) ${vscode.workspace.asRelativePath(uri)}`,
    description: 'Use existing colors.ts',
    choice: { kind: 'existing' as const, uri },
  }));

  return [
    ...existing,
    {
      label: `$(new-file) Create ${DEFAULT_COLORS_PATH}`,
      description: 'Recommended for new projects',
      choice: { kind: 'createDefault' },
    },
    {
      label: '$(edit) Create at custom path',
      description: 'Choose a workspace-relative path',
      choice: { kind: 'createCustom' },
    },
    {
      label: '$(folder-opened) Browse for colors.ts',
      description: 'Pick a file manually',
      choice: { kind: 'browse' },
    },
  ];
}

async function browseForColorsFile(contextUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: getDefaultDialogUri(contextUri),
    filters: { TypeScript: ['ts'] },
    openLabel: 'Use colors.ts',
    title: 'Choose a colors.ts file',
  });

  return selected?.[0];
}

async function createConfiguredColorsFile(
  fileUri: vscode.Uri,
): Promise<ColorsFileSelection | undefined> {
  const tokenPathMode = await chooseTokenPathMode();
  const templateMode: ColorsFileTemplateMode = tokenPathMode === 'nested' ? 'nested' : 'flat';
  await createColorsFile(fileUri, templateMode);
  vscode.window.showInformationMessage(`Created ${vscode.workspace.asRelativePath(fileUri)}.`);
  return { uri: fileUri, tokenPathMode };
}

async function chooseTokenPathMode(colorsFileUri?: vscode.Uri): Promise<TokenPathMode> {
  const inferred = colorsFileUri ? await inferTokenPathMode(colorsFileUri) : 'auto';
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: 'Auto',
        description: 'Recommended',
        detail:
          'Match the current colors.ts shape: flat projects stay flat, nested projects stay nested.',
        mode: 'auto' as const,
      },
      {
        label: 'Flat',
        description: inferred === 'flat' ? 'Looks like your current file' : undefined,
        detail: 'Generate references like colors.black and colors.textBlack.',
        mode: 'flat' as const,
      },
      {
        label: 'Nested',
        description: inferred === 'nested' ? 'Looks like your current file' : undefined,
        detail: 'Generate references like colors.text.black and colors.button.background.',
        mode: 'nested' as const,
      },
    ],
    {
      placeHolder: 'How should token references be generated?',
      title: 'Choose Token Style',
    },
  );

  return selected?.mode ?? 'auto';
}

async function inferTokenPathMode(colorsFileUri: vscode.Uri): Promise<'flat' | 'nested'> {
  try {
    const colors = await readColors(colorsFileUri);
    return colors.some((color) => color.key.includes('.')) ? 'nested' : 'flat';
  } catch {
    return 'flat';
  }
}

async function rememberSetup(
  colorsFileUri: vscode.Uri,
  tokenPathMode: TokenPathMode,
): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(colorsFileUri);
  if (!folder) {
    return;
  }

  const relativePath = path.relative(folder.uri.fsPath, colorsFileUri.fsPath).replace(/\\/g, '/');
  const configuration = vscode.workspace.getConfiguration('colorTokenManager', folder.uri);
  await configuration.update('colorsFilePath', relativePath, vscode.ConfigurationTarget.Workspace);
  await configuration.update('tokenPathMode', tokenPathMode, vscode.ConfigurationTarget.Workspace);
}
