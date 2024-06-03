import type AnthropicAI from "npm:@anthropic-ai/sdk@0.22.0";

export type JSONSchema = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
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

export type ToolName<T> = T extends { name: infer N } ? N : never;

export type ToolSchema<T> = T extends { input_schema: infer S } ? S : never;

export type ToolInput<S extends JSONSchema> = SchemaToType<S>;

export type ToolHandler<S extends JSONSchema> = (input: ToolInput<S>) => Promise<string>;

export type ToolDef<T extends AnthropicAI.Tool> = {
  schema: T,
  handler: T['input_schema'] extends JSONSchema ? ToolHandler<T['input_schema']> : never
}

export type ToolRunner = {
  getMessages: () => AnthropicAI.Messages.MessageParam[],
  getFinalMessage: () => AnthropicAI.Messages.MessageParam | undefined,
  registerTool: <Tool extends AnthropicAI.Tool>(def: ToolDef<Tool>) => string,
  isEndTurn: () => boolean,
  run(): Promise<void>,
  ask(newMessage: AnthropicAI.Messages.MessageParam | string, choice?: string): Promise<void>,
  step(): Promise<void>,
  handleResponse: () => Promise<AnthropicAI.Messages.MessageParam[]>
}

type OptionalPropertyNames<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

type RequiredPropertyNames<T> = Exclude<keyof T, OptionalPropertyNames<T>>;

// Not used yet
export type TypeToSchema<T> = T extends string
  ? { type: 'string' }
  : T extends number
  ? { type: 'number' }
  : T extends boolean
  ? { type: 'boolean' }
  : T extends Array<infer U>
  ? { type: 'array'; items: TypeToSchema<U> }
  : T extends object
  ? {
    type: 'object';
    properties: {
      [K in keyof T]: TypeToSchema<T[K]>;
    };
    required: RequiredPropertyNames<T>[];
  }
  : never;
