import { buildSystemPrompt, runAgentLoop, type LLM, type Msg } from '../agent/agent.js';
import type { Repos } from '../db/repos.js';
import type { MessageHandler } from '../channel/channel.js';
import { ConversationMemory } from './memory.js';

/** JID de WhatsApp ('549...:12@s.whatsapp.net') o teléfono → solo dígitos. */
export function normalizePhone(from: string): string {
  return from.split('@')[0].split(':')[0].replace(/\D/g, '');
}

export interface HandlerOptions {
  maxMessages?: number;
  now?: () => number; // inyectable para tests
}

/**
 * Arma el MessageHandler: identifica al empleado por teléfono, mantiene su
 * memoria conversacional y corre el agente. Número desconocido = rechazado.
 */
export function createHandler(repos: Repos, llm: LLM, opts: HandlerOptions = {}): MessageHandler {
  const memory = new ConversationMemory(opts.maxMessages ?? 10);
  const clock = opts.now ?? Date.now;

  return async ({ from, text }) => {
    const phone = normalizePhone(from);
    const employee = repos.employees.getByPhone(phone);
    if (!employee) {
      return 'No te reconozco como empleado registrado. Pedile a un admin que te dé de alta.';
    }

    const now = clock();
    const turn: Msg[] = [...memory.get(phone), { role: 'user', content: text }];
    const reply = await runAgentLoop(
      llm,
      turn,
      { repos, actor: employee, now },
      { systemPrompt: buildSystemPrompt(employee, now) },
    );
    memory.set(phone, [...turn, { role: 'assistant', content: reply }]);
    return reply;
  };
}
