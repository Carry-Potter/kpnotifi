import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL nije podešen. Vidi .env.example.');
  process.exit(1);
}

export const sql = postgres(url, {
  max: 5,
  // Neon i slični zahtevaju TLS; lokalni docker Postgres ne koristi ssl.
  ssl: url.includes('sslmode=require') ? 'require' : false,
  onnotice: () => {},
});

export type Sql = typeof sql;
