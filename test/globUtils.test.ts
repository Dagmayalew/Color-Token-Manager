import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globToRegExp } from '../src/globUtils';

test('globToRegExp matches single-segment wildcards', () => {
  const pattern = globToRegExp('src/*.test.ts');

  assert.equal(pattern.test('src/foo.test.ts'), true);
  assert.equal(pattern.test('src/nested/foo.test.ts'), false);
});

test('globToRegExp matches double-star globs on nested paths', () => {
  const pattern = globToRegExp('**/node_modules/**');

  assert.equal(pattern.test('packages/app/node_modules/lodash/index.js'), true);
  assert.equal(pattern.test('src/components/Button.tsx'), false);
});

test('globToRegExp matches default exclude story paths', () => {
  const pattern = globToRegExp('**/*.stories.tsx');

  assert.equal(pattern.test('components/Button.stories.tsx'), true);
  assert.equal(pattern.test('components/Button.tsx'), false);
});
