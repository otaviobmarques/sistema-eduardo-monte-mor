-- Melhorias de 09/11/2026:
-- 1) Reabrir OS (vistoriada ou cancelada) e 2) Pausar/Retomar o prazo à mão: só o Gestor com conclusão livre (o “eduardo”).
-- 3) Cor de cada status escolhida pela Loja (amarelo, roxo, vermelho, verde ou azul).

alter type public.pausa_origem add value if not exists 'manual';

alter table public.configuracoes
  add column if not exists cores_status jsonb not null
  default '{"a_vistoriar":"azul","frustrado":"amarelo","vistoriado":"verde","cancelado":"vermelho"}'::jsonb;
comment on column public.configuracoes.cores_status is 'Cor de cada status (amarelo, roxo, vermelho, verde, azul)';

-- Reabre a OS: volta para A vistoriar (etapa Aberta). O tempo em que ficou encerrada não conta no prazo.
create or replace function public.reabrir_os(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_fim timestamptz; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not public.os_da_minha_loja(p_os) or not public.tenho_conclusao_livre() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status not in ('vistoriado', 'cancelado') then raise exception 'OS_NAO_ENCERRADA'; end if;
  v_fim := coalesce(case when v_os.status = 'vistoriado' then v_os.concluida_em else v_os.cancelada_em end, now());
  update public.ordens_servico
     set status = 'a_vistoriar', etapa = 'aberta', concluida_em = null, cancelada_em = null, valor_final = null,
         sem_laudo = false, sem_laudo_motivo = null, sem_laudo_por = null,
         total_pausado = total_pausado + greatest(now() - v_fim, interval '0'),
         prazo_em = aberta_em + make_interval(hours => sla_horas) + total_pausado + greatest(now() - v_fim, interval '0')
   where id = p_os;
  perform public.historico(p_os, 'OS reaberta', case when v_os.status = 'vistoriado' then 'Vistoriado' else 'Cancelado' end, coalesce(v_motivo, 'A vistoriar'));
  perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'reaberta',
    'OS reaberta · ' || v_os.placa, 'A OS ' || v_os.numero || ' voltou para “A vistoriar”.' || coalesce(' ' || v_motivo, ''));
end $$;
revoke all on function public.reabrir_os(uuid, text) from public, anon;
grant execute on function public.reabrir_os(uuid, text) to authenticated;

-- Pausa manual: o prazo para de contar até “Retomar”.
create or replace function public.pausar_os(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not public.os_da_minha_loja(p_os) or not public.tenho_conclusao_livre() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status not in ('a_vistoriar', 'frustrado') then raise exception 'OS_ENCERRADA'; end if;
  if exists (select 1 from public.sla_pausas where os_id = p_os and origem = 'manual' and fim is null) then raise exception 'JA_PAUSADA'; end if;
  perform public.sla_abrir_pausa(p_os, 'manual', null);
  perform public.historico(p_os, 'Prazo pausado', null, coalesce(v_motivo, 'Pausa manual'));
end $$;
revoke all on function public.pausar_os(uuid, text) from public, anon;
grant execute on function public.pausar_os(uuid, text) to authenticated;

create or replace function public.retomar_os(p_os uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_desde timestamptz;
begin
  if not public.os_da_minha_loja(p_os) or not public.tenho_conclusao_livre() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  perform 1 from public.ordens_servico where id = p_os for update;
  if not exists (select 1 from public.sla_pausas where os_id = p_os and origem = 'manual' and fim is null) then raise exception 'NAO_PAUSADA'; end if;
  update public.sla_pausas set fim = now() where os_id = p_os and origem = 'manual' and fim is null;
  -- Sem outra pausa aberta (pendência/frustração), o relógio volta a correr
  if not exists (select 1 from public.sla_pausas where os_id = p_os and fim is null) then
    select pausado_desde into v_desde from public.ordens_servico where id = p_os;
    if v_desde is not null then
      update public.ordens_servico
         set total_pausado = total_pausado + (now() - v_desde), pausado_desde = null,
             prazo_em = aberta_em + make_interval(hours => sla_horas) + total_pausado + (now() - v_desde)
       where id = p_os;
    end if;
  end if;
  perform public.historico(p_os, 'Prazo retomado', null, null);
end $$;
revoke all on function public.retomar_os(uuid) from public, anon;
grant execute on function public.retomar_os(uuid) to authenticated;
