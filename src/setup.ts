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
import { getDefaultDialogUri, resolveWorkspaceFolder } from './workspaceUtils';

const DEFAULT_COLORS_PATH = 'src/theme/colors.ts';
const DEFAULT_THEME_PATH = 'src/theme/theme.ts';

type TokenPathMode = 'auto' | 'flat' | 'nested';

type ThemeStyle = 'colorSeries' | 'lightDark' | 'reactNative';

type SetupChoice =
  | { kind: 'existing'; uri: vscode.Uri }
  | { kind: 'createStyle'; style: ThemeStyle }
  | { kind: 'createCustom' }
  | { kind: 'browse' };

type ColorsFileSelection = {
  uri: vscode.Uri;
  tokenPathMode?: TokenPathMode;
  themeStyle?: ThemeStyle;
};

export async function runSetupWizard(contextUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  const workspaceFolder = resolveWorkspaceFolder(contextUri);
  if (!workspaceFolder) {
    throw new Error('Open a workspace before setting up Color Token Manager.');
  }

  const selection = await chooseSetup(workspaceFolder, contextUri);
  if (!selection) {
    return undefined;
  }

  const tokenPathMode = selection.tokenPathMode ?? (await chooseTokenPathMode(selection.uri));
  await rememberSetup(selection.uri, tokenPathMode, selection.themeStyle);

  return selection.uri;
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
  const selected = await vscode.window.showQuickPick(choices, {
    placeHolder: 'How does this project handle colors?',
    title: 'Set Up Color Token Manager',
  });
  if (!selected) {
    return undefined;
  }

  const choice = selected.choice;

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
    description: 'Use existing token/theme file',
    choice: { kind: 'existing' as const, uri },
  }));

  return [
    ...existing,
    {
      label: '$(star-full) Simple color series',
      description: `Creates ${DEFAULT_COLORS_PATH} with organized primary/neutral/success scales`,
      detail: 'Recommended for new projects',
      choice: { kind: 'createStyle' as const, style: 'colorSeries' as const },
    },
    {
      label: '$(split-horizontal) Light / Dark theme',
      description: `Creates ${DEFAULT_THEME_PATH} with lightTheme and darkTheme exports`,
      detail: 'Recommended for web apps with dark mode',
      choice: { kind: 'createStyle' as const, style: 'lightDark' as const },
    },
    {
      label: '$(device-mobile) React Native theme',
      description: `Creates ${DEFAULT_THEME_PATH} with a nested theme object`,
      detail: 'Recommended for React Native projects',
      choice: { kind: 'createStyle' as const, style: 'reactNative' as const },
    },
    {
      label: '$(edit) Create at custom path…',
      description: 'Choose a workspace-relative path for a flat colors file',
      choice: { kind: 'createCustom' as const },
    },
    {
      label: '$(folder-opened) Browse for existing file…',
      description: 'Pick a token or theme file manually',
      choice: { kind: 'browse' as const },
    },
  ];
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
  vscode.window.showInformationMessage(`Created ${vscode.workspace.asRelativePath(fileUri)}.`);
  return { uri: fileUri, tokenPathMode, themeStyle };
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
  vscode.window.showInformationMessage(`Created ${vscode.workspace.asRelativePath(fileUri)}.`);
  return { uri: fileUri, tokenPathMode };
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
  themeStyle?: ThemeStyle,
): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(colorsFileUri);
  if (!folder) return;

  const relativePath = path.relative(folder.uri.fsPath, colorsFileUri.fsPath).replace(/\\/g, '/');
  const configuration = vscode.workspace.getConfiguration('colorTokenManager', folder.uri);
  const tokenExportName = await inferTokenExportName(colorsFileUri);

  // Derive referencePrefix from the export name
  const referencePrefix = tokenExportName === 'auto' ? 'colors' : tokenExportName;

  // Derive tokenFileKind from the theme style
  const tokenFileKind =
    themeStyle === 'colorSeries' || themeStyle === undefined ? 'colors' : 'theme';

  await configuration.update('tokenFile', relativePath, vscode.ConfigurationTarget.Workspace);
  await configuration.update('tokenFilePath', relativePath, vscode.ConfigurationTarget.Workspace);
  await configuration.update('colorsFilePath', relativePath, vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    'tokenExportName',
    tokenExportName,
    vscode.ConfigurationTarget.Workspace,
  );
  await configuration.update(
    'referencePrefix',
    referencePrefix,
    vscode.ConfigurationTarget.Workspace,
  );
  await configuration.update('tokenFileKind', tokenFileKind, vscode.ConfigurationTarget.Workspace);
  await configuration.update('tokenPathMode', tokenPathMode, vscode.ConfigurationTarget.Workspace);
}

async function inferTokenExportName(colorsFileUri: vscode.Uri): Promise<string> {
  try {
    return await detectTokenExportName(colorsFileUri);
  } catch {
    return 'auto';
  }
}
