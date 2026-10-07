import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/schema.js';
import { createRepos, type Repos } from '../../src/db/repos.js';
import { createHandler, normalizePhone } from '../../src/app/handler.js';
import type { AssistantMsg, LLM, Msg } from '../../src/agent/agent.js';

const NOW = Date.parse('2026-01-01T12:00:00Z');

let repos: Repos;
beforeEach(() => {
  const db = new Database(':memory:');
  migrate(db);
  repos = createRepos(db);
  repos.employees.insert({ id: 'u-eve', name: 'Eve', phone: '5490000000002', role: 'employee' });
  repos.assets.insert({ id: 'a1', name: 'Notebook', active: true });
});

/** LLM que nunca pide tools: devuelve un texto fijo y recuerda lo que vio. */
function echoLLM(reply: string): { llm: LLM; lastHistory: () => Msg[] } {
  let last: Msg[] = [];
  const llm: LLM = async (messages) => {
    last = messages;
    return { content: reply, tool_calls: [] } satisfies AssistantMsg;
  };
  return { llm, lastHistory: () => last };
}

describe('normalizePhone', () => {
  it('extrae dígitos de un JID de WhatsApp', () => {
    expect(normalizePhone('5490000000002:12@s.whatsapp.net')).toBe('5490000000002');
    expect(normalizePhone('+54 9 000 000-0002')).toBe('5490000000002');
  });
});

describe('createHandler', () => {
  it('rechaza a un número desconocido sin llamar al LLM', async () => {
    let called = false;
    const llm: LLM = async () => {
      called = true;
      return { content: 'x', tool_calls: [] };
    };
    const handler = createHandler(repos, llm, { now: () => NOW });
    const reply = await handler({ from: '549999@s.whatsapp.net', text: 'hola' });
    expect(reply).toMatch(/no te reconozco/i);
    expect(called).toBe(false);
  });

  it('atiende a un empleado conocido', async () => {
    const { llm } = echoLLM('¡Hola Eve!');
    const handler = createHandler(repos, llm, { now: () => NOW });
    const reply = await handler({ from: '5490000000002@s.whatsapp.net', text: 'hola' });
    expect(reply).toBe('¡Hola Eve!');
  });

  it('acumula memoria: el 2do mensaje ve el turno anterior', async () => {
    const { llm, lastHistory } = echoLLM('ok');
    const handler = createHandler(repos, llm, { now: () => NOW });
    await handler({ from: '5490000000002', text: 'primero' });
    await handler({ from: '5490000000002', text: 'segundo' });

    // El historial (sin el system, que agrega el loop) debe tener: user/assistant/user.
    const userMsgs = lastHistory().filter((m) => m.role === 'user').map((m) => m.content);
    expect(userMsgs).toEqual(['primero', 'segundo']);
  });

  it('respeta la ventana de memoria (maxMessages)', async () => {
    const { llm, lastHistory } = echoLLM('ok');
    const handler = createHandler(repos, llm, { now: () => NOW, maxMessages: 2 });
    await handler({ from: '5490000000002', text: 'uno' });
    await handler({ from: '5490000000002', text: 'dos' });
    await handler({ from: '5490000000002', text: 'tres' });
    // Solo entra el system + los últimos 2 guardados + el user actual.
    const userMsgs = lastHistory().filter((m) => m.role === 'user').map((m) => m.content);
    expect(userMsgs).toEqual(['dos', 'tres']);
  });
});
