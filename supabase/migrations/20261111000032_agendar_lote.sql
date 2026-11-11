-- Agendamento em lote (decidido em 11/11/2026): na Fila de OS a Loja seleciona várias OS e aloca um vistoriador num dia,
-- com hora inicial e intervalo opcional entre as placas. Cada OS recebe um agendamento normal (agendar_os: versão,
-- histórico, etapa “Agendada”) e aparece na Agenda. OS já agendada vira reagendamento com o motivo informado.

create or replace function public.agendar_lote(p_os uuid[], p_inicio timestamptz, p_intervalo_min int, p_vistoriador uuid, p_local text, p_motivo uuid)
returns table(os_id uuid, numero bigint, ok boolean, erro text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_id uuid; v_i int := 0; v_num bigint; v_loc text;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if p_os is null or coalesce(array_length(p_os, 1), 0) = 0 then raise exception 'LOTE_VAZIO'; end if;
  if array_length(p_os, 1) > 500 then raise exception 'LOTE_GRANDE'; end if;
  if p_inicio is null then raise exception 'DATA_INVALIDA'; end if;
  foreach v_id in array p_os loop
    v_num := null; v_loc := null;
    select o.numero, case when o.local_tipo = 'patio' then pt.nome else o.endereco end
      into v_num, v_loc
      from public.ordens_servico o left join public.patios pt on pt.id = o.patio_id where o.id = v_id;
    begin
      perform public.agendar_os(v_id, p_inicio + make_interval(mins => v_i * greatest(coalesce(p_intervalo_min, 0), 0)),
        coalesce(nullif(trim(p_local), ''), v_loc), p_vistoriador, p_motivo, 'Agendamento em lote');
      os_id := v_id; numero := v_num; ok := true; erro := null; return next;
      v_i := v_i + 1;
    exception when others then
      os_id := v_id; numero := v_num; ok := false; erro := sqlerrm; return next;
    end;
  end loop;
end $$;
revoke all on function public.agendar_lote(uuid[], timestamptz, int, uuid, text, uuid) from public, anon;
grant execute on function public.agendar_lote(uuid[], timestamptz, int, uuid, text, uuid) to authenticated;
