import type Database from 'better-sqlite3';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role  TEXT NOT NULL CHECK (role IN ('employee','admin'))
);

CREATE TABLE IF NOT EXISTS assets (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE IF NOT EXISTS reservations (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT NOT NULL REFERENCES assets(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  start       INTEGER NOT NULL,
  end         INTEGER NOT NULL,
  closed_at   INTEGER,
  closed_by   TEXT REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_reservations_asset ON reservations(asset_id);
CREATE INDEX IF NOT EXISTS idx_reservations_employee ON reservations(employee_id);
`;

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA);
}
