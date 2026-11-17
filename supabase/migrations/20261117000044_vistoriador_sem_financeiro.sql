-- Vistoriador não vê nada financeiro (decidido em 17/11/2026): sai a opção “valor” e minhas_vistorias() deixa de ter a coluna.
update public.vistoriadores set permissoes = permissoes - 'valor';
alter table public.vistoriadores alter column permissoes set default
  '{"cliente":true,"observacao":true,"local":true,"concluidas":true,"prazo":false,"solicitante":false,"renavam":false,"todas":false}'::jsonb;

drop function if exists public.minhas_vistorias();
create function public.minhas_vistorias()
returns table (os_id uuid, numero bigint, placa text, marca_modelo text, ano text, cor text, status text, etapa text,
               agendada_para timestamptz, local_agendado text, patio text, endereco text, cidade text, uf text,
               cliente text, unidade text, observacao text, prazo_em timestamptz, concluida_em timestamptz,
               renavam text, solicitante text, telefone text, minha boolean, vistoriador text)
language plpgsql stable security definer set search_path = '' as $$
declare v_vist uuid; v_loja uuid; v_p jsonb;
begin
  select p.vistoriador_id, public.minha_loja(), vi.permissoes into v_vist, v_loja, v_p
    from public.perfis_usuario p join public.vistoriadores vi on vi.id = p.vistoriador_id
   where p.user_id = auth.uid() and p.perfil = 'vistoriador' and not p.bloqueado and vi.ativo;
  if v_vist is null or v_loja is null then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  return query
  select o.id, o.numero, o.placa, o.marca_modelo, o.ano, o.cor, o.status::text, o.etapa::text,
         ag.data_hora, ag.local_texto,
         case when (v_p->>'local')::boolean then pt.nome end,
         case when (v_p->>'local')::boolean then o.endereco end,
         case when (v_p->>'local')::boolean then o.cidade end,
         case when (v_p->>'local')::boolean then o.uf end,
         case when (v_p->>'cliente')::boolean then coalesce(e.nome_fantasia, e.razao_social) end,
         case when (v_p->>'cliente')::boolean then o.unidade end,
         case when (v_p->>'observacao')::boolean then o.observacao end,
         case when (v_p->>'prazo')::boolean then o.prazo_em end,
         o.concluida_em,
         case when (v_p->>'renavam')::boolean then o.renavam end,
         case when (v_p->>'solicitante')::boolean then o.nome_solicitante end,
         case when (v_p->>'solicitante')::boolean then o.telefone_contato end,
         (o.vistoriador_id = v_vist or ag.vistoriador_id = v_vist),
         vo.nome
    from public.ordens_servico o
    left join public.os_agendamentos ag on ag.os_id = o.id and ag.atual
    left join public.patios pt on pt.id = o.patio_id
    left join public.empresas_clientes e on e.id = o.empresa_cliente_id
    left join public.vistoriadores vo on vo.id = coalesce(ag.vistoriador_id, o.vistoriador_id)
   where o.loja_id = v_loja
     and (
       ((o.vistoriador_id = v_vist or ag.vistoriador_id = v_vist)
         and (o.status in ('a_vistoriar', 'frustrado')
              or ((v_p->>'concluidas')::boolean and o.status = 'vistoriado' and o.concluida_em > now() - interval '7 days')))
       or ((v_p->>'todas')::boolean and o.status in ('a_vistoriar', 'frustrado'))
     )
   order by (o.status = 'vistoriado'), ag.data_hora nulls last, o.prazo_em;
end $$;
revoke execute on function public.minhas_vistorias() from public, anon;
grant execute on function public.minhas_vistorias() to authenticated;
