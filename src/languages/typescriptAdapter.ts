import { type LanguageAdapter } from './types';
import { COLOR_VALUE_PATTERN } from '../colorScan';
import { buildColorsImportEdit } from '../importUtils';

export const typescriptAdapter: LanguageAdapter = {
  id: 'typescript',
  displayName: 'TypeScript',
  languageIds: ['typescript', 'typescriptreact'],
  extensions: ['.ts', '.tsx', '.mts', '.cts'],

  canScan: true,
  canReplace: true,

  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],

  buildTokenReference: ({ tokenPath, tokenName }) => {
    const segments = tokenName.split('.');
    let result = tokenPath;
    for (const segment of segments) {
      result += /^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`;
    }
    return result;
  },

  buildImportEdit: ({ document, tokenFilePath, referencePrefix }) => {
    return buildColorsImportEdit(document, tokenFilePath, referencePrefix.split('.')[0]);
  },
};
