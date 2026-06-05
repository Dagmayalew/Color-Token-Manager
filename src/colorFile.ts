import * as path from 'path';
import * as vscode from 'vscode';
import { type AppColor } from './types';
import { getContextUri, resolveConfiguredFileUri } from './workspaceUtils';

const COLOR_FILE_GLOB = '**/colors.ts';
const EXCLUDED_GLOB = '{**/node_modules/**,**/dist/**,**/build/**,**/ios/**,**/android/**}';

type ParsedObject = {
  start: number;
  end: number;
  properties: ParsedProperty[];
};

type ParsedProperty = {
  key: string;
  propertyStart: number;
  propertyEnd: number;
  valueStart: number;
  valueEnd: number;
  valueText: string;
  child?: ParsedObject;
};

export type ColorsFileTemplateMode = 'flat' | 'nested';

export async function findColorFiles(): Promise<vscode.Uri[]> {
  if (!vscode.workspace.workspaceFolders?.length) {
    throw new Error('Open a workspace before using Color Token Manager.');
  }

  return vscode.workspace.findFiles(COLOR_FILE_GLOB, EXCLUDED_GLOB);
}

export async function getConfiguredColorsFile(contextUri?: vscode.Uri): Promise<vscode.Uri | null> {
  if (!vscode.workspace.workspaceFolders?.length) {
    throw new Error('Open a workspace before using Color Token Manager.');
  }

  const context = getContextUri(contextUri);
  const configuredPath = vscode.workspace
    .getConfiguration('colorTokenManager', context)
    .get<string>('colorsFilePath', '')
    .trim();

  if (configuredPath) {
    const fileUri = resolveConfiguredFileUri(configuredPath, context);

    try {
      await vscode.workspace.fs.stat(fileUri);
      return fileUri;
    } catch {
      throw new Error(`Configured colors.ts file was not found: ${configuredPath}`);
    }
  }

  return pickColorsFile(context);
}

export async function getKnownColorsFile(contextUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return undefined;
  }

  const context = getContextUri(contextUri);
  const configuredPath = vscode.workspace
    .getConfiguration('colorTokenManager', context)
    .get<string>('colorsFilePath', '')
    .trim();

  if (configuredPath) {
    const fileUri = resolveConfiguredFileUri(configuredPath, context);

    try {
      await vscode.workspace.fs.stat(fileUri);
      return fileUri;
    } catch {
      return undefined;
    }
  }

  const files = await findColorFiles();
  if (!files.length) {
    return undefined;
  }

  const workspaceFolder = context ? vscode.workspace.getWorkspaceFolder(context) : undefined;
  if (workspaceFolder) {
    const inFolder = files.filter(
      (file) =>
        vscode.workspace.getWorkspaceFolder(file)?.uri.toString() ===
        workspaceFolder.uri.toString(),
    );
    if (inFolder.length === 1) {
      return inFolder[0];
    }
  }

  return files.length === 1 ? files[0] : undefined;
}

export async function pickColorsFile(contextUri?: vscode.Uri): Promise<vscode.Uri | null> {
  const files = await findColorFiles();

  if (!files.length) {
    vscode.window.showErrorMessage('No colors.ts file found in the current workspace.');
    return null;
  }

  const context = getContextUri(contextUri);
  const workspaceFolder = context ? vscode.workspace.getWorkspaceFolder(context) : undefined;
  const scopedFiles = workspaceFolder
    ? files.filter(
        (file) =>
          vscode.workspace.getWorkspaceFolder(file)?.uri.toString() ===
          workspaceFolder.uri.toString(),
      )
    : files;
  const candidates = scopedFiles.length ? scopedFiles : files;

  if (candidates.length === 1) {
    return candidates[0];
  }

  const items = candidates.map((uri) => ({
    label: vscode.workspace.asRelativePath(uri),
    description: uri.fsPath,
    uri,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select the colors.ts file to manage',
  });

  return selected?.uri ?? null;
}

export async function createColorsFile(
  fileUri: vscode.Uri,
  mode: ColorsFileTemplateMode = 'flat',
): Promise<void> {
  try {
    await vscode.workspace.fs.stat(fileUri);
    throw new Error(`A colors file already exists at ${fileUri.fsPath}.`);
  } catch (error) {
    if (error instanceof Error && !/ENOENT|not found|no such file/i.test(error.message)) {
      throw error;
    }
  }

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(fileUri.fsPath)));
  await writeFileText(fileUri, getColorsFileTemplate(mode));
}

