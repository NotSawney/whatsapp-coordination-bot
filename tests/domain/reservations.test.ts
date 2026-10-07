import { describe, it, expect } from 'vitest';
import {
  availableAssets,
  checkIn,
  createReservation,
  occupies,
} from '../../src/domain/reservations.js';
import { Asset, DomainError, Reservation } from '../../src/domain/types.js';

const asset: Asset = { id: 'a1', name: 'Notebook', active: true };

function res(partial: Partial<Reservation>): Reservation {
  return {
    id: 'r',
    assetId: 'a1',
    employeeId: 'e1',
    start: 10,
    end: 20,
    ...partial,
  };
}

describe('occupies (ventana half-open)', () => {
  it('solapa cuando los rangos se cruzan', () => {
    expect(occupies(res({ start: 10, end: 20 }), 15, 25)).toBe(true);
  });
  it('NO solapa cuando son adyacentes [10,20) y [20,30)', () => {
    expect(occupies(res({ start: 10, end: 20 }), 20, 30)).toBe(false);
  });
  it('una reserva cerrada antes libera el activo desde closedAt', () => {
    expect(occupies(res({ start: 10, end: 20, closedAt: 12 }), 13, 18)).toBe(false);
    expect(occupies(res({ start: 10, end: 20, closedAt: 15 }), 13, 18)).toBe(true);
  });
});

describe('createReservation', () => {
  it('crea cuando no hay choque', () => {
    const r = createReservation(
      { id: 'r1', assetId: 'a1', employeeId: 'e1', start: 100, end: 200 },
      { asset, existing: [] },
    );
    expect(r.id).toBe('r1');
  });

  it('rechaza ventana inválida (fin <= inicio)', () => {
    expect(() =>
      createReservation(
        { id: 'r1', assetId: 'a1', employeeId: 'e1', start: 200, end: 100 },
        { asset, existing: [] },
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_WINDOW' }));
  });

  it('rechaza activo dado de baja', () => {
    expect(() =>
      createReservation(
        { id: 'r1', assetId: 'a1', employeeId: 'e1', start: 100, end: 200 },
        { asset: { ...asset, active: false }, existing: [] },
      ),
    ).toThrowError(expect.objectContaining({ code: 'ASSET_INACTIVE' }));
  });

  it('rechaza solapamiento con una reserva existente', () => {
    expect(() =>
      createReservation(
        { id: 'r2', assetId: 'a1', employeeId: 'e2', start: 150, end: 250 },
        { asset, existing: [res({ id: 'r1', start: 100, end: 200 })] },
      ),
    ).toThrowError(expect.objectContaining({ code: 'OVERLAP' }));
  });

  it('permite reservar si la previa fue cerrada antes del nuevo inicio', () => {
    const r = createReservation(
      { id: 'r2', assetId: 'a1', employeeId: 'e2', start: 150, end: 250 },
      { asset, existing: [res({ id: 'r1', start: 100, end: 200, closedAt: 120 })] },
    );
    expect(r.id).toBe('r2');
  });
});

describe('checkIn', () => {
  it('marca closedAt y closedBy', () => {
    const r = checkIn(res({}), 15, 'e1');
    expect(r.closedAt).toBe(15);
    expect(r.closedBy).toBe('e1');
  });
  it('rechaza cerrar dos veces', () => {
    const closed = checkIn(res({}), 15, 'e1');
    expect(() => checkIn(closed, 16, 'e1')).toThrowError(
      expect.objectContaining({ code: 'ALREADY_CLOSED' }),
    );
  });
});

describe('availableAssets', () => {
  const a1: Asset = { id: 'a1', name: 'Notebook', active: true };
  const a2: Asset = { id: 'a2', name: 'Proyector', active: true };
  const a3: Asset = { id: 'a3', name: 'Viejo', active: false };

  it('excluye ocupados en la ventana y los dados de baja', () => {
    const out = availableAssets(
      [a1, a2, a3],
      [res({ id: 'r1', assetId: 'a1', start: 100, end: 200 })],
      150,
      180,
    );
    expect(out.map((a) => a.id)).toEqual(['a2']);
  });

  it('incluye un activo cuya reserva no cae en la ventana', () => {
    const out = availableAssets([a1], [res({ id: 'r1', start: 100, end: 200 })], 300, 400);
    expect(out.map((a) => a.id)).toEqual(['a1']);
  });
});

it('DomainError expone code', () => {
  const e = new DomainError('OVERLAP', 'x');
  expect(e.code).toBe('OVERLAP');
});
