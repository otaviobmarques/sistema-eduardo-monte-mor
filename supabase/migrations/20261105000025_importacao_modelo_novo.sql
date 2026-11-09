-- Importação em lote · modelo novo (planilha de controle: Data, Cliente/unidade, Solicitação, Placa, Veículo, Renavam,
-- Ano/Modelo, Cor, Serviço, Valor, Deslocamento, Forma de Pagamento, Pagamento Efetuado, Status, Obs.).
-- Decisões (09/11/2026): a unidade fica como campo da OS; o pátio é reconhecido pela unidade; quando a LOJA importa,
-- valem a Data, o Status, o Pagamento e o Valor da planilha (histórico); quando o CLIENTE importa, tudo vira OS nova.

-- OS: unidade do cliente e marcas de importação do histórico
alter table public.ordens_servico
  add column if not exists unidade text,
  add column if not exists origem_historico boolean not null default false,
  add column if not exists sla_indisponivel boolean not null default false;
comment on column public.ordens_servico.unidade is 'Unidade/filial do cliente (ex.: Despachante Dukar SP Utinga)';
comment on column public.ordens_servico.origem_historico is 'OS trazida da planilha de controle (importação feita pela Loja)';
comment on column public.ordens_servico.sla_indisponivel is 'Concluída no histórico sem horário do laudo: fica fora das métricas de prazo';
create index if not exists os_unidade_idx on public.ordens_servico (loja_id, unidade) where unidade is not null;

-- Lote: modo (novo = pedidos do cliente; historico = Loja trazendo a planilha) e campos extras por linha
alter table public.lotes_importacao add column if not exists modo text not null default 'novo' check (modo in ('novo', 'historico'));
alter table public.lote_linhas
  add column if not exists unidade text,
  add column if not exists data_planilha date,
  add column if not exists nome_solicitante text,
  add column if not exists telefone text,
  add column if not exists ano text,
  add column if not exists cor text,
  add column if not exists valor numeric(10,2),
  add column if not exists deslocamento numeric(10,2),
  add column if not exists pagamento_forma text,
  add column if not exists pagamento_forma_original text,
  add column if not exists pagamento_status public.pagamento_status,
  add column if not exists status_os public.os_status;

-- Gatilhos: OS do histórico não exigem justificativa de atraso nem disparam alerta de pagamento pendente
create or replace function public.tg_exigir_justificativa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'vistoriado' and old.status is distinct from 'vistoriado' and not new.origem_historico
     and coalesce(new.concluida_em, now()) > new.prazo_em
     and not exists (select 1 from public.justificativas_atraso j where j.os_id = new.id) then
    raise exception 'JUSTIFICATIVA_OBRIGATORIA';
  end if;
  return new;
end $$;

create or replace function public.tg_alerta_pagamento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_forma public.forma_cobranca; v_nome text;
begin
  if new.status = 'vistoriado' and old.status is distinct from 'vistoriado' and not new.origem_historico
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
revoke all on function public.tg_exigir_justificativa() from public, anon, authenticated;
revoke all on function public.tg_alerta_pagamento() from public, anon, authenticated;

