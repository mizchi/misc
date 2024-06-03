import { createWriter } from './utils.ts';
import AnthropicAI from "npm:@anthropic-ai/sdk@0.22.0";
import { ToolHandler, ToolRunner } from "./types.ts";

type InputOptions = Omit<
  AnthropicAI.Messages.MessageCreateParamsNonStreaming | AnthropicAI.Messages.MessageCreateParamsStreaming,
  'model' | 'messages' | 'max_tokens'
> & {
  model?: string,
  messages?: AnthropicAI.Messages.MessageParam[],
  max_tokens?: number,
};

const defaultOptions: Omit<AnthropicAI.Messages.MessageCreateParamsNonStreaming, 'messages'> = {
  model: "claude-3-opus-20240229",
  max_tokens: 1248,
};

export function buildRunner(
  client: AnthropicAI,
  options: InputOptions,
  handlers: {
    handleUser?: (content: AnthropicAI.MessageParam) => (void | Promise<void>),
    handleAssistant?: (content: AnthropicAI.Messages.ContentBlock, stream: boolean) => (void | Promise<void>),
  } = {},
): ToolRunner {
  const handleUser = handlers.handleUser ?? defaultHandleUser;
  const handleAssistant = handlers.handleAssistant ?? defaultHandleAssistant;

  let messages = [...(options.messages ?? [])];
  // for (const message of messages) {
  //   handleUser(message);
  // }
  let stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null = null;
  let stream: ReturnType<typeof client.messages.stream> | undefined = undefined;

  const toolHandlers: { [key: string]: ToolHandler<any> } = {};
  function handleTool(content: AnthropicAI.Messages.ToolUseBlock) {
    if (content.name in toolHandlers) {
      const handler = toolHandlers[content.name];
      const input = content.input;
      return handler(input as any);
    }
    throw new Error(`Unknown tool: ${content.name}`);
  }
  const tools = options.tools ?? [];

  let current_choice: AnthropicAI.Messages.MessageCreateParamsNonStreaming['tool_choice'] | null = null;
  return {
    getMessages: () => messages.slice(),
    getFinalMessage: () => messages.filter((m) => m.role === 'assistant').at(-1)!,
    registerTool: (def) => {
      toolHandlers[def.schema.name] = def.handler;
      tools.push(def.schema);
      return def.schema.name;
    },
    async ask(newMessage, choice?: string) {
      current_choice = choice ? { type: 'tool', name: choice } : null;
      stop_reason = null;
      const mes: AnthropicAI.Messages.MessageParam = typeof newMessage === 'string'
        ? { role: 'user', content: newMessage }
        : newMessage;

      const lastMessage = messages.at(-1);
      if (lastMessage?.role === 'user') {
        if (typeof lastMessage.content === 'string') {
          lastMessage.content = [
            lastMessage.content as unknown as AnthropicAI.Messages.TextBlockParam,
            {
              type: 'text',
              text: mes.content as unknown as string
            }
          ];
        } else if (Array.isArray(lastMessage.content)) {
          lastMessage.content.push({
            type: 'text',
            text: mes.content as unknown as string
          })
        }
      } else {
        messages.push(mes);
      }
      handleUser(mes);
      await this.run();
      current_choice = null;
    },
    async run() {
      while (!this.isEndTurn()) {
        await this.step();
        await this.handleResponse();
        if (current_choice && stop_reason === 'tool_use') {
          break;
        }
      }
    },
    async step() {
      stop_reason = null;

      if (current_choice?.type === 'tool') {
        console.log(`%c[tool_choice] ${current_choice.name}`, 'color: gray;');
      }
      if (options.stream) {
        const write = createWriter();
        let progress = '';
        stream = client.messages.stream({
          ...defaultOptions,
          ...options,
          stream: true,
          tool_choice: current_choice ?? undefined,
          tools,
          messages,
        });
        stream.on('text', (text) => {
          progress += text;
          write(text);
        });
        const res = await stream.finalMessage();
        write('\n');
        stop_reason = res.stop_reason;
        progress = '';
        stream = undefined;
        messages = mergeMessages(messages, res);
      } else {
        const res = await client.messages.create({
          ...defaultOptions,
          ...options,
          stream: false,
          tools,
          messages: this.getMessages()
        }) as AnthropicAI.Messages.Message;
        stop_reason = res.stop_reason as any;
        messages = mergeMessages(messages, res);
      }
    },
    isEndTurn: () => {
      if (stop_reason === "end_turn") return true;
      return false;
    },
    async handleResponse() {
      const res = messages.at(-1) as AnthropicAI.Messages.Message;
      const toolResults: AnthropicAI.Messages.ToolResultBlockParam[] = [];
      for (const content of res.content) {
        const isStreaming = !!options.stream;
        handleAssistant(content, isStreaming);
        if (content.type === "tool_use") {
          try {
            const result = await handleTool(content);
            toolResults.push({
              tool_use_id: content.id,
              type: 'tool_result',
              content: [
                { type: 'text', text: result }
              ],
              is_error: false
            });
          } catch (e) {
            if (e instanceof Error) {
              const toolError: AnthropicAI.Messages.ToolResultBlockParam = {
                tool_use_id: content.id,
                type: 'tool_result',
                content: [
                  { type: 'text', text: e.message }
                ],
                is_error: true
              };
              toolResults.push(toolError);
            } else {
              throw e;
            }
          }
        }
      }
      if (toolResults.length > 0) {
        const result: AnthropicAI.Messages.MessageParam = { role: 'user', content: toolResults };
        messages.push(result);
        handleUser(result);
      }
      return messages;
    },
  }
}

