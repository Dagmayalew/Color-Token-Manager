import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  ColorTokenMcpServer,
  getAiAgentChoices,
  getCodexMcpConfigBlock,
  getMcpClientSetupSnippet,
  upsertCodexMcpConfigToml,
} from '../src/mcpServer';
import * as vscode from 'vscode';

const tempDirs: string[] = [];

beforeEach(() => {
  tempDirs.length = 0;
  (vscode as unknown as { __resetTestConfig(): void }).__resetTestConfig();
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('MCP tokens resource returns nested and flat tokens', async () => {
  const { server } = setupWorkspace();

  const resource = (await server.readResource('colors://tokens')) as {
    tokens: { background: { white: string } };
    flat: Record<string, string>;
  };

  assert.equal(resource.tokens.background.white, '#FFFFFF');
  assert.equal(resource.flat['text.black'], '#000000');
});

test('MCP export resources reuse token serializers', async () => {
  const { server } = setupWorkspace();

  const resource = (await server.readResource('colors://exports/css')) as { content: string };

  assert.match(resource.content, /--background-white: #FFFFFF;/);
  assert.match(resource.content, /--text-black: #000000;/);
});

test('MCP report resource returns theme audit fields', async () => {
  const { server } = setupWorkspace();

  const resource = (await server.readResource('colors://report')) as {
    totalTokens: number;
    suggestedNextActions: string[];
  };

  assert.equal(resource.totalTokens, 3);
  assert.ok(resource.suggestedNextActions.some((action) => /theme/i.test(action)));
});

test('MCP help resource gives agents the safe workflow', async () => {
  const { server } = setupWorkspace();

  const resource = (await server.readResource('colors://help')) as {
    safeWorkflow: string[];
    examplePrompts: string[];
  };

  assert.ok(resource.safeWorkflow.some((item) => item.includes('dryRun')));
  assert.ok(resource.examplePrompts.some((item) => item.includes('unused color tokens')));
});

test('MCP client setup snippet includes client names and examples', () => {
  const snippet = getMcpClientSetupSnippet(
    '/workspace/app',
    '/extension/dist/mcp-server.js',
    'src/theme/colors.ts',
  );
  const config = JSON.parse(snippet) as {
    mcpServers: { 'color-token-manager': { command: string; args: string[] } };
  };

  assert.equal(config.mcpServers['color-token-manager'].command, 'node');
  assert.deepEqual(config.mcpServers['color-token-manager'].args, [
    '/extension/dist/mcp-server.js',
    '--workspace',
    '/workspace/app',
    '--colors-file',
    'src/theme/colors.ts',
  ]);
});

test('MCP client setup snippet can override the node command', () => {
  const snippet = getMcpClientSetupSnippet(
    '/workspace/app',
    '/extension/dist/mcp-server.js',
    'src/theme/colors.ts',
    '/opt/homebrew/bin/node',
  );
  const config = JSON.parse(snippet) as {
    mcpServers: { 'color-token-manager': { command: string; args: string[] } };
  };

  assert.equal(config.mcpServers['color-token-manager'].command, '/opt/homebrew/bin/node');
});

test('MCP client setup snippet includes custom token export name when configured', () => {
  const snippet = getMcpClientSetupSnippet(
    '/workspace/app',
    '/extension/dist/mcp-server.js',
    'src/theme/theme.ts',
    'node',
    'appTheme',
  );
  const config = JSON.parse(snippet) as {
    mcpServers: { 'color-token-manager': { args: string[] } };
  };

  assert.deepEqual(config.mcpServers['color-token-manager'].args.slice(-2), [
    '--token-export-name',
    'appTheme',
  ]);
});

test('AI agent choices include workspace and global installers', () => {
  const choices = getAiAgentChoices();

  assert.deepEqual(
    choices.map((choice) => choice.id),
    ['cursor', 'claude-code', 'windsurf', 'codex', 'gemini', 'custom'],
  );
  assert.ok(choices.some((choice) => choice.description.includes('.cursor/mcp.json')));
  assert.ok(choices.some((choice) => choice.description.includes('.mcp.json')));
  assert.ok(choices.some((choice) => choice.description.includes('mcp_config.json')));
  assert.ok(choices.some((choice) => choice.description.includes('.codex/config.toml')));
  assert.ok(choices.some((choice) => choice.description.includes('.gemini/settings.json')));
});

test('Codex MCP config block uses node with workspace args', () => {
  const block = getCodexMcpConfigBlock(
    '/workspace/app',
    '/extension/dist/mcp-server.js',
    'src/theme/colors.ts',
  );

  assert.match(block, /\[mcp_servers\."color-token-manager"\]/);
  assert.match(block, /command = "node"/);
  assert.match(block, /"--workspace", "\/workspace\/app"/);
  assert.match(block, /"--colors-file", "src\/theme\/colors.ts"/);
});

test('Codex MCP config block can override the node command', () => {
  const block = getCodexMcpConfigBlock(
    '/workspace/app',
    '/extension/dist/mcp-server.js',
    'src/theme/colors.ts',
    '/opt/homebrew/bin/node',
  );

  assert.match(block, /command = "\/opt\/homebrew\/bin\/node"/);
});

test('Codex MCP config block replaces an existing server block', () => {
  const existing = `model = "gpt-5.5"\n\n[mcp_servers."color-token-manager"]\ncommand = "old"\nargs = ["old"]\n\n[features]\njs_repl = false\n`;
  const next = upsertCodexMcpConfigToml(
    existing,
    '/workspace/app',
    '/extension/dist/mcp-server.js',
    'src/theme/colors.ts',
  );

  assert.match(next, /command = "node"/);
  assert.doesNotMatch(next, /command = "old"/);
  assert.match(next, /\[features\]\njs_repl = false/);
});

test('Codex MCP config block removes stray array lines from a broken previous write', () => {
  const existing = `model = "gpt-5.5"\n\n[mcp_servers."color-token-manager"]\ncommand = "node"\nargs = ["/old/server.js"]\n["/old/server.js", "--workspace", "/workspace/one"]\n["/old/server.js", "--workspace", "/workspace/two"]\n\n[features]\njs_repl = false\n`;
  const next = upsertCodexMcpConfigToml(
    existing,
    '/workspace/app',
    '/extension/dist/mcp-server.js',
    'src/theme/colors.ts',
  );

  assert.equal((next.match(/\[mcp_servers\."color-token-manager"\]/g) ?? []).length, 1);
  assert.equal((next.match(/^args = /gm) ?? []).length, 1);
  assert.doesNotMatch(next, /^\["\/old\/server\.js"/m);
  assert.match(next, /\[features\]\njs_repl = false/);
});

test('standalone MCP server accepts line-delimited initialize requests', async () => {
  const { root } = setupWorkspace();

  const result = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(process.cwd(), 'out-test', 'src', 'mcpStandalone.js'),
      '--workspace',
      root,
      '--colors-file',
      'src/theme/colors.ts',
    ]);
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      child.stdin.end();
      child.kill();
      fn();
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes('"protocolVersion":"2024-11-05"')) {
        finish(() => resolve(stdout));
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.once('error', (error) => finish(() => reject(error)));
    child.once('exit', (code) => {
      if (!settled) {
        finish(() =>
          reject(new Error(stderr || `standalone server exited before replying (${String(code)})`)),
        );
      }
    });

    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`,
    );
  });

  assert.match(result, /"protocolVersion":"2024-11-05"/);
});

test('MCP extraction preview rejects paths outside the active workspace', async () => {
  const { server } = setupWorkspace();

  await assert.rejects(
    () => server.callTool('extract_from_file', { dryRun: true, path: '../outside.tsx' }),
    /escapes the active workspace/,
  );
});

test('MCP tools require explicit dryRun', async () => {
  const { server } = setupWorkspace();

  await assert.rejects(
    () => server.callTool('suggest_token_name', { context: 'backgroundColor: "#FFFFFF"' }),
    /dryRun boolean/,
  );
});

test('MCP extraction preview returns planned replacements for a source file', async () => {
  const { server } = setupWorkspace({
    source: `export const Button = { backgroundColor: '#FFFFFF', color: '#111111' };`,
  });

  const result = await server.callTool('extract_from_file', {
    dryRun: true,
    path: 'src/Button.tsx',
  });
  const payload = JSON.parse(result.content[0].text) as {
    colorsFound: number;
    tokensToReuse: number;
    preview: { replacements: Array<{ action: string; tokenName: string }> };
  };

  assert.equal(payload.colorsFound, 2);
  assert.equal(payload.tokensToReuse, 1);
  assert.equal(payload.preview.replacements[0].tokenName, 'background.white');
});

test('MCP suggest_token_name uses the existing naming strategy', async () => {
  const { server } = setupWorkspace();

  const result = await server.callTool('suggest_token_name', {
    dryRun: true,
    context: `const styles = { button: { backgroundColor: '#FF6B00' } };`,
  });
  const payload = JSON.parse(result.content[0].text) as { candidates: string[] };

  assert.ok(payload.candidates.length >= 1);
  assert.match(payload.candidates[0], /button|background|orange/i);
});

test('MCP get_contrast returns WCAG pass and fail details', async () => {
  const { server } = setupWorkspace();

  const result = await server.callTool('get_contrast', {
    dryRun: true,
    tokenPath: 'text.black',
    againstTokenPath: 'background.white',
  });
  const payload = JSON.parse(result.content[0].text) as {
    ratio: number;
    wcag: { AA: { normalText: boolean }; AAA: { normalText: boolean } };
  };

  assert.equal(payload.ratio, 21);
  assert.equal(payload.wcag.AA.normalText, true);
  assert.equal(payload.wcag.AAA.normalText, true);
});

test('MCP audit_project returns the shared token audit', async () => {
  const { server } = setupWorkspace();

  const result = await server.callTool('audit_project', { dryRun: true });
  const payload = JSON.parse(result.content[0].text) as {
    totalTokens: number;
    duplicateValues: unknown[];
    contrastRisks: unknown[];
  };

  assert.equal(payload.totalTokens, 3);
  assert.ok(Array.isArray(payload.duplicateValues));
  assert.ok(Array.isArray(payload.contrastRisks));
});

function setupWorkspace(options: { source?: string } = {}): {
  root: string;
  server: ColorTokenMcpServer;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'color-token-manager-mcp-'));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'colors.ts'),
    `export const colors = {
  background: {
    white: '#FFFFFF',
  },
  text: {
    black: '#000000',
  },
  brand: {
    orange: '#FF6B00',
  },
} as const;
`,
  );
  fs.writeFileSync(
    path.join(root, 'src', 'Button.tsx'),
    options.source ?? `export const Button = { backgroundColor: '#FF6B00' };`,
  );

  (vscode as unknown as { __setWorkspaceRoot(value: string): void }).__setWorkspaceRoot(root);
  (vscode as unknown as { __setTestConfig(values: Record<string, unknown>): void }).__setTestConfig(
    {
      colorsFilePath: 'colors.ts',
    },
  );

  return {
    root,
    server: new ColorTokenMcpServer(vscode.window.createOutputChannel('test')),
  };
}