export async function readColors(fileUri: vscode.Uri): Promise<AppColor[]> {
  const text = await readFileText(fileUri);
  const colorsObject = getColorsObject(text);
  const firstTokenByValue = new Map<string, string>();
  const literalColors = new Map<string, AppColor>();
  const aliasTargets = new Map<string, string>();
  const properties = collectColorProperties(colorsObject);

  for (const { key, property } of properties) {
    const value = getStringLiteralText(property.valueText);
    if (value !== undefined) {
      const referenceTarget = getDesignTokenReferenceTarget(value);
      if (referenceTarget) {
        aliasTargets.set(key, referenceTarget);
        continue;
      }

      if (!validateColorValue(value)) {
        continue;
      }

      const normalized = normalizeColorValue(value);
      const duplicateOf = firstTokenByValue.get(normalized);
      if (!duplicateOf) {
        firstTokenByValue.set(normalized, key);
      }

      literalColors.set(key, {
        key,
        value,
        type: getColorType(value),
        duplicateOf,
      });
      continue;
    }

    const aliasOf = getColorAliasTarget(property.valueText);
    if (aliasOf) {
      aliasTargets.set(key, aliasOf);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, aliasOf] of aliasTargets) {
      if (literalColors.has(key)) {
        continue;
      }

      const targetColor = literalColors.get(aliasOf);
      if (!targetColor) {
        continue;
      }

      literalColors.set(key, {
        key,
        value: targetColor.value,
        type: targetColor.type,
        aliasOf,
      });
      changed = true;
    }
  }

  return Array.from(literalColors.values());
}

export async function addColorToken(
  fileUri: vscode.Uri,
  key: string,
  value: string,
): Promise<void> {
  if (!validateColorValue(value)) {
    throw new Error('Invalid color value. Use #RGB, #RRGGBB, rgb(), rgba(), hsl(), or hsla().');
  }

  const text = await readFileText(fileUri);
  const colorsObject = getColorsObject(text);
  if (findColorProperty(colorsObject, key)) {
    throw new Error(`Color token "${key}" already exists.`);
  }

  await writeFileText(
    fileUri,
    addNestedPropertyAssignment(text, colorsObject, key, quoteColorValue(value, "'")),
  );
}

export async function addColorAlias(
  fileUri: vscode.Uri,
  key: string,
  targetKey: string,
): Promise<void> {
  const text = await readFileText(fileUri);
  const colorsObject = getColorsObject(text);

  if (findColorProperty(colorsObject, key)) {
    throw new Error(`Color token "${key}" already exists.`);
  }

  if (!findColorProperty(colorsObject, targetKey)) {
    throw new Error(`Alias target "${targetKey}" was not found.`);
  }

  await writeFileText(
    fileUri,
    addNestedPropertyAssignment(text, colorsObject, key, `colors.${targetKey}`),
  );
}

export async function updateColor(fileUri: vscode.Uri, key: string, value: string): Promise<void> {
  if (!validateColorValue(value)) {
    throw new Error('Invalid color value. Use #RGB, #RRGGBB, rgb(), rgba(), hsl(), or hsla().');
  }

  const text = await readFileText(fileUri);
  const colorsObject = getColorsObject(text);
  const property = findColorProperty(colorsObject, key);
  if (!property) {
    throw new Error(`Color token "${key}" was not found.`);
  }

  const currentValue = getStringLiteralText(property.valueText);
  if (currentValue === undefined || !validateColorValue(currentValue)) {
    throw new Error(`Color token "${key}" does not contain a supported string color value.`);
  }

  await writeFileText(
    fileUri,
    `${text.slice(0, property.valueStart)}${quoteColorValue(value, property.valueText)}${text.slice(property.valueEnd)}`,
  );
}

