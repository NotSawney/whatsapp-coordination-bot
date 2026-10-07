import { DomainError, Employee, Reservation } from './types.js';

export function isAdmin(actor: Employee): boolean {
  return actor.role === 'admin';
}

/** Puede cerrar una reserva: el dueño o un admin (forzar devolución). */
export function canClose(actor: Employee, reservation: Reservation): boolean {
  return isAdmin(actor) || actor.id === reservation.employeeId;
}

export function assertAdmin(actor: Employee, action: string): void {
  if (!isAdmin(actor)) {
    throw new DomainError('FORBIDDEN', `Solo un admin puede ${action}.`);
  }
}

export function assertCanClose(actor: Employee, reservation: Reservation): void {
  if (!canClose(actor, reservation)) {
    throw new DomainError('FORBIDDEN', 'No podés devolver una reserva que no es tuya.');
  }
}
