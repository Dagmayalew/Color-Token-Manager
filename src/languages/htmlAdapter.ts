import { type LanguageAdapter } from './types';
import { COLOR_VALUE_PATTERN } from '../colorScan';
import { getColorType, validateColorValue } from '../colorFile';
import { generateTokenName } from '../colorPlan';
import type { ExtractedColor } from '../types';

const COLOR_REGEX = new RegExp(COLOR_VALUE_PATTERN, 'gi');

/**
 * Extracts colors ONLY from inline style attributes in HTML.
 * Colors in text content, scripts, comments, or anywhere else are ignored.
 */
function extractInlineStyleColors(text: string): ExtractedColor[] {
  const extracted: ExtractedColor[] = [];

  // Match style="..." or style='...' attributes
  // Handles both double and single quotes, and allows escaped quotes within
  const styleAttrRegex = /style\s*=\s*(["'])([\s\S]*?)(?<!\\)\1/gi;
  let match: RegExpExecArray | null;

  while ((match = styleAttrRegex.exec(text)) !== null) {
    const attrStart = match.index;
    const styleValue = match[2];
    const quoteChar = match[1];

    // Find the start of the style value content (after the opening quote)
    const valueStartInAttr = match[0].indexOf(quoteChar) + 1;
    const valueStart = attrStart + valueStartInAttr;

    // Find color matches within the style value
    const colorMatches = [...styleValue.matchAll(COLOR_REGEX)];

    for (const colorMatch of colorMatches) {
      if (colorMatch.index === undefined) {
        continue;
      }

      const value = colorMatch[0];
      if (!validateColorValue(value)) {
        continue;
      }

      // Calculate absolute position in the original text
      const colorStart = valueStart + colorMatch.index;
      const colorEnd = colorStart + value.length;

      // Create a context for token naming (show some surrounding style content)
      const contextStart = Math.max(0, colorStart - 20);
      const contextEnd = Math.min(text.length, colorEnd + 20);
      const context = text.slice(contextStart, contextEnd);

      extracted.push({
        value,
        type: getColorType(value),
        start: colorStart,
        end: colorEnd,
        suggestedName: generateTokenName(value, context),
        replacementKind: 'cssLiteral',
      });
    }
  }

  return extracted;
}

export const htmlAdapter: LanguageAdapter = {
  id: 'html',
  displayName: 'HTML',
  languageIds: ['html'],
  extensions: ['.html', '.htm'],

  canScan: true,
  canReplace: true,

  colorPatterns: [], // Not used when extractInlineStyleColors is defined

  extractInlineStyleColors,

  buildTokenReference: ({ tokenName }) => {
    const cssVarName = tokenName
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `var(--color-${cssVarName})`;
  },
};
