import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { cssAdapter } from '../src/languages/cssAdapter';
import { extractHardcodedColorsFromText } from '../src/colorScan';
import { __resetTestConfig, __setTestConfig } from './stubs/vscode';

beforeEach(() => {
  __resetTestConfig();
});

test('canReplace is true', () => {
  assert.strictEqual(cssAdapter.canReplace, true);
});

test('buildTokenReference formats as cssVariable by default', () => {
  assert.strictEqual(
    cssAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'primary.500',
      tokenParts: ['primary', '500'],
    }),
    'var(--color-primary-500)',
  );

  assert.strictEqual(
    cssAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'text',
      tokenParts: ['text'],
    }),
    'var(--color-text)',
  );

  assert.strictEqual(
    cssAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'background.white',
      tokenParts: ['background', 'white'],
    }),
    'var(--color-background-white)',
  );
});

test('buildTokenReference respects cssTokenFormat cssVariable setting', () => {
  __setTestConfig({ cssTokenFormat: 'cssVariable' });

  assert.strictEqual(
    cssAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'primary.500',
      tokenParts: ['primary', '500'],
    }),
    'var(--color-primary-500)',
  );
});

test('extractHardcodedColorsFromText correctly extracts colors with cssAdapter active (unquoted)', () => {
  const cssContent = `
      .btn {
        color: #fff;
        background-color: rgb(255, 0, 0);
        border: 1px solid rgba(0, 0, 0, 0.5);
      }
      .alert {
        color: hsl(0, 100%, 50%);
        background: hsla(0, 100%, 50%, 0.5);
      }
    `;

  const extracted = extractHardcodedColorsFromText(cssContent, { includeUnquotedColors: true });

  const values = extracted.map((e) => e.value);
  assert.deepStrictEqual(values, [
    '#fff',
    'rgb(255, 0, 0)',
    'rgba(0, 0, 0, 0.5)',
    'hsl(0, 100%, 50%)',
    'hsla(0, 100%, 50%, 0.5)',
  ]);
});
