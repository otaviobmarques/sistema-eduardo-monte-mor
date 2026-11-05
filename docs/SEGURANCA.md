# Segurança e LGPD

## Acesso
- Três perfis: `admin` (plataforma), `loja` (Gestor de uma Loja) e `cliente` (empresa cliente de uma Loja).
- Todas as tabelas com **RLS**; leituras usam a sessão do usuário. Funções `minha_loja()`, `minha_empresa()`, `is_loja()`,
  `is_admin()` e `os_da_minha_loja()` filtram por Loja/empresa. Loja bloqueada ou inativa ⇒ essas funções retornam
  nulo/falso e ninguém dela lê nada.
- Mutações de negócio passam por funções `security definer` que checam o perfil (nunca `current_user`).
  A chave `service_role` só é usada no servidor, depois de `exigirPerfil()`.
- Views de relatório (`vw_os_sla`, `vw_kpis_mensais`) usam `security_invoker`: valem as regras de quem consulta.
- Storage privado (`laudos`, `anexos`, `importacoes`); download só por URL assinada de 60 s; o caminho começa pela empresa,
  e a política do bucket confere que ela é a do cliente logado ou uma empresa da Loja do Gestor.

## Login
- Usuário + senha (mín. 8 caracteres). Senha temporária expira em 7 dias e exige troca no primeiro acesso.
- **Rate limit**: 5 falhas por usuário ou 20 por IP em 15 min travam novas tentativas por 15 min.
- **Registro de acessos** (`acessos_log`): cada entrada e cada falha com motivo, IP e navegador. O Gestor vê os da sua
  Loja em Auditoria › Acessos; o Administrador vê todos em Acessos. Guardado por 180 dias (job `limpar-acessos`).

## Cabeçalhos HTTP
CSP (`default-src 'self'`, conexões só com o Supabase do projeto, `frame-ancestors 'none'`), HSTS, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy` e `Permissions-Policy` (câmera, microfone e localização desligados).

## Endpoints sem sessão
| Rota | Proteção |
|---|---|
| `/api/cron/sla`, `/api/push/enviar` | `Authorization: Bearer $CRON_SECRET` |
| `/api/asaas/webhook` | cabeçalho `asaas-access-token` igual ao token do Vault |
| `/api/saude` | só informa se o banco responde e a versão publicada |

## LGPD
- Não guardamos dados do proprietário do veículo. Do solicitante, só nome e telefone.
- Auditoria campo a campo registra quem alterou o quê e quando.
- Backups semanais saem criptografados (veja `docs/BACKUP.md`).

## Revisão de 05/11/2026 (alertas do Supabase)
- Corrigido: função de gatilho `tg_alerta_pagamento` deixou de ser chamável pela API.
- Corrigido: políticas com `auth.uid()` reavaliado por linha; índices para chaves estrangeiras usadas em consultas.
- Aceito: funções `security definer` executáveis por usuários logados. São as operações do sistema e cada uma confere
  o perfil (`is_loja()`, `os_da_minha_loja()`…). Funções internas e de gatilho não são executáveis pela API.
- Aceito: extensão `pg_net` no schema `public` (instalada assim pelo Supabase; não é relocável).
- Aceito: várias políticas permissivas por tabela (admin/Loja/cliente). Custo irrelevante no volume atual.
- Pendente no painel: ligar “Prevent use of leaked passwords” (Authentication › Providers › Email).
