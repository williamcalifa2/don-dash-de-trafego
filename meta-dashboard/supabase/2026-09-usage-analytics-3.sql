-- ============================================================================
-- Análise de uso — 3ª parte: qualidade da experiência
-- Cliques de raiva, cliques mortos, até onde a pessoa rolou a tela, erros de tela e tempo de carregamento.
-- Rodar no Supabase (SQL Editor) depois de 2026-09-usage-analytics.sql. Pode rodar mais de uma vez.
-- Não guarda texto da tela nem o que a pessoa digita: só tela, posição, tempo e a mensagem de erro (sem e-mail nem números longos).
-- ============================================================================
create table if not exists public.usage_events (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  sid          text not null,
  user_key     text not null,
  client_slug  text not null default '',
  view         text not null,
  device       text not null,               -- desktop | tablet | mobile
  kind         text not null,               -- rage | dead | scroll | perf | error
  sel          text,                        -- elemento (rage, dead)
  rx           real,
  ry           real,
  n            integer not null default 1,  -- rage: quantos cliques seguidos
  value        real,                        -- scroll: % da página (0–100); perf: ms até a tela ficar pronta
  label        text,                        -- nome curto do botão (rage, dead)
  msg          text,                        -- erro: mensagem já sem dado pessoal
  meta         jsonb                        -- perf: nav, ttfb, lcp, cls · error: file, line
);
create index if not exists idx_usage_events_kind_at on public.usage_events (kind, at desc);
create index if not exists idx_usage_events_view on public.usage_events (view, kind, at desc);
create index if not exists idx_usage_events_sid on public.usage_events (sid);
alter table public.usage_events enable row level security;

notify pgrst, 'reload schema';
