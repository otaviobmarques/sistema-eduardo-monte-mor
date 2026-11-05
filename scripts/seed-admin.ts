/**
 * Cria (ou atualiza) o usuário Loja inicial.
 * Uso: SEED_ADMIN_SENHA=... npm run seed:admin   (lê .env.local)
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const login = (process.env.SEED_ADMIN_LOGIN ?? 'admin').trim().toLowerCase();
const nome = process.env.SEED_ADMIN_NOME ?? 'Gestor Auto Visão';
const senha = process.env.SEED_ADMIN_SENHA;
const dominio = process.env.LOGIN_EMAIL_DOMAIN ?? 'login.autovisao.app';

async function main() {
  if (!url || !key) throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  if (!senha || senha.length < 8) throw new Error('Defina SEED_ADMIN_SENHA com pelo menos 8 caracteres');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const email = login.includes('@') ? login : `${login}@${dominio}`;

  const { data: existente } = await sb.from('perfis_usuario').select('user_id').eq('login', login).maybeSingle();
  let userId = existente?.user_id as string | undefined;
  if (userId) {
    const { error } = await sb.auth.admin.updateUserById(userId, { password: senha });
    if (error) throw error;
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { login } });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error } = await sb.from('perfis_usuario').upsert({
    user_id: userId, perfil: 'loja', login, nome_exibicao: nome, deve_trocar_senha: false, bloqueado: false,
  });
  if (error) throw error;
  console.log(`Usuário Loja "${login}" pronto.`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
