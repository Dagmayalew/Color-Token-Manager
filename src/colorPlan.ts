import * as vscode from 'vscode';
import {
  addColorAlias,
  addColorToken,
  findExistingTokenByValue,
  normalizeColorValue,
  readColors,
} from './colorFile';
import { parseColor } from './colorUtils';
import {
  type AppColor,
  type ExtractedColor,
  type FileExtractionPreview,
  type FolderExtractionPreview,
} from './types';

export type PreviewPlanner = {
  existingColors: AppColor[];
  knownTokenNames: Set<string>;
  tokenByNormalizedValue: Map<string, string>;
};

export function generateTokenName(value: string, contextText = ''): string {
  const prefix = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string>('generatedNamePrefix', '')
    .trim();
  const baseName = getTokenBaseName(value, contextText);
  const tokenName = applyTokenLayerAndTheme(`${prefix}${capitalizeIfNeeded(baseName, prefix)}`);

  return sanitizeTokenPath(tokenName);
}

export function validatePreviewTokenNames(preview: FolderExtractionPreview): void {
  const tokenNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
  const newTokenNames = new Set<string>();

  for (const file of preview.files) {
    for (const replacement of file.replacements) {
      if (
        (replacement.action !== 'add' && replacement.action !== 'alias') ||
        !replacement.tokenName
      ) {
        continue;
      }

      if (replacement.enabled === false) {
        continue;
      }

      if (!tokenNamePattern.test(replacement.tokenName)) {
        throw new Error(`Invalid token name "${replacement.tokenName}".`);
      }

      if (newTokenNames.has(replacement.tokenName)) {
        throw new Error(`Duplicate new token name "${replacement.tokenName}" in preview.`);
      }

      newTokenNames.add(replacement.tokenName);
    }
  }
}

export async function ensurePreviewToken(
  colorsFileUri: vscode.Uri,
  replacement: FileExtractionPreview['replacements'][number],
): Promise<void> {
  const colors = await readColors(colorsFileUri);
  const existing = colors.find((color) => color.key === replacement.tokenName);

  if (existing) {
    return;
  }

  if (replacement.action === 'alias' && replacement.aliasOf) {
    await addColorAlias(colorsFileUri, replacement.tokenName, replacement.aliasOf);
    return;
  }

  if (replacement.action === 'add') {
    const knownTokenNames = new Set(colors.map((color) => color.key));
    await addGeneratedColorToken(
      colorsFileUri,
      replacement.tokenName,
      replacement.value,
      knownTokenNames,
    );
  }
}

export function createPreviewPlanner(existingColors: AppColor[]): PreviewPlanner {
  const tokenByNormalizedValue = new Map<string, string>();

  for (const color of existingColors) {
    const normalized = normalizeColorValue(color.value);
    const current = tokenByNormalizedValue.get(normalized);
    if (!current || scoreReusableTokenName(color.key) > scoreReusableTokenName(current)) {
      tokenByNormalizedValue.set(normalized, color.key);
    }
  }

  return {
    existingColors,
    knownTokenNames: new Set(existingColors.map((color) => color.key)),
    tokenByNormalizedValue,
  };
}

function scoreReusableTokenName(tokenName: string): number {
  const segments = tokenName.split('.');
  let score = 0;

  if (segments.length > 1) {
    score += 10;
  }

  if (/^(text|background|surface|border|icon|tint|shadow)$/i.test(segments[0] ?? '')) {
    score += 8;
  }

  if (/(text|bg|background|surface|border|icon|tint|primary|secondary|muted|inverse)/i.test(tokenName)) {
    score += 4;
  }

  if (/^(primitive|palette|scale|neutral|gray|grey|primary|secondary|success|warning|danger)\b/i.test(tokenName)) {
    score -= 3;
  }

  return score;
}

export function buildPreviewForDocument(
  document: vscode.TextDocument,
  extractedColors: ExtractedColor[],
  planner: PreviewPlanner,
  adapterId = 'generic',
  isPreviewOnly = false,
  languageName = adapterId,
): FileExtractionPreview {
  return buildPreviewForUri(
    document.uri,
    extractedColors,
    planner,
    (offset) => document.positionAt(offset),
    adapterId,
    isPreviewOnly,
    languageName,
  );
}

