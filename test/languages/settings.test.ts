import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { getEffectiveAdapterForDocument } from '../../src/languages/registry';
import { javascriptAdapter } from '../../src/languages/javascriptAdapter';
import { genericAdapter } from '../../src/languages/genericAdapter';
import { __resetTestConfig, __setTestConfig } from '../stubs/vscode';

beforeEach(() => {
  __resetTestConfig();
});

function makeDocument(languageId: string, fileName: string) {
  return { languageId, fileName } as any;
}

test('enabledLanguages disables languages outside the allowlist', () => {
  __setTestConfig({ enabledLanguages: ['javascript'] });

  assert.strictEqual(
    getEffectiveAdapterForDocument(makeDocument('javascript', '/workspace/app.js')),
    javascriptAdapter,
  );
  assert.strictEqual(
    getEffectiveAdapterForDocument(makeDocument('dart', '/workspace/app.dart')),
    genericAdapter,
  );
});

test('languageMode scanOnly disables replacement for supported languages', () => {
  __setTestConfig({ languageMode: 'scanOnly' });

  const adapter = getEffectiveAdapterForDocument(makeDocument('javascript', '/workspace/app.js'));
  assert.strictEqual(adapter.canScan, true);
  assert.strictEqual(adapter.canReplace, false);
});

test('languageMode safe keeps safe replacement adapters intact', () => {
  __setTestConfig({ languageMode: 'safe' });

  const adapter = getEffectiveAdapterForDocument(makeDocument('javascript', '/workspace/app.js'));
  assert.strictEqual(adapter, javascriptAdapter);
});
