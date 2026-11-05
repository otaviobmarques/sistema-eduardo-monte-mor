-- Etapa 6 · Importação em lote
alter table public.lote_linhas add column if not exists placa_corrigida boolean not null default false;
alter table public.lote_linhas add column if not exists os_id uuid references public.ordens_servico(id) on delete set null;

-- Cria uma OS por linha válida numa única transação, com o mesmo aberta_em, e uma notificação só para o lote.
create or replace function public.confirmar_lote(p_lote uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_lote record; v_emp record; v_cat uuid; v_serv uuid; v_l record; v_os record; v_n int := 0;
  v_agora timestamptz := now();
begin
  select * into v_lote from public.lotes_importacao where id = p_lote for update;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  if not public.is_loja() and v_lote.empresa_cliente_id is distinct from public.minha_empresa() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_lote.status <> 'previa' then raise exception 'LOTE_JA_PROCESSADO'; end if;
  select * into v_emp from public.empresas_clientes where id = v_lote.empresa_cliente_id;
  select id into v_cat from public.categorias_veiculo order by ordem limit 1;          -- padrão: Carro
  select id into v_serv from public.servicos where padrao and ativo limit 1;

  for v_l in select * from public.lote_linhas where lote_id = p_lote and resultado = 'ok' order by linha loop
    begin
      select * into v_os from public.abrir_os(
        v_lote.empresa_cliente_id, v_lote.nome_solicitante, v_lote.telefone_contato, v_l.placa_normalizada, v_l.renavam,
        v_l.modelo, null, null, v_cat, coalesce(v_l.servico_id, v_serv), 'patio', v_l.patio_id, null, null, null,
        v_l.observacao, p_lote, v_agora);
    exception when others then
      raise exception 'LINHA_%:%:%', v_l.linha, v_l.placa_normalizada, sqlerrm;
    end;
    update public.lote_linhas set os_id = v_os.id where id = v_l.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'LOTE_SEM_LINHAS_VALIDAS'; end if;

  update public.lotes_importacao set status = 'confirmado', confirmado_em = v_agora, validas = v_n where id = p_lote;
  insert into public.notificacoes (destino, empresa_cliente_id, tipo, lote_id, titulo, corpo, link)
  values ('loja', v_lote.empresa_cliente_id, 'novo_lote', p_lote,
          'Novo lote · ' || coalesce(v_emp.nome_fantasia, v_emp.razao_social) || ' · ' || v_n || ' OS',
          'Enviado por ' || v_lote.nome_solicitante, '/loja/importar?lote=' || p_lote);
  return v_n;
end $$;

create or replace function public.descartar_lote(p_lote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_lote record;
begin
  select * into v_lote from public.lotes_importacao where id = p_lote for update;
  if not found then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  if not public.is_loja() and v_lote.empresa_cliente_id is distinct from public.minha_empresa() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_lote.status <> 'previa' then raise exception 'LOTE_JA_PROCESSADO'; end if;
  update public.lotes_importacao set status = 'descartado' where id = p_lote;
end $$;

revoke execute on function public.confirmar_lote(uuid) from public, anon;
grant execute on function public.confirmar_lote(uuid) to authenticated;
revoke execute on function public.descartar_lote(uuid) from public, anon;
grant execute on function public.descartar_lote(uuid) to authenticated;