export async function renameColorToken(
  fileUri: vscode.Uri,
  oldKey: string,
  newKey: string,
): Promise<void> {
  const tokenNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
  if (!tokenNamePattern.test(newKey)) {
    throw new Error(`Invalid token name "${newKey}".`);
  }

  if (oldKey === newKey) {
    return;
  }

  const text = await readFileText(fileUri);
  const colorsObject = getColorsObject(text);
  const oldProperty = findColorProperty(colorsObject, oldKey);
  if (!oldProperty) {
    throw new Error(`Color token "${oldKey}" was not found.`);
  }

  if (findColorProperty(colorsObject, newKey)) {
    throw new Error(`Color token "${newKey}" already exists.`);
  }

  const initializer = oldProperty.valueText.trim();
  const withoutOldProperty = removeProperty(text, oldProperty);
  const reparsed = getColorsObject(withoutOldProperty);
  await writeFileText(
    fileUri,
    addNestedPropertyAssignment(withoutOldProperty, reparsed, newKey, initializer),
  );
}

export function validateColorValue(value: string): boolean {
  const trimmed = value.trim();
  const hex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const rgb =
    /^rgb\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*\)$/;
  const rgba =
    /^rgba\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/;
  const hsl = /^hsl\(\s*(360|3[0-5]\d|[12]?\d?\d)\s*,\s*(100|\d?\d)%\s*,\s*(100|\d?\d)%\s*\)$/i;
  const hsla =
    /^hsla\(\s*(360|3[0-5]\d|[12]?\d?\d)\s*,\s*(100|\d?\d)%\s*,\s*(100|\d?\d)%\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/i;

  return (
    hex.test(trimmed) ||
    rgb.test(trimmed) ||
    rgba.test(trimmed) ||
    hsl.test(trimmed) ||
    hsla.test(trimmed)
  );
}

