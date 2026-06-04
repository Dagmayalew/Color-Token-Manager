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
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      margin: 0;
      padding: 24px;
    }

    header {
      margin-bottom: 20px;
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 8px;
    }

    .meta {
      color: var(--vscode-descriptionForeground);
      overflow-wrap: anywhere;
    }

    .summary {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      margin-bottom: 20px;
    }

    .metric {
      border: 1px solid var(--vscode-panel-border);
      padding: 10px;
    }

    .metric strong {
      display: block;
      font-size: 20px;
      margin-bottom: 4px;
    }

    .file {
      border: 1px solid var(--vscode-panel-border);
      margin-bottom: 12px;
    }

    .file-header {
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600;
      padding: 10px;
      overflow-wrap: anywhere;
    }

    .row {
      align-items: center;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: grid;
      gap: 10px;
      grid-template-columns: 70px minmax(100px, 160px) minmax(160px, 1fr) 80px auto;
      padding: 8px 10px;
    }

    .row:last-child {
      border-bottom: 0;
    }

    button {
      background: var(--vscode-button-background);
      border: 0;
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font: inherit;
      min-height: 26px;
      padding: 2px 8px;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      padding: 3px 6px;
      text-transform: uppercase;
      width: fit-content;
    }

    .badge.add,
    .badge.alias {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-editor-foreground);
    }

    .empty {
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      padding: 24px;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <h1>Color Extraction Results</h1>
    <div class="meta" id="folder"></div>
    <div class="meta" id="colorsFile"></div>
  </header>

  <section class="summary" id="summary"></section>
  <main id="files"></main>

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
