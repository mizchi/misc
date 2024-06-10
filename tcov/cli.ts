import { exists, existsSync } from "jsr:@std/fs@0.221.0/exists";
import $ from "jsr:@david/dax@0.41.0";
import { join } from "jsr:@std/path@0.221.0/join";
import { parseArgs } from 'node:util';
import { parseLcov } from "./lcov.ts";
import { OpenAI } from "npm:openai@4.49.1";

$.setPrintCommand(true);

async function runCommand(cmd: string[]) {
  const [head, ...tail] = cmd;
  const ret = await $`${head} ${tail}`.noThrow().stdout('piped').stderr('piped');
  const result = ret.stdout + ret.stderr;
  if (ret.code !== 0) {
    return {
      ok: false,
      code: ret.code,
      result
    }
  } else {
    return {
      ok: true,
      code: ret.code,
      result
    }
  }
}

function normalizePath(expr: string, root: string): string {
  if (expr.startsWith("/")) {
    return expr;
  }
  return join(root, expr);
}

const options = {
  // source: {
  //   type: 'string',
  //   short: 's',
  // },
  // test: {
  //   type: 'string',
  //   short: 't',
  //   default: null
  // }
};


function getTestCode(sourceCodePath: string) {
  // TODO: tsx
  const hyphenTestPath = sourceCodePath.replace(/\.ts$/, '_test.ts');
  if (existsSync(hyphenTestPath)) {
    return hyphenTestPath;
  }
  const dotTestPath = sourceCodePath.replace(/\.ts$/, '.test.ts');
  if (existsSync(dotTestPath)) {
    return dotTestPath;
  }
  return null;
}


async function main(args: string[], rest: string[]) {
  const parsed = parseArgs({
    args,
    options: options,
    allowPositionals: true,
  });

  const root = Deno.cwd();
  const first = parsed.positionals[0];
  const source = normalizePath(first, root);
  const testCode = parsed.values.test
    ? normalizePath(parsed.values.test, root)
    : getTestCode(source);
  if (!testCode) {
    throw new Error('Test code not found');
  }
  const testCommand = rest.length > 0
    ? rest
    : ['deno', 'test', '-A', '--coverage', testCode];
  const result = await runCommand(testCommand);
  if (result.ok) {
    console.log('Success', result.result);
  }

  const cov = await runCommand(['deno', 'coverage', '--lcov']);
  if (!cov.ok) {
    throw new Error('Coverage failed');
  }
  const lcov = parseLcov(cov.result);
  console.log('Coverage', lcov);
}

async function handleRequest(result: string) {

}


const splitter = Deno.args.findIndex((arg) => arg === '--');
const args = splitter === -1 ? Deno.args : Deno.args.slice(0, splitter);
const rest = splitter === -1 ? [] : Deno.args.slice(splitter + 1);

if (import.meta.main) {
  await main(args, rest);
}

Deno.test('run', async () => {
  const result = `
\`\`\`yaml
tests:
  - test_behavior: "test1"
    test_name: "test1"
    test_code: |
      Deno.test('test1', () => {
        console.log('test1');
      }
\`\`\`
`
    ;
  await handleRequest('result');
});