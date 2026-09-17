-- Run in Supabase SQL Editor

create table if not exists metrics_cache (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table metrics_cache enable row level security;

-- Public read so client can subscribe via Realtime
create policy "public read metrics_cache"
  on metrics_cache for select using (true);

-- Only service role can write (API route uses anon key via RLS bypass — use service key server-side)
-- For now allow anon insert/update (tighten with service key later)
create policy "anon upsert metrics_cache"
  on metrics_cache for all using (true);

-- Enable Realtime on this table
alter publication supabase_realtime add table metrics_cache;
