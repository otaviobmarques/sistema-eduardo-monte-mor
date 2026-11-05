-- Um login por empresa cliente (seção 3). Alterações de acesso são auditadas pelas Server Actions.
create unique index if not exists perfis_um_login_por_empresa
  on public.perfis_usuario(empresa_cliente_id) where perfil = 'cliente';
