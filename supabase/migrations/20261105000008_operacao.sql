-- Etapa 5 · Operação: agendamento, etapas, frustração, pendências, cancelamento e laudo

-- Notificação ligada a uma OS (o módulo notificar() do app usa a mesma tabela)
create or replace function public.notificar_os(p_os uuid, p_destinos public.notif_destino[], p_tipo text, p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; d public.notif_destino;
begin
  select id, numero, empresa_cliente_id into v from public.ordens_servico where id = p_os;
  foreach d in array p_destinos loop
    insert into public.notificacoes (destino, empresa_cliente_id, tipo, os_id, titulo, corpo, link)
    values (d, v.empresa_cliente_id, p_tipo, v.id, p_titulo, p_corpo, case d when 'loja' then '/loja/os/' else '/app/os/' end || v.numero);
  end loop;
end $$;
revoke execute on function public.notificar_os(uuid, public.notif_destino[], text, text, text) from public, anon, authenticated;

create or replace function public.historico(p_os uuid, p_evento text, p_de text, p_para text)
returns void language sql security definer set search_path = '' as $$
  insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
  values (p_os, p_evento, p_de, p_para, auth.uid(), coalesce(public.meu_nome(), 'Sistema'));
$$;
revoke execute on function public.historico(uuid, text, text, text) from public, anon, authenticated;

-- ───────── Agendamento (nova versão a cada reagendamento)
create or replace function public.agendar_os(p_os uuid, p_data_hora timestamptz, p_local text, p_vistoriador uuid, p_motivo uuid, p_motivo_texto text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_os record; v_versao int; v_vist text; v_mot text;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status <> 'a_vistoriar' then raise exception 'OS_NAO_ABERTA'; end if;
  select nome into v_vist from public.vistoriadores where id = p_vistoriador and ativo;
  if v_vist is null then raise exception 'VISTORIADOR_INVALIDO'; end if;
  select coalesce(max(versao), 0) + 1 into v_versao from public.os_agendamentos where os_id = p_os;
  if v_versao > 1 then
    select descricao into v_mot from public.motivos where id = p_motivo and tipo = 'reagendamento';
    if v_mot is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  end if;
  update public.os_agendamentos set atual = false where os_id = p_os and atual;
  insert into public.os_agendamentos (os_id, versao, data_hora, local_texto, vistoriador_id, motivo_id, motivo_texto, atual, criado_por)
  values (p_os, v_versao, p_data_hora, nullif(trim(p_local), ''), p_vistoriador, case when v_versao > 1 then p_motivo end, nullif(trim(p_motivo_texto), ''), true, auth.uid());
  update public.ordens_servico set vistoriador_id = p_vistoriador,
         etapa = case when etapa = 'aberta' then 'agendada'::public.os_etapa else etapa end
   where id = p_os;
  perform public.historico(p_os, case when v_versao > 1 then 'Reagendada' else 'Agendada' end,
    case when v_versao > 1 then v_mot end,
    to_char(p_data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' · ' || v_vist);
  return v_versao;
end $$;

create or replace function public.alterar_etapa(p_os uuid, p_etapa public.os_etapa)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  update public.ordens_servico set etapa = p_etapa where id = p_os and status = 'a_vistoriar';
  if not found then raise exception 'OS_NAO_ABERTA'; end if;
end $$;

-- ───────── Pendências e frustração
create or replace function public.tipo_pendencia_do_motivo(p_desc text) returns public.pendencia_tipo
language sql immutable set search_path = '' as $$
  select case
    when public.normalizar_texto(p_desc) like '%localiz%' then 'nao_localizado'
    when public.normalizar_texto(p_desc) like '%autoriz%' then 'falta_autorizacao'
    when public.normalizar_texto(p_desc) like '%document%' then 'documental'
    when public.normalizar_texto(p_desc) like '%agend%' then 'agendamento'
    else 'outra' end::public.pendencia_tipo
$$;

create or replace function public.abrir_pendencia(p_os uuid, p_tipo public.pendencia_tipo, p_descricao text, p_responsavel public.responsavel_tipo, p_previsao date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_os record; v_id uuid;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status not in ('a_vistoriar', 'frustrado') then raise exception 'OS_NAO_ABERTA'; end if;
  if coalesce(trim(p_descricao), '') = '' then raise exception 'DESCRICAO_OBRIGATORIA'; end if;
  insert into public.pendencias (os_id, tipo, descricao, responsavel, previsao, criado_por)
  values (p_os, p_tipo, trim(p_descricao), p_responsavel, p_previsao, auth.uid()) returning id into v_id;
  perform public.sla_abrir_pausa(p_os, 'pendencia', v_id);
  perform public.historico(p_os, 'Pendência aberta', null, trim(p_descricao) || ' · com ' || case p_responsavel when 'cliente' then 'o cliente' else 'a Loja' end);
  perform public.notificar_os(p_os, array['loja','cliente']::public.notif_destino[], 'pendencia',
    'Pendência · ' || v_os.placa, trim(p_descricao) || case when p_responsavel = 'cliente' then ' (aguarda o cliente)' else '' end);
  return v_id;
end $$;

create or replace function public.frustrar_os(p_os uuid, p_motivo uuid, p_ocorrida_em timestamptz, p_descricao text,
  p_responsavel public.responsavel_tipo, p_previsao date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_os record; v_mot text; v_pend uuid;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status <> 'a_vistoriar' then raise exception 'OS_NAO_ABERTA'; end if;
  select descricao into v_mot from public.motivos where id = p_motivo and tipo = 'frustracao' and ativo;
  if v_mot is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  if coalesce(trim(p_descricao), '') = '' then raise exception 'DESCRICAO_OBRIGATORIA'; end if;
  if p_ocorrida_em is null or p_ocorrida_em > now() + interval '5 minutes' then raise exception 'DATA_INVALIDA'; end if;
  if p_previsao is null then raise exception 'PREVISAO_OBRIGATORIA'; end if;

  insert into public.pendencias (os_id, tipo, descricao, responsavel, previsao, criado_por)
  values (p_os, public.tipo_pendencia_do_motivo(v_mot), v_mot || ': ' || trim(p_descricao), p_responsavel, p_previsao, auth.uid())
  returning id into v_pend;
  insert into public.os_frustracoes (os_id, motivo_id, descricao, ocorrida_em, pendencia_id, criado_por)
  values (p_os, p_motivo, trim(p_descricao), p_ocorrida_em, v_pend, auth.uid());
  update public.ordens_servico set status = 'frustrado' where id = p_os;
  perform public.sla_abrir_pausa(p_os, 'frustracao', v_pend);
  perform public.historico(p_os, 'Frustrada', v_mot, trim(p_descricao));
  perform public.notificar_os(p_os, array['loja','cliente']::public.notif_destino[], 'frustrado',
    'Frustrada · ' || v_os.placa, v_mot || '. ' || trim(p_descricao));
  return v_pend;
end $$;

create or replace function public.resolver_pendencia(p_pendencia uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p record; v_os record;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'TEXTO_OBRIGATORIO'; end if;
  select * into v_p from public.pendencias where id = p_pendencia for update;
  if not found or v_p.resolvida_em is not null then raise exception 'PENDENCIA_RESOLVIDA'; end if;
  update public.pendencias set resolvida_em = now(), resolucao_texto = trim(p_texto) where id = p_pendencia;
  perform public.sla_fechar_pausa(v_p.os_id, p_pendencia);
  select * into v_os from public.ordens_servico where id = v_p.os_id for update;
  -- Frustrada volta para A vistoriar (na etapa em que estava) quando não sobra pendência de frustração aberta
  if v_os.status = 'frustrado' and not exists (
      select 1 from public.os_frustracoes f join public.pendencias p on p.id = f.pendencia_id
       where f.os_id = v_os.id and p.resolvida_em is null) then
    update public.ordens_servico set status = 'a_vistoriar', etapa = coalesce(etapa, 'aberta') where id = v_os.id;
  end if;
  perform public.historico(v_p.os_id, 'Pendência resolvida', v_p.descricao, trim(p_texto));
  perform public.notificar_os(v_p.os_id, array['cliente']::public.notif_destino[], 'pendencia_resolvida',
    'Pendência resolvida · ' || v_os.placa, trim(p_texto));
end $$;

create or replace function public.responder_pendencia(p_pendencia uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p record; v_os record;
begin
  if coalesce(trim(p_texto), '') = '' then raise exception 'TEXTO_OBRIGATORIO'; end if;
  select p.* into v_p from public.pendencias p where p.id = p_pendencia for update;
  if not found or v_p.resolvida_em is not null then raise exception 'PENDENCIA_RESOLVIDA'; end if;
  select * into v_os from public.ordens_servico where id = v_p.os_id;
  if not public.is_loja() and (v_os.empresa_cliente_id is distinct from public.minha_empresa() or v_p.responsavel <> 'cliente') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  update public.pendencias set resposta_cliente = trim(p_texto), respondida_em = now() where id = p_pendencia;
  perform public.historico(v_p.os_id, 'Cliente respondeu a pendência', null, trim(p_texto));
  perform public.notificar_os(v_p.os_id, array['loja']::public.notif_destino[], 'pendencia_respondida',
    'Resposta do cliente · ' || v_os.placa, trim(p_texto));
end $$;

-- ───────── Cancelamento (cliente ou Loja)
create or replace function public.cancelar_os(p_os uuid, p_nome text, p_motivo uuid, p_descricao text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_mot text;
begin
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA'; end if;
  if not public.is_loja() and v_os.empresa_cliente_id is distinct from public.minha_empresa() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_os.status not in ('a_vistoriar', 'frustrado') then raise exception 'OS_NAO_ABERTA'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'SOLICITANTE_OBRIGATORIO'; end if;
  if coalesce(trim(p_descricao), '') = '' then raise exception 'DESCRICAO_OBRIGATORIA'; end if;
  select descricao into v_mot from public.motivos where id = p_motivo and tipo = 'cancelamento' and ativo;
  if v_mot is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  insert into public.os_cancelamentos (os_id, solicitado_por_nome, solicitado_por_user, motivo_id, descricao)
  values (p_os, trim(p_nome), auth.uid(), p_motivo, trim(p_descricao));
  -- Encerra o SLA: fecha pausas e pendências abertas
  update public.sla_pausas set fim = now() where os_id = p_os and fim is null;
  update public.pendencias set resolvida_em = now(), resolucao_texto = 'OS cancelada' where os_id = p_os and resolvida_em is null;
  update public.ordens_servico set status = 'cancelado', cancelada_em = now(),
         total_pausado = total_pausado + coalesce(now() - pausado_desde, interval '0'), pausado_desde = null
   where id = p_os;
  perform public.historico(p_os, 'Cancelada', v_mot, 'Pedido por ' || trim(p_nome) || ': ' || trim(p_descricao));
  perform public.notificar_os(p_os, array['loja','cliente']::public.notif_destino[], 'cancelado',
    'Cancelada · ' || v_os.placa, v_mot || ' · pedido por ' || trim(p_nome));
end $$;

-- ───────── Laudo (PDF com versões). O arquivo já foi enviado ao bucket privado 'laudos'.
create or replace function public.registrar_laudo(p_os uuid, p_versao int, p_path text, p_nome text, p_tamanho bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_prox int;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status not in ('a_vistoriar', 'vistoriado') then raise exception 'OS_NAO_PERMITE_LAUDO'; end if;
  select coalesce(max(versao), 0) + 1 into v_prox from public.anexos where os_id = p_os and tipo = 'laudo';
  if p_versao <> v_prox then raise exception 'VERSAO_CONFLITO'; end if;
  if p_path <> v_os.empresa_cliente_id::text || '/' || p_os::text || '/v' || p_versao || '.pdf' then raise exception 'CAMINHO_INVALIDO'; end if;
  if v_os.status = 'a_vistoriar' and exists (select 1 from public.pendencias where os_id = p_os and resolvida_em is null) then
    raise exception 'PENDENCIA_ABERTA';
  end if;

  update public.anexos set atual = false where os_id = p_os and tipo = 'laudo' and atual;
  insert into public.anexos (os_id, tipo, bucket, storage_path, nome_arquivo, tamanho_bytes, versao, atual, enviado_por)
  values (p_os, 'laudo', 'laudos', p_path, p_nome, p_tamanho, p_versao, true, auth.uid());

  if v_os.status = 'a_vistoriar' then
    -- Conclui: a trava de justificativa (tg_exigir_justificativa) roda neste update
    update public.ordens_servico
       set status = 'vistoriado', concluida_em = now(), etapa = null,
           valor_final = valor_base + valor_deslocamento + valor_ajuste
     where id = p_os;
    perform public.historico(p_os, 'Laudo enviado · OS concluída', null, p_nome);
    perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'vistoriado',
      'Laudo disponível · ' || v_os.placa, 'A vistoria da OS ' || v_os.numero || ' foi concluída.');
  else
    perform public.historico(p_os, 'Nova versão do laudo', 'v' || (p_versao - 1), 'v' || p_versao || ' · ' || p_nome);
    perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'laudo_atualizado',
      'Laudo atualizado · ' || v_os.placa, 'Versão ' || p_versao || ' do laudo da OS ' || v_os.numero || '.');
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'agendar_os(uuid,timestamptz,text,uuid,uuid,text)', 'alterar_etapa(uuid,public.os_etapa)',
    'abrir_pendencia(uuid,public.pendencia_tipo,text,public.responsavel_tipo,date)',
    'frustrar_os(uuid,uuid,timestamptz,text,public.responsavel_tipo,date)', 'resolver_pendencia(uuid,text)',
    'responder_pendencia(uuid,text)', 'cancelar_os(uuid,text,uuid,text)', 'registrar_laudo(uuid,int,text,text,bigint)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
