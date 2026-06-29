import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAdapterByLanguageId,
  getAdapterForDocument,
  getSupportedLanguageIds,
  getScannableAdapters,
  getReplaceableAdapters,
} from '../../src/languages/registry';
import { genericAdapter } from '../../src/languages/genericAdapter';
import { typescriptAdapter } from '../../src/languages/typescriptAdapter';
import { javascriptAdapter } from '../../src/languages/javascriptAdapter';
import { cssAdapter } from '../../src/languages/cssAdapter';
import { htmlAdapter } from '../../src/languages/htmlAdapter';
import { svgAdapter, xmlAdapter } from '../../src/languages/registry';

test('getAdapterByLanguageId returns correct adapter', () => {
  assert.strictEqual(getAdapterByLanguageId('typescript'), typescriptAdapter);
  assert.strictEqual(getAdapterByLanguageId('javascript'), javascriptAdapter);
  assert.strictEqual(getAdapterByLanguageId('css'), cssAdapter);
  assert.strictEqual(getAdapterByLanguageId('html'), htmlAdapter);
  assert.strictEqual(getAdapterByLanguageId('unknown-lang'), genericAdapter);
});

test('getAdapterForDocument uses languageId first', () => {
  const mockDoc = {
    languageId: 'typescript',
    fileName: '/path/to/file.txt',
  } as any;

  assert.strictEqual(getAdapterForDocument(mockDoc), typescriptAdapter);
});

test('getAdapterForDocument falls back to extension', () => {
  const mockDoc = {
    languageId: 'unknown',
    fileName: '/path/to/file.js',
  } as any;

  assert.strictEqual(getAdapterForDocument(mockDoc), javascriptAdapter);
});

test('getAdapterForDocument uses extension to disambiguate shared language ids', () => {
  const svgDoc = {
    languageId: 'xml',
    fileName: '/path/to/icon.svg',
  } as any;
  const xmlDoc = {
    languageId: 'xml',
    fileName: '/path/to/layout.xml',
  } as any;

  assert.strictEqual(getAdapterForDocument(svgDoc), svgAdapter);
  assert.strictEqual(getAdapterForDocument(xmlDoc), xmlAdapter);
});

test('getAdapterForDocument falls back to generic adapter', () => {
  const mockDoc = {
    languageId: 'unknown',
    fileName: '/path/to/file.unknown',
  } as any;

  assert.strictEqual(getAdapterForDocument(mockDoc), genericAdapter);
});

test('getSupportedLanguageIds includes known languages', () => {
  const langs = getSupportedLanguageIds();
  assert.ok(langs.includes('typescript'));
  assert.ok(langs.includes('javascript'));
  assert.ok(langs.includes('css'));
  assert.ok(langs.includes('html'));
});

test('getScannableAdapters returns adapters that can scan', () => {
  const scannable = getScannableAdapters();
  assert.ok(scannable.includes(typescriptAdapter));
  assert.ok(scannable.includes(genericAdapter));
});

test('getReplaceableAdapters returns only adapters that can replace', () => {
  const replaceable = getReplaceableAdapters();
  assert.ok(replaceable.includes(typescriptAdapter));
  assert.ok(replaceable.includes(javascriptAdapter));
  assert.ok(!replaceable.includes(genericAdapter));
  assert.ok(replaceable.includes(htmlAdapter));
});
