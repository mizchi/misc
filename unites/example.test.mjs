// foo.test.{js,mjs,ts}
import { test, eq } from './npm/esm/mod.js';
test('1 === 1', () => {
  eq(1, 1);
});
