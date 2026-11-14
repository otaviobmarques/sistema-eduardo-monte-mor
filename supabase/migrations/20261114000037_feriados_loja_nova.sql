-- Loja nova já nasce com os feriados nacionais 2026–2027 (para o SLA em dias úteis). Municipais: a Loja cadastra.
create or replace function public.tg_loja_feriados() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.feriados (loja_id, data, descricao)
  select new.id, f.data, f.descricao from (values
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
  return new;
end $$;
revoke all on function public.tg_loja_feriados() from public, anon, authenticated;
drop trigger if exists loja_feriados on public.lojas;
create trigger loja_feriados after insert on public.lojas for each row execute function public.tg_loja_feriados();
