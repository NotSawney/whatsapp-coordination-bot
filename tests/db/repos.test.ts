import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/schema.js';
import { createRepos, type Repos } from '../../src/db/repos.js';

let repos: Repos;

beforeEach(() => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  repos = createRepos(db);
  repos.employees.insert({ id: 'e1', name: 'Eve', phone: '111', role: 'employee' });
  repos.assets.insert({ id: 'a1', name: 'Notebook', active: true });
});

describe('employees', () => {
  it('busca por teléfono y por id', () => {
    expect(repos.employees.getByPhone('111')?.id).toBe('e1');
    expect(repos.employees.getById('e1')?.role).toBe('employee');
    expect(repos.employees.getByPhone('nope')).toBeUndefined();
  });
});

describe('assets', () => {
  it('listActive excluye los dados de baja', () => {
    repos.assets.insert({ id: 'a2', name: 'Viejo', active: false });
    expect(repos.assets.listActive().map((a) => a.id)).toEqual(['a1']);
    repos.assets.setActive('a1', false);
    expect(repos.assets.listActive()).toEqual([]);
  });
});

describe('reservations', () => {
  it('insert + getById mapea closedAt/closedBy como undefined si no hay', () => {
    repos.reservations.insert({ id: 'r1', assetId: 'a1', employeeId: 'e1', start: 100, end: 200 });
    const r = repos.reservations.getById('r1')!;
    expect(r.closedAt).toBeUndefined();
    expect(r.closedBy).toBeUndefined();
  });

  it('close setea closedAt/closedBy y lo saca de las abiertas', () => {
    repos.reservations.insert({ id: 'r1', assetId: 'a1', employeeId: 'e1', start: 100, end: 200 });
    repos.reservations.close('r1', 150, 'e1');
    expect(repos.reservations.getById('r1')?.closedAt).toBe(150);
    expect(repos.reservations.openByEmployee('e1')).toEqual([]);
  });

  it('forAssetInWindow trae solo las que podrían chocar', () => {
    repos.reservations.insert({ id: 'r1', assetId: 'a1', employeeId: 'e1', start: 100, end: 200 });
    expect(repos.reservations.forAssetInWindow('a1', 150, 250).map((r) => r.id)).toEqual(['r1']);
    expect(repos.reservations.forAssetInWindow('a1', 300, 400)).toEqual([]);
  });

  it('una reserva cerrada temprano deja de chocar', () => {
    repos.reservations.insert({ id: 'r1', assetId: 'a1', employeeId: 'e1', start: 100, end: 200 });
    repos.reservations.close('r1', 120, 'e1');
    expect(repos.reservations.forAssetInWindow('a1', 150, 250)).toEqual([]);
  });

  it('overlapping y allOpen', () => {
    repos.reservations.insert({ id: 'r1', assetId: 'a1', employeeId: 'e1', start: 100, end: 200 });
    expect(repos.reservations.overlapping(150, 160).map((r) => r.id)).toEqual(['r1']);
    expect(repos.reservations.allOpen().map((r) => r.id)).toEqual(['r1']);
  });
});
