import { parseColor } from './colorUtils';
import { normalizeColorValue } from './colorFile';
import type {
  ColorOccurrence,
  ExtractedColor,
  ThemeAwareColorPlan,
  TokenFileKind,
  TokenNameSuggestion,
} from './types';

export type SuggestionMode = 'off' | 'semantic' | 'scale' | 'auto';

export type SuggestionOptions = {
  /** Controls which suggestion strategies are active. Defaults to 'auto'. */
  mode?: SuggestionMode;
  fileKind?: TokenFileKind;
};

// ── Palette data (Tailwind-compatible) ────────────────────────────────────────

type Palette = Record<string, Record<number, string>>;

const PALETTES: Palette = {
  primary: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
    950: '#172554',
  },
  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    950: '#030712',
  },
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    950: '#451A03',
  },
  danger: {
    50: '#FFF1F2',
    100: '#FFE4E6',
    200: '#FECDD3',
    300: '#FDA4AF',
    400: '#FB7185',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
  secondary: {
    50: '#F5F3FF',
    100: '#EDE9FE',
    200: '#DDD6FE',
    300: '#C4B5FD',
    400: '#A78BFA',
    500: '#8B5CF6',
    600: '#7C3AED',
    700: '#6D28D9',
    800: '#5B21B6',
    900: '#4C1D95',
    950: '#2E1065',
  },
};

// Flat named colors (not part of a numeric scale)
const NAMED_COLORS: Record<string, string> = {
  '#FFFFFF': 'white',
  '#000000': 'black',
};

// ── Context → semantic name mapping ──────────────────────────────────────────

