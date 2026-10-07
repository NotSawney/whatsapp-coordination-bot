import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/schema.js';
import { createRepos, type Repos } from '../../src/db/repos.js';
import { runAgentLoop, type AssistantMsg, type LLM, type Msg } from '../../src/agent/agent.js';
import type { ToolContext } from '../../src/agent/tools.js';
import { Employee } from '../../src/domain/types.js';

const NOW = Date.parse('2026-01-01T12:00:00Z');
const eve: Employee = { id: 'u-eve', name: 'Eve', phone: '2', role: 'employee' };

let repos: Repos;
const ctx = (): ToolContext => ({ repos, actor: eve, now: NOW });

beforeEach(() => {
  const db = new Database(':memory:');
  migrate(db);
  repos = createRepos(db);
  repos.employees.insert(eve);
  repos.assets.insert({ id: 'a1', name: 'Notebook', active: true });
});

/** LLM falso: devuelve en orden los mensajes scripteados. Captura lo que recibió. */
function scriptedLLM(script: AssistantMsg[]): { llm: LLM; seen: Msg[][] } {
  const seen: Msg[][] = [];
  let i = 0;
  const llm: LLM = async (messages) => {
    seen.push(structuredClone(messages));
    return script[Math.min(i++, script.length - 1)];
  };
  return { llm, seen };
}

const toolCall = (id: string, name: string, args: object): AssistantMsg => ({
  content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

describe('runAgentLoop', () => {
  it('ejecuta una tool y luego devuelve el texto final', async () => {
    const { llm } = scriptedLLM([
      toolCall('c1', 'reserve_asset', { assetId: 'a1', end: '2026-01-01T14:00:00Z' }),
      { content: 'Listo, reservé la Notebook hasta las 14:00.', tool_calls: [] },
    ]);
    const out = await runAgentLoop(llm, [{ role: 'user', content: 'quiero la notebook' }], ctx(), {
      systemPrompt: 'sys',
    });
    expect(out).toMatch(/reserv/i);
    expect(repos.reservations.openByEmployee('u-eve')).toHaveLength(1);
  });

  it('pasa el resultado de la tool de vuelta al modelo', async () => {
    const { llm, seen } = scriptedLLM([
      toolCall('c1', 'my_reservations', {}),
      { content: 'No tenés reservas.', tool_calls: [] },
    ]);
    await runAgentLoop(llm, [{ role: 'user', content: 'qué tengo' }], ctx(), { systemPrompt: 'sys' });
    // En la 2da llamada el historial ya incluye el mensaje role:'tool' con el resultado.
    const second = seen[1];
    const toolMsg = second.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('reservations');
  });

  it('no crashea con argumentos JSON rotos; informa el error como resultado de tool', async () => {
    const broken: AssistantMsg = {
      content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'my_reservations', arguments: '{nope' } }],
    };
    const { llm, seen } = scriptedLLM([broken, { content: 'ok', tool_calls: [] }]);
    const out = await runAgentLoop(llm, [{ role: 'user', content: 'x' }], ctx(), { systemPrompt: 'sys' });
    expect(out).toBe('ok');
    const toolMsg = seen[1].find((m) => m.role === 'tool');
    expect(toolMsg?.content).toMatch(/inválidos/i);
  });

  it('devuelve fallback si el contenido final viene vacío', async () => {
    const { llm } = scriptedLLM([{ content: '', tool_calls: [] }]);
    const out = await runAgentLoop(llm, [{ role: 'user', content: 'x' }], ctx(), { systemPrompt: 'sys' });
    expect(out).toMatch(/reformul/i);
  });

  it('corta y da fallback si el modelo pide tools sin parar', async () => {
    // Siempre devuelve un tool_call → nunca termina solo.
    const llm: LLM = async () => toolCall('c', 'my_reservations', {});
    const out = await runAgentLoop(llm, [{ role: 'user', content: 'x' }], ctx(), {
      systemPrompt: 'sys',
      maxSteps: 3,
    });
    expect(out).toMatch(/enred/i);
  });
});
