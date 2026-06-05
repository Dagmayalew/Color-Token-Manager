import * as fs from 'fs';
import * as path from 'path';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type Token = { key: string; value: string; aliasOf?: string };
type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

const VERSION = '0.2.0';
const EXPORT_FORMATS = new Set(['json', 'css', 'tailwind', 'figma', 'w3c']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.css', '.scss', '.less']);
const COLOR_PATTERN = String.raw`#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})|rgb\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*\)|rgba\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\)|hsl\(\s*(?:360|3[0-5]\d|[12]?\d?\d)\s*,\s*(?:100|\d?\d)%\s*,\s*(?:100|\d?\d)%\s*\)|hsla\(\s*(?:360|3[0-5]\d|[12]?\d?\d)\s*,\s*(?:100|\d?\d)%\s*,\s*(?:100|\d?\d)%\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\)`;

const options = parseArgs(process.argv.slice(2));
let frameBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk: Buffer | string) => {
  frameBuffer = Buffer.concat([frameBuffer, Buffer.from(chunk)]);
  void flushFrames();
});

async function flushFrames(): Promise<void> {
  while (true) {
    const headerEnd = frameBuffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const header = frameBuffer.slice(0, headerEnd).toString('utf8');
    const lengthMatch = header.match(/content-length:\s*(\d+)/i);
    if (!lengthMatch) {
      throw new Error('Invalid MCP frame: missing Content-Length header.');
    }

    const length = Number(lengthMatch[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (frameBuffer.length < bodyEnd) {
      return;
    }

    const body = frameBuffer.slice(bodyStart, bodyEnd).toString('utf8');
    frameBuffer = frameBuffer.slice(bodyEnd);
    await handleMessage(JSON.parse(body) as JsonRpcRequest);
  }
}

async function handleMessage(message: JsonRpcRequest): Promise<void> {
  if (!message.id && message.id !== 0) {
    return;
  }

  try {
    const result = await dispatch(message);
    writeResponse({ jsonrpc: '2.0', id: message.id, result });
  } catch (error) {
    writeResponse({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function dispatch(message: JsonRpcRequest): Promise<JsonValue> {
  if (message.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'color-token-manager', version: VERSION },
      capabilities: { resources: {}, tools: {} },
    };
  }

  if (message.method === 'resources/list') {
    return { resources: listResources() };
  }

  if (message.method === 'resources/read') {
    const uri = getRequiredString(asRecord(message.params), 'uri');
    return {
      contents: [
        {
          uri,
          mimeType: uri.endsWith('/css') ? 'text/css' : 'application/json',
          text: JSON.stringify(await readResource(uri), null, 2),
        },
      ],
    };
  }

  if (message.method === 'tools/list') {
    return { tools: listTools() };
  }

  if (message.method === 'tools/call') {
    const params = asRecord(message.params);
    const name = getRequiredString(params, 'name');
    return callTool(name, asRecord(params.arguments)) as unknown as JsonValue;
  }

  throw new Error(`Unsupported MCP method: ${String(message.method)}`);
}

async function readResource(uri: string): Promise<JsonValue> {
  const tokens = readTokens();

  if (uri === 'colors://help') {
    return helpResource();
  }

  if (uri === 'colors://tokens') {
    return {
      colorsFile: relativePath(colorsFilePath()),
      tokens: toNestedObject(tokens) as JsonValue,
      flat: flat(tokens),
    };
  }

  if (uri === 'colors://tokens/flat') {
    return flat(tokens);
  }

  if (uri === 'colors://tokens/unused') {
    const used = findUsedTokens(tokens);
    return {
      total: tokens.length,
      unused: tokens
        .filter((token) => !used.has(token.key))
        .map((token) => ({ path: token.key, value: token.value, aliasOf: token.aliasOf ?? null })),
    };
  }

  const exportMatch = uri.match(/^colors:\/\/exports\/([a-z]+)$/);
  if (exportMatch && EXPORT_FORMATS.has(exportMatch[1])) {
    return {
      format: exportMatch[1],
      colorsFile: relativePath(colorsFilePath()),
      content: serializeTokens(tokens, exportMatch[1]),
    };
  }

  throw new Error(`Unknown MCP resource: ${uri}`);
}

function callTool(name: string, args: Record<string, unknown>): JsonValue {
  if (typeof args.dryRun !== 'boolean') {
    throw new Error('MCP tools require an explicit dryRun boolean parameter.');
  }

  if (args.dryRun === false) {
    throw new Error('Standalone MCP server is read-only. Re-run with dryRun: true.');
  }

  if (name === 'extract_from_file') {
    const targetPath = resolveWorkspacePath(getRequiredString(args, 'path'));
    const text = fs.readFileSync(targetPath, 'utf8');
    const tokens = readTokens();
    const byValue = new Map(tokens.map((token) => [normalizeColorValue(token.value), token.key]));
    const replacements = extractColors(text).map((color) => {
      const existing = byValue.get(normalizeColorValue(color.value));
      return {
        value: color.value,
        tokenName:
          existing ??
          suggestName(color.value, text.slice(Math.max(0, color.start - 120), color.start)),
        action: existing ? 'reuse' : 'add',
        line: lineAt(text, color.start),
        start: color.start,
      };
    });

    return {
      dryRun: true,
      colorsFile: relativePath(colorsFilePath()),
      file: relativePath(targetPath),
      colorsFound: replacements.length,
      tokensToAdd: replacements.filter((replacement) => replacement.action === 'add').length,
      tokensToReuse: replacements.filter((replacement) => replacement.action === 'reuse').length,
      preview: { filePath: relativePath(targetPath), replacements },
    };
  }

  if (name === 'suggest_token_name') {
    const context = getRequiredString(args, 'context');
    const extracted = extractColors(context);
    const colorValue =
      typeof args.colorValue === 'string' && validateColorValue(args.colorValue)
        ? args.colorValue
        : (extracted[0]?.value ?? '#000000');
    const primary = suggestName(colorValue, context);
    return {
      colorValue,
      candidates: Array.from(
        new Set([primary, `semantic.${primary}`, `${primary}.${valueSuffix(colorValue)}`]),
      ).slice(0, 3),
    };
  }

  if (name === 'get_contrast') {
    const tokenPath = getRequiredString(args, 'tokenPath');
    const againstTokenPath = getRequiredString(args, 'againstTokenPath');
    const byPath = new Map(readTokens().map((token) => [token.key, token]));
    const token = byPath.get(tokenPath);
    const against = byPath.get(againstTokenPath);
    if (!token) {
      throw new Error(`Color token "${tokenPath}" was not found.`);
    }
    if (!against) {
      throw new Error(`Color token "${againstTokenPath}" was not found.`);
    }

    const ratio = getContrastRatio(token.value, against.value);
    if (ratio === undefined) {
      throw new Error(`Could not calculate contrast for ${token.value} on ${against.value}.`);
    }

    return {
      tokenPath,
      tokenValue: token.value,
      againstTokenPath,
      againstTokenValue: against.value,
      ratio: Number(ratio.toFixed(2)),
      wcag: {
        AA: { normalText: ratio >= 4.5, largeText: ratio >= 3 },
        AAA: { normalText: ratio >= 7, largeText: ratio >= 4.5 },
      },
    };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

function listResources(): JsonValue[] {
  return [
    { uri: 'colors://help', name: 'Color Token Manager MCP help', mimeType: 'application/json' },
    { uri: 'colors://tokens', name: 'Color tokens', mimeType: 'application/json' },
    { uri: 'colors://tokens/flat', name: 'Flat color token map', mimeType: 'application/json' },
    { uri: 'colors://tokens/unused', name: 'Unused color tokens', mimeType: 'application/json' },
    ...Array.from(EXPORT_FORMATS).map((format) => ({
      uri: `colors://exports/${format}`,
      name: `Color token ${format} export`,
      mimeType: format === 'css' ? 'text/css' : 'application/json',
    })),
  ];
}

function listTools(): JsonValue[] {
  return [
    {
      name: 'extract_from_file',
      description: 'Preview hardcoded color extraction for a workspace file.',
      inputSchema: {
        type: 'object',
        properties: { dryRun: { type: 'boolean' }, path: { type: 'string' } },
        required: ['dryRun', 'path'],
      },
    },
    {
      name: 'suggest_token_name',
      description: 'Suggest semantic token names from surrounding code.',
      inputSchema: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean' },
          context: { type: 'string' },
          colorValue: { type: 'string' },
        },
        required: ['dryRun', 'context'],
      },
    },
    {
      name: 'get_contrast',
      description: 'Calculate WCAG contrast between two color tokens.',
      inputSchema: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean' },
          tokenPath: { type: 'string' },
          againstTokenPath: { type: 'string' },
        },
        required: ['dryRun', 'tokenPath', 'againstTokenPath'],
      },
    },
  ];
}

function helpResource(): JsonValue {
  return {
    summary: 'Read Color Token Manager tokens and run safe token analysis from an AI coding agent.',
    workspace: options.workspace,
    colorsFile: relativePath(colorsFilePath()),
    safeWorkflow: [
      'Read colors://tokens or colors://tokens/flat before suggesting token edits.',
      'Use colors://tokens/unused before proposing token cleanup.',
      'Use extract_from_file with dryRun: true to preview extraction.',
      'Use get_contrast before changing foreground/background pairs.',
    ],
    resources: listResources(),
    tools: listTools(),
    examplePrompts: [
      'List unused color tokens.',
      'Preview extracting colors from src/components/Button.tsx with dryRun true.',
      'Pick one text-like token and one background-like token from colors://tokens/flat, then check their contrast.',
    ],
  };
}

function readTokens(): Token[] {
  const text = fs.readFileSync(colorsFilePath(), 'utf8');
  const objectStart = findColorsObjectStart(text);
  const tokens = parseObjectTokens(text, objectStart);
  const literals = new Map(
    tokens.filter((token) => !token.aliasOf).map((token) => [token.key, token]),
  );

  return tokens.map((token) => {
    if (!token.aliasOf) {
      return token;
    }

    const target = literals.get(token.aliasOf);
    return target ? { ...token, value: target.value } : token;
  });
}

function findColorsObjectStart(text: string): number {
  const declaration = /\b(?:export\s+)?(?:const|let|var)\s+colors\b/g.exec(text);
  if (!declaration) {
    throw new Error('Could not find a colors object in colors.ts.');
  }

  const start = text.indexOf('{', declaration.index);
  if (start === -1) {
    throw new Error('Could not find the colors object literal.');
  }
  return start;
}

function parseObjectTokens(text: string, start: number, prefix = ''): Token[] {
  const tokens: Token[] = [];
  let index = start + 1;

  while (index < text.length) {
    index = skipWhitespace(text, index);
    if (text[index] === '}') {
      return tokens;
    }
    if (text[index] === ',') {
      index++;
      continue;
    }

    const key = parseKey(text, index);
    if (!key) {
      index++;
      continue;
    }
    index = skipWhitespace(text, key.end);
    if (text[index] !== ':') {
      continue;
    }
    index = skipWhitespace(text, index + 1);
    const tokenPath = prefix ? `${prefix}.${key.value}` : key.value;

    if (text[index] === '{') {
      tokens.push(...parseObjectTokens(text, index, tokenPath));
      index = skipBalanced(text, index);
      continue;
    }

    const valueEnd = skipValue(text, index);
    const rawValue = text.slice(index, valueEnd).trim();
    const literal = parseStringLiteral(rawValue);
    if (literal && validateColorValue(literal)) {
      tokens.push({ key: tokenPath, value: literal });
    } else {
      const alias = rawValue.match(/\bcolors\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\b/);
      if (alias) {
        tokens.push({ key: tokenPath, value: '', aliasOf: alias[1] });
      }
    }
    index = valueEnd;
  }

  return tokens;
}

function extractColors(text: string): Array<{ value: string; start: number; end: number }> {
  const regex = new RegExp(`(['"])(${COLOR_PATTERN})\\1`, 'gi');
  const colors: Array<{ value: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    colors.push({ value: match[2], start: match.index, end: match.index + match[0].length });
  }
  return colors;
}

function findUsedTokens(tokens: Token[]): Set<string> {
  const used = new Set<string>();
  for (const file of walk(options.workspace)) {
    if (file === colorsFilePath() || !SOURCE_EXTENSIONS.has(path.extname(file))) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    for (const token of tokens) {
      if (new RegExp(`\\bcolors\\.${escapeRegExp(token.key)}\\b`).test(text)) {
        used.add(token.key);
      }
    }
  }
  return used;
}

function serializeTokens(tokens: Token[], format: string): string {
  if (format === 'css') {
    return `:root {\n${tokens.map((token) => `  --${token.key.replace(/\./g, '-')}: ${token.value};`).join('\n')}\n}\n`;
  }
  if (format === 'tailwind') {
    return `module.exports = {\n  theme: {\n    extend: {\n      colors: ${JSON.stringify(toNestedObject(tokens), null, 8).replace(/^/gm, '      ').trimStart()}\n    }\n  }\n};\n`;
  }
  if (format === 'figma' || format === 'w3c') {
    const root: Record<string, unknown> = {};
    for (const token of tokens) {
      setNestedValue(
        root,
        token.key,
        format === 'w3c'
          ? { $value: token.aliasOf ? `{${token.aliasOf}}` : token.value, $type: 'color' }
          : { value: token.aliasOf ? `{${token.aliasOf}}` : token.value, type: 'color' },
      );
    }
    return JSON.stringify(root, null, 2) + '\n';
  }
  return JSON.stringify(toNestedObject(tokens), null, 2) + '\n';
}

function toNestedObject(tokens: Token[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const token of tokens) {
    setNestedValue(root, token.key, token.value);
  }
  return root;
}

function setNestedValue(root: Record<string, unknown>, tokenPath: string, value: unknown): void {
  const parts = tokenPath.split('.');
  let current = root;
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }
    current[part] ??= {};
    current = current[part] as Record<string, unknown>;
  }
}

