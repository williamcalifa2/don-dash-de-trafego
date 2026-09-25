-- ============================================================================
-- Meta Dashboard — Live view da loja (pixel Shopify -> /api/track/<slug>)
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- ============================================================================

-- Uma linha por visitante (sessão). O "ping" do pixel só atualiza last_seen.
create table if not exists public.store_sessions (
  client_id   uuid not null references public.clients(id) on delete cascade,
  sid         text not null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  city        text,
  region      text,
  country     text,
  lat         numeric(8,4),
  lng         numeric(8,4),
  source      text,
  path        text,
  primary key (client_id, sid)
);
create index if not exists idx_store_sessions_seen on public.store_sessions (client_id, last_seen desc);
create index if not exists idx_store_sessions_first on public.store_sessions (client_id, first_seen desc);

-- Eventos relevantes: visita, produto visto, carrinho, checkout e compra.
create table if not exists public.store_events (
  id          bigint generated always as identity primary key,
  client_id   uuid not null references public.clients(id) on delete cascade,
  sid         text not null,
  type        text not null,
  city        text,
  region      text,
  country     text,
  lat         numeric(8,4),
  lng         numeric(8,4),
  product     text,
  value       numeric(12,2),
  path        text,
  source      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_store_events_client on public.store_events (client_id, created_at desc);

alter table public.store_sessions enable row level security;
alter table public.store_events enable row level security;

notify pgrst, 'reload schema';
