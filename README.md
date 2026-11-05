# Sistema de OS – Auto Visão

Next.js 15 (App Router) + Supabase + Tailwind. Especificação completa em [`CLAUDE.md`](CLAUDE.md).

## Rodar localmente
```bash
cp .env.example .env.local   # preencha as chaves
npm install
npm run dev
```

## Primeiro usuário Loja
```bash
SEED_ADMIN_SENHA='senha-forte' npm run seed:admin
```

## Testes
```bash
npm test
```

## Banco
As migrations em `supabase/migrations` são aplicadas em ordem (Supabase CLI: `supabase db push`).
