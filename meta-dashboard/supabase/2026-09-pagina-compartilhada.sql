-- Permite a mesma Página do Facebook em mais de um cliente (ex.: um cliente com duas contas de anúncios e uma Página só).
-- O índice único vira comum: continua rápido para achar o cliente pela Página, mas não bloqueia repetição.
-- Com a Página repetida, o lead do webhook é atribuído pela conta de anúncios do anúncio (ver clientIdForLead).
drop index if exists public.clients_page_id_idx;
create index if not exists clients_page_id_idx on public.clients (page_id) where page_id is not null;

notify pgrst, 'reload schema';
