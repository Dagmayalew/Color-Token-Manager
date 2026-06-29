import * as vscode from 'vscode';
import { type LanguageAdapter, type LanguageMode } from './types';
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
  genericAdapter,
];

export function registerAdapter(adapter: LanguageAdapter) {
  adapters.push(adapter);
}

export function getAdapterForDocument(document: vscode.TextDocument): LanguageAdapter {
  const fileName = document.fileName || '';
  const extension = getDocumentExtension(fileName);
  const languageMatches = adapters.filter((a) => a.languageIds.includes(document.languageId));

  if (languageMatches.length === 1) {
    return languageMatches[0];
  }

  if (languageMatches.length > 1 && extension) {
    const byLanguageAndExt = languageMatches.find((a) => a.extensions.includes(extension));
    if (byLanguageAndExt) {
      return byLanguageAndExt;
    }
  }

  if (languageMatches.length > 1) {
    return languageMatches[0];
  }

  if (extension) {
    const byExt = adapters.find((a) => a.extensions.includes(extension));
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
  const adapter = getEffectiveAdapterForDocument(document);
  return adapter.canReplace;
}

export function getEffectiveAdapterForDocument(document: vscode.TextDocument): LanguageAdapter {
  const adapter = getAdapterForDocument(document);
  if (!isLanguageEnabled(adapter)) {
    return genericAdapter;
  }

  const mode = getLanguageMode();
  if (mode === 'scanOnly') {
    return { ...adapter, canReplace: false };
  }

  if (mode === 'safe') {
    return isSafelyReplaceableAdapter(adapter) ? adapter : { ...adapter, canReplace: false };
  }

  return adapter;
}

function getDocumentExtension(fileName: string): string | undefined {
  return fileName.match(/\.[a-zA-Z0-9]+$/)?.[0];
}

function isLanguageEnabled(adapter: LanguageAdapter): boolean {
  const enabledLanguages = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string[]>('enabledLanguages');

  if (!Array.isArray(enabledLanguages) || !enabledLanguages.length) {
    return true;
  }

  return adapter.languageIds.some((languageId) => enabledLanguages.includes(languageId));
}

function getLanguageMode(): LanguageMode {
  return (
    vscode.workspace
      .getConfiguration('colorTokenManager')
      .get<LanguageMode>('languageMode', 'safe') ?? 'safe'
  );
}

function isSafelyReplaceableAdapter(adapter: LanguageAdapter): boolean {
  return (
    adapter.canReplace &&
    (adapter.id === 'javascript' ||
      adapter.id === 'typescript' ||
      adapter.id === 'css' ||
      adapter.id === 'html')
  );
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
