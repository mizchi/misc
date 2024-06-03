# @mizchi/anthropic-helper

AnthropicAI Tools Helpers for typescript (deno).

https://docs.anthropic.com/claude/docs/tool-use

## How to use

```ts
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
```

Result

```bash
What's the weather in San Francisco?
<thinking>
The user is asking for the current weather in San Francisco. The relevant tool is get_weather, which requires a location parameter.

Required parameters:
location - The user provided this in the query: "San Francisco"

All required parameters for get_weather are available, so we can proceed with making the API call to get the current weather for San Francisco.
</thinking>
[tool_use] get_weather { location: "San Francisco, CA" }
[tool_result] The weather is sunny at San Francisco, CA.


Based on the weather information retrieved, the current weather in San Francisco is sunny.
What's the degree in San Francisco?
[tool_choice] get_degree

[tool_use] get_degree { location: "San Francisco, CA" }
[tool_result] The degree is 15 at San Francisco, CA.
Say greeting by weather and degree.
<thinking>
To generate a greeting based on the current weather and temperature in San Francisco, we will need the following information:

1. Current weather conditions in San Francisco 
2. Current temperature in degrees in San Francisco

I already have this information from the previous queries:
- The current weather in San Francisco is sunny
- The current temperature in San Francisco is 15 degrees

With both the weather and degree information available, I have all the required information to generate a weather and temperature based greeting for San Francisco. No additional tool calls are needed.
</thinking>

Good morning! It's a beautiful sunny day in San Francisco with a pleasant temperature of 15 degrees. Perfect weather to get out and enjoy the city! I hope you have a wonderful day.
```

## CLI with tools/*

```bash
$ deno install -Afg jsr:@mizchi/anthropic-helper@0.1.1/cli --name tools
# Set tools root. This cli uses `<TOOLS_ROOT>/<name>/tools.ts`
$ export TOOLS_ROOT=$(pwd)/tools
$ tools create rag
$ tree tools
./tools/
└── rag
    ├── system.md # edit as system prompt
    └── tools.ts  # impl tools
$ tools rag "When is release date for Slay the Spire 2?"
```

See [./tools](./tools)

You can define tools by plane typescript functions.

```ts
// You can only use simple type literal node for input.
// Like string, number, boolean, { key: T },  Array<T>
// Comments are used as descriptions.

// Get the current weather in a given location
export async function get_degree(
  input: {
    // The city and state, e.g. San Francisco, CA
    location: string

    // DO NOT USE TYPE REFERENCE
    // foo: FooType
  }) {
  return `The degree is 15 at ${input.location}.`;
}

/* Expand like this...

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

const mod = await import(toolsPath);
runner.registerTool({
  schema: get_degree_schema,
  handler: mod[get_degree_schema.name]
});
*/
```

## License

Copyright 2024 @mizchi<miz404@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.