export function getColorType(value: string): AppColor['type'] {
  const trimmed = value.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return 'hex';
  }

  if (/^rgb\(/i.test(trimmed)) {
    return 'rgb';
  }

  if (/^rgba\(/i.test(trimmed)) {
    return 'rgba';
  }

  if (/^hsl\(/i.test(trimmed)) {
    return 'hsl';
  }

  if (/^hsla\(/i.test(trimmed)) {
    return 'hsla';
  }

  return 'unknown';
}

export function findExistingTokenByValue(colors: AppColor[], value: string): AppColor | undefined {
  const normalized = normalizeColorValue(value);
  return colors.find((color) => normalizeColorValue(color.value) === normalized);
}

export function normalizeColorValue(value: string): string {
  const trimmed = value.trim();

  if (/^#/i.test(trimmed)) {
    return normalizeHex(trimmed);
  }

  const rgbMatch = trimmed.match(/^rgba?\((.*)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    if (parts.length === 3) {
      return `rgb(${parts.join(',')})`;
    }

    if (parts.length === 4) {
      const alpha = Number(parts[3]);
      const alphaText = Number.isFinite(alpha) ? String(alpha) : parts[3];
      return `rgba(${parts.slice(0, 3).join(',')},${alphaText})`;
    }
  }

  const hslMatch = trimmed.match(/^hsla?\((.*)\)$/i);
  if (!hslMatch) {
    return trimmed;
  }

  const hslParts = hslMatch[1].split(',').map((part) => part.trim());
  if (hslParts.length === 3) {
    return `hsl(${hslParts.join(',')})`;
  }

  if (hslParts.length === 4) {
    const alpha = Number(hslParts[3]);
    const alphaText = Number.isFinite(alpha) ? String(alpha) : hslParts[3];
    return `hsla(${hslParts.slice(0, 3).join(',')},${alphaText})`;
  }

  return trimmed;
}

async function readFileText(fileUri: vscode.Uri): Promise<string> {
  return Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
}

async function writeFileText(fileUri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(text, 'utf8'));
}

function getColorsObject(text: string): ParsedObject {
  const declaration = /\b(?:const|let|var)\s+colors\b/g.exec(text);
  if (!declaration) {
    throw new Error('Could not find a variable declaration named "colors" in this file.');
  }

  const equals = findAssignmentEquals(text, declaration.index + declaration[0].length);
  const objectStart = equals === -1 ? -1 : findNextObjectLiteralStart(text, equals + 1);
  if (objectStart === -1) {
    throw new Error(
      'The "colors" declaration must be initialized with an object literal, for example: export const colors = { primary: "#FF6B00" };',
    );
  }

  return parseObject(text, objectStart);
}

function findAssignmentEquals(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    index = skipWhitespaceAndComments(text, index);
    const char = text[index];
    if (char === '=') {
      return index;
    }

    if (char === ';') {
      return -1;
    }

    if (char === '"' || char === "'" || char === '`') {
      index = skipString(text, index);
      continue;
    }

    index++;
  }

  return -1;
}

function findNextObjectLiteralStart(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    index = skipWhitespaceAndComments(text, index);
    if (text[index] === '(') {
      index++;
      continue;
    }

    return text[index] === '{' ? index : -1;
  }

  return -1;
}

function parseObject(text: string, start: number): ParsedObject {
  const properties: ParsedProperty[] = [];
  let index = start + 1;

  while (index < text.length) {
    index = skipWhitespaceAndComments(text, index);
    if (text[index] === '}') {
      return { start, end: index, properties };
    }

    if (text[index] === ',') {
      index++;
      continue;
    }

    const propertyStart = index;
    const keyResult = parsePropertyKey(text, index);
    if (!keyResult) {
      index = skipValue(text, index);
      continue;
    }

    index = skipWhitespaceAndComments(text, keyResult.end);
    if (text[index] !== ':') {
      index = skipValue(text, index);
      continue;
    }

    const valueStart = skipWhitespaceAndComments(text, index + 1);
    let valueEnd: number;
    let child: ParsedObject | undefined;

    if (text[valueStart] === '{') {
      child = parseObject(text, valueStart);
      valueEnd = child.end + 1;
      index = valueEnd;
    } else {
      valueEnd = skipValue(text, valueStart);
      index = valueEnd;
    }

    properties.push({
      key: keyResult.key,
      propertyStart,
      propertyEnd: trimRight(text, valueEnd),
      valueStart,
      valueEnd: trimRight(text, valueEnd),
      valueText: text.slice(valueStart, trimRight(text, valueEnd)),
      child,
    });
  }

  throw new Error('The "colors" object literal is not closed.');
}

function parsePropertyKey(text: string, start: number): { key: string; end: number } | undefined {
  const char = text[start];
  if (char === '"' || char === "'") {
    const end = skipString(text, start);
    return {
      key: unescapeStringContent(text.slice(start + 1, end - 1)),
      end,
    };
  }

  const identifier = text.slice(start).match(/^[A-Za-z_$][A-Za-z0-9_$]*|^\d+/);
  if (!identifier) {
    return undefined;
  }

  return {
    key: identifier[0],
    end: start + identifier[0].length,
  };
}

function skipValue(text: string, start: number): number {
  let index = start;
  let depth = 0;

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' || char === "'" || char === '`') {
      index = skipString(text, index);
      continue;
    }

    if (char === '/' && (next === '/' || next === '*')) {
      index = skipComment(text, index);
      continue;
    }

    if (char === '(' || char === '[' || char === '{') {
      depth++;
      index++;
      continue;
    }

    if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) {
        return index;
      }
      depth--;
      index++;
      continue;
    }

    if (depth === 0 && char === ',') {
      return index;
    }

    index++;
  }

  return index;
}

function skipWhitespaceAndComments(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    if (/\s/.test(text[index])) {
      index++;
      continue;
    }

    if (text[index] === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) {
      index = skipComment(text, index);
      continue;
    }

    break;
  }

  return index;
}

