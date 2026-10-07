import OpenAI from 'openai';
import type { AssistantMsg, LLM, Msg, OpenAITool } from './agent.js';

/**
 * Adaptador OpenRouter (OpenAI-compatible). Devuelve una función LLM que el loop
 * usa. El modelo es config (OPENROUTER_MODEL): cambiarlo no toca código.
 */
export function createOpenRouterLLM(): LLM {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Falta OPENROUTER_API_KEY en el entorno (ver .env.example).');
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_APP_URL ?? '',
      'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'WhatsApp Asset Bot',
    },
  });

  const model = process.env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3.5-lightning:free';
  const temperature = Number(process.env.OPENROUTER_TEMPERATURE ?? '0');

  return async (messages: Msg[], tools: OpenAITool[]): Promise<AssistantMsg> => {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
      tool_choice: 'auto',
    });
    const m = resp.choices[0]?.message;
    return {
      content: m?.content ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tool_calls: (m?.tool_calls as any) ?? undefined,
    };
  };
}
