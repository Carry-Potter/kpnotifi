-- Osnovna šema: korisnici, sesije, feedovi, pretrage, viđeni oglasi, notifikacije, katalog.

create table users (
  id            bigint generated always as identity primary key,
  telegram_id   bigint not null unique,
  first_name    text not null default '',
  username      text not null default '',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table sessions (
  token       text primary key,
  user_id     bigint not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_user_idx on sessions(user_id);

-- Jedinstvena KP pretraga; više korisnika deli isti feed.
create table feeds (
  id              bigint generated always as identity primary key,
  params          jsonb not null,
  params_hash     text not null unique,
  is_seeded       boolean not null default false,
  last_checked_at timestamptz,
  last_ok_at      timestamptz,
  error_count     int not null default 0,
  paused_until    timestamptz,
  created_at      timestamptz not null default now()
);

create table searches (
  id               bigint generated always as identity primary key,
  user_id          bigint not null references users(id) on delete cascade,
  feed_id          bigint not null references feeds(id) on delete cascade,
  name             text not null,
  is_enabled       boolean not null default true,
  created_at       timestamptz not null default now(),
  last_notified_at timestamptz
);
create index searches_user_idx on searches(user_id);
create index searches_feed_idx on searches(feed_id);

create table seen_ads (
  feed_id       bigint not null references feeds(id) on delete cascade,
  ad_id         bigint not null,
  posted_at     timestamptz,
  price_number  numeric not null default 0,
  currency      text not null default '',
  first_seen_at timestamptz not null default now(),
  primary key (feed_id, ad_id)
);

create table notifications (
  id        bigint generated always as identity primary key,
  search_id bigint not null references searches(id) on delete cascade,
  ad_id     bigint not null,
  status    text not null default 'sent',
  sent_at   timestamptz not null default now(),
  unique (search_id, ad_id)
);

-- KP katalog (osvežava se periodično sa KP-a)
create table kp_categories (
  id   int primary key,
  name text not null,
  kind text not null default 'goods'
);

create table kp_groups (
  id          int primary key,
  name        text not null,
  category_id int not null
);
create index kp_groups_category_idx on kp_groups(category_id);

create table kp_locations (
  id   int primary key,
  name text not null,
  big  boolean not null default false
);

create table kp_attributes (
  category_id  int not null,
  code         text not null,
  display_name text not null,
  is_multi     boolean not null default false,
  data_type    text not null default '',
  ui_control   text not null default '',
  sort_order   int not null default 0,
  primary key (category_id, code)
);

create table catalog_meta (
  key        text primary key,
  updated_at timestamptz not null default now()
);
