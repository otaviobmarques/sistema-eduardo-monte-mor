-- Multi-Loja (2/3): Lojas franqueadas, faturas da plataforma, loja_id em todos os dados e RLS por Loja

create type public.fatura_tipo as enum ('start', 'mensalidade', 'avulsa');
create type public.fatura_status as enum ('pendente', 'pago', 'vencido', 'cancelado');

create table public.lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  razao_social text,
  cnpj text unique,
  endereco text, cidade text, uf text, cep text,
  telefone text, email text,
  responsavel text,
  ativo boolean not null default true,
  bloqueada boolean not null default false,
  bloqueada_em timestamptz,
  motivo_bloqueio text,
  plano_mensal numeric(10,2) not null default 0 check (plano_mensal >= 0),
  taxa_start numeric(10,2) not null default 0 check (taxa_start >= 0),
  dia_vencimento int not null default 10 check (dia_vencimento between 1 and 28),
  dias_tolerancia int not null default 10 check (dias_tolerancia between 0 and 60),
  asaas_customer_id text,
  asaas_subscription_id text,
  proximo_numero_os bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.lojas for each row execute function public.tg_set_updated_at();

create table public.faturas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  tipo public.fatura_tipo not null,
  descricao text not null,
  valor numeric(10,2) not null check (valor >= 0),
  vencimento date not null,
  status public.fatura_status not null default 'pendente',
  asaas_payment_id text unique,
  link_pagamento text,
  forma_pagamento text,
  pago_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.faturas(loja_id, vencimento);
create trigger set_updated_at before update on public.faturas for each row execute function public.tg_set_updated_at();

-- Loja atual: Auto Visão Monte Mor (Eduardo). Todos os dados existentes passam a ser dela.
insert into public.lojas (nome, razao_social, cidade, uf, telefone, responsavel)
values ('Auto Visão Monte Mor', 'Auto Visão Monte Mor', 'Monte Mor', 'SP', '19999644000', 'Eduardo Santicioli');

do $$
declare v uuid := (select id from public.lojas order by created_at limit 1); t text;
begin
  foreach t in array array['empresas_clientes','perfis_usuario','patios','patio_apelidos','servicos','precos','precos_cliente',
    'taxas_deslocamento','vistoriadores','motivos','feriados','lotes_importacao','ordens_servico','notificacoes','configuracoes',
    'acessos_log','auditoria']
  loop
    execute format('alter table public.%I add column loja_id uuid references public.lojas(id)', t);
    execute format('update public.%I set loja_id = %L', t, v);
    if t not in ('perfis_usuario', 'acessos_log', 'auditoria') then
      execute format('alter table public.%I alter column loja_id set not null', t);
    end if;
    execute format('create index on public.%I(loja_id)', t);
  end loop;
end $$;

-- Restrições únicas passam a valer por Loja
alter table public.empresas_clientes drop constraint empresas_clientes_cnpj_key, add unique (loja_id, cnpj);
alter table public.patios drop constraint patios_nome_key, add unique (loja_id, nome);
alter table public.patio_apelidos drop constraint patio_apelidos_apelido_key, add unique (loja_id, apelido);
alter table public.servicos drop constraint servicos_nome_key, add unique (loja_id, nome);
alter table public.taxas_deslocamento drop constraint taxas_deslocamento_cidade_uf_key, add unique (loja_id, cidade, uf);
alter table public.motivos drop constraint motivos_tipo_descricao_key, add unique (loja_id, tipo, descricao);
alter table public.feriados drop constraint feriados_data_key, add unique (loja_id, data);
drop index if exists public.perfis_um_login_por_empresa;
create unique index perfis_um_login_por_empresa on public.perfis_usuario(empresa_cliente_id) where perfil = 'cliente';

-- Configurações: uma linha por Loja
alter table public.configuracoes drop constraint configuracoes_pkey, drop constraint configuracoes_id_check;
alter table public.configuracoes drop column id;
alter table public.configuracoes add primary key (loja_id);

-- Numeração de OS por Loja (cada franqueada começa no 1)
alter table public.ordens_servico drop constraint ordens_servico_numero_key;
alter table public.ordens_servico alter column numero drop default;
alter table public.ordens_servico add constraint ordens_servico_loja_numero_key unique (loja_id, numero);
drop sequence if exists public.ordens_servico_numero_seq;
update public.lojas l set proximo_numero_os = coalesce((select max(numero) + 1 from public.ordens_servico o where o.loja_id = l.id), 1);

