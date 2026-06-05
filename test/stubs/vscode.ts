import * as fs from 'fs';

type UriLike = { fsPath: string; scheme: string };

const colorTokenManagerConfig: Record<string, unknown> = {};

export function __resetTestConfig(): void {
  for (const key of Object.keys(colorTokenManagerConfig)) {
    delete colorTokenManagerConfig[key];
  }
}

export function __setTestConfig(values: Record<string, unknown>): void {
  Object.assign(colorTokenManagerConfig, values);
}

export const workspace = {
  getConfiguration(section: string) {
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
  workspaceFolders: [{ uri: { fsPath: '/workspace', scheme: 'file' } }],
  getWorkspaceFolder(): { uri: UriLike } | undefined {
    return workspace.workspaceFolders[0];
  },
};

export namespace Uri {
  export function file(fsPath: string): UriLike {
    return { fsPath, scheme: 'file' };
  }

  export function joinPath(base: UriLike, ...pathSegments: string[]): UriLike {
    const path = require('path') as typeof import('path');
    return file(path.join(base.fsPath, ...pathSegments));
  }
}

export class WorkspaceEdit {
  replace(): void {
    return undefined;
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
    dispose(): void;
  } {
    return {
      show: () => undefined,
      dispose: () => undefined,
    };
  }
}

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
