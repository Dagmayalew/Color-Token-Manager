import { type LanguageAdapter } from './types';
import { COLOR_VALUE_PATTERN } from '../colorScan';

export const dartAdapter: LanguageAdapter = {
  id: 'dart',
  displayName: 'Dart',
  languageIds: ['dart'],
  extensions: ['.dart'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return `AppColors.${cssVarName}`;
  },
};

export const swiftAdapter: LanguageAdapter = {
  id: 'swift',
  displayName: 'Swift',
  languageIds: ['swift'],
  extensions: ['.swift'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1$2')
      .replace(/[^A-Za-z0-9]+/g, '')
      .replace(/^-+|-+$/g, '');
    return `ColorToken.${cssVarName}`;
  },
};

export const kotlinAdapter: LanguageAdapter = {
  id: 'kotlin',
  displayName: 'Kotlin',
  languageIds: ['kotlin'],
  extensions: ['.kt', '.kts'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z])([A-Z])/g, '$1$2')
      .replace(/[^A-Za-z0-9]+/g, '')
      .replace(/^-+|-+$/g, '');
    // Convert camelCase to PascalCase
    const pascalCase = cssVarName.charAt(0).toUpperCase() + cssVarName.slice(1);
    return `ColorTokens.${pascalCase}`;
  },
};

export const javaAdapter: LanguageAdapter = {
  id: 'java',
  displayName: 'Java',
  languageIds: ['java'],
  extensions: ['.java'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return `ColorTokens.${cssVarName}`;
  },
};

export const goAdapter: LanguageAdapter = {
  id: 'go',
  displayName: 'Go',
  languageIds: ['go'],
  extensions: ['.go'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z])([A-Z])/g, '$1$2')
      .replace(/[^A-Za-z0-9]+/g, '')
      .replace(/^-+|-+$/g, '');
    // Convert camelCase to PascalCase
    const pascalCase = cssVarName.charAt(0).toUpperCase() + cssVarName.slice(1);
    return `ColorTokens.${pascalCase}`;
  },
};

export const pythonAdapter: LanguageAdapter = {
  id: 'python',
  displayName: 'Python',
  languageIds: ['python'],
  extensions: ['.py'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return `ColorTokens.${cssVarName}`;
  },
};

export const phpAdapter: LanguageAdapter = {
  id: 'php',
  displayName: 'PHP',
  languageIds: ['php'],
  extensions: ['.php'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1$2')
      .replace(/[^A-Za-z0-9]+/g, '')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `$colorTokens->${cssVarName}`;
  },
};

export const rubyAdapter: LanguageAdapter = {
  id: 'ruby',
  displayName: 'Ruby',
  languageIds: ['ruby'],
  extensions: ['.rb'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return `ColorTokens::${cssVarName}`;
  },
};

export const jsonAdapter: LanguageAdapter = {
  id: 'json',
  displayName: 'JSON',
  languageIds: ['json'],
  extensions: ['.json'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    return tokenName;
  },
};

export const yamlAdapter: LanguageAdapter = {
  id: 'yaml',
  displayName: 'YAML',
  languageIds: ['yaml'],
  extensions: ['.yaml', '.yml'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    return tokenName;
  },
};

export const xmlAdapter: LanguageAdapter = {
  id: 'xml',
  displayName: 'XML',
  languageIds: ['xml'],
  extensions: ['.xml'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `var(--color-${cssVarName})`;
  },
};

export const svgAdapter: LanguageAdapter = {
  id: 'svg',
  displayName: 'SVG',
  languageIds: ['xml'], // SVG uses XML language ID
  extensions: ['.svg'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `var(--color-${cssVarName})`;
  },
};

export const markdownAdapter: LanguageAdapter = {
  id: 'markdown',
  displayName: 'Markdown',
  languageIds: ['markdown'],
  extensions: ['.md'],
  canScan: true,
  canReplace: false,
  colorPatterns: [new RegExp(COLOR_VALUE_PATTERN, 'gi')],
  buildTokenReference: ({ tokenName }) => {
    return tokenName;
  },
};