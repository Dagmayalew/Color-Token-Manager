import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { extractHardcodedColorsFromText } from '../src/colorExtractor';
import { getProjectTokenName, shouldCreateAlias } from '../src/colorPlan';
import { getReplacementText } from '../src/colorScan';
import type { AppColor } from '../src/types';
import { resetColorTokenManagerConfig, setColorTokenManagerConfig } from './helpers/config';

beforeEach(() => {
  resetColorTokenManagerConfig();
});

afterEach(() => {
  resetColorTokenManagerConfig();
});

test('extractHardcodedColorsFromText finds quoted hex literals', () => {
  const text = `const styles = { card: { backgroundColor: '#FFFFFF' } };`;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].value, '#FFFFFF');
  assert.equal(extracted[0].type, 'hex');
  assert.equal(extracted[0].replacementKind, 'literal');
});

test('extractHardcodedColorsFromText finds rgb and rgba literals', () => {
  const text = `
    const a = 'rgb(255, 0, 0)';
    const b = "rgba(0, 0, 0, 0.5)";
  `;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].value, 'rgb(255, 0, 0)');
  assert.equal(extracted[1].value, 'rgba(0, 0, 0, 0.5)');
});

test('extractHardcodedColorsFromText finds hsl and hsla literals', () => {
  const text = `
    const a = 'hsl(210, 50%, 40%)';
    const b = "hsla(210, 50%, 40%, 0.5)";
  `;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].value, 'hsl(210, 50%, 40%)');
  assert.equal(extracted[0].type, 'hsl');
  assert.equal(extracted[1].value, 'hsla(210, 50%, 40%, 0.5)');
  assert.equal(extracted[1].type, 'hsla');
});

test('extractHardcodedColorsFromText ignores line comments', () => {
  const text = `
    // backgroundColor: '#000000'
    const color = '#111111';
  `;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].value, '#111111');
});

test('extractHardcodedColorsFromText ignores block comments', () => {
  const text = `
    /* shadow: '#222222' */
    const border = '#333333';
  `;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].value, '#333333');
});

test('extractHardcodedColorsFromText ignores import statements', () => {
  const text = `
    import { colors } from '../theme/colors';
    const tint = '#444444';
  `;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].value, '#444444');
});

test('extractHardcodedColorsFromText extracts embedded colors when enabled', () => {
  setColorTokenManagerConfig({ extractEmbeddedColors: true });
  const text = `const shadow = '0 0 8px #000000';`;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].value, '#000000');
  assert.equal(extracted[0].replacementKind, 'embeddedString');
});

test('extractHardcodedColorsFromText extracts embedded hsl colors when enabled', () => {
  setColorTokenManagerConfig({ extractEmbeddedColors: true });
  const text = `const shadow = '0 0 8px hsl(210, 50%, 40%)';`;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].value, 'hsl(210, 50%, 40%)');
  assert.equal(extracted[0].replacementKind, 'embeddedString');
});

test('extractHardcodedColorsFromText skips embedded colors by default', () => {
  const text = `const shadow = '0 0 4px #000000';`;
  const extracted = extractHardcodedColorsFromText(text);

  assert.equal(extracted.length, 0);
});

test('extractHardcodedColorsFromText finds unquoted css colors when enabled', () => {
  const text = `
    .button {
      color: #ffffff;
      background: rgba(0, 0, 0, 0.5);
      border-color: hsl(210, 50%, 40%);
    }
  `;
  const extracted = extractHardcodedColorsFromText(text, { includeUnquotedColors: true });

  assert.equal(extracted.length, 3);
  assert.deepEqual(
    extracted.map((color) => color.value),
    ['#ffffff', 'rgba(0, 0, 0, 0.5)', 'hsl(210, 50%, 40%)'],
  );
  assert.equal(
    extracted.every((color) => color.replacementKind === 'cssLiteral'),
    true,
  );
});

test('extractHardcodedColorsFromText does not double count quoted colors when unquoted css mode is enabled', () => {
  const text = `.button::before { content: "#ffffff"; color: #000000; }`;
  const extracted = extractHardcodedColorsFromText(text, { includeUnquotedColors: true });

  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].replacementKind, 'literal');
  assert.equal(extracted[1].replacementKind, 'cssLiteral');
});

test('getReplacementText returns css variables for css literals', () => {
  const [color] = extractHardcodedColorsFromText('.button { color: #ffffff; }', {
    includeUnquotedColors: true,
  });

  assert.equal(getReplacementText(color, 'button.background'), 'var(--color-button-background)');
  assert.equal(getReplacementText(color, 'primaryOrange'), 'var(--color-primary-orange)');
});

test('flat color projects do not receive nested semantic token paths', () => {
  const existingColors: AppColor[] = [{ key: 'black', value: '#000000', type: 'hex' }];

  assert.equal(getProjectTokenName('text.black', existingColors), 'textBlack');
  assert.equal(shouldCreateAlias('black', 'textBlack', new Set(['black']), existingColors), false);
});

test('nested color projects keep nested semantic token paths', () => {
  const existingColors: AppColor[] = [{ key: 'background.white', value: '#FFFFFF', type: 'hex' }];

  assert.equal(getProjectTokenName('text.black', existingColors), 'text.black');
  assert.equal(shouldCreateAlias('black', 'text.black', new Set(['black']), existingColors), true);
});
