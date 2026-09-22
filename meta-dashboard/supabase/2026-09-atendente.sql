-- Quem atendeu o lead (controle do time). Rodar no Supabase: SQL Editor > New query > colar > Run
alter table public.leads add column if not exists atendido_por text;
notify pgrst, 'reload schema';
