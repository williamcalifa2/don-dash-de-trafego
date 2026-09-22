-- ============================================================================
-- Meta Dashboard — acesso do cliente por código de 6 dígitos
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- ============================================================================

alter table public.clients
  add column if not exists access_code_hash text,                       -- hash do código (nunca o código)
  add column if not exists failed_attempts  integer not null default 0, -- erros seguidos
  add column if not exists locked_until     timestamptz;                -- bloqueio temporário após 5 erros

notify pgrst, 'reload schema';