function flat(tokens: Token[]): Record<string, string> {
  return Object.fromEntries(tokens.map((token) => [token.key, token.value]));
}

function validateColorValue(value: string): boolean {
  return new RegExp(`^${COLOR_PATTERN}$`, 'i').test(value.trim());
}

function normalizeColorValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('#')) {
    return trimmed.replace(/\s+/g, '');
  }
  const raw =
    trimmed.length === 4
      ? trimmed
          .slice(1)
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : trimmed.slice(1);
  return `#${raw.toUpperCase()}`;
}

function suggestName(value: string, context: string): string {
  const lower = context.toLowerCase();
  const owner = lower.match(/\b(button|card|modal|input|label|screen|surface|badge|alert)\b/)?.[1];
  const role = lower.match(/\b(backgroundcolor|background|bg)\b/)
    ? 'background'
    : lower.match(/\b(bordercolor|border)\b/)
      ? 'border'
      : lower.match(/\b(color|foreground|text)\b/)
        ? 'text'
        : 'color';
  return sanitizeTokenPath(owner ? `${owner}.${role}` : `${role}.${semanticColor(value)}`);
}

function semanticColor(value: string): string {
  const normalized = normalizeColorValue(value);
  if (normalized === '#FFFFFF') {
    return 'white';
  }
  if (normalized === '#000000') {
    return 'black';
  }
  if (/^#?FF/i.test(normalized)) {
    return 'red';
  }
  return valueSuffix(value);
}

