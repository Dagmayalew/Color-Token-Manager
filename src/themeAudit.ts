import * as vscode from 'vscode';
import { getContrastRatio } from './colorUtils';
import { normalizeColorValue, readColors } from './colorFile';
import { findUnusedColors } from './tokenTools';
import { type AppColor } from './types';

export type ThemeAuditContrastRisk = {
  theme?: string;
  tokenPath: string;
  tokenValue: string;
  againstTokenPath: string;
  againstTokenValue: string;
  ratio: number;
  level: 'AA' | 'AAA';
};

export type ThemeAuditReport = {
  colorsFile: string;
  totalTokens: number;
  uniqueValues: number;
  duplicateValues: Array<{ value: string; tokens: string[] }>;
  aliases: Array<{ tokenPath: string; aliasOf: string; value: string }>;
  unused: Array<{ tokenPath: string; value: string; aliasOf?: string }>;
  themes: Array<{ name: string; tokenCount: number; missingCounterparts: string[] }>;
  missingThemeCounterparts: Array<{ tokenPath: string; theme: string; expectedTokenPath: string }>;
  contrastRisks: ThemeAuditContrastRisk[];
  suggestedNextActions: string[];
};

const KNOWN_THEME_NAMES = new Set(['light', 'dark']);

export async function buildThemeAuditReport(colorsFileUri: vscode.Uri): Promise<ThemeAuditReport> {
  const colors = await readColors(colorsFileUri);
  const unusedResult = await findUnusedColors(colorsFileUri);
  const themeGroups = groupThemeTokens(colors);
  const missingThemeCounterparts = findMissingThemeCounterparts(themeGroups);
  const contrastRisks = findContrastRisks(colors, themeGroups);
  const duplicateValues = findDuplicateValues(colors);
  const aliases = colors
    .filter((color) => color.aliasOf)
    .map((color) => ({
      tokenPath: color.key,
      aliasOf: color.aliasOf ?? '',
      value: color.value,
    }));

  return {
    colorsFile: vscode.workspace.asRelativePath(colorsFileUri),
    totalTokens: colors.length,
    uniqueValues: new Set(colors.map((color) => normalizeColorValue(color.value))).size,
    duplicateValues,
    aliases,
    unused: unusedResult.unused.map((color) => ({
      tokenPath: color.key,
      value: color.value,
      aliasOf: color.aliasOf,
    })),
    themes: [...themeGroups.entries()].map(([name, group]) => ({
      name,
      tokenCount: group.tokens.length,
      missingCounterparts: missingThemeCounterparts
        .filter((missing) => missing.theme === name)
        .map((missing) => missing.expectedTokenPath),
    })),
    missingThemeCounterparts,
    contrastRisks,
    suggestedNextActions: getSuggestedNextActions({
      colors,
      duplicateValues,
      unusedCount: unusedResult.unused.length,
      missingThemeCounterparts,
      contrastRisks,
      themeCount: themeGroups.size,
    }),
  };
}

