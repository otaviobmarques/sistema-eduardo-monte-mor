// Gateways de pagamento (Administrador): configuração separada para Teste (sandbox) e Produção, seletor do ambiente
// em uso, webhook por conta, faturas marcadas por ambiente (teste não bloqueia Loja nem aparece para o Gestor) e
// Nova fatura com escolha da Loja.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/gateways.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarLoja, criarUsuario, limparLoja, entrar, adminTemporario } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// chaves falsas montadas em tempo de execução (formato de chave do Asaas, sem valor real)
const falsa = (sufixo) => '$' + 'aact_' + 'teste_' + sufixo;

(async () => {
  const { data: antes } = await adm.from('gateways_ambientes').select('ambiente, chave_secret_id').eq('provedor', 'asaas');
  if (antes.some((a) => a.chave_secret_id)) falha('já existe chave configurada no Asaas; teste abortado para não sobrescrever');
  const { data: gwAntes } = await adm.from('gateways_pagamento').select('ativo, ambiente').eq('provedor', 'asaas').single();
  const ADM = await adminTemporario();
  const loja = await criarLoja('Loja E2E Gateways');
  await adm.from('lojas').update({ cnpj: '11444777000161', dias_tolerancia: 5 }).eq('id', loja.id);
  await criarUsuario({ login: 'gestor-gw', senha: 'gestor-senha-123', perfil: 'loja', lojaId: loja.id });
  const apiAdm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  await apiAdm.auth.signInWithPassword({ email: email(ADM.login), password: ADM.senha });
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(p, B, ADM.login, ADM.senha, '/admin');
    await p.goto(B + '/admin/gateways');
    await p.waitForSelector('text=Asaas desligado · faturas manuais');
    if ((await p.locator('text=Sem chave').count()) < 2) falha('esperava os dois ambientes sem chave');
    log('tela: seletor “Ambiente em uso” (desligado) e um cartão para Teste e outro para Produção, ambos sem chave');

    // Validação e teste da chave antes de salvar (no cartão de Teste)
    await p.fill('#gw-sandbox-chave', 'abc'); await p.click('section:has(#gw-sandbox-titulo) button:has-text("Salvar e testar")');
    await p.waitForSelector('#gw-sandbox-chave-msg.erro-campo');
    await p.fill('#gw-sandbox-chave', falsa('x'.repeat(60)));
    await p.click('section:has(#gw-sandbox-titulo) button:has-text("Salvar e testar")');
    await p.waitForSelector('section:has(#gw-sandbox-titulo) >> text=Nada foi salvo', { timeout: 30000 });
    const { data: semChave } = await adm.from('gateways_ambientes').select('chave_secret_id').eq('provedor', 'asaas');
    if (semChave.some((a) => a.chave_secret_id)) falha('salvou chave recusada');
    log('chave com formato errado é recusada; chave que o Asaas sandbox não aceita não é salva');

    // Seletor não deixa ligar um ambiente sem chave
    await p.check('input[name=gw-ambiente][value=producao]'); await p.check('section:has(#gw-uso) input[type=checkbox]');
    await p.waitForSelector('text=O ambiente Produção está sem chave');
    if (!(await p.isDisabled('button:has-text("Salvar seleção")'))) falha('deixou ligar Produção sem chave');
    let { error } = await apiAdm.rpc('usar_ambiente_gateway', { p_provedor: 'asaas', p_ambiente: 'producao', p_ativo: true });
    if (!error?.message.includes('SEM_CHAVE')) falha('banco deixou ligar sem chave');
    log('não dá para ligar um ambiente sem chave (tela e banco)');
    await p.screenshot({ path: S + '/gw-vazio.png', fullPage: true });

    // Duas chaves guardadas lado a lado no cofre
    for (const [a, k] of [['sandbox', falsa('sandbox_1111')], ['producao', falsa('producao_2222')]]) {
      ({ error } = await apiAdm.rpc('salvar_chave_gateway', { p_provedor: 'asaas', p_ambiente: a, p_chave: k }));
      if (error) falha(error.message);
    }
    const cred = async (a) => (await adm.rpc('credenciais_gateway_ambiente', { p_provedor: 'asaas', p_ambiente: a })).data[0];
    const [cs, cp] = [await cred('sandbox'), await cred('producao')];
    if (cs.chave !== falsa('sandbox_1111') || cp.chave !== falsa('producao_2222') || !cs.webhook_token || !cp.webhook_token || cs.webhook_token === cp.webhook_token) falha('cofre por ambiente');
    log('Teste e Produção com chaves e tokens de webhook próprios no cofre (Vault)');

    // Seletor troca o ambiente em uso sem apagar o outro
    await p.reload();
    await p.check('input[name=gw-ambiente][value=producao]'); await p.check('section:has(#gw-uso) input[type=checkbox]');
    await p.click('button:has-text("Salvar seleção")');
    await p.waitForSelector('text=As cobranças novas saem pelo Asaas Produção');
    let emUso = (await adm.rpc('credenciais_gateway', { p_provedor: 'asaas' })).data[0];
    if (emUso.ambiente !== 'producao' || !emUso.ativo || emUso.chave !== falsa('producao_2222')) falha('seletor → produção');
    ({ error } = await apiAdm.rpc('usar_ambiente_gateway', { p_provedor: 'asaas', p_ambiente: 'sandbox', p_ativo: true }));
    emUso = (await adm.rpc('credenciais_gateway', { p_provedor: 'asaas' })).data[0];
    if (error || emUso.ambiente !== 'sandbox' || emUso.chave !== falsa('sandbox_1111') || (await cred('producao')).chave !== falsa('producao_2222')) falha('seletor → teste');
    log('seletor: Produção em uso → as cobranças usam a chave de produção; volta para Teste e a de produção continua salva');
    await p.reload(); await p.waitForSelector('text=Cobrando pelo Asaas Teste');
    await p.screenshot({ path: S + '/gw-dois-ambientes.png', fullPage: true });

    // Ninguém lê a chave pela API; Gestor não vê nem altera
    if (!(await apiAdm.rpc('credenciais_gateway_ambiente', { p_provedor: 'asaas', p_ambiente: 'sandbox' })).error) falha('admin leu a chave pela API');
    const gest = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await gest.auth.signInWithPassword({ email: email('gestor-gw'), password: 'gestor-senha-123' });
    const { data: vistoGest } = await gest.from('gateways_ambientes').select('*');
    const e1 = (await gest.rpc('salvar_chave_gateway', { p_provedor: 'asaas', p_ambiente: 'producao', p_chave: 'x' })).error;
    const e2 = (await gest.rpc('usar_ambiente_gateway', { p_provedor: 'asaas', p_ambiente: 'producao', p_ativo: false })).error;
    if (vistoGest?.length || !e1 || !e2) falha('Gestor acessou gateways');
    log('ninguém lê a chave pela API (nem o admin); Gestor não vê nem altera gateways');

    // Webhook: cada conta avisa com o próprio token e só mexe nas faturas do próprio ambiente
    const wh = (token, id, extra = {}) => fetch(B + '/api/asaas/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': token },
      body: JSON.stringify({ event: 'PAYMENT_CREATED', payment: { id, customer: 'cus_x', value: 199.9, dueDate: '2026-09-01', status: 'OVERDUE', externalReference: `avulsa:${loja.id}`, description: 'Cobrança teste', ...extra } }) });
    if ((await wh('token-errado', 'pay_e2e_x')).status !== 401) falha('webhook aceitou token errado');
    const r1 = await (await wh(cs.webhook_token, 'pay_e2e_sandbox')).json();
    const r2 = await (await wh(cp.webhook_token, 'pay_e2e_sandbox', { status: 'RECEIVED' })).json();
    const r3 = await (await wh(cp.webhook_token, 'pay_e2e_producao')).json();
    const { data: fs } = await adm.from('faturas').select('asaas_payment_id, ambiente, status').eq('loja_id', loja.id).order('asaas_payment_id');
    if (r1.ambiente !== 'sandbox' || !String(r2.ignorado).includes('outro ambiente') || r3.ambiente !== 'producao' || fs.length !== 2 || fs.find((f) => f.asaas_payment_id === 'pay_e2e_sandbox').status !== 'vencido') falha('webhook por ambiente: ' + JSON.stringify(fs));
    log('webhook: token errado → 401; aviso da conta Teste cria fatura Teste; a conta Produção não altera fatura de Teste; aviso de Produção cria fatura de Produção');

    // Fatura de teste não bloqueia a Loja; a de produção, sim. O Gestor só vê a real.
    await adm.from('faturas').update({ vencimento: '2026-09-01' }).eq('loja_id', loja.id);
    await adm.from('faturas').update({ status: 'pago' }).eq('asaas_payment_id', 'pay_e2e_producao');
    await adm.rpc('verificar_inadimplencia');
    if ((await adm.from('lojas').select('bloqueada').eq('id', loja.id).single()).data.bloqueada) falha('fatura de teste bloqueou a Loja');
    await adm.from('faturas').update({ status: 'vencido' }).eq('asaas_payment_id', 'pay_e2e_producao');
    await adm.rpc('verificar_inadimplencia');
    if (!(await adm.from('lojas').select('bloqueada').eq('id', loja.id).single()).data.bloqueada) falha('fatura real vencida não bloqueou');
    await adm.from('lojas').update({ bloqueada: false, bloqueio_automatico: false, bloqueada_em: null, motivo_bloqueio: null }).eq('id', loja.id);
    const { data: doGestor } = await gest.from('faturas').select('asaas_payment_id');
    if (doGestor.length !== 1 || doGestor[0].asaas_payment_id !== 'pay_e2e_producao') falha('Gestor viu fatura de teste: ' + JSON.stringify(doGestor));
    log('fatura de Teste vencida não bloqueia a Loja (a de Produção bloqueia); o Gestor só vê a fatura real');

    // Cobrança: totais só com o real, filtro e marca “Teste”
    await p.goto(B + '/admin/cobranca');
    const txt = (await p.textContent('main')).replace(/ /g, ' ');
    if (!txt.includes('+ 1 de teste') || !txt.includes('R$ 199,90')) falha('KPIs da cobrança');
    await p.goto(B + '/admin/cobranca?ambiente=teste');
    await p.waitForSelector('td:has-text("Cobrança teste") >> text=Teste');
    if ((await p.locator('tbody tr').count()) !== 1) falha('filtro Teste');
    log('Cobrança: totais contam só faturas reais (“+ 1 de teste”), filtro Reais/Teste e a fatura marcada “Teste”');
    await p.screenshot({ path: S + '/gw-cobranca-teste.png', fullPage: true });

    // Remover a chave do ambiente em uso desliga o gateway
    await p.goto(B + '/admin/gateways');
    p.once('dialog', (d) => d.accept());
    await p.click('section:has(#gw-sandbox-titulo) button:has-text("Remover chave")');
    await p.waitForSelector('section:has(#gw-sandbox-titulo) >> text=Chave removida.');
    await espera(500);
    emUso = (await adm.from('gateways_pagamento').select('ativo').eq('provedor', 'asaas').single()).data;
    if (emUso.ativo || (await cred('sandbox')).chave || (await cred('producao')).chave !== falsa('producao_2222')) falha('remover chave');
    log('remover a chave do ambiente em uso desliga o Asaas; a chave do outro ambiente continua salva');

    // Nova fatura com escolha da Loja (manual, com o Asaas desligado)
    await p.goto(B + '/admin/cobranca');
    await p.click('button:has-text("Nova fatura")');
    if (!(await p.isDisabled('dialog input[type=checkbox]'))) falha('“Cobrar pelo Asaas” habilitado sem gateway');
    await p.fill('#nf-valor', '299,90');
    await p.click('dialog button:has-text("Registrar fatura manual")');
    await p.waitForSelector('dialog .erro-campo');
    await p.selectOption('#nf-loja', { label: 'Loja E2E Gateways' });
    await p.click('dialog button:has-text("Registrar fatura manual")');
    await p.waitForSelector('dialog >> text=Fatura manual registrada'); await p.click('dialog button:has-text("Fechar")');
    await p.waitForSelector('td:has-text("Loja E2E Gateways")');
    const { data: manual } = await adm.from('faturas').select('ambiente').eq('loja_id', loja.id).is('asaas_payment_id', null).single();
    if (manual.ambiente !== null) falha('fatura manual com ambiente');
    log('Nova fatura: exige a Loja; sem gateway ligado vira fatura manual (sem ambiente), listada como Real');
  } finally {
    await b.close();
    for (const a of ['sandbox', 'producao']) await apiAdm.rpc('remover_chave_gateway', { p_provedor: 'asaas', p_ambiente: a });
    await adm.from('gateways_pagamento').update({ ativo: gwAntes.ativo, ambiente: gwAntes.ambiente }).eq('provedor', 'asaas');
    await ADM.remover();
    if (!process.env.MANTER) await limparLoja(loja.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
