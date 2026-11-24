-- Renavam nos relatórios (decidido em 24/11/2026): vw_os_sla ganha a coluna renavam (no fim, para não mudar as demais).
create or replace view public.vw_os_sla with (security_invoker = true) as
 SELECT os.id, os.loja_id, os.empresa_cliente_id, os.numero, os.placa, os.marca_modelo, os.nome_solicitante,
    COALESCE(e.nome_fantasia, e.razao_social) AS cliente,
    os.status, os.etapa, os.aberta_em, os.concluida_em, os.cancelada_em, os.prazo_em, os.sla_horas, os.total_pausado,
    os.pausado_desde IS NOT NULL AS pausada,
    COALESCE(NULLIF(os.cidade, ''::text), p.cidade) AS cidade,
    COALESCE(NULLIF(os.uf, ''::text), p.uf) AS uf,
    os.local_tipo, os.patio_id, p.nome AS patio, os.vistoriador_id, v.nome AS vistoriador, s.nome AS servico,
    COALESCE(os.valor_final, os.valor_base + os.valor_deslocamento + os.valor_ajuste) AS valor,
    os.valor_final IS NOT NULL AS valor_congelado,
    os.pagamento_status, os.pagamento_forma, os.pagamento_data,
    date_trunc('month'::text, (os.aberta_em AT TIME ZONE 'America/Sao_Paulo'::text))::date AS mes_abertura,
    date_trunc('month'::text, (os.concluida_em AT TIME ZONE 'America/Sao_Paulo'::text))::date AS mes_conclusao,
    CASE WHEN os.status = 'vistoriado'::os_status AND NOT os.sla_indisponivel THEN os.concluida_em <= os.prazo_em ELSE NULL::boolean END AS no_prazo,
    CASE WHEN os.status = 'vistoriado'::os_status AND NOT os.sla_indisponivel THEN round(EXTRACT(epoch FROM os.concluida_em - os.aberta_em - os.total_pausado) / 3600::numeric, 2) ELSE NULL::numeric END AS horas_conclusao,
    CASE WHEN os.status = 'vistoriado'::os_status AND NOT os.sla_indisponivel AND os.concluida_em > os.prazo_em THEN round(EXTRACT(epoch FROM os.concluida_em - os.prazo_em) / 3600::numeric, 2) ELSE NULL::numeric END AS horas_atraso,
    CASE WHEN (os.status = ANY (ARRAY['a_vistoriar'::os_status, 'frustrado'::os_status])) AND os.pausado_desde IS NULL THEN now() > os.prazo_em ELSE false END AS vencida_aberta,
    fr.qtd AS qtd_frustracoes, fr.qtd > 0 AS foi_frustrada, fr.motivo AS motivo_frustracao,
    ja.motivo AS motivo_atraso, ca.motivo AS motivo_cancelamento,
    os.unidade, os.origem_historico,
    os.renavam
   FROM ordens_servico os
     LEFT JOIN empresas_clientes e ON e.id = os.empresa_cliente_id
     LEFT JOIN patios p ON p.id = os.patio_id
     LEFT JOIN vistoriadores v ON v.id = os.vistoriador_id
     LEFT JOIN servicos s ON s.id = os.servico_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS qtd, (array_agg(m.descricao ORDER BY f.ocorrida_em DESC))[1] AS motivo
           FROM os_frustracoes f LEFT JOIN motivos m ON m.id = f.motivo_id WHERE f.os_id = os.id) fr ON true
     LEFT JOIN LATERAL ( SELECT m.descricao AS motivo FROM justificativas_atraso j LEFT JOIN motivos m ON m.id = j.motivo_id
          WHERE j.os_id = os.id ORDER BY j.criado_em DESC LIMIT 1) ja ON true
     LEFT JOIN LATERAL ( SELECT m.descricao AS motivo FROM os_cancelamentos c LEFT JOIN motivos m ON m.id = c.motivo_id
          WHERE c.os_id = os.id ORDER BY c.data DESC LIMIT 1) ca ON true;
