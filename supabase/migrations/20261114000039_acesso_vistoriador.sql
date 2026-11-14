-- Acesso do vistoriador (decidido em 14/11/2026): o Gestor cria login e senha para o vistoriador em Cadastros › Vistoriadores
-- e envia o link do sistema (WhatsApp ou cópia). O vistoriador só vê as próprias vistorias (designadas/agendadas para ele),
-- por uma função security definer; nenhuma policy de tabela o alcança (is_loja() e minha_empresa() são falsos/nulos).
-- (o valor 'vistoriador' do enum perfil_tipo entrou na migration anterior, aplicada à parte)
alter type public.perfil_tipo add value if not exists 'vistoriador';
