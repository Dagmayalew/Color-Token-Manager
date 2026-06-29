export type ColorType = 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'unknown';

/**
 * Describes the structural style of the token file.
 * - 'colors'  — flat or nested color object (colors.ts)
 * - 'theme'   — single theme object with light/dark or semantic keys (theme.ts)
 * - 'tokens'  — generic design-token file (tokens.ts, designTokens.ts)
 * - 'custom'  — user-controlled; extension does not assume structure
 */
export type TokenFileKind = 'colors' | 'theme' | 'tokens' | 'custom';

/**
 * Controls how generated token references are formatted in source code.
 * - 'flat'   — one-level: colors.primary
 * - 'nested' — multi-level paths: colors.primary.500
 * - 'theme'  — theme-scoped paths: theme.light.background
 * - 'auto'   — detected from the existing token file shape
 */
export type TokenReferenceMode = 'flat' | 'nested' | 'theme' | 'auto';

/**
 * Describes the resolved token target used across extraction, import, and
 * reference-generation steps.
 */
export type TokenTarget = {
  /** Workspace-relative path to the token file. */
  filePath: string;
  /** Exported variable name to read/write (e.g. colors, theme, lightTheme). */
  exportName: string;
  /** Structural kind of the token file. */
  kind: TokenFileKind;
  /** Prefix inserted into generated references (e.g. colors, theme.colors). */
  referencePrefix: string;
  /** Path mode used when generating token names and references. */
  pathMode: TokenReferenceMode;
};

export type AppColor = {
  key: string;
  value: string;
  type: ColorType;
  duplicateOf?: string;
  aliasOf?: string;
};

export type ExtractedColor = {
  value: string;
  type: ColorType;
  start: number;
  end: number;
  suggestedName: string;
  existingTokenName?: string;
  replacementKind?: 'literal' | 'embeddedString' | 'cssLiteral';
  embeddedPrefix?: string;
  embeddedSuffix?: string;
};

export type ColorReplacementPreview = {
  value: string;
  tokenName: string;
  action: 'add' | 'alias' | 'reuse' | 'skip';
  enabled?: boolean;
  line: number;
  start?: number;
  aliasOf?: string;
};

export type FileExtractionPreview = {
  filePath: string;
  fileUri: string;
  adapterId: string;
  languageName: string;
  isPreviewOnly: boolean;
  replacementStatus: 'Replacement enabled' | 'Preview only';
  replacements: ColorReplacementPreview[];
};

export type FolderExtractionPreview = {
  id: string;
  folderPath: string;
  folderUri: string;
  colorsFilePath: string;
  filesScanned: number;
  filesWithColors: number;
  colorsFound: number;
  tokensToAdd: number;
  tokensToReuse: number;
  supportedLanguages?: string[];
  files: FileExtractionPreview[];
};

export type AppliedColorReplacement = {
  value: string;
  tokenName: string;
  action: 'add' | 'alias' | 'reuse';
  line: number;
  fileUri: string;
  aliasOf?: string;
};

export type FileApplyResult = {
  filePath: string;
  fileUri: string;
  replacements: AppliedColorReplacement[];
};

export type FolderApplyResult = {
  id: string;
  folderPath: string;
  colorsFilePath: string;
  filesScanned: number;
  filesChanged: number;
  colorsExtracted: number;
  tokensAdded: number;
  tokensReused: number;
  files: FileApplyResult[];
};

// ── Phase 2: Token file detection ─────────────────────────────────────────────

/** A candidate token/theme file found during workspace detection. */
export type TokenFileCandidate = {
  /** Workspace-relative path to the file. */
  filePath: string;
  kind: TokenFileKind;
  /** Detection confidence score 0–100. */
  confidence: number;
  /** Exported variable names found in the file. */
  exportNames: string[];
  /** Human-readable reason for selection. */
  reason: string;
};

// ── Phase 4: Color series naming ──────────────────────────────────────────────

/** A ranked suggestion for what to name a color token. */
export type TokenNameSuggestion = {
  /** Proposed token name or path (e.g. primary.500, background). */
  name: string;
  confidence: 'high' | 'medium' | 'low';
  /** Explanation for the suggestion. */
  reason: string;
};

// ── Phase 5: Theme-aware extraction preview ───────────────────────────────────

/** One location where a specific color value appears in the project. */
export type ColorOccurrence = {
  filePath: string;
  fileUri: string;
  line: number;
  start: number;
  end: number;
};

/**
 * Full theme-aware plan for a single color value, grouping all occurrences
 * with ranked token name suggestions.
 */
export type ThemeAwareColorPlan = {
  /** The raw color value (e.g. #FFFFFF). */
  colorValue: string;
  /** All locations where this color appears in the project. */
  occurrences: ColorOccurrence[];
  /** Top-ranked suggested token reference (e.g. theme.background). */
  suggestedReference: string;
  /** Alternative references ranked by confidence. */
  alternatives: string[];
  /** Workspace-relative path to the target token file. */
  targetFile: string;
  /** Token path segments (e.g. ['background', 'primary']). */
  tokenPath: string[];
  confidence: 'high' | 'medium' | 'low';
};
