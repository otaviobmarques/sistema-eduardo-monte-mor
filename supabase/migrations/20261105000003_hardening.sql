-- Endurecimento (avisos do Supabase Advisor)
create schema if not exists extensions;
alter extension unaccent set schema extensions;
alter extension pg_trgm set schema extensions;

create or replace function public.normalizar_texto(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(extensions.unaccent(coalesce(t,''))), '[^a-z0-9]+', ' ', 'g')
$$;

alter function public.tg_set_updated_at() set search_path = '';

-- Funções internas: ninguém chama pela API
revoke execute on function public.tg_auditoria() from public, anon, authenticated;
revoke execute on function public.tg_historico_os() from public, anon, authenticated;
-- Helpers de RLS: só usuários autenticados
revoke execute on function public.is_loja() from public, anon;
revoke execute on function public.meu_perfil() from public, anon;
revoke execute on function public.minha_empresa() from public, anon;
revoke execute on function public.meu_nome() from public, anon;
revoke execute on function public.os_visivel(uuid) from public, anon;
grant execute on function public.is_loja(), public.meu_perfil(), public.minha_empresa(), public.meu_nome(), public.os_visivel(uuid) to authenticated;
