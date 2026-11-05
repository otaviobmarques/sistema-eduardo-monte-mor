// Integração REAL com o Asaas de teste (sandbox), ponta a ponta, contra o sistema publicado:
// Admin ativa a assinatura de uma Loja de teste → Start + mensalidade criados no Asaas → pagamento simulado no Asaas →
// webhook do Asaas dá baixa sozinho → Gestor não vê as faturas de teste. No fim cancela/apaga tudo no Asaas e no banco.
// Só roda com o ambiente em uso = Teste (sandbox), ligado, com chave e webhook configurados em /admin/gateways.
// Uso: BASE_URL=https://auto-visao-os.vercel.app S=pasta node tests/e2e/asaas-sandbox.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarLoja, criarUsuario, limparLoja, entrar, adminTemporario } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'https://auto-visao-os.vercel.app';
const API = 'https://api-sandbox.asaas.com/v3';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function aguardar(desc, fn, ms = 120000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { const r = await fn(); if (r) return r; await espera(3000); }
  falha(`tempo esgotado esperando: ${desc}`);
}

(async () => {
  const { data: uso } = await adm.from('gateways_pagamento').select('ativo, ambiente').eq('provedor', 'asaas').single();
  const { data: amb } = await adm.from('gateways_ambientes').select('chave_secret_id, webhook_url').eq('provedor', 'asaas').eq('ambiente', 'sandbox').single();
  // Se o ambiente em uso não for Teste ligado, passa para Teste só durante o teste e devolve a seleção no fim
  const restaurarUso = uso.ativo && uso.ambiente === 'sandbox' ? null : { ativo: uso.ativo, ambiente: uso.ambiente };
  if (!amb.chave_secret_id || !amb.webhook_url) falha('configure a chave e o webhook do Teste em /admin/gateways');
  const chave = (await adm.rpc('credenciais_gateway_ambiente', { p_provedor: 'asaas', p_ambiente: 'sandbox' })).data[0].chave;
  const asaas = async (metodo, caminho, corpo) => {
    const r = await fetch(API + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', access_token: chave, 'User-Agent': 'SistemaOS-AutoVisao-E2E/1.0' }, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Asaas ${metodo} ${caminho}: ${r.status} ${JSON.stringify(j.errors ?? j).slice(0, 200)}`);
    return j;
  };

  const { data: formaAntes } = await adm.from('gateways_pagamento').select('forma_pagamento').eq('provedor', 'asaas').single();
  if (restaurarUso) {
    await adm.from('gateways_pagamento').update({ ativo: true, ambiente: 'sandbox' }).eq('provedor', 'asaas');
    console.log(`  (seleção “${restaurarUso.ambiente}, ${restaurarUso.ativo ? 'ligado' : 'desligado'}” trocada por Teste durante o teste; volta no fim)`);
  }
  const ADM = await adminTemporario();
  const loja = await criarLoja('Loja E2E Asaas Sandbox');
  await adm.from('lojas').update({ cnpj: '11444777000161', razao_social: 'Loja E2E Asaas Sandbox Ltda', email: 'loja-e2e@example.com', plano_mensal: 199.9, taxa_start: 500, dia_vencimento: 10, dias_tolerancia: 5 }).eq('id', loja.id);
  await criarUsuario({ login: 'gestor-asaas-sb', senha: 'gestor-senha-123', perfil: 'loja', lojaId: loja.id });
  let gw = null;
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(p, B, ADM.login, ADM.senha, '/admin');
    await p.goto(`${B}/admin/lojas/${loja.id}`);
    await p.waitForSelector('text=Asaas · Teste (sandbox)');
    await p.click('button:has-text("Ativar assinatura (Start + mensalidade)")');
    await p.waitForSelector('text=cobrança(s) criada(s) no Asaas', { timeout: 60000 });
    log('Admin › Loja › “Ativar assinatura”:', (await p.textContent('[role=status], .aviso')).trim().slice(0, 90));

    ({ data: gw } = await adm.from('lojas_gateway').select('customer_id, subscription_id').eq('loja_id', loja.id).eq('ambiente', 'sandbox').single());
    if (!gw.customer_id || !gw.subscription_id) falha('cliente/assinatura não gravados');
    const cliente = await asaas('GET', `/customers/${gw.customer_id}`);
    const assin = await asaas('GET', `/subscriptions/${gw.subscription_id}`);
    if (cliente.cpfCnpj !== '11444777000161' || assin.value !== 199.9 || assin.cycle !== 'MONTHLY' || !assin.nextDueDate.endsWith('-10')) falha('dados no Asaas: ' + JSON.stringify({ cnpj: cliente.cpfCnpj, v: assin.value, c: assin.cycle, d: assin.nextDueDate }));
    log(`no Asaas sandbox: cliente ${cliente.name} (CNPJ ${cliente.cpfCnpj}) e assinatura mensal de R$ ${assin.value} com vencimento dia 10 (próximo: ${assin.nextDueDate})`);

    const { data: fs } = await adm.from('faturas').select('id, tipo, valor, status, ambiente, link_pagamento, asaas_payment_id, vencimento').eq('loja_id', loja.id).order('tipo');
    const start = fs.find((f) => f.tipo === 'start'), mensal = fs.find((f) => f.tipo === 'mensalidade');
    if (!start || !mensal || fs.some((f) => f.ambiente !== 'sandbox' || !f.link_pagamento?.includes('asaas.com'))) falha('faturas: ' + JSON.stringify(fs));
    log(`faturas no sistema: Start R$ ${start.valor} e Mensalidade R$ ${mensal.valor}, marcadas Teste, com link de pagamento (${start.link_pagamento.replace(/\/i\/.*/, '/i/…')})`);
    await p.screenshot({ path: S + '/asaas-sb-loja.png', fullPage: true });

    // Pagamento simulado no Asaas (recebimento em dinheiro) → o Asaas avisa o webhook → baixa automática
    await asaas('POST', `/payments/${start.asaas_payment_id}/receiveInCash`, { paymentDate: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), value: Number(start.valor), notifyCustomer: false });
    const t0 = Date.now();
    const pago = await aguardar('webhook dar baixa no Start', async () => {
      const { data } = await adm.from('faturas').select('status, pago_em').eq('id', start.id).single();
      return data.status === 'pago' ? data : null;
    });
    log(`pagamento do Start confirmado no Asaas → webhook deu baixa sozinho em ${((Date.now() - t0) / 1000).toFixed(0)} s (pago em ${pago.pago_em.slice(0, 10)})`);
    await p.goto(`${B}/admin/cobranca?ambiente=teste`);
    await p.waitForSelector('tr:has-text("Loja E2E Asaas Sandbox") >> text=Paga');
    log('Admin › Cobrança (filtro Teste): Start como “Paga”, mensalidade em aberto');
    await p.screenshot({ path: S + '/asaas-sb-cobranca.png', fullPage: true });

    // Formas de pagamento: padrão Pix aplicado às que estão em aberto (assinatura + mensalidade), conferido no Asaas
    await p.goto(`${B}/admin/gateways`);
    await p.check('input[name=gw-forma][value=PIX]');
    await p.check('section:has(#gw-formas) input[type=checkbox]');
    await p.click('button:has-text("Salvar forma de pagamento")');
    await p.waitForSelector('section:has(#gw-formas) >> text=Atualizadas no Asaas', { timeout: 60000 });
    log('Gateways › Formas de pagamento:', (await p.textContent('section:has(#gw-formas) [role=status], section:has(#gw-formas) .aviso')).replace(/\s+/g, ' ').trim().slice(0, 140));
    await p.screenshot({ path: S + '/asaas-sb-formas.png', fullPage: true });
    const assin2 = await asaas('GET', `/subscriptions/${gw.subscription_id}`);
    const mens2 = await asaas('GET', `/payments/${mensal.asaas_payment_id}`);
    if (assin2.billingType !== 'PIX' || mens2.billingType !== 'PIX') falha(`forma no Asaas: assinatura ${assin2.billingType}, mensalidade ${mens2.billingType}`);
    log('no Asaas: a assinatura e a mensalidade em aberto passaram para Pix');

    // Nova fatura escolhendo Boleto só para ela
    await p.goto(`${B}/admin/lojas/${loja.id}`);
    await p.click('button:has-text("Nova fatura")');
    await p.check('dialog input[name=nf-tipo][value=avulsa]').catch(async () => p.click('dialog label:has-text("Avulsa")'));
    await p.fill('#nf-desc', 'Taxa avulsa de teste');
    await p.fill('#nf-valor', '49,90');
    if ((await p.inputValue('#nf-forma')) !== 'PIX') falha('Nova fatura não veio com o padrão (Pix)');
    await p.selectOption('#nf-forma', 'BOLETO');
    await p.click('dialog button:has-text("Gerar cobrança")');
    await p.waitForSelector('dialog >> text=Abrir link de pagamento', { timeout: 60000 });
    const { data: avulsa } = await adm.from('faturas').select('asaas_payment_id, forma_solicitada, ambiente').eq('loja_id', loja.id).eq('tipo', 'avulsa').single();
    const pagAv = await asaas('GET', `/payments/${avulsa.asaas_payment_id}`);
    if (pagAv.billingType !== 'BOLETO' || avulsa.forma_solicitada !== 'BOLETO' || avulsa.ambiente !== 'sandbox') falha('fatura avulsa: ' + JSON.stringify({ asaas: pagAv.billingType, ...avulsa }));
    log('Nova fatura: veio com o padrão (Pix); escolhendo Boleto, a cobrança foi criada no Asaas como boleto');

    // O Gestor não vê faturas de teste
    const gest = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await gest.auth.signInWithPassword({ email: email('gestor-asaas-sb'), password: 'gestor-senha-123' });
    const { data: doGestor } = await gest.from('faturas').select('id');
    if (doGestor.length) falha('Gestor viu faturas de teste');
    log('o Gestor da Loja não vê nenhuma dessas faturas de teste');
  } finally {
    await b.close();
    // Limpa no Asaas: cancela a assinatura (remove as cobranças em aberto) e remove o cliente
    if (gw?.subscription_id) await asaas('DELETE', `/subscriptions/${gw.subscription_id}`).catch((e) => console.log('  (limpeza)', e.message));
    if (gw?.customer_id) await asaas('DELETE', `/customers/${gw.customer_id}`).catch((e) => console.log('  (limpeza)', e.message));
    await espera(15000); // avisos de exclusão chegam ao webhook antes de apagar a Loja
    const { data: cancel } = await adm.from('faturas').select('tipo, status').eq('loja_id', loja.id);
    console.log('  limpeza no Asaas feita; faturas após o cancelamento:', JSON.stringify(cancel));
    await adm.from('gateways_pagamento').update({ forma_pagamento: formaAntes.forma_pagamento, ...(restaurarUso ?? {}) }).eq('provedor', 'asaas');
    if (restaurarUso) console.log('  seleção devolvida:', JSON.stringify((await adm.from('gateways_pagamento').select('ativo, ambiente, forma_pagamento').eq('provedor', 'asaas').single()).data));
    await ADM.remover();
    if (!process.env.MANTER) await limparLoja(loja.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
