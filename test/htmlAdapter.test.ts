import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { htmlAdapter } from '../src/languages/htmlAdapter';
import { __resetTestConfig } from './stubs/vscode';

beforeEach(() => {
  __resetTestConfig();
});

test('canReplace is true for inline styles', () => {
  assert.strictEqual(htmlAdapter.canReplace, true);
});

test('canScan is true', () => {
  assert.strictEqual(htmlAdapter.canScan, true);
});

test('buildTokenReference formats as cssVariable', () => {
  assert.strictEqual(
    htmlAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'primary.500',
      tokenParts: ['primary', '500'],
    }),
    'var(--color-primary-500)',
  );

  assert.strictEqual(
    htmlAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'text',
      tokenParts: ['text'],
    }),
    'var(--color-text)',
  );

  assert.strictEqual(
    htmlAdapter.buildTokenReference({
      tokenPath: 'colors',
      tokenName: 'background.white',
      tokenParts: ['background', 'white'],
    }),
    'var(--color-background-white)',
  );
});

test('extracts colors from inline style attributes', () => {
  const htmlContent = `<div style="color: #111827; background-color: #FFFFFF;">
    <span style="border: 1px solid rgb(0,0,0);">Text</span>
  </div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  const values = extracted.map((e) => e.value);

  assert.deepStrictEqual(values, ['#111827', '#FFFFFF', 'rgb(0,0,0)']);
});

test('extracts hex, rgb, rgba, hsl, hsla colors from inline styles', () => {
  const htmlContent = `<div style="
    color: #fff;
    background-color: #FFFFFF;
    border-color: rgb(255, 0, 0);
    shadow: rgba(0, 0, 0, 0.5);
    gradient: hsl(0, 100%, 50%);
    gradient-alpha: hsla(0, 100%, 50%, 0.5);
  "></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  const values = extracted.map((e) => e.value);

  assert.deepStrictEqual(values, [
    '#fff',
    '#FFFFFF',
    'rgb(255, 0, 0)',
    'rgba(0, 0, 0, 0.5)',
    'hsl(0, 100%, 50%)',
    'hsla(0, 100%, 50%, 0.5)',
  ]);
});

test('does NOT extract colors from text content', () => {
  const htmlContent = `<div>
    The color #FF0000 is red.
    RGB values like rgb(255, 0, 0) are valid.
  </div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 0);
});

test('does NOT extract colors from HTML comments', () => {
  const htmlContent = `<!-- This comment has #FF0000 and rgb(0,0,0) -->
<div style="color: #fff;"></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);
  assert.strictEqual(extracted[0].value, '#fff');
});

test('does NOT extract colors from script blocks', () => {
  const htmlContent = `<script>
  const color = '#FF0000';
  element.style.color = 'rgb(0, 255, 0)';
</script>
<div style="color: #fff;"></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);
  assert.strictEqual(extracted[0].value, '#fff');
});

test('does NOT extract colors from style blocks', () => {
  const htmlContent = `<style>
  .btn { color: #FF0000; }
</style>
<div style="color: #fff;"></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);
  assert.strictEqual(extracted[0].value, '#fff');
});

test('handles double-quoted style attributes', () => {
  const htmlContent = `<div style="color: #111827;"></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);
  assert.strictEqual(extracted[0].value, '#111827');
});

test('handles single-quoted style attributes', () => {
  const htmlContent = `<div style='color: #111827;'></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);
  assert.strictEqual(extracted[0].value, '#111827');
});

test('handles multiple elements with inline styles', () => {
  const htmlContent = `
    <header style="background-color: #1a1a1a;">
      <nav style="color: #ffffff;">Navigation</nav>
    </header>
    <main style="background: #f5f5f5;">
      <p style="color: #333333;">Content</p>
    </main>
  `;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  const values = extracted.map((e) => e.value);

  assert.deepStrictEqual(values, ['#1a1a1a', '#ffffff', '#f5f5f5', '#333333']);
});

test('calculates correct positions within inline styles', () => {
  const htmlContent = `<div style="color: #fff;">Text</div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);

  const color = extracted[0];
  const extractedText = htmlContent.slice(color.start, color.end);
  assert.strictEqual(extractedText, '#fff');
});

test('ignores colors in data attributes', () => {
  const htmlContent = `<div data-color="#FF0000" data-bg="rgb(0,0,0)"></div>
<div style="color: #fff;"></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);
  assert.strictEqual(extracted[0].value, '#fff');
});

test('ignores colors in class names or IDs', () => {
  const htmlContent = `<div id="color-red" class="bg-white"></div>
<div style="color: #111827;"></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);
  assert.strictEqual(extracted[0].value, '#111827');
});

test('handles empty style attribute', () => {
  const htmlContent = `<div style=""></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 0);
});

test('handles style attribute without colors', () => {
  const htmlContent = `<div style="margin: 10px; padding: 5px;"></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 0);
});

test('extracts colors with context for token naming', () => {
  const htmlContent = `<div style="background-color: #1a1a1a;"></div>`;

  const extracted = htmlAdapter.extractInlineStyleColors!(htmlContent);
  assert.strictEqual(extracted.length, 1);
  assert.ok(extracted[0].suggestedName.length > 0);
});
