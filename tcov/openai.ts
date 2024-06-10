import { OpenAI } from 'npm:openai@4.49.1';

type OpenAIOptions = OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

export async function runChat(opts: OpenAIOptions) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const encoder = new TextEncoder();
  const openai = new OpenAI({ apiKey });
  const stream = await openai.chat.completions.create(opts);
  let result = '';
  let stop_reason: OpenAI.ChatCompletionChunk.Choice['finish_reason'] | null = null;
  for await (const message of stream) {
    for (const choice of message.choices) {
      if (choice.delta.content) {
        result += choice.delta.content;
        Deno.stdout.writeSync(encoder.encode(choice.delta.content));
      }
      if (choice.finish_reason) {
        stop_reason = choice.finish_reason;
        break;
      }
    }
  }
  Deno.stdout.writeSync(encoder.encode('\n'));
  return {
    result,
    stop_reason
  };
}