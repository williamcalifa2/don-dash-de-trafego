-- ============================================================================
-- Meta Dashboard — Carrinhos abandonados (webhooks checkouts/* da Shopify)
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- ============================================================================
create table if not exists public.ecommerce_checkouts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  platform        text not null default 'shopify',
  external_id     text not null,
  token           text,
  customer_name   text,
  customer_email  text,
  customer_phone  text,
  total           numeric(12,2) not null default 0,
  currency        text not null default 'BRL',
  items           jsonb default '[]'::jsonb,
  recover_url     text,
  utm_source      text,
  utm_campaign    text,
  utm_medium      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  unique (client_id, platform, external_id)
);
create index if not exists idx_checkouts_client_updated on public.ecommerce_checkouts (client_id, updated_at desc);
alter table public.ecommerce_checkouts enable row level security;
notify pgrst, 'reload schema';
