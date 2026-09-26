-- Extensão do navegador: cada vez que um gestor abre uma conta de anúncios da agência no Gerenciador da Meta.
-- Uma linha por visita (a extensão gera o id); o tempo ativo é somado a cada aviso (~30 s).
create table if not exists public.account_visits (
  visit_id     text primary key,
  user_key     text not null,                 -- e-mail de quem abriu
  client_slug  text not null,
  ad_account   text not null,                 -- act_123...
  started_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  active_sec   integer not null default 0
);
create index if not exists idx_account_visits_user on public.account_visits (user_key, last_seen desc);
create index if not exists idx_account_visits_client on public.account_visits (client_slug, last_seen desc);

create or replace function public.account_visit_beat(p_visit text, p_user text, p_slug text, p_act text, p_delta integer)
returns void language plpgsql as $$
begin
  insert into public.account_visits (visit_id, user_key, client_slug, ad_account, active_sec)
  values (p_visit, p_user, p_slug, p_act, greatest(p_delta, 0))
  on conflict (visit_id) do update
    set last_seen = now(), active_sec = public.account_visits.active_sec + greatest(p_delta, 0);
end $$;

alter table public.account_visits enable row level security;
notify pgrst, 'reload schema';
