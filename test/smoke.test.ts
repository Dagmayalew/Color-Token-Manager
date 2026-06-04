import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getContrastRatio, parseColor } from '../src/colorUtils';

test('test harness runs', () => {
  assert.ok(true);
});

test('parseColor reads hex', () => {
  assert.deepEqual(parseColor('#FFFFFF'), { r: 255, g: 255, b: 255, a: 1 });
});

test('parseColor reads hsl and hsla', () => {
  assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('hsla(120, 100%, 25%, 0.5)'), { r: 0, g: 128, b: 0, a: 0.5 });
});

test('getContrastRatio returns 21 for black on white', () => {
  const ratio = getContrastRatio('#000000', '#FFFFFF');
  assert.equal(ratio, 21);
});