function skipComment(text: string, start: number): number {
  if (text[start + 1] === '/') {
    const end = text.indexOf('\n', start + 2);
    return end === -1 ? text.length : end + 1;
  }

  const end = text.indexOf('*/', start + 2);
  return end === -1 ? text.length : end + 2;
}

function skipString(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }

    if (quote === '`' && text[index] === '$' && text[index + 1] === '{') {
      index = skipTemplateExpression(text, index + 2);
      continue;
    }

    if (text[index] === quote) {
      return index + 1;
    }

    index++;
  }

  return text.length;
}

function skipTemplateExpression(text: string, start: number): number {
  let depth = 1;
  let index = start;

  while (index < text.length && depth > 0) {
    const char = text[index];
    if (char === '"' || char === "'" || char === '`') {
      index = skipString(text, index);
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    }
    index++;
  }

  return index;
}

function collectColorProperties(
  objectLiteral: ParsedObject,
  prefix = '',
): Array<{ key: string; property: ParsedProperty }> {
  const collected: Array<{ key: string; property: ParsedProperty }> = [];

  for (const property of objectLiteral.properties) {
    const key = joinTokenPath(prefix, property.key);
    if (property.child) {
      collected.push(...collectColorProperties(property.child, key));
      continue;
    }

    collected.push({ key, property });
  }

  return collected;
}

function findColorProperty(colorsObject: ParsedObject, key: string): ParsedProperty | undefined {
  const parts = key.split('.').filter(Boolean);
  let current: ParsedObject | undefined = colorsObject;

  for (const [index, part] of parts.entries()) {
    const property: ParsedProperty | undefined = current?.properties.find(
      (candidate) => candidate.key === part,
    );
    if (!property) {
      return undefined;
    }

    if (index === parts.length - 1) {
      return property;
    }

    current = property.child;
  }

  return undefined;
}

function addNestedPropertyAssignment(
  text: string,
  objectLiteral: ParsedObject,
  key: string,
  initializer: string,
): string {
  const parts = key.split('.').filter(Boolean);
  if (!parts.length) {
    throw new Error('Color token name cannot be empty.');
  }

  return addPropertyPath(text, objectLiteral, parts, initializer);
}

function addPropertyPath(
  text: string,
  objectLiteral: ParsedObject,
  parts: string[],
  initializer: string,
): string {
  const [head, ...rest] = parts;
  if (!rest.length) {
    return insertProperty(text, objectLiteral, head, initializer);
  }

  const existing = objectLiteral.properties.find((property) => property.key === head);
  if (existing) {
    if (!existing.child) {
      throw new Error(
        `Cannot add nested color token "${parts.join('.')}" because "${head}" is not an object.`,
      );
    }
    return addPropertyPath(text, existing.child, rest, initializer);
  }

  return insertProperty(
    text,
    objectLiteral,
    head,
    createNestedInitializer(text, objectLiteral, rest, initializer),
  );
}

function insertProperty(
  text: string,
  objectLiteral: ParsedObject,
  key: string,
  initializer: string,
): string {
  const objectIndent = getLineIndent(text, objectLiteral.start);
  const propertyIndent = `${objectIndent}  `;
  const insertAt = trimRight(text, objectLiteral.end);
  const lastProperty = objectLiteral.properties.at(-1);
  const needsComma = Boolean(
    lastProperty && !hasTrailingCommaAfterProperty(text, lastProperty, insertAt),
  );
  const propertyText = `${needsComma ? ',' : ''}\n${propertyIndent}${formatPropertyName(key)}: ${indentInitializer(initializer, propertyIndent)},\n${objectIndent}`;

  return `${text.slice(0, insertAt)}${propertyText}${text.slice(insertAt)}`;
}

function hasTrailingCommaAfterProperty(
  text: string,
  property: ParsedProperty,
  end: number,
): boolean {
  let index = property.propertyEnd;

  while (index < end) {
    const char = text[index];
    if (char === ',') {
      return true;
    }

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) {
      index = skipComment(text, index);
      continue;
    }

    return false;
  }

  return false;
}

