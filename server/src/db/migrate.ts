/**
 * Jednostavne numerisane migracije: izvrši svaki .sql iz migrations/ koji
 * još nije zabeležen u tabeli _migrations, redom po imenu.
 * Poziva se i programski pri startu servera (runMigrations).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from './index.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function runMigrations(): Promise<void> {
  await sql`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const applied = new Set(
    (await sql`select name from _migrations`).map((r) => r.name as string)
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(MIGRATIONS_DIR + file, 'utf-8');
    console.log(`migracija: ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into _migrations (name) values (${file})`;
    });
  }
}

// pokrenuto kao skripta: npm run migrate
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  await runMigrations();
  console.log('Migracije završene.');
  await sql.end();
}
