-- ============================================================================
-- Análise de uso — 2ª parte: nome do botão clicado e país da sessão
-- Rodar no Supabase (SQL Editor) depois de 2026-09-usage-analytics.sql. Pode rodar mais de uma vez.
-- O rótulo é só o nome curto de botões e abas ("Novo lead"); nunca texto de tabela nem dado pessoal.
-- ============================================================================
alter table public.usage_clicks add column if not exists label text;
create index if not exists idx_usage_clicks_view_at on public.usage_clicks (view, client_slug, at desc);
notify pgrst, 'reload schema';