export function buildThemeAuditMarkdown(
  report: ThemeAuditReport,
  focus: 'all' | 'contrast',
): string {
  const lines = [
    focus === 'contrast' ? '# Theme Contrast Audit' : '# Theme Token Audit',
    '',
    `Colors file: \`${report.colorsFile}\``,
    `Total color tokens: ${report.totalTokens}`,
    `Unique values: ${report.uniqueValues}`,
    `Aliases: ${report.aliases.length}`,
    `Duplicate value groups: ${report.duplicateValues.length}`,
    `Unused tokens: ${report.unused.length}`,
    `Theme groups: ${report.themes.length}`,
    `Contrast risks: ${report.contrastRisks.length}`,
    '',
  ];

  if (focus === 'contrast') {
    appendContrastSection(lines, report);
    appendNextActions(lines, report);
    return lines.join('\n');
  }

  lines.push('## Theme Groups', '');
  if (!report.themes.length) {
    lines.push(
      'No `light` or `dark` theme groups were detected yet. Use paths like `colors.light.background.primary` or `colors.dark.text.primary` to make tokens theme-aware.',
      '',
    );
  } else {
    for (const theme of report.themes) {
      lines.push(`- \`${theme.name}\`: ${theme.tokenCount} tokens`);
    }
    lines.push('');
  }

  lines.push('## Missing Theme Counterparts', '');
  if (!report.missingThemeCounterparts.length) {
    lines.push('No missing light/dark counterparts found.', '');
  } else {
    for (const missing of report.missingThemeCounterparts) {
      lines.push(`- \`${missing.tokenPath}\` is missing \`${missing.expectedTokenPath}\``);
    }
    lines.push('');
  }

  appendContrastSection(lines, report);

  lines.push('## Duplicate Values', '');
  if (!report.duplicateValues.length) {
    lines.push('No duplicate color values found.', '');
  } else {
    for (const duplicate of report.duplicateValues) {
      lines.push(
        `- \`${duplicate.value}\`: ${duplicate.tokens.map((token) => `\`${token}\``).join(', ')}`,
      );
    }
    lines.push('');
  }

  lines.push('## Unused Tokens', '');
  if (!report.unused.length) {
    lines.push('No unused tokens found.', '');
  } else {
    for (const color of report.unused) {
      lines.push(`- \`${color.tokenPath}\` = \`${color.value}\``);
    }
    lines.push('');
  }

  appendNextActions(lines, report);
  return lines.join('\n');
}

type ThemeTokenGroup = {
  name: string;
  tokens: AppColor[];
  suffixToToken: Map<string, AppColor>;
};

function groupThemeTokens(colors: AppColor[]): Map<string, ThemeTokenGroup> {
  const groups = new Map<string, ThemeTokenGroup>();

  for (const color of colors) {
    const parts = color.key.split('.');
    const themeIndex = parts.findIndex((part) => KNOWN_THEME_NAMES.has(part.toLowerCase()));
    if (themeIndex === -1) {
      continue;
    }

    const name = parts[themeIndex].toLowerCase();
    const suffix = parts.filter((_, index) => index !== themeIndex).join('.');
    const group = groups.get(name) ?? {
      name,
      tokens: [],
      suffixToToken: new Map<string, AppColor>(),
    };
    group.tokens.push(color);
    group.suffixToToken.set(suffix, color);
    groups.set(name, group);
  }

  return groups;
}

function findMissingThemeCounterparts(
  groups: Map<string, ThemeTokenGroup>,
): Array<{ tokenPath: string; theme: string; expectedTokenPath: string }> {
  const light = groups.get('light');
  const dark = groups.get('dark');
  if (!light || !dark) {
    return [];
  }

  return [
    ...findMissingCounterpartsForTheme(light, dark),
    ...findMissingCounterpartsForTheme(dark, light),
  ];
}

function findMissingCounterpartsForTheme(
  source: ThemeTokenGroup,
  target: ThemeTokenGroup,
): Array<{ tokenPath: string; theme: string; expectedTokenPath: string }> {
  const missing: Array<{ tokenPath: string; theme: string; expectedTokenPath: string }> = [];

  for (const [suffix, token] of source.suffixToToken) {
    if (target.suffixToToken.has(suffix)) {
      continue;
    }

    missing.push({
      tokenPath: token.key,
      theme: target.name,
      expectedTokenPath: replaceThemeSegment(token.key, source.name, target.name),
    });
  }

  return missing;
}

function findContrastRisks(
  colors: AppColor[],
  groups: Map<string, ThemeTokenGroup>,
): ThemeAuditContrastRisk[] {
  const level = getContrastLevel();
  const minRatio = level === 'AAA' ? 7 : 4.5;
  const scopedGroups = groups.size
    ? [...groups.values()].map((group) => ({ theme: group.name, tokens: group.tokens }))
    : [{ theme: undefined, tokens: colors }];
  const risks: ThemeAuditContrastRisk[] = [];

  for (const group of scopedGroups) {
    const textTokens = group.tokens.filter(isTextLikeToken);
    const backgroundTokens = group.tokens.filter(isBackgroundLikeToken);
    for (const textToken of textTokens) {
      for (const backgroundToken of backgroundTokens) {
        const ratio = getContrastRatio(textToken.value, backgroundToken.value);
        if (ratio === undefined || ratio >= minRatio) {
          continue;
        }

        risks.push({
          theme: group.theme,
          tokenPath: textToken.key,
          tokenValue: textToken.value,
          againstTokenPath: backgroundToken.key,
          againstTokenValue: backgroundToken.value,
          ratio: Number(ratio.toFixed(2)),
          level,
        });
      }
    }
  }

  return risks;
}

