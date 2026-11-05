-- Gateway com credenciais separadas por ambiente (Teste/sandbox e Produção) e um seletor de "ambiente em uso".
-- Cada conta Asaas tem chave, token de webhook, clientes e assinaturas próprios; faturas lembram o ambiente.

-- 1. Credenciais por ambiente
create table public.gateways_ambientes (
  provedor text not null references public.gateways_pagamento(provedor) on delete cascade,
  ambiente text not null check (ambiente in ('sandbox', 'producao')),
  chave_secret_id uuid,
  chave_final text,
  webhook_token_secret_id uuid,
  webhook_id text,
  webhook_url text,
  testado_em timestamptz,
  teste_ok boolean,
  teste_mensagem text,
  atualizado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provedor, ambiente)
);
create trigger set_updated_at before update on public.gateways_ambientes for each row execute function public.tg_set_updated_at();
alter table public.gateways_ambientes enable row level security;
create policy admin_all on public.gateways_ambientes for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.gateways_ambientes (provedor, ambiente)
  select g.provedor, a.amb from public.gateways_pagamento g cross join (values ('sandbox'), ('producao')) a(amb) on conflict do nothing;

-- Leva o que houver na configuração antiga para o ambiente que estava selecionado
update public.gateways_ambientes ga set chave_secret_id = g.chave_secret_id, chave_final = g.chave_final,
       webhook_token_secret_id = g.webhook_token_secret_id, webhook_id = g.webhook_id, webhook_url = g.webhook_url,
       testado_em = g.testado_em, teste_ok = g.teste_ok, teste_mensagem = g.teste_mensagem
  from public.gateways_pagamento g where ga.provedor = g.provedor and ga.ambiente = g.ambiente and g.chave_secret_id is not null;

-- gateways_pagamento passa a guardar só: usar para cobrar (ativo) e qual ambiente está em uso
alter table public.gateways_pagamento
  drop column chave_secret_id, drop column chave_final, drop column webhook_token_secret_id, drop column webhook_id,
  drop column webhook_url, drop column testado_em, drop column teste_ok, drop column teste_mensagem;
comment on column public.gateways_pagamento.ambiente is 'Ambiente em uso para as cobranças novas (sandbox = Teste, producao = Produção)';

-- Segredos sem dono (da configuração única anterior) saem do cofre
delete from vault.secrets s where s.name in ('gateway_asaas_chave', 'gateway_asaas_webhook')
  and not exists (select 1 from public.gateways_ambientes ga where ga.chave_secret_id = s.id or ga.webhook_token_secret_id = s.id);

drop function if exists public.salvar_gateway(text, text, boolean, text);
drop function if exists public.credenciais_gateway(text);

-- 2. Funções do Administrador
-- Grava (ou troca) a chave de UM ambiente. Gera o token do webhook desse ambiente na primeira vez.
create or replace function public.salvar_chave_gateway(p_provedor text, p_ambiente text, p_chave text)
returns void language plpgsql security definer set search_path = '' as $$
declare g record; v_id uuid; v_tok uuid; v_nome text := 'gateway_' || p_provedor || '_' || p_ambiente;
begin
  if not public.is_admin() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if p_ambiente not in ('sandbox', 'producao') then raise exception 'AMBIENTE_INVALIDO'; end if;
  if coalesce(trim(p_chave), '') = '' then raise exception 'CHAVE_OBRIGATORIA'; end if;
  insert into public.gateways_ambientes (provedor, ambiente) values (p_provedor, p_ambiente) on conflict do nothing;
  select * into g from public.gateways_ambientes ga where ga.provedor = p_provedor and ga.ambiente = p_ambiente for update;
  v_id := coalesce(g.chave_secret_id, (select s.id from vault.secrets s where s.name = v_nome || '_chave'));
  if v_id is null then v_id := vault.create_secret(trim(p_chave), v_nome || '_chave', 'Chave de API · ' || p_provedor || ' · ' || p_ambiente);
  else perform vault.update_secret(v_id, trim(p_chave)); end if;
  v_tok := coalesce(g.webhook_token_secret_id, (select s.id from vault.secrets s where s.name = v_nome || '_webhook'));
  if v_tok is null then
    v_tok := vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), v_nome || '_webhook', 'Token do webhook · ' || p_provedor || ' · ' || p_ambiente);
  end if;
  update public.gateways_ambientes ga set chave_secret_id = v_id, webhook_token_secret_id = v_tok, chave_final = right(trim(p_chave), 4),
         teste_ok = null, testado_em = null, teste_mensagem = null, atualizado_por = auth.uid()
   where ga.provedor = p_provedor and ga.ambiente = p_ambiente;
