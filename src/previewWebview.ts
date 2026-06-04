import { type FolderExtractionPreview } from './types';

export function getPreviewWebviewHtml(preview: FolderExtractionPreview): string {
  const nonce = getNonce();
  const payload = JSON.stringify(preview).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Color Extraction Preview</title>
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

    h2 {
      font-size: 16px;
      margin: 0;
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

    .open-button {
      min-height: 26px;
      padding: 2px 8px;
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
      align-items: center;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
      font-weight: 600;
      padding: 10px;
      overflow-wrap: anywhere;
    }

    .row {
      align-items: center;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
      display: grid;
      gap: 10px;
      grid-template-columns: 24px 70px minmax(100px, 160px) minmax(160px, 1fr) 80px auto;
      padding: 8px 10px;
    }

    input[type="text"] {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      color: var(--vscode-input-foreground);
      font: inherit;
      min-height: 28px;
      padding: 3px 6px;
      width: 100%;
    }

    input[type="checkbox"] {
      cursor: pointer;
      height: 16px;
      margin: 0;
      width: 16px;
    }

    .row:last-child {
      border-bottom: 0;
    }

    .badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      padding: 3px 6px;
      text-transform: uppercase;
      width: fit-content;
    }

    .badge.add {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-editor-foreground);
    }

    .badge.skip {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-editor-foreground);
    }

    .empty {
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      padding: 24px;
      text-align: center;
    }

    .status {
      color: var(--vscode-descriptionForeground);
      min-height: 20px;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Color Extraction Preview</h1>
      <div class="meta" id="folder"></div>
      <div class="meta" id="colorsFile"></div>
    </div>
    <button id="apply" type="button">Apply Changes</button>
  </header>

  <section class="summary" id="summary"></section>
  <div class="status" id="status"></div>
  <main id="files"></main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const preview = ${payload};

    document.getElementById('folder').textContent = 'Folder: ' + preview.folderPath;
    document.getElementById('colorsFile').textContent = 'Colors file: ' + preview.colorsFilePath;

    document.getElementById('apply').addEventListener('click', () => {
      const editedPreview = collectEditedPreview();
      if (!editedPreview) {
        return;
      }

      vscode.postMessage({ type: 'applyPreview', previewId: preview.id, preview: editedPreview });
    });

    const summary = document.getElementById('summary');
    [
      ['Files scanned', preview.filesScanned],
      ['Files with colors', preview.filesWithColors],
      ['Colors found', preview.colorsFound],
      ['Tokens/aliases to add', preview.tokensToAdd],
      ['Existing tokens reused', preview.tokensToReuse]
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
    if (!preview.files.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No hardcoded colors found.';
      files.appendChild(empty);
      document.getElementById('apply').disabled = true;
    }

    preview.files.forEach((file) => {
      const fileIndex = preview.files.indexOf(file);
      const section = document.createElement('section');
      section.className = 'file';

      const header = document.createElement('div');
      header.className = 'file-header';
      const fileToggle = document.createElement('input');
      fileToggle.type = 'checkbox';
      fileToggle.checked = file.replacements.some((replacement) => replacement.enabled !== false);
      fileToggle.dataset.fileToggleIndex = String(fileIndex);
      fileToggle.setAttribute('aria-label', 'Apply all colors in ' + file.filePath);
      fileToggle.addEventListener('click', (event) => event.stopPropagation());
      fileToggle.addEventListener('change', () => {
        document.querySelectorAll('input[data-enabled-file-index="' + fileIndex + '"]').forEach((checkbox) => {
          checkbox.checked = fileToggle.checked;
        });
      });
      const headerText = document.createElement('span');
      headerText.textContent = file.filePath;
      header.append(fileToggle, headerText);
      section.appendChild(header);

      file.replacements.forEach((replacement, replacementIndex) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.addEventListener('click', () => {
          vscode.postMessage({
            type: 'openPreviewOccurrence',
            fileUri: file.fileUri,
            start: replacement.start,
            line: replacement.line
          });
        });

        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = replacement.enabled !== false;
        enabled.dataset.enabledFileIndex = String(fileIndex);
        enabled.dataset.enabledReplacementIndex = String(replacementIndex);
        enabled.setAttribute('aria-label', 'Apply ' + replacement.value + ' on line ' + replacement.line);
        enabled.addEventListener('click', (event) => event.stopPropagation());
        enabled.addEventListener('change', () => syncFileToggle(fileIndex));

        const action = document.createElement('span');
        action.className = 'badge ' + replacement.action;
        action.textContent = replacement.action;

        const value = document.createElement('code');
        value.textContent = replacement.value;

        let token;
        if (replacement.action === 'add' || replacement.action === 'alias') {
          token = document.createElement('input');
          token.type = 'text';
          token.value = replacement.tokenName;
          token.dataset.originalTokenName = replacement.tokenName;
          token.dataset.fileIndex = String(fileIndex);
          token.dataset.replacementIndex = String(replacementIndex);
          token.setAttribute('aria-label', 'Token name for ' + replacement.value);
          token.addEventListener('click', (event) => event.stopPropagation());
        } else {
          token = document.createElement('code');
          token.textContent = 'colors.' + replacement.tokenName;
        }

        if (replacement.aliasOf) {
          token.title = 'Alias of colors.' + replacement.aliasOf;
        }

        const line = document.createElement('span');
        line.textContent = 'line ' + replacement.line;

        const open = document.createElement('button');
        open.className = 'open-button';
        open.type = 'button';
        open.textContent = 'Open';
        open.addEventListener('click', (event) => {
          event.stopPropagation();
          vscode.postMessage({
            type: 'openPreviewOccurrence',
            fileUri: file.fileUri,
            start: replacement.start,
            line: replacement.line
          });
        });

        row.append(enabled, action, value, token, line, open);
        section.appendChild(row);
      });

      files.appendChild(section);
    });

    function collectEditedPreview() {
      const next = JSON.parse(JSON.stringify(preview));
      const tokenNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
      const renamedTokens = new Map();

      for (const checkbox of document.querySelectorAll('input[data-enabled-file-index]')) {
        const fileIndex = Number(checkbox.dataset.enabledFileIndex);
        const replacementIndex = Number(checkbox.dataset.enabledReplacementIndex);
        next.files[fileIndex].replacements[replacementIndex].enabled = checkbox.checked;
      }

      for (const input of document.querySelectorAll('input[type="text"][data-file-index]')) {
        const fileIndex = Number(input.dataset.fileIndex);
        const replacementIndex = Number(input.dataset.replacementIndex);
        const tokenName = input.value.trim();
        const originalTokenName = input.dataset.originalTokenName;

        if (!tokenNamePattern.test(tokenName)) {
          setStatus('Invalid token name: ' + tokenName);
          input.focus();
          return undefined;
        }

        next.files[fileIndex].replacements[replacementIndex].tokenName = tokenName;
        if (originalTokenName && originalTokenName !== tokenName) {
          renamedTokens.set(originalTokenName, tokenName);
        }
      }

      if (renamedTokens.size) {
        next.files.forEach((file) => {
          file.replacements.forEach((replacement) => {
            if (replacement.action === 'reuse' && renamedTokens.has(replacement.tokenName)) {
              replacement.tokenName = renamedTokens.get(replacement.tokenName);
            }
          });
        });
      }

      setStatus('');
      return next;
    }

    function syncFileToggle(fileIndex) {
      const rowCheckboxes = Array.from(document.querySelectorAll('input[data-enabled-file-index="' + fileIndex + '"]'));
      const fileToggle = document.querySelector('input[data-file-toggle-index="' + fileIndex + '"]');
      if (!fileToggle) {
        return;
      }

      fileToggle.checked = rowCheckboxes.some((checkbox) => checkbox.checked);
    }

    function setStatus(message) {
      document.getElementById('status').textContent = message;
    }
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
