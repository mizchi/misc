/*
Universal testing library for Deno, Node.js, Vitest and the browser.
// foo.test.{js,mjs,ts}
import { test, eq } from './unitest.mjs';
test('1 === 1', () => {
  eq(1, 1);
});
$ deno test foo.test.ts
$ node --test foo.test.mjs
$ npx vitest foo.test.ts
html
<script type="module">
  import './foo.test.js';
  await __tester__.run();
  console.log(__tester__.errors);
</script>
*/

/**
 * @__NO_SIDE_EFFECTS__
 */
function getEnv() {
  if (typeof Deno !== 'undefined') {
    return "deno";
  }
  // @ts-ignore
  if (import.meta.env && import.meta.env.VITEST_POOL_ID !== undefined) {
    return "vitest";
  }
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env.NODE_TEST_CONTEXT) {
    return "node-test" /* Environment.NodeTest */;
  }
  if (typeof window !== 'undefined') {
    return 'browser';
  }
  if (typeof globalThis !== 'undefined') {
    return 'es';
  }
  throw new Error('Unknown environment');
}

type Tester = {
  env: string,
  test: (name: string, fn: () => void | Promise<void>) => void,
  run?: () => Promise<boolean>,
  errors: { name: string, error: Error }[]
}

/**
 * @__NO_SIDE_EFFECTS__
 */
async function _init() {
  const env = getEnv();
  const tester: Tester = {
    env,
    test: () => {
      throw new Error('Tester not initialized');
    },
    run: undefined,
    errors: [],
  };

  // @ts-ignore globalThis
  globalThis.__tester__ = tester;

  switch (env) {
    case "deno": {
      tester.test = (name, fn) => {
        Deno.test(name, () => fn());
      }
      break;
    }
    case "vitest": {
      const specifier = 'vitest'
      const vitest = await import(specifier);
      tester.test = (name, fn) => {
        vitest.test(name, fn);
      }
      break;
    }
    case "node-test": {
      const specifier = 'node:test';
      const nodeTest = await import(specifier);
      tester.test = (name, fn) => {
        nodeTest.it(name, fn);
      }
      break;
    }
    case "es":
    case "browser": {
      // @ts-ignore
      if (globalThis.__tester__?.test) {
        return;
      }

      type Test = (name: string, fn: () => any) => void | Promise<void>;
      const tests: Array<{ name: string, fn: any }> = [];
      const errors = [];
      const test: Test = (name, fn) => {
        tests.push({ fn, name });
      };
      const run = async () => {
        for (const test of tests) {
          try {
            await test.fn();
          } catch (error) {
            errors.push({ name: test.name, error });
          }
        }
        tests.length = 0;
        return errors.length === 0;
      };
      tester.test = test;
      tester.run = run;
      break;
    }
    default: {
      throw new Error(`Unknown environment ${env}`);
    }
  }
}
/**
 * @__PURE__
 */
await _init();

// --- public API ---

export function test(name: string, fn: () => void | Promise<void>) {
  // @ts-ignore
  globalThis.__tester__.test(name, fn);
}

export function eq(a: any, b: any, message = 'Assertion failed') {
  if (a !== b) {
    throw new Error(message);
  }
}