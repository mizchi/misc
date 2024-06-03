import { join, dirname } from "jsr:@std/path@0.223.0";
import { ToolRunner } from "./types.ts";
import { exists } from "jsr:@std/fs@0.223.0/exists";
import { getToolTypes } from "./utils.ts";
import { parseArgs } from "node:util";

export function parseCliArgs(args: string[]) {
  const parsed = parseArgs({
    args: args,
    allowPositionals: true,
    options: {
      new: {
        type: 'boolean',
        short: 'n',
        description: 'Flag to start a new session',
      },
      summary: {
        type: 'boolean',
        short: 's',
        description: 'Flag to summarize the history',
      },
      dir: {
        type: 'string',
        short: 'd',
        description: 'Path to the directory',
      },
      oneshot: {
        type: 'boolean',
        short: 'o',
        description: 'Flag to run a single command',
      },
      history: {
        type: 'string',
        short: 'h',
        description: 'Path to the history file',
      },
      tool_choice: {
        type: 'string',
        short: 'c',
        description: 'Path to the tool',
      }
    }
  });
  return parsed;
}

export type ParsedArgs = ReturnType<typeof parseCliArgs>;

export async function resolveRoot(name: string) {
  const TOOLS_ROOT = Deno.env.get('TOOLS_ROOT') ?? join(Deno.env.get("HOME")!, 'tools');
  return join(TOOLS_ROOT, name);
}

type Context = {
  sessionId: string;
}

async function loadContext(root: string): Promise<Context> {
  const configPath = join(root, 'context.json');
  try {
    const config = await Deno.readTextFile(configPath);
    return JSON.parse(config);
  } catch (e) {
    return {
      sessionId: '0'
    };
  }
}

async function saveConfig(root: string, config: Context): Promise<void> {
  const configPath = join(root, 'context.json');
  try {
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error(`Failed to save config to ${configPath}: ${e}`);
  }
}

export function normalizePath(path: string) {
  return path.startsWith("/") ? path : join(Deno.cwd(), path);
}

export function readablePath(path: string) {
  const cwd = Deno.cwd();
  return path.replace(cwd + '/', "");
}

// first, load <root>/config.json.
// if config.sessionId is not set, create a new session
// and save the session id to config.json
// if session is out of date (1 day), create a new session
export async function loadOrNewContext(root: string, isNew: boolean): Promise<Context> {
  const now = Date.now();
  const config = await loadContext(root);
  if (config.sessionId && !isNew) {
    const delta = now - parseInt(config.sessionId);
    if (delta > 1000 * 60 * 60 * 24) {
      const nextSessionId = now.toString();
      console.log('Session expired, starting a new one', nextSessionId);
      const nextConfig: Context = { sessionId: nextSessionId };
      await saveConfig(root, nextConfig);
      return nextConfig;
    }
    return config;
  } else {
    const sessionId = Date.now().toString();
    const newConfig: Context = { sessionId };
    await saveConfig(root, newConfig);
    return newConfig;
  }
}

export async function getHistoryPath(root: string, sessionId: string) {
  return join(root, 'sessions', `${sessionId}.json`);
}

export async function saveHistory(historyPath: string, messages: any[]) {
  const dir = dirname(historyPath);
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(historyPath, JSON.stringify(messages, null, 2));
}

export async function loadHistory(historyPath: string) {
  try {
    const history = await Deno.readTextFile(historyPath);
    return JSON.parse(history);
  } catch (e) {
    return [];
  }
}

export async function loadTools(root: string, runner: ToolRunner) {
  const filepath = join(root, 'tools.ts');
  try {
    if (await exists(filepath) === false) {
      return;
    }
    const content = await Deno.readTextFile(filepath);
    const toolTypes = getToolTypes(content);
    const impls = await import(filepath);
    for (const tool of toolTypes) {
      const impl = impls[tool.name];
      runner.registerTool({
        schema: tool as any,
        handler: impl
      });
    }
  } catch (e) {
    console.error(`Failed to load tools from ${filepath}: ${e}`);
  }
}

export async function getSystem(root: string): Promise<string | undefined> {
  try {
    const systemPath = join(root, 'system.md');
    const system = await Deno.readTextFile(systemPath);
    return system;
  } catch (e) {
    return undefined;
  }
}