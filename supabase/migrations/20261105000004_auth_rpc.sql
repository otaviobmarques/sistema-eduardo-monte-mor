-- Troca de senha concluída: libera o acesso (chamada pelo próprio usuário após updateUser)
create or replace function public.concluir_troca_senha() returns void
language sql security definer set search_path = '' as $$
  update public.perfis_usuario
     set deve_trocar_senha = false,
         senha_expira_em = null,
         primeiro_acesso_em = coalesce(primeiro_acesso_em, now())
   where user_id = auth.uid();
$$;
revoke execute on function public.concluir_troca_senha() from public, anon;
grant execute on function public.concluir_troca_senha() to authenticated;
