import { type LanguageAdapter } from './types';
import { COLOR_VALUE_PATTERN } from '../colorScan';

export const genericAdapter: LanguageAdapter = {
  id: 'generic',
  displayName: 'Generic',
  languageIds: ['*'],
  extensions: ['.*'],

  canScan: true,
  canReplace: false,

  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],

  buildTokenReference: ({ tokenName }) => {
    return tokenName;
  },
};
