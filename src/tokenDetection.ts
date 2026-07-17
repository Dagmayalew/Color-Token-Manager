import * as path from 'path';
import * as vscode from 'vscode';
import {
  type ThemeProviderCandidate,
  type TokenFileCandidate,
  type TokenFileKind,
} from './types';

// Folder names that are never scanned
const IGNORED_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  '.turbo',
  'out',
  'ios',
  'android',
]);

// File name stems (without extension) that may be token files
const TOKEN_FILE_STEMS = new Set([
  'colors',
  'color',
  'theme',
  'themeColors',
  'themes',
  'tokens',
  'design-tokens',
  'designTokens',
  'design-system',
  'designSystem',
  'index',
]);

// Exported names that confirm a file is a token file
const TOKEN_EXPORT_NAMES = new Set([
  'colors',
  'color',
  'theme',
  'themeColors',
  'themes',
  'tokens',
  'lightTheme',
  'darkTheme',
  'designTokens',
]);

// Known paths and their confidence scores
const PATH_SCORES: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /^src\/theme\/theme\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 90 },
  { pattern: /^src\/theme\/index\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 90 },
  { pattern: /^src\/theme\/colors\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 85 },
  { pattern: /^src\/theme\/themeColors\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 85 },
  { pattern: /^src\/constants\/colors\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 85 },
  { pattern: /^src\/styles\/colors\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 80 },
  { pattern: /^src\/tokens?\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 80 },
  { pattern: /^src\/design-tokens?\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 80 },
  { pattern: /^theme\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 70 },
  { pattern: /^themeColors\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 70 },
  { pattern: /^colors\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 70 },
  { pattern: /^tokens?\.(ts|tsx|js|jsx|json|jsonc|ya?ml)$/, score: 70 },
];

/** Extract all `export const/let/var NAME` identifiers from source text. */
export function detectExportNames(fileText: string): string[] {
  const regex = /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fileText))) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

/**
 * Infer the structural kind of a token file from its source text.
 *
 * Priority:
 * 1. Separate light/dark exports → 'theme'
 * 2. Export named `theme` or `themes` → 'theme'
 * 3. Export named `tokens` or `designTokens` → 'tokens'
 * 4. Export containing 'colors' → 'colors'
 * 5. Otherwise → 'custom'
 */
export function detectTokenFileKind(fileText: string): TokenFileKind {
  const jsonKind = detectJsonTokenFileKind(fileText);
  if (jsonKind) {
    return jsonKind;
  }

  const names = detectExportNames(fileText);
  const hasLight = names.some((n) => /light/i.test(n));
  const hasDark = names.some((n) => /dark/i.test(n));
  if (hasLight && hasDark) {
    return 'theme';
  }

  if (names.includes('theme') || names.includes('themes')) {
    return 'theme';
  }

  if (names.some((n) => /^(tokens|designTokens)$/i.test(n))) {
    return 'tokens';
  }

  if (names.some((n) => /colors/i.test(n))) {
    return 'colors';
  }

  return 'custom';
}

/** Return the numeric confidence score for a candidate. */
export function rankTokenFileCandidate(candidate: TokenFileCandidate): number {
  return candidate.confidence;
}

/**
 * Scan the given workspace folder for token/theme file candidates.
 *
 * Files are ranked by confidence (highest first).
 * Ignored folders are skipped. Files are not modified.
 */
