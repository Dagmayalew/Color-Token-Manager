import * as path from 'path';
import * as vscode from 'vscode';
import {
  getConfiguredColorsFile,
  normalizeColorValue,
  readColors,
  validateColorValue,
} from './colorFile';
import { extractHardcodedColorsFromText, generateTokenName } from './colorExtractor';
import { buildPreviewForDocument, createPreviewPlanner } from './colorPlan';
import { getContrastRatio } from './colorUtils';
import { findUnusedColors, serializeTokens, toNestedObject, type ExportFormat } from './tokenTools';

const SERVER_NAME = 'color-token-manager';
const SERVER_VERSION = '0.2.0';
const EXTENSION_ID = 'dagmayalew.color-token-manager';
const HELP_RESOURCE_URI = 'colors://help';
const EXPORT_FORMAT_BY_KEY = {
  json: 'JSON',
  css: 'CSS Variables',
  tailwind: 'Tailwind Config',
  figma: 'Figma Tokens',
  w3c: 'W3C Design Tokens',
} satisfies Record<string, ExportFormat>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type ToolName = 'extract_from_file' | 'suggest_token_name' | 'get_contrast';

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type StdioLike = {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
};

export class ColorTokenMcpServer implements vscode.Disposable {
  private running = false;
  private readonly disposables: vscode.Disposable[] = [];
  private frameBuffer = Buffer.alloc(0);

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly io: StdioLike = { stdin: process.stdin, stdout: process.stdout },
  ) {}

  start(): void {
    if (this.running) {
      this.output.appendLine('MCP server is already running.');
      return;
    }

    this.running = true;
    this.output.appendLine('MCP server listening on stdio.');
    this.io.stdin.on('data', this.handleData);
    this.io.stdin.on('end', this.handleEnd);
  }

  dispose(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.io.stdin.off('data', this.handleData);
    this.io.stdin.off('end', this.handleEnd);
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.output.appendLine('MCP server stopped.');
  }

  async readResource(uri: string): Promise<JsonValue> {
    if (uri === HELP_RESOURCE_URI) {
      return getMcpHelpResource();
    }

    if (uri === 'colors://tokens') {
      const colorsFileUri = await getActiveColorsFile();
      const colors = await readColors(colorsFileUri);
      return {
        colorsFile: vscode.workspace.asRelativePath(colorsFileUri),
        tokens: toNestedObject(colors) as JsonValue,
        flat: flattenColors(colors),
      };
    }

    if (uri === 'colors://tokens/flat') {
      const colors = await readColors(await getActiveColorsFile());
      return flattenColors(colors);
    }

    if (uri === 'colors://tokens/unused') {
      const colorsFileUri = await getActiveColorsFile();
      const { unused, total } = await findUnusedColors(colorsFileUri);
      return {
        total,
        unused: unused.map((color) => ({
          path: color.key,
          value: color.value,
          aliasOf: color.aliasOf ?? null,
        })),
      };
    }

    const exportMatch = uri.match(/^colors:\/\/exports\/([a-z]+)$/);
    if (exportMatch) {
      const formatKey = exportMatch[1] as keyof typeof EXPORT_FORMAT_BY_KEY;
      const format = EXPORT_FORMAT_BY_KEY[formatKey];
      if (!format) {
        throw new Error(`Unsupported export format "${exportMatch[1]}".`);
      }

      const colorsFileUri = await getActiveColorsFile();
      const colors = await readColors(colorsFileUri);
      return {
        format: exportMatch[1],
        colorsFile: vscode.workspace.asRelativePath(colorsFileUri),
        content: serializeTokens(colors, format),
      };
    }

    throw new Error(`Unknown MCP resource: ${uri}`);
  }

  async callTool(name: ToolName, args: Record<string, unknown>): Promise<McpToolResult> {
    requireDryRun(args);

    if (args.dryRun === false) {
      const confirmed = await confirmAgentAction(name);
      if (!confirmed) {
        throw new Error(`User cancelled ${name}.`);
      }
    }

    if (name === 'extract_from_file') {
      return jsonToolResult(await this.previewExtraction(args));
    }

    if (name === 'suggest_token_name') {
      return jsonToolResult(suggestTokenNames(args));
    }

    if (name === 'get_contrast') {
      return jsonToolResult(await getTokenContrast(args));
    }

    throw new Error(`Unknown MCP tool: ${name}`);
  }

  private readonly handleData = (chunk: Buffer | string): void => {
    this.frameBuffer = Buffer.concat([this.frameBuffer, Buffer.from(chunk)]);
    void this.flushFrames();
  };

  private readonly handleEnd = (): void => {
    this.output.appendLine('MCP stdio client disconnected.');
  };

  private async flushFrames(): Promise<void> {
    while (true) {
      const headerEnd = this.frameBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        await this.flushLineFrames();
        return;
      }

      const header = this.frameBuffer.slice(0, headerEnd).toString('utf8');
      const lengthMatch = header.match(/content-length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.frameBuffer = Buffer.alloc(0);
        throw new Error('Invalid MCP frame: missing Content-Length header.');
      }

      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.frameBuffer.length < bodyEnd) {
        return;
      }

      const body = this.frameBuffer.slice(bodyStart, bodyEnd).toString('utf8');
      this.frameBuffer = this.frameBuffer.slice(bodyEnd);
      await this.handleMessage(JSON.parse(body) as JsonRpcRequest);
    }
  }

  private async flushLineFrames(): Promise<void> {
    const text = this.frameBuffer.toString('utf8');
    const newline = text.indexOf('\n');
    if (newline === -1) {
      return;
    }

    const line = text.slice(0, newline).trim();
    this.frameBuffer = Buffer.from(text.slice(newline + 1), 'utf8');
    if (line) {
      await this.handleMessage(JSON.parse(line) as JsonRpcRequest);
    }
  }

  private async handleMessage(message: JsonRpcRequest): Promise<void> {
    if (!message.id && message.id !== 0) {
      return;
    }

    try {
      const result = await this.dispatch(message);
      this.writeResponse({ jsonrpc: '2.0', id: message.id, result });
    } catch (error) {
      this.output.appendLine(error instanceof Error ? error.message : String(error));
      this.writeResponse({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async dispatch(message: JsonRpcRequest): Promise<JsonValue> {
    switch (message.method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          capabilities: { resources: {}, tools: {} },
        };
      case 'resources/list':
        return { resources: listResources() };
      case 'resources/read': {
        const uri = getStringParam(message.params, 'uri');
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(await this.readResource(uri), null, 2),
            },
          ],
        };
      }
      case 'tools/list':
        return { tools: listTools() };
      case 'tools/call': {
        const params = asRecord(message.params);
        const name = params.name;
        if (!isToolName(name)) {
          throw new Error(`Unknown MCP tool: ${String(name)}`);
        }
        const args = asRecord(params.arguments);
        return (await this.callTool(name, args)) as unknown as JsonValue;
      }
      default:
        throw new Error(`Unsupported MCP method: ${String(message.method)}`);
    }
  }

  private async previewExtraction(args: Record<string, unknown>): Promise<JsonValue> {
    const targetPath = getRequiredString(args, 'path');
    const targetUri = resolveWorkspacePath(targetPath);
    const colorsFileUri = await getActiveColorsFile(targetUri);
    if (targetUri.toString() === colorsFileUri.toString()) {
      throw new Error('Choose a source file outside colors.ts for extraction.');
    }

    const document = await vscode.workspace.openTextDocument(targetUri);
    const extractedColors = extractHardcodedColorsFromText(document.getText());
    const existingColors = await readColors(colorsFileUri);
    const preview = buildPreviewForDocument(
      document,
      extractedColors,
      createPreviewPlanner(existingColors),
    );

    return {
      dryRun: args.dryRun as boolean,
      colorsFile: vscode.workspace.asRelativePath(colorsFileUri),
      file: vscode.workspace.asRelativePath(targetUri),
      colorsFound: preview.replacements.length,
      tokensToAdd: preview.replacements.filter(
        (replacement) => replacement.action === 'add' || replacement.action === 'alias',
      ).length,
      tokensToReuse: preview.replacements.filter((replacement) => replacement.action === 'reuse')
        .length,
      preview,
    };
  }

  private writeResponse(response: unknown): void {
    const body = JSON.stringify(response);
    this.io.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  }
}