const SEMANTIC_RULES: Array<{ pattern: RegExp; name: string }> = [
  // Specific semantic categories checked first
  { pattern: /primary/i, name: 'primary' },
  { pattern: /secondary/i, name: 'secondary' },
  { pattern: /success/i, name: 'success' },
  { pattern: /warning/i, name: 'warning' },
  { pattern: /danger|error|destructive/i, name: 'danger' },
  { pattern: /shadow/i, name: 'shadow' },
  { pattern: /overlay|scrim|backdrop/i, name: 'overlay' },
  // Generic role names checked after specific categories
  { pattern: /background/i, name: 'background' },
  { pattern: /surface/i, name: 'surface' },
  { pattern: /\btext\b|foreground|label|caption|body|muted/i, name: 'text' },
  { pattern: /\bcolor\b/i, name: 'text' },
  { pattern: /border|outline|divider|separator/i, name: 'border' },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sanitize a raw string into a valid token name.
 * Removes invalid characters and CamelCases word boundaries.
 */
export function normalizeTokenName(input: string): string {
  const cleaned = input
    .replace(/[^A-Za-z0-9._$]+/g, ' ')
    .trim()
    .replace(/\s+([A-Za-z0-9_$])/g, (_, ch: string) => ch.toUpperCase())
    .replace(/^[^A-Za-z_$]+/, '');
  return cleaned || 'color';
}

/**
 * Infer a semantic token name (e.g. 'background', 'text', 'border') from the
 * usage context string (the ~120 chars immediately before the color literal).
 *
 * Returns undefined when no semantic role can be determined.
 */
export function suggestSemanticName(usageContext: string): string | undefined {
  const match = usageContext.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
  const propName = match?.[1] ?? '';
  for (const { pattern, name } of SEMANTIC_RULES) {
    if (pattern.test(propName)) {
      return name;
    }
  }

  return undefined;
}

/**
 * Match a color value against the built-in palette scales and return the
 * nearest series.step string (e.g. 'primary.500', 'neutral.900').
 *
 * Exact matches are always preferred. Near matches within a perceptual
 * distance threshold of 12 are also returned.
 *
 * Returns undefined when no reasonable palette match is found.
 */
export function suggestSeriesName(colorValue: string): string | undefined {
  const hex = valueToHex(colorValue);
  if (!hex) {
    return undefined;
  }

  const upper = hex.toUpperCase();

  // Exact match first
  for (const [series, scale] of Object.entries(PALETTES)) {
    for (const [step, paletteHex] of Object.entries(scale)) {
      if (paletteHex.toUpperCase() === upper) {
        return `${series}.${step}`;
      }
    }
  }

  // Nearest perceptual match within tolerance
  const nearest = findNearest(upper);
  if (nearest && nearest.distance < 8) {
    return `${nearest.series}.${nearest.step}`;
  }

  return undefined;
}

/**
 * Return a ranked list of token name suggestions for a color value given its
 * usage context (the source text immediately before the color literal).
 *
 * Suggestions are ordered high → medium → low confidence.
 */
export function suggestTokenName(
  colorValue: string,
  usageContext: string,
  options: SuggestionOptions = {},
): TokenNameSuggestion[] {
  const mode = options.mode ?? 'auto';
  const suggestions: TokenNameSuggestion[] = [];

  const hex = valueToHex(colorValue);
  const named = hex ? NAMED_COLORS[hex.toUpperCase()] : undefined;
  const semantic = suggestSemanticName(usageContext);
  const series = mode !== 'off' ? suggestSeriesName(colorValue) : undefined;

  // High: semantic role from property name context
  if (semantic) {
    suggestions.push({
      name: semantic,
      confidence: 'high',
      reason: `Property name suggests semantic role "${semantic}"`,
    });
  }

  // High: well-known named color (white / black)
  if (named && !suggestions.some((s) => s.name === named)) {
    suggestions.push({
      name: named,
      confidence: 'high',
      reason: `Recognized color "${named}"`,
    });
  }

  // Medium: palette scale match
  if (series && mode !== 'semantic' && !suggestions.some((s) => s.name === series)) {
    suggestions.push({
      name: series,
      confidence: 'medium',
      reason: `Matches color palette scale "${series}"`,
    });
  }

  // Low: value-derived fallback (always present)
  if (hex) {
    const fallback = `color${hex.slice(1).toUpperCase()}`;
    if (!suggestions.some((s) => s.name === fallback)) {
      suggestions.push({
        name: fallback,
        confidence: 'low',
        reason: 'Generated from hex value',
      });
    }
  }

  return suggestions;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function valueToHex(value: string): string | undefined {
  const n = normalizeColorValue(value);
  if (/^#[0-9a-fA-F]{6}$/i.test(n)) {
    return n.toUpperCase();
  }

  if (/^#[0-9a-fA-F]{3}$/i.test(n)) {
    const h = n.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }

  const c = parseColor(n);
  if (!c || c.a !== 1) {
    return undefined;
  }

  return `#${hexByte(c.r)}${hexByte(c.g)}${hexByte(c.b)}`.toUpperCase();
}

function hexByte(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0').toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | undefined {
  const c = hex.replace('#', '');
  if (c.length !== 6) {
    return undefined;
  }

  return {
    r: parseInt(c.slice(0, 2), 16),
    g: parseInt(c.slice(2, 4), 16),
    b: parseInt(c.slice(4, 6), 16),
  };
}

function colorDistance(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) {
    return Infinity;
  }

  // Perceptually weighted Euclidean distance
  const dr = (a.r - b.r) * 0.299;
  const dg = (a.g - b.g) * 0.587;
  const db = (a.b - b.b) * 0.114;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function findNearest(hex: string): { series: string; step: string; distance: number } | undefined {
  let best: { series: string; step: string; distance: number } | undefined;
  for (const [series, scale] of Object.entries(PALETTES)) {
    for (const [step, ph] of Object.entries(scale)) {
      const dist = colorDistance(hex, ph);
      if (!best || dist < best.distance) {
        best = { series, step, distance: dist };
      }
    }
  }

  return best;
}

// ── Phase 5: Theme-aware plan builder ────────────────────────────────────────

/**
 * Group a flat list of extracted color literals by value and produce a
 * ranked `ThemeAwareColorPlan` for each unique color, enriched with name
 * suggestions from the naming system.
 *
 * Plans are sorted by occurrence count (most common first).
 */
export function buildThemeAwarePlans(
  extractedColors: ExtractedColor[],
  sourceText: string,
  fileUri: string,
  targetFile: string,
  referencePrefix: string,
): ThemeAwareColorPlan[] {
  // Group occurrences by normalized color value
  const groups = new Map<
    string,
    { rawValue: string; context: string; occurrences: ColorOccurrence[] }
  >();

  for (const color of extractedColors) {
    const key = normalizeColorValue(color.value).toUpperCase();
    if (!groups.has(key)) {
      // Capture up to 120 chars of context before the first occurrence
      const context = sourceText.slice(Math.max(0, color.start - 120), color.start);
      groups.set(key, { rawValue: color.value, context, occurrences: [] });
    }

    groups.get(key)!.occurrences.push({
      filePath: fileUri,
      fileUri,
      line: color.start,
      start: color.start,
      end: color.end,
    });
  }

  const plans: ThemeAwareColorPlan[] = [];

  for (const [, group] of groups) {
    const suggestions = suggestTokenName(group.rawValue, group.context);
    if (!suggestions.length) {
      continue;
    }

    const [top, ...rest] = suggestions;
    const toRef = (name: string) => `${referencePrefix}.${name}`;

    plans.push({
      colorValue: group.rawValue,
      occurrences: group.occurrences,
      suggestedReference: toRef(top.name),
      alternatives: rest.slice(0, 2).map((s) => toRef(s.name)),
      targetFile,
      tokenPath: top.name.split('.'),
      confidence: top.confidence,
    });
  }

  // Most-used colors first
  return plans.sort((a, b) => b.occurrences.length - a.occurrences.length);
}
