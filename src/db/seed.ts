import { pathToFileURL } from 'node:url';
import { openDb } from './connection.js';
import { createRepos, type Repos } from './repos.js';

/** Datos demo: 1 admin, 2 empleados, 3 activos. Idempotente por phone/id. */
export function seed(repos: Repos): void {
  const employees = [
    { id: 'u-admin', name: 'Admin Ada', phone: '5490000000001', role: 'admin' as const },
    { id: 'u-eve', name: 'Eve López', phone: '5490000000002', role: 'employee' as const },
    { id: 'u-bob', name: 'Bob Pérez', phone: '5490000000003', role: 'employee' as const },
  ];
  const assets = [
    { id: 'a-nb1', name: 'Notebook Dell XPS', active: true },
    { id: 'a-proj', name: 'Proyector Epson', active: true },
    { id: 'a-cam', name: 'Cámara Sony A7', active: true },
  ];

  for (const e of employees) {
    if (!repos.employees.getByPhone(e.phone)) repos.employees.insert(e);
  }
  for (const a of assets) {
    if (!repos.assets.getById(a.id)) repos.assets.insert(a);
  }
}

// Ejecutable directo: `tsx src/db/seed.ts` siembra el archivo DB_PATH.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  seed(createRepos(db));
  console.log('Seed OK:', process.env.DB_PATH ?? './data.db');
}
