import * as path from 'path';
import * as vscode from 'vscode';
import {
  createColorsFile,
  detectTokenExportName,
  findColorFiles,
  readColors,
  type ColorsFileTemplateMode,
} from './colorFile';
import { findTokenFiles } from './tokenDetection';
import { getProjectProblemHint, getProjectSummary } from './projectRouting';
import { getDefaultDialogUri, resolveWorkspaceFolder } from './workspaceUtils';

const DEFAULT_COLORS_PATH = 'src/theme/colors.ts';
const DEFAULT_THEME_PATH = 'src/theme/theme.ts';

type TokenPathMode = 'auto' | 'flat' | 'nested';

type ThemeStyle = 'colorSeries' | 'lightDark' | 'reactNative';

type SetupChoice =
  | { kind: 'workflow'; workflow: SetupWorkflow }
  | { kind: 'existing'; uri: vscode.Uri }
  | { kind: 'createStyle'; style: ThemeStyle }
  | { kind: 'createCustom' }
  | { kind: 'browse' };

type ColorsFileSelection = {
  uri: vscode.Uri;
  tokenPathMode?: TokenPathMode;
  themeStyle?: ThemeStyle;
  workflow?: SetupWorkflow;
};

type SetupWorkflow = 'colorsOnly' | 'themeOnly' | 'both';

export async function runSetupWizard(contextUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  const workspaceFolder = resolveWorkspaceFolder(contextUri);
  if (!workspaceFolder) {
    throw new Error('Open a workspace before setting up Color Token Manager.');
  }

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Setting up Color Token Manager',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Finding token files', increment: 10 });
      const selection = await chooseSetup(workspaceFolder, contextUri);
      if (!selection) {
        return undefined;
      }

      progress.report({ message: 'Choosing token style', increment: 35 });
      const tokenPathMode = selection.tokenPathMode ?? (await chooseTokenPathMode(selection.uri));
      const workflow = selection.workflow ?? (await chooseWorkflow());

      progress.report({ message: 'Saving workspace settings', increment: 35 });
      await rememberSetup(selection.uri, tokenPathMode, selection.themeStyle, workflow);

      progress.report({ message: 'Setup complete', increment: 20 });
      return selection.uri;
    },
  );
}

async function chooseSetup(
  workspaceFolder: vscode.WorkspaceFolder,
  contextUri?: vscode.Uri,
): Promise<ColorsFileSelection | undefined> {
  // Find existing token/theme files in the workspace
  let detectedFiles: vscode.Uri[] = [];
  try {
    const candidates = await findTokenFiles(workspaceFolder);
    detectedFiles = candidates.map((c) =>
      vscode.Uri.joinPath(workspaceFolder.uri, ...c.filePath.split('/')),
    );
  } catch {
    // Fall back to legacy search
    const found = await findColorFiles();
    detectedFiles = found.filter(
      (f) =>
        vscode.workspace.getWorkspaceFolder(f)?.uri.toString() === workspaceFolder.uri.toString(),
    );
  }

  const choices = buildSetupChoices(detectedFiles);
  const summary = await getProjectSummary(workspaceFolder.uri);
  const selected = await vscode.window.showQuickPick(choices, {
    placeHolder: getProjectProblemHint(summary),
    title: 'Set Up Color Token Manager',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!selected) {
    return undefined;
  }

  const choice = selected.choice;

  if (choice.kind === 'existing' && detectedFiles.length === 1) {
    return { uri: detectedFiles[0] };
  }

  if (choice.kind === 'workflow') {
    return chooseWorkflowSetup(choice.workflow, workspaceFolder, contextUri);
  }

  if (choice.kind === 'existing') {
    return { uri: choice.uri };
  }

  if (choice.kind === 'browse') {
    const uri = await browseForColorsFile(contextUri);
    return uri ? { uri } : undefined;
  }

  if (choice.kind === 'createCustom') {
    return createAtCustomPath(workspaceFolder, 'flat');
  }

  // Theme style creation
  const style = choice.style;
  const templateMode = styleToTemplateMode(style);
  const defaultPath = style === 'colorSeries' ? DEFAULT_COLORS_PATH : DEFAULT_THEME_PATH;
  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, ...defaultPath.split('/'));
  return createTemplateFile(fileUri, templateMode, style);
}

