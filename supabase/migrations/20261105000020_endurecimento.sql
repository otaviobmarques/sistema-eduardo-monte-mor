-- Etapa 10 · Endurecimento: ajustes apontados pelos alertas de segurança e desempenho do Supabase.

-- Função de gatilho não deve ser chamável pela API
revoke all on function public.tg_alerta_pagamento() from public, anon, authenticated;

-- auth.uid() avaliado uma vez por consulta (e não por linha)
drop policy if exists proprio_perfil on public.perfis_usuario;
create policy proprio_perfil on public.perfis_usuario for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists propria_inscricao on public.push_inscricoes;
create policy propria_inscricao on public.push_inscricoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Índices para as chaves usadas em junções, filtros e exclusões em cascata
create index if not exists notificacoes_os_idx on public.notificacoes (os_id);
create index if not exists notificacoes_lote_idx on public.notificacoes (lote_id);
create index if not exists notificacoes_empresa_idx on public.notificacoes (empresa_cliente_id);
create index if not exists os_vistoriador_idx on public.ordens_servico (vistoriador_id);
create index if not exists os_patio_idx on public.ordens_servico (patio_id);
create index if not exists os_servico_idx on public.ordens_servico (servico_id);
create index if not exists os_categoria_idx on public.ordens_servico (categoria_id);
create index if not exists lote_linhas_os_idx on public.lote_linhas (os_id);
create index if not exists lotes_empresa_idx on public.lotes_importacao (empresa_cliente_id);
create index if not exists patio_apelidos_patio_idx on public.patio_apelidos (patio_id);
create index if not exists push_inscricoes_user_idx on public.push_inscricoes (user_id);
create index if not exists ajustes_preco_os_idx on public.os_ajustes_preco (os_id);
create index if not exists frustracoes_pendencia_idx on public.os_frustracoes (pendencia_id);
create index if not exists precos_categoria_idx on public.precos (categoria_id);
create index if not exists precos_cliente_servico_idx on public.precos_cliente (servico_id);

-- Retenção do registro de acessos (LGPD: guardar só o necessário) — 180 dias
create or replace function public.limpar_acessos_antigos() returns int
language sql security definer set search_path = '' as $$
  with apagados as (delete from public.acessos_log where em < now() - interval '180 days' returning 1)
  select count(*)::int from apagados;
$$;
revoke all on function public.limpar_acessos_antigos() from public, anon, authenticated;
select cron.schedule('limpar-acessos', '17 6 * * 0', $$select public.limpar_acessos_antigos()$$);

-- Motivo da falha no registro de acessos (senha incorreta, bloqueado, limite de tentativas, …)
alter table public.acessos_log add column if not exists motivo text;
create index if not exists acessos_log_loja_em_idx on public.acessos_log (loja_id, em desc);
