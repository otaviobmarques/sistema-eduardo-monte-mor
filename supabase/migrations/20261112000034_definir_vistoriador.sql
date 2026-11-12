-- Vistoriador que fez a vistoria (decidido em 12/11/2026): a Loja informa/corrige o vistoriador da OS (também já concluída),
-- inclusive na janela de conclusão. Alimenta o card “Vistorias feitas por vistoriador” (dia, semana, quinzena e mês).

create or replace function public.definir_vistoriador(p_os uuid, p_vistoriador uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_nome text; v_antes text;
begin
  if not public.os_da_minha_loja(p_os) or not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select o.id, o.loja_id, o.status, o.vistoriador_id into v_os from public.ordens_servico o where o.id = p_os for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA'; end if;
  if v_os.status = 'cancelado' then raise exception 'OS_ENCERRADA'; end if;
  if p_vistoriador is not null then
    select nome into v_nome from public.vistoriadores where id = p_vistoriador and ativo and loja_id = v_os.loja_id;
    if v_nome is null then raise exception 'VISTORIADOR_INVALIDO'; end if;
  end if;
  if v_os.vistoriador_id is not distinct from p_vistoriador then return; end if;
  select nome into v_antes from public.vistoriadores where id = v_os.vistoriador_id;
  update public.ordens_servico set vistoriador_id = p_vistoriador where id = p_os;
  perform public.historico(p_os, 'Vistoriador definido', v_antes, coalesce(v_nome, 'Sem vistoriador'));
end $$;
revoke all on function public.definir_vistoriador(uuid, uuid) from public, anon;
grant execute on function public.definir_vistoriador(uuid, uuid) to authenticated;
