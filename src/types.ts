export type ColorType = 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'unknown';

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
