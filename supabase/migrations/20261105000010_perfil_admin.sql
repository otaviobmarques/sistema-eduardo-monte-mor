-- Multi-Loja (1/3): novo perfil de Administrador da plataforma
alter type public.perfil_tipo add value if not exists 'admin';
