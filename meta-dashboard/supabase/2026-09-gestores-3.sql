-- ============================================================================
-- Gestores de tráfego — 3ª parte: justificativa das alterações ("por que fez isso?")
-- Rodar no Supabase (SQL Editor) depois de 2026-09-gestores.sql. Pode rodar mais de uma vez.
-- ============================================================================
alter table public.activity_log add column if not exists reason      text;          -- explicação do gestor, em texto livre
alter table public.activity_log add column if not exists reason_kind text;          -- motivo escolhido (baixo desempenho, custo alto, teste...)
alter table public.activity_log add column if not exists reasoned_at timestamptz;
alter table public.activity_log add column if not exists reasoned_by text;          -- e-mail de quem justificou
notify pgrst, 'reload schema';
