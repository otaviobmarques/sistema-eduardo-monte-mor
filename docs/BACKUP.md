# Backup e restauração

## O que existe
| Camada | Frequência | Retenção | Onde |
|---|---|---|---|
| Backup automático do Supabase (plano Pro) | diário | 7 dias | Supabase › Database › Backups |
| Dump completo + arquivos, criptografado | semanal (segunda, 03:23) | 90 dias | GitHub › Actions › “Backup semanal” › Artifacts |

O backup semanal (`.github/workflows/backup-semanal.yml`) leva:
- `banco/roles.sql`, `banco/schema.sql`, `banco/data.sql` (dump do Postgres pelo Supabase CLI, inclui os usuários do Auth);
- `storage/` com todos os laudos, anexos e planilhas importadas, mais `manifesto.json`;
- tudo compactado e criptografado (AES-256, GPG) com `BACKUP_PASSPHRASE`, mais o hash SHA-256.

### Ativar o backup semanal (uma vez)
GitHub › repositório › Settings › Secrets and variables › Actions › *New repository secret*:
- `SUPABASE_DB_URL`: Supabase › **Connect** › *Session pooler* (URI), com a senha do banco no lugar de `[YOUR-PASSWORD]`;
- `SUPABASE_URL`: `https://klctfofigyukwldcvsue.supabase.co`;
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase › Project Settings › API Keys › *secret*;
- `BACKUP_PASSPHRASE`: uma frase longa. **Guarde fora do GitHub** (gerenciador de senhas): sem ela o backup não abre.

Depois: Actions › Backup semanal › **Run workflow** para gerar o primeiro e conferir que termina verde.
Sem os segredos, o job termina com um aviso e não faz nada.

## Restaurar
### A. Voltar o banco a um dia recente (até 7 dias)
Supabase › Database › Backups › escolha o dia › **Restore**. O projeto fica indisponível alguns minutos.
Os arquivos do Storage não voltam no tempo (não são apagados pelo restore).

### B. Recriar tudo a partir do backup semanal (projeto novo ou desastre)
1. Baixe o artefato em GitHub › Actions › execução › Artifacts e confira o hash:
   `sha256sum -c backup-AAAA-MM-DD.sha256`
2. Descriptografe e extraia:
   ```bash
   gpg --decrypt backup-AAAA-MM-DD.tar.gz.gpg > backup.tar.gz
   tar -xzf backup.tar.gz && cd backup-AAAA-MM-DD
   ```
3. Crie um projeto Supabase novo (região `sa-east-1`) e pegue a *Session pooler URI* dele (`$NOVO_DB_URL`).
4. Restaure o banco, na ordem:
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file banco/roles.sql --file banco/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file banco/data.sql --dbname "$NOVO_DB_URL"
   ```
   (`session_replication_role = replica` evita que gatilhos de auditoria/notificação disparem durante a carga.)
5. Restaure os arquivos:
   ```bash
   SUPABASE_URL=https://<novo-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret-do-novo> \
     node scripts/restaurar-storage.mjs storage
   ```
6. Recrie os segredos do Vault (`app_url`, `cron_secret`; e o Asaas em Admin › Gateways): eles não saem no dump.
7. Confira os jobs (`select * from cron.job;`): o dump traz a definição, mas os comandos usam o Vault do passo 6.
8. Atualize na Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` do projeto
   novo e faça *Redeploy*. Confira `/api/saude` e entre com um usuário de teste.

### Ensaio de restauração
A cada 6 meses, restaure o último backup semanal num projeto Supabase descartável (passos B.1–B.5), confira contagens
(`select count(*) from ordens_servico;`, número de arquivos no `manifesto.json`) e apague o projeto.

Os scripts `scripts/backup-storage.mjs` e `scripts/restaurar-storage.mjs` foram testados ida e volta (inclusive subpastas).
