-- Etapa 9 · Views de relatórios. security_invoker: a RLS de quem consulta vale (Loja vê a própria, cliente vê a sua).

create or replace view public.vw_os_sla with (security_invoker = true) as
select
  os.id, os.loja_id, os.empresa_cliente_id, os.numero, os.placa, os.marca_modelo, os.nome_solicitante,
  coalesce(e.nome_fantasia, e.razao_social) as cliente,
  os.status, os.etapa, os.aberta_em, os.concluida_em, os.cancelada_em, os.prazo_em, os.sla_horas, os.total_pausado,
  os.pausado_desde is not null as pausada,
  coalesce(nullif(os.cidade, ''), p.cidade) as cidade, coalesce(nullif(os.uf, ''), p.uf) as uf,
  os.local_tipo, os.patio_id, p.nome as patio, os.vistoriador_id, v.nome as vistoriador, s.nome as servico,
  coalesce(os.valor_final, os.valor_base + os.valor_deslocamento + os.valor_ajuste) as valor,
  os.valor_final is not null as valor_congelado,
  os.pagamento_status, os.pagamento_forma, os.pagamento_data,
  (date_trunc('month', os.aberta_em at time zone 'America/Sao_Paulo'))::date as mes_abertura,
  (date_trunc('month', os.concluida_em at time zone 'America/Sao_Paulo'))::date as mes_conclusao,
  case when os.status = 'vistoriado' then os.concluida_em <= os.prazo_em end as no_prazo,
  case when os.status = 'vistoriado'
       then round((extract(epoch from (os.concluida_em - os.aberta_em - os.total_pausado)) / 3600)::numeric, 2) end as horas_conclusao,
  case when os.status = 'vistoriado' and os.concluida_em > os.prazo_em
       then round((extract(epoch from (os.concluida_em - os.prazo_em)) / 3600)::numeric, 2) end as horas_atraso,
  case when os.status in ('a_vistoriar', 'frustrado') and os.pausado_desde is null then now() > os.prazo_em else false end as vencida_aberta,
  fr.qtd as qtd_frustracoes, fr.qtd > 0 as foi_frustrada, fr.motivo as motivo_frustracao,
  ja.motivo as motivo_atraso, ca.motivo as motivo_cancelamento
from public.ordens_servico os
left join public.empresas_clientes e on e.id = os.empresa_cliente_id
left join public.patios p on p.id = os.patio_id
left join public.vistoriadores v on v.id = os.vistoriador_id
left join public.servicos s on s.id = os.servico_id
left join lateral (
  select count(*)::int as qtd, (array_agg(m.descricao order by f.ocorrida_em desc))[1] as motivo
  from public.os_frustracoes f left join public.motivos m on m.id = f.motivo_id where f.os_id = os.id
) fr on true
left join lateral (
  select m.descricao as motivo from public.justificativas_atraso j left join public.motivos m on m.id = j.motivo_id
  where j.os_id = os.id order by j.criado_em desc limit 1
) ja on true
left join lateral (
  select m.descricao as motivo from public.os_cancelamentos c left join public.motivos m on m.id = c.motivo_id
  where c.os_id = os.id order by c.data desc limit 1
) ca on true;

-- KPIs por mês de abertura e cliente (volume, % no prazo, tempo médio, frustração, cancelamento, pagamentos)
create or replace view public.vw_kpis_mensais with (security_invoker = true) as
select
  loja_id, empresa_cliente_id, cliente, mes_abertura as mes,
  count(*)::int as total,
  count(*) filter (where status = 'vistoriado')::int as vistoriadas,
  count(*) filter (where no_prazo)::int as no_prazo,
  count(*) filter (where foi_frustrada)::int as frustradas,
  count(*) filter (where status = 'cancelado')::int as canceladas,
  round(avg(horas_conclusao), 2) as tempo_medio_horas,
  coalesce(sum(valor) filter (where status <> 'cancelado'), 0) as valor_total,
  coalesce(sum(valor) filter (where status = 'vistoriado' and pagamento_status = 'pendente'), 0) as valor_pendente,
  count(*) filter (where status = 'vistoriado' and pagamento_status = 'pendente')::int as qtd_pagamento_pendente
from public.vw_os_sla
group by loja_id, empresa_cliente_id, cliente, mes_abertura;

revoke all on public.vw_os_sla, public.vw_kpis_mensais from anon;
grant select on public.vw_os_sla, public.vw_kpis_mensais to authenticated;

create index if not exists os_aberta_em_idx on public.ordens_servico (loja_id, aberta_em);
create index if not exists justificativas_os_idx on public.justificativas_atraso (os_id);
create index if not exists frustracoes_os_idx on public.os_frustracoes (os_id);
create index if not exists cancelamentos_os_idx on public.os_cancelamentos (os_id);