function createNestedInitializer(
  text: string,
  objectLiteral: ParsedObject,
  parts: string[],
  initializer: string,
): string {
  const objectIndent = getLineIndent(text, objectLiteral.start);
  return createNestedInitializerFromIndent(parts, initializer, `${objectIndent}  `);
}

function createNestedInitializerFromIndent(
  parts: string[],
  initializer: string,
  indent: string,
): string {
  const [head, ...rest] = parts;
  if (!head) {
    return initializer;
  }

  const childIndent = `${indent}  `;
  if (!rest.length) {
    return `{\n${childIndent}${formatPropertyName(head)}: ${initializer},\n${indent}}`;
  }

  return `{\n${childIndent}${formatPropertyName(head)}: ${createNestedInitializerFromIndent(rest, initializer, childIndent)},\n${indent}}`;
}

function indentInitializer(initializer: string, propertyIndent: string): string {
  return initializer.replace(/\n/g, `\n${propertyIndent}`);
}

function removeProperty(text: string, property: ParsedProperty): string {
  let start = property.propertyStart;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  if (/^\s*$/.test(text.slice(lineStart, start))) {
    start = lineStart;
  }

  let end = property.propertyEnd;
  while (/\s/.test(text[end] ?? '') && text[end] !== '\n') {
    end++;
  }

  if (text[end] === ',') {
    end++;
  }

  while (text[end] === ' ' || text[end] === '\t' || text[end] === '\r') {
    end++;
  }

  if (text[end] === '\n') {
    end++;
  }

  return `${text.slice(0, start)}${text.slice(end)}`;
}

function getStringLiteralText(valueText: string): string | undefined {
  const trimmed = valueText.trim();
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'" && quote !== '`') || trimmed.at(-1) !== quote) {
    return undefined;
  }

  if (quote === '`' && /\$\{/.test(trimmed)) {
    return undefined;
  }

  return unescapeStringContent(trimmed.slice(1, -1));
}

function getColorAliasTarget(valueText: string): string | undefined {
  const match = valueText
    .trim()
    .match(/^colors\.([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)$/);
  return match?.[1];
}

function getDesignTokenReferenceTarget(value: string): string | undefined {
  const match = value
    .trim()
    .match(/^\{([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\}$/);
  return match?.[1];
}

function joinTokenPath(prefix: string, name: string): string {
  return prefix ? `${prefix}.${name}` : name;
}

function quoteColorValue(value: string, previousText: string): string {
  const quote = previousText.trim().startsWith('"') ? '"' : "'";
  return `${quote}${escapeForQuotedString(value, quote)}${quote}`;
}

function escapeForQuotedString(value: string, quote: string): string {
  return value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), `\\${quote}`);
}

function unescapeStringContent(value: string): string {
  return value.replace(/\\(['"`\\])/g, '$1');
}

function formatPropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${escapeForQuotedString(name, "'")}'`;
}

function getLineIndent(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', offset) + 1;
  return text.slice(lineStart, offset).match(/^\s*/)?.[0] ?? '';
}

function trimRight(text: string, end: number): number {
  let index = end;
  while (index > 0 && /\s/.test(text[index - 1])) {
    index--;
  }
  return index;
}

function normalizeHex(value: string): string {
  const hex = value.toUpperCase();

  if (/^#[0-9A-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  return hex;
}

function getColorsFileTemplate(mode: ColorsFileTemplateMode): string {
  if (mode === 'nested') {
    return `export const colors = {
  brand: {
    primary: 'rgba(44, 46, 123, 1)',
  },
  background: {
    white: 'rgba(255, 255, 255, 1)',
  },
  text: {
    black: 'rgba(0, 0, 0, 1)',
  },
} as const;
`;
  }

  return `export const colors = {
  primary: 'rgba(44, 46, 123, 1)',
  black: 'rgba(0, 0, 0, 1)',
  white: 'rgba(255, 255, 255, 1)',
} as const;
`;
}
