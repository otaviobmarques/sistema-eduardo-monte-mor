-- Conclusão livre (decidido em 09/11/2026): o Gestor com esta permissão (o “eduardo”) fecha a placa sem nenhuma trava:
-- sem motivo, com pendência aberta (é encerrada junto), com OS frustrada e com atraso sem justificativa.
-- Os demais Gestores continuam com as travas do laudo/“concluir sem laudo”.

alter table public.perfis_usuario add column if not exists conclusao_livre boolean not null default false;
comment on column public.perfis_usuario.conclusao_livre is 'Gestor que conclui OS sem travas (motivo, pendência, justificativa de atraso)';
update public.perfis_usuario set conclusao_livre = true where login = 'eduardo' and perfil = 'loja';

create or replace function public.tenho_conclusao_livre() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.conclusao_livre from public.perfis_usuario p
                    where p.user_id = auth.uid() and p.perfil = 'loja' and not p.bloqueado), false)
$$;
revoke all on function public.tenho_conclusao_livre() from public, anon;
grant execute on function public.tenho_conclusao_livre() to authenticated;

-- Encerra as pendências abertas da OS (fecha as pausas do prazo) para a conclusão livre
create or replace function public.encerrar_pendencias_para_concluir(p_os uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_p record; n int := 0;
begin
  for v_p in select id from public.pendencias where os_id = p_os and resolvida_em is null for update loop
    update public.pendencias set resolvida_em = now(), resolucao_texto = 'Encerrada ao concluir a OS' where id = v_p.id;
    perform public.sla_fechar_pausa(p_os, v_p.id);
    n := n + 1;
  end loop;
  -- Pausa que tenha ficado aberta sem pendência (ex.: ajuste de preço) também fecha
  for v_p in select distinct referencia_id from public.sla_pausas where os_id = p_os and fim is null loop
    perform public.sla_fechar_pausa(p_os, v_p.referencia_id);
  end loop;
  return n;
end $$;
revoke all on function public.encerrar_pendencias_para_concluir(uuid) from public, anon, authenticated;

-- Justificativa de atraso: dispensada na conclusão livre (marcada só dentro da transação)
create or replace function public.tg_exigir_justificativa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'vistoriado' and old.status is distinct from 'vistoriado' and not new.origem_historico
     and coalesce(current_setting('app.conclusao_livre', true), '') <> 'on'
     and coalesce(new.concluida_em, now()) > new.prazo_em
     and not exists (select 1 from public.justificativas_atraso j where j.os_id = new.id) then
    raise exception 'JUSTIFICATIVA_OBRIGATORIA';
  end if;
  return new;
end $$;
revoke all on function public.tg_exigir_justificativa() from public, anon, authenticated;

create or replace function public.concluir_sem_laudo(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_livre boolean := public.tenho_conclusao_livre(); v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); v_pend int := 0;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or not (v_os.status = 'a_vistoriar' or (v_livre and v_os.status = 'frustrado')) then raise exception 'OS_NAO_ABERTA'; end if;
  if v_livre then
    v_pend := public.encerrar_pendencias_para_concluir(p_os);
    perform set_config('app.conclusao_livre', 'on', true);
  else
    if char_length(coalesce(v_motivo, '')) < 5 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
    if exists (select 1 from public.pendencias where os_id = p_os and resolvida_em is null) then raise exception 'PENDENCIA_ABERTA'; end if;
  end if;

  update public.ordens_servico
     set status = 'vistoriado', concluida_em = now(), etapa = null,
         valor_final = valor_base + valor_deslocamento + valor_ajuste,
         sem_laudo = true, sem_laudo_motivo = v_motivo, sem_laudo_por = auth.uid()
   where id = p_os;
  if v_pend > 0 then perform public.historico(p_os, 'Pendências encerradas ao concluir', null, v_pend || ' pendência(s)'); end if;
  perform public.historico(p_os, 'OS concluída sem laudo', null, v_motivo);
  perform set_config('app.conclusao_livre', '', true);
  perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'vistoriado',
    'Vistoria concluída · ' || v_os.placa, 'A OS ' || v_os.numero || ' foi concluída. O laudo em PDF ainda não foi anexado.');
end $$;
revoke all on function public.concluir_sem_laudo(uuid, text) from public, anon;
grant execute on function public.concluir_sem_laudo(uuid, text) to authenticated;

create or replace function public.registrar_laudo(p_os uuid, p_versao int, p_path text, p_nome text, p_tamanho bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_prox int; v_livre boolean := public.tenho_conclusao_livre(); v_pend int := 0;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or not (v_os.status in ('a_vistoriar', 'vistoriado') or (v_livre and v_os.status = 'frustrado')) then raise exception 'OS_NAO_PERMITE_LAUDO'; end if;
  select coalesce(max(versao), 0) + 1 into v_prox from public.anexos where os_id = p_os and tipo = 'laudo';
  if p_versao <> v_prox then raise exception 'VERSAO_CONFLITO'; end if;
  if p_path <> v_os.empresa_cliente_id::text || '/' || p_os::text || '/v' || p_versao || '.pdf' then raise exception 'CAMINHO_INVALIDO'; end if;
  if v_os.status <> 'vistoriado' then
    if v_livre then
      v_pend := public.encerrar_pendencias_para_concluir(p_os);
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
       set status = 'vistoriado', concluida_em = now(), etapa = null,
           valor_final = valor_base + valor_deslocamento + valor_ajuste
     where id = p_os;
    perform set_config('app.conclusao_livre', '', true);
    if v_pend > 0 then perform public.historico(p_os, 'Pendências encerradas ao concluir', null, v_pend || ' pendência(s)'); end if;
    perform public.historico(p_os, 'Laudo enviado · OS concluída', null, p_nome);
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
revoke all on function public.registrar_laudo(uuid, int, text, text, bigint) from public, anon;
grant execute on function public.registrar_laudo(uuid, int, text, text, bigint) to authenticated;
