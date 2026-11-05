-- Multi-Loja (3/3): funções de negócio passam a checar a Loja dona da OS, do cliente e dos cadastros

create or replace function public.notificar_os(p_os uuid, p_destinos public.notif_destino[], p_tipo text, p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; d public.notif_destino;
begin
  select id, numero, empresa_cliente_id, loja_id into v from public.ordens_servico where id = p_os;
  foreach d in array p_destinos loop
    insert into public.notificacoes (destino, loja_id, empresa_cliente_id, tipo, os_id, titulo, corpo, link)
    values (d, v.loja_id, v.empresa_cliente_id, p_tipo, v.id, p_titulo, p_corpo, case d when 'loja' then '/loja/os/' else '/app/os/' end || v.numero);
  end loop;
end $$;

create or replace function public.abrir_os(
  p_empresa uuid,
  p_nome_solicitante text,
  p_telefone text,
  p_placa text,
  p_renavam text,
  p_marca_modelo text,
  p_ano text,
  p_cor text,
  p_categoria_id uuid,
  p_servico_id uuid,
  p_local_tipo public.local_tipo,
  p_patio_id uuid,
  p_endereco text,
  p_cidade text,
  p_uf text,
  p_observacao text,
  p_lote_id uuid default null,
  p_aberta_em timestamptz default now()
) returns table (id uuid, numero bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_emp record;
  v_serv record;
  v_patio record;
  v_placa text := public.normalizar_placa(p_placa);
  v_renavam text := nullif(regexp_replace(coalesce(p_renavam, ''), '\D', '', 'g'), '');
  v_dup bigint;
  v_sla int;
  v_base numeric(10,2);
  v_desl numeric(10,2) := 0;
  v_cidade text := nullif(trim(p_cidade), '');
  v_uf text := upper(nullif(trim(p_uf), ''));
  v_id uuid; v_num bigint; v_loja uuid;
  -- abertura nunca no futuro nem retroativa além de 10 min (o lote usa o mesmo horário para todas as linhas)
  v_aberta timestamptz := least(greatest(coalesce(p_aberta_em, now()), now() - interval '10 minutes'), now());
begin
  if public.is_loja() then
    v_empresa := (select e.id from public.empresas_clientes e where e.id = p_empresa and e.loja_id = public.minha_loja());
  else
    v_empresa := public.minha_empresa();
  end if;
  if v_empresa is null then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;

  select * into v_emp from public.empresas_clientes e where e.id = v_empresa;
  if not found or not v_emp.ativo then raise exception 'CLIENTE_INATIVO'; end if;
  v_loja := v_emp.loja_id;

  if coalesce(trim(p_nome_solicitante), '') = '' then raise exception 'SOLICITANTE_OBRIGATORIO'; end if;
  if v_placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'PLACA_INVALIDA'; end if;
  if v_renavam is not null then
    v_renavam := lpad(v_renavam, 11, '0');
    if not public.renavam_valido(v_renavam) then raise exception 'RENAVAM_INVALIDO'; end if;
  end if;

  select * into v_serv from public.servicos s where s.id = p_servico_id and s.ativo and s.loja_id = v_loja;
  if not found then raise exception 'SERVICO_INVALIDO'; end if;

  if p_local_tipo = 'patio' then
    select * into v_patio from public.patios pt where pt.id = p_patio_id and pt.ativo and pt.loja_id = v_loja;
    if not found then raise exception 'PATIO_INVALIDO'; end if;
    v_cidade := v_patio.cidade; v_uf := v_patio.uf;
  else
    if coalesce(trim(p_endereco), '') = '' or v_cidade is null or v_uf is null then raise exception 'ENDERECO_OBRIGATORIO'; end if;
  end if;

  -- Duplicidade: mesma placa com OS a vistoriar ou frustrada do mesmo cliente
  perform pg_advisory_xact_lock(hashtext(v_empresa::text || v_placa));
  select o.numero into v_dup from public.ordens_servico o
   where o.empresa_cliente_id = v_empresa and o.placa = v_placa and o.status in ('a_vistoriar','frustrado')
   order by o.numero desc limit 1;
  if v_dup is not null then raise exception 'DUPLICADA:%', v_dup; end if;

  v_sla := least(v_serv.sla_horas, v_emp.sla_horas, 48);

  -- Preço: tabela própria do cliente (se houver valor) senão tabela padrão
  v_base := null;
  if p_categoria_id is not null then
    if v_emp.usa_tabela_propria then
      select pc.valor into v_base from public.precos_cliente pc
       where pc.empresa_cliente_id = v_empresa and pc.servico_id = p_servico_id and pc.categoria_id = p_categoria_id;
    end if;
    if v_base is null then
      select pr.valor into v_base from public.precos pr where pr.servico_id = p_servico_id and pr.categoria_id = p_categoria_id;
    end if;
  end if;
  v_base := coalesce(v_base, 0);

  if p_local_tipo = 'endereco' then
    select coalesce(t.valor, 0) into v_desl from public.taxas_deslocamento t
     where t.loja_id = v_loja and public.normalizar_texto(t.cidade) = public.normalizar_texto(v_cidade) and t.uf = v_uf;
    v_desl := coalesce(v_desl, 0);
  end if;

  -- Número da OS sequencial por Loja (a linha da Loja serializa aberturas simultâneas)
  update public.lojas lj set proximo_numero_os = lj.proximo_numero_os + 1 where lj.id = v_loja returning lj.proximo_numero_os - 1 into v_num;

  insert into public.ordens_servico (
    loja_id, numero, empresa_cliente_id, lote_id, nome_solicitante, telefone_contato, placa, renavam, marca_modelo, ano, cor,
    categoria_id, servico_id, local_tipo, patio_id, endereco, cidade, uf, observacao,
    status, etapa, sla_horas, aberta_em, prazo_em, valor_base, valor_deslocamento, created_by
  ) values (
    v_loja, v_num, v_empresa, p_lote_id, trim(p_nome_solicitante), nullif(regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'), ''),
    v_placa, v_renavam, nullif(trim(p_marca_modelo), ''), nullif(trim(p_ano), ''), nullif(trim(p_cor), ''),
    p_categoria_id, p_servico_id, p_local_tipo, case when p_local_tipo = 'patio' then p_patio_id end,
    case when p_local_tipo = 'endereco' then trim(p_endereco) end, v_cidade, v_uf, nullif(trim(p_observacao), ''),
    'a_vistoriar', 'aberta', v_sla, v_aberta, v_aberta + make_interval(hours => v_sla), v_base, v_desl, auth.uid()
  ) returning ordens_servico.id into v_id;

  if p_lote_id is null then
    insert into public.notificacoes (destino, loja_id, empresa_cliente_id, tipo, os_id, titulo, corpo, link)
    values ('loja', v_loja, v_empresa, 'nova_os', v_id,
            'Nova OS · ' || coalesce(v_emp.nome_fantasia, v_emp.razao_social) || ' · ' || v_placa,
            'OS ' || v_num || ' aberta por ' || trim(p_nome_solicitante), '/loja/os/' || v_num);
  end if;

  return query select v_id, v_num;
end $$;

create or replace function public.atualizar_veiculo_os(p_os uuid, p_marca_modelo text, p_ano text, p_cor text, p_categoria_id uuid, p_renavam text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ren text := nullif(regexp_replace(coalesce(p_renavam, ''), '\D', '', 'g'), '');
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_ren is not null then
    v_ren := lpad(v_ren, 11, '0');
    if not public.renavam_valido(v_ren) then raise exception 'RENAVAM_INVALIDO'; end if;
  end if;
  update public.ordens_servico set marca_modelo = nullif(trim(p_marca_modelo), ''), ano = nullif(trim(p_ano), ''),
    cor = nullif(trim(p_cor), ''), categoria_id = p_categoria_id, renavam = v_ren
   where id = p_os;
  insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
  values (p_os, 'Dados do veículo atualizados', null, null, auth.uid(), public.meu_nome());
end $$;

create or replace function public.justificar_atraso(p_os uuid, p_motivo uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_motivo text;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'TEXTO_OBRIGATORIO'; end if;
  select descricao into v_motivo from public.motivos where id = p_motivo and tipo = 'atraso' and ativo and loja_id = (select o.loja_id from public.ordens_servico o where o.id = p_os);
  if v_motivo is null then raise exception 'MOTIVO_INVALIDO'; end if;
  if not exists (select 1 from public.ordens_servico where id = p_os and status in ('a_vistoriar','frustrado')) then raise exception 'OS_ENCERRADA'; end if;
  insert into public.justificativas_atraso(os_id, motivo_id, texto, criado_por) values (p_os, p_motivo, trim(p_texto), auth.uid());
  insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
  values (p_os, 'Atraso justificado', v_motivo, trim(p_texto), auth.uid(), public.meu_nome());
end $$;

create or replace function public.agendar_os(p_os uuid, p_data_hora timestamptz, p_local text, p_vistoriador uuid, p_motivo uuid, p_motivo_texto text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_os record; v_versao int; v_vist text; v_mot text;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status <> 'a_vistoriar' then raise exception 'OS_NAO_ABERTA'; end if;
  select nome into v_vist from public.vistoriadores where id = p_vistoriador and ativo and loja_id = v_os.loja_id;
  if v_vist is null then raise exception 'VISTORIADOR_INVALIDO'; end if;
  select coalesce(max(versao), 0) + 1 into v_versao from public.os_agendamentos where os_id = p_os;
  if v_versao > 1 then
    select descricao into v_mot from public.motivos where id = p_motivo and tipo = 'reagendamento' and loja_id = v_os.loja_id;
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
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  update public.ordens_servico set etapa = p_etapa where id = p_os and status = 'a_vistoriar';
  if not found then raise exception 'OS_NAO_ABERTA'; end if;
end $$;

create or replace function public.abrir_pendencia(p_os uuid, p_tipo public.pendencia_tipo, p_descricao text, p_responsavel public.responsavel_tipo, p_previsao date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_os record; v_id uuid;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
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
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status <> 'a_vistoriar' then raise exception 'OS_NAO_ABERTA'; end if;
  select descricao into v_mot from public.motivos where id = p_motivo and tipo = 'frustracao' and ativo and loja_id = v_os.loja_id;
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
    if coalesce(trim(p_texto), '') = '' then raise exception 'TEXTO_OBRIGATORIO'; end if;
  select * into v_p from public.pendencias where id = p_pendencia for update;
  if not found or v_p.resolvida_em is not null then raise exception 'PENDENCIA_RESOLVIDA'; end if;
  if not public.os_da_minha_loja(v_p.os_id) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
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
  if not public.os_da_minha_loja(v_os.id) and (v_os.empresa_cliente_id is distinct from public.minha_empresa() or v_p.responsavel <> 'cliente') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  update public.pendencias set resposta_cliente = trim(p_texto), respondida_em = now() where id = p_pendencia;
  perform public.historico(v_p.os_id, 'Cliente respondeu a pendência', null, trim(p_texto));
  perform public.notificar_os(v_p.os_id, array['loja']::public.notif_destino[], 'pendencia_respondida',
    'Resposta do cliente · ' || v_os.placa, trim(p_texto));
end $$;

create or replace function public.cancelar_os(p_os uuid, p_nome text, p_motivo uuid, p_descricao text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_mot text;
begin
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA'; end if;
  if not public.os_da_minha_loja(p_os) and v_os.empresa_cliente_id is distinct from public.minha_empresa() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_os.status not in ('a_vistoriar', 'frustrado') then raise exception 'OS_NAO_ABERTA'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'SOLICITANTE_OBRIGATORIO'; end if;
  if coalesce(trim(p_descricao), '') = '' then raise exception 'DESCRICAO_OBRIGATORIA'; end if;
  select descricao into v_mot from public.motivos where id = p_motivo and tipo = 'cancelamento' and ativo and loja_id = v_os.loja_id;
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

create or replace function public.registrar_laudo(p_os uuid, p_versao int, p_path text, p_nome text, p_tamanho bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_prox int;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
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

create or replace function public.confirmar_lote(p_lote uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_lote record; v_emp record; v_cat uuid; v_serv uuid; v_l record; v_os record; v_n int := 0;
  v_agora timestamptz := now();
begin
  select * into v_lote from public.lotes_importacao where id = p_lote for update;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  if not (public.is_loja() and v_lote.loja_id = public.minha_loja()) and v_lote.empresa_cliente_id is distinct from public.minha_empresa() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_lote.status <> 'previa' then raise exception 'LOTE_JA_PROCESSADO'; end if;
  select * into v_emp from public.empresas_clientes where id = v_lote.empresa_cliente_id;
  select id into v_cat from public.categorias_veiculo order by ordem limit 1;          -- padrão: Carro
  select id into v_serv from public.servicos where padrao and ativo and loja_id = v_lote.loja_id limit 1;

  for v_l in select * from public.lote_linhas where lote_id = p_lote and resultado = 'ok' order by linha loop
    begin
      select * into v_os from public.abrir_os(
        v_lote.empresa_cliente_id, v_lote.nome_solicitante, v_lote.telefone_contato, v_l.placa_normalizada, v_l.renavam,
        v_l.modelo, null, null, v_cat, coalesce(v_l.servico_id, v_serv), 'patio', v_l.patio_id, null, null, null,
        v_l.observacao, p_lote, v_agora);
    exception when others then
      raise exception 'LINHA_%:%:%', v_l.linha, v_l.placa_normalizada, sqlerrm;
    end;
    update public.lote_linhas set os_id = v_os.id where id = v_l.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'LOTE_SEM_LINHAS_VALIDAS'; end if;

  update public.lotes_importacao set status = 'confirmado', confirmado_em = v_agora, validas = v_n where id = p_lote;
  insert into public.notificacoes (destino, loja_id, empresa_cliente_id, tipo, lote_id, titulo, corpo, link)
  values ('loja', v_lote.loja_id, v_lote.empresa_cliente_id, 'novo_lote', p_lote,
          'Novo lote · ' || coalesce(v_emp.nome_fantasia, v_emp.razao_social) || ' · ' || v_n || ' OS',
          'Enviado por ' || v_lote.nome_solicitante, '/loja/importar?lote=' || p_lote);
  return v_n;
end $$;

create or replace function public.descartar_lote(p_lote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_lote record;
begin
  select * into v_lote from public.lotes_importacao where id = p_lote for update;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  if not (public.is_loja() and v_lote.loja_id = public.minha_loja()) and v_lote.empresa_cliente_id is distinct from public.minha_empresa() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_lote.status <> 'previa' then raise exception 'LOTE_JA_PROCESSADO'; end if;
  update public.lotes_importacao set status = 'descartado' where id = p_lote;
end $$;
