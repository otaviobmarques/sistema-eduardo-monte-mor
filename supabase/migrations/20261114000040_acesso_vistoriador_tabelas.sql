alter table public.vistoriadores add column if not exists telefone text;
alter table public.perfis_usuario add column if not exists vistoriador_id uuid unique references public.vistoriadores(id) on delete cascade;

alter table public.perfis_usuario drop constraint if exists perfis_usuario_check;
alter table public.perfis_usuario add constraint perfis_usuario_check check (
  (perfil = 'admin' and loja_id is null and empresa_cliente_id is null and vistoriador_id is null)
  or (perfil = 'loja' and loja_id is not null and empresa_cliente_id is null and vistoriador_id is null)
  or (perfil = 'cliente' and loja_id is not null and empresa_cliente_id is not null and vistoriador_id is null)
  or (perfil = 'vistoriador' and loja_id is not null and empresa_cliente_id is null and vistoriador_id is not null));

-- Vistorias do vistoriador logado: em andamento designadas/agendadas para ele + concluídas nos últimos 7 dias
create or replace function public.minhas_vistorias()
returns table (os_id uuid, numero bigint, placa text, marca_modelo text, ano text, cor text, status text, etapa text,
               agendada_para timestamptz, local_agendado text, patio text, endereco text, cidade text, uf text,
               cliente text, unidade text, observacao text, prazo_em timestamptz, concluida_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_vist uuid; v_loja uuid;
begin
  select p.vistoriador_id, public.minha_loja() into v_vist, v_loja
    from public.perfis_usuario p join public.vistoriadores vi on vi.id = p.vistoriador_id
   where p.user_id = auth.uid() and p.perfil = 'vistoriador' and not p.bloqueado and vi.ativo;
  if v_vist is null or v_loja is null then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  return query
  select o.id, o.numero, o.placa, o.marca_modelo, o.ano, o.cor, o.status::text, o.etapa::text,
         ag.data_hora, ag.local_texto, pt.nome, o.endereco, o.cidade, o.uf,
         coalesce(e.nome_fantasia, e.razao_social), o.unidade, o.observacao, o.prazo_em, o.concluida_em
    from public.ordens_servico o
    left join public.os_agendamentos ag on ag.os_id = o.id and ag.atual
    left join public.patios pt on pt.id = o.patio_id
    left join public.empresas_clientes e on e.id = o.empresa_cliente_id
   where o.loja_id = v_loja
     and (o.vistoriador_id = v_vist or ag.vistoriador_id = v_vist)
     and (o.status in ('a_vistoriar', 'frustrado') or (o.status = 'vistoriado' and o.concluida_em > now() - interval '7 days'))
   order by (o.status = 'vistoriado'), ag.data_hora nulls last, o.prazo_em;
end $$;
revoke execute on function public.minhas_vistorias() from public, anon;
grant execute on function public.minhas_vistorias() to authenticated;
