// Apoio dos testes E2E: cria uma Loja de teste isolada (com Gestor e pátios) e apaga tudo no fim.
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local', quiet: true });

const adm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = (login) => `${login}@${process.env.LOGIN_EMAIL_DOMAIN}`;
const PATIOS = [['Freitas Utinga', 'Santo André'], ['Freitas Santa Bárbara', "Santa Bárbara d'Oeste"], ['Leilo São Carlos', 'São Carlos'], ['Leilomaster SP', 'São Paulo']];

async function criarLoja(nome, { patios = true } = {}) {
  await limparLojaPorNome(nome);
  const { data: loja, error } = await adm.from('lojas').insert({ nome, cidade: 'Campinas', uf: 'SP' }).select('*').single();
  if (error) throw error;
  const { error: e2 } = await adm.rpc('semear_loja', { p_loja: loja.id }); if (e2) throw e2;
  if (patios) {
    const { data: ps } = await adm.from('patios').insert(PATIOS.map(([n, c]) => ({ loja_id: loja.id, nome: n, cidade: c, uf: 'SP' }))).select('id, nome');
    const sb = ps.find((p) => p.nome === 'Freitas Santa Bárbara');
    await adm.from('patio_apelidos').insert([{ loja_id: loja.id, patio_id: sb.id, apelido: 'Freitas S. Barbara' }]);
  }
  return loja;
}

async function criarUsuario({ login, senha, perfil, lojaId, empresaId = null, nome = login, trocar = false }) {
  const { data: velho } = await adm.from('perfis_usuario').select('user_id').eq('login', login).maybeSingle();
  if (velho) { await adm.from('perfis_usuario').delete().eq('user_id', velho.user_id); await adm.auth.admin.deleteUser(velho.user_id); }
  const { data: u, error } = await adm.auth.admin.createUser({ email: email(login), password: senha, email_confirm: true });
  if (error) throw error;
  const { error: e2 } = await adm.from('perfis_usuario').insert({ user_id: u.user.id, perfil, loja_id: lojaId, empresa_cliente_id: empresaId, login, nome_exibicao: nome, deve_trocar_senha: trocar });
  if (e2) throw e2;
  return u.user.id;
}

async function limparLoja(lojaId) {
  const { data: emps } = await adm.from('empresas_clientes').select('id').eq('loja_id', lojaId);
  const { data: oss } = await adm.from('ordens_servico').select('id').eq('loja_id', lojaId);
  const ids = (oss ?? []).map((o) => o.id);
  if (ids.length) {
    const { data: an } = await adm.from('anexos').select('bucket, storage_path').in('os_id', ids);
    for (const b of ['laudos', 'anexos']) { const l = (an ?? []).filter((a) => a.bucket === b).map((a) => a.storage_path); if (l.length) await adm.storage.from(b).remove(l); }
  }
  const { data: lotes } = await adm.from('lotes_importacao').select('arquivo_path').eq('loja_id', lojaId);
  const arqs = (lotes ?? []).map((l) => l.arquivo_path).filter(Boolean); if (arqs.length) await adm.storage.from('importacoes').remove(arqs);
  for (const t of ['notificacoes', 'ordens_servico', 'lotes_importacao', 'precos_cliente']) await adm.from(t).delete().eq('loja_id', lojaId);
  const { data: perfis } = await adm.from('perfis_usuario').select('user_id, login').eq('loja_id', lojaId);
  for (const p of perfis ?? []) { await adm.from('perfis_usuario').delete().eq('user_id', p.user_id); await adm.auth.admin.deleteUser(p.user_id); await adm.from('acessos_log').delete().eq('login', p.login); }
  for (const t of ['empresas_clientes', 'precos', 'servicos', 'patio_apelidos', 'patios', 'taxas_deslocamento', 'vistoriadores', 'motivos', 'feriados', 'configuracoes', 'acessos_log', 'auditoria', 'faturas']) await adm.from(t).delete().eq('loja_id', lojaId);
  if (emps?.length) await adm.from('auditoria').delete().in('registro_id', emps.map((e) => e.id));
  if (ids.length) await adm.from('auditoria').delete().in('registro_id', ids);
  await adm.from('auditoria').delete().eq('registro_id', lojaId);
  await adm.from('lojas').delete().eq('id', lojaId);
}

async function limparLojaPorNome(nome) {
  const { data } = await adm.from('lojas').select('id').eq('nome', nome);
  for (const l of data ?? []) await limparLoja(l.id);
}

async function entrar(page, base, login, senha, destino) {
  await page.goto(base + '/login'); await page.fill('#login', login); await page.fill('#senha', senha); await page.click('button:has-text("Entrar")');
  if (destino) await page.waitForURL('**' + destino);
}

module.exports = { adm, email, criarLoja, criarUsuario, limparLoja, limparLojaPorNome, entrar };

/** Reserva o próximo número de OS da Loja (para inserts diretos nos testes). */
async function proximoNumero(lojaId) {
  const { data } = await adm.from('lojas').select('proximo_numero_os').eq('id', lojaId).single();
  await adm.from('lojas').update({ proximo_numero_os: data.proximo_numero_os + 1 }).eq('id', lojaId);
  return data.proximo_numero_os;
}

/** Loja de teste com Gestor pronto para entrar. */
async function lojaComGestor(nome, login) {
  const loja = await criarLoja(nome);
  await criarUsuario({ login, senha: 'gestor-senha-123', perfil: 'loja', lojaId: loja.id, nome: 'Gestor E2E' });
  return { loja, gestor: { login, senha: 'gestor-senha-123' } };
}
module.exports.proximoNumero = proximoNumero;
module.exports.lojaComGestor = lojaComGestor;
