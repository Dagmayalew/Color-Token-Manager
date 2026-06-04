import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRelativeConfiguredPath } from '../src/workspaceUtils';

test('resolveRelativeConfiguredPath joins relative paths to a workspace root', () => {
  const resolved = resolveRelativeConfiguredPath('/workspace/app-a', 'src/theme/colors.ts');
  assert.equal(resolved.replace(/\\/g, '/'), '/workspace/app-a/src/theme/colors.ts');
});

test('resolveRelativeConfiguredPath keeps absolute configured paths', () => {
  const resolved = resolveRelativeConfiguredPath('/workspace/app-a', '/shared/colors.ts');
  assert.equal(resolved, '/shared/colors.ts');
});

test('resolveRelativeConfiguredPath trims whitespace', () => {
  const resolved = resolveRelativeConfiguredPath('/workspace/app-b', '  theme/colors.ts  ');
  assert.equal(resolved.replace(/\\/g, '/'), '/workspace/app-b/theme/colors.ts');
});