export function createMcpStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
  item.name = 'Color Token Manager MCP';
  item.text = '$(plug) Color MCP: Running';
  item.tooltip = 'Color Token Manager MCP server is running. Click to show logs.';
  item.command = 'colorTokenManager.showMcpOutput';
  item.hide();
  return item;
}

export function listResources(): JsonValue[] {
  const staticResources = [
    {
      uri: HELP_RESOURCE_URI,
      name: 'Color Token Manager MCP help',
      description:
        'Agent guide for safe token reads, extraction previews, naming, and contrast checks.',
      mimeType: 'application/json',
    },
    {
      uri: 'colors://tokens',
      name: 'Color tokens',
      description:
        'Full color token tree plus flat metadata. Read this before proposing token edits.',
      mimeType: 'application/json',
    },
    {
      uri: 'colors://tokens/flat',
      name: 'Flat color token map',
      description: 'Color tokens as { "path.to.token": "#FFFFFF" }.',
      mimeType: 'application/json',
    },
    {
      uri: 'colors://tokens/unused',
      name: 'Unused color tokens',
      description:
        'Tokens not referenced by supported project source files. Use this before cleanup suggestions.',
      mimeType: 'application/json',
    },
  ];

  return [
    ...staticResources,
    ...Object.keys(EXPORT_FORMAT_BY_KEY).map((format) => ({
      uri: `colors://exports/${format}`,
      name: `Color token ${format} export`,
      description: `Serialized ${format} design token export. Use this when an agent needs generated token artifacts without writing files.`,
      mimeType: format === 'css' ? 'text/css' : 'application/json',
    })),
  ];
}

