-- Multi-Loja: cadastros padrão de uma Loja nova (seção 11 do briefing). Pátios ficam vazios: cada franqueada cadastra os seus.
create or replace function public.semear_loja(p_loja uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_serv uuid;
begin
  -- security definer roda como o dono: checar o papel de quem chamou (admin logado ou service_role)
  if not public.is_admin() and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  insert into public.configuracoes (loja_id) values (p_loja) on conflict do nothing;
  insert into public.servicos (loja_id, nome, sla_horas, padrao) values (p_loja, 'Vistoria cautelar', 48, true)
    on conflict (loja_id, nome) do nothing;
  select id into v_serv from public.servicos where loja_id = p_loja and nome = 'Vistoria cautelar';
  insert into public.precos (loja_id, servico_id, categoria_id, valor)
    select p_loja, v_serv, c.id, 0 from public.categorias_veiculo c on conflict do nothing;
  insert into public.motivos (loja_id, tipo, descricao, ordem) values
    (p_loja,'frustracao','Veículo não localizado no pátio',1), (p_loja,'frustracao','Falta de autorização do pátio',2),
    (p_loja,'frustracao','Pendência documental',3), (p_loja,'frustracao','Problema de agendamento',4), (p_loja,'frustracao','Outro',99),
    (p_loja,'cancelamento','Solicitado pelo cliente',1), (p_loja,'cancelamento','Veículo vendido ou retirado',2),
    (p_loja,'cancelamento','Duplicidade',3), (p_loja,'cancelamento','Outro',99),
    (p_loja,'atraso','Falta de vistoriador na região',1), (p_loja,'atraso','Pátio sem acesso',2), (p_loja,'atraso','Demora na autorização',3),
    (p_loja,'atraso','Problema no sistema',4), (p_loja,'atraso','Outro',99),
    (p_loja,'reagendamento','Solicitado pelo cliente',1), (p_loja,'reagendamento','Indisponibilidade do vistoriador',2),
    (p_loja,'reagendamento','Pátio sem acesso',3), (p_loja,'reagendamento','Outro',99),
    (p_loja,'pendencia','Documentação',1), (p_loja,'pendencia','Autorização',2), (p_loja,'pendencia','Outro',99)
  on conflict do nothing;
end $$;
revoke execute on function public.semear_loja(uuid) from public, anon;
grant execute on function public.semear_loja(uuid) to authenticated;

-- O usuário "admin" passa a ser o Administrador da plataforma (sem Loja).
update public.perfis_usuario set perfil = 'admin', loja_id = null, nome_exibicao = 'Administrador'
 where login = 'admin';
