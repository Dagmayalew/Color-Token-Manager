import { type FolderApplyResult } from './types';

export function getResultsWebviewHtml(result: FolderApplyResult): string {
  const nonce = getNonce();
  const payload = JSON.stringify(result).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Color Extraction Results</title>
  <style>
    :root {
      --bg: linear-gradient(180deg, color-mix(in srgb, var(--vscode-editor-background) 92%, #0f172a 8%), var(--vscode-editor-background));
      --panel: color-mix(in srgb, var(--vscode-sideBar-background) 88%, transparent);
      --panel-2: var(--vscode-editorWidget-background);
      --border: color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
      --radius: 12px;
      --radius-sm: 10px;
      --shadow: 0 12px 30px color-mix(in srgb, black 14%, transparent);
      --muted: var(--vscode-descriptionForeground);
    }

    * { box-sizing: border-box; }

    body {
      background: var(--bg);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      margin: 0;
      padding: 20px;
      min-height: 100vh;
    }

    .shell {
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }

    header {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 18px 18px 16px;
    }

    h1 {
      font-size: clamp(22px, 2vw, 30px);
      font-weight: 650;
      margin: 0 0 8px;
      letter-spacing: -0.02em;
    }

    .meta {
      color: var(--muted);
      overflow-wrap: anywhere;
      font-size: 12px;
      line-height: 1.5;
    }

    .summary {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }

    .metric {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px;
      box-shadow: 0 1px 0 color-mix(in srgb, white 4%, transparent) inset;
    }

    .metric strong {
      display: block;
      font-size: 24px;
      line-height: 1.1;
      margin-bottom: 4px;
    }

    .file {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
    }

    .file-header {
      background: color-mix(in srgb, var(--panel-2) 80%, transparent);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      padding: 12px 14px;
      overflow-wrap: anywhere;
    }

    .row {
      align-items: center;
      border-bottom: 1px solid var(--border);
      display: grid;
      gap: 12px;
      grid-template-columns: 70px minmax(100px, 160px) minmax(160px, 1fr) 80px auto;
      padding: 12px 14px;
    }

    .row:last-child {
      border-bottom: 0;
    }

    button {
      background: var(--vscode-button-background);
      border: 0;
      border-radius: 999px;
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font: inherit;
      min-height: 28px;
      padding: 4px 12px;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      padding: 4px 8px;
      text-transform: uppercase;
      width: fit-content;
      border-radius: 999px;
    }

    .badge.add,
    .badge.alias {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-editor-foreground);
    }

    .empty {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--muted);
      padding: 28px;
      text-align: center;
      box-shadow: var(--shadow);
    }

    @media (max-width: 760px) {
      body { padding: 12px; }
      header { padding: 16px; }
      .summary { grid-template-columns: 1fr 1fr; }
      .row { grid-template-columns: 1fr; }
      .row > * { min-width: 0; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>Color Extraction Results</h1>
      <div class="meta" id="folder"></div>
      <div class="meta" id="colorsFile"></div>
    </header>

    <section class="summary" id="summary"></section>
    <main id="files"></main>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const result = ${payload};

    document.getElementById('folder').textContent = 'Folder: ' + result.folderPath;
    document.getElementById('colorsFile').textContent = 'Colors file: ' + result.colorsFilePath;

    const summary = document.getElementById('summary');
    [
      ['Files scanned', result.filesScanned],
      ['Files changed', result.filesChanged],
      ['Colors extracted', result.colorsExtracted],
      ['Tokens added', result.tokensAdded],
      ['Tokens reused', result.tokensReused]
    ].forEach(([label, value]) => {
      const metric = document.createElement('div');
      metric.className = 'metric';
      const strong = document.createElement('strong');
      strong.textContent = String(value);
      const span = document.createElement('span');
      span.textContent = label;
      metric.append(strong, span);
      summary.appendChild(metric);
    });

    const files = document.getElementById('files');
    if (!result.files.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No files were changed.';
      files.appendChild(empty);
    }

    result.files.forEach((file) => {
      const section = document.createElement('section');
      section.className = 'file';

      const header = document.createElement('div');
      header.className = 'file-header';
      header.textContent = file.filePath;
      section.appendChild(header);

      file.replacements.forEach((replacement) => {
        const row = document.createElement('div');
        row.className = 'row';

        const action = document.createElement('span');
        action.className = 'badge ' + replacement.action;
        action.textContent = replacement.action;

        const value = document.createElement('code');
        value.textContent = replacement.value;

        const token = document.createElement('code');
        token.textContent = replacement.aliasOf
          ? 'colors.' + replacement.tokenName + ' -> colors.' + replacement.aliasOf
          : 'colors.' + replacement.tokenName;

        const line = document.createElement('span');
        line.textContent = 'line ' + replacement.line;

        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open';
        open.addEventListener('click', () => {
          vscode.postMessage({
            type: 'openResultOccurrence',
            fileUri: replacement.fileUri,
            line: replacement.line
          });
        });

        row.append(action, value, token, line, open);
        section.appendChild(row);
      });

      files.appendChild(section);
    });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
