-- ============================================================================
-- Meta Dashboard — Webhooks de E-commerce (Shopify, Nuvemshop), CRM e SLA
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- ============================================================================

-- 1. Tabela de pedidos de E-commerce (Shopify, Nuvemshop, Woo, etc.)
create table if not exists public.ecommerce_orders (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  platform        text not null, -- 'shopify' | 'nuvemshop' | 'woocommerce' | 'custom'
  external_id     text not null, -- ID do pedido no e-commerce
  order_number    text,          -- Ex: '#1042'
  status          text not null default 'pending', -- 'pending' | 'paid' | 'cancelled' | 'refunded'
  total           numeric(12,2) not null default 0,
  subtotal        numeric(12,2),
  currency        text not null default 'BRL',
  customer_name   text,
  customer_email  text,
  customer_phone  text,
  items           jsonb default '[]'::jsonb,
  utm_source      text,
  utm_campaign    text,
  utm_medium      text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  raw_payload     jsonb,
  unique (client_id, platform, external_id)
);

create index if not exists idx_orders_client_paid on public.ecommerce_orders (client_id, paid_at desc);
create index if not exists idx_orders_client_status on public.ecommerce_orders (client_id, status);
create index if not exists idx_orders_client_created on public.ecommerce_orders (client_id, created_at desc);

-- 2. Colunas de SLA e Origem na tabela de leads
alter table public.leads
  add column if not exists origem text default 'meta',
  add column if not exists primeiro_contato timestamptz,
  add column if not exists tempo_primeiro_contato_seg integer,
  add column if not exists sla_violado boolean default false;

create index if not exists idx_leads_sla on public.leads (client_id, sla_violado, created_at desc);

-- 3. Habilita RLS de segurança (acesso restrito pelo backend via service_role)
alter table public.ecommerce_orders enable row level security;

-- Recarrega o cache do PostgREST imediatamente
notify pgrst, 'reload schema';

