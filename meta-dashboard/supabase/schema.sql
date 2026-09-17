-- Meta Dashboard — Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor

-- Clients
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  meta_ad_account_id text,
  currency    text not null default 'BRL',
  created_at  timestamptz not null default now()
);

-- Manual closings (fechamentos) per client per day
create table if not exists fechamentos (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  date        date not null,
  count       integer not null default 0,
  revenue     numeric(12,2) not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, date)
);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger fechamentos_updated_at
  before update on fechamentos
  for each row execute procedure set_updated_at();

-- Seed: Dal Moro client
insert into clients (name, slug, meta_ad_account_id)
values ('Dal Moro Suprimentos', 'dal-moro', 'act_4430467137184616')
on conflict (slug) do nothing;

-- Row-Level Security
alter table clients enable row level security;
alter table fechamentos enable row level security;

-- For now, allow all authenticated users (tighten later with per-client policies)
create policy "auth read clients"  on clients      for select using (auth.role() = 'authenticated');
create policy "auth read fechamentos" on fechamentos for select using (auth.role() = 'authenticated');
create policy "auth write fechamentos" on fechamentos for all using (auth.role() = 'authenticated');