export function listTools(): JsonValue[] {
  return [
    {
      name: 'extract_from_file',
      description:
        'Preview hardcoded color extraction for a workspace file. Always call with dryRun: true first; paths must stay inside the active workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean' },
          path: {
            type: 'string',
            description: 'Workspace-relative or in-workspace absolute path.',
          },
        },
        required: ['dryRun', 'path'],
      },
    },
    {
      name: 'suggest_token_name',
      description:
        'Suggest 1-3 semantic token names from surrounding code using the extension naming strategy.',
      inputSchema: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean' },
          context: { type: 'string' },
          colorValue: { type: 'string' },
        },
        required: ['dryRun', 'context'],
      },
    },
    {
      name: 'get_contrast',
      description:
        'Calculate WCAG contrast between two existing color tokens and return AA/AAA pass details.',
      inputSchema: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean' },
          tokenPath: { type: 'string' },
          againstTokenPath: { type: 'string' },
        },
        required: ['dryRun', 'tokenPath', 'againstTokenPath'],
      },
    },
  ];
}

export function getMcpHelpResource(): JsonValue {
  return {
    server: SERVER_NAME,
    extensionId: EXTENSION_ID,
    summary:
      'Color Token Manager exposes the workspace colors.ts graph to local AI coding agents over MCP stdio.',
    safeWorkflow: [
      'Read colors://tokens or colors://tokens/flat before suggesting token edits.',
      'Use colors://tokens/unused before proposing token removal.',
      'Use extract_from_file with dryRun: true before changing source files.',
      'Use suggest_token_name with surrounding code when naming new semantic tokens.',
      'Use get_contrast before changing foreground or background token pairs.',
      'Every tool requires an explicit dryRun boolean. dryRun: false requests user confirmation in VS Code before any future mutating operation can proceed.',
    ],
    resources: listResources(),
    tools: listTools(),
    examplePrompts: [
      'List unused color tokens and explain which ones look safe to remove.',
      'Preview extracting colors from src/components/Button.tsx with dryRun: true.',
      'Suggest a name for the backgroundColor in Button.tsx.',
      'Check contrast for colors.text.black against colors.background.white.',
    ],
  };
}

export function getMcpClientSetupSnippet(
  workspacePath?: string,
  serverPath?: string,
  colorsFile = 'colors.ts',
): string {
  const command = process.execPath;
  const args = [
    serverPath ?? 'PATH_TO_COLOR_TOKEN_MANAGER/dist/mcp-server.js',
    ...(workspacePath ? ['--workspace', workspacePath] : []),
    '--colors-file',
    colorsFile,
  ];

  return JSON.stringify(
    {
      mcpServers: {
        'color-token-manager': {
          command,
          args,
        },
      },
    },
    null,
    2,
  );
}

export function getStartMcpCommandTitle(): string {
  return 'Color Token Manager: Start MCP Server';
}

