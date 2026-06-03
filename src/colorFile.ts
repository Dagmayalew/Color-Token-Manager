import * as vscode from 'vscode';
import {
  Node,
  ObjectLiteralExpression,
  Project,
  PropertyAssignment,
  QuoteKind,
  SyntaxKind
} from 'ts-morph';
import { AppColor } from './types';

const COLOR_FILE_GLOB = '**/colors.ts';
const EXCLUDED_GLOB = '{**/node_modules/**,**/dist/**,**/build/**,**/ios/**,**/android/**}';

export async function findColorFiles(): Promise<vscode.Uri[]> {
  if (!vscode.workspace.workspaceFolders?.length) {
    throw new Error('Open a workspace before using Color Token Manager.');
  }

  return vscode.workspace.findFiles(COLOR_FILE_GLOB, EXCLUDED_GLOB);
}

export async function getConfiguredColorsFile(): Promise<vscode.Uri | null> {
  if (!vscode.workspace.workspaceFolders?.length) {
    throw new Error('Open a workspace before using Color Token Manager.');
  }

  const configuredPath = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string>('colorsFilePath', '')
    .trim();

  if (configuredPath) {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, configuredPath);

    try {
      await vscode.workspace.fs.stat(fileUri);
      return fileUri;
    } catch {
      throw new Error(`Configured colors.ts file was not found: ${configuredPath}`);
    }
  }

  return pickColorsFile();
}

export async function pickColorsFile(): Promise<vscode.Uri | null> {
  const files = await findColorFiles();

  if (!files.length) {
    vscode.window.showErrorMessage('No colors.ts file found in the current workspace.');
    return null;
  }

  if (files.length === 1) {
    return files[0];
  }

  const items = files.map((uri) => ({
    label: vscode.workspace.asRelativePath(uri),
    description: uri.fsPath,
    uri
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select the colors.ts file to manage'
  });

  return selected?.uri ?? null;
}

export async function readColors(fileUri: vscode.Uri): Promise<AppColor[]> {
  const sourceFile = await createSourceFile(fileUri);
  const colorsObject = getColorsObject(sourceFile);
  const firstTokenByValue = new Map<string, string>();
  const literalColors = new Map<string, AppColor>();
  const properties = collectColorProperties(colorsObject);

  for (const { key, property } of properties) {
    const initializer = property.getInitializer();
    if (!initializer || !isStringInitializer(initializer)) {
      continue;
    }

    const value = initializer.getLiteralText();
    const normalized = normalizeColorValue(value);
    const duplicateOf = firstTokenByValue.get(normalized);

    if (!duplicateOf) {
      firstTokenByValue.set(normalized, key);
    }

    literalColors.set(key, {
      key,
      value,
      type: getColorType(value),
      duplicateOf
    });
  }

  for (const { key, property } of properties) {
    if (literalColors.has(key)) {
      continue;
    }

    const initializer = property.getInitializer();
    const aliasOf = initializer ? getColorAliasTarget(initializer) : undefined;
    if (!aliasOf) {
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
      aliasOf
    });
  }

  return Array.from(literalColors.values());
}

export async function addColorToken(fileUri: vscode.Uri, key: string, value: string): Promise<void> {
  if (!validateColorValue(value)) {
    throw new Error('Invalid color value. Use #RGB, #RRGGBB, rgb(255, 255, 255), or rgba(255, 255, 255, 0.5).');
  }

  const sourceFile = await createSourceFile(fileUri);
  const colorsObject = getColorsObject(sourceFile);

  if (findColorProperty(colorsObject, key)) {
    throw new Error(`Color token "${key}" already exists.`);
  }

  addNestedPropertyAssignment(colorsObject, key, quoteColorValue(value, "'"));

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(sourceFile.getFullText(), 'utf8'));
}

export async function addColorAlias(fileUri: vscode.Uri, key: string, targetKey: string): Promise<void> {
  const sourceFile = await createSourceFile(fileUri);
  const colorsObject = getColorsObject(sourceFile);

  if (findColorProperty(colorsObject, key)) {
    throw new Error(`Color token "${key}" already exists.`);
  }

  if (!findColorProperty(colorsObject, targetKey)) {
    throw new Error(`Alias target "${targetKey}" was not found.`);
  }

  addNestedPropertyAssignment(colorsObject, key, `colors.${targetKey}`);

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(sourceFile.getFullText(), 'utf8'));
}

export async function updateColor(fileUri: vscode.Uri, key: string, value: string): Promise<void> {
  if (!validateColorValue(value)) {
    throw new Error('Invalid color value. Use #RGB, #RRGGBB, rgb(255, 255, 255), or rgba(255, 255, 255, 0.5).');
  }

  const sourceFile = await createSourceFile(fileUri);
  const colorsObject = getColorsObject(sourceFile);
  const property = findColorProperty(colorsObject, key);

  if (!property) {
    throw new Error(`Color token "${key}" was not found.`);
  }

  const initializer = property.getInitializer();
  if (!initializer || !isStringInitializer(initializer)) {
    throw new Error(`Color token "${key}" does not contain a supported string color value.`);
  }

  property.setInitializer(quoteColorValue(value, initializer.getText()));
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(sourceFile.getFullText(), 'utf8'));
}

