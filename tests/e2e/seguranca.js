// Etapa 10 · Endurecimento: rate limit do login, registro de acessos (tela do Gestor e do Administrador),
// cabeçalhos de segurança, /api/saude e funções internas fora da API.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/seguranca.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, criarUsuario, limparLoja, entrar, lojaComGestor, adminTemporario } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const LOGIN = 'cliente-seguranca';

(async () => {
  const AMB = await lojaComGestor('Loja E2E Segurança', 'gestor-seguranca');
  const admin = await adminTemporario();
  const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: AMB.loja.id, cnpj: '11222333000181', razao_social: 'Cliente Seg', nome_fantasia: 'Cliente Seg' }).select('id').single();
  await criarUsuario({ login: LOGIN, senha: 'senha-certa-123', perfil: 'cliente', lojaId: AMB.loja.id, empresaId: emp.id });
  await adm.from('acessos_log').delete().in('login', [LOGIN, AMB.gestor.login, admin.login]);
  const b = await chromium.launch();
  try {
    // Cabeçalhos e saúde
    const r = await fetch(B + '/login');
    const h = Object.fromEntries(r.headers);
    for (const k of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']) if (!h[k]) falha(`cabeçalho ausente: ${k}`);
    if (h['x-powered-by']) falha('x-powered-by exposto');
    if (!h['content-security-policy'].includes("frame-ancestors 'none'")) falha('CSP sem frame-ancestors');
    log("cabeçalhos: CSP (frame-ancestors 'none'), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; sem X-Powered-By");
    const saude = await (await fetch(B + '/api/saude')).json();
    if (!saude.ok || saude.banco !== 'ok') falha('saúde');
    log(`/api/saude sem login: ok=${saude.ok}, banco ${saude.banco}, ${saude.ms} ms (sem dados)`);

    // Rate limit: 5 falhas travam o login, mesmo com a senha certa depois
    const p = await (await b.newContext()).newPage();
    for (let i = 1; i <= 5; i++) {
      await p.goto(B + '/login'); await p.fill('#login', LOGIN); await p.fill('#senha', `errada-${i}`); await p.click('button:has-text("Entrar")');
      await p.waitForSelector('text=Usuário ou senha incorretos.');
    }
    await p.goto(B + '/login'); await p.fill('#login', LOGIN); await p.fill('#senha', 'senha-certa-123'); await p.click('button:has-text("Entrar")');
    await p.waitForSelector('text=Muitas tentativas. Aguarde 15 minutos');
    if (!p.url().includes('/login')) falha('entrou apesar do limite');
    log('5 senhas erradas travam o usuário: a 6ª tentativa, mesmo com a senha certa, recebe “Muitas tentativas. Aguarde 15 minutos”');
    const { data: reg } = await adm.from('acessos_log').select('sucesso, motivo, loja_id, ip, user_agent').eq('login', LOGIN).order('em');
    if (reg.length !== 6 || reg.some((x) => x.sucesso) || reg[5].motivo !== 'limite de tentativas' || reg[0].motivo !== 'usuário ou senha incorretos' || reg.some((x) => x.loja_id !== AMB.loja.id)) falha('registro: ' + JSON.stringify(reg.map((x) => [x.motivo, x.loja_id === AMB.loja.id])));
    log('acessos_log: 6 falhas com motivo (5 “usuário ou senha incorretos” + “limite de tentativas”), IP, navegador e a Loja do usuário');

    // Gestor vê as tentativas do usuário da Loja dele
    const g = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(g, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
    await g.goto(B + '/loja/auditoria/acessos');
    const t = await g.textContent('main');
    if (!t.includes(LOGIN) || !t.includes('limite de tentativas') || !/Usuários travados agora\s*1/.test(t)) falha('tela de acessos do Gestor');
    if (!t.includes(AMB.gestor.login)) falha('entrada do Gestor ausente');
    log('Auditoria › Acessos do Gestor: falhas do cliente com motivo, a própria entrada e “Usuários travados agora: 1”');
    await g.screenshot({ path: S + '/seg-acessos-gestor.png', fullPage: true });

    // Administrador vê todas as Lojas; o Gestor de outra Loja não vê estas
    const a = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(a, B, admin.login, admin.senha, '/admin');
    await a.goto(B + `/admin/acessos?q=${LOGIN}`);
    const ta = await a.textContent('main');
    if (!ta.includes('Loja E2E Segurança') || !ta.includes(LOGIN)) falha('tela de acessos do Administrador');
    log('Administrador › Acessos: vê as tentativas com a Loja de cada usuário');
    const outra = await lojaComGestor('Loja E2E Segurança Outra', 'gestor-seguranca-b');
    const o = await (await b.newContext()).newPage();
    await entrar(o, B, outra.gestor.login, outra.gestor.senha, '/loja');
    await o.goto(B + '/loja/auditoria/acessos');
    if ((await o.textContent('main')).includes(LOGIN)) falha('outra Loja vê acessos alheios');
    log('Gestor de outra Loja não vê esses acessos (RLS)');
    await limparLoja(outra.loja.id);

    // Cliente não entra na auditoria; funções internas fora da API
    await adm.from('acessos_log').delete().eq('login', LOGIN); // destrava para seguir
    const c = await (await b.newContext()).newPage();
    await entrar(c, B, LOGIN, 'senha-certa-123', '/app');
    await c.goto(B + '/loja/auditoria/acessos'); await c.waitForURL('**/app');
    log('cliente que tenta abrir /loja/auditoria/acessos volta para o painel dele');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const e1 = (await anon.rpc('tg_alerta_pagamento')).error, e2 = (await anon.rpc('limpar_acessos_antigos')).error;
    const { data: leitura } = await anon.from('acessos_log').select('id').limit(1);
    if (!e1 || !e2 || leitura?.length) falha('funções internas ou acessos expostos');
    log('anônimo não executa funções internas (tg_alerta_pagamento, limpar_acessos_antigos) nem lê acessos_log');
  } finally {
    await b.close();
    await adm.from('acessos_log').delete().in('login', [LOGIN, AMB.gestor.login, admin.login, 'gestor-seguranca-b']);
    await admin.remover();
    await limparLoja(AMB.loja.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
