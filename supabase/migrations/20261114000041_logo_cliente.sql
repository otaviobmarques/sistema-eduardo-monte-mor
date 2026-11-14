-- Logotipo do cliente (decidido em 14/11/2026): a Loja envia no cadastro do cliente e ele aparece no portal do cliente.
-- Arquivo no bucket privado “logos” ({empresa}/logo-{ts}.{ext}); o navegador lê por /api/logo/{empresa} (checa o acesso
-- pela RLS de empresas_clientes e serve a imagem do próprio domínio, sem abrir a CSP).
alter table public.empresas_clientes add column if not exists logo_path text;
alter table public.empresas_clientes add column if not exists logo_atualizado_em timestamptz;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