export function buildPreviewForUri(
  uri: vscode.Uri,
  extractedColors: ExtractedColor[],
  planner: PreviewPlanner,
  positionAt: (offset: number) => { line: number; character: number },
  adapterId = 'generic',
  isPreviewOnly = false,
  languageName = adapterId,
): FileExtractionPreview {
  const autoReplaceExistingColors = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('autoReplaceExistingColors', true);
  const createAliases = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('createSemanticAliases', true);
  const replacements: FileExtractionPreview['replacements'] = [];

  for (const extracted of extractedColors) {
    const suggestedName = getProjectTokenName(extracted.suggestedName, planner.existingColors);
    const normalized = normalizeColorValue(extracted.value);
    const existingToken =
      planner.tokenByNormalizedValue.get(normalized) ??
      findExistingTokenByValue(planner.existingColors, extracted.value)?.key;

    if (existingToken) {
      if (autoReplaceExistingColors) {
        if (
          createAliases &&
          shouldCreateAlias(
            existingToken,
            suggestedName,
            planner.knownTokenNames,
            planner.existingColors,
          )
        ) {
          const tokenName = getUniqueTokenName(suggestedName, planner.knownTokenNames);
          planner.knownTokenNames.add(tokenName);
          planner.tokenByNormalizedValue.set(normalized, tokenName);
          replacements.push({
            value: extracted.value,
            tokenName,
            action: 'alias',
            enabled: !isPreviewOnly,
            aliasOf: existingToken,
            line: positionAt(extracted.start).line + 1,
            start: extracted.start,
          });
        } else {
          replacements.push({
            value: extracted.value,
            tokenName: existingToken,
            action: 'reuse',
            enabled: !isPreviewOnly,
            line: positionAt(extracted.start).line + 1,
            start: extracted.start,
          });
        }
      } else {
        replacements.push({
          value: extracted.value,
          tokenName: existingToken,
          action: 'skip',
          enabled: !isPreviewOnly,
          line: positionAt(extracted.start).line + 1,
          start: extracted.start,
        });
      }
      continue;
    }

    const tokenName = getUniqueTokenName(suggestedName, planner.knownTokenNames);
    planner.knownTokenNames.add(tokenName);
    planner.tokenByNormalizedValue.set(normalized, tokenName);
    replacements.push({
      value: extracted.value,
      tokenName,
      action: 'add',
      enabled: !isPreviewOnly,
      line: positionAt(extracted.start).line + 1,
      start: extracted.start,
    });
  }

  return {
    filePath: vscode.workspace.asRelativePath(uri),
    fileUri: uri.toString(),
    adapterId,
    languageName,
    isPreviewOnly,
    replacementStatus: isPreviewOnly ? 'Preview only' : 'Replacement enabled',
    replacements,
  };
}

export function getContextText(text: string, start: number): string {
  return text.slice(Math.max(0, start - 120), start);
}

function getTokenBaseName(value: string, contextText: string): string {
  const namingStrategy = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<'semantic' | 'contextValue' | 'valueOnly'>('namingStrategy', 'semantic');
  const context = getContextParts(contextText);
  const semanticColor = getSemanticColorName(value);
  const valueSuffix = getValueSuffix(value);

  if (namingStrategy === 'valueOnly') {
    return semanticColor ?? `color${valueSuffix}`;
  }

  if (namingStrategy === 'contextValue') {
    return `${context.flatPrefix}${valueSuffix}`;
  }

  if (context.owner && context.role) {
    return `${context.owner}.${context.role}`;
  }

  if (context.role && semanticColor) {
    return `${context.role}.${semanticColor}`;
  }

  if (context.role) {
    return `${context.role}.${valueSuffix}`;
  }

  return semanticColor ?? `${context.flatPrefix}${valueSuffix}`;
}

