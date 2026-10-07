import { describe, it, expect } from 'vitest';
import { assertAdmin, assertCanClose, canClose, isAdmin } from '../../src/domain/authz.js';
import { Employee, Reservation } from '../../src/domain/types.js';

const admin: Employee = { id: 'a', name: 'Ada', phone: '1', role: 'admin' };
const emp: Employee = { id: 'e1', name: 'Eve', phone: '2', role: 'employee' };
const other: Employee = { id: 'e2', name: 'Bob', phone: '3', role: 'employee' };

const reservation: Reservation = {
  id: 'r', assetId: 'x', employeeId: 'e1', start: 0, end: 10,
};

describe('authz', () => {
  it('isAdmin distingue roles', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(emp)).toBe(false);
  });

  it('el dueño o un admin pueden cerrar; un tercero no', () => {
    expect(canClose(emp, reservation)).toBe(true);
    expect(canClose(admin, reservation)).toBe(true);
    expect(canClose(other, reservation)).toBe(false);
  });

  it('assertAdmin bloquea a un empleado', () => {
    expect(() => assertAdmin(emp, 'dar de alta un activo')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    expect(() => assertAdmin(admin, 'dar de alta un activo')).not.toThrow();
  });

  it('assertCanClose bloquea a un tercero', () => {
    expect(() => assertCanClose(other, reservation)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    expect(() => assertCanClose(emp, reservation)).not.toThrow();
  });
});