-- Perfis: admin (sem Loja), loja (gestor de uma Loja), cliente (empresa de uma Loja)
alter table public.perfis_usuario drop constraint perfis_usuario_check;
alter table public.perfis_usuario add constraint perfis_usuario_check check (
  (perfil = 'admin' and loja_id is null and empresa_cliente_id is null)
  or (perfil = 'loja' and loja_id is not null and empresa_cliente_id is null)
  or (perfil = 'cliente' and loja_id is not null and empresa_cliente_id is not null));

-- ───────── Helpers de perfil
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfis_usuario where user_id = auth.uid() and perfil = 'admin' and not bloqueado)
$$;

-- Loja do usuário (gestor ou cliente) — nula se a Loja estiver inativa ou bloqueada por inadimplência
create or replace function public.minha_loja() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.loja_id from public.perfis_usuario p join public.lojas l on l.id = p.loja_id
   where p.user_id = auth.uid() and not p.bloqueado and l.ativo and not l.bloqueada
$$;

create or replace function public.is_loja() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfis_usuario p join public.lojas l on l.id = p.loja_id
    where p.user_id = auth.uid() and p.perfil = 'loja' and not p.bloqueado and l.ativo and not l.bloqueada)
$$;

create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.empresa_cliente_id from public.perfis_usuario p join public.lojas l on l.id = p.loja_id
   where p.user_id = auth.uid() and p.perfil = 'cliente' and not p.bloqueado and l.ativo and not l.bloqueada
$$;

create or replace function public.os_da_minha_loja(p_os uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_loja() and exists(select 1 from public.ordens_servico o where o.id = p_os and o.loja_id = public.minha_loja())
$$;

create or replace function public.os_visivel(p_os uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.os_da_minha_loja(p_os) or exists(
    select 1 from public.ordens_servico o where o.id = p_os and o.empresa_cliente_id = public.minha_empresa())
$$;

revoke execute on function public.is_admin(), public.minha_loja(), public.os_da_minha_loja(uuid) from public, anon;
grant execute on function public.is_admin(), public.minha_loja(), public.os_da_minha_loja(uuid) to authenticated;

-- Inserções feitas pela própria Loja herdam a Loja do usuário
do $$
declare t text;
begin
  foreach t in array array['empresas_clientes','patios','patio_apelidos','servicos','precos','precos_cliente',
    'taxas_deslocamento','vistoriadores','motivos','feriados','lotes_importacao','notificacoes']
  loop
    execute format('alter table public.%I alter column loja_id set default public.minha_loja()', t);
  end loop;
end $$;

-- Auditoria registra a Loja do registro
create or replace function public.tg_auditoria() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text; v_old jsonb; v_new jsonb; v_loja uuid;
begin
  v_new := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_loja := coalesce((v_new ->> 'loja_id')::uuid,
    (select o.loja_id from public.ordens_servico o where o.id = (v_new ->> 'os_id')::uuid));
  if tg_op = 'INSERT' then
    insert into public.auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id, loja_id)
    values (tg_table_name, new.id, '(criado)', null,
            case when v_new ? 'nome_solicitante' then 'Solicitante: ' || (v_new ->> 'nome_solicitante') end, auth.uid(), v_loja);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id, loja_id)
    values (tg_table_name, old.id, '(excluído)', to_jsonb(old)::text, null, auth.uid(), v_loja);
    return old;
  end if;
  v_old := to_jsonb(old);
  for k in select jsonb_object_keys(v_new) loop
    if k in ('updated_at') then continue; end if;
    if (v_old -> k) is distinct from (v_new -> k) then
      insert into public.auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id, loja_id)
      values (tg_table_name, new.id, k, v_old ->> k, v_new ->> k, auth.uid(), v_loja);
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.tg_auditoria() from public, anon, authenticated;
create trigger auditoria after insert or update or delete on public.lojas for each row execute function public.tg_auditoria();

-- ───────── RLS: recria todas as policies com isolamento por Loja
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.lojas enable row level security;
alter table public.faturas enable row level security;

