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
) => Promise<AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam | string>;

export function createToolHandler<T extends { name: string; input_schema: JSONSchema }>(
  _tools: readonly T[],
  handlers: { [K in ToolName<T>]: ToolHandler<ToolSchema<Extract<T, { name: K }>>> }
): (content: AnthropicAI.Beta.Tools.Messages.ToolUseBlock) => Promise<AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam | string> {
  return async (content) => {
    if (content.name in handlers) {
      const handler = handlers[content.name as ToolName<T>];
      const input = content.input as ToolInput<ToolSchema<Extract<T, { name: typeof content.name }>>>;
      return await handler(input as any, content);
    }
    throw new Error(`Unknown tool: ${content.name}`);
  };
}

type ToolRunner = {
  current: () => AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam[],
  addMessage(newMessage: AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam): void,
  isEndTurn: () => boolean,
  run(): Promise<void>,
  step(): Promise<void>,
  handleResponse: () => Promise<AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam[]>
}

function mergeMessages(
  messages: AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam[],
  next: AnthropicAI.Beta.Tools.ToolsBetaMessageParam
): AnthropicAI.Beta.Tools.Messages.ToolsBetaMessageParam[] {
  const last = messages.at(-1);
  if (
    last?.role === 'assistant'
    && next.role === 'assistant'
    && (
      typeof next.content === 'string'
      || (typeof next.content !== 'string' && next.content[0].type === 'text')
    )
  ) {
    const firstText = typeof last.content[0] === 'string' ? last.content[0] : last.content[0].type === 'text' ? last.content[0].text : '';
    const secondText = typeof next.content[0] === 'string' ? next.content[0] : next.content[0].type === 'text' ? next.content[0].text : '';
    return [...messages.slice(0, -1), {
      role: 'assistant',
      content: [
        { type: 'text', text: firstText + secondText } as AnthropicAI.Beta.Tools.Messages.ToolsBetaContentBlock,
        ...next.content.slice(1)
      ] as AnthropicAI.Beta.Tools.Messages.ToolsBetaContentBlock[]
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

// TODO: Support stream if anthropic-ai/sdk supports it
export function createToolRunner(
  client: AnthropicAI,
  options: AnthropicAI.Beta.Tools.Messages.MessageCreateParamsNonStreaming,
  handlers: {
    handleTool: (content: AnthropicAI.Beta.Tools.Messages.ToolUseBlock) => Promise<AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam | string>,
    handleUser?: (content: AnthropicAI.Beta.Tools.ToolsBetaMessageParam) => (void | Promise<void>),
    handleAssistant?: (content: AnthropicAI.Beta.Tools.Messages.ToolsBetaContentBlock) => (void | Promise<void>),
  }
): ToolRunner {
  const handleUser = handlers.handleUser ?? defaultHandleUser;
  const handleAssistant = handlers.handleAssistant ?? defaultHandleAssistant;

  let messages = [...options.messages];
  for (const message of messages) {
    handleUser(message);
  }
  let stop_reason: "max_tokens" | "tool_use" | "end_turn" | "stop_sequence" | null = null;

  return {
    current: () => messages.slice(),
    addMessage(newMessage) {
      stop_reason = null;
      messages.push(newMessage);
    },
    async run() {
      while (!this.isEndTurn()) {
        await this.step();
        await this.handleResponse();
        console.log('[stop]', stop_reason);
      }
    },
    async step() {
      stop_reason = null;
      const res = await client.beta.tools.messages.create({
        ...options,
        messages: this.current()
      });
      stop_reason = res.stop_reason;
      messages = mergeMessages(messages, res);
    },
    isEndTurn: () => {
      if (stop_reason === "end_turn") return true;
      return false;
    },
    async handleResponse() {
      const res = messages.at(-1) as AnthropicAI.Beta.Tools.Messages.ToolsBetaMessage;
      const toolResults: AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam[] = [];
      for (const content of res.content) {
        handleAssistant(content);
        if (content.type === "tool_use") {
          try {
            const result = await handlers.handleTool(content);
            if (typeof result === 'string') {
              const toolSuccess: AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam = {
                tool_use_id: content.id,
                type: 'tool_result',
                content: [
                  { type: 'text', text: result }
                ],
                is_error: false
              };
              toolResults.push(toolSuccess);
            } else {
              toolResults.push(result);
            }
          } catch (e) {
            if (e instanceof Error) {
              const toolError: AnthropicAI.Beta.Tools.Messages.ToolResultBlockParam = {
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
      // stop_reason = res.stop_reason;
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

// Chat Runner
export type ChatRunnerHandlers = {
  onText?: (delta: string, current: string) => void,
}
export function createChatRunner(
  client: AnthropicAI,
  options: AnthropicAI.Messages.MessageCreateParamsStreaming,
  reqOptions?: Omit<AnthropicAI.RequestOptions, 'signal'>,
) {
  let stop_reason: AnthropicAI.Messages.Message['stop_reason'] | undefined = undefined;
  let progress: string | null = null;
  let messages = [...options.messages];
  let stream: ReturnType<typeof client.messages.stream> | undefined = undefined;
  return {
    current(): AnthropicAI.Messages.MessageParam[] {
      if (progress) {
        if (messages.at(-1)?.role === 'assistant') {
          return [...messages.slice(0, -1), { role: 'assistant', content: messages.at(-1)!.content + progress }];
        } else {
          return [...messages, { role: 'assistant', content: progress }];
        }
      }
      return messages;
    },
    isEndTurn(): boolean {
      return stop_reason === 'end_turn';
    },
    cancel() {
      if (progress) {
        messages.push({ role: 'assistant', content: progress });
        progress = null;
      }
      if (stream && !stream.aborted) {
        stream.abort();
      }
      stream = undefined;
    },
    addMessage(newMessage: AnthropicAI.Messages.MessageParam): void {
      if (newMessage.role === 'assistant' && messages.at(-1)?.role === 'assistant') {
        throw new Error('Cannot add two assistant messages in a row');
      }
      messages.push(newMessage);
    },
    async run(handlers?: ChatRunnerHandlers): Promise<AnthropicAI.Messages.MessageParam[]> {
      while (!this.isEndTurn()) {
        await this.step(handlers);
      }
      return this.current();
    },
    async step(handlers?: ChatRunnerHandlers): Promise<{ done: boolean, result: string }> {
      stop_reason = null;
      progress = '';
      stream = client.messages.stream({
        ...options,
        messages,
      }, reqOptions);
      stream.on('text', (text) => {
        progress += text;
        handlers?.onText?.(text, progress!);
      });
      const finalMessage = await stream.finalMessage();
      stop_reason = finalMessage.stop_reason;
      progress = null;
      const last = messages.at(-1);
      if (last?.role === 'assistant') {
        messages = [...messages.slice(0, -1), { role: 'assistant', content: last.content + finalMessage.content[0].text }];
      } else {
        messages.push({ role: 'assistant', content: finalMessage.content[0].text });
      }
      stream = undefined;
      return {
        done: finalMessage.stop_reason === 'end_turn',
        result: finalMessage.content[0].text,
      }
    }
  }

}
