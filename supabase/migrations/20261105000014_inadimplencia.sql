-- Multi-Loja: bloqueio automático por inadimplência e desbloqueio ao pagar
alter table public.lojas add column if not exists bloqueio_automatico boolean not null default false;

-- Roda diariamente: marca faturas vencidas e bloqueia Lojas com atraso acima da tolerância.
create or replace function public.verificar_inadimplencia() returns int
language plpgsql security definer set search_path = '' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int := 0; r record;
begin
  update public.faturas set status = 'vencido' where status = 'pendente' and vencimento < v_hoje;
  for r in
    select l.id, min(f.vencimento) as venc from public.lojas l join public.faturas f on f.loja_id = l.id
     where l.ativo and not l.bloqueada and f.status = 'vencido' and f.vencimento + l.dias_tolerancia < v_hoje
     group by l.id
  loop
    update public.lojas set bloqueada = true, bloqueio_automatico = true, bloqueada_em = now(),
           motivo_bloqueio = 'Fatura vencida em ' || to_char(r.venc, 'DD/MM/YYYY') || ' sem pagamento.'
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Ao pagar: se não restar fatura vencida além da tolerância, desbloqueia (só bloqueios automáticos).
create or replace function public.reavaliar_bloqueio(p_loja uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.lojas l set bloqueada = false, bloqueio_automatico = false, bloqueada_em = null, motivo_bloqueio = null
   where l.id = p_loja and l.bloqueada and l.bloqueio_automatico
     and not exists (select 1 from public.faturas f where f.loja_id = l.id and f.status = 'vencido' and f.vencimento + l.dias_tolerancia < v_hoje);
end $$;

revoke execute on function public.verificar_inadimplencia() from public, anon, authenticated;
revoke execute on function public.reavaliar_bloqueio(uuid) from public, anon, authenticated;

-- 09:05 em Brasília (12:05 UTC)
select cron.schedule('inadimplencia-lojas', '5 12 * * *', 'select public.verificar_inadimplencia()');