end $$;

-- Remove a chave de um ambiente (e o token do webhook). Se era o ambiente em uso, o gateway é desligado.
create or replace function public.remover_chave_gateway(p_provedor text, p_ambiente text)
returns void language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  if not public.is_admin() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  select * into g from public.gateways_ambientes ga where ga.provedor = p_provedor and ga.ambiente = p_ambiente for update;
  if not found then return; end if;
  delete from vault.secrets s where s.id in (g.chave_secret_id, g.webhook_token_secret_id);
  update public.gateways_ambientes ga set chave_secret_id = null, chave_final = null, webhook_token_secret_id = null, webhook_id = null,
         webhook_url = null, testado_em = null, teste_ok = null, teste_mensagem = null, atualizado_por = auth.uid()
   where ga.provedor = p_provedor and ga.ambiente = p_ambiente;
  update public.gateways_pagamento gp set ativo = false where gp.provedor = p_provedor and gp.ambiente = p_ambiente;
end $$;

-- Seletor: qual ambiente vale para as cobranças novas, e se o gateway está ligado.
create or replace function public.usar_ambiente_gateway(p_provedor text, p_ambiente text, p_ativo boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if p_ambiente not in ('sandbox', 'producao') then raise exception 'AMBIENTE_INVALIDO'; end if;
  if p_ativo and not exists (select 1 from public.gateways_ambientes ga where ga.provedor = p_provedor and ga.ambiente = p_ambiente and ga.chave_secret_id is not null) then
    raise exception 'SEM_CHAVE';
  end if;
  update public.gateways_pagamento gp set ambiente = p_ambiente, ativo = p_ativo, atualizado_por = auth.uid() where gp.provedor = p_provedor;
end $$;

revoke all on function public.salvar_chave_gateway(text, text, text) from public, anon;
revoke all on function public.remover_chave_gateway(text, text) from public, anon;
revoke all on function public.usar_ambiente_gateway(text, text, boolean) from public, anon;
grant execute on function public.salvar_chave_gateway(text, text, text) to authenticated;
grant execute on function public.remover_chave_gateway(text, text) to authenticated;
grant execute on function public.usar_ambiente_gateway(text, text, boolean) to authenticated;

-- 3. Leitura das credenciais: só o servidor (service_role)
-- Ambiente em uso (para criar cobranças)
create or replace function public.credenciais_gateway(p_provedor text)
returns table (ativo boolean, ambiente text, chave text, webhook_token text)
language sql security definer set search_path = '' as $$
  select gp.ativo, gp.ambiente,
         (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = ga.chave_secret_id),
         (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = ga.webhook_token_secret_id)
    from public.gateways_pagamento gp
    left join public.gateways_ambientes ga on ga.provedor = gp.provedor and ga.ambiente = gp.ambiente
   where gp.provedor = p_provedor
$$;
-- Um ambiente específico (testar, configurar webhook, dar baixa numa fatura de outro ambiente)
create or replace function public.credenciais_gateway_ambiente(p_provedor text, p_ambiente text)
returns table (chave text, webhook_token text)
language sql security definer set search_path = '' as $$
  select (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = ga.chave_secret_id),
         (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = ga.webhook_token_secret_id)
    from public.gateways_ambientes ga where ga.provedor = p_provedor and ga.ambiente = p_ambiente
$$;
-- Tokens dos webhooks de todos os ambientes (o webhook descobre de qual conta veio o aviso)
create or replace function public.tokens_webhook_gateway(p_provedor text)
returns table (ambiente text, webhook_token text)
language sql security definer set search_path = '' as $$
  select ga.ambiente, (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = ga.webhook_token_secret_id)
    from public.gateways_ambientes ga where ga.provedor = p_provedor and ga.webhook_token_secret_id is not null
$$;
revoke all on function public.credenciais_gateway(text) from public, anon, authenticated;
revoke all on function public.credenciais_gateway_ambiente(text, text) from public, anon, authenticated;
revoke all on function public.tokens_webhook_gateway(text) from public, anon, authenticated;
grant execute on function public.credenciais_gateway(text) to service_role;
grant execute on function public.credenciais_gateway_ambiente(text, text) to service_role;
grant execute on function public.tokens_webhook_gateway(text) to service_role;

-- 4. A Loja no gateway, por ambiente (o cliente e a assinatura do sandbox não existem na produção)
create table public.lojas_gateway (
  loja_id uuid not null references public.lojas(id) on delete cascade,
  provedor text not null,
  ambiente text not null check (ambiente in ('sandbox', 'producao')),
  customer_id text,
  subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (loja_id, provedor, ambiente),
  unique (provedor, ambiente, customer_id)
);
create trigger set_updated_at before update on public.lojas_gateway for each row execute function public.tg_set_updated_at();
alter table public.lojas_gateway enable row level security;
create policy admin_all on public.lojas_gateway for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.lojas_gateway (loja_id, provedor, ambiente, customer_id, subscription_id)
  select l.id, 'asaas', coalesce((select gp.ambiente from public.gateways_pagamento gp where gp.provedor = 'asaas'), 'sandbox'), l.asaas_customer_id, l.asaas_subscription_id
    from public.lojas l where l.asaas_customer_id is not null or l.asaas_subscription_id is not null
  on conflict do nothing;
alter table public.lojas drop column asaas_customer_id, drop column asaas_subscription_id;

-- 5. Faturas lembram o ambiente (nulo = fatura manual, sem gateway)
alter table public.faturas add column if not exists ambiente text check (ambiente in ('sandbox', 'producao'));
update public.faturas f set ambiente = coalesce((select gp.ambiente from public.gateways_pagamento gp where gp.provedor = 'asaas'), 'sandbox')
 where f.asaas_payment_id is not null and f.ambiente is null;
create index if not exists faturas_ambiente_idx on public.faturas (ambiente);

-- O Gestor nunca vê faturas de teste
drop policy if exists loja_le_faturas on public.faturas;
create policy loja_le_faturas on public.faturas for select to authenticated
  using (public.is_loja() and loja_id = public.minha_loja() and ambiente is distinct from 'sandbox');

-- Faturas de teste nunca bloqueiam (nem mantêm bloqueada) uma Loja de verdade
create or replace function public.verificar_inadimplencia() returns int
language plpgsql security definer set search_path = '' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int := 0; r record;
begin
  update public.faturas set status = 'vencido' where status = 'pendente' and vencimento < v_hoje;
  for r in
    select l.id, min(f.vencimento) as venc from public.lojas l join public.faturas f on f.loja_id = l.id
     where l.ativo and not l.bloqueada and f.status = 'vencido' and f.ambiente is distinct from 'sandbox'
       and f.vencimento + l.dias_tolerancia < v_hoje
     group by l.id
  loop
    update public.lojas set bloqueada = true, bloqueio_automatico = true, bloqueada_em = now(),
           motivo_bloqueio = 'Fatura vencida em ' || to_char(r.venc, 'DD/MM/YYYY') || ' sem pagamento.'
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.reavaliar_bloqueio(p_loja uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.lojas l set bloqueada = false, bloqueio_automatico = false, bloqueada_em = null, motivo_bloqueio = null
   where l.id = p_loja and l.bloqueada and l.bloqueio_automatico
     and not exists (select 1 from public.faturas f where f.loja_id = l.id and f.status = 'vencido'
                     and f.ambiente is distinct from 'sandbox' and f.vencimento + l.dias_tolerancia < v_hoje);
end $$;
revoke execute on function public.verificar_inadimplencia() from public, anon, authenticated;
revoke execute on function public.reavaliar_bloqueio(uuid) from public, anon, authenticated;
