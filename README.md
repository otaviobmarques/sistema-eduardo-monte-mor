# Sistema de OS – Auto Visão

Ordens de serviço de vistoria veicular para Lojas franqueadas Auto Visão e seus clientes empresariais
(abertura por placa ou em lote, SLA de 48h, frustrações, pendências, laudo em PDF, financeiro e relatórios).

Next.js 15 (App Router) + Supabase (Postgres, Auth, Storage, Realtime, pg_cron) + Tailwind. Produção em
**https://auto-visao-os.vercel.app**. Especificação e decisões em [`CLAUDE.md`](CLAUDE.md).

| Documento | Conteúdo |
|---|---|
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | publicação, variáveis, segredos do Vault, jobs, ambiente novo, reverter |
| [`docs/BACKUP.md`](docs/BACKUP.md) | backups diário e semanal, como ativar, como restaurar, ensaio |
| [`docs/SEGURANCA.md`](docs/SEGURANCA.md) | perfis e RLS, login e rate limit, cabeçalhos, LGPD, revisão |

## Rodar localmente
```bash
cp .env.example .env.local   # preencha as chaves
npm install
npm run dev
```

## Primeiro usuário (Administrador da plataforma)
```bash
SEED_ADMIN_SENHA='senha-forte' npm run seed:admin
```
O Administrador cadastra as Lojas; cada Loja nasce com o login do Gestor, que cadastra os clientes e os acessos deles.

## Testes
```bash
npm test                                   # regras de negócio (Vitest)
npm run build && npm start -- -p 3100 &    # app de produção local
npm run test:e2e                           # todos os fluxos ponta a ponta (Playwright)
```
`tests/e2e/criterio-pronto.js` é o critério de pronto da V1: a planilha real de 37 placas da Creditas vai do lote ao
pagamento e ao relatório.

## Banco
Migrations em `supabase/migrations`, aplicadas em ordem (`supabase db push` ou SQL Editor). Nunca editar uma
migration já aplicada: correções viram uma nova.
