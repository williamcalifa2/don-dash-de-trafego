-- Marca os leads cadastrados à mão (para "Todos os leads" não contar duas vezes os que já vieram do Meta).
-- Rodar no Supabase: SQL Editor > New query > colar > Run
alter table public.leads add column if not exists manual boolean not null default false;
notify pgrst, 'reload schema';