function buildSetupChoices(
  detectedFiles: vscode.Uri[],
): Array<vscode.QuickPickItem & { choice: SetupChoice }> {
  const existing = detectedFiles.map((uri) => ({
    label: `$(file-code) ${vscode.workspace.asRelativePath(uri)}`,
    description: describeSetupFileKind(uri),
    detail: 'Use existing token/theme file',
    choice: { kind: 'existing' as const, uri },
  }));

  return [
    {
      label: '$(symbol-color) Colors only',
      description: 'One simple file',
      detail: 'Use one colors file for tokens and cleanup.',
      choice: { kind: 'workflow' as const, workflow: 'colorsOnly' as const },
    },
    {
      label: '$(paintcan) Theme only',
      description: 'One theme file',
      detail: 'Use one theme file for background, text, and surface roles.',
      choice: { kind: 'workflow' as const, workflow: 'themeOnly' as const },
    },
    {
      label: '$(layers) Colors + Theme',
      description: 'Two linked files',
      detail: 'Use this when colors and theme live separately.',
      choice: { kind: 'workflow' as const, workflow: 'both' as const },
    },
    ...existing,
    {
      label: '$(star-full) Color scale',
      description: `Create ${DEFAULT_COLORS_PATH}`,
      detail: 'Creates a scale-based colors file.',
      choice: { kind: 'createStyle' as const, style: 'colorSeries' as const },
    },
    {
      label: '$(split-horizontal) Light / dark',
      description: `Create ${DEFAULT_THEME_PATH}`,
      detail: 'Creates a light and dark theme file.',
      choice: { kind: 'createStyle' as const, style: 'lightDark' as const },
    },
    {
      label: '$(device-mobile) React Native',
      description: `Create ${DEFAULT_THEME_PATH}`,
      detail: 'Creates a nested theme object.',
      choice: { kind: 'createStyle' as const, style: 'reactNative' as const },
    },
    {
      label: '$(edit) Custom path…',
      description: 'Choose your own path',
      choice: { kind: 'createCustom' as const },
    },
    {
      label: '$(folder-opened) Browse existing file…',
      description: 'Pick an existing file',
      choice: { kind: 'browse' as const },
    },
  ];
}

async function chooseWorkflow(): Promise<SetupWorkflow> {
  const selected = await vscode.window.showQuickPick(
    [
    {
      label: 'Colors only',
      description: 'One simple file',
      detail: 'Use one colors file for extraction and cleanup.',
      workflow: 'colorsOnly' as const,
    },
    {
      label: 'Theme only',
      description: 'One theme file',
      detail: 'Use one theme file for background, text, and surface.',
      workflow: 'themeOnly' as const,
    },
    {
      label: 'Colors + Theme',
      description: 'Two linked files',
      detail: 'Use both when colors and theme live apart.',
      workflow: 'both' as const,
    },
    ],
    {
      title: 'Choose Workflow',
      placeHolder: 'Pick the setup that matches your project',
    },
  );

  return selected?.workflow ?? 'colorsOnly';
}

async function chooseWorkflowSetup(
  workflow: SetupWorkflow,
  workspaceFolder: vscode.WorkspaceFolder,
  contextUri?: vscode.Uri,
): Promise<ColorsFileSelection | undefined> {
  const uri = await browseForColorsFile(contextUri);
  if (!uri) {
    return undefined;
  }

  const base: ColorsFileSelection = { uri, workflow };
  if (workflow === 'themeOnly') {
    base.themeStyle = 'lightDark';
    return base;
  }

  if (workflow === 'both') {
    base.themeStyle = 'lightDark';
  }

  if (workflow === 'colorsOnly') {
    base.tokenPathMode = 'flat';
  }

  return base;
}

function describeSetupFileKind(uri: vscode.Uri): string {
  const fileName = path.basename(uri.fsPath).toLowerCase();

  if (fileName === 'theme.ts' || fileName === 'themes.ts' || /(?:light|dark)theme\.ts$/.test(fileName)) {
    return 'Theme file';
  }

  if (
    fileName === 'colors.ts' ||
    fileName === 'tokens.ts' ||
    fileName === 'designtokens.ts' ||
    fileName === 'design-tokens.ts' ||
    fileName === 'designsystem.ts' ||
    fileName === 'design-system.ts'
  ) {
    return 'Colors/token file';
  }

  return 'Token file';
}

function styleToTemplateMode(style: ThemeStyle): ColorsFileTemplateMode {
  if (style === 'colorSeries') return 'colorSeries';
  if (style === 'lightDark') return 'lightDark';
  return 'reactNative';
}

async function createTemplateFile(
  fileUri: vscode.Uri,
  templateMode: ColorsFileTemplateMode,
  themeStyle: ThemeStyle,
): Promise<ColorsFileSelection | undefined> {
  const tokenPathMode: TokenPathMode = themeStyle === 'colorSeries' ? 'nested' : 'auto';
  await createColorsFile(fileUri, templateMode);
  vscode.window.showInformationMessage(
    `Created ${vscode.workspace.asRelativePath(fileUri)} and saved the workspace setup.`,
  );
  return {
    uri: fileUri,
    tokenPathMode,
    themeStyle,
    workflow: themeStyle === 'colorSeries' ? 'colorsOnly' : 'both',
  };
}

