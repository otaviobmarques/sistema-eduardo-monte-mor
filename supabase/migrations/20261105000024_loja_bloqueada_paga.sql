-- Loja bloqueada por atraso: o Gestor entra só para pagar. Ele lê apenas a própria Loja e as faturas dela;
-- todo o resto continua inacessível (minha_loja() e is_loja() seguem nulas/falsas enquanto a Loja estiver bloqueada).
-- Clientes da Loja bloqueada continuam sem acesso. Loja desativada (ativo = false) também continua sem acesso.

create or replace function public.loja_bloqueada_do_gestor() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.loja_id from public.perfis_usuario p join public.lojas l on l.id = p.loja_id
   where p.user_id = auth.uid() and p.perfil = 'loja' and not p.bloqueado and l.ativo and l.bloqueada
$$;
revoke all on function public.loja_bloqueada_do_gestor() from public, anon;
grant execute on function public.loja_bloqueada_do_gestor() to authenticated;

create policy gestor_bloqueado_le_loja on public.lojas for select to authenticated
  using (id = public.loja_bloqueada_do_gestor());
create policy gestor_bloqueado_le_faturas on public.faturas for select to authenticated
  using (loja_id = public.loja_bloqueada_do_gestor() and ambiente is distinct from 'sandbox');
