-- ============================================================================
-- Gestores de tráfego: quem cuida de cada cliente e tudo o que é feito nas contas.
-- Rodar no Supabase: SQL Editor > New query > colar > Run. Pode rodar mais de uma vez.
-- ============================================================================

-- Gestores cadastrados na aba Equipe.
create table if not exists public.traffic_managers (
  id              text primary key,             -- identificador curto gerado do nome
  name            text not null,
  email           text,                         -- login do painel: ações feitas no app por essa pessoa contam para ela
  meta_actor_id   text,                         -- usuário da Meta que aparece como autor no histórico de alterações
  meta_actor_name text,
  created_at      timestamptz not null default now()
);

-- Cliente -> gestor (um gestor por cliente).
create table if not exists public.manager_clients (
  client_slug text primary key,
  manager_id  text not null references public.traffic_managers(id) on delete cascade,
  assigned_at timestamptz not null default now()
);

-- Histórico de tudo que é feito nas contas: ações no painel (source = app) e alterações feitas na Meta (source = meta).
-- manager_id guarda o gestor da conta NA HORA, então trocar o gestor depois não reescreve o passado.
create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null,
  source      text not null,                    -- app | meta
  client_slug text not null,
  manager_id  text,
  actor_key   text,                             -- e-mail (app) ou 'meta:<id>'
  actor_name  text,
  kind        text not null,                    -- status | budget | audience | creative | bid | structure | lead | report | config | access | sync | client | other
  event_type  text,                             -- tipo original da Meta
  object_type text,
  object_name text,
  summary     text not null,
  detail      jsonb,                            -- ex.: { "from": "Ativa", "to": "Inativa" }
  ext_id      text unique                       -- evita gravar duas vezes o mesmo evento da Meta
);
create index if not exists idx_activity_manager on public.activity_log (manager_id, at desc);
create index if not exists idx_activity_client on public.activity_log (client_slug, at desc);
create index if not exists idx_activity_actor on public.activity_log (actor_key, at desc);

-- Até onde o histórico da Meta de cada cliente já foi lido.
create table if not exists public.activity_sync (
  client_slug    text primary key,
  synced_through timestamptz,
  last_run       timestamptz,
  last_error     text
);

alter table public.traffic_managers enable row level security;
alter table public.manager_clients enable row level security;
alter table public.activity_log enable row level security;
alter table public.activity_sync enable row level security;

notify pgrst, 'reload schema';
