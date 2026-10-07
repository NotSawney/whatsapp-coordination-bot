import { randomUUID } from 'node:crypto';
import type { Repos } from '../db/repos.js';
import { assertAdmin, assertCanClose } from '../domain/authz.js';
import { availableAssets, checkIn, createReservation } from '../domain/reservations.js';
import { DomainError, Employee, Reservation } from '../domain/types.js';

export interface ToolContext {
  repos: Repos;
  actor: Employee;
  now: number; // epoch ms, inyectable para tests
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema (formato OpenAI function-calling)
  execute(ctx: ToolContext, args: Record<string, unknown>): unknown;
}

// --- helpers de args ---------------------------------------------------------

function reqStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new DomainError('INVALID_WINDOW', `Falta el dato "${key}".`);
  }
  return v;
}

/** Parsea ISO 8601 o epoch ms. undefined → fallback. Inválido → INVALID_WINDOW. */
function parseTime(v: unknown, fallback: number): number {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    if (Number.isNaN(ms)) {
      throw new DomainError('INVALID_WINDOW', `No entendí la fecha/hora "${v}". Usá formato ISO.`);
    }
    return ms;
  }
  throw new DomainError('INVALID_WINDOW', 'Fecha/hora inválida.');
}

const iso = (ms: number) => new Date(ms).toISOString();

function assetName(repos: Repos, id: string): string {
  return repos.assets.getById(id)?.name ?? id;
}

function viewReservation(repos: Repos, r: Reservation) {
  return {
    reservationId: r.id,
    asset: assetName(repos, r.assetId),
    start: iso(r.start),
    end: iso(r.end),
  };
}

// --- tools -------------------------------------------------------------------

export const tools: Tool[] = [
  {
    name: 'list_available_assets',
    description:
      'Lista los activos disponibles (no reservados) en una ventana. Sin fechas, lista los libres ahora mismo.',
    parameters: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Inicio ISO 8601. Por defecto: ahora.' },
        end: { type: 'string', description: 'Fin ISO 8601. Por defecto: justo después de start.' },
      },
    },
    execute({ repos, now }, args) {
      const start = parseTime(args.start, now);
      const end = parseTime(args.end, start + 1);
      const free = availableAssets(repos.assets.listActive(), repos.reservations.overlapping(start, end), start, end);
      return { assets: free.map((a) => ({ assetId: a.id, name: a.name })) };
    },
  },

  {
    name: 'reserve_asset',
    description:
      'Reserva un activo para el usuario actual. start por defecto es ahora (check-out inmediato); end es obligatorio.',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: 'ID del activo a reservar.' },
        start: { type: 'string', description: 'Inicio ISO 8601. Por defecto: ahora.' },
        end: { type: 'string', description: 'Fin ISO 8601 (devolución estimada). Obligatorio.' },
      },
      required: ['assetId', 'end'],
    },
    execute({ repos, actor, now }, args) {
      const assetId = reqStr(args, 'assetId');
      const asset = repos.assets.getById(assetId);
      if (!asset) throw new DomainError('ASSET_INACTIVE', 'No encontré ese activo.');
      const start = parseTime(args.start, now);
      if (args.end === undefined || args.end === null) {
        throw new DomainError('INVALID_WINDOW', 'Necesito la hora de devolución estimada (end).');
      }
      const end = parseTime(args.end, NaN);
      const reservation = createReservation(
        { id: randomUUID(), assetId, employeeId: actor.id, start, end },
        { asset, existing: repos.reservations.forAssetInWindow(assetId, start, end) },
      );
      repos.reservations.insert(reservation);
      return { ok: true, reservation: viewReservation(repos, reservation) };
    },
  },

  {
    name: 'my_reservations',
    description: 'Devuelve las reservas abiertas del usuario actual.',
    parameters: { type: 'object', properties: {} },
    execute({ repos, actor }) {
      return { reservations: repos.reservations.openByEmployee(actor.id).map((r) => viewReservation(repos, r)) };
    },
  },

  {
    name: 'return_asset',
    description: 'Devuelve (cierra) una reserva del usuario actual antes de su fin.',
    parameters: {
      type: 'object',
      properties: { reservationId: { type: 'string', description: 'ID de la reserva a devolver.' } },
      required: ['reservationId'],
    },
    execute({ repos, actor, now }, args) {
      const id = reqStr(args, 'reservationId');
      const r = repos.reservations.getById(id);
      if (!r) throw new DomainError('ALREADY_CLOSED', 'No encontré esa reserva.');
      assertCanClose(actor, r);
      const closed = checkIn(r, now, actor.id);
      repos.reservations.close(closed.id, closed.closedAt!, closed.closedBy!);
      return { ok: true, returned: viewReservation(repos, closed) };
    },
  },

  // --- admin -----------------------------------------------------------------
  {
    name: 'add_asset',
    description: 'ADMIN: da de alta un nuevo activo prestable.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Nombre del activo.' } },
      required: ['name'],
    },
    execute({ repos, actor }, args) {
      assertAdmin(actor, 'dar de alta un activo');
      const name = reqStr(args, 'name');
      const id = `a-${randomUUID().slice(0, 8)}`;
      repos.assets.insert({ id, name, active: true });
      return { ok: true, asset: { assetId: id, name } };
    },
  },

  {
    name: 'deactivate_asset',
    description: 'ADMIN: da de baja un activo (deja de ser reservable; conserva su historial).',
    parameters: {
      type: 'object',
      properties: { assetId: { type: 'string', description: 'ID del activo a dar de baja.' } },
      required: ['assetId'],
    },
    execute({ repos, actor }, args) {
      assertAdmin(actor, 'dar de baja un activo');
      const assetId = reqStr(args, 'assetId');
      if (!repos.assets.getById(assetId)) throw new DomainError('ASSET_INACTIVE', 'No encontré ese activo.');
      repos.assets.setActive(assetId, false);
      return { ok: true };
    },
  },

  {
    name: 'force_return',
    description: 'ADMIN: fuerza la devolución de la reserva de cualquier empleado.',
    parameters: {
      type: 'object',
      properties: { reservationId: { type: 'string', description: 'ID de la reserva a cerrar.' } },
      required: ['reservationId'],
    },
    execute({ repos, actor, now }, args) {
      assertAdmin(actor, 'forzar una devolución');
      const id = reqStr(args, 'reservationId');
      const r = repos.reservations.getById(id);
      if (!r) throw new DomainError('ALREADY_CLOSED', 'No encontré esa reserva.');
      const closed = checkIn(r, now, actor.id);
      repos.reservations.close(closed.id, closed.closedAt!, closed.closedBy!);
      return { ok: true, returned: viewReservation(repos, closed), forcedBy: actor.id };
    },
  },

  {
    name: 'list_all_reservations',
    description: 'ADMIN: lista todas las reservas abiertas con su dueño.',
    parameters: { type: 'object', properties: {} },
    execute({ repos, actor }) {
      assertAdmin(actor, 'ver todas las reservas');
      return {
        reservations: repos.reservations.allOpen().map((r) => ({
          ...viewReservation(repos, r),
          employee: repos.employees.getById(r.employeeId)?.name ?? r.employeeId,
        })),
      };
    },
  },
];

/**
 * Despacha una tool por nombre y traduce DomainError a un resultado que el LLM
 * puede devolver al usuario. Errores no-dominio (bugs) se propagan.
 */
export function dispatch(
  name: string,
  ctx: ToolContext,
  args: Record<string, unknown> = {},
): unknown {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: `Herramienta desconocida: ${name}` };
  try {
    return tool.execute(ctx, args);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message, code: e.code };
    throw e;
  }
}
