import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as vscode from 'vscode';
import { buildSetupSummary, inferManualSetupSelection } from '../src/setup';
import type { TokenFileInspection } from '../src/colorFile';

function inspection(overrides: Partial<TokenFileInspection>): TokenFileInspection {
  return {
    exportName: 'colors',
    colorTokenCount: 1,
    referenceTokenCount: 0,
    nestedTokenCount: 0,
    leafTokenCount: 1,
    rootKeys: ['primary'],
    pathSamples: ['colors.primary'],
    hasThemeShape: false,
    hasTokenShape: true,
    ...overrides,
  };
}

test('manual setup infers React Native theme files as nested theme-only setup', () => {
  const selection = inferManualSetupSelection(
    vscode.Uri.file('/workspace/src/theme/theme.ts') as vscode.Uri,
    'theme',
    inspection({
      exportName: 'theme',
      referenceTokenCount: 2,
      nestedTokenCount: 3,
      rootKeys: ['text', 'background'],
      pathSamples: ['theme.text.primaryText', 'theme.background.secondaryBg'],
      hasThemeShape: true,
    }),
  );

  assert.equal(selection.workflow, 'themeOnly');
  assert.equal(selection.themeStyle, 'reactNative');
  assert.equal(selection.tokenPathMode, 'nested');
});

test('manual setup infers flat colors files as flat colors-only setup', () => {
  const selection = inferManualSetupSelection(
    vscode.Uri.file('/workspace/src/theme/colors.ts') as vscode.Uri,
    'colors',
    inspection({ exportName: 'Colors', rootKeys: ['BLACK', 'WHITE'] }),
  );

  assert.equal(selection.workflow, 'colorsOnly');
  assert.equal(selection.themeStyle, undefined);
  assert.equal(selection.tokenPathMode, 'flat');
});

test('setup summary explains the saved workflow and reference prefix', () => {
  assert.equal(
    buildSetupSummary({
      relativePath: 'src/theme/theme.ts',
      workflow: 'themeOnly',
      tokenPathMode: 'nested',
      tokenExportName: 'theme',
      referencePrefix: 'theme',
      tokenFileKind: 'theme',
    }),
    'Color Token Manager setup saved: theme only, nested paths, theme file src/theme/theme.ts, reference theme.',
  );
});
