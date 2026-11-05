-- Sistema de OS – Auto Visão · schema V1
create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- ───────────── Enums
create type public.perfil_tipo as enum ('loja','cliente');
create type public.forma_cobranca as enum ('faturado','avulso');
create type public.motivo_tipo as enum ('frustracao','cancelamento','atraso','pendencia','reagendamento');
create type public.contagem_tipo as enum ('corridas','uteis');
create type public.lote_status as enum ('previa','confirmado','descartado');
create type public.linha_resultado as enum ('ok','erro','duplicada');
create type public.local_tipo as enum ('patio','endereco');
create type public.os_status as enum ('a_vistoriar','frustrado','vistoriado','cancelado');
create type public.os_etapa as enum ('aberta','agendada','em_execucao','laudo_em_elaboracao');
create type public.pagamento_status as enum ('pendente','pago','faturado');
create type public.pendencia_tipo as enum ('documental','falta_autorizacao','nao_localizado','agendamento','outra');
create type public.responsavel_tipo as enum ('cliente','loja');
create type public.pausa_origem as enum ('frustracao','pendencia','aprovacao_preco');
create type public.ajuste_status as enum ('pendente','aprovado','recusado');
create type public.anexo_tipo as enum ('laudo','foto','documento','comprovante','justificativa');
create type public.notif_destino as enum ('loja','cliente');

-- ───────────── updated_at helper
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────── Cadastros
create table public.empresas_clientes (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique,
  razao_social text not null,
  nome_fantasia text,
  endereco text, cidade text, uf text, cep text,
  telefone text, email text,
  responsavel_financeiro text,
  responsavel_acesso text,
  forma_cobranca public.forma_cobranca not null default 'faturado',
  usa_tabela_propria boolean not null default false,
  sla_horas int not null default 48 check (sla_horas > 0 and sla_horas <= 48),
  ativo boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.perfis_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  perfil public.perfil_tipo not null,
  empresa_cliente_id uuid references public.empresas_clientes(id),
  login text not null unique,
  nome_exibicao text not null,
  deve_trocar_senha boolean not null default true,
  senha_expira_em timestamptz,
  bloqueado boolean not null default false,
  primeiro_acesso_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (perfil = 'loja' or empresa_cliente_id is not null)
);
create index on public.perfis_usuario(empresa_cliente_id);

