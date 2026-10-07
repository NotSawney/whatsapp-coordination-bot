export type Role = 'employee' | 'admin';

export interface Employee {
  id: string;
  name: string;
  phone: string; // número de WhatsApp, identifica al usuario
  role: Role;
}

export interface Asset {
  id: string;
  name: string;
  active: boolean; // baja lógica: false = dado de baja, no reservable
}

/**
 * Todo préstamo es una reserva en la ventana half-open [start, end) (epoch ms).
 * Check-out inmediato = reserva con start = ahora.
 * Check-in (devolución) = cierre anticipado: closedAt libera el activo desde ese instante.
 */
export interface Reservation {
  id: string;
  assetId: string;
  employeeId: string;
  start: number; // epoch ms, inclusive
  end: number;   // epoch ms, exclusive
  closedAt?: number; // si está, el activo quedó libre en este instante
  closedBy?: string; // employeeId de quien cerró (dueño o admin)
}

/** Código estable para que la capa de tools traduzca a mensajes de usuario. */
export type DomainErrorCode =
  | 'INVALID_WINDOW'
  | 'ASSET_INACTIVE'
  | 'OVERLAP'
  | 'ALREADY_CLOSED'
  | 'FORBIDDEN';

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
