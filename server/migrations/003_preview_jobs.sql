-- Pregled pretrage u hibridnom režimu: server (kome KP ne daje podatke) upiše
-- zahtev, worker ga izvrši sa svoje IP adrese, sajt polluje rezultat.

create table preview_jobs (
  id         bigint generated always as identity primary key,
  params     jsonb not null,
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  result     jsonb
);
create index preview_jobs_pending_idx on preview_jobs (id) where done_at is null;
