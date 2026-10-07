import { Asset, DomainError, Reservation } from './types.js';

/** Fin efectivo: una reserva cerrada antes de tiempo libera el activo en closedAt. */
export function effectiveEnd(r: Reservation): number {
  return r.closedAt ?? r.end;
}

/** ¿La reserva ocupa el activo en algún punto de la ventana [start, end)? (half-open) */
export function occupies(r: Reservation, start: number, end: number): boolean {
  return r.start < end && start < effectiveEnd(r);
}

export interface NewReservation {
  id: string;
  assetId: string;
  employeeId: string;
  start: number;
  end: number;
}

/**
 * Crea una reserva validando ventana, estado del activo y no-solapamiento.
 * `existing` son las reservas conocidas (de cualquier activo; filtra por assetId).
 * Pura: el id lo provee el caller (testeable sin azar).
 */
export function createReservation(
  input: NewReservation,
  ctx: { asset: Asset; existing: Reservation[] },
): Reservation {
  if (input.end <= input.start) {
    throw new DomainError('INVALID_WINDOW', 'El fin de la reserva debe ser posterior al inicio.');
  }
  if (input.assetId !== ctx.asset.id) {
    throw new DomainError('INVALID_WINDOW', 'El activo no coincide con la reserva.');
  }
  if (!ctx.asset.active) {
    throw new DomainError('ASSET_INACTIVE', 'El activo está dado de baja y no se puede reservar.');
  }
  const clash = ctx.existing.some(
    (r) => r.assetId === input.assetId && occupies(r, input.start, input.end),
  );
  if (clash) {
    throw new DomainError('OVERLAP', 'El activo ya está reservado en ese rango.');
  }
  return { ...input };
}

/** Cierre anticipado (devolución). Pura: no verifica permisos (eso lo hace authz). */
export function checkIn(r: Reservation, at: number, by: string): Reservation {
  if (r.closedAt !== undefined) {
    throw new DomainError('ALREADY_CLOSED', 'La reserva ya fue cerrada.');
  }
  return { ...r, closedAt: at, closedBy: by };
}

/** Activos reservables (activos y libres) en la ventana [start, end). */
export function availableAssets(
  assets: Asset[],
  reservations: Reservation[],
  start: number,
  end: number,
): Asset[] {
  return assets.filter(
    (a) =>
      a.active &&
      !reservations.some((r) => r.assetId === a.id && occupies(r, start, end)),
  );
}
