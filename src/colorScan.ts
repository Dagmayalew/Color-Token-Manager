import * as vscode from 'vscode';
import { getColorType, validateColorValue } from './colorFile';
import { getColorsIdentifier } from './importUtils';
import { type ExtractedColor } from './types';
import { generateTokenName, getContextText } from './colorPlan';

const COLOR_VALUE_PATTERN = String.raw`#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})|rgb\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*\)|rgba\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\)|hsl\(\s*(?:360|3[0-5]\d|[12]?\d?\d)\s*,\s*(?:100|\d?\d)%\s*,\s*(?:100|\d?\d)%\s*\)|hsla\(\s*(?:360|3[0-5]\d|[12]?\d?\d)\s*,\s*(?:100|\d?\d)%\s*,\s*(?:100|\d?\d)%\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\)`;

export type ColorExtractionOptions = {
  includeUnquotedColors?: boolean;
};

export function extractHardcodedColorsFromText(
  text: string,
  options: ColorExtractionOptions = {},
): ExtractedColor[] {
  const ignoredRanges = [...findCommentRanges(text), ...findImportRanges(text)];
  const extractEmbeddedColors = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<boolean>('extractEmbeddedColors', false);
  const colorLiteralRegex = new RegExp(`(['"])(${COLOR_VALUE_PATTERN})\\1`, 'gi');
  const extracted: ExtractedColor[] = [];
  const literalRanges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = colorLiteralRegex.exec(text))) {
    const start = match.index;
    const end = match.index + match[0].length;

    if (isInsideRange(start, ignoredRanges)) {
      continue;
    }

    const value = match[2];
    if (!validateColorValue(value)) {
      continue;
    }

    extracted.push({
      value,
      type: getColorType(value),
      start,
      end,
      suggestedName: generateTokenName(value, getContextText(text, start)),
      replacementKind: 'literal',
    });
    literalRanges.push({ start, end });
  }

  if (extractEmbeddedColors) {
    extracted.push(...extractEmbeddedColorsFromText(text, ignoredRanges, literalRanges));
  }

  if (options.includeUnquotedColors) {
    extracted.push(
      ...extractUnquotedColorsFromText(text, [
        ...ignoredRanges,
        ...findStringRanges(text),
        ...literalRanges,
      ]),
    );
  }

  return extracted;
}

export function findCommentRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let i = 0;
  let quote: string | undefined;

  while (i < text.length) {
    const current = text[i];
    const next = text[i + 1];

    if (quote) {
      if (current === '\\') {
        i += 2;
        continue;
      }

      if (current === quote) {
        quote = undefined;
      }

      i++;
      continue;
    }

    if (current === '"' || current === "'") {
      quote = current;
      i++;
      continue;
    }

    if (current === '/' && next === '/') {
      const start = i;
      const end = text.indexOf('\n', i + 2);
      ranges.push({ start, end: end === -1 ? text.length : end });
      i = end === -1 ? text.length : end;
      continue;
    }

    if (current === '/' && next === '*') {
      const start = i;
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      ranges.push({ start, end });
      i = end;
      continue;
    }

    i++;
  }

  return ranges;
}

export function findImportRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const importRegex = /^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/gm;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(text))) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return ranges;
}

function extractEmbeddedColorsFromText(
  text: string,
  ignoredRanges: Array<{ start: number; end: number }>,
  literalRanges: Array<{ start: number; end: number }>,
): ExtractedColor[] {
  const stringRegex = /(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  const colorRegex = new RegExp(COLOR_VALUE_PATTERN, 'gi');
  const extracted: ExtractedColor[] = [];
  let stringMatch: RegExpExecArray | null;

  while ((stringMatch = stringRegex.exec(text))) {
    const stringStart = stringMatch.index;
    const stringEnd = stringStart + stringMatch[0].length;
    const content = stringMatch[2];

    if (
      isInsideRange(stringStart, ignoredRanges) ||
      isRangeCovered(stringStart, stringEnd, literalRanges)
    ) {
      continue;
    }

    const matches = [...content.matchAll(colorRegex)];
    if (matches.length !== 1) {
      continue;
    }

    const colorMatch = matches[0];
    const value = colorMatch[0];
    if (!validateColorValue(value) || colorMatch.index === undefined) {
      continue;
    }

    extracted.push({
      value,
      type: getColorType(value),
      start: stringStart,
      end: stringEnd,
      suggestedName: generateTokenName(value, getContextText(text, stringStart)),
      replacementKind: 'embeddedString',
      embeddedPrefix: content.slice(0, colorMatch.index),
      embeddedSuffix: content.slice(colorMatch.index + value.length),
    });
  }

  return extracted;
}

function extractUnquotedColorsFromText(
  text: string,
  ignoredRanges: Array<{ start: number; end: number }>,
): ExtractedColor[] {
  const colorRegex = new RegExp(COLOR_VALUE_PATTERN, 'gi');
  const extracted: ExtractedColor[] = [];
  let match: RegExpExecArray | null;

  while ((match = colorRegex.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (isInsideRange(start, ignoredRanges) || isHexSubstring(text, start, end)) {
      continue;
    }

    const value = match[0];
    if (!validateColorValue(value)) {
      continue;
    }

    extracted.push({
      value,
      type: getColorType(value),
      start,
      end,
      suggestedName: generateTokenName(value, getContextText(text, start)),
      replacementKind: 'cssLiteral',
    });
  }

  return extracted;
}

function findStringRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const stringRegex = /(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g;
  let match: RegExpExecArray | null;

  while ((match = stringRegex.exec(text))) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return ranges;
}

function isInsideRange(offset: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function isRangeCovered(
  start: number,
  end: number,
  ranges: Array<{ start: number; end: number }>,
): boolean {
  return ranges.some((range) => start >= range.start && end <= range.end);
}

export function getReplacementText(color: ExtractedColor, tokenName: string): string {
  const reference = `${getColorsIdentifier()}.${tokenName}`;

  if (color.replacementKind === 'cssLiteral') {
    return `var(--color-${toCssVariableSuffix(tokenName)})`;
  }

  if (color.replacementKind === 'embeddedString') {
    return `\`${escapeTemplateText(color.embeddedPrefix ?? '')}\${${reference}}${escapeTemplateText(color.embeddedSuffix ?? '')}\``;
  }

  return reference;
}

function escapeTemplateText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function isHexSubstring(text: string, start: number, end: number): boolean {
  return text[start - 1] === '#' || /[0-9a-fA-F]/.test(text[end] ?? '');
}

function toCssVariableSuffix(tokenName: string): string {
  return tokenName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