create table public.patios (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  endereco text, cidade text, uf text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patio_apelidos (
  id uuid primary key default gen_random_uuid(),
  patio_id uuid not null references public.patios(id) on delete cascade,
  apelido text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categorias_veiculo (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  sla_horas int not null default 48 check (sla_horas > 0 and sla_horas <= 48),
  padrao boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.precos (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references public.servicos(id) on delete cascade,
  categoria_id uuid not null references public.categorias_veiculo(id) on delete cascade,
  valor numeric(10,2) not null default 0 check (valor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (servico_id, categoria_id)
);

create table public.precos_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_cliente_id uuid not null references public.empresas_clientes(id) on delete cascade,
  servico_id uuid not null references public.servicos(id) on delete cascade,
  categoria_id uuid not null references public.categorias_veiculo(id) on delete cascade,
  valor numeric(10,2) not null check (valor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_cliente_id, servico_id, categoria_id)
);

create table public.taxas_deslocamento (
  id uuid primary key default gen_random_uuid(),
  cidade text not null,
  uf text not null,
  valor numeric(10,2) not null default 0 check (valor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cidade, uf)
);

create table public.vistoriadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.motivos (
  id uuid primary key default gen_random_uuid(),
  tipo public.motivo_tipo not null,
  descricao text not null,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo, descricao)
);

create table public.configuracoes (
  id int primary key default 1 check (id = 1),
  alerta1_horas int not null default 24,
  alerta2_horas_antes int not null default 8,
  contagem public.contagem_tipo not null default 'corridas',
  horario_util jsonb not null default '{"dias":[1,2,3,4,5],"inicio":"08:00","fim":"18:00"}',
  escalonar_minutos int not null default 30,
  ajuste_preco_habilitado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  descricao text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Importação
create table public.lotes_importacao (
  id uuid primary key default gen_random_uuid(),
  empresa_cliente_id uuid not null references public.empresas_clientes(id),
  arquivo_path text,
  arquivo_nome text,
  nome_solicitante text not null,
  telefone_contato text,
  total int not null default 0,
  validas int not null default 0,
  com_erro int not null default 0,
  duplicadas int not null default 0,
  status public.lote_status not null default 'previa',
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lote_linhas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_importacao(id) on delete cascade,
  linha int not null,
  dados_originais jsonb not null,
  placa_normalizada text,
  renavam text,
  modelo text,
  patio_id uuid references public.patios(id),
  servico_id uuid references public.servicos(id),
  observacao text,
  resultado public.linha_resultado not null,
  mensagens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lote_linhas(lote_id);

-- ───────────── OS
create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  numero bigserial unique,
  empresa_cliente_id uuid not null references public.empresas_clientes(id),
  lote_id uuid references public.lotes_importacao(id),
  nome_solicitante text not null,
  telefone_contato text,
  placa text not null,
  renavam text,
  marca_modelo text,
  ano text,
  cor text,
  categoria_id uuid references public.categorias_veiculo(id),
  servico_id uuid not null references public.servicos(id),
  local_tipo public.local_tipo not null default 'patio',
  patio_id uuid references public.patios(id),
  endereco text,
  cidade text,
  uf text,
  observacao text,
  status public.os_status not null default 'a_vistoriar',
  etapa public.os_etapa default 'aberta',
  vistoriador_id uuid references public.vistoriadores(id),
  sla_horas int not null default 48,
  aberta_em timestamptz not null default now(),
  prazo_em timestamptz not null,
  pausado_desde timestamptz,
  total_pausado interval not null default '0',
  alerta1_enviado boolean not null default false,
  alerta2_enviado boolean not null default false,
  vencida_notificada boolean not null default false,
  escalonada boolean not null default false,
  concluida_em timestamptz,
  cancelada_em timestamptz,
  valor_base numeric(10,2) not null default 0,
  valor_deslocamento numeric(10,2) not null default 0,
  valor_ajuste numeric(10,2) not null default 0,
  valor_final numeric(10,2),
  pagamento_status public.pagamento_status not null default 'pendente',
  pagamento_forma text,
  pagamento_data date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (local_tipo = 'endereco' or patio_id is not null)
);
create index on public.ordens_servico(placa);
create index on public.ordens_servico(renavam);
create index on public.ordens_servico(empresa_cliente_id, status);
create index on public.ordens_servico(prazo_em) where status = 'a_vistoriar';
create index on public.ordens_servico(lote_id);
create index ordens_servico_busca_trgm on public.ordens_servico
  using gin ((coalesce(marca_modelo,'') || ' ' || coalesce(nome_solicitante,'')) gin_trgm_ops);

create table public.os_agendamentos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  versao int not null,
  data_hora timestamptz not null,
  local_texto text,
  vistoriador_id uuid references public.vistoriadores(id),
  motivo_id uuid references public.motivos(id),
  motivo_texto text,
  atual boolean not null default true,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (os_id, versao)
);
create index on public.os_agendamentos(vistoriador_id, data_hora);

create table public.pendencias (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  tipo public.pendencia_tipo not null,
  descricao text not null,
  responsavel public.responsavel_tipo not null,
  previsao date,
  resolvida_em timestamptz,
  resolucao_texto text,
  resposta_cliente text,
  respondida_em timestamptz,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.pendencias(os_id);
create index on public.pendencias(resolvida_em) where resolvida_em is null;

create table public.os_frustracoes (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  motivo_id uuid not null references public.motivos(id),
  descricao text not null,
  ocorrida_em timestamptz not null,
  pendencia_id uuid references public.pendencias(id),
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.os_cancelamentos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  solicitado_por_nome text not null,
  solicitado_por_user uuid references auth.users(id),
  motivo_id uuid not null references public.motivos(id),
  descricao text not null,
  data timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sla_pausas (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  inicio timestamptz not null default now(),
  fim timestamptz,
  origem public.pausa_origem not null,
  referencia_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sla_pausas(os_id) where fim is null;

create table public.justificativas_atraso (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  motivo_id uuid not null references public.motivos(id),
  texto text not null,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.os_ajustes_preco (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  valor_anterior numeric(10,2) not null,
  valor_novo numeric(10,2) not null,
  motivo text not null,
  status public.ajuste_status not null default 'pendente',
  decidido_por_nome text,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.anexos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  tipo public.anexo_tipo not null,
  bucket text not null,
  storage_path text not null,
  nome_arquivo text not null,
  tamanho_bytes bigint,
  versao int not null default 1,
  atual boolean not null default true,
  enviado_por uuid references auth.users(id),
  enviado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.anexos(os_id, tipo);

create table public.historico_os (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  evento text not null,
  de text,
  para text,
  usuario_id uuid,
  nome_exibicao text,
  em timestamptz not null default now()
);
create index on public.historico_os(os_id, em);

create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id uuid,
  campo text not null,
  valor_anterior text,
  valor_novo text,
  usuario_id uuid,
  em timestamptz not null default now()
);
create index on public.auditoria(tabela, registro_id);
create index on public.auditoria(em);

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  destino public.notif_destino not null,
  empresa_cliente_id uuid references public.empresas_clientes(id),
  tipo text not null,
  os_id uuid references public.ordens_servico(id) on delete cascade,
  lote_id uuid references public.lotes_importacao(id) on delete cascade,
  titulo text not null,
  corpo text,
  link text,
  criada_em timestamptz not null default now(),
  vista_em timestamptz,
  vista_por uuid references auth.users(id),
  push_reforco_enviado boolean not null default false
);
create index on public.notificacoes(destino, empresa_cliente_id, vista_em);

create table public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

create table public.acessos_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  login text,
  ip text,
  user_agent text,
  em timestamptz not null default now(),
  sucesso boolean not null
);
create index on public.acessos_log(login, em);
create index on public.acessos_log(ip, em);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['empresas_clientes','perfis_usuario','patios','patio_apelidos','categorias_veiculo',
    'servicos','precos','precos_cliente','taxas_deslocamento','vistoriadores','motivos','configuracoes','feriados',
    'lotes_importacao','lote_linhas','ordens_servico','os_agendamentos','pendencias','os_frustracoes',
    'os_cancelamentos','sla_pausas','justificativas_atraso','os_ajustes_preco','anexos']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- ───────────── Helpers de perfil (usados por RLS)
create or replace function public.meu_perfil() returns public.perfil_tipo
language sql stable security definer set search_path = '' as $$
  select perfil from public.perfis_usuario where user_id = auth.uid() and not bloqueado
$$;

create or replace function public.is_loja() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfis_usuario where user_id = auth.uid() and perfil = 'loja' and not bloqueado)
$$;

create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = '' as $$
  select empresa_cliente_id from public.perfis_usuario where user_id = auth.uid() and perfil = 'cliente' and not bloqueado
$$;

create or replace function public.meu_nome() returns text
language sql stable security definer set search_path = '' as $$
  select nome_exibicao from public.perfis_usuario where user_id = auth.uid()
$$;

create or replace function public.os_visivel(p_os uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_loja() or exists(
    select 1 from public.ordens_servico o where o.id = p_os and o.empresa_cliente_id = public.minha_empresa())
$$;

-- normalização para comparar nomes (pátios/apelidos)
create or replace function public.normalizar_texto(t text) returns text
language sql immutable as $$
  select regexp_replace(lower(public.unaccent(coalesce(t,''))), '[^a-z0-9]+', ' ', 'g')
$$;

-- ───────────── Auditoria genérica (um registro por campo alterado)
create or replace function public.tg_auditoria() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text; v_old jsonb; v_new jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria(tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id)
    values (tg_table_name, new.id, '(criado)', null, null, auth.uid());
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

do $$
declare t text;
begin
  foreach t in array array['ordens_servico','pendencias','os_agendamentos','empresas_clientes','precos','precos_cliente']
  loop
    execute format('create trigger auditoria after insert or update or delete on public.%I for each row execute function public.tg_auditoria()', t);
  end loop;
end $$;

-- ───────────── Linha do tempo automática da OS
create or replace function public.tg_historico_os() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_nome text := coalesce(public.meu_nome(), 'Sistema');
begin
  if tg_op = 'INSERT' then
    insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
    values (new.id, 'OS aberta', null, 'Solicitante: ' || new.nome_solicitante, auth.uid(), v_nome);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
    values (new.id, 'Status', old.status::text, new.status::text, auth.uid(), v_nome);
  end if;
  if new.etapa is distinct from old.etapa then
    insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
    values (new.id, 'Etapa', old.etapa::text, new.etapa::text, auth.uid(), v_nome);
  end if;
  if new.pagamento_status is distinct from old.pagamento_status then
    insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
    values (new.id, 'Pagamento', old.pagamento_status::text, new.pagamento_status::text, auth.uid(), v_nome);
  end if;
  return new;
end $$;

create trigger historico after insert or update on public.ordens_servico
  for each row execute function public.tg_historico_os();

-- ───────────── RLS
do $$
declare t text;
begin
  foreach t in array array['empresas_clientes','perfis_usuario','patios','patio_apelidos','categorias_veiculo',
    'servicos','precos','precos_cliente','taxas_deslocamento','vistoriadores','motivos','configuracoes','feriados',
    'lotes_importacao','lote_linhas','ordens_servico','os_agendamentos','pendencias','os_frustracoes',
    'os_cancelamentos','sla_pausas','justificativas_atraso','os_ajustes_preco','anexos','historico_os',
    'auditoria','notificacoes','push_inscricoes','acessos_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Loja: acesso total
    execute format('create policy loja_all on public.%I for all to authenticated using (public.is_loja()) with check (public.is_loja())', t);
  end loop;
end $$;

-- Cadastros de referência: leitura para qualquer usuário autenticado ativo
do $$
declare t text;
begin
  foreach t in array array['patios','patio_apelidos','categorias_veiculo','servicos','precos','taxas_deslocamento','motivos','configuracoes','feriados']
  loop
    execute format('create policy cliente_le on public.%I for select to authenticated using (public.meu_perfil() is not null)', t);
  end loop;
end $$;

-- Dados da própria empresa
create policy cliente_le on public.empresas_clientes for select to authenticated
  using (id = public.minha_empresa());
create policy proprio_perfil on public.perfis_usuario for select to authenticated
  using (user_id = auth.uid());
create policy cliente_le on public.precos_cliente for select to authenticated
  using (empresa_cliente_id = public.minha_empresa());
create policy cliente_le on public.lotes_importacao for select to authenticated
  using (empresa_cliente_id = public.minha_empresa());
create policy cliente_le on public.lote_linhas for select to authenticated
  using (exists(select 1 from public.lotes_importacao l where l.id = lote_id and l.empresa_cliente_id = public.minha_empresa()));
create policy cliente_le on public.ordens_servico for select to authenticated
  using (empresa_cliente_id = public.minha_empresa());

do $$
declare t text;
begin
  foreach t in array array['os_agendamentos','pendencias','os_frustracoes','os_cancelamentos','sla_pausas',
    'justificativas_atraso','os_ajustes_preco','anexos','historico_os']
  loop
    execute format('create policy cliente_le on public.%I for select to authenticated using (public.minha_empresa() is not null and public.os_visivel(os_id))', t);
  end loop;
end $$;

-- vistoriadores: cliente vê só o nome (útil para agenda/relatórios)
create policy cliente_le on public.vistoriadores for select to authenticated using (public.meu_perfil() is not null);

-- notificações do cliente
create policy cliente_le on public.notificacoes for select to authenticated
  using (destino = 'cliente' and empresa_cliente_id = public.minha_empresa());
create policy cliente_marca_vista on public.notificacoes for update to authenticated
  using (destino = 'cliente' and empresa_cliente_id = public.minha_empresa())
  with check (destino = 'cliente' and empresa_cliente_id = public.minha_empresa());

-- push: cada usuário gerencia as próprias inscrições
create policy propria_inscricao on public.push_inscricoes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── Storage (buckets privados)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('laudos', 'laudos', false, 20971520, array['application/pdf']),
  ('anexos', 'anexos', false, 20971520, array['application/pdf','image/jpeg','image/png']),
  ('importacoes', 'importacoes', false, 10485760, null)
on conflict (id) do nothing;

create policy loja_storage on storage.objects for all to authenticated
  using (bucket_id in ('laudos','anexos','importacoes') and public.is_loja())
  with check (bucket_id in ('laudos','anexos','importacoes') and public.is_loja());

-- Cliente: lê objetos cujo primeiro segmento é a própria empresa
create policy cliente_le_storage on storage.objects for select to authenticated
  using (bucket_id in ('laudos','anexos','importacoes')
         and (storage.foldername(name))[1] = public.minha_empresa()::text);
-- Cliente: envia anexos (documentos/comprovantes) e planilhas na pasta da própria empresa
create policy cliente_envia_storage on storage.objects for insert to authenticated
  with check (bucket_id in ('anexos','importacoes')
              and (storage.foldername(name))[1] = public.minha_empresa()::text);

-- ───────────── Realtime
alter publication supabase_realtime add table public.notificacoes;
alter publication supabase_realtime add table public.ordens_servico;
