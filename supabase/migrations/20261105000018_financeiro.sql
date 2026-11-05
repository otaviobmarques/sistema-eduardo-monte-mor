-- Etapa 8 · Financeiro: baixa de pagamento por placa (individual ou em lote), alerta de pagamento pendente.

alter table public.ordens_servico
  add column if not exists pagamento_obs text,
  add column if not exists pagamento_registrado_em timestamptz,
  add column if not exists pagamento_registrado_por uuid references auth.users(id) on delete set null;

create index if not exists os_pagamento_idx on public.ordens_servico (loja_id, pagamento_status) where status <> 'cancelado';
create index if not exists os_concluida_idx on public.ordens_servico (loja_id, concluida_em) where status = 'vistoriado';

-- Registra o pagamento de uma ou várias OS da Loja. Voltar para "pendente" limpa forma e data.
create or replace function public.registrar_pagamento(
  p_os uuid[], p_status public.pagamento_status, p_forma text, p_data date, p_obs text
) returns int language plpgsql security definer set search_path = '' as $$
declare v record; v_n int := 0; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if coalesce(array_length(p_os, 1), 0) = 0 then raise exception 'NENHUMA_OS'; end if;
  if p_status = 'pago' and (coalesce(trim(p_forma), '') = '' or p_data is null) then raise exception 'FORMA_DATA_OBRIGATORIAS'; end if;
  if p_data > v_hoje then raise exception 'DATA_FUTURA'; end if;

  for v in select os.id, os.loja_id, os.status from public.ordens_servico os where os.id = any(p_os) for update loop
    if v.loja_id is distinct from public.minha_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
    if v.status = 'cancelado' then raise exception 'OS_CANCELADA'; end if;
    update public.ordens_servico os set
      pagamento_status = p_status,
      pagamento_forma = case when p_status = 'pendente' then null else nullif(trim(p_forma), '') end,
      pagamento_data = case when p_status = 'pendente' then null else coalesce(p_data, v_hoje) end,
      pagamento_obs = case when p_status = 'pendente' then null else nullif(trim(coalesce(p_obs, '')), '') end,
      pagamento_registrado_em = now(),
      pagamento_registrado_por = auth.uid()
    where os.id = v.id;
    v_n := v_n + 1;
  end loop;
  if v_n <> (select count(distinct x) from unnest(p_os) x) then raise exception 'OS_NAO_ENCONTRADA'; end if;

  -- O alerta de pagamento pendente sai da lista quando a baixa é feita
  if p_status <> 'pendente' then
    update public.notificacoes n set vista_em = now(), vista_por = auth.uid()
     where n.os_id = any(p_os) and n.tipo = 'pagamento_pendente' and n.vista_em is null;
  end if;
  return v_n;
end $$;
revoke all on function public.registrar_pagamento(uuid[], public.pagamento_status, text, date, text) from public, anon;
grant execute on function public.registrar_pagamento(uuid[], public.pagamento_status, text, date, text) to authenticated;

-- Ao concluir uma OS de cliente avulso com valor a receber, avisa a Loja (pagamento pendente).
-- Clientes faturados entram no fechamento mensal e não geram alerta por placa.
create or replace function public.tg_alerta_pagamento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_forma public.forma_cobranca; v_nome text;
begin
  if new.status = 'vistoriado' and old.status is distinct from 'vistoriado'
     and new.pagamento_status = 'pendente' and coalesce(new.valor_final, 0) > 0 then
    select e.forma_cobranca, coalesce(e.nome_fantasia, e.razao_social) into v_forma, v_nome
      from public.empresas_clientes e where e.id = new.empresa_cliente_id;
    if v_forma = 'avulso' then
      perform public.notificar_os(new.id, array['loja']::public.notif_destino[], 'pagamento_pendente',
        'Pagamento pendente · ' || v_nome || ' · ' || new.placa,
        'OS ' || new.numero || ' concluída · ' || 'R$ ' || replace(to_char(new.valor_final, 'FM999999990.00'), '.', ',') || ' a receber.');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists alerta_pagamento on public.ordens_servico;
create trigger alerta_pagamento after update of status on public.ordens_servico
  for each row execute function public.tg_alerta_pagamento();
