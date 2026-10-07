import { existsSync } from 'node:fs';
import { createOpenRouterLLM } from './agent/openrouter.js';
import { createHandler } from './app/handler.js';
import { createCliChannel } from './channel/cli.js';
import type { Channel } from './channel/channel.js';
import { openDb } from './db/connection.js';
import { createRepos } from './db/repos.js';
import { seed } from './db/seed.js';

// Carga .env si el runtime lo soporta (Node 20.12+/22).
if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env');
}

const db = openDb();
const repos = createRepos(db);
seed(repos); // idempotente: asegura datos demo

const llm = createOpenRouterLLM();
const handler = createHandler(repos, llm);

const mode = process.env.CHANNEL ?? process.argv[2] ?? 'cli';

const channel: Channel =
  mode === 'whatsapp'
    ? await (await import('./channel/baileys.js')).createBaileysChannel()
    : createCliChannel(process.env.CLI_PHONE ?? '5490000000002');

await channel.start(handler);
