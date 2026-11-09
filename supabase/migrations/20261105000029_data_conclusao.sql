-- Data de conclusão escolhida (decidido em 09/11/2026): o Gestor com conclusão livre (o “eduardo”) pode fechar a OS com
-- data/hora anterior a agora (nunca antes da abertura nem no futuro). O SLA (no prazo / atrasada, tempo de conclusão,
-- mês do fechamento) passa a valer por essa data. Para os demais Gestores a conclusão é sempre “agora”.

-- Data da conclusão: a escolhida (só conclusão livre), senão agora
create or replace function public.data_conclusao(p_aberta_em timestamptz, p_livre boolean, p_quando timestamptz)
returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  if p_quando is null or not p_livre then return now(); end if;
  if p_quando > now() + interval '5 minutes' then raise exception 'DATA_CONCLUSAO_FUTURA'; end if;
  if p_quando < p_aberta_em then raise exception 'DATA_CONCLUSAO_ANTES_ABERTURA'; end if;
  return least(p_quando, now());
end $$;
revoke all on function public.data_conclusao(timestamptz, boolean, timestamptz) from public, anon, authenticated;

create or replace function public.texto_data_conclusao(p_quando timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when p_quando < now() - interval '2 minutes'
    then 'concluída em ' || to_char(p_quando at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') end
$$;
revoke all on function public.texto_data_conclusao(timestamptz) from public, anon, authenticated;

-- Encerra pendências e pausas na data da conclusão: o tempo pausado conta só até essa data
drop function if exists public.encerrar_pendencias_para_concluir(uuid);
create or replace function public.encerrar_pendencias_para_concluir(p_os uuid, p_quando timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; v_desde timestamptz;
begin
  update public.pendencias set resolvida_em = now(), resolucao_texto = 'Encerrada ao concluir a OS'
   where os_id = p_os and resolvida_em is null;
  get diagnostics n = row_count;
  update public.sla_pausas set fim = greatest(inicio, p_quando) where os_id = p_os and fim is null;
  select pausado_desde into v_desde from public.ordens_servico where id = p_os;
  if v_desde is not null then
    update public.ordens_servico
       set total_pausado = total_pausado + greatest(p_quando - v_desde, interval '0'), pausado_desde = null,
           prazo_em = aberta_em + make_interval(hours => sla_horas) + total_pausado + greatest(p_quando - v_desde, interval '0')
     where id = p_os;
  end if;
  return n;
end $$;
revoke all on function public.encerrar_pendencias_para_concluir(uuid, timestamptz) from public, anon, authenticated;

drop function if exists public.concluir_sem_laudo(uuid, text);
create or replace function public.concluir_sem_laudo(p_os uuid, p_motivo text, p_concluida_em timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_livre boolean := public.tenho_conclusao_livre(); v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); v_pend int := 0; v_quando timestamptz;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or not (v_os.status = 'a_vistoriar' or (v_livre and v_os.status = 'frustrado')) then raise exception 'OS_NAO_ABERTA'; end if;
  v_quando := public.data_conclusao(v_os.aberta_em, v_livre, p_concluida_em);
  if v_livre then
    v_pend := public.encerrar_pendencias_para_concluir(p_os, v_quando);
    perform set_config('app.conclusao_livre', 'on', true);
  else
    if char_length(coalesce(v_motivo, '')) < 5 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
    if exists (select 1 from public.pendencias where os_id = p_os and resolvida_em is null) then raise exception 'PENDENCIA_ABERTA'; end if;
  end if;

  update public.ordens_servico
     set status = 'vistoriado', concluida_em = v_quando, etapa = null,
         valor_final = valor_base + valor_deslocamento + valor_ajuste,
         sem_laudo = true, sem_laudo_motivo = v_motivo, sem_laudo_por = auth.uid()
   where id = p_os;
  if v_pend > 0 then perform public.historico(p_os, 'Pendências encerradas ao concluir', null, v_pend || ' pendência(s)'); end if;
  perform public.historico(p_os, 'OS concluída sem laudo', null, concat_ws(' · ', v_motivo, public.texto_data_conclusao(v_quando)));
  perform set_config('app.conclusao_livre', '', true);
  perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'vistoriado',
    'Vistoria concluída · ' || v_os.placa, 'A OS ' || v_os.numero || ' foi concluída. O laudo em PDF ainda não foi anexado.');
end $$;
revoke all on function public.concluir_sem_laudo(uuid, text, timestamptz) from public, anon;
grant execute on function public.concluir_sem_laudo(uuid, text, timestamptz) to authenticated;

drop function if exists public.registrar_laudo(uuid, int, text, text, bigint);
create or replace function public.registrar_laudo(p_os uuid, p_versao int, p_path text, p_nome text, p_tamanho bigint, p_concluida_em timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_prox int; v_livre boolean := public.tenho_conclusao_livre(); v_pend int := 0; v_quando timestamptz;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or not (v_os.status in ('a_vistoriar', 'vistoriado') or (v_livre and v_os.status = 'frustrado')) then raise exception 'OS_NAO_PERMITE_LAUDO'; end if;
  select coalesce(max(versao), 0) + 1 into v_prox from public.anexos where os_id = p_os and tipo = 'laudo';
  if p_versao <> v_prox then raise exception 'VERSAO_CONFLITO'; end if;
  if p_path <> v_os.empresa_cliente_id::text || '/' || p_os::text || '/v' || p_versao || '.pdf' then raise exception 'CAMINHO_INVALIDO'; end if;
  if v_os.status <> 'vistoriado' then
    v_quando := public.data_conclusao(v_os.aberta_em, v_livre, p_concluida_em);
    if v_livre then
      v_pend := public.encerrar_pendencias_para_concluir(p_os, v_quando);
      perform set_config('app.conclusao_livre', 'on', true);
    elsif exists (select 1 from public.pendencias where os_id = p_os and resolvida_em is null) then
      raise exception 'PENDENCIA_ABERTA';
    end if;
  end if;

  update public.anexos set atual = false where os_id = p_os and tipo = 'laudo' and atual;
  insert into public.anexos (os_id, tipo, bucket, storage_path, nome_arquivo, tamanho_bytes, versao, atual, enviado_por)
  values (p_os, 'laudo', 'laudos', p_path, p_nome, p_tamanho, p_versao, true, auth.uid());

  if v_os.status <> 'vistoriado' then
    update public.ordens_servico
       set status = 'vistoriado', concluida_em = v_quando, etapa = null,
           valor_final = valor_base + valor_deslocamento + valor_ajuste
     where id = p_os;
    perform set_config('app.conclusao_livre', '', true);
    if v_pend > 0 then perform public.historico(p_os, 'Pendências encerradas ao concluir', null, v_pend || ' pendência(s)'); end if;
    perform public.historico(p_os, 'Laudo enviado · OS concluída', null, concat_ws(' · ', p_nome, public.texto_data_conclusao(v_quando)));
    perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'vistoriado',
      'Laudo disponível · ' || v_os.placa, 'A vistoria da OS ' || v_os.numero || ' foi concluída.');
  elsif v_os.sem_laudo then
    update public.ordens_servico set sem_laudo = false where id = p_os;
    perform public.historico(p_os, 'Laudo anexado à OS concluída sem laudo', null, p_nome);
    perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'laudo_atualizado',
      'Laudo disponível · ' || v_os.placa, 'O laudo da OS ' || v_os.numero || ' foi anexado.');
  else
    perform public.historico(p_os, 'Nova versão do laudo', 'v' || (p_versao - 1), 'v' || p_versao || ' · ' || p_nome);
    perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'laudo_atualizado',
      'Laudo atualizado · ' || v_os.placa, 'Versão ' || p_versao || ' do laudo da OS ' || v_os.numero || '.');
  end if;
end $$;
revoke all on function public.registrar_laudo(uuid, int, text, text, bigint, timestamptz) from public, anon;
grant execute on function public.registrar_laudo(uuid, int, text, text, bigint, timestamptz) to authenticated;
