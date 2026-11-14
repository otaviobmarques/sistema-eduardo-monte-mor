-- SLA sem sábado, domingo e feriados (decidido em 14/11/2026).
-- Com configuracoes.contagem = 'uteis', o prazo gravado (prazo_em) passa a ser calculado no banco pelo mesmo critério da tela
-- (lib/regras/sla.ts): soma o SLA + tempo pausado só dentro do horário útil (dias da semana escolhidos, sem feriados).
-- “Dias úteis” = horário 00:00–24:00 de segunda a sexta. Relatórios (no prazo/atrasada), travas e alertas ficam coerentes.

create or replace function public.somar_tempo_util(p_loja uuid, p_inicio timestamptz, p_dur interval)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare v_cfg record; v_dias int[]; v_ini int; v_fim int; v_resta interval := greatest(p_dur, interval '0');
        v_dia date; v_j0 timestamptz; v_j1 timestamptz; v_s timestamptz; v_i int := 0;
begin
  select c.contagem, c.horario_util into v_cfg from public.configuracoes c where c.loja_id = p_loja;
  if v_cfg is null or v_cfg.contagem <> 'uteis' then return p_inicio + p_dur; end if;
  v_dias := array(select (jsonb_array_elements_text(v_cfg.horario_util -> 'dias'))::int);
  v_ini := split_part(v_cfg.horario_util ->> 'inicio', ':', 1)::int * 60 + split_part(v_cfg.horario_util ->> 'inicio', ':', 2)::int;
  v_fim := split_part(v_cfg.horario_util ->> 'fim', ':', 1)::int * 60 + split_part(v_cfg.horario_util ->> 'fim', ':', 2)::int;
  if coalesce(array_length(v_dias, 1), 0) = 0 or v_fim <= v_ini then return p_inicio + p_dur; end if;
  v_dia := (p_inicio at time zone 'America/Sao_Paulo')::date;
  while v_i < 3650 loop
    v_i := v_i + 1;
    if extract(dow from v_dia)::int = any(v_dias)
       and not exists (select 1 from public.feriados f where f.loja_id = p_loja and f.data = v_dia) then
      v_j0 := (v_dia::timestamp + make_interval(mins => v_ini)) at time zone 'America/Sao_Paulo';
      v_j1 := (v_dia::timestamp + make_interval(mins => v_fim)) at time zone 'America/Sao_Paulo';
      v_s := greatest(v_j0, p_inicio);
      if v_s < v_j1 then
        if v_resta <= v_j1 - v_s then return v_s + v_resta; end if;
        v_resta := v_resta - (v_j1 - v_s);
      end if;
    end if;
    v_dia := v_dia + 1;
  end loop;
  return p_inicio + p_dur;
end $$;
revoke all on function public.somar_tempo_util(uuid, timestamptz, interval) from public, anon, authenticated;

-- Prazo útil: abertura + (SLA + tempo pausado) contado só no horário útil. Só age quando a Loja usa horas/dias úteis.
create or replace function public.tg_prazo_util() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.configuracoes c where c.loja_id = new.loja_id and c.contagem = 'uteis') then
    new.prazo_em := public.somar_tempo_util(new.loja_id, new.aberta_em, make_interval(hours => new.sla_horas) + coalesce(new.total_pausado, interval '0'));
  end if;
  return new;
end $$;
revoke all on function public.tg_prazo_util() from public, anon, authenticated;
-- Nome com “a_” para rodar antes de exigir_justificativa (gatilhos BEFORE rodam em ordem alfabética)
drop trigger if exists a_prazo_util on public.ordens_servico;
create trigger a_prazo_util before insert or update of aberta_em, sla_horas, total_pausado, status on public.ordens_servico
  for each row execute function public.tg_prazo_util();

-- Recalcula o prazo das OS em andamento quando a contagem/horário/feriados mudam
create or replace function public.recalcular_prazos() returns int
language plpgsql security definer set search_path = '' as $$
declare v_loja uuid := public.minha_loja(); n int;
begin
  if v_loja is null or not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  update public.ordens_servico o
     set prazo_em = case when c.contagem = 'uteis'
           then public.somar_tempo_util(o.loja_id, o.aberta_em, make_interval(hours => o.sla_horas) + o.total_pausado)
           else o.aberta_em + make_interval(hours => o.sla_horas) + o.total_pausado end
    from public.configuracoes c
   where c.loja_id = o.loja_id and o.loja_id = v_loja and o.status in ('a_vistoriar', 'frustrado');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.recalcular_prazos() from public, anon;
grant execute on function public.recalcular_prazos() to authenticated;

-- Feriados nacionais 2026–2027 em todas as Lojas (a Loja acrescenta os municipais em Configurações › Feriados)
insert into public.feriados (loja_id, data, descricao)
select l.id, f.data, f.descricao from public.lojas l cross join (values
  ('2026-01-01'::date, 'Confraternização Universal'), ('2026-04-03', 'Sexta-feira Santa'), ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'), ('2026-09-07', 'Independência do Brasil'), ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'), ('2026-11-15', 'Proclamação da República'), ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Confraternização Universal'), ('2027-03-26', 'Sexta-feira Santa'), ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'), ('2027-09-07', 'Independência do Brasil'), ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'), ('2027-11-15', 'Proclamação da República'), ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  ('2027-12-25', 'Natal')
) as f(data, descricao)
on conflict (loja_id, data) do nothing;

-- Auto Visão Monte Mor: prazo em dias úteis (segunda a sexta, 24h, sem feriados) e recálculo do prazo de todas as OS
update public.configuracoes c set contagem = 'uteis', horario_util = '{"dias":[1,2,3,4,5],"inicio":"00:00","fim":"24:00"}'::jsonb
  from public.lojas l where l.id = c.loja_id and l.nome = 'Auto Visão Monte Mor';
update public.ordens_servico o
   set prazo_em = public.somar_tempo_util(o.loja_id, o.aberta_em, make_interval(hours => o.sla_horas) + o.total_pausado)
  from public.lojas l where l.id = o.loja_id and l.nome = 'Auto Visão Monte Mor'; -- todas, para os relatórios (no prazo/atrasada) seguirem a regra nova