export async function findTokenFiles(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<TokenFileCandidate[]> {
  const excludeGlob = `{${[...IGNORED_SEGMENTS].map((s) => `**/${s}/**`).join(',')}}`;
  const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.{ts,tsx,js,jsx,json,jsonc,yaml,yml}');
  const files = await vscode.workspace.findFiles(pattern, excludeGlob);
  const candidates: TokenFileCandidate[] = [];

  for (const fileUri of files) {
    const relativePath = vscode.workspace.asRelativePath(fileUri, false).replace(/\\/g, '/');

    // Skip paths that pass through an ignored folder
    const segments = relativePath.split('/');
    if (segments.some((s) => IGNORED_SEGMENTS.has(s))) {
      continue;
    }

    // Only consider files with a token-like name stem
    const stem = path.basename(relativePath, path.extname(relativePath));
    if (!TOKEN_FILE_STEMS.has(stem)) {
      continue;
    }

    let text: string;
    try {
      text = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
    } catch {
      continue;
    }

    const ext = path.extname(relativePath).toLowerCase();
    const isJsonLike = ext === '.json' || ext === '.jsonc';
    const isYamlLike = ext === '.yaml' || ext === '.yml';
    const exportNames = isJsonLike || isYamlLike ? [stem] : detectExportNames(text);
    if (isJsonLike && !isJsonTokenSource(text)) {
      continue;
    }

    if (isYamlLike && !isYamlTokenSource(text)) {
      continue;
    }

    if (!isJsonLike && !isYamlLike && !exportNames.some((n) => TOKEN_EXPORT_NAMES.has(n))) {
      continue;
    }

    const kind =
      isJsonLike || isYamlLike
        ? (detectStructuredTokenFileKind(text) ?? 'tokens')
        : detectTokenFileKind(text);
    const confidence = computeConfidence(relativePath);
    const reason = buildReason(relativePath, kind, exportNames);
    candidates.push({ filePath: relativePath, kind, confidence, exportNames, reason });
  }

  return candidates.sort((a, b) => rankTokenFileCandidate(b) - rankTokenFileCandidate(a));
}

export async function findThemeProviderFiles(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<ThemeProviderCandidate[]> {
  const excludeGlob = `{${[...IGNORED_SEGMENTS].map((s) => `**/${s}/**`).join(',')}}`;
  const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.{ts,tsx,js,jsx}');
  const files = await vscode.workspace.findFiles(pattern, excludeGlob);
  const candidates: ThemeProviderCandidate[] = [];

  for (const fileUri of files) {
    const relativePath = vscode.workspace.asRelativePath(fileUri, false).replace(/\\/g, '/');
    if (!/(provider|theme-provider|themeprovider)/i.test(relativePath)) {
      continue;
    }

    let text: string;
    try {
      text = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
    } catch {
      continue;
    }

    if (!isThemeProviderSource(text)) {
      continue;
    }

    candidates.push({
      filePath: relativePath,
      confidence: computeProviderConfidence(relativePath),
      reason: buildProviderReason(relativePath),
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function computeConfidence(relativePath: string): number {
  const lower = relativePath.toLowerCase();
  for (const { pattern, score } of PATH_SCORES) {
    if (pattern.test(lower)) {
      return score;
    }
  }

  let score = 50;
  if (/\/(theme|tokens?|styles|constants|design)\//i.test(lower)) {
    score += 15;
  }

  return score;
}

function buildReason(relativePath: string, kind: TokenFileKind, exportNames: string[]): string {
  const base = path.basename(relativePath);
  const shown = exportNames.slice(0, 3).join(', ');
  return `${base} exports [${shown}] detected as ${kind}`;
}

function isJsonTokenSource(fileText: string): boolean {
  const parsed = parseJsonLikeObject(fileText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }

  return containsColorLiteral(parsed) || Object.keys(parsed).some(isThemeRootKey);
}

function detectJsonTokenFileKind(fileText: string): TokenFileKind | undefined {
  return detectStructuredTokenFileKind(fileText);
}

function detectStructuredTokenFileKind(fileText: string): TokenFileKind | undefined {
  const parsed = parseJsonLikeObject(fileText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return detectYamlTokenFileKind(fileText);
  }

  const rootKeys = Object.keys(parsed);
  if (rootKeys.some((key) => key.toLowerCase() === 'light') && rootKeys.some((key) => key.toLowerCase() === 'dark')) {
    return 'theme';
  }

  if (rootKeys.some(isThemeRootKey)) {
    return 'theme';
  }

  return containsColorLiteral(parsed) ? 'tokens' : undefined;
}

function isYamlTokenSource(fileText: string): boolean {
  return Boolean(detectYamlTokenFileKind(fileText));
}

function detectYamlTokenFileKind(fileText: string): TokenFileKind | undefined {
  const rootKeys = new Set<string>();
  let hasColor = false;

  for (const rawLine of fileText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) {
      continue;
    }

    const match = line.match(/^(\s*)(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_$.-]+))\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }

    const indent = match[1].length;
    const key = match[2] ?? match[3] ?? match[4];
    const value = (match[5] ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (indent === 0) {
      rootKeys.add(key);
    }
    if (/^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba?\(|hsla?\()/.test(value)) {
      hasColor = true;
    }
  }

  if (rootKeys.has('light') && rootKeys.has('dark')) {
    return 'theme';
  }

  if ([...rootKeys].some(isThemeRootKey)) {
    return 'theme';
  }

  return hasColor ? 'tokens' : undefined;
}

function parseJsonLikeObject(fileText: string): unknown {
  try {
    return JSON.parse(stripTrailingJsonCommas(stripJsonComments(fileText)));
  } catch {
    return undefined;
  }
}

function stripJsonComments(fileText: string): string {
  let result = '';
  let index = 0;
  let quote: string | undefined;

  while (index < fileText.length) {
    const char = fileText[index];
    const next = fileText[index + 1];

    if (quote) {
      result += char;
      if (char === '\\') {
        result += next ?? '';
        index += 2;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      index++;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      index++;
      continue;
    }

    if (char === '/' && next === '/') {
      const end = fileText.indexOf('\n', index + 2);
      index = end === -1 ? fileText.length : end;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = fileText.indexOf('*/', index + 2);
      index = end === -1 ? fileText.length : end + 2;
      continue;
    }

    result += char;
    index++;
  }

  return result;
}

function stripTrailingJsonCommas(fileText: string): string {
  return fileText.replace(/,\s*([}\]])/g, '$1');
}

function containsColorLiteral(value: unknown): boolean {
  if (typeof value === 'string') {
    return /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba?\(|hsla?\()/.test(value.trim());
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.values(value).some(containsColorLiteral);
}

function isThemeRootKey(key: string): boolean {
  return /^(text|background|surface|border|light|dark|colors)$/i.test(key);
}

function isThemeProviderSource(text: string): boolean {
  return (
    /ThemeProvider/.test(text) ||
    /theme\s*=/.test(text) ||
    /tokens\s*=/.test(text) ||
    /provider/i.test(text)
  );
}

function computeProviderConfidence(relativePath: string): number {
  const lower = relativePath.toLowerCase();
  if (/theme-provider|themeprovider/.test(lower)) {
    return 90;
  }
  if (/provider/.test(lower)) {
    return 75;
  }
  return 60;
}

function buildProviderReason(relativePath: string): string {
  return `${path.basename(relativePath)} looks like a ThemeProvider entry point`;
}
