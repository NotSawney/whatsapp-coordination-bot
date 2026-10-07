import type Database from 'better-sqlite3';
import { Asset, Employee, Reservation, Role } from '../domain/types.js';

interface EmployeeRow { id: string; name: string; phone: string; role: Role; }
interface AssetRow { id: string; name: string; active: number; }
interface ReservationRow {
  id: string; asset_id: string; employee_id: string;
  start: number; end: number; closed_at: number | null; closed_by: string | null;
}

const toAsset = (r: AssetRow): Asset => ({ id: r.id, name: r.name, active: r.active === 1 });

const toReservation = (r: ReservationRow): Reservation => ({
  id: r.id,
  assetId: r.asset_id,
  employeeId: r.employee_id,
  start: r.start,
  end: r.end,
  ...(r.closed_at !== null ? { closedAt: r.closed_at } : {}),
  ...(r.closed_by !== null ? { closedBy: r.closed_by } : {}),
});

export function createRepos(db: Database.Database) {
  return {
    employees: {
      getByPhone(phone: string): Employee | undefined {
        return db.prepare('SELECT * FROM employees WHERE phone = ?').get(phone) as
          | Employee
          | undefined;
      },
      getById(id: string): Employee | undefined {
        return db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as
          | Employee
          | undefined;
      },
      insert(e: Employee): void {
        db.prepare(
          'INSERT INTO employees (id, name, phone, role) VALUES (@id, @name, @phone, @role)',
        ).run(e);
      },
    },

    assets: {
      getById(id: string): Asset | undefined {
        const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as
          | AssetRow
          | undefined;
        return row && toAsset(row);
      },
      listActive(): Asset[] {
        return (db.prepare('SELECT * FROM assets WHERE active = 1 ORDER BY name').all() as AssetRow[])
          .map(toAsset);
      },
      insert(a: Asset): void {
        db.prepare('INSERT INTO assets (id, name, active) VALUES (?, ?, ?)').run(
          a.id,
          a.name,
          a.active ? 1 : 0,
        );
      },
      setActive(id: string, active: boolean): void {
        db.prepare('UPDATE assets SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
      },
    },

    reservations: {
      getById(id: string): Reservation | undefined {
        const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as
          | ReservationRow
          | undefined;
        return row && toReservation(row);
      },
      insert(r: Reservation): void {
        db.prepare(
          `INSERT INTO reservations (id, asset_id, employee_id, start, end, closed_at, closed_by)
           VALUES (@id, @assetId, @employeeId, @start, @end, @closedAt, @closedBy)`,
        ).run({
          id: r.id,
          assetId: r.assetId,
          employeeId: r.employeeId,
          start: r.start,
          end: r.end,
          closedAt: r.closedAt ?? null,
          closedBy: r.closedBy ?? null,
        });
      },
      close(id: string, closedAt: number, closedBy: string): void {
        db.prepare('UPDATE reservations SET closed_at = ?, closed_by = ? WHERE id = ?').run(
          closedAt,
          closedBy,
          id,
        );
      },
      /** Reservas de un activo que podrían chocar con la ventana [start, end). */
      forAssetInWindow(assetId: string, start: number, end: number): Reservation[] {
        return (
          db
            .prepare(
              `SELECT * FROM reservations
               WHERE asset_id = ? AND start < ? AND COALESCE(closed_at, end) > ?`,
            )
            .all(assetId, end, start) as ReservationRow[]
        ).map(toReservation);
      },
      /** Todas las reservas que solapan la ventana (para calcular disponibilidad). */
      overlapping(start: number, end: number): Reservation[] {
        return (
          db
            .prepare(
              'SELECT * FROM reservations WHERE start < ? AND COALESCE(closed_at, end) > ?',
            )
            .all(end, start) as ReservationRow[]
        ).map(toReservation);
      },
      /** Reservas abiertas (sin cerrar) de un empleado — "mis reservas". */
      openByEmployee(employeeId: string): Reservation[] {
        return (
          db
            .prepare(
              'SELECT * FROM reservations WHERE employee_id = ? AND closed_at IS NULL ORDER BY start',
            )
            .all(employeeId) as ReservationRow[]
        ).map(toReservation);
      },
      /** Todas las reservas abiertas (admin). */
      allOpen(): Reservation[] {
        return (
          db
            .prepare('SELECT * FROM reservations WHERE closed_at IS NULL ORDER BY start')
            .all() as ReservationRow[]
        ).map(toReservation);
      },
    },
  };
}

export type Repos = ReturnType<typeof createRepos>;
