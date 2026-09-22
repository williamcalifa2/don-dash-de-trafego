-- ============================================================================
-- Meta Dashboard — notas, motivo de perda e último contato nos leads
-- Rodar no Supabase: SQL Editor > New query > colar > Run
-- ============================================================================

-- PARTE 1 — segura e obrigatória. Pode rodar agora.
alter table public.leads
  add column if not exists notas          text,
  add column if not exists motivo_perda   text,
  add column if not exists ultimo_contato timestamptz;

create index if not exists leads_client_created_idx
  on public.leads (client_id, created_at desc);

-- Faz a API do Supabase enxergar as colunas novas na hora.
notify pgrst, 'reload schema';

-- ============================================================================
-- PARTE 2 — TRAVA DE ACESSO AO BANCO (só depois de fazer os passos abaixo)
--
-- O painel agora lê e grava leads pelo servidor (/api/leads). Para o banco não
-- ficar aberto a quem tiver a chave pública, é preciso bloquear o acesso
-- anônimo. Ordem obrigatória:
--   1. No Vercel (Settings > Environment Variables), adicione
--      SUPABASE_SERVICE_ROLE_KEY com a chave "service_role" do Supabase
--      (Project Settings > API). Nunca cole essa chave em chat ou no código.
--   2. Faça um redeploy no Vercel.
--   3. Confirme que o painel e o webhook de leads continuam funcionando.
--   4. Só então rode o bloco abaixo.
-- Se rodar antes do passo 1, o painel e o webhook param de gravar/ler leads.
-- ============================================================================

-- do $$
-- declare r record;
-- begin
--   for r in
--     select policyname, tablename from pg_policies
--     where schemaname = 'public' and tablename in ('leads', 'clients', 'fechamentos')
--   loop
--     execute format('drop policy %I on public.%I', r.policyname, r.tablename);
--   end loop;
-- end $$;
--
-- alter table public.leads       enable row level security;
-- alter table public.clients     enable row level security;
-- alter table public.fechamentos enable row level security;
