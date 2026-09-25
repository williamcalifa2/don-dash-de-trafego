-- ============================================================================
-- Gestores de tráfego — 2ª parte: foto do gestor
-- Rodar no Supabase (SQL Editor) depois de 2026-09-gestores.sql. Pode rodar mais de uma vez.
-- ============================================================================
alter table public.traffic_managers add column if not exists avatar text;   -- imagem pequena em data URL (até ~200 kB)
notify pgrst, 'reload schema';
