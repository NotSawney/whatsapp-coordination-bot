import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/schema.js';
import { createRepos, type Repos } from '../../src/db/repos.js';
import { dispatch, type ToolContext } from '../../src/agent/tools.js';
import { Employee } from '../../src/domain/types.js';

const NOW = Date.parse('2026-01-01T12:00:00Z');
const H = 3_600_000;

const admin: Employee = { id: 'u-admin', name: 'Ada', phone: '1', role: 'admin' };
const eve: Employee = { id: 'u-eve', name: 'Eve', phone: '2', role: 'employee' };
const bob: Employee = { id: 'u-bob', name: 'Bob', phone: '3', role: 'employee' };

let repos: Repos;
const ctx = (actor: Employee): ToolContext => ({ repos, actor, now: NOW });

beforeEach(() => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  repos = createRepos(db);
  for (const e of [admin, eve, bob]) repos.employees.insert(e);
  repos.assets.insert({ id: 'a1', name: 'Notebook', active: true });
  repos.assets.insert({ id: 'a2', name: 'Proyector', active: true });
});

describe('reserve_asset', () => {
  it('reserva y aparece en mis reservas', () => {
    const out = dispatch('reserve_asset', ctx(eve), { assetId: 'a1', end: iso(NOW + 2 * H) }) as any;
    expect(out.ok).toBe(true);
    const mine = dispatch('my_reservations', ctx(eve)) as any;
    expect(mine.reservations).toHaveLength(1);
    expect(mine.reservations[0].asset).toBe('Notebook');
  });

  it('rechaza solapamiento con código OVERLAP', () => {
    dispatch('reserve_asset', ctx(eve), { assetId: 'a1', start: iso(NOW), end: iso(NOW + 2 * H) });
    const out = dispatch('reserve_asset', ctx(bob), {
      assetId: 'a1',
      start: iso(NOW + H),
      end: iso(NOW + 3 * H),
    }) as any;
    expect(out.code).toBe('OVERLAP');
  });

  it('exige hora de devolución (end)', () => {
    const out = dispatch('reserve_asset', ctx(eve), { assetId: 'a1' }) as any;
    expect(out.code).toBe('INVALID_WINDOW');
  });

  it('activo inexistente da error', () => {
    const out = dispatch('reserve_asset', ctx(eve), { assetId: 'nope', end: iso(NOW + H) }) as any;
    expect(out.error).toMatch(/activo/i);
  });
});

describe('list_available_assets', () => {
  it('excluye el que está reservado en la ventana', () => {
    dispatch('reserve_asset', ctx(eve), { assetId: 'a1', start: iso(NOW), end: iso(NOW + 2 * H) });
    const out = dispatch('list_available_assets', ctx(bob), {
      start: iso(NOW + H),
      end: iso(NOW + 90 * 60 * 1000),
    }) as any;
    expect(out.assets.map((a: any) => a.assetId)).toEqual(['a2']);
  });
});

describe('return_asset', () => {
  it('el dueño devuelve; un tercero no puede', () => {
    const r = dispatch('reserve_asset', ctx(eve), { assetId: 'a1', end: iso(NOW + 2 * H) }) as any;
    const id = r.reservation.reservationId;

    const denied = dispatch('return_asset', ctx(bob), { reservationId: id }) as any;
    expect(denied.code).toBe('FORBIDDEN');

    const ok = dispatch('return_asset', ctx(eve), { reservationId: id }) as any;
    expect(ok.ok).toBe(true);
    expect((dispatch('my_reservations', ctx(eve)) as any).reservations).toHaveLength(0);
  });
});

describe('admin', () => {
  it('empleado no puede dar de alta un activo', () => {
    const out = dispatch('add_asset', ctx(eve), { name: 'Cámara' }) as any;
    expect(out.code).toBe('FORBIDDEN');
  });

  it('admin da de alta y queda reservable', () => {
    const out = dispatch('add_asset', ctx(admin), { name: 'Cámara' }) as any;
    expect(out.ok).toBe(true);
    const free = dispatch('list_available_assets', ctx(eve)) as any;
    expect(free.assets.map((a: any) => a.name)).toContain('Cámara');
  });

  it('admin fuerza la devolución de otro y lo ve en list_all', () => {
    const r = dispatch('reserve_asset', ctx(eve), { assetId: 'a1', end: iso(NOW + 2 * H) }) as any;
    const all = dispatch('list_all_reservations', ctx(admin)) as any;
    expect(all.reservations[0].employee).toBe('Eve');

    const forced = dispatch('force_return', ctx(admin), {
      reservationId: r.reservation.reservationId,
    }) as any;
    expect(forced.ok).toBe(true);
    expect((dispatch('list_all_reservations', ctx(admin)) as any).reservations).toHaveLength(0);
  });

  it('deactivate_asset lo saca de disponibles', () => {
    dispatch('deactivate_asset', ctx(admin), { assetId: 'a2' });
    const free = dispatch('list_available_assets', ctx(eve)) as any;
    expect(free.assets.map((a: any) => a.assetId)).not.toContain('a2');
  });
});

it('tool desconocida no rompe', () => {
  expect((dispatch('nope', ctx(eve)) as any).error).toMatch(/desconocida/);
});

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