function applyTokenLayerAndTheme(tokenName: string): string {
  const configuration = vscode.workspace.getConfiguration('colorTokenManager');
  const tokenLayerMode = configuration.get<'flat' | 'semanticFirst'>('tokenLayerMode', 'flat');
  const themePrefix = sanitizeTokenPath(configuration.get<string>('themeTokenPrefix', '').trim());
  const themedName =
    themePrefix && themePrefix !== 'color' ? `${themePrefix}.${tokenName}` : tokenName;

  return tokenLayerMode === 'semanticFirst' && !themedName.startsWith('semantic.')
    ? `semantic.${themedName}`
    : themedName;
}

export async function addGeneratedColorToken(
  colorsFileUri: vscode.Uri,
  tokenName: string,
  value: string,
  knownTokenNames: Set<string>,
): Promise<void> {
  if (!shouldUsePrimitiveSemanticLayer(tokenName)) {
    await addColorToken(colorsFileUri, tokenName, value);
    return;
  }

  const colors = await readColors(colorsFileUri);
  const existingPrimitive = findExistingTokenByValue(colors, value);
  if (existingPrimitive?.key) {
    await addColorAlias(colorsFileUri, tokenName, existingPrimitive.key);
    return;
  }

  const primitiveName = getUniqueTokenName(getPrimitiveTokenBaseName(value), knownTokenNames);
  await addColorToken(colorsFileUri, primitiveName, value);
  knownTokenNames.add(primitiveName);
  await addColorAlias(colorsFileUri, tokenName, primitiveName);
}

export function getProjectTokenName(suggestedName: string, existingColors: AppColor[]): string {
  return shouldUseNestedTokenPaths(existingColors)
    ? suggestedName
    : flattenTokenPath(suggestedName);
}

export function shouldUseNestedTokenPaths(existingColors: AppColor[]): boolean {
  const configuration = vscode.workspace.getConfiguration('colorTokenManager');
  const tokenPathMode = configuration.get<'auto' | 'flat' | 'nested'>('tokenPathMode', 'auto');
  if (tokenPathMode === 'flat') {
    return false;
  }

  if (tokenPathMode === 'nested') {
    return true;
  }

  const tokenLayerMode = configuration.get<'flat' | 'semanticFirst'>('tokenLayerMode', 'flat');
  const themePrefix = configuration.get<string>('themeTokenPrefix', '').trim();
  return (
    tokenLayerMode === 'semanticFirst' ||
    Boolean(themePrefix) ||
    existingColors.some((color) => color.key.includes('.'))
  );
}

function shouldUsePrimitiveSemanticLayer(tokenName: string): boolean {
  const mode = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<'flat' | 'semanticFirst'>('tokenLayerMode', 'flat');

  return mode === 'semanticFirst' && tokenName.startsWith('semantic.');
}

function getPrimitiveTokenBaseName(value: string): string {
  const hex = valueToHex(value);
  if (!hex) {
    return `primitive.color.${getValueSuffix(value)}`;
  }

  const exact: Record<string, string> = {
    '#000000': 'primitive.neutral.black',
    '#FFFFFF': 'primitive.neutral.white',
    '#6B7280': 'primitive.gray.gray500',
    '#374151': 'primitive.gray.gray700',
    '#111827': 'primitive.gray.gray900',
    '#FF6B00': 'primitive.orange.orange500',
    '#FF3B30': 'primitive.red.red500',
    '#34C759': 'primitive.green.green500',
    '#007AFF': 'primitive.blue.blue500',
  };

  if (exact[hex]) {
    return exact[hex];
  }

  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) =>
    parseInt(part, 16),
  );
  if (Math.max(r, g, b) - Math.min(r, g, b) <= 10) {
    return `primitive.gray.gray${hex.slice(1)}`;
  }

  return `primitive.color.${hex.slice(1)}`;
}

function getContextParts(contextText: string): {
  flatPrefix: string;
  owner?: string;
  role?: string;
} {
  const match = contextText.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
  const propertyName = match?.[1] ?? 'color';
  const owner = getOwnerContextName(contextText, propertyName);
  const role = getRoleName(propertyName);
  const flatPrefix =
    owner && role ? `${owner}${capitalize(role)}` : (role ?? sanitizeTokenName(propertyName));

  return { flatPrefix, owner, role };
}