do $$
declare t text;
begin
  -- Administrador: acesso total a tudo
  foreach t in array array['lojas','faturas','empresas_clientes','perfis_usuario','patios','patio_apelidos','categorias_veiculo',
    'servicos','precos','precos_cliente','taxas_deslocamento','vistoriadores','motivos','configuracoes','feriados',
    'lotes_importacao','lote_linhas','ordens_servico','os_agendamentos','pendencias','os_frustracoes','os_cancelamentos',
    'sla_pausas','justificativas_atraso','os_ajustes_preco','anexos','historico_os','auditoria','notificacoes','push_inscricoes','acessos_log']
  loop
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;

  -- Gestor da Loja: tudo da própria Loja
  foreach t in array array['empresas_clientes','patios','patio_apelidos','servicos','precos','precos_cliente','taxas_deslocamento',
    'vistoriadores','motivos','configuracoes','feriados','lotes_importacao','ordens_servico','notificacoes']
  loop
    execute format('create policy loja_all on public.%I for all to authenticated using (public.is_loja() and loja_id = public.minha_loja()) with check (public.is_loja() and loja_id = public.minha_loja())', t);
  end loop;
  foreach t in array array['os_agendamentos','pendencias','os_frustracoes','os_cancelamentos','sla_pausas','justificativas_atraso',
    'os_ajustes_preco','anexos','historico_os']
  loop
    execute format('create policy loja_all on public.%I for all to authenticated using (public.os_da_minha_loja(os_id)) with check (public.os_da_minha_loja(os_id))', t);
    execute format('create policy cliente_le on public.%I for select to authenticated using (public.minha_empresa() is not null and public.os_visivel(os_id))', t);
  end loop;

  -- Cliente: lê os cadastros de referência da Loja que o atende
  foreach t in array array['patios','patio_apelidos','servicos','precos','taxas_deslocamento','motivos','configuracoes','feriados','vistoriadores']
  loop
    execute format('create policy cliente_le on public.%I for select to authenticated using (public.minha_empresa() is not null and loja_id = public.minha_loja())', t);
  end loop;
end $$;

create policy le_categorias on public.categorias_veiculo for select to authenticated using (public.meu_perfil() is not null);
create policy loja_le_propria on public.lojas for select to authenticated using (id = public.minha_loja());
create policy loja_le_faturas on public.faturas for select to authenticated using (public.is_loja() and loja_id = public.minha_loja());
create policy proprio_perfil on public.perfis_usuario for select to authenticated using (user_id = auth.uid());
create policy loja_le_perfis on public.perfis_usuario for select to authenticated using (public.is_loja() and loja_id = public.minha_loja());
create policy loja_le_auditoria on public.auditoria for select to authenticated using (public.is_loja() and loja_id = public.minha_loja());
create policy loja_le_acessos on public.acessos_log for select to authenticated using (public.is_loja() and loja_id = public.minha_loja());
create policy loja_all on public.lote_linhas for all to authenticated
  using (public.is_loja() and exists(select 1 from public.lotes_importacao l where l.id = lote_id and l.loja_id = public.minha_loja()))
  with check (public.is_loja() and exists(select 1 from public.lotes_importacao l where l.id = lote_id and l.loja_id = public.minha_loja()));

create policy cliente_le on public.empresas_clientes for select to authenticated using (id = public.minha_empresa());
create policy cliente_le on public.precos_cliente for select to authenticated using (empresa_cliente_id = public.minha_empresa());
create policy cliente_le on public.lotes_importacao for select to authenticated using (empresa_cliente_id = public.minha_empresa());
create policy cliente_le on public.lote_linhas for select to authenticated
  using (exists(select 1 from public.lotes_importacao l where l.id = lote_id and l.empresa_cliente_id = public.minha_empresa()));
create policy cliente_le on public.ordens_servico for select to authenticated using (empresa_cliente_id = public.minha_empresa());
create policy cliente_le on public.notificacoes for select to authenticated
  using (destino = 'cliente' and empresa_cliente_id = public.minha_empresa());
create policy cliente_marca_vista on public.notificacoes for update to authenticated
  using (destino = 'cliente' and empresa_cliente_id = public.minha_empresa())
  with check (destino = 'cliente' and empresa_cliente_id = public.minha_empresa());
create policy propria_inscricao on public.push_inscricoes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage: o gestor só alcança arquivos de empresas da própria Loja
drop policy if exists loja_storage on storage.objects;
create policy loja_storage on storage.objects for all to authenticated
  using (bucket_id in ('laudos','anexos','importacoes') and public.is_loja() and exists(
    select 1 from public.empresas_clientes e where e.id::text = (storage.foldername(name))[1] and e.loja_id = public.minha_loja()))
  with check (bucket_id in ('laudos','anexos','importacoes') and public.is_loja() and exists(
    select 1 from public.empresas_clientes e where e.id::text = (storage.foldername(name))[1] and e.loja_id = public.minha_loja()));
create policy admin_storage on storage.objects for select to authenticated
  using (bucket_id in ('laudos','anexos','importacoes') and public.is_admin());

alter publication supabase_realtime add table public.faturas;
