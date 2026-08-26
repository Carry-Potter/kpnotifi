-- Kodovi za povezivanje: gost napravi pretragu na sajtu bez prijave, dobije
-- t.me/bot?start=KOD; bot na /start KOD poveže nalog, aktivira pretragu i
-- ostavi session token koji sajt pokupi poll-ovanjem.

create table link_codes (
  code          text primary key,
  name          text not null,
  params        jsonb not null,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  session_token text
);
