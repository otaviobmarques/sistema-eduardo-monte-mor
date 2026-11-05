# Deploy · Sistema de OS – Auto Visão

Produção: **https://auto-visao-os.vercel.app** (Vercel, projeto `auto-visao-os`) com banco no Supabase
(projeto `klctfofigyukwldcvsue`, região `sa-east-1`, plano Pro).

## Como uma mudança chega à produção
1. `git push` na branch `main` → a Vercel compila e publica sozinha (≈ 1 min). Branches viram *preview*.
2. Mudança de banco: crie `supabase/migrations/AAAAMMDDNNNNNN_nome.sql` e aplique **antes** do push do código que depende dela:
   `supabase db push` (CLI ligada ao projeto) ou cole o SQL no *SQL Editor* do Supabase.
   As migrations são aplicadas em ordem e nunca editadas depois de aplicadas: correções viram uma migration nova.
3. Confira: `https://auto-visao-os.vercel.app/api/saude` responde `{"ok":true,"versao":"<commit>"}`.

## Variáveis de ambiente (Vercel › Settings › Environment Variables)
| Variável | Onde obter | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › Project Settings › API | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem (anon / publishable) | pública; a RLS protege os dados |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (service_role / secret) | **secreta**; só no servidor |
| `LOGIN_EMAIL_DOMAIN` | `login.autovisao.app` | domínio sintético dos logins por usuário |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys` | Web Push; trocar as chaves invalida as inscrições |
| `CRON_SECRET` | gere com `openssl rand -hex 32` | protege `/api/cron/*` e `/api/push/enviar`; **igual** ao segredo `cron_secret` do Vault |
| `ASAAS_*` | opcional | alternativa às credenciais salvas em Admin › Gateways |

`.env.example` lista todas, sem valores. Nunca commitar `.env.local`.

## Segredos no Supabase Vault (Database › Vault)
| Nome | Uso |
|---|---|
| `app_url` | URL pública do app, usada pelo pg_cron (alertas de SLA) e pelo gatilho de push |
| `cron_secret` | mesmo valor de `CRON_SECRET` da Vercel |
| `asaas_*` | gravados por Admin › Gateways (`salvar_gateway`) |

Criar/atualizar: `select vault.create_secret('https://auto-visao-os.vercel.app', 'app_url');`
(ou `vault.update_secret(id, valor)` se já existir).

## Tarefas agendadas (pg_cron)
| Job | Quando | O que faz |
|---|---|---|
| `alertas-sla` | a cada 5 min | chama `/api/cron/sla`: alertas de 24h, faltam 8h, vencida e escalonamento |
| `inadimplencia-lojas` | diário 09:05 (Brasília) | marca faturas vencidas e bloqueia Lojas além da tolerância |
| `limpar-acessos` | domingo 03:17 (Brasília) | apaga registros de acesso com mais de 180 dias |

Conferir: `select jobname, schedule, active from cron.job;` e as últimas execuções em `cron.job_run_details`.

## Configurações do Supabase Auth (painel)
- **Authentication › Sign In / Providers › Email**: confirmação de e-mail **desligada** (logins são sintéticos);
  ligar **“Prevent use of leaked passwords”** (checagem no HaveIBeenPwned, disponível no plano Pro).
- **Authentication › Rate Limits**: manter o padrão. O app limita o login a 5 falhas por usuário (20 por IP)
  em 15 min, e o Auth do Supabase limita quem tentar a API diretamente.

## Primeiro acesso de um ambiente novo
1. Aplicar todas as migrations (cria tabelas, RLS, funções, jobs e o seed global).
2. Criar os segredos do Vault (`app_url`, `cron_secret`).
3. `SEED_ADMIN_SENHA='…' npm run seed:admin` cria o Administrador.
4. Entrar como Administrador › Lojas › Nova Loja: a Loja nasce semeada (serviço, preços zerados, motivos, configurações) e
   o login do Gestor é gerado com senha temporária.

## Testes antes de publicar
```bash
npm test                       # regras de negócio (Vitest)
npm run build && npm start -- -p 3100 &
npm run test:e2e               # fluxos ponta a ponta (Playwright) contra http://localhost:3100
```
Os testes E2E criam Lojas isoladas e apagam tudo no fim; nunca usam o login real `admin`.
Também podem rodar contra a produção: `BASE_URL=https://auto-visao-os.vercel.app npm run test:e2e`.

## Reverter uma publicação
Vercel › Deployments › escolha a versão anterior › **Promote to Production** (instantâneo). Se a versão nova trouxe
migration, avalie se a anterior continua compatível; em geral as migrations deste projeto só acrescentam.
