import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createOpenRouterLLM } from '../../src/agent/openrouter.js';
import type { LLM } from '../../src/agent/agent.js';
import { createHandler } from '../../src/app/handler.js';
import { createRepos, type Repos } from '../../src/db/repos.js';
import { migrate } from '../../src/db/schema.js';
import { seed } from '../../src/db/seed.js';
import type { MessageHandler } from '../../src/channel/channel.js';

// Las evals usan el .env del proyecto (modelo, key, temperatura).
if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env');
}

/** Si no hay key, la suite se salta en vez de fallar. */
export const hasApiKey = !!process.env.OPENROUTER_API_KEY;

/** Teléfonos sembrados por seed() — identidad sin WhatsApp. */
export const phones = { admin: '5490000000001', eve: '5490000000002' } as const;

/** Envuelve el LLM real y registra qué tools pidió el modelo (intención→tool). */
function recording(base: LLM): { llm: LLM; toolsCalled: string[] } {
  const toolsCalled: string[] = [];
  const llm: LLM = async (messages, tools) => {
    const res = await base(messages, tools);
    for (const c of res.tool_calls ?? []) toolsCalled.push(c.function.name);
    return res;
  };
  return { llm, toolsCalled };
}

export interface EvalEnv {
  repos: Repos;
  handler: MessageHandler;
  toolsCalled: string[];
}

/** DB en memoria + seed + LLM real (registrando tools) + handler. Sin canal. */
export function makeEvalEnv(): EvalEnv {
  const db = new Database(':memory:');
  migrate(db);
  const repos = createRepos(db);
  seed(repos);
  const { llm, toolsCalled } = recording(createOpenRouterLLM());
  const handler = createHandler(repos, llm);
  return { repos, handler, toolsCalled };
}
