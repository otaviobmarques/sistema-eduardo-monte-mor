-- Motivo da pausa manual guardado na própria pausa (aparece na Fila de OS ao lado de “Pausado”).
alter table public.sla_pausas add column if not exists motivo text;
comment on column public.sla_pausas.motivo is 'Motivo informado na pausa manual (Pausar prazo)';

-- Pausas manuais já abertas: motivo a partir da linha do tempo
update public.sla_pausas sp
   set motivo = (select h.para from public.historico_os h where h.os_id = sp.os_id and h.evento = 'Prazo pausado' order by h.em desc limit 1)
 where sp.origem = 'manual' and sp.fim is null and sp.motivo is null;

create or replace function public.pausar_os(p_os uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_os record; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not public.os_da_minha_loja(p_os) or not public.tenho_conclusao_livre() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found or v_os.status not in ('a_vistoriar', 'frustrado') then raise exception 'OS_ENCERRADA'; end if;
  if exists (select 1 from public.sla_pausas where os_id = p_os and origem = 'manual' and fim is null) then raise exception 'JA_PAUSADA'; end if;
  perform public.sla_abrir_pausa(p_os, 'manual', null);
  update public.sla_pausas set motivo = v_motivo where os_id = p_os and origem = 'manual' and fim is null;
  perform public.historico(p_os, 'Prazo pausado', null, coalesce(v_motivo, 'Pausa manual'));
end $$;
revoke all on function public.pausar_os(uuid, text) from public, anon;
grant execute on function public.pausar_os(uuid, text) to authenticated;
