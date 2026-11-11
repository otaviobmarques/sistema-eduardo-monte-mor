-- Motivo do atraso também depois da conclusão (decidido em 11/11/2026): a Loja registra/ajusta o motivo de uma OS já
-- vistoriada que terminou fora do prazo (ex.: concluídas sem travas pelo Gestor com conclusão livre). A explicação passa a
-- ser opcional (o motivo continua obrigatório); sem texto, fica a descrição do motivo.

create or replace function public.justificar_atraso(p_os uuid, p_motivo uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_motivo text; v_os record; v_texto text;
begin
  if not public.os_da_minha_loja(p_os) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select o.id, o.loja_id, o.status, o.concluida_em, o.prazo_em into v_os from public.ordens_servico o where o.id = p_os;
  select descricao into v_motivo from public.motivos where id = p_motivo and tipo = 'atraso' and ativo and loja_id = v_os.loja_id;
  if v_motivo is null then raise exception 'MOTIVO_INVALIDO'; end if;
  if not (v_os.status in ('a_vistoriar', 'frustrado') or (v_os.status = 'vistoriado' and v_os.concluida_em > v_os.prazo_em)) then
    raise exception 'OS_ENCERRADA';
  end if;
  v_texto := coalesce(nullif(trim(coalesce(p_texto, '')), ''), v_motivo);
  insert into public.justificativas_atraso(os_id, motivo_id, texto, criado_por) values (p_os, p_motivo, v_texto, auth.uid());
  insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
  values (p_os, case when v_os.status = 'vistoriado' then 'Atraso justificado (após a conclusão)' else 'Atraso justificado' end, v_motivo, v_texto, auth.uid(), public.meu_nome());
end $$;
revoke execute on function public.justificar_atraso(uuid, uuid, text) from public, anon;
grant execute on function public.justificar_atraso(uuid, uuid, text) to authenticated;
