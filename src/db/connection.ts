import Database from 'better-sqlite3';
import { migrate } from './schema.js';

/** Abre (o crea) la DB, aplica pragmas y el schema. Usar ':memory:' en tests. */
export function openDb(path = process.env.DB_PATH ?? './data.db'): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
