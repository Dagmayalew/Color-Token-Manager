import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

/**
 * Mocha entry point executed inside the VS Code Extension Host.
 *
 * `@vscode/test-electron` calls this file's exported `run()` once the
 * extension has been activated. We then build a Mocha instance, discover
 * every `*.test.js` under `out-test/test/suite/`, and let it run them.
 *
 * Keep the Mocha UI here because this file runs inside the VS Code
 * Extension Host, where ordinary CLI config discovery is not guaranteed.
 */
export async function run(): Promise<void> {
  const mocha = new Mocha({
    color: true,
    timeout: 20000,
    ui: 'tdd',
  });

  const testsRoot = path.resolve(__dirname);
  const testFiles = findTestFiles(testsRoot, /\.test\.js$/);

  for (const file of testFiles) {
    mocha.addFile(file);
  }

  return new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}

/** Recursive *.test.js discovery — avoids pulling in a glob dependency. */
function findTestFiles(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTestFiles(p, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}
