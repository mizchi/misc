import AnthropicAI from "npm:@anthropic-ai/sdk@0.20.7";
import { createMessageHandler, createToolsHandler } from 'jsr:@mizchi/anthropic-helper@0.0.3';
import { extractMainContent, searchGoogle } from "./tools.ts";

const system = `
あなたは優秀なアシスタントです。あなたはユーザーからの質問に可能な限り正確に答えることができます。

もしあなたが知らない場合は、Google で検索して情報を取得することができます。
URL について聞かれた場合は、その URL を開いて本文を取得して答えてください。
いずれもその先の URL に詳細な情報がある場合は、その URL を開いて詳細な情報を取得してください。
`;


async function runAnthropicAITools(
  options:
    | Partial<AnthropicAI.Beta.Tools.Messages.MessageCreateParamsNonStreaming>
    & Pick<AnthropicAI.Beta.Tools.Messages.MessageCreateParamsNonStreaming, "messages" | "tools">
): Promise<AnthropicAI.Beta.Tools.Messages.ToolsBetaMessage> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
  const client = new AnthropicAI({ apiKey });
  const res = await client.beta.tools.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    system,
    ...options,
  });
  return res;
}

const TOOLS = [
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

const handleTool = createToolsHandler(TOOLS, {
  async ask_to_user(input, content) {
    const res = prompt(input.question);
    return {
      tool_use_id: content.id,
      type: 'tool_result',
      content: [
        { type: 'text', text: res ?? "no answer" }
      ],
      is_error: false
    };
  },
  async search_google(input, content) {
    try {
      const result = await searchGoogle(input.query);
      return {
        tool_use_id: content.id,
        type: 'tool_result',
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ],
        is_error: false
      };
    } catch (err) {
      return {
        tool_use_id: content.id,
        type: 'tool_result',
        content: [
          { type: 'text', text: 'failed to search' }
        ],
        is_error: true
      };
    }
  },
  async open_url(input, content) {
    try {
      const res = await fetch(input.url).then((res) => res.text());
      const main = extractMainContent(res) || res;
      return {
        tool_use_id: content.id,
        type: 'tool_result',
        content: [
          { type: 'text', text: main }
        ],
        is_error: false
      };
    } catch (err) {
      return {
        tool_use_id: content.id,
        type: 'tool_result',
        content: [
          { type: 'text', text: 'failed to fetch' }
        ],
        is_error: true
      };
    }
  },
});

const handler = createMessageHandler({
  tools: TOOLS as any as AnthropicAI.Beta.Tools.Messages.Tool[],
  handleTool,
  messages: [
    {
      role: 'user',
      content: Deno.args.join(" ")
    }
  ]
});

while (!handler.isEnd()) {
  const res = await runAnthropicAITools({
    tools: TOOLS as any,
    messages: handler.current()
  });
  await handler.handleResponse(res);
}