export function validateColorValue(value: string): boolean {
  const trimmed = value.trim();
  const hex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const rgb = /^rgb\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*\)$/;
  const rgba = /^rgba\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/;

  return hex.test(trimmed) || rgb.test(trimmed) || rgba.test(trimmed);
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
  if (!rgbMatch) {
    return trimmed;
  }

  const parts = rgbMatch[1].split(',').map((part) => part.trim());
  if (parts.length === 3) {
    return `rgb(${parts.join(',')})`;
  }

  if (parts.length === 4) {
    const alpha = Number(parts[3]);
    const alphaText = Number.isFinite(alpha) ? String(alpha) : parts[3];
    return `rgba(${parts.slice(0, 3).join(',')},${alphaText})`;
  }

  return trimmed;
}

async function createSourceFile(fileUri: vscode.Uri) {
  const text = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
  const project = new Project({
    manipulationSettings: {
      quoteKind: QuoteKind.Single
    },
    skipAddingFilesFromTsConfig: true
  });

  return project.createSourceFile(fileUri.fsPath, text, { overwrite: true });
}

function getColorsObject(sourceFile: ReturnType<Project['createSourceFile']>): ObjectLiteralExpression {
  const declaration = sourceFile.getVariableDeclaration('colors');

  if (!declaration) {
    throw new Error('Could not find a variable declaration named "colors" in this file.');
  }

  const initializer = declaration.getInitializer();
  const objectLiteral = initializer ? unwrapObjectLiteralInitializer(initializer) : undefined;

  if (!objectLiteral) {
    throw new Error(
      'The "colors" declaration must be initialized with an object literal, for example: export const colors = { primary: "#FF6B00" };'
    );
  }

  return objectLiteral;
}

function unwrapObjectLiteralInitializer(initializer: Node): ObjectLiteralExpression | undefined {
  let current: Node = initializer;

  while (
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isTypeAssertion(current) ||
    Node.isParenthesizedExpression(current)
  ) {
    current = current.getExpression();
  }

  return Node.isObjectLiteralExpression(current) ? current : undefined;
}

function findColorProperty(colorsObject: ObjectLiteralExpression, key: string): PropertyAssignment | undefined {
  return findNestedColorProperty(colorsObject, key);
}

function isStringInitializer(node: Node): node is Node & { getLiteralText(): string } {
  return node.getKind() === SyntaxKind.StringLiteral || node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral;
}

function getColorAliasTarget(node: Node): string | undefined {
  if (!Node.isPropertyAccessExpression(node)) {
    return undefined;
  }

  const text = node.getText();
  if (!text.startsWith('colors.')) {
    return undefined;
  }

  return text.replace(/^colors\./, '');
}

function collectColorProperties(
  objectLiteral: ObjectLiteralExpression,
  prefix = ''
): Array<{ key: string; property: PropertyAssignment }> {
  const collected: Array<{ key: string; property: PropertyAssignment }> = [];

  for (const property of objectLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }

    const key = joinTokenPath(prefix, property.getName());
    const initializer = property.getInitializer();

    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      collected.push(...collectColorProperties(initializer, key));
      continue;
    }

    collected.push({ key, property });
  }

  return collected;
}

function findNestedColorProperty(
  objectLiteral: ObjectLiteralExpression,
  key: string
): PropertyAssignment | undefined {
  const parts = key.split('.').filter(Boolean);
  let current: ObjectLiteralExpression = objectLiteral;

  for (const [index, part] of parts.entries()) {
    const property = current.getProperties().find((candidate): candidate is PropertyAssignment => {
      return Node.isPropertyAssignment(candidate) && candidate.getName() === part;
    });

    if (!property) {
      return undefined;
    }

    if (index === parts.length - 1) {
      return property;
    }

    const initializer = property.getInitializer();
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
      return undefined;
    }

    current = initializer;
  }

  return undefined;
}

function addNestedPropertyAssignment(
  objectLiteral: ObjectLiteralExpression,
  key: string,
  initializer: string
): void {
  const parts = key.split('.').filter(Boolean);
  let current: ObjectLiteralExpression = objectLiteral;

  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) {
      current.addPropertyAssignment({ name: part, initializer });
      return;
    }

    let property = current.getProperties().find((candidate): candidate is PropertyAssignment => {
      return Node.isPropertyAssignment(candidate) && candidate.getName() === part;
    });

    if (!property) {
      property = current.addPropertyAssignment({
        name: part,
        initializer: '{}'
      });
    }

    const next = property.getInitializer();
    if (!next || !Node.isObjectLiteralExpression(next)) {
      throw new Error(`Cannot add nested color token "${key}" because "${part}" is not an object.`);
    }

    current = next;
  }
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

function normalizeHex(value: string): string {
  const hex = value.toUpperCase();

  if (/^#[0-9A-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  return hex;
}
