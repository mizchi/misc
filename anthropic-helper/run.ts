import AnthropicAI from "npm:@anthropic-ai/sdk@0.20.7";
import { createMessageHandler, createToolsHandler } from './mod.ts';

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
    ...options,
  });
  return res;
}

const TOOLS = [
  {
    name: "get_weather",
    description: "Get the current weather in a given location",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The city and state, e.g. San Francisco, CA"
        }
      },
      required: ["location"]
    }
  },
  {
    name: "get_degree",
    description: "Get the current degree in a given location",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The city and state, e.g. San Francisco, CA"
        }
      },
      required: ["location"]
    }
  }
] as const;

const handleTool = createToolsHandler(TOOLS, {
  async get_weather(input, content) {
    const is_error = false;
    return {
      tool_use_id: content.id,
      type: 'tool_result',
      content: [
        { type: 'text', text: 'rainy day' }
      ],
      is_error
    };
  },
  async get_degree(input, content) {
    const is_error = false;
    return {
      tool_use_id: content.id,
      type: 'tool_result',
      content: [
        { type: 'text', text: '15 degree' }
      ],
      is_error
    };
  }
});

const handler = createMessageHandler({
  tools: TOOLS as any as AnthropicAI.Beta.Tools.Messages.Tool[],
  handleTool,
  messages: [
    {
      role: 'user',
      content: "What's the weather and degree in San Francisco? Say greeting messsage by weather and degree."
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