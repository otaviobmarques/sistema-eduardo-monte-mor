-- Liberação por promessa de pagamento (decidido em 16/11/2026): o Administrador libera a Loja bloqueada por N dias (padrão 3).
-- Durante a promessa o Gestor vê um aviso amarelo grande; ao vencer, se a fatura seguir em atraso, bloqueia de novo
-- (vencer_promessas() a cada 15 min). Pagar encerra a promessa (reavaliar_bloqueio()).
alter table public.lojas add column if not exists promessa_ate timestamptz;
alter table public.lojas add column if not exists promessa_registrada_em timestamptz;

create or replace function public.liberar_por_promessa(p_loja uuid, p_dias int default 3) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_ate timestamptz := now() + make_interval(days => greatest(1, least(coalesce(p_dias, 3), 15)));
begin
  if not public.is_admin() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  update public.lojas set bloqueada = false, bloqueio_automatico = false, bloqueada_em = null, motivo_bloqueio = null,
         promessa_ate = v_ate, promessa_registrada_em = now()
   where id = p_loja;
  if not found then raise exception 'LOJA_NAO_ENCONTRADA'; end if;
  insert into public.auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id, loja_id)
  values ('lojas', p_loja, 'promessa de pagamento', null, to_char(v_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), auth.uid(), p_loja);
  return v_ate;
end $$;
revoke execute on function public.liberar_por_promessa(uuid, int) from public, anon;
grant execute on function public.liberar_por_promessa(uuid, int) to authenticated;

create or replace function public.verificar_inadimplencia() returns int
language plpgsql security definer set search_path = '' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int := 0; r record;
begin
  update public.faturas set status = 'vencido' where status = 'pendente' and vencimento < v_hoje;
  for r in
    select l.id, min(f.vencimento) as venc from public.lojas l join public.faturas f on f.loja_id = l.id
     where l.ativo and not l.bloqueada and (l.promessa_ate is null or l.promessa_ate <= now())
       and f.status = 'vencido' and f.vencimento + l.dias_tolerancia < v_hoje
     group by l.id
  loop
    update public.lojas set bloqueada = true, bloqueio_automatico = true, bloqueada_em = now(), promessa_ate = null,
           motivo_bloqueio = 'Fatura vencida em ' || to_char(r.venc, 'DD/MM/YYYY') || ' sem pagamento.'
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.vencer_promessas() returns int
language plpgsql security definer set search_path = '' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int := 0; r record;
begin
  for r in select l.id, l.promessa_ate from public.lojas l where l.promessa_ate is not null and l.promessa_ate <= now() loop
    if exists (select 1 from public.faturas f join public.lojas l2 on l2.id = f.loja_id
                where f.loja_id = r.id and f.status = 'vencido' and f.vencimento + l2.dias_tolerancia < v_hoje) then
      update public.lojas set bloqueada = true, bloqueio_automatico = true, bloqueada_em = now(), promessa_ate = null,
             motivo_bloqueio = 'Promessa de pagamento venceu em ' || to_char(r.promessa_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || ' sem pagamento.'
       where id = r.id;
      v_n := v_n + 1;
    else
      update public.lojas set promessa_ate = null where id = r.id;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.reavaliar_bloqueio(p_loja uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.lojas l set bloqueada = false, bloqueio_automatico = false, bloqueada_em = null, motivo_bloqueio = null
   where l.id = p_loja and l.bloqueada and l.bloqueio_automatico
     and not exists (select 1 from public.faturas f where f.loja_id = l.id and f.status = 'vencido' and f.vencimento + l.dias_tolerancia < v_hoje);
  update public.lojas l set promessa_ate = null
   where l.id = p_loja and l.promessa_ate is not null
     and not exists (select 1 from public.faturas f where f.loja_id = l.id and f.status = 'vencido');
end $$;
revoke execute on function public.verificar_inadimplencia() from public, anon, authenticated;
revoke execute on function public.vencer_promessas() from public, anon, authenticated;
revoke execute on function public.reavaliar_bloqueio(uuid) from public, anon, authenticated;

select cron.schedule('promessas-pagamento', '*/15 * * * *', 'select public.vencer_promessas()');
