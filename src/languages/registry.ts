import type * as vscode from 'vscode';
import { type LanguageAdapter } from './types';
import { javascriptAdapter } from './javascriptAdapter';
import { typescriptAdapter } from './typescriptAdapter';
import { cssAdapter } from './cssAdapter';
import { htmlAdapter } from './htmlAdapter';
import { genericAdapter } from './genericAdapter';
import {
  dartAdapter,
  swiftAdapter,
  kotlinAdapter,
  javaAdapter,
  goAdapter,
  pythonAdapter,
  phpAdapter,
  rubyAdapter,
  jsonAdapter,
  yamlAdapter,
  xmlAdapter,
  svgAdapter,
  markdownAdapter,
} from './previewOnlyAdapters';

const adapters: LanguageAdapter[] = [
  javascriptAdapter,
  typescriptAdapter,
  cssAdapter,
  htmlAdapter,
  // Preview-only adapters
  dartAdapter,
  swiftAdapter,
  kotlinAdapter,
  javaAdapter,
  goAdapter,
  pythonAdapter,
  phpAdapter,
  rubyAdapter,
  jsonAdapter,
  yamlAdapter,
  xmlAdapter,
  svgAdapter,
  markdownAdapter,
];

export function registerAdapter(adapter: LanguageAdapter) {
  adapters.push(adapter);
}

export function getAdapterForDocument(document: vscode.TextDocument): LanguageAdapter {
  const byId = getAdapterByLanguageId(document.languageId);
  if (byId !== genericAdapter) {
    return byId;
  }

  // document.fileName could be undefined in some cases in tests, though real docs have it.
  const fileName = document.fileName || '';
  const extMatch = fileName.match(/\.[a-zA-Z0-9]+$/);
  if (extMatch) {
    const ext = extMatch[0];
    const byExt = adapters.find((a) => a.extensions.includes(ext));
    if (byExt) {
      return byExt;
    }
  }

  return genericAdapter;
}

export function getAdapterByLanguageId(languageId: string): LanguageAdapter {
  return adapters.find((a) => a.languageIds.includes(languageId)) || genericAdapter;
}

export function getSupportedLanguageIds(): string[] {
  return Array.from(new Set(adapters.flatMap((a) => a.languageIds)));
}

export function getScannableAdapters(): LanguageAdapter[] {
  return adapters.filter((a) => a.canScan);
}

export function getReplaceableAdapters(): LanguageAdapter[] {
  return adapters.filter((a) => a.canReplace);
}

export function isPreviewOnlyAdapter(adapter: LanguageAdapter): boolean {
  return adapter.canScan && !adapter.canReplace;
}

export function isReplacementSupported(document: vscode.TextDocument): boolean {
  const adapter = getAdapterForDocument(document);
  return adapter.canReplace;
}

export {
  dartAdapter,
  swiftAdapter,
  kotlinAdapter,
  javaAdapter,
  goAdapter,
  pythonAdapter,
  phpAdapter,
  rubyAdapter,
  jsonAdapter,
  yamlAdapter,
  xmlAdapter,
  svgAdapter,
  markdownAdapter,
};
