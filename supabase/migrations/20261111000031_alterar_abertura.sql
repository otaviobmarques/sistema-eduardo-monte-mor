-- Data de abertura escolhida (decidido em 11/11/2026): o Gestor com conclusão livre (o “eduardo”) informa ou corrige a
-- data/hora de abertura da OS (nunca no futuro nem depois da conclusão/cancelamento). O prazo (SLA) é recalculado por ela
-- e os avisos de 24h / 2º alerta / vencida que já teriam passado ficam marcados como enviados (sem rajada de notificações).

create or replace function public.alterar_abertura(p_os uuid, p_aberta_em timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_cfg record; v_prazo timestamptz; v_fim timestamptz;
begin
  if not public.os_da_minha_loja(p_os) or not public.tenho_conclusao_livre() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if p_aberta_em is null then raise exception 'DATA_ABERTURA_INVALIDA'; end if;
  if p_aberta_em > now() + interval '5 minutes' then raise exception 'DATA_ABERTURA_FUTURA'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA'; end if;
  v_fim := coalesce(v_os.concluida_em, v_os.cancelada_em);
  if v_fim is not null and p_aberta_em > v_fim then raise exception 'DATA_ABERTURA_DEPOIS_CONCLUSAO'; end if;
  p_aberta_em := least(p_aberta_em, now());
  if p_aberta_em = v_os.aberta_em then return; end if;

  select c.alerta1_horas, c.alerta2_horas_antes into v_cfg from public.configuracoes c where c.loja_id = v_os.loja_id;
  v_prazo := p_aberta_em + make_interval(hours => v_os.sla_horas) + v_os.total_pausado;
  update public.ordens_servico
     set aberta_em = p_aberta_em, prazo_em = v_prazo,
         alerta1_enviado = case when status in ('a_vistoriar', 'frustrado')
           then now() >= p_aberta_em + v_os.total_pausado + make_interval(hours => coalesce(v_cfg.alerta1_horas, 24)) else alerta1_enviado end,
         alerta2_enviado = case when status in ('a_vistoriar', 'frustrado')
           then now() >= v_prazo - make_interval(hours => coalesce(v_cfg.alerta2_horas_antes, 8)) else alerta2_enviado end,
         vencida_notificada = case when status in ('a_vistoriar', 'frustrado') then now() > v_prazo else vencida_notificada end
   where id = p_os;
  perform public.historico(p_os, 'Abertura alterada',
    to_char(v_os.aberta_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    to_char(p_aberta_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
end $$;
revoke all on function public.alterar_abertura(uuid, timestamptz) from public, anon;
grant execute on function public.alterar_abertura(uuid, timestamptz) to authenticated;
