import AnthropicAI from "npm:@anthropic-ai/sdk@0.22.0";
// import { createMessageHandler, createToolsHandler } from 'jsr:@mizchi/anthropic-helper@0.0.3';
import { createToolHandler, createToolRunner } from '../mod.ts';

import { extractMainContent, searchGoogle } from "./tools.ts";
// import { createChatRunner } from "../mod.ts";

const system = `
あなたは優秀なアシスタントです。あなたはユーザーからの質問に可能な限り正確に答えることができます。

もしあなたが知らない場合は、Google で検索して情報を取得することができます。
URL について聞かれた場合は、その URL を開いて本文を取得して答えてください。
いずれもその先の URL に詳細な情報がある場合は、その URL を開いて詳細な情報を取得してください。
`;


const TOOLS = [
  {
    name: "read_file",
    description: "Read file contents",
    input_schema: {
      type: "object",
      properties: {
        filepath: {
          type: "string",
          description: "file path to read"
        }
      },
      required: ["filepath"]
    }
  },
  {
    name: "glob",
    description: "List files in the directory",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "glob pattern"
        }
      },
      required: ["pattern"]
    }
  },

  {
    name: "ask_to_user",
    description: "Ask to user and get response. If you feel given message is not enough, you can use this tool.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "question to ask"
        }
      },
      required: ["question"]
    }
  },
  {
    name: "open_url",
    description: "open url and extract main content",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "url to open"
        }
      },
      required: ["url"]
    }
  },
  {
    name: "search_google",
    description: "search google. If you want to search word, you can use this tool.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "search query"
        }
      },
      required: ["query"]
    }
  },

] as const;

const handleTool = createToolHandler(TOOLS, {
  async glob(input, content) {
    return input.pattern;
  },
  async ask_to_user(input, content) {
    const res = prompt(input.question);
    // return 'no answer';
    return {
      tool_use_id: content.id,
      type: 'tool_result',
      content: [
        { type: 'text', text: res ?? "no answer" }
      ],
      is_error: false
    };
  },
  async read_file(input): Promise<string> {
    const content = Deno.readTextFileSync(input.filepath);
    return content;
  },
  async search_google(input, content) {
    try {
      const result = await searchGoogle(input.query);
      return JSON.stringify(result, null, 2);
    } catch (err) {
      throw new Error('failed to search');
    }
  },
  async open_url(input, content) {
    try {
      const res = await fetch(input.url).then((res) => res.text());
      const main = extractMainContent(res) || res;
      return main;
    } catch (err) {
      throw new Error('failed to fetch');
    }
  },
});

const client = new AnthropicAI({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

const runner = createToolRunner(client, {
  model: "claude-3-opus-20240229",
  tools: TOOLS as any,
  messages: [
    {
      role: 'user',
      content: "What's the weather and degree in San Francisco? Say greeting messsage by weather and degree."
    }
  ],
  max_tokens: 1248,
}, { handleTool });

await runner.run();

// const handler = createChatRunner(
//   client,
//   {
//     tools: TOOLS as any as AnthropicAI.Beta.Tools.Messages.Tool[],
//     handleTool,
//     messages: [
//       {
//         role: 'user',
//         content: Deno.args.join(" ")
//       }
//     ]
//   }, undefined, {
//     handleTool,
//   });

// while (!handler.isEnd()) {
//   const res = await runAnthropicAITools({
//     tools: TOOLS as any,
//     messages: handler.current()
//   });
//   await handler.handleResponse(res);
// }