async function createAtCustomPath(
  workspaceFolder: vscode.WorkspaceFolder,
  _mode: ColorsFileTemplateMode,
): Promise<ColorsFileSelection | undefined> {
  const customPath = await vscode.window.showInputBox({
    title: 'Create token file',
    prompt: 'Enter a workspace-relative path for the token file',
    value: DEFAULT_COLORS_PATH,
    validateInput(value) {
      const trimmed = value.trim();
      if (!trimmed) return 'Enter a path like src/theme/colors.ts.';
      if (!trimmed.endsWith('.ts')) return 'Use a TypeScript file path ending in .ts.';
      return undefined;
    },
  });
  if (!customPath) return undefined;

  const tokenPathMode = await chooseTokenPathMode();
  const templateMode: ColorsFileTemplateMode = tokenPathMode === 'nested' ? 'nested' : 'flat';
  const fileUri = path.isAbsolute(customPath)
    ? vscode.Uri.file(customPath)
    : vscode.Uri.joinPath(workspaceFolder.uri, ...customPath.trim().split('/'));
  await createColorsFile(fileUri, templateMode);
  vscode.window.showInformationMessage(
    `Created ${vscode.workspace.asRelativePath(fileUri)} and saved the workspace setup.`,
  );
  return { uri: fileUri, tokenPathMode, workflow: 'colorsOnly' };
}

async function browseForColorsFile(contextUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: getDefaultDialogUri(contextUri),
    filters: { TypeScript: ['ts'] },
    openLabel: 'Use token file',
    title: 'Choose a token or theme file',
  });
  return selected?.[0];
}

async function chooseTokenPathMode(colorsFileUri?: vscode.Uri): Promise<TokenPathMode> {
  const inferred = colorsFileUri ? await inferTokenPathMode(colorsFileUri) : 'auto';
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: 'Auto',
        description: 'Recommended',
        detail:
          'Match the current token shape automatically so flat projects stay flat and nested projects stay nested.',
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
      placeHolder: 'How should token references be generated for this workspace?',
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
  themeStyle?: ThemeStyle,
  workflow?: SetupWorkflow,
): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(colorsFileUri);
  if (!folder) return;

  const relativePath = path.relative(folder.uri.fsPath, colorsFileUri.fsPath).replace(/\\/g, '/');
  const configuration = vscode.workspace.getConfiguration('colorTokenManager', folder.uri);
  const tokenExportName = await inferTokenExportName(colorsFileUri);
  const tokenObject = tokenExportName === 'auto' ? undefined : tokenExportName;

  // Derive referencePrefix from the export name
  const referencePrefix = tokenExportName === 'auto' ? 'colors' : tokenExportName;

  // Derive tokenFileKind from the theme style
  const tokenFileKind =
    themeStyle === 'colorSeries' || themeStyle === undefined ? 'colors' : 'theme';

  await configuration.update('tokenFile', relativePath, vscode.ConfigurationTarget.Workspace);
  await configuration.update('tokenFilePath', relativePath, vscode.ConfigurationTarget.Workspace);
  await configuration.update('colorsFilePath', relativePath, vscode.ConfigurationTarget.Workspace);
  await configuration.update('colorsFile', relativePath, vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    'tokenExportName',
    tokenExportName,
    vscode.ConfigurationTarget.Workspace,
  );
  await configuration.update('tokenObject', tokenObject, vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    'referencePrefix',
    referencePrefix,
    vscode.ConfigurationTarget.Workspace,
  );
  await configuration.update('tokenFileKind', tokenFileKind, vscode.ConfigurationTarget.Workspace);
  await configuration.update('tokenPathMode', tokenPathMode, vscode.ConfigurationTarget.Workspace);
  if (workflow) {
    await configuration.update('projectWorkflow', workflow, vscode.ConfigurationTarget.Workspace);
  }
  if (themeStyle && themeStyle !== 'colorSeries') {
    await configuration.update('themeFilePath', relativePath, vscode.ConfigurationTarget.Workspace);
    await configuration.update('themeFile', relativePath, vscode.ConfigurationTarget.Workspace);
  }
}

async function inferTokenExportName(colorsFileUri: vscode.Uri): Promise<string> {
  try {
    return await detectTokenExportName(colorsFileUri);
  } catch {
    return 'auto';
  }
}
