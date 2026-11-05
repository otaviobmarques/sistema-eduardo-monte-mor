// Loja bloqueada por atraso: o Gestor entra, mas só a Assinatura funciona (menus inativos, outras telas levam a ela,
// banco não entrega nada além da Loja e das faturas). Clientes da Loja ficam sem acesso. Ao pagar, libera sozinho,
// sem sair do sistema. Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/loja-bloqueada.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarUsuario, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const dia = (n) => new Date(Date.now() - 3 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

(async () => {
  const AMB = await lojaComGestor('Loja E2E Bloqueada', 'gestor-bloq');
  const L = AMB.loja;
  await adm.from('lojas').update({ dias_tolerancia: 5 }).eq('id', L.id);
  const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Bloq', nome_fantasia: 'Cliente Bloq' }).select('id').single();
  await criarUsuario({ login: 'cliente-bloq', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: emp.id });
  const { data: f } = await adm.from('faturas').insert({ loja_id: L.id, tipo: 'mensalidade', descricao: 'Mensalidade 10/2026', valor: 350, vencimento: dia(-10), status: 'pendente', link_pagamento: 'https://www.asaas.com/i/e2e-bloq' }).select('id').single();
  await adm.rpc('verificar_inadimplencia');
  const { data: l1 } = await adm.from('lojas').select('bloqueada, bloqueio_automatico, motivo_bloqueio').eq('id', L.id).single();
  if (!l1.bloqueada || !l1.bloqueio_automatico) falha('Loja não foi bloqueada');
  log(`Loja bloqueada automaticamente: “${l1.motivo_bloqueio}”`);
  const b = await chromium.launch();
  try {
    // Cliente da Loja bloqueada continua sem entrar
    const c = await (await b.newContext()).newPage();
    await c.goto(B + '/login'); await c.fill('#login', 'cliente-bloq'); await c.fill('#senha', 'cliente-senha-123'); await c.click('button:has-text("Entrar")');
    await c.waitForSelector('text=temporariamente indisponível');
    log('cliente da Loja bloqueada não entra (“O sistema está temporariamente indisponível…”)');

    // Gestor entra e cai na Assinatura
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja/assinatura');
    for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
    await p.waitForSelector('[role=alert]:has-text("Acesso da Loja suspenso")');
    if ((await p.getAttribute('[role=alert]:has-text("Acesso da Loja suspenso") a:has-text("Pagar agora")', 'href')) !== 'https://www.asaas.com/i/e2e-bloq') falha('Pagar agora');
    await p.waitForSelector('td:has-text("Mensalidade 10/2026")');
    const inativos = await p.$$eval('aside nav [aria-disabled=true]', (els) => els.map((e) => e.textContent.replace('(indisponível até a fatura ser paga)', '').trim()));
    const links = await p.$$eval('aside nav a', (els) => els.map((e) => e.textContent.trim()));
    if (!inativos.includes('Fila de OS') || !inativos.includes('Financeiro') || links.includes('Fila de OS') || !links.includes('Assinatura')) falha(`menus: inativos=${inativos} links=${links}`);
    log(`Gestor entra direto na Assinatura: faixa “Acesso da Loja suspenso” com “Pagar agora”; ${inativos.length} menus inativos, só “Assinatura” clicável`);
    await p.screenshot({ path: S + '/bloq-gestor.png', fullPage: true });

    for (const r of ['/loja', '/loja/financeiro/pagamentos', '/loja/clientes', '/loja/os/nova']) {
      await p.goto(B + r); await p.waitForURL('**/loja/assinatura');
    }
    log('abrir outras telas pelo endereço (/loja, /loja/financeiro, /loja/clientes, /loja/os/nova) leva de volta à Assinatura');
    const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await api.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const [{ data: fs }, { data: ls }, { data: cs }, { error: eRpc }] = await Promise.all([
      api.from('faturas').select('id'), api.from('lojas').select('id'), api.from('empresas_clientes').select('id'),
      api.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'X', p_telefone: null, p_placa: 'BLQ1A11', p_renavam: null, p_marca_modelo: null, p_ano: null, p_cor: null, p_categoria_id: null, p_servico_id: null, p_local_tipo: 'patio', p_patio_id: null, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null }),
    ]);
    if (fs.length !== 1 || ls.length !== 1 || cs.length || !eRpc) falha(`banco: faturas ${fs.length}, lojas ${ls.length}, clientes ${cs.length}, abrir_os ${eRpc ? 'recusado' : 'aceito'}`);
    log('no banco o Gestor bloqueado só lê a Loja e as faturas; não vê clientes nem consegue abrir OS');

    // Celular: barra inferior com só a Assinatura ativa
    const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await entrar(m, B, AMB.gestor.login, AMB.gestor.senha, '/loja/assinatura');
    for (let i = 0; i < 2; i++) await m.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
    await m.screenshot({ path: S + '/bloq-celular.png', fullPage: true });

    // Pagamento confirmado (como o webhook faz) → libera sozinho, sem sair do sistema
    await adm.from('faturas').update({ status: 'pago', pago_em: new Date().toISOString() }).eq('id', f.id);
    await adm.rpc('reavaliar_bloqueio', { p_loja: L.id });
    await p.goto(B + '/loja/assinatura');
    await p.waitForSelector('aside nav a:has-text("Fila de OS")', { timeout: 5000 }).catch(() => {});
    await m.waitForSelector('nav[aria-label=Atalhos] a:has-text("Fila")', { timeout: 45000 });
    log('pagamento confirmado → a Loja libera sozinha; a tela aberta no celular reativa os menus sem recarregar');
    await p.click('aside nav a:has-text("Fila de OS")'); await p.waitForURL(B + '/loja');
    await c.goto(B + '/login'); await c.fill('#login', 'cliente-bloq'); await c.fill('#senha', 'cliente-senha-123'); await c.click('button:has-text("Entrar")');
    await c.waitForURL('**/app');
    log('Gestor volta a usar a Fila e o cliente volta a entrar');
  } finally {
    await b.close();
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
