import type * as vscode from 'vscode';
import { type AppColor, type ThemeAwareColorPlan } from './types';

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  fileUri: vscode.Uri,
  colors: AppColor[],
  colorPlans: ThemeAwareColorPlan[] = [],
  state: {
    workflow: 'colorsOnly' | 'themeOnly' | 'both';
    colorsFilePath: string;
    themeFilePath: string;
    themeProviderFilePath?: string;
    summaryNotes?: string[];
    nextWriteTarget?: string;
    nextWriteTargetKind?: 'colors' | 'theme';
  } = {
    workflow: 'colorsOnly',
    colorsFilePath: fileUri.fsPath,
    themeFilePath: '',
  },
): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;
  const payload = JSON.stringify({
    filePath: fileUri.fsPath,
    workflow: state.workflow,
    colorsFilePath: state.colorsFilePath,
    themeFilePath: state.themeFilePath,
    themeProviderFilePath: state.themeProviderFilePath ?? '',
    summaryNotes: state.summaryNotes ?? [],
    nextWriteTarget: state.nextWriteTarget ?? '',
    nextWriteTargetKind: state.nextWriteTargetKind ?? 'colors',
    colors,
    colorPlans,
  })
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Color Token Manager</title>
  <style>
    :root {
      --surface-1: var(--vscode-sideBar-background);
      --surface-2: var(--vscode-editor-background);
      --surface-3: var(--vscode-editorWidget-background);
      --border: var(--vscode-panel-border);
      --radius: 6px;
      --accent: var(--vscode-button-background);
      --text-muted: var(--vscode-descriptionForeground);
    }

    * { box-sizing: border-box; }
    body {
      background-color: var(--surface-2);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .app-header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--surface-1);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
    }

    .title-area h1 {
      font-size: 1.4rem;
      margin: 0 0 4px 0;
      font-weight: 600;
    }

    .title-area p {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0 0 10px;
      line-height: 1.45;
      max-width: 56ch;
    }

    .file-info {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      color: var(--text-muted);
      background: var(--surface-3);
      padding: 4px 8px;
      border-radius: 4px;
      display: inline-block;
    }

    .project-state {
      display: grid;
      gap: 8px;
      margin-top: 10px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .state-card {
      background: var(--surface-3);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
    }

    .state-label {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .state-value {
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .next-step {
      margin-top: 12px;
      padding: 10px 12px;
      border-left: 3px solid var(--vscode-button-background);
      background: color-mix(in srgb, var(--surface-3) 90%, transparent);
      font-size: 12px;
      line-height: 1.5;
    }

    .next-step strong {
      display: block;
      margin-bottom: 2px;
    }

    .workflow-pill {
      display: inline-block;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      margin-left: 8px;
      vertical-align: middle;
    }

    .header-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .summary-strip {
      display: flex;
      gap: 24px;
      padding: 12px 24px;
      background: var(--surface-1);
      border-bottom: 1px solid var(--border);
    }

    .stat-item { display: flex; flex-direction: column; }
    .stat-value { font-size: 18px; font-weight: 700; line-height: 1.2; }
    .stat-label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }

    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .sidebar-nav {
      width: 200px;
      border-right: 1px solid var(--border);
      background: var(--surface-1);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .nav-button {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      text-align: left;
      padding: 8px 12px;
      border-radius: var(--radius);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
    }

    .nav-button:hover { background: var(--vscode-list-hoverBackground); }
    .nav-button.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .content-pane {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: none;
    }

    .content-pane.active { display: block; }

    .token-controls {
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
      position: sticky;
      top: -24px;
      background: var(--surface-2);
      padding: 8px 0;
      z-index: 10;
      gap: 12px;
      align-items: center;
    }

    .search-input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 12px;
      border-radius: var(--radius);
      min-width: 180px;
    }

    .token-group {
      margin-bottom: 24px;
    }

    .group-header {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 8px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 4px;
    }

    .token-row {
      display: grid;
      grid-template-columns: 40px 1fr 140px 180px;
      align-items: center;
      gap: 12px;
      padding: 8px;
      border-radius: var(--radius);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
    }

    .token-row:hover { background: var(--vscode-list-hoverBackground); }

    .swatch-large {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: transform 0.1s;
    }

    .swatch-large:active { transform: scale(0.9); }
    .swatch-large:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .token-name-cell {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      gap: 4px;
    }

    .token-key {
      font-weight: 600;
      font-family: var(--vscode-editor-font-family);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .token-meta {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .badge-error { color: var(--vscode-errorForeground); font-weight: bold; }

    .input-hex {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      color: var(--vscode-input-foreground);
      padding: 4px 8px;
      border-radius: 4px;
      width: 100%;
    }

    .actions-cell {
      display: flex;
      gap: 4px;
      justify-content: flex-end;
    }

    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    button:hover { background: var(--vscode-button-hoverBackground); }
    button.ghost {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--border);
    }
    button.ghost:hover { background: var(--vscode-list-hoverBackground); }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .card {
      background: var(--surface-3);
      border: 1px solid var(--border);
      padding: 16px;
      border-radius: 8px;
    }

    .card h3 {
      margin: 0 0 8px 0;
      font-size: 14px;
    }

    .card p {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0 0 16px 0;
      line-height: 1.45;
    }

    .card-actions,
    .prompt-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .prompt-card {
      background: var(--surface-3);
      border: 1px solid var(--border);
      padding: 16px;
      border-radius: 8px;
    }

    .prompt-card h3 {
      margin: 0 0 8px 0;
      font-size: 14px;
    }

    .prompt-code {
      display: block;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 12px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .status-line {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .empty-state {
      color: var(--text-muted);
      text-align: center;
      padding: 32px 20px;
    }

    .empty-state.fullpage {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 16px;
      padding: 48px 24px;
      text-align: center;
      color: var(--text-muted);
    }

    .empty-state.fullpage h2 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
      color: var(--vscode-editor-foreground);
    }

    .empty-state.fullpage p {
      font-size: 13px;
      margin: 0;
      max-width: 40ch;
      line-height: 1.55;
    }

    .empty-state.fullpage .action-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 8px;
    }

    .setup-badge {
      display: inline-block;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 3px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      margin-left: 8px;
      vertical-align: middle;
    }

    @keyframes flash-success {
      0% { background: var(--vscode-terminal-ansiGreen); }
      100% { background: var(--vscode-button-background); }
    }

    button.update-success {
      animation: flash-success 0.6s ease-out forwards;
    }

    @media (max-width: 980px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 760px) {
      .app-header,
      .summary-strip,
      .main-layout,
      .token-controls {
        display: block;
      }

      .summary-strip {
        padding-bottom: 0;
      }

      .summary-strip .stat-item {
        margin-bottom: 12px;
      }

      .sidebar-nav {
        width: auto;
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }

      .content-pane {
        padding: 16px;
      }

      .token-row {
        grid-template-columns: 40px 1fr;
      }

      .token-row .input-hex,
      .token-row .actions-cell {
        grid-column: 2;
      }
    }

    .detected-card {
      display: grid;
      grid-template-columns: 40px 1fr auto;
      align-items: start;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 10px;
      background: var(--surface-3);
    }

    .detected-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .detected-header {
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .detected-header code {
      font-family: var(--vscode-editor-font-family);
    }

    .detected-suggestion {
      font-size: 12px;
      color: var(--vscode-editor-foreground);
    }

    .detected-suggestion strong {
      font-family: var(--vscode-editor-font-family);
    }

    .detected-alts {
      font-size: 11px;
      color: var(--text-muted);
    }

    .badge-confidence-high { color: #22c55e; font-weight: 600; }
    .badge-confidence-medium { color: #f59e0b; font-weight: 600; }
    .badge-confidence-low { color: var(--text-muted); }
  </style>
</head>
<body>
  <header class="app-header">
    <div class="title-area">
      <h1>Color Token Manager</h1>
      <span class="workflow-pill" id="workflowPill">Colors only</span>
      <p>Manage the token library, preview extraction safely, and expose the same knowledge to AI tools only when you want the extra help.</p>
      <div class="file-info" id="filePathDisplay">No file selected</div>
      <div class="project-state" aria-label="Project state">
        <div class="state-card"><span class="state-label">Workflow</span><div class="state-value" id="workflowState">colorsOnly</div></div>
        <div class="state-card"><span class="state-label">Colors file</span><div class="state-value" id="colorsState">-</div></div>
        <div class="state-card"><span class="state-label">Theme file</span><div class="state-value" id="themeState">-</div></div>
        <div class="state-card"><span class="state-label">Theme provider</span><div class="state-value" id="themeProviderState">-</div></div>
        <div class="state-card"><span class="state-label">Next write target</span><div class="state-value" id="nextWriteTargetState">-</div></div>
      </div>
      <div class="next-step" id="nextStep">
        <strong>Next step</strong>
        Open the manager, then preview the current file or run setup if the workspace is still unplanned.
      </div>
      <div class="next-step" id="projectNotes" style="margin-top:8px;">
        <strong>What I found</strong>
        No project notes yet.
      </div>
    </div>
    <div class="header-actions">
      <button id="previewCurrentFile" type="button">Preview Current File</button>
      <button id="auditDesignTokens" class="ghost" type="button">Run Audit</button>
    </div>
  </header>

  <section class="summary-strip">
    <div class="stat-item">
      <span class="stat-label">Total Tokens</span>
      <span class="stat-value" id="statTotal">0</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Duplicates</span>
      <span class="stat-value" id="statDuplicates">0</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Aliases</span>
      <span class="stat-value" id="statAliases">0</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Unique Values</span>
      <span class="stat-value" id="statUnique">0</span>
    </div>
  </section>

  <main class="main-layout">
    <nav class="sidebar-nav">
      <button class="nav-button active" data-tab="tokens" type="button">
        <span>Library</span>
      </button>
      <button class="nav-button" data-tab="workflows" type="button">
        <span>Workflows</span>
      </button>
      <button class="nav-button" data-tab="agent" type="button">
        <span>AI Agent</span>
      </button>
      <button class="nav-button" data-tab="detected" type="button">
        <span>Detected</span>
      </button>
      <div style="flex:1"></div>
      <button class="nav-button ghost" id="refresh" type="button">Refresh</button>
      <button class="nav-button ghost" id="pickFileAgain" type="button">Pick File Again</button>
    </nav>

    <section id="pane-tokens" class="content-pane active">
      <div class="token-controls">
        <label for="search" class="stat-label" style="white-space:nowrap">Search</label>
        <input type="search" id="search" class="search-input" placeholder="Search tokens by name or hex..." aria-label="Search tokens by name or value">
        <div class="card-actions">
          <button id="renameToken" class="ghost" type="button">Rename Token</button>
          <button id="exportTokens" class="ghost" type="button">Export</button>
        </div>
      </div>
      <div class="status-line" id="status">Ready.</div>
      <div id="tokenGroups"></div>
    </section>

    <section id="pane-workflows" class="content-pane">
      <h2>Recommended Workflows</h2>
      <div class="grid-2">
        <div class="card">
          <h3>Clean Active File</h3>
          <p>Scans the current editor for hardcoded hex codes and suggests token replacements.</p>
          <div class="card-actions">
            <button id="workflowPreviewCurrent" type="button">Start Preview</button>
            <button id="workflowExtractCurrent" class="ghost" type="button">Extract Now</button>
          </div>
        </div>
        <div class="card">
          <h3>Folder Extraction</h3>
          <p>Audit an entire directory to find common colors that should be tokens.</p>
          <div class="card-actions">
            <button id="workflowPreviewFolder" type="button">Batch Scan</button>
            <button id="workflowExtractFolder" class="ghost" type="button">Extract Folder</button>
          </div>
        </div>
        <div class="card">
          <h3>Selection Preview</h3>
          <p>Preview only the current selection when you want a smaller and safer refactor scope.</p>
          <div class="card-actions">
            <button id="workflowPreviewSelection" type="button">Preview Selection</button>
          </div>
        </div>
        <div class="card">
          <h3>Token Maintenance</h3>
          <p>Audit theme readiness, find unused tokens, rename paths safely, or export your current palette in multiple formats.</p>
          <div class="card-actions">
            <button id="workflowAudit" type="button">Audit Tokens</button>
            <button id="workflowUnused" class="ghost" type="button">Find Unused</button>
            <button id="exportTokensWorkflow" class="ghost" type="button">Export...</button>
          </div>
        </div>
      </div>
    </section>

    <section id="pane-agent" class="content-pane">
      <h2>AI Agent Setup (MCP)</h2>
      <p class="status-line">Enable Model Context Protocol to let AI tools like Cursor, Codex, Claude Code, or Windsurf understand your design system through the extension.</p>
      <div class="card" style="margin-bottom: 16px;">
        <h3>Client Configuration</h3>
        <div class="card-actions">
          <button id="connectAiAgent" type="button">Connect AI Agent</button>
          <button id="copyMcpClientConfig" class="ghost" type="button">Copy JSON</button>
        </div>
      </div>
      <div class="card" style="margin-bottom: 16px;">
        <h3>Server Status</h3>
        <div id="mcpStatus" class="status-line">Server is idle</div>
        <div class="card-actions">
          <button id="testMcpServer" type="button">Test MCP</button>
          <button id="startMcpServer" class="ghost" type="button">Start MCP Server</button>
          <button id="showMcpOutput" class="ghost" type="button">Show Logs</button>
        </div>
      </div>
      <div class="grid-2">
        <div class="prompt-card">
          <h3>Find unused tokens</h3>
          <code class="prompt-code">Use color-token-manager to read colors://tokens/unused and summarize which tokens look safe to remove.</code>
          <div class="prompt-actions">
            <button class="ghost" data-copy-prompt="Use color-token-manager to read colors://tokens/unused and summarize which tokens look safe to remove." type="button">Copy Prompt</button>
          </div>
        </div>
        <div class="prompt-card">
          <h3>Audit contrast</h3>
          <code class="prompt-code">Use color-token-manager to read colors://tokens/flat, pick one text-like token and one background-like token, then run get_contrast with dryRun true.</code>
          <div class="prompt-actions">
            <button class="ghost" data-copy-prompt="Use color-token-manager to read colors://tokens/flat, pick one text-like token and one background-like token, then run get_contrast with dryRun true." type="button">Copy Prompt</button>
          </div>
        </div>
        <div class="prompt-card">
          <h3>Preview extraction for this file</h3>
          <code class="prompt-code">Use color-token-manager extract_from_file with dryRun true for the current file and summarize the suggested token replacements.</code>
          <div class="prompt-actions">
            <button class="ghost" data-copy-prompt="Use color-token-manager extract_from_file with dryRun true for the current file and summarize the suggested token replacements." type="button">Copy Prompt</button>
          </div>
        </div>
        <div class="prompt-card">
          <h3>Export Tailwind config</h3>
          <code class="prompt-code">Use color-token-manager to read colors://exports/tailwind and explain how to wire the exported colors into Tailwind.</code>
          <div class="prompt-actions">
            <button class="ghost" data-copy-prompt="Use color-token-manager to read colors://exports/tailwind and explain how to wire the exported colors into Tailwind." type="button">Copy Prompt</button>
          </div>
        </div>
      </div>
    </section>

    <section id="pane-detected" class="content-pane">
      <h2>Detected Hardcoded Colors</h2>
      <p class="status-line">Colors found in the active editor file, grouped by value with suggested token names.</p>
      <div id="detectedGroups"></div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${payload};

    const searchInput = document.getElementById('search');
    const tokenGroupsContainer = document.getElementById('tokenGroups');
    const statusEl = document.getElementById('status');
    const mcpStatusEl = document.getElementById('mcpStatus');
    let statusTimeout = undefined;

    const actionMap = {
      previewCurrentFile: 'previewFromCurrentFile',
      auditDesignTokens: 'auditDesignTokens',
      refresh: 'refresh',
      pickFileAgain: 'pickFileAgain',
      renameToken: 'renameToken',
      exportTokens: 'exportTokens',
      workflowPreviewCurrent: 'previewFromCurrentFile',
      workflowExtractCurrent: 'extractFromCurrentFile',
      workflowPreviewFolder: 'previewFromFolder',
      workflowExtractFolder: 'extractFromFolder',
      workflowPreviewSelection: 'previewFromSelection',
      workflowAudit: 'auditDesignTokens',
      workflowUnused: 'findUnusedTokens',
      exportTokensWorkflow: 'exportTokens',
      connectAiAgent: 'connectAiAgent',
      installCursorMcpConfig: 'installCursorMcpConfig',
      copyMcpClientConfig: 'copyMcpClientConfig',
      testMcpServer: 'testMcpServer',
      startMcpServer: 'startMcpServer',
      showMcpOutput: 'showMcpOutput',
    };

    Object.entries(actionMap).forEach(([id, type]) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', () => vscode.postMessage({ type }));
      }
    });

    document.querySelectorAll('.nav-button[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.nav-button[data-tab]').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.content-pane').forEach((pane) => pane.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById('pane-' + tab);
        if (target) {
          target.classList.add('active');
        }
      });
    });

    document.querySelectorAll('[data-copy-prompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-copy-prompt') || '';
        vscode.postMessage({ type: 'copyColor', value });
        setStatus('Copied prompt.');
      });
    });

    searchInput.addEventListener('input', renderTokenGroups);

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'setColors') {
        state = msg.payload;
        render();
      }
      if (msg.type === 'status') {
        setStatus(msg.message || 'Ready.');
        if (/mcp/i.test(msg.message || '')) {
          mcpStatusEl.textContent = msg.message;
        }
      }
    });

    function render() {
      if (!state.colors || state.colors.length === 0) {
        const container = document.querySelector('.main-layout');
        if (container) {
          const workflowText = state.workflow === 'themeOnly'
            ? 'theme file'
            : state.workflow === 'both'
              ? 'colors and theme files'
              : 'colors file';
          container.innerHTML =
            '<div class="empty-state fullpage">' +
              '<h2>No ' + workflowText + ' found</h2>' +
              '<p>Set up your ' + workflowText + ' first, or open a source file to preview hardcoded colors.</p>' +
              '<div class="action-row">' +
                '<button onclick="vscode.postMessage({type:&apos;setup&apos;})">Start Setup</button>' +
                '<button class="ghost" onclick="vscode.postMessage({type:&apos;detectSetup&apos;})">Detect Automatically</button>' +
              '</div>' +
            '</div>';
        }
        document.getElementById('filePathDisplay').textContent = state.filePath || 'No file loaded';
        return;
      }
      const all = state.colors || [];
      const dupes = all.filter((color) => color.duplicateOf).length;
      const aliases = all.filter((color) => color.aliasOf).length;
      const unique = new Set(all.map((color) => color.value.toLowerCase())).size;

      document.getElementById('statTotal').textContent = String(all.length);
      document.getElementById('statDuplicates').textContent = String(dupes);
      document.getElementById('statAliases').textContent = String(aliases);
      document.getElementById('statUnique').textContent = String(unique);
      document.getElementById('filePathDisplay').textContent = state.filePath || 'No file loaded';
      document.getElementById('workflowState').textContent = state.workflow || 'colorsOnly';
      document.getElementById('colorsState').textContent = state.colorsFilePath || '-';
      document.getElementById('themeState').textContent = state.themeFilePath || '-';
      document.getElementById('themeProviderState').textContent = state.themeProviderFilePath || '-';
      document.getElementById('nextWriteTargetState').textContent = state.nextWriteTarget || '-';
      const projectNotesEl = document.getElementById('projectNotes');
      if (projectNotesEl) {
        const notes = Array.isArray(state.summaryNotes) ? state.summaryNotes.filter(Boolean) : [];
        projectNotesEl.innerHTML =
          '<strong>What I found</strong>' +
          (notes.length ? notes.map((note) => '<div>' + note + '</div>').join('') : '<div>No strong signal yet; setup can help detect the right file.</div>');
      }
      const nextStepEl = document.getElementById('nextStep');
      if (nextStepEl) {
        if (state.themeProviderFilePath && state.themeFilePath) {
          nextStepEl.innerHTML = '<strong>Next step</strong>Theme is driving this project. Audit the theme file first, then keep colors as the backing palette.';
        } else if (state.workflow === 'both') {
          nextStepEl.innerHTML = '<strong>Next step</strong>Split project detected. Use the theme file for semantic edits and keep colors as the source palette.';
        } else if (state.workflow === 'themeOnly') {
          nextStepEl.innerHTML = '<strong>Next step</strong>Theme-only project detected. Work directly in the theme file.';
        } else {
          nextStepEl.innerHTML = '<strong>Next step</strong>Preview the current file, or run setup if you want the extension to detect the right token file.';
        }
      }
      const workflowText = state.workflow === 'themeOnly'
        ? 'Theme only'
        : state.workflow === 'both'
          ? 'Colors + Theme'
          : 'Colors only';
      document.getElementById('workflowPill').textContent = workflowText;
      const infoParts = [];
      if (state.colorsFilePath) infoParts.push('Colors: ' + state.colorsFilePath);
      if (state.themeFilePath) infoParts.push('Theme: ' + state.themeFilePath);
      if (infoParts.length) {
        document.getElementById('filePathDisplay').textContent = infoParts.join(' | ');
      }

      renderTokenGroups();
      renderDetectedColors();
    }

    function renderDetectedColors() {
      const container = document.getElementById('detectedGroups');
      if (!container) {
        return;
      }

      const plans = (state.colorPlans || []);

      if (!plans.length) {
        const workflowText = state.workflow === 'themeOnly'
          ? 'theme file'
          : state.workflow === 'both'
            ? 'colors and theme files'
            : 'colors file';
        container.innerHTML =
          '<div class="empty-state">Open a supported source file to preview hardcoded colors for your ' + workflowText + '.</div>';
        return;
      }

      container.innerHTML = '';
      plans.forEach((plan) => {
        const card = document.createElement('div');
        card.className = 'detected-card';

        const swatch = document.createElement('div');
        swatch.className = 'swatch-large';
        swatch.style.backgroundColor = plan.colorValue;
        swatch.title = plan.colorValue;

        const info = document.createElement('div');
        info.className = 'detected-info';

        const header = document.createElement('div');
        header.className = 'detected-header';
        const count = plan.occurrences.length;
        const countBadge = '<span class="badge">' + count + ' use' + (count !== 1 ? 's' : '') + '</span>';
        header.innerHTML = '<code>' + plan.colorValue + '</code>' + countBadge;

        const confClass = 'badge-confidence-' + plan.confidence;
        const suggestion = document.createElement('div');
        suggestion.className = 'detected-suggestion';
        suggestion.innerHTML = '\u2192 <strong>' + plan.suggestedReference + '</strong> <span class="' + confClass + '">' + plan.confidence + '</span>';

        info.appendChild(header);
        info.appendChild(suggestion);

        if (plan.alternatives && plan.alternatives.length) {
          const alts = document.createElement('div');
          alts.className = 'detected-alts';
          alts.textContent = 'Alt: ' + plan.alternatives.slice(0, 2).join(', ');
          info.appendChild(alts);
        }

        const actions = document.createElement('div');
        actions.className = 'card-actions';
        const btn = document.createElement('button');
        btn.textContent = 'Preview';
        btn.title = 'Open extraction preview for the active file';
        btn.addEventListener('click', () => {
          vscode.postMessage({ type: 'previewFromCurrent' });
        });
        actions.appendChild(btn);

        card.appendChild(swatch);
        card.appendChild(info);
        card.appendChild(actions);
        container.appendChild(card);
      });
    }

    function renderTokenGroups() {
      const searchTerm = searchInput.value.toLowerCase();
      const filtered = (state.colors || []).filter((color) =>
        color.key.toLowerCase().includes(searchTerm) ||
        color.value.toLowerCase().includes(searchTerm),
      );

      const groups = Object.create(null);
      filtered.forEach((color) => {
        const parts = color.key.split(/[.\\-/]/);
        const groupName = parts.length > 1 ? parts[0] : 'General';
        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        groups[groupName].push(color);
      });

      tokenGroupsContainer.innerHTML = '';

      const groupNames = Object.keys(groups).sort();
      if (!groupNames.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = state.colors && state.colors.length
          ? 'No matching tokens. Try a broader search.'
          : 'No supported token file is loaded yet. Set up your workflow or preview extraction to get started.';
        tokenGroupsContainer.appendChild(empty);
        return;
      }

      groupNames.forEach((groupName) => {
        const groupSection = document.createElement('div');
        groupSection.className = 'token-group';

        const header = document.createElement('div');
        header.className = 'group-header';
        header.textContent = groupName;
        groupSection.appendChild(header);

        groups[groupName].forEach((color) => {
          const row = document.createElement('div');
          row.className = 'token-row';

          const swatch = document.createElement('div');
          swatch.className = 'swatch-large';
          swatch.style.backgroundColor = color.value;
          swatch.title = 'Click to copy token name';
          swatch.setAttribute('role', 'button');
          swatch.setAttribute('tabindex', '0');
          swatch.setAttribute('aria-label', 'Copy token name: ' + color.key);
          const onSwatchActivate = () => {
            vscode.postMessage({ type: 'copyColor', value: color.key });
            setStatus('Copied: ' + color.key);
          };
          swatch.addEventListener('click', onSwatchActivate);
          swatch.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSwatchActivate();
            }
          });

          const nameCell = document.createElement('div');
          nameCell.className = 'token-name-cell';

          const keySpan = document.createElement('span');
          keySpan.className = 'token-key';
          keySpan.textContent = color.key;

          const metaDiv = document.createElement('div');
          metaDiv.className = 'token-meta';

          const typeSpan = document.createElement('span');
          typeSpan.textContent = color.type;
          metaDiv.appendChild(typeSpan);

          if (color.aliasOf) {
            const aliasSpan = document.createElement('span');
            aliasSpan.textContent = 'alias of ' + color.aliasOf;
            metaDiv.appendChild(aliasSpan);
          }

          if (color.duplicateOf) {
            const duplicateSpan = document.createElement('span');
            duplicateSpan.className = 'badge-error';
            duplicateSpan.textContent = 'duplicate of ' + color.duplicateOf;
            metaDiv.appendChild(duplicateSpan);
          }

          nameCell.appendChild(keySpan);
          nameCell.appendChild(metaDiv);

          const input = document.createElement('input');
          input.className = 'input-hex';
          input.value = color.value;
          input.setAttribute('aria-label', color.key + ' color value');

          const actionsCell = document.createElement('div');
          actionsCell.className = 'actions-cell';

          const updateBtn = document.createElement('button');
          updateBtn.textContent = 'Update';
          updateBtn.hidden = true;
          updateBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'updateColor', key: color.key, value: input.value.trim() });
            updateBtn.classList.add('update-success');
            updateBtn.addEventListener(
              'animationend',
              () => {
                updateBtn.classList.remove('update-success');
              },
              { once: true },
            );
          });

          const copyBtn = document.createElement('button');
          copyBtn.textContent = 'Hex';
          copyBtn.className = 'ghost';
          copyBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'copyColor', value: input.value.trim() });
            setStatus('Copied: ' + input.value.trim());
          });

          input.addEventListener('input', () => {
            updateBtn.hidden = input.value.trim() === color.value;
          });

          actionsCell.appendChild(updateBtn);
          actionsCell.appendChild(copyBtn);

          row.append(swatch, nameCell, input, actionsCell);
          groupSection.appendChild(row);
        });

        tokenGroupsContainer.appendChild(groupSection);
      });
    }

    function setStatus(message) {
      statusEl.textContent = message || 'Ready.';
      if (message) {
        window.clearTimeout(statusTimeout);
        statusTimeout = window.setTimeout(() => {
          statusEl.textContent = 'Ready.';
        }, 3500);
      }
    }

    render();
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
