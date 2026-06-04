import * as vscode from 'vscode';
import { AppColor } from './types';

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  fileUri: vscode.Uri,
  colors: AppColor[]
): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;
  const payload = JSON.stringify({
    filePath: fileUri.fsPath,
    colors
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Color Token Manager</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      margin: 0;
      padding: 24px;
    }

    header {
      align-items: flex-start;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 8px;
    }

    .file-path {
      color: var(--vscode-descriptionForeground);
      overflow-wrap: anywhere;
    }

    .toolbar {
      align-items: center;
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    input {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      color: var(--vscode-input-foreground);
      font: inherit;
      min-height: 30px;
      padding: 4px 8px;
    }

    #search {
      flex: 1;
      min-width: 180px;
    }

    button {
      background: var(--vscode-button-background);
      border: 0;
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font: inherit;
      min-height: 30px;
      padding: 4px 12px;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .list {
      border: 1px solid var(--vscode-panel-border);
    }

    .row {
      align-items: center;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: grid;
      gap: 12px;
      grid-template-columns: 32px minmax(120px, 1fr) auto minmax(180px, 240px) auto auto;
      padding: 10px;
    }

    .row:last-child {
      border-bottom: 0;
    }

    .swatch {
      border: 1px solid var(--vscode-input-border);
      height: 24px;
      width: 24px;
    }

    .key {
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      line-height: 1;
      padding: 4px 6px;
      text-transform: uppercase;
    }

    .badge.duplicate {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-editor-foreground);
      text-transform: none;
    }

    .empty {
      color: var(--vscode-descriptionForeground);
      padding: 24px;
      text-align: center;
    }

    .status {
      color: var(--vscode-descriptionForeground);
      min-height: 20px;
    }

    @media (max-width: 680px) {
      header,
      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }

      .row {
        grid-template-columns: 32px 1fr;
      }

      .row input,
      .row button {
        grid-column: 2;
      }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Color Token Manager</h1>
      <div class="file-path" id="filePath"></div>
    </div>
    <div class="actions">
      <button id="extract" type="button">Extract From Current File</button>
      <button id="previewSelection" type="button">Preview Selection</button>
      <button id="previewFolder" type="button">Preview Folder</button>
      <button id="extractFolder" type="button">Extract From Folder</button>
      <button id="renameToken" type="button">Rename Token</button>
      <button id="unusedTokens" type="button">Find Unused</button>
      <button id="exportTokens" type="button">Export Tokens</button>
      <button id="pickFileAgain" type="button">Pick File Again</button>
      <button id="refresh" type="button">Refresh</button>
    </div>
  </header>

  <div class="toolbar">
    <input id="search" type="search" placeholder="Search tokens" aria-label="Search tokens">
    <div class="status" id="status"></div>
  </div>

  <main class="list" id="list"></main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${payload};
    const filePath = document.getElementById('filePath');
    const list = document.getElementById('list');
    const search = document.getElementById('search');
    const status = document.getElementById('status');

    document.getElementById('refresh').addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    document.getElementById('pickFileAgain').addEventListener('click', () => {
      vscode.postMessage({ type: 'pickFileAgain' });
    });

    document.getElementById('extract').addEventListener('click', () => {
      vscode.postMessage({ type: 'extractFromCurrentFile' });
    });

    document.getElementById('extractFolder').addEventListener('click', () => {
      vscode.postMessage({ type: 'extractFromFolder' });
    });

    document.getElementById('previewFolder').addEventListener('click', () => {
      vscode.postMessage({ type: 'previewFromFolder' });
    });

    document.getElementById('previewSelection').addEventListener('click', () => {
      vscode.postMessage({ type: 'previewFromSelection' });
    });

    document.getElementById('renameToken').addEventListener('click', () => {
      vscode.postMessage({ type: 'renameToken' });
    });

    document.getElementById('unusedTokens').addEventListener('click', () => {
      vscode.postMessage({ type: 'findUnusedTokens' });
    });

    document.getElementById('exportTokens').addEventListener('click', () => {
      vscode.postMessage({ type: 'exportTokens' });
    });

    search.addEventListener('input', render);

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'setColors') {
        state = message.payload;
        render();
      }
      if (message.type === 'status') {
        setStatus(message.message);
      }
    });

    function render() {
      filePath.textContent = state.filePath;
      const term = search.value.trim().toLowerCase();
      const colors = state.colors.filter((color) => color.key.toLowerCase().includes(term));
      list.innerHTML = '';

      if (!colors.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = state.colors.length ? 'No matching colors.' : 'No supported color tokens found.';
        list.appendChild(empty);
        return;
      }

      colors.forEach((color) => {
        const row = document.createElement('section');
        row.className = 'row';

        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.background = color.value;
        swatch.title = color.value;

        const key = document.createElement('div');
        key.className = 'key';
        key.textContent = color.key;

        const badges = document.createElement('div');
        badges.className = 'badges';

        const typeBadge = document.createElement('span');
        typeBadge.className = 'badge';
        typeBadge.textContent = color.type;
        badges.appendChild(typeBadge);

        if (color.duplicateOf) {
          const duplicateBadge = document.createElement('span');
          duplicateBadge.className = 'badge duplicate';
          duplicateBadge.textContent = 'duplicate of ' + color.duplicateOf;
          badges.appendChild(duplicateBadge);
        }

        if (color.aliasOf) {
          const aliasBadge = document.createElement('span');
          aliasBadge.className = 'badge duplicate';
          aliasBadge.textContent = 'alias of ' + color.aliasOf;
          badges.appendChild(aliasBadge);
        }

        const input = document.createElement('input');
        input.value = color.value;
        input.setAttribute('aria-label', color.key + ' color value');

        const update = document.createElement('button');
        update.type = 'button';
        update.textContent = 'Update';
        update.addEventListener('click', () => {
          vscode.postMessage({ type: 'updateColor', key: color.key, value: input.value.trim() });
        });

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Copy';
        copy.addEventListener('click', () => {
          vscode.postMessage({ type: 'copyColor', value: input.value.trim() });
        });

        row.append(swatch, key, badges, input, update, copy);
        list.appendChild(row);
      });
    }

    function setStatus(message) {
      status.textContent = message || '';
      if (message) {
        window.clearTimeout(setStatus.timeout);
        setStatus.timeout = window.setTimeout(() => {
          status.textContent = '';
        }, 3000);
      }
    }

    render();
  </script>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
