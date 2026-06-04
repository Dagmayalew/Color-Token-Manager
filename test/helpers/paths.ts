import * as path from 'path';

/** Resolve a file under `test/fixtures/` from compiled test output in `out-test/`. */
export function fixturePath(...segments: string[]): string {
  return path.join(__dirname, '..', '..', '..', 'test', 'fixtures', ...segments);
}
