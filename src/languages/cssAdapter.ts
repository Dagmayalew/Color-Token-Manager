import * as vscode from 'vscode';
import { type LanguageAdapter } from './types';
import { COLOR_VALUE_PATTERN } from '../colorScan';

export const cssAdapter: LanguageAdapter = {
  id: 'css',
  displayName: 'CSS',
  languageIds: ['css', 'scss', 'less'],
  extensions: ['.css', '.scss', '.less'],

  canScan: true,
  canReplace: true,

  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],

  buildTokenReference: ({ tokenName }) => {
    const format = vscode.workspace
      .getConfiguration('colorTokenManager')
      .get<string>('cssTokenFormat', 'cssVariable');
    const cssVarName = toCssVariableName(tokenName);

    if (format === 'cssVariable') {
      return `var(--color-${cssVarName})`;
    }

    return `var(--color-${cssVarName})`;
  },
};

function toCssVariableName(tokenName: string): string {
  return tokenName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
