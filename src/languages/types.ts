import type * as vscode from 'vscode';
import type { ExtractedColor } from '../types';

export type LanguageAdapter = {
  id: string;
  displayName: string;
  languageIds: string[];
  extensions: string[];

  canScan: boolean;
  canReplace: boolean;

  colorPatterns: RegExp[];

  /**
   * Extract colors only from specific contexts (e.g., inline styles in HTML).
   * If not provided, the default extraction logic is used.
   */
  extractInlineStyleColors?: (text: string) => ExtractedColor[];

  buildTokenReference: (input: {
    tokenPath: string;
    tokenName: string;
    tokenParts: string[];
    themeMode?: string;
  }) => string;

  buildImportEdit?: (input: {
    document: vscode.TextDocument;
    tokenFilePath: string;
    referencePrefix: string;
  }) => vscode.TextEdit[];
};

export type LanguageMode = 'safe' | 'scanOnly' | 'experimental';
