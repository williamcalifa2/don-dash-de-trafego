-- ============================================================================
-- Meta Dashboard — Análise de uso (quem entrou, tempo por aba/cliente) e mapa de calor de cliques
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- Não guarda texto da tela, nem o que a pessoa digita: só tela, tempo e onde clicou.
-- ============================================================================

-- Entradas no sistema (login).
create table if not exists public.usage_logins (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  user_key     text not null,            -- e-mail (equipe ou cliente) ou 'cliente:<slug>' (código antigo)
  role         text not null,            -- owner | admin | member | reader | client
  client_slug  text,                     -- painel do cliente em que entrou; nulo = administração
  ok           boolean not null default true,
  country      text,
  city         text,
  device       text
);
create index if not exists idx_usage_logins_at on public.usage_logins (at desc);
create index if not exists idx_usage_logins_user on public.usage_logins (user_key, at desc);

-- Uma sessão por aba aberta. O "batimento" do navegador atualiza last_seen a cada ~15 s.
create table if not exists public.usage_sessions (
  sid          text primary key,
  user_key     text not null,
  role         text not null,
  started_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  active_sec   integer not null default 0,   -- só tempo com a aba visível e a pessoa mexendo
  last_view    text,
  last_client  text,
  device       text,
  country      text
);
create index if not exists idx_usage_sessions_seen on public.usage_sessions (last_seen desc);
create index if not exists idx_usage_sessions_user on public.usage_sessions (user_key, started_at desc);

-- Tempo ativo por tela (aba) e por cliente dentro de cada sessão.
create table if not exists public.usage_views (
  sid          text not null references public.usage_sessions(sid) on delete cascade,
  client_slug  text not null default '',     -- vazio = fora de um cliente (administração)
  view         text not null,
  seconds      integer not null default 0,
  primary key (sid, client_slug, view)
);

-- Cliques, para o mapa de calor: onde (elemento + posição dentro dele), nunca o conteúdo.
create table if not exists public.usage_clicks (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  sid          text not null,
  user_key     text not null,
  client_slug  text not null default '',
  view         text not null,
  device       text not null,                -- desktop | tablet | mobile
  sel          text not null,
  rx           real not null,
  ry           real not null,
  label        text
);
alter table public.usage_clicks add column if not exists label text;
create index if not exists idx_usage_clicks_view on public.usage_clicks (view, at desc);
create index if not exists idx_usage_clicks_user on public.usage_clicks (user_key, at desc);
create index if not exists idx_usage_clicks_view_at on public.usage_clicks (view, client_slug, at desc);

-- Soma tempo de forma atômica (evita perder segundos quando duas abas batem juntas).
create or replace function public.usage_add_time(p_sid text, p_client text, p_view text, p_delta integer)
returns void language plpgsql as $$
begin
  insert into public.usage_views (sid, client_slug, view, seconds) values (p_sid, p_client, p_view, greatest(p_delta, 0))
  on conflict (sid, client_slug, view) do update set seconds = public.usage_views.seconds + greatest(p_delta, 0);
  update public.usage_sessions set active_sec = active_sec + greatest(p_delta, 0) where sid = p_sid;
end $$;

alter table public.usage_logins enable row level security;
alter table public.usage_sessions enable row level security;
alter table public.usage_views enable row level security;
alter table public.usage_clicks enable row level security;

notify pgrst, 'reload schema';
