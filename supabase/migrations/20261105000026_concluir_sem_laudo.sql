-- Concluir OS sem laudo (decidido em 09/11/2026): a Loja pode finalizar a OS sem enviar o PDF, com alerta na tela,
-- motivo obrigatório e as mesmas travas do laudo (pendência aberta bloqueia; atraso exige justificativa — gatilho).
-- O laudo pode ser anexado depois; aí a OS deixa de constar como “sem laudo” e o cliente é avisado.

alter table public.ordens_servico
  add column if not exists sem_laudo boolean not null default false,
  add column if not exists sem_laudo_motivo text,
  add column if not exists sem_laudo_por uuid references auth.users(id) on delete set null;
comment on column public.ordens_servico.sem_laudo is 'Concluída pela Loja sem laudo em PDF (até um laudo ser anexado)';

create or replace function public.concluir_sem_laudo(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status <> 'a_vistoriar' then raise exception 'OS_NAO_ABERTA'; end if;
  if char_length(coalesce(trim(p_motivo), '')) < 5 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  if exists (select 1 from public.pendencias where os_id = p_os and resolvida_em is null) then raise exception 'PENDENCIA_ABERTA'; end if;

  -- A trava de justificativa de atraso (tg_exigir_justificativa) roda neste update
  update public.ordens_servico
     set status = 'vistoriado', concluida_em = now(), etapa = null,
         valor_final = valor_base + valor_deslocamento + valor_ajuste,
         sem_laudo = true, sem_laudo_motivo = trim(p_motivo), sem_laudo_por = auth.uid()
   where id = p_os;
  perform public.historico(p_os, 'OS concluída sem laudo', null, trim(p_motivo));
  perform public.notificar_os(p_os, array['cliente']::public.notif_destino[], 'vistoriado',
    'Vistoria concluída · ' || v_os.placa, 'A OS ' || v_os.numero || ' foi concluída. O laudo em PDF ainda não foi anexado.');
end $$;
revoke all on function public.concluir_sem_laudo(uuid, text) from public, anon;
grant execute on function public.concluir_sem_laudo(uuid, text) to authenticated;

-- Laudo: quando a OS foi concluída sem laudo, o primeiro PDF “completa” a OS e avisa o cliente que o laudo está disponível
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
    update public.ordens_servico
       set status = 'vistoriado', concluida_em = now(), etapa = null,
           valor_final = valor_base + valor_deslocamento + valor_ajuste
     where id = p_os;
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
