import { __resetTestConfig, __setTestConfig } from '../stubs/vscode';

export function setColorTokenManagerConfig(values: Record<string, unknown>): void {
  __setTestConfig(values);
}

export function resetColorTokenManagerConfig(): void {
  __resetTestConfig();
}
