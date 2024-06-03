import { Readability } from "npm:@mozilla/readability@0.5.0";
import { JSDOM } from "npm:jsdom@16.4.0";
import { google } from "npm:googleapis@61.0.0";
import { expandGlob } from "jsr:@std/fs@0.221.0/expand-glob";
import $ from "jsr:@david/dax@0.41.0";

function extractMainContent(html: string) {
  const doc = new JSDOM(html).window.document;
  const reader = new Readability(doc);
  const article = reader.parse();
  return article?.content;
}

async function searchGoogle(query: string) {
  const res = await google.customsearch('v1').cse.list({
    key: Deno.env.get('GOOGLE_API_KEY')!,
    cx: Deno.env.get('GOOGLE_CSE_ID')!,
    q: query
  });
  const items = res.data.items?.slice(0, 5).map((item) => {
    return {
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      kind: item.kind,
      labels: item.labels
    }
  });
  return JSON.stringify(items, null, 2);
}

// Ask the user a question
export async function ask_to_user(input: {
  // The question to ask
  question: string
}) {
  return prompt(input.question);
}

// Ask the user a question with options
export async function ask_to_user_by_select_options(input: {
  // The question to ask
  message: string,
  // The options to select
  items: Array<string>
}) {
  const id = await $.select({
    message: input.message,
    options: input.items
  });
  return input.items[id] ?? 'No item selected';
}

// Seach google for the query
export async function search_google(input: {
  // The query to search for
  query: string
}) {
  const result = await searchGoogle(input.query);
  return JSON.stringify(result, null, 2)
}

// Open the URL and extract the main content
export async function open_url(input: {
  // The URL to open
  url: string
}) {
  const res = await fetch(input.url).then((res) => res.text());
  const main = extractMainContent(res) || res;
  return main;
}

// Read the file from root
export async function read_file(input: {
  // The path to the file
  filepath: string
}) {
  const content = await Deno.readTextFile(input.filepath);
  return content;
}

// Write the file from root
export async function write_file(input: {
  // The path to the file
  filepath: string,
  // The content to write
  content: string
}) {
  if (!confirm(`Allow write file? ${input.filepath}`)) {
    await Deno.writeTextFile(input.filepath, input.content);
  }
}

// Get current root directory
export async function get_root(_input: {}) {
  return Deno.cwd();
}

// Glob patterns from current directory
export async function glob(input: {
  // The path to the file
  pattern: string,
  // glob root directory
  root?: string
}) {
  const result: Array<{ path: string }> = [];
  for await (const file of expandGlob(input.pattern)) {
    console.log(file);
    result.push({ path: file.path });
  }
  return JSON.stringify(result, null, 2);
}

// Exectute shell command with user check
export async function exec_command(input: {
  // command to run
  command: string,
}) {
  if (confirm(`Allow execute command? ${input.command}`)) {
    const [cmd, ...args] = input.command.split(' ');
    const p = await $`${cmd} ${args}`.noThrow();
    if (p.code === 0) {
      return p.stdout;
    } else {
      throw new Error(p.stderr)
    }
  }
}

