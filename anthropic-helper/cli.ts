#!/usr/bin/env deno run -A
import AnthropicAI from "npm:@anthropic-ai/sdk@0.22.0";
import { join } from 'jsr:@std/path@0.223.0';
import { exists } from "jsr:@std/fs@0.223.0";
import { load } from "jsr:@std/dotenv@0.223.0";

import { buildRunner } from "./mod.ts";
import {
  getHistoryPath,
  getSystem,
  loadOrNewContext,
  loadHistory,
  loadTools,
  parseCliArgs,
  resolveRoot,
  saveHistory,
  normalizePath,
  getMessageFromVSCode
} from "./cli_utils.ts";

const TOOLS_ROOT = Deno.env.get('TOOLS_ROOT') ?? join(Deno.env.get("HOME")!, 'tools');
const toolExample = `
// Get the current weather in a given location
export async function get_degree(input: {
  // The city and state, e.g. San Francisco, CA
  location: string
}) {
  return \`The degree is 15 at \${input.location}.\`;
}
`.trim();

const parsed = parseCliArgs(Deno.args);

const client = new AnthropicAI({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
const first = parsed.positionals[0];

if (first === 'create') {
  const name = parsed.positionals[1];
  const toolRoot = join(TOOLS_ROOT, name);
  await Deno.mkdir(toolRoot, { recursive: true });
  await Deno.writeTextFile(join(toolRoot, 'tools.ts'), toolExample);
  await Deno.writeTextFile(join(toolRoot, 'system.md'), '');
  await Deno.writeTextFile(join(toolRoot, 'context.json'), JSON.stringify({ sessionId: '0' }));
  Deno.exit(0);
}

const root = parsed.values.dir
  ? normalizePath(parsed.values.dir)
  : await resolveRoot(first);
if (!await exists(root)) {
  console.error(`No directory found in ${root}.`);
  Deno.exit(1);
}

await load({ envPath: join(root, '.env'), export: true });

const context = await loadOrNewContext(root, !!parsed.values.new);
console.log(`%c[session]: ${context.sessionId}`, 'color: gray');
const historyPath = parsed.values.history
  ? normalizePath(parsed.values.history)
  : await getHistoryPath(root, context.sessionId);

const second = parsed.positionals[1];
if (second === 'clear') {
  await Deno.writeTextFile(historyPath, '[]');
  Deno.exit(0);
}

const runner = buildRunner(client, {
  system: await getSystem(root),
  messages: parsed.values.oneshot ? [] : await loadHistory(historyPath),
  stream: true
});

await loadTools(root, runner);

if (parsed.values.summary) {
  if (parsed.positionals.length >= 1) {
    await runner.ask(parsed.positionals.slice(1).join(" "), parsed.values.tool_choice);
  }
  await runner.ask('今までの会話を要約してください。以降の会話は要約されたものだけで続行します。');
  await saveHistory(historyPath, runner.getMessages().slice(-2));
  Deno.exit(0);
}

const message = parsed.values.edit
  ? await getMessageFromVSCode(root)
  : parsed.positionals.length > 1
    ? parsed.positionals.slice(1).join(" ")
    : await getMessageFromVSCode(root);

if (!message) {
  throw new Error('No message provided.');
}
await runner.ask(message, parsed.values.tool_choice);
if (!parsed.values.oneshot) {
  const current = runner.getMessages();
  await saveHistory(historyPath, current);
}