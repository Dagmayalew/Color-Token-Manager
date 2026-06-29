import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  normalizeTokenName,
  suggestSemanticName,
  suggestSeriesName,
  suggestTokenName,
} from '../src/tokenNaming';
import { resetColorTokenManagerConfig } from './helpers/config';

beforeEach(() => resetColorTokenManagerConfig());
afterEach(() => resetColorTokenManagerConfig());

// ── normalizeTokenName ────────────────────────────────────────────────────────

test('normalizeTokenName returns clean camelCase identifier', () => {
  assert.equal(normalizeTokenName('my color'), 'myColor');
  assert.equal(normalizeTokenName('primary-500'), 'primary500');
  assert.equal(normalizeTokenName('  text.black  '), 'text.black');
});

test('normalizeTokenName returns color for empty input', () => {
  assert.equal(normalizeTokenName(''), 'color');
  assert.equal(normalizeTokenName('!!!'), 'color');
});

// ── suggestSemanticName ───────────────────────────────────────────────────────

test('suggestSemanticName detects background from property name', () => {
  assert.equal(suggestSemanticName('  backgroundColor: '), 'background');
});

test('suggestSemanticName detects text from color property', () => {
  assert.equal(suggestSemanticName('  color: '), 'text');
});

test('suggestSemanticName detects border', () => {
  assert.equal(suggestSemanticName('  borderColor: '), 'border');
});

test('suggestSemanticName detects surface', () => {
  assert.equal(suggestSemanticName('  surfaceColor: '), 'surface');
});

test('suggestSemanticName detects primary', () => {
  assert.equal(suggestSemanticName('  primaryColor: '), 'primary');
});

test('suggestSemanticName detects success', () => {
  assert.equal(suggestSemanticName('  successBackground: '), 'success');
});

test('suggestSemanticName detects warning', () => {
  assert.equal(suggestSemanticName('  warningText: '), 'warning');
});

test('suggestSemanticName detects danger', () => {
  assert.equal(suggestSemanticName('  dangerBorder: '), 'danger');
});

test('suggestSemanticName detects shadow', () => {
  assert.equal(suggestSemanticName('  shadowColor: '), 'shadow');
});

test('suggestSemanticName returns undefined for unknown context', () => {
  assert.equal(suggestSemanticName('  someRandomProp: '), undefined);
  assert.equal(suggestSemanticName(''), undefined);
});

// ── suggestSeriesName ─────────────────────────────────────────────────────────

test('suggestSeriesName matches exact primary.500', () => {
  assert.equal(suggestSeriesName('#3B82F6'), 'primary.500');
});

test('suggestSeriesName matches exact neutral.900', () => {
  assert.equal(suggestSeriesName('#111827'), 'neutral.900');
});

test('suggestSeriesName matches exact success.500', () => {
  assert.equal(suggestSeriesName('#22C55E'), 'success.500');
});

test('suggestSeriesName matches exact warning.500', () => {
  assert.equal(suggestSeriesName('#F59E0B'), 'warning.500');
});

test('suggestSeriesName matches exact danger.500', () => {
  assert.equal(suggestSeriesName('#EF4444'), 'danger.500');
});

test('suggestSeriesName matches exact neutral.50', () => {
  assert.equal(suggestSeriesName('#F9FAFB'), 'neutral.50');
});

test('suggestSeriesName matches exact neutral.200 (common border color)', () => {
  assert.equal(suggestSeriesName('#E5E7EB'), 'neutral.200');
});

test('suggestSeriesName returns undefined for unmatchable color', () => {
  // Magenta is perceptually far from all built-in palettes
  assert.equal(suggestSeriesName('#FF00FF'), undefined);
});

// ── suggestTokenName ──────────────────────────────────────────────────────────

test('suggestTokenName returns high-confidence semantic suggestion first', () => {
  const suggestions = suggestTokenName('#FFFFFF', 'backgroundColor: ');
  assert.ok(suggestions.length > 0);
  assert.equal(suggestions[0].name, 'background');
  assert.equal(suggestions[0].confidence, 'high');
});

test('suggestTokenName returns palette suggestion as medium confidence', () => {
  const suggestions = suggestTokenName('#3B82F6', 'tintColor: ');
  const medium = suggestions.find((s) => s.confidence === 'medium');
  assert.ok(medium, 'should have a medium confidence suggestion');
  assert.equal(medium.name, 'primary.500');
});

test('suggestTokenName with mode=off suppresses palette suggestions', () => {
  const suggestions = suggestTokenName('#3B82F6', 'tintColor: ', { mode: 'off' });
  const medium = suggestions.find((s) => s.confidence === 'medium');
  assert.equal(medium, undefined, 'palette suggestions should be suppressed');
});

test('suggestTokenName with mode=semantic suppresses palette suggestions', () => {
  const suggestions = suggestTokenName('#3B82F6', 'primaryColor: ', { mode: 'semantic' });
  const primary = suggestions.find((s) => s.name === 'primary');
  assert.ok(primary, 'semantic name should still be suggested');
  const series = suggestions.find((s) => s.name === 'primary.500');
  assert.equal(series, undefined, 'series name should be suppressed in semantic mode');
});

test('suggestTokenName always includes a low-confidence fallback', () => {
  const suggestions = suggestTokenName('#AABBCC', '', { mode: 'off' });
  const low = suggestions.find((s) => s.confidence === 'low');
  assert.ok(low, 'should always include a low-confidence fallback');
});

test('suggestTokenName recognizes white as named color', () => {
  const suggestions = suggestTokenName('#FFFFFF', 'someOtherProp: ');
  const named = suggestions.find((s) => s.name === 'white');
  assert.ok(named, 'white should be recognized');
  assert.equal(named.confidence, 'high');
});

test('suggestTokenName recognizes black as named color', () => {
  const suggestions = suggestTokenName('#000000', 'someOtherProp: ');
  const named = suggestions.find((s) => s.name === 'black');
  assert.ok(named, 'black should be recognized');
});

test('suggestTokenName works with rgb color values', () => {
  // rgb(59, 130, 246) is #3B82F6 = primary.500
  const suggestions = suggestTokenName('rgb(59, 130, 246)', 'tintColor: ');
  const series = suggestions.find((s) => s.name === 'primary.500');
  assert.ok(series, 'should match rgb equivalent of primary.500');
});