export function defaultHandleAssistant(content: AnthropicAI.Messages.ContentBlock, stream: boolean): void {
  if (content.type === 'tool_use') {
    console.log('%c[tool_use]', 'color: gray;', content.name, content.input);
    return;
  }
  if (!stream) {
    if (content.type === 'text') {
      console.log(content.text);
      return;
    } else if (typeof content === 'string') {
      console.log(content);
      return;
    }
  }
};

export function defaultHandleUser(content: AnthropicAI.MessageParam): void {
  if (Array.isArray(content.content)) {
    for (const c of content.content) {
      if (c.type === 'tool_result') {
        const text = c.content?.[0].type === 'text' ? c.content[0].text : JSON.stringify(c.content, null);
        console.log(`%c[tool_result] ${truncateString(text, 100)}`, 'color: gray;');
      } else if (c.type === 'text') {
        console.log(`%c${truncateString(c.text, 100)}`, 'color: gray;');
      } else {
        console.log(`%c[${c.type}] ...`, 'color: gray;');
      }
    }
  } else {
    console.log(`%c${content.content}`, 'color: gray;');
  }
};
function mergeMessages(
  messages: AnthropicAI.Messages.MessageParam[],
  next: AnthropicAI.MessageParam
): AnthropicAI.Messages.MessageParam[] {
  const last = messages.at(-1);
  if (
    last?.role === 'assistant' && next.role === 'assistant'
    && (
      typeof next.content === 'string'
      || (typeof next.content !== 'string' && next.content[0].type === 'text')
    )
  ) {
    const firstText = typeof last.content[0] === 'string'
      ? last.content[0]
      : last.content[0].type === 'text' ? last.content[0].text : '';
    const secondText = typeof next.content[0] === 'string'
      ? next.content[0]
      : next.content[0].type === 'text' ? next.content[0].text : '';
    return [...messages.slice(0, -1), {
      role: 'assistant',
      content: [
        { type: 'text', text: firstText + secondText } as AnthropicAI.Messages.ContentBlock,
        ...next.content.slice(1)
      ] as AnthropicAI.Messages.ContentBlock[]
    }];
  }
  return [
    ...messages,
    {
      role: 'assistant',
      content: next.content
    }
  ];
}

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  } else {
    const restStrSize = Array.from(str.slice(maxLength)).length;
    return str.slice(0, maxLength) + `...(${restStrSize})`;
  }
}

if (import.meta.main) {
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
      return 'The weather is sunny.';
    }
  });
  runner.registerTool({
    schema: get_degree_schema,
    async handler(input) {
      return 'The degree is 15.';
    }
  });
  await runner.ask("サンフランシスコの天気は?", 'get_weather');
  await runner.ask("サンフランシスコの気温は?", 'get_degree');
  await runner.ask("今の天気に合わせた挨拶をして");
}