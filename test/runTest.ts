import { runTests } from '@vscode/test-electron';
import * as path from 'path';

/**
 * Integration test entry point.
 *
 * Runs OUTSIDE VS Code: downloads a stable VS Code build (or uses the one
 * cached in `.vscode-test/`), launches it with this extension loaded, then
 * hands control to the Mocha-based suite at `out-test/test/suite/index.js`.
 *
 * See https://github.com/microsoft/vscode-test for the full API.
 */
async function main(): Promise<void> {
  try {
    // The repo root is the extension development path — VS Code reads
    // package.json + dist/extension.js from here.
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The compiled Mocha entry point that runs INSIDE VS Code.
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Pin a VS Code version that matches the engine declared in package.json
    // (^1.90.0). Using `stable` would also work but pinning avoids surprise
    // breakage when the next VS Code release ships.
    const vscodeVersion = '1.95.0';

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      version: vscodeVersion,
      // Forward these so suite tests can locate the test workspace.
      extensionTestsEnv: {
        CODE_TOKEN_MANAGER_TEST: '1',
      },
    });
  } catch (err) {
    console.error('Integration test runner failed to start:', err);
    process.exit(1);
  }
}

void main();