function getRoleName(propertyName: string): string | undefined {
  if (/background/i.test(propertyName)) {
    return 'background';
  }

  if (/border/i.test(propertyName)) {
    return 'border';
  }

  if (/shadow/i.test(propertyName)) {
    return 'shadow';
  }

  if (/tint/i.test(propertyName)) {
    return 'tint';
  }

  if (propertyName === 'color' || /text/i.test(propertyName)) {
    return 'text';
  }

  return undefined;
}

function getOwnerContextName(contextText: string, currentPropertyName: string): string | undefined {
  const matches = [...contextText.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{/g)];
  const owner = matches
    .map((match) => match[1])
    .filter((name) => !['StyleSheet', 'create', currentPropertyName].includes(name))
    .at(-1);

  return owner ? sanitizeTokenName(owner) : undefined;
}

function getSemanticColorName(value: string): string | undefined {
  const hex = valueToHex(value);
  if (!hex) {
    return undefined;
  }

  const exact: Record<string, string> = {
    '#000000': 'black',
    '#FFFFFF': 'white',
    '#FF6B00': 'primaryOrange',
    '#FF3B30': 'red500',
    '#34C759': 'green500',
    '#007AFF': 'blue500',
    '#8E8E93': 'gray500',
  };

  return exact[hex];
}

function getValueSuffix(value: string): string {
  const hex = valueToHex(value);
  if (hex) {
    return hex.replace('#', '');
  }

  return normalizeColorValue(value)
    .replace(/^(?:rgba?|hsla?)\(/, '')
    .replace(/\)$/, '')
    .split(',')
    .map((part) => part.trim().replace('.', '_'))
    .join('_');
}

function valueToHex(value: string): string | undefined {
  const normalized = normalizeColorValue(value);
  if (normalized.startsWith('#')) {
    return normalized;
  }

  const rgbMatch = normalized.match(/^rgba?\((\d+),(\d+),(\d+)(?:,(.+))?\)$/);
  if (!rgbMatch) {
    const color = parseColor(normalized);
    if (!color || color.a !== 1) {
      return undefined;
    }

    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  }

  const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
  if (alpha !== 1) {
    return undefined;
  }

  return `#${toHex(Number(rgbMatch[1]))}${toHex(Number(rgbMatch[2]))}${toHex(Number(rgbMatch[3]))}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function sanitizeTokenName(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9_$]+/g, ' ')
    .trim()
    .replace(/\s+([A-Za-z0-9_$])/g, (_, character: string) => character.toUpperCase())
    .replace(/^[^A-Za-z_$]+/, '');

  return cleaned || 'color';
}

function sanitizeTokenPath(value: string): string {
  return (
    value
      .split('.')
      .map((part) => sanitizeTokenName(part))
      .filter(Boolean)
      .join('.') || 'color'
  );
}

function capitalizeIfNeeded(baseName: string, prefix: string): string {
  if (!prefix) {
    return baseName;
  }

  return baseName.charAt(0).toUpperCase() + baseName.slice(1);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function shouldCreateAlias(
  existingToken: string,
  suggestedName: string,
  knownTokenNames: Set<string>,
  existingColors: AppColor[] = [],
): boolean {
  if (!shouldUseNestedTokenPaths(existingColors)) {
    return false;
  }

  if (existingToken === suggestedName || knownTokenNames.has(suggestedName)) {
    return false;
  }

  return /[A-Z.]/.test(suggestedName);
}

function flattenTokenPath(tokenPath: string): string {
  const parts = tokenPath.split('.').filter(Boolean);
  if (parts.length <= 1) {
    return tokenPath;
  }

  return sanitizeTokenName(
    parts.map((part, index) => (index === 0 ? part : capitalize(part))).join(''),
  );
}

export function getUniqueTokenName(baseName: string, existingNames: Set<string>): string {
  let tokenName = sanitizeTokenPath(baseName);
  let counter = 2;

  while (existingNames.has(tokenName)) {
    tokenName = `${sanitizeTokenPath(baseName)}${counter}`;
    counter++;
  }

  return tokenName;
}

export function getRangeKey(color: ExtractedColor): string {
  return `${color.start}:${color.end}`;
}
