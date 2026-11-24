-- Placa FZZ3F95 (24/11/2026): a Loja corrige o motivo de uma pendência/frustração já registrada e o Gestor com conclusão
-- livre também reabre OS frustrada (resolve as pendências da frustração e volta para A vistoriar).

-- Alterar motivo: se a pendência veio de uma frustração, troca o motivo da frustração (lista de motivos de frustração)
-- e a descrição; se é pendência avulsa, troca tipo e descrição. Vale aberta ou já resolvida (relatórios ficam certos).
create or replace function public.alterar_motivo_pendencia(p_pendencia uuid, p_motivo uuid, p_tipo public.pendencia_tipo, p_descricao text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p record; v_f record; v_mot text; v_desc text := nullif(trim(coalesce(p_descricao, '')), ''); v_nova text;
begin
  select * into v_p from public.pendencias where id = p_pendencia for update;
  if not found then raise exception 'PENDENCIA_NAO_ENCONTRADA'; end if;
  if not public.os_da_minha_loja(v_p.os_id) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_desc is null then raise exception 'DESCRICAO_OBRIGATORIA'; end if;
  select f.* into v_f from public.os_frustracoes f where f.pendencia_id = p_pendencia for update;
  if found then
    select m.descricao into v_mot from public.motivos m join public.ordens_servico o on o.loja_id = m.loja_id
     where m.id = p_motivo and m.tipo = 'frustracao' and o.id = v_p.os_id;
    if v_mot is null then raise exception 'MOTIVO_INVALIDO'; end if;
    update public.os_frustracoes set motivo_id = p_motivo, descricao = v_desc where id = v_f.id;
    v_nova := v_mot || ': ' || v_desc;
    update public.pendencias set descricao = v_nova, tipo = public.tipo_pendencia_do_motivo(v_mot) where id = p_pendencia;
  else
    if p_tipo is null then raise exception 'TIPO_OBRIGATORIO'; end if;
    v_nova := v_desc;
    update public.pendencias set descricao = v_nova, tipo = p_tipo where id = p_pendencia;
  end if;
  -- A pausa aberta da pendência mostra o motivo novo na fila
  update public.sla_pausas set motivo = v_nova where os_id = v_p.os_id and referencia_id = p_pendencia and fim is null;
  perform public.historico(v_p.os_id, 'Motivo da pendência alterado', v_p.descricao, v_nova);
end $$;
revoke all on function public.alterar_motivo_pendencia(uuid, uuid, public.pendencia_tipo, text) from public, anon;
grant execute on function public.alterar_motivo_pendencia(uuid, uuid, public.pendencia_tipo, text) to authenticated;

-- Reabrir também OS frustrada (Gestor com conclusão livre)
create or replace function public.reabrir_os(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_fim timestamptz; v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); r record;
begin
  if not public.os_da_minha_loja(p_os) or not public.tenho_conclusao_livre() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status not in ('vistoriado', 'cancelado', 'frustrado') then raise exception 'OS_NAO_ENCERRADA'; end if;
  if v_os.status = 'frustrado' then
    for r in select p.id from public.os_frustracoes f join public.pendencias p on p.id = f.pendencia_id
              where f.os_id = p_os and p.resolvida_em is null loop
      perform public.resolver_pendencia(r.id, 'OS reaberta' || coalesce(': ' || v_motivo, ''));
    end loop;
    update public.ordens_servico set status = 'a_vistoriar', etapa = coalesce(etapa, 'aberta') where id = p_os and status = 'frustrado';
    perform public.historico(p_os, 'OS reaberta', 'Frustrado', coalesce(v_motivo, 'A vistoriar'));
    return;
  end if;
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
