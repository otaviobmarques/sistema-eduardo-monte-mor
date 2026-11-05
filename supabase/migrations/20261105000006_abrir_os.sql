-- Etapa 3 · abertura de OS (individual; reutilizada pela importação em lote)

create or replace function public.normalizar_placa(p text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g'))
$$;

create or replace function public.renavam_valido(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  r text := lpad(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 11, '0');
  pesos int[] := array[3,2,9,8,7,6,5,4,3,2];
  soma int := 0; dv int; i int;
begin
  if length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) = 0 or length(r) <> 11 then return false; end if;
  for i in 1..10 loop soma := soma + substr(r, i, 1)::int * pesos[i]; end loop;
  dv := (soma * 10) % 11;
  if dv = 10 then dv := 0; end if;
  return dv = substr(r, 11, 1)::int;
end $$;

-- Auditoria: no INSERT da OS, grava o solicitante (seção 3: "fica gravado na OS e na auditoria")
create or replace function public.tg_auditoria() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text; v_old jsonb; v_new jsonb;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    insert into public.auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id)
    values (tg_table_name, new.id, '(criado)', null,
            case when v_new ? 'nome_solicitante' then 'Solicitante: ' || (v_new ->> 'nome_solicitante') end, auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id)
    values (tg_table_name, old.id, '(excluído)', to_jsonb(old)::text, null, auth.uid());
    return old;
  end if;
  v_old := to_jsonb(old); v_new := to_jsonb(new);
  for k in select jsonb_object_keys(v_new) loop
    if k in ('updated_at') then continue; end if;
    if (v_old -> k) is distinct from (v_new -> k) then
      insert into public.auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id)
      values (tg_table_name, new.id, k, v_old ->> k, v_new ->> k, auth.uid());
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.tg_auditoria() from public, anon, authenticated;