function flattenColors(colors: Awaited<ReturnType<typeof readColors>>): Record<string, string> {
  return Object.fromEntries(colors.map((color) => [color.key, color.value]));
}

async function getActiveColorsFile(contextUri?: vscode.Uri): Promise<vscode.Uri> {
  const colorsFileUri = await getConfiguredColorsFile(
    contextUri ?? vscode.window.activeTextEditor?.document.uri,
  );
  if (!colorsFileUri) {
    throw new Error('No colors.ts file is configured for this workspace.');
  }

  assertInActiveWorkspace(colorsFileUri);
  return colorsFileUri;
}

function resolveWorkspacePath(value: string): vscode.Uri {
  const workspaceFolder = getActiveWorkspaceFolder();
  const candidatePath = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(workspaceFolder.uri.fsPath, value);
  const relative = path.relative(workspaceFolder.uri.fsPath, candidatePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the active workspace: ${value}`);
  }

  return vscode.Uri.file(candidatePath);
}

function assertInActiveWorkspace(uri: vscode.Uri): void {
  const workspaceFolder = getActiveWorkspaceFolder();
  const relative = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the active workspace: ${uri.fsPath}`);
  }
}

function getActiveWorkspaceFolder(): vscode.WorkspaceFolder {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const activeFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined;
  const workspaceFolder = activeFolder ?? vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('Open a workspace before using the Color Token Manager MCP server.');
  }

  return workspaceFolder;
}

function suggestTokenNames(args: Record<string, unknown>): JsonValue {
  const context = getRequiredString(args, 'context');
  const extracted = extractHardcodedColorsFromText(context);
  const colorValue =
    typeof args.colorValue === 'string' && validateColorValue(args.colorValue)
      ? args.colorValue
      : (extracted[0]?.value ?? '#000000');
  const primary = generateTokenName(colorValue, context);
  const normalizedValue = normalizeColorValue(colorValue)
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
  const candidates = Array.from(
    new Set([
      primary,
      primary.startsWith('semantic.') ? primary : `semantic.${primary}`,
      `${primary}.${normalizedValue || 'color'}`,
    ]),
  ).slice(0, 3);

  return { colorValue, candidates };
}

async function getTokenContrast(args: Record<string, unknown>): Promise<JsonValue> {
  const tokenPath = getRequiredString(args, 'tokenPath');
  const againstTokenPath = getRequiredString(args, 'againstTokenPath');
  const colors = await readColors(await getActiveColorsFile());
  const byPath = new Map(colors.map((color) => [color.key, color]));
  const token = byPath.get(tokenPath);
  const against = byPath.get(againstTokenPath);
  if (!token) {
    throw new Error(`Color token "${tokenPath}" was not found.`);
  }
  if (!against) {
    throw new Error(`Color token "${againstTokenPath}" was not found.`);
  }

  const ratio = getContrastRatio(token.value, against.value);
  if (ratio === undefined) {
    throw new Error(`Could not calculate contrast for ${token.value} on ${against.value}.`);
  }

  return {
    tokenPath,
    tokenValue: token.value,
    againstTokenPath,
    againstTokenValue: against.value,
    ratio: Number(ratio.toFixed(2)),
    wcag: {
      AA: {
        normalText: ratio >= 4.5,
        largeText: ratio >= 3,
      },
      AAA: {
        normalText: ratio >= 7,
        largeText: ratio >= 4.5,
      },
    },
  };
}

function requireDryRun(args: Record<string, unknown>): void {
  if (typeof args.dryRun !== 'boolean') {
    throw new Error('MCP tools require an explicit dryRun boolean parameter.');
  }
}

async function confirmAgentAction(name: string): Promise<boolean> {
  const action = await vscode.window.showWarningMessage(
    `An MCP client requested ${name} with dryRun: false. Continue?`,
    { modal: true },
    'Continue',
  );
  return action === 'Continue';
}

function jsonToolResult(value: JsonValue): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function getRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required string parameter "${key}".`);
  }

  return value;
}

function getStringParam(params: unknown, key: string): string {
  return getRequiredString(asRecord(params), key);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isToolName(value: unknown): value is ToolName {
  return (
    value === 'extract_from_file' || value === 'suggest_token_name' || value === 'get_contrast'
  );
}
