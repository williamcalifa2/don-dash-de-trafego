-- ============================================================================
-- Meta Dashboard — infraestrutura de sincronização segura com a Meta
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- Todas as tabelas ficam com RLS ligado e SEM políticas: só o servidor (service_role) acessa.
-- ============================================================================

-- Chaves globais (modo, pausa geral, kill switch, fase). Trocáveis sem novo deploy.
create table if not exists public.meta_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Estado por conta de anúncio (uma linha por cliente).
create table if not exists public.meta_sync_state (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  enabled          boolean not null default false,       -- flag por conta: nasce desligada (falha segura)
  paused           boolean not null default false,       -- pausa manual
  suspended        boolean not null default false,       -- suspensa após bloqueios repetidos; só libera manualmente
  blocked_until    timestamptz,                          -- circuit breaker
  block_events     timestamptz[] not null default '{}',  -- bloqueios recentes (escalonamento)
  freq_multiplier  numeric not null default 1,           -- >1 = sincroniza menos vezes
  active_ads       integer,
  last_usage       jsonb,                                -- último uso lido dos headers
  last_synced      jsonb not null default '{}'::jsonb,   -- {"insights": "...", "structure": "...", "leads": "..."}
  cursors          jsonb not null default '{}'::jsonb,   -- retomada de paginação entre ciclos
  last_error       text,
  updated_at       timestamptz not null default now()
);

-- Fila de jobs.
create table if not exists public.meta_sync_jobs (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  kind         text not null check (kind in ('insights', 'structure', 'leads')),
  status       text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'dead')),
  attempts     integer not null default 0,
  run_after    timestamptz not null default now(),
  locked_until timestamptz,
  error        text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
-- Deduplicação: no máximo 1 job pendente por conta e tipo.
create unique index if not exists meta_sync_jobs_one_pending on public.meta_sync_jobs (client_id, kind) where status = 'pending';
-- No máximo 1 job em execução por conta.
create unique index if not exists meta_sync_jobs_one_running on public.meta_sync_jobs (client_id) where status = 'running';
create index if not exists meta_sync_jobs_due on public.meta_sync_jobs (status, run_after);

-- Uso da API (auditoria e base dos tetos por hora).
create table if not exists public.meta_api_usage (
  id            bigserial primary key,
  client_id     uuid references public.clients(id) on delete set null,
  endpoint      text not null,
  status        integer,
  calls         integer not null default 1,             -- um batch conta como N chamadas
  outcome       text not null,                           -- ok | dry_run | blocked_* | rate_limit | error ...
  error_code    integer,
  call_pct      numeric,
  cputime_pct   numeric,
  time_pct      numeric,
  app_pct       numeric,
  account_pct   numeric,
  dry_run       boolean not null default false,
  origin        text not null default 'pipeline',
  created_at    timestamptz not null default now()
);
create index if not exists meta_api_usage_created on public.meta_api_usage (created_at);
create index if not exists meta_api_usage_client_created on public.meta_api_usage (client_id, created_at);

-- Cópia dos dados da Meta que o painel lê (o front nunca chama a Meta).
create table if not exists public.meta_snapshots (
  client_id  uuid not null references public.clients(id) on delete cascade,
  kind       text not null,                              -- summary | daily | ads | structure ...
  key        text not null default '',                   -- ex.: preset
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (client_id, kind, key)
);

-- Eventos do webhook de leads. Guarda só IDs (nenhum dado pessoal); a resposta ao Meta sai antes do processamento.
create table if not exists public.meta_webhook_events (
  leadgen_id   text primary key,                          -- idempotência: o mesmo lead nunca entra duas vezes
  page_id      text,
  ad_id        text,
  status       text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts     integer not null default 0,
  run_after    timestamptz not null default now(),
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists meta_webhook_events_pending on public.meta_webhook_events (status, run_after);

-- Alertas (além de enviados ao webhook, ficam registrados aqui).
create table if not exists public.meta_alerts (
  id         bigserial primary key,
  level      text not null check (level in ('info', 'warning', 'critical')),
  kind       text not null,
  client_id  uuid references public.clients(id) on delete set null,
  message    text not null,
  data       jsonb,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists meta_alerts_created on public.meta_alerts (created_at desc);

alter table public.meta_settings   enable row level security;
alter table public.meta_sync_state enable row level security;
alter table public.meta_sync_jobs  enable row level security;
alter table public.meta_api_usage  enable row level security;
alter table public.meta_snapshots  enable row level security;
alter table public.meta_alerts     enable row level security;
alter table public.meta_webhook_events enable row level security;

notify pgrst, 'reload schema';