-- Confirmação do lote
create or replace function public.confirmar_lote(p_lote uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_lote record; v_emp record; v_cat uuid; v_serv uuid; v_l record; v_os record; v_n int := 0;
  v_agora timestamptz := now(); v_hist boolean; v_abertura timestamptz; v_mot uuid; v_desc text; v_obs text;
  v_mot_canc uuid;
begin
  select * into v_lote from public.lotes_importacao where id = p_lote for update;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  if not (public.is_loja() and v_lote.loja_id = public.minha_loja()) and v_lote.empresa_cliente_id is distinct from public.minha_empresa() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_lote.status <> 'previa' then raise exception 'LOTE_JA_PROCESSADO'; end if;
  -- Histórico só quando quem confirma é a Loja dona do lote
  v_hist := v_lote.modo = 'historico' and public.is_loja() and v_lote.loja_id = public.minha_loja();
  select * into v_emp from public.empresas_clientes where id = v_lote.empresa_cliente_id;
  select id into v_cat from public.categorias_veiculo order by ordem limit 1;          -- padrão: Carro
  select id into v_serv from public.servicos where padrao and ativo and loja_id = v_lote.loja_id limit 1;
  select id into v_mot_canc from public.motivos where loja_id = v_lote.loja_id and tipo = 'cancelamento' and ativo
   order by (descricao ilike 'outro%') desc, ordem limit 1;

  for v_l in select * from public.lote_linhas where lote_id = p_lote and resultado = 'ok' order by linha loop
    begin
      select * into v_os from public.abrir_os(
        v_lote.empresa_cliente_id, coalesce(nullif(trim(v_l.nome_solicitante), ''), v_lote.nome_solicitante),
        coalesce(nullif(v_l.telefone, ''), v_lote.telefone_contato), v_l.placa_normalizada, v_l.renavam,
        v_l.modelo, nullif(trim(v_l.ano), ''), nullif(trim(v_l.cor), ''), v_cat, coalesce(v_l.servico_id, v_serv), 'patio', v_l.patio_id, null, null, null,
        v_l.observacao, p_lote, v_agora);
      update public.ordens_servico o set unidade = nullif(trim(v_l.unidade), '') where o.id = v_os.id;

      if v_hist then
        v_abertura := case when v_l.data_planilha is not null and v_l.data_planilha <= (v_agora at time zone 'America/Sao_Paulo')::date
                           then least((v_l.data_planilha + time '08:00') at time zone 'America/Sao_Paulo', v_agora) else v_agora end;
        v_obs := nullif(trim(v_l.observacao), '');
        -- Data, valor e pagamento da planilha; sem rajada de alertas de prazo das OS antigas
        update public.ordens_servico o set
          aberta_em = v_abertura, prazo_em = v_abertura + make_interval(hours => o.sla_horas),
          origem_historico = true, alerta1_enviado = true, alerta2_enviado = true, vencida_notificada = true,
          valor_base = coalesce(v_l.valor, o.valor_base), valor_deslocamento = coalesce(v_l.deslocamento, o.valor_deslocamento),
          pagamento_status = coalesce(v_l.pagamento_status, 'pendente'),
          pagamento_forma = case when v_l.pagamento_status in ('pago', 'faturado') then coalesce(v_l.pagamento_forma, 'faturamento') end,
          pagamento_data = case when v_l.pagamento_status in ('pago', 'faturado') then (v_abertura at time zone 'America/Sao_Paulo')::date end,
          pagamento_obs = case when v_l.pagamento_status in ('pago', 'faturado') then
            'Importado da planilha' || coalesce(' · ' || nullif(v_l.pagamento_forma_original, ''), '') end
        where o.id = v_os.id;

        if v_l.status_os = 'vistoriado' then
          update public.ordens_servico o set status = 'vistoriado', etapa = null, concluida_em = v_abertura, sla_indisponivel = true,
                 valor_final = o.valor_base + o.valor_deslocamento + o.valor_ajuste
           where o.id = v_os.id;
          perform public.historico(v_os.id, 'Importada da planilha como Vistoriada', null, to_char(v_abertura at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'));
        elsif v_l.status_os = 'frustrado' then
          v_desc := coalesce(v_obs, 'Frustrada (importada da planilha)');
          select id into v_mot from public.motivos where loja_id = v_lote.loja_id and tipo = 'frustracao' and ativo
           order by case
             when v_desc ilike '%localiza%' then (descricao ilike '%localiza%')::int
             when v_desc ilike '%autoriza%' then (descricao ilike '%autoriza%')::int
             when v_desc ilike '%document%' then (descricao ilike '%document%')::int
             when v_desc ilike '%agend%' then (descricao ilike '%agend%')::int
             else (descricao ilike 'outro%')::int end desc, (descricao ilike 'outro%') desc, ordem limit 1;
          perform public.frustrar_os(v_os.id, v_mot, least(v_abertura, v_agora), v_desc, 'cliente', (v_agora at time zone 'America/Sao_Paulo')::date + 3);
        elsif v_l.status_os = 'cancelado' then
          perform public.cancelar_os(v_os.id, coalesce(nullif(trim(v_l.nome_solicitante), ''), v_lote.nome_solicitante), v_mot_canc,
            coalesce(v_obs, 'Cancelada (importada da planilha)'));
        end if;
      end if;
    exception when others then
      raise exception 'LINHA_%:%:%', v_l.linha, v_l.placa_normalizada, sqlerrm;
    end;
    update public.lote_linhas set os_id = v_os.id where id = v_l.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'LOTE_SEM_LINHAS_VALIDAS'; end if;

  update public.lotes_importacao set status = 'confirmado', confirmado_em = v_agora, validas = v_n where id = p_lote;
  -- Aviso à Loja só quando o lote vem do cliente (a Loja não precisa ser avisada do que ela mesma importou)
  if not (public.is_loja() and v_lote.loja_id = public.minha_loja()) then
    insert into public.notificacoes (destino, loja_id, empresa_cliente_id, tipo, lote_id, titulo, corpo, link)
    values ('loja', v_lote.loja_id, v_lote.empresa_cliente_id, 'novo_lote', p_lote,
            'Novo lote · ' || coalesce(v_emp.nome_fantasia, v_emp.razao_social) || ' · ' || v_n || ' OS',
            'Enviado por ' || v_lote.nome_solicitante, '/loja/importar?lote=' || p_lote);
  end if;
  return v_n;
end $$;
revoke all on function public.confirmar_lote(uuid) from public, anon;
grant execute on function public.confirmar_lote(uuid) to authenticated;

-- Relatórios: unidade disponível; OS do histórico concluídas sem horário ficam fora das métricas de prazo
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
  case when os.status = 'vistoriado' and not os.sla_indisponivel then os.concluida_em <= os.prazo_em end as no_prazo,
  case when os.status = 'vistoriado' and not os.sla_indisponivel
       then round((extract(epoch from (os.concluida_em - os.aberta_em - os.total_pausado)) / 3600)::numeric, 2) end as horas_conclusao,
  case when os.status = 'vistoriado' and not os.sla_indisponivel and os.concluida_em > os.prazo_em
       then round((extract(epoch from (os.concluida_em - os.prazo_em)) / 3600)::numeric, 2) end as horas_atraso,
  case when os.status in ('a_vistoriar', 'frustrado') and os.pausado_desde is null then now() > os.prazo_em else false end as vencida_aberta,
  fr.qtd as qtd_frustracoes, fr.qtd > 0 as foi_frustrada, fr.motivo as motivo_frustracao,
  ja.motivo as motivo_atraso, ca.motivo as motivo_cancelamento,
  os.unidade, os.origem_historico
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
