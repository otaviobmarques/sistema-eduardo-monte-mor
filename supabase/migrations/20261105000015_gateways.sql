-- Gateways de pagamento configurados pelo Administrador. Segredos ficam no Supabase Vault (criptografados).
create table public.gateways_pagamento (
  provedor text primary key check (provedor in ('asaas', 'mercado_pago', 'stripe')),
  ativo boolean not null default false,
  ambiente text not null default 'sandbox' check (ambiente in ('sandbox', 'producao')),
  chave_secret_id uuid,
  chave_final text,
  webhook_token_secret_id uuid,
  webhook_id text,
  webhook_url text,
  testado_em timestamptz,
  teste_ok boolean,
  teste_mensagem text,
  atualizado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.gateways_pagamento for each row execute function public.tg_set_updated_at();
alter table public.gateways_pagamento enable row level security;
create policy admin_all on public.gateways_pagamento for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Grava (ou troca) a chave do gateway no Vault. Chave vazia = mantém a atual. Só o Administrador.
create or replace function public.salvar_gateway(p_provedor text, p_ambiente text, p_ativo boolean, p_chave text)
returns void language plpgsql security definer set search_path = '' as $$
declare g record; v_id uuid; v_tok uuid;
begin
  if not public.is_admin() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  insert into public.gateways_pagamento (provedor) values (p_provedor) on conflict do nothing;
  select * into g from public.gateways_pagamento where provedor = p_provedor for update;
  -- Reaproveita segredos já existentes no Vault com o mesmo nome (ex.: ponteiro perdido)
  v_id := coalesce(g.chave_secret_id, (select s.id from vault.secrets s where s.name = 'gateway_' || p_provedor || '_chave'));
  if coalesce(trim(p_chave), '') <> '' then
    if v_id is null then
      v_id := vault.create_secret(trim(p_chave), 'gateway_' || p_provedor || '_chave', 'Chave de API do gateway ' || p_provedor);
    else
      perform vault.update_secret(v_id, trim(p_chave));
    end if;
  end if;
  v_tok := coalesce(g.webhook_token_secret_id, (select s.id from vault.secrets s where s.name = 'gateway_' || p_provedor || '_webhook'));
  if v_tok is null then
    v_tok := vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'gateway_' || p_provedor || '_webhook', 'Token do webhook do gateway ' || p_provedor);
  end if;
  update public.gateways_pagamento set ambiente = p_ambiente, ativo = p_ativo and v_id is not null,
         chave_secret_id = v_id, webhook_token_secret_id = v_tok,
         chave_final = case when coalesce(trim(p_chave), '') <> '' then right(trim(p_chave), 4) else chave_final end,
         teste_ok = case when coalesce(trim(p_chave), '') <> '' or ambiente <> p_ambiente then null else teste_ok end,
         atualizado_por = auth.uid()
   where provedor = p_provedor;
end $$;
revoke execute on function public.salvar_gateway(text, text, boolean, text) from public, anon;
grant execute on function public.salvar_gateway(text, text, boolean, text) to authenticated;

-- Leitura das credenciais: só o servidor (service_role). Nunca exposta a usuários.
create or replace function public.credenciais_gateway(p_provedor text)
returns table (ativo boolean, ambiente text, chave text, webhook_token text)
language sql security definer set search_path = '' as $$
  select g.ativo, g.ambiente,
         (select decrypted_secret from vault.decrypted_secrets where id = g.chave_secret_id),
         (select decrypted_secret from vault.decrypted_secrets where id = g.webhook_token_secret_id)
    from public.gateways_pagamento g where g.provedor = p_provedor
$$;
revoke execute on function public.credenciais_gateway(text) from public, anon, authenticated;
grant execute on function public.credenciais_gateway(text) to service_role;

insert into public.gateways_pagamento (provedor) values ('asaas'), ('mercado_pago'), ('stripe') on conflict do nothing;
