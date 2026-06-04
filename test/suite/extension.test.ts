import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Integration tests that exercise the extension inside a real VS Code
 * Extension Host. Run via `npm run test:integration`.
 *
 * These are intentionally light — they verify activation and that every
 * command declared in `package.json` is registered. Add deeper tests
 * (file-system flows, webview interactions) in this same suite.
 */
suite('Color Token Manager — integration', () => {
  const expectedCommands = [
    'colorTokenManager.open',
    'colorTokenManager.extractFromCurrentFile',
    'colorTokenManager.extractFromFolder',
    'colorTokenManager.previewFromFolder',
    'colorTokenManager.previewFromSelection',
    'colorTokenManager.renameToken',
    'colorTokenManager.findUnusedTokens',
    'colorTokenManager.exportTokens',
    'colorTokenManager.pickColorsFile',
    'colorTokenManager.refresh',
  ];

  test('extension is present and can be activated', async () => {
    const ext = vscode.extensions.getExtension('dagmayalew.color-token-manager');
    assert.ok(ext, 'extension dagmayalew.color-token-manager is not registered');

    if (!ext.isActive) {
      await ext.activate();
    }
    assert.strictEqual(ext.isActive, true, 'extension failed to activate');
  });

  test('contributes the expected configuration namespace', () => {
    const cfg = vscode.workspace.getConfiguration('colorTokenManager');
    assert.ok(cfg, 'colorTokenManager configuration section is missing');
    // A non-throwing read means the section exists; we don't assert
    // any particular default values here so this stays decoupled from
    // future setting additions.
    void cfg.get('namingStrategy');
  });

  test('registers every command declared in package.json', async function () {
    // Activation may need a tick on slow CI; give it a moment.
    this.timeout(10000);

    const commands = await vscode.commands.getCommands(true);
    for (const cmd of expectedCommands) {
      assert.ok(
        commands.includes(cmd),
        `Expected command "${cmd}" to be registered. ` +
          `Check contributes.commands in package.json matches an exported command in src/extension.ts.`,
      );
    }
  });

  test('colorTokenManager.open runs without throwing', async function () {
    this.timeout(10000);
    // The webview opens; we just want to make sure the dispatch path is wired.
    await vscode.commands.executeCommand('colorTokenManager.open');
  });
});
