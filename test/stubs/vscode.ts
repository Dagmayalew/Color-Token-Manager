import * as fs from 'fs';
import * as path from 'path';

type UriLike = { fsPath: string; scheme: string; toString(): string };

const colorTokenManagerConfig: Record<string, unknown> = {};
let workspaceRoot = '/workspace';

export function __resetTestConfig(): void {
  for (const key of Object.keys(colorTokenManagerConfig)) {
    delete colorTokenManagerConfig[key];
  }
}

export function __setTestConfig(values: Record<string, unknown>): void {
  Object.assign(colorTokenManagerConfig, values);
}

export function __setWorkspaceRoot(value: string): void {
  workspaceRoot = value;
  workspace.workspaceFolders = [{ uri: createUriLike(value) }];
}

export const workspace = {
  getConfiguration(section: string, _scope?: unknown) {
    return {
      get<T>(key: string, defaultValue: T): T {
        if (section === 'colorTokenManager' && key in colorTokenManagerConfig) {
          return colorTokenManagerConfig[key] as T;
        }
        return defaultValue;
      },
      async update(): Promise<void> {
        return undefined;
      },
    };
  },
  fs: {
    async readFile(uri: UriLike): Promise<Uint8Array> {
      return fs.readFileSync(uri.fsPath);
    },
    async writeFile(uri: UriLike, content: Uint8Array): Promise<void> {
      fs.writeFileSync(uri.fsPath, content);
    },
    async createDirectory(uri: UriLike): Promise<void> {
      fs.mkdirSync(uri.fsPath, { recursive: true });
    },
    async stat(uri: UriLike): Promise<{ type: number }> {
      if (!fs.existsSync(uri.fsPath)) {
        throw new Error(`ENOENT: ${uri.fsPath}`);
      }
      return { type: 1 };
    },
  },
  workspaceFolders: [{ uri: createUriLike(workspaceRoot) }],
  getWorkspaceFolder(uri?: UriLike): { uri: UriLike } | undefined {
    if (!uri) {
      return workspace.workspaceFolders[0];
    }

    const relative = path.relative(workspaceRoot, uri.fsPath);
    return relative.startsWith('..') || path.isAbsolute(relative)
      ? undefined
      : workspace.workspaceFolders[0];
  },
  asRelativePath(uri: UriLike | string): string {
    const fsPath = typeof uri === 'string' ? uri : uri.fsPath;
    return path.relative(workspaceRoot, fsPath).replace(/\\/g, '/');
  },
  async openTextDocument(uri: UriLike): Promise<{
    uri: UriLike;
    getText(range?: Range): string;
    positionAt(offset: number): Position;
  }> {
    const text = fs.readFileSync(uri.fsPath, 'utf8');
    return {
      uri,
      getText(range?: Range) {
        if (!range) {
          return text;
        }

        return text.slice(offsetAt(text, range.start), offsetAt(text, range.end));
      },
      positionAt(offset: number) {
        return positionAt(text, offset);
      },
    };
  },
  async findFiles(): Promise<UriLike[]> {
    const results: UriLike[] = [];
    walk(workspaceRoot, results);
    return results;
  },
};

export namespace Uri {
  export function file(fsPath: string): UriLike {
    return createUriLike(fsPath);
  }

  export function parse(value: string): UriLike {
    return value.startsWith('file://') ? file(value.slice('file://'.length)) : file(value);
  }

  export function joinPath(base: UriLike, ...pathSegments: string[]): UriLike {
    const path = require('path') as typeof import('path');
    return file(path.join(base.fsPath, ...pathSegments));
  }
}

export class WorkspaceEdit {
  public replacements: Array<{ uri: any; range: Range; newText: string }> = [];
  public insertions: Array<{ uri: any; position: Position; newText: string }> = [];

  replace(uri: any, range: Range, newText: string): void {
    this.replacements.push({ uri, range, newText });
  }

  insert(uri: any, position: Position, newText: string): void {
    this.insertions.push({ uri, position, newText });
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  public source?: string;
  public code?: string | number | { value: string | number; target: any };

  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export enum CodeActionKind {
  Empty = '',
  QuickFix = 'quickfix',
  Refactor = 'refactor',
  Source = 'source',
}

export class CodeAction {
  public diagnostics?: Diagnostic[];
  public isPreferred?: boolean;
  public edit?: WorkspaceEdit;
  public command?: { command: string; title: string; arguments?: any[] };

  constructor(
    public title: string,
    public kind?: CodeActionKind,
  ) {}
}

export namespace languages {
  export function createDiagnosticCollection() {
    return {
      set: () => undefined,
      delete: () => undefined,
      clear: () => undefined,
      dispose: () => undefined,
    };
  }
  export function registerCodeActionsProvider() {
    return { dispose: () => undefined };
  }
}

export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export class Range {
  constructor(
    public start: Position,
    public end: Position,
  ) {}
}

export class TextEdit {
  constructor(
    public range: Range,
    public newText: string,
  ) {}

  static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }

  static insert(position: Position, newText: string): TextEdit {
    return new TextEdit(new Range(position, position), newText);
  }

  static delete(range: Range): TextEdit {
    return new TextEdit(range, '');
  }
}

export namespace window {
  export const activeTextEditor = undefined;
  export const visibleTextEditors: unknown[] = [];

  export async function showQuickPick(): Promise<undefined> {
    return undefined;
  }

  export async function showInputBox(): Promise<undefined> {
    return undefined;
  }

  export async function showInformationMessage(): Promise<undefined> {
    return undefined;
  }

  export async function showWarningMessage(): Promise<undefined> {
    return undefined;
  }

  export async function showErrorMessage(): Promise<undefined> {
    return undefined;
  }

  export async function showOpenDialog(): Promise<undefined> {
    return undefined;
  }

  export function createStatusBarItem(): {
    name?: string;
    text?: string;
    tooltip?: string;
    command?: string;
    show(): void;
    hide(): void;
    dispose(): void;
  } {
    return {
      show: () => undefined,
      hide: () => undefined,
      dispose: () => undefined,
    };
  }

  export function createOutputChannel(): {
    appendLine(): void;
    show(): void;
    dispose(): void;
  } {
    return {
      appendLine: () => undefined,
      show: () => undefined,
      dispose: () => undefined,
    };
  }
}

export const env = {
  clipboard: {
    async writeText(): Promise<void> {
      return undefined;
    },
  },
};

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export namespace commands {
  export function registerCommand(): { dispose(): void } {
    return { dispose: () => undefined };
  }
}

export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string,
  ) {}
}

export class FileSystemWatcher {
  constructor(public pattern: RelativePattern) {}
  onDidChange(): { dispose(): void } {
    return { dispose: () => undefined };
  }
  dispose(): void {
    return undefined;
  }
}

export enum ConfigurationTarget {
  Workspace = 2,
}

function walk(dir: string, results: UriLike[]): void {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, results);
      continue;
    }

    results.push(createUriLike(fullPath));
  }
}

function createUriLike(fsPath: string): UriLike {
  return {
    fsPath,
    scheme: 'file',
    toString() {
      return `file://${fsPath}`;
    },
  };
}

function positionAt(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return new Position(lines.length - 1, lines[lines.length - 1].length);
}

function offsetAt(text: string, position: Position): number {
  const lines = text.split(/\r?\n/);
  return (
    lines.slice(0, position.line).join('\n').length +
    (position.line > 0 ? 1 : 0) +
    position.character
  );
}
