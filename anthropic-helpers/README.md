# @mizchi/anthropic-helpers

AnthropicAI Tools Helpers for typescript (deno).

https://docs.anthropic.com/claude/docs/tool-use

```ts
import AnthropicAI from "npm:@anthropic-ai/sdk@0.20.7";
import { createMessageHandler, createToolsHandler } from 'jsr:@mizchi/anthropic-helpers@0.0.1';

// define tools
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

// implement tools by TOOLS definition
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
  handleTool: (content) => {
    console.log(`[Tool]`, content);
    return handleTool(content);
  },
  handleText: (content) => {
    console.log(`[Assistant] ${content.text}`);
  },
  messages: [
    {
      role: 'user',
      content: "What's the weather and degree in San Francisco? Say greeting messsage by weather and degree."
    }
  ]
});

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

// run until end
while (!handler.isEnd()) {
  const res = await runAnthropicAITools({
    tools: TOOLS as any,
    messages: handler.current()
  });
  await handler.handleResponse(res);
}
```

Result

```bash
$ deno run -A scratch.ts
[Assistant] <thinking>
The user is asking for the weather and temperature in San Francisco. To answer this, I will need to use the get_weather and get_degree functions.

For get_weather, the required location parameter is directly provided by the user - they specified "San Francisco".

For get_degree, the required location parameter is also directly provided as "San Francisco".

Since I have the needed location parameter, I can proceed to call both functions to get the weather and temperature information needed to answer the user's request.
</thinking>
[Tool] {
  type: "tool_use",
  id: "toolu_01F5hc6LvyWpwWw4dioJYGCp",
  name: "get_weather",
  input: { location: "San Francisco, CA" }
}
[Tool] {
  type: "tool_use",
  id: "toolu_01ECVxB7igwMtgEQD9Egng7M",
  name: "get_degree",
  input: { location: "San Francisco, CA" }
}
[Assistant] Based on the weather and temperature information:

Good morning, San Francisco! It's a rainy day with a temperature of 15 degrees. Don't forget your umbrella if you're heading out. Have a great day despite the gloomy weather!
```

## LICENSE

MIT