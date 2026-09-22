-- ============================================================================
-- Meta Dashboard — identificador do lead no Meta (evita duplicar na importação)
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- ============================================================================

alter table public.leads
  add column if not exists meta_lead_id text;

-- Índice único simples: vários leads sem meta_lead_id (antigos) continuam permitidos.
create unique index if not exists leads_meta_lead_id_idx on public.leads (meta_lead_id);

notify pgrst, 'reload schema';