create or replace function public.abrir_os(
  p_empresa uuid,
  p_nome_solicitante text,
  p_telefone text,
  p_placa text,
  p_renavam text,
  p_marca_modelo text,
  p_ano text,
  p_cor text,
  p_categoria_id uuid,
  p_servico_id uuid,
  p_local_tipo public.local_tipo,
  p_patio_id uuid,
  p_endereco text,
  p_cidade text,
  p_uf text,
  p_observacao text,
  p_lote_id uuid default null,
  p_aberta_em timestamptz default now()
) returns table (id uuid, numero bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_emp record;
  v_serv record;
  v_patio record;
  v_placa text := public.normalizar_placa(p_placa);
  v_renavam text := nullif(regexp_replace(coalesce(p_renavam, ''), '\D', '', 'g'), '');
  v_dup bigint;
  v_sla int;
  v_base numeric(10,2);
  v_desl numeric(10,2) := 0;
  v_cidade text := nullif(trim(p_cidade), '');
  v_uf text := upper(nullif(trim(p_uf), ''));
  v_id uuid; v_num bigint;
  -- abertura nunca no futuro nem retroativa além de 10 min (o lote usa o mesmo horário para todas as linhas)
  v_aberta timestamptz := least(greatest(coalesce(p_aberta_em, now()), now() - interval '10 minutes'), now());
begin
  if public.is_loja() then
    v_empresa := p_empresa;
  else
    v_empresa := public.minha_empresa();
  end if;
  if v_empresa is null then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;

  select * into v_emp from public.empresas_clientes e where e.id = v_empresa;
  if not found or not v_emp.ativo then raise exception 'CLIENTE_INATIVO'; end if;

  if coalesce(trim(p_nome_solicitante), '') = '' then raise exception 'SOLICITANTE_OBRIGATORIO'; end if;
  if v_placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'PLACA_INVALIDA'; end if;
  if v_renavam is not null then
    v_renavam := lpad(v_renavam, 11, '0');
    if not public.renavam_valido(v_renavam) then raise exception 'RENAVAM_INVALIDO'; end if;
  end if;

  select * into v_serv from public.servicos s where s.id = p_servico_id and s.ativo;
  if not found then raise exception 'SERVICO_INVALIDO'; end if;

  if p_local_tipo = 'patio' then
    select * into v_patio from public.patios pt where pt.id = p_patio_id and pt.ativo;
    if not found then raise exception 'PATIO_INVALIDO'; end if;
    v_cidade := v_patio.cidade; v_uf := v_patio.uf;
  else
    if coalesce(trim(p_endereco), '') = '' or v_cidade is null or v_uf is null then raise exception 'ENDERECO_OBRIGATORIO'; end if;
  end if;

  -- Duplicidade: mesma placa com OS a vistoriar ou frustrada do mesmo cliente
  perform pg_advisory_xact_lock(hashtext(v_empresa::text || v_placa));
  select o.numero into v_dup from public.ordens_servico o
   where o.empresa_cliente_id = v_empresa and o.placa = v_placa and o.status in ('a_vistoriar','frustrado')
   order by o.numero desc limit 1;
  if v_dup is not null then raise exception 'DUPLICADA:%', v_dup; end if;

  v_sla := least(v_serv.sla_horas, v_emp.sla_horas, 48);

  -- Preço: tabela própria do cliente (se houver valor) senão tabela padrão
  v_base := null;
  if p_categoria_id is not null then
    if v_emp.usa_tabela_propria then
      select pc.valor into v_base from public.precos_cliente pc
       where pc.empresa_cliente_id = v_empresa and pc.servico_id = p_servico_id and pc.categoria_id = p_categoria_id;
    end if;
    if v_base is null then
      select pr.valor into v_base from public.precos pr where pr.servico_id = p_servico_id and pr.categoria_id = p_categoria_id;
    end if;
  end if;
  v_base := coalesce(v_base, 0);

  if p_local_tipo = 'endereco' then
    select coalesce(t.valor, 0) into v_desl from public.taxas_deslocamento t
     where public.normalizar_texto(t.cidade) = public.normalizar_texto(v_cidade) and t.uf = v_uf;
    v_desl := coalesce(v_desl, 0);
  end if;

  insert into public.ordens_servico (
    empresa_cliente_id, lote_id, nome_solicitante, telefone_contato, placa, renavam, marca_modelo, ano, cor,
    categoria_id, servico_id, local_tipo, patio_id, endereco, cidade, uf, observacao,
    status, etapa, sla_horas, aberta_em, prazo_em, valor_base, valor_deslocamento, created_by
  ) values (
    v_empresa, p_lote_id, trim(p_nome_solicitante), nullif(regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'), ''),
    v_placa, v_renavam, nullif(trim(p_marca_modelo), ''), nullif(trim(p_ano), ''), nullif(trim(p_cor), ''),
    p_categoria_id, p_servico_id, p_local_tipo, case when p_local_tipo = 'patio' then p_patio_id end,
    case when p_local_tipo = 'endereco' then trim(p_endereco) end, v_cidade, v_uf, nullif(trim(p_observacao), ''),
    'a_vistoriar', 'aberta', v_sla, v_aberta, v_aberta + make_interval(hours => v_sla), v_base, v_desl, auth.uid()
  ) returning ordens_servico.id, ordens_servico.numero into v_id, v_num;

  if p_lote_id is null then
    insert into public.notificacoes (destino, empresa_cliente_id, tipo, os_id, titulo, corpo, link)
    values ('loja', v_empresa, 'nova_os', v_id,
            'Nova OS · ' || coalesce(v_emp.nome_fantasia, v_emp.razao_social) || ' · ' || v_placa,
            'OS ' || v_num || ' aberta por ' || trim(p_nome_solicitante), '/loja/os/' || v_num);
  end if;

  return query select v_id, v_num;
end $$;

revoke execute on function public.abrir_os(uuid,text,text,text,text,text,text,text,uuid,uuid,public.local_tipo,uuid,text,text,text,text,uuid,timestamptz) from public, anon;
grant execute on function public.abrir_os(uuid,text,text,text,text,text,text,text,uuid,uuid,public.local_tipo,uuid,text,text,text,text,uuid,timestamptz) to authenticated;

-- Loja completa dados do veículo (ex.: cor). Só campos do veículo; o resto muda pelas operações.
create or replace function public.atualizar_veiculo_os(p_os uuid, p_marca_modelo text, p_ano text, p_cor text, p_categoria_id uuid, p_renavam text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ren text := nullif(regexp_replace(coalesce(p_renavam, ''), '\D', '', 'g'), '');
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if v_ren is not null then
    v_ren := lpad(v_ren, 11, '0');
    if not public.renavam_valido(v_ren) then raise exception 'RENAVAM_INVALIDO'; end if;
  end if;
  update public.ordens_servico set marca_modelo = nullif(trim(p_marca_modelo), ''), ano = nullif(trim(p_ano), ''),
    cor = nullif(trim(p_cor), ''), categoria_id = p_categoria_id, renavam = v_ren
   where id = p_os;
  insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
  values (p_os, 'Dados do veículo atualizados', null, null, auth.uid(), public.meu_nome());
end $$;
revoke execute on function public.atualizar_veiculo_os(uuid,text,text,text,uuid,text) from public, anon;
grant execute on function public.atualizar_veiculo_os(uuid,text,text,text,uuid,text) to authenticated;
