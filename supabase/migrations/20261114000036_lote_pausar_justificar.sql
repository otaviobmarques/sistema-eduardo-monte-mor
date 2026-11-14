-- Fila de OS: pausar o prazo ou justificar o atraso de várias OS selecionadas (ex.: todas de um pátio), em 14/11/2026.
-- Cada uma passa pelas mesmas funções da ficha (pausar_os / justificar_atraso); falhas voltam por OS.
-- Feriado incluído/removido recalcula o prazo das OS em andamento da Loja.

create or replace function public.pausar_lote(p_os uuid[], p_motivo text)
returns table(os_id uuid, numero bigint, ok boolean, erro text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_id uuid; v_num bigint;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if coalesce(array_length(p_os, 1), 0) = 0 then raise exception 'LOTE_VAZIO'; end if;
  if array_length(p_os, 1) > 500 then raise exception 'LOTE_GRANDE'; end if;
  foreach v_id in array p_os loop
    select o.numero into v_num from public.ordens_servico o where o.id = v_id;
    begin
      perform public.pausar_os(v_id, p_motivo);
      os_id := v_id; numero := v_num; ok := true; erro := null; return next;
    exception when others then
      os_id := v_id; numero := v_num; ok := false; erro := sqlerrm; return next;
    end;
  end loop;
end $$;
revoke all on function public.pausar_lote(uuid[], text) from public, anon;
grant execute on function public.pausar_lote(uuid[], text) to authenticated;

create or replace function public.justificar_lote(p_os uuid[], p_motivo uuid, p_texto text)
returns table(os_id uuid, numero bigint, ok boolean, erro text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_id uuid; v_num bigint;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if coalesce(array_length(p_os, 1), 0) = 0 then raise exception 'LOTE_VAZIO'; end if;
  if array_length(p_os, 1) > 500 then raise exception 'LOTE_GRANDE'; end if;
  foreach v_id in array p_os loop
    select o.numero into v_num from public.ordens_servico o where o.id = v_id;
    begin
      perform public.justificar_atraso(v_id, p_motivo, p_texto);
      os_id := v_id; numero := v_num; ok := true; erro := null; return next;
    exception when others then
      os_id := v_id; numero := v_num; ok := false; erro := sqlerrm; return next;
    end;
  end loop;
end $$;
revoke all on function public.justificar_lote(uuid[], uuid, text) from public, anon;
grant execute on function public.justificar_lote(uuid[], uuid, text) to authenticated;

create or replace function public.tg_feriado_recalcula() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_loja uuid := coalesce(new.loja_id, old.loja_id);
begin
  update public.ordens_servico o
     set prazo_em = public.somar_tempo_util(o.loja_id, o.aberta_em, make_interval(hours => o.sla_horas) + o.total_pausado)
   where o.loja_id = v_loja and o.status in ('a_vistoriar', 'frustrado')
     and exists (select 1 from public.configuracoes c where c.loja_id = v_loja and c.contagem = 'uteis');
  return null;
end $$;
revoke all on function public.tg_feriado_recalcula() from public, anon, authenticated;
drop trigger if exists feriado_recalcula on public.feriados;
create trigger feriado_recalcula after insert or update or delete on public.feriados
  for each row execute function public.tg_feriado_recalcula();