function findDuplicateValues(colors: AppColor[]): Array<{ value: string; tokens: string[] }> {
  const byValue = new Map<string, { value: string; tokens: string[] }>();
  for (const color of colors) {
    const normalized = normalizeColorValue(color.value);
    const entry = byValue.get(normalized) ?? { value: color.value, tokens: [] };
    entry.tokens.push(color.key);
    byValue.set(normalized, entry);
  }

  return [...byValue.values()].filter((entry) => entry.tokens.length > 1);
}

function getSuggestedNextActions(input: {
  colors: AppColor[];
  duplicateValues: Array<{ value: string; tokens: string[] }>;
  unusedCount: number;
  missingThemeCounterparts: Array<{ tokenPath: string; theme: string; expectedTokenPath: string }>;
  contrastRisks: ThemeAuditContrastRisk[];
  themeCount: number;
}): string[] {
  const actions: string[] = [];

  if (!input.themeCount && input.colors.length) {
    actions.push('Introduce light/dark semantic groups for theme-ready color roles.');
  }

  if (input.missingThemeCounterparts.length) {
    actions.push('Add missing light/dark counterparts before relying on theme switching.');
  }

  if (input.contrastRisks.length) {
    actions.push('Fix contrast risks before shipping the affected theme.');
  }

  if (input.duplicateValues.length) {
    actions.push(
      'Convert duplicate values into semantic aliases where the duplicate names are intentional.',
    );
  }

  if (input.unusedCount) {
    actions.push(
      'Review unused tokens and remove only the ones that are not part of the public theme API.',
    );
  }

  return actions.length ? actions : ['No immediate token maintenance actions found.'];
}

function appendContrastSection(lines: string[], report: ThemeAuditReport): void {
  lines.push('## Contrast Risks', '');
  if (!report.contrastRisks.length) {
    lines.push('No contrast risks found for detected text/background token pairs.', '');
    return;
  }

  for (const risk of report.contrastRisks) {
    const theme = risk.theme ? ` (${risk.theme})` : '';
    lines.push(
      `-${theme} \`${risk.tokenPath}\` on \`${risk.againstTokenPath}\`: ${risk.ratio}:1 fails WCAG ${risk.level}`,
    );
  }
  lines.push('');
}

function appendNextActions(lines: string[], report: ThemeAuditReport): void {
  lines.push('## Suggested Next Actions', '');
  for (const action of report.suggestedNextActions) {
    lines.push(`- ${action}`);
  }
}

function replaceThemeSegment(tokenPath: string, fromTheme: string, toTheme: string): string {
  return tokenPath
    .split('.')
    .map((part) => (part.toLowerCase() === fromTheme ? toTheme : part))
    .join('.');
}

function isTextLikeToken(color: AppColor): boolean {
  return (
    /(^|\.)text(\.|$)|(^|\.)foreground(\.|$)|(^|\.)content(\.|$)|(^|\.)label(\.|$)|(^|\.)title(\.|$)|(^|\.)body(\.|$)|(^|\.)muted$/i.test(
      color.key,
    ) && !/(^|\.)background(\.|$)|(^|\.)border(\.|$)|(^|\.)shadow(\.|$)/i.test(color.key)
  );
}

function isBackgroundLikeToken(color: AppColor): boolean {
  return /(^|\.)background(\.|$)|(^|\.)surface(\.|$)|(^|\.)canvas(\.|$)|(^|\.)screen(\.|$)|(^|\.)card(\.|$)|(^|\.)white$|^white$/i.test(
    color.key,
  );
}

function getContrastLevel(): 'AA' | 'AAA' {
  return vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<'AA' | 'AAA'>('contrastLevel', 'AA');
}
