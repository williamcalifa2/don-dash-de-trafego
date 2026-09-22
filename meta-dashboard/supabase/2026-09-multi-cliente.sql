-- ============================================================================
-- Meta Dashboard — acesso por token, um por cliente
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- ============================================================================

alter table public.clients
  add column if not exists display_name      text,
  add column if not exists logo_url          text,
  add column if not exists ad_account_id     text,   -- conta de anúncios do Meta, ex.: act_123456789
  add column if not exists page_id           text,   -- página do Facebook dos formulários de lead
  add column if not exists access_token_hash text;   -- SHA-256 do token do cliente (nunca o token em si)

create unique index if not exists clients_access_token_hash_idx
  on public.clients (access_token_hash) where access_token_hash is not null;
create unique index if not exists clients_page_id_idx
  on public.clients (page_id) where page_id is not null;

notify pgrst, 'reload schema';

-- Depois disto, cadastre cada cliente com o script (gera o token e o SQL):
--   node scripts/novo-cliente.mjs "Dal Moro Suprimentos" dal-moro act_XXXXXXXX ID_DA_PAGINA