function valueSuffix(value: string): string {
  return (
    normalizeColorValue(value)
      .replace(/[^A-Za-z0-9]/g, '')
      .toLowerCase() || 'color'
  );
}

function sanitizeTokenPath(value: string): string {
  return value
    .replace(/[^A-Za-z0-9_$]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');
}

function getContrastRatio(foregroundValue: string, backgroundValue: string): number | undefined {
  const foreground = parseRgb(foregroundValue);
  const background = parseRgb(backgroundValue);
  if (!foreground || !background) {
    return undefined;
  }
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] | undefined {
  const hex = normalizeColorValue(value).match(/^#([0-9A-F]{6})$/);
  if (hex) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
    ];
  }
  const rgb = value.match(/^rgba?\((.*)\)$/i);
  if (!rgb) {
    return undefined;
  }
  const [r, g, b] = rgb[1].split(',').slice(0, 3).map(Number);
  return [r, g, b].every(Number.isFinite) ? [r, g, b] : undefined;
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorsFilePath(): string {
  return resolveWorkspacePath(options.colorsFile);
}

function resolveWorkspacePath(value: string): string {
  const candidate = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(options.workspace, value);
  const relative = path.relative(options.workspace, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the active workspace: ${value}`);
  }
  return candidate;
}

function parseArgs(args: string[]): { workspace: string; colorsFile: string } {
  const workspace = getArg(args, '--workspace') ?? process.cwd();
  const colorsFile = getArg(args, '--colors-file') ?? 'colors.ts';
  return { workspace: path.resolve(workspace), colorsFile };
}

function getArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function writeResponse(response: unknown): void {
  const body = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required string parameter "${key}".`);
  }
  return value;
}

