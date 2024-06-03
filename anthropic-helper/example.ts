import AnthropicAI from "npm:@anthropic-ai/sdk@0.22.0";
import { buildRunner } from "./mod.ts";

const get_weather_schema = {
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
} as const satisfies AnthropicAI.Tool;

const get_degree_schema = {
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
} as const satisfies AnthropicAI.Tool;

const client = new AnthropicAI({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
const runner = buildRunner(client, { stream: true });
runner.registerTool({
  schema: get_weather_schema,
  async handler(input) {
    return `The weather is sunny at ${input.location}.`;
  }
});
runner.registerTool({
  schema: get_degree_schema,
  async handler(input) {
    return `The degree is 15 at ${input.location}.`;
  }
});

await runner.ask("What's the weather in San Francisco?");
// explict tool_choice
await runner.ask("What's the degree in San Francisco?", 'get_degree');
await runner.ask("Say greeting by weather and degree.");