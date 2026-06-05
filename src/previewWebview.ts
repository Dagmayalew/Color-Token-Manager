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

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    button.active {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
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
      margin-bottom: 12px;
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

    .file[hidden],
    .row[hidden] {
      display: none;
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
      grid-template-columns: 24px 68px minmax(120px, 0.75fr) minmax(220px, 1.25fr) 74px auto;
      padding: 8px 10px;
    }

    .row:hover {
      background: var(--vscode-list-hoverBackground);
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

    .preview-toolbar {
      align-items: center;
      border: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
      margin-bottom: 12px;
      padding: 10px;
    }

    .filter-group,
    .selection-actions {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .toolbar-label,
    .cell-label {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      text-transform: uppercase;
    }

    .status-row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: space-between;
      margin-bottom: 12px;
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
    }

    .value-cell,
    .replacement-cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .inline-value {
      align-items: center;
      display: flex;
      gap: 8px;
      min-width: 0;
    }

    .swatch {
      border: 1px solid var(--vscode-panel-border);
      box-sizing: border-box;
      flex: 0 0 auto;
      height: 18px;
      width: 18px;
    }

    code {
      background: var(--vscode-textCodeBlock-background);
      overflow-wrap: anywhere;
      padding: 2px 4px;
    }

    .token-preview {
      color: var(--vscode-descriptionForeground);
      width: fit-content;
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
  <section class="preview-toolbar" aria-label="Preview controls">
    <div class="filter-group" id="filters">
      <span class="toolbar-label">Show</span>
      <button class="secondary active" data-filter="all" type="button">All</button>
      <button class="secondary" data-filter="add" type="button">New</button>
      <button class="secondary" data-filter="alias" type="button">Aliases</button>
      <button class="secondary" data-filter="reuse" type="button">Reused</button>
      <button class="secondary" data-filter="skip" type="button">Skipped</button>
    </div>
    <div class="selection-actions">
      <button class="secondary" id="selectVisible" type="button">Select Visible</button>
      <button class="secondary" id="deselectVisible" type="button">Deselect Visible</button>
    </div>
  </section>
  <div class="status-row">
    <div class="status" id="status"></div>
    <div class="meta" id="selectionSummary"></div>
  </div>
  <main id="files"></main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const preview = ${payload};
    let activeFilter = 'all';

    document.getElementById('folder').textContent = 'Folder: ' + preview.folderPath;
    document.getElementById('colorsFile').textContent = 'Colors file: ' + preview.colorsFilePath;

    document.getElementById('apply').addEventListener('click', () => {
      const editedPreview = collectEditedPreview();
      if (!editedPreview) {
        return;
      }

      vscode.postMessage({ type: 'applyPreview', previewId: preview.id, preview: editedPreview });
    });

    document.querySelectorAll('button[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.filter;
        applyFilter();
      });
    });

    document.getElementById('selectVisible').addEventListener('click', () => {
      setVisibleRowsEnabled(true);
    });

    document.getElementById('deselectVisible').addEventListener('click', () => {
      setVisibleRowsEnabled(false);
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
          if (!checkbox.disabled) {
            checkbox.checked = fileToggle.checked;
          }
        });
        updateSelectionSummary();
      });
      const headerText = document.createElement('span');
      headerText.textContent = file.filePath;
      header.append(fileToggle, headerText);
      section.appendChild(header);

      file.replacements.forEach((replacement, replacementIndex) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.dataset.action = replacement.action;
        row.dataset.fileIndex = String(fileIndex);
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
        enabled.checked = replacement.action !== 'skip' && replacement.enabled !== false;
        enabled.disabled = replacement.action === 'skip';
        enabled.dataset.enabledFileIndex = String(fileIndex);
        enabled.dataset.enabledReplacementIndex = String(replacementIndex);
        enabled.setAttribute('aria-label', 'Apply ' + replacement.value + ' on line ' + replacement.line);
        enabled.addEventListener('click', (event) => event.stopPropagation());
        enabled.addEventListener('change', () => {
          syncFileToggle(fileIndex);
          updateSelectionSummary();
        });

        const action = document.createElement('span');
        action.className = 'badge ' + replacement.action;
        action.textContent = replacement.action;

        const valueCell = document.createElement('div');
        valueCell.className = 'value-cell';
        const valueLabel = document.createElement('span');
        valueLabel.className = 'cell-label';
        valueLabel.textContent = 'From';
        const inlineValue = document.createElement('div');
        inlineValue.className = 'inline-value';
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.backgroundColor = replacement.value;
        swatch.title = replacement.value;
        const value = document.createElement('code');
        value.textContent = replacement.value;
        inlineValue.append(swatch, value);
        valueCell.append(valueLabel, inlineValue);

        const replacementCell = document.createElement('div');
        replacementCell.className = 'replacement-cell';
        const replacementLabel = document.createElement('span');
        replacementLabel.className = 'cell-label';
        replacementLabel.textContent = 'To';

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
          token.textContent = getReplacementPreview(file.filePath, replacement, replacement.tokenName);
        }

        const tokenPreview = document.createElement('code');
        tokenPreview.className = 'token-preview';
        tokenPreview.textContent = getReplacementPreview(file.filePath, replacement, replacement.tokenName);

        if (replacement.aliasOf) {
          token.title = 'Alias of colors.' + replacement.aliasOf;
          tokenPreview.title = 'Alias of colors.' + replacement.aliasOf;
        }

        if (token.tagName === 'INPUT') {
          token.addEventListener('input', () => {
            tokenPreview.textContent = getReplacementPreview(file.filePath, replacement, token.value.trim());
          });
          replacementCell.append(replacementLabel, token, tokenPreview);
        } else {
          replacementCell.append(replacementLabel, token);
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

        row.append(enabled, action, valueCell, replacementCell, line, open);
        section.appendChild(row);
      });

      files.appendChild(section);
    });

    syncAllFileToggles();
    applyFilter();

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
        const checkbox = document.querySelector(
          'input[data-enabled-file-index="' + fileIndex + '"][data-enabled-replacement-index="' + replacementIndex + '"]'
        );
        const isEnabled = Boolean(checkbox && checkbox.checked);

        if (isEnabled && !tokenNamePattern.test(tokenName)) {
          setStatus('Invalid token name: ' + tokenName);
          input.focus();
          return undefined;
        }

        next.files[fileIndex].replacements[replacementIndex].tokenName = tokenName;
        if (isEnabled && originalTokenName && originalTokenName !== tokenName) {
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

    function applyFilter() {
      document.querySelectorAll('button[data-filter]').forEach((button) => {
        const isActive = button.dataset.filter === activeFilter;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });

      document.querySelectorAll('.row[data-action]').forEach((row) => {
        row.hidden = activeFilter !== 'all' && row.dataset.action !== activeFilter;
      });

      document.querySelectorAll('section.file').forEach((section) => {
        const hasVisibleRows = Array.from(section.querySelectorAll('.row[data-action]')).some((row) => !row.hidden);
        section.hidden = !hasVisibleRows;
      });

      updateSelectionSummary();
    }

    function setVisibleRowsEnabled(enabled) {
      getVisibleRows().forEach((row) => {
        const checkbox = row.querySelector('input[data-enabled-file-index]');
        if (checkbox && !checkbox.disabled) {
          checkbox.checked = enabled;
        }
      });

      syncAllFileToggles();
      updateSelectionSummary();
    }

    function syncFileToggle(fileIndex) {
      const rowCheckboxes = Array.from(document.querySelectorAll('input[data-enabled-file-index="' + fileIndex + '"]'))
        .filter((checkbox) => !checkbox.disabled);
      const fileToggle = document.querySelector('input[data-file-toggle-index="' + fileIndex + '"]');
      if (!fileToggle) {
        return;
      }

      if (!rowCheckboxes.length) {
        fileToggle.checked = false;
        fileToggle.indeterminate = false;
        fileToggle.disabled = true;
        return;
      }

      const selectedCount = rowCheckboxes.filter((checkbox) => checkbox.checked).length;
      fileToggle.disabled = false;
      fileToggle.checked = selectedCount > 0;
      fileToggle.indeterminate = selectedCount > 0 && selectedCount < rowCheckboxes.length;
    }

    function syncAllFileToggles() {
      preview.files.forEach((file, fileIndex) => syncFileToggle(fileIndex));
    }

    function updateSelectionSummary() {
      const allCheckboxes = Array.from(document.querySelectorAll('input[data-enabled-file-index]'))
        .filter((checkbox) => !checkbox.disabled);
      const selectedCount = allCheckboxes.filter((checkbox) => checkbox.checked).length;
      const visibleRows = getVisibleRows();
      const visibleSelectableRows = visibleRows
        .map((row) => row.querySelector('input[data-enabled-file-index]'))
        .filter((checkbox) => checkbox && !checkbox.disabled);
      const visibleSelectedCount = visibleSelectableRows.filter((checkbox) => checkbox.checked).length;
      const summary = document.getElementById('selectionSummary');
      summary.textContent =
        selectedCount + ' selected' +
        (visibleRows.length ? ' | ' + visibleSelectedCount + ' of ' + visibleSelectableRows.length + ' visible selectable' : '');

      const apply = document.getElementById('apply');
      apply.textContent = selectedCount === 1 ? 'Apply 1 Change' : 'Apply ' + selectedCount + ' Changes';
      apply.disabled = selectedCount === 0;
    }

    function getVisibleRows() {
      return Array.from(document.querySelectorAll('.row[data-action]')).filter((row) => !row.hidden);
    }

    function getReplacementPreview(filePath, replacement, tokenName) {
      if (replacement.action === 'skip') {
        return 'No edit';
      }

      const nextTokenName = tokenName || replacement.tokenName;
      if (/\\.(css|scss|less)$/i.test(filePath)) {
        return 'var(--color-' + toCssVariableSuffix(nextTokenName) + ')';
      }

      return 'colors.' + nextTokenName;
    }

    function toCssVariableSuffix(tokenName) {
      return tokenName
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
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