function relativePath(value: string): string {
  return path.relative(options.workspace, value).replace(/\\/g, '/');
}

function walk(dir: string): string[] {
  const results: string[] = [];
  if (
    !fs.existsSync(dir) ||
    /(?:^|[/\\])(?:node_modules|dist|build|coverage)(?:[/\\]|$)/.test(dir)
  ) {
    return results;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function parseKey(text: string, start: number): { value: string; end: number } | undefined {
  const char = text[start];
  if (char === '"' || char === "'") {
    const end = skipString(text, start);
    return { value: text.slice(start + 1, end - 1), end };
  }
  const match = text.slice(start).match(/^[A-Za-z_$][A-Za-z0-9_$]*|^\d+/);
  return match ? { value: match[0], end: start + match[0].length } : undefined;
}

function parseStringLiteral(value: string): string | undefined {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value[value.length - 1] === quote
    ? value.slice(1, -1)
    : undefined;
}

function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    if (/\s|,/.test(text[index])) {
      index++;
      continue;
    }
    if (text[index] === '/' && text[index + 1] === '/') {
      const end = text.indexOf('\n', index + 2);
      index = end === -1 ? text.length : end + 1;
      continue;
    }
    break;
  }
  return index;
}

function skipString(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === quote) {
      return index + 1;
    }
    index++;
  }
  return text.length;
}

function skipBalanced(text: string, start: number): number {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    if (text[index] === '"' || text[index] === "'" || text[index] === '`') {
      index = skipString(text, index);
      continue;
    }
    if (text[index] === '{') {
      depth++;
    }
    if (text[index] === '}') {
      depth--;
      if (depth === 0) {
        return index + 1;
      }
    }
    index++;
  }
  return index;
}

function skipValue(text: string, start: number): number {
  let index = start;
  while (index < text.length && text[index] !== ',' && text[index] !== '}') {
    if (text[index] === '"' || text[index] === "'" || text[index] === '`') {
      index = skipString(text, index);
    } else {
      index++;
    }
  }
  return index;
}

function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
