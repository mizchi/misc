import AnthropicAI from "npm:@anthropic-ai/sdk@0.22.0";
import { createToolRunner, createToolHandler } from './mod.ts';

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

const handleTool = createToolHandler(TOOLS, {
  async get_weather(input, content) {
    return 'The weather is sunny.'
  },
  async get_degree(input, content) {
    return 'The degree is 15.';
  }
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

runner.addMessage({ role: 'user', content: "I feel good" });
await runner.run();