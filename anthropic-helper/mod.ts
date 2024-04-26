import type AnthropicAI from "npm:@anthropic-ai/sdk@0.20.7";

export type JSONSchema = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  properties?: {
    [key: string]: JSONSchema;
  };
  items?: JSONSchema;
  required?: readonly string[];
};

type ToType<T> = T extends { type: 'string' }
  ? string
  : T extends { type: 'number' }
  ? number
  : T extends { type: 'boolean' }
  ? boolean
  : T extends { type: 'array'; items: infer U }
  ? ToType<U>[]
  : T extends { type: 'object'; properties: infer P; required: infer R extends readonly string[] }
  ? { [K in keyof P]-?: K extends R[number] ? ToType<P[K]> : ToType<P[K]> | undefined }
  : never;

export type SchemaToType<T extends JSONSchema> = ToType<T>;

if (import.meta.main) {
  const personSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
      hobbies: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['name', 'age']
  } as const;
  type Person = SchemaToType<typeof personSchema>;
  const _person: Person = {
    name: 'Alice',
    age: 30,
    hobbies: ['reading', 'swimming']
  };
}

type ToolName<T> = T extends { name: infer N } ? N : never;

type ToolSchema<T> = T extends { input_schema: infer S } ? S : never;

type ToolInput<S extends JSONSchema> = SchemaToType<S>;

type ToolHandler<S extends JSONSchema> = (
  input: ToolInput<S>,
  content: AnthropicAI.Beta.Tools.Messages.ToolUseBlock
) => Promise<AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam>;

export function createToolsHandler<T extends { name: string; input_schema: JSONSchema }>(
  _tools: readonly T[],
  handlers: { [K in ToolName<T>]: ToolHandler<ToolSchema<Extract<T, { name: K }>>> }
): (content: AnthropicAI.Beta.Tools.Messages.ToolUseBlock) => Promise<AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam> {
  return async (content) => {
    if (content.name in handlers) {
      const handler = handlers[content.name as ToolName<T>];
      const input = content.input as ToolInput<ToolSchema<Extract<T, { name: typeof content.name }>>>;
      return await handler(input as any, content);
    }
    throw new Error(`Unknown tool: ${content.name}`);
  };
}

type MessageHandler = {
  current: () => AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam[],
  isEnd: () => boolean,
  handleResponse: (res: AnthropicAI.Beta.Tools.Messages.ToolsBetaMessage) => Promise<AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam[]>
}

export function createMessageHandler(options: {
  tools: AnthropicAI.Beta.Tools.Messages.Tool[],
  handleTool: (content: AnthropicAI.Beta.Tools.Messages.ToolUseBlock) => Promise<AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam>,
  handleUser?: (content: AnthropicAI.Beta.Tools.ToolsBetaMessageParam) => (void | Promise<void>),
  handleAssistant?: (content: AnthropicAI.Beta.Tools.Messages.ToolsBetaContentBlock) => (void | Promise<void>),
  messages: AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam[]
}): MessageHandler {
  const handleUser = options.handleUser ?? defaultHandleUser;
  const handleAssistant = options.handleAssistant ?? defaultHandleAssistant;

  const messages = options.messages;
  for (const message of messages) {
    handleUser(message);
  }
  let stop_reason: "max_tokens" | "tool_use" | "end_turn" | "stop_sequence" | null = null;

  return {
    current: () => messages.slice(),
    isEnd: () => {
      // TODO: Implement the logic to determine if the conversation has ended
      if (stop_reason === 'max_tokens') return true;
      if (stop_reason === 'stop_sequence') return true;
      if (stop_reason === 'tool_use') return false;
      if (stop_reason === "end_turn") return true;
      return false;
    },
    async handleResponse(res: AnthropicAI.Beta.Tools.Messages.ToolsBetaMessage) {
      messages.push({ role: 'assistant', content: res.content });
      const toolResults: AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam[] = [];
      for (const content of res.content) {
        handleAssistant(content);
        if (content.type === "tool_use") {
          const result = await options.handleTool(content);
          toolResults.push(result);
        }
      }
      stop_reason = res.stop_reason;
      if (toolResults.length > 0) {
        const result: AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam = { role: 'user', content: toolResults };
        messages.push(result);
        handleUser(result);
      }
      return messages;
    },
  }
}


export function defaultHandleAssistant(content: AnthropicAI.Beta.Tools.Messages.ToolsBetaContentBlock): void {
  if (content.type === 'tool_use') {
    console.log('%c[tool_use]', 'color: blue;', content.name, content.input);
  } else if (content.type === 'text') {
    console.log(content.text);
  } else if (typeof content === 'string') {
    console.log(content);
  } else {
    console.log(JSON.stringify(content, null, 2));
  }
};

export function defaultHandleUser(content: AnthropicAI.Beta.Tools.ToolsBetaMessageParam): void {
  if (Array.isArray(content.content)) {
    for (const c of content.content) {
      if (c.type === 'tool_result') {
        console.log(`%c[tool_result] ${truncateString(JSON.stringify(c.content, null), 30)}`, 'color: gray;');
      } else if (c.type === 'text') {
        console.log(`%c${truncateString(c.text, 30)}`, 'color: gray;');
      } else {
        console.log(`%c[${c.type}] ...`, 'color: gray;');
      }
    }
  } else {
    console.log(`%c${content.content}`, 'color: gray;');
  }
};

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  } else {
    return str.slice(0, maxLength) + "...";
  }
}

