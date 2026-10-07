import { describe, expect, it } from 'vitest';
import { hasApiKey, makeEvalEnv, phones } from './harness.js';

/**
 * Evals del agente contra el modelo REAL de OpenRouter (según .env).
 * Opt-in: `pnpm test:evals`. No levanta WhatsApp; pega directo al handler.
 * Miden intención→tool correcta y el efecto en la DB. Son lentas y pueden
 * ser algo flaky según el modelo free; por eso viven fuera de `pnpm test`.
 */
const suite = hasApiKey ? describe : describe.skip;

suite('intención → tool correcta', () => {
  it('"¿qué hay disponible?" → list_available_assets', async () => {
    const { handler, toolsCalled } = makeEvalEnv();
    const reply = await handler({ from: phones.eve, text: '¿qué equipos hay disponibles para prestar?' });
    expect(toolsCalled).toContain('list_available_assets');
    expect(reply.trim()).not.toBe('');
  });

  it('pedido de reserva → reserve_asset y queda persistida', async () => {
    const { handler, toolsCalled, repos } = makeEvalEnv();
    await handler({
      from: phones.eve,
      text: 'reservá la Notebook Dell XPS (id a-nb1) desde ahora hasta mañana a las 18',
    });
    expect(toolsCalled).toContain('reserve_asset');
    expect(repos.reservations.openByEmployee('u-eve').length).toBeGreaterThan(0);
  });

  it('"¿qué tengo reservado?" → my_reservations', async () => {
    const { handler, toolsCalled } = makeEvalEnv();
    await handler({ from: phones.eve, text: '¿qué tengo reservado a mi nombre?' });
    expect(toolsCalled).toContain('my_reservations');
  });

  it('admin: alta de activo → add_asset y existe', async () => {
    const { handler, toolsCalled, repos } = makeEvalEnv();
    await handler({ from: phones.admin, text: 'dá de alta un activo nuevo llamado Taladro Bosch' });
    expect(toolsCalled).toContain('add_asset');
    expect(repos.assets.listActive().some((a) => /taladro/i.test(a.name))).toBe(true);
  });
});
