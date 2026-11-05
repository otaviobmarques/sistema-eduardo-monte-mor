// Gateways de pagamento e Nova fatura com escolha da Loja (Administrador).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/gateways.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarLoja, criarUsuario, limparLoja, entrar } = require('./apoio');
const { adminTemporario } = require('./apoio');
let ADM;
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  ADM = await adminTemporario();
  const { data: antes } = await adm.from('gateways_pagamento').select('*').eq('provedor', 'asaas').single();
  if (antes.chave_secret_id) falha('já existe chave real configurada; teste abortado para não sobrescrever');
  const loja = await criarLoja('Loja E2E Gateways');
  await adm.from('lojas').update({ cnpj: '11444777000161' }).eq('id', loja.id);
  await criarUsuario({ login: 'gestor-gw', senha: 'gestor-senha-123', perfil: 'loja', lojaId: loja.id });
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(p, B, ADM.login, ADM.senha, '/admin');
    await p.goto(B + '/admin/gateways');
    await p.waitForSelector('text=Não configurado'); log('Asaas aparece como não configurado; Mercado Pago e Stripe como “Em breve”');
    await p.fill('#gw-chave', 'abc'); await p.click('button:has-text("Salvar e testar")');
    await p.waitForSelector('#gw-chave-msg.erro-campo'); log('chave com formato errado é recusada:', await p.textContent('[role=alert] div'));
    // chave inválida montada em tempo de execução (formato de chave do Asaas, mas sem valor real)
    await p.fill('#gw-chave', '$' + 'aact_' + 'teste'.repeat(20));
    await p.click('button:has-text("Salvar e testar")');
    await p.waitForSelector('text=Nada foi salvo'); log('chave recusada pelo Asaas não é salva:', (await p.textContent('[role=alert] div')).trim().slice(0, 90));
    const { data: depois } = await adm.from('gateways_pagamento').select('chave_secret_id').eq('provedor', 'asaas').single();
    if (depois.chave_secret_id) falha('salvou chave inválida');
    await p.screenshot({ path: S + '/admin-gateways.png', fullPage: true });

    // Cofre: grava pela função do admin, lê só pelo servidor
    const apiAdm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await apiAdm.auth.signInWithPassword({ email: email(ADM.login), password: ADM.senha });
    let { error } = await apiAdm.rpc('salvar_gateway', { p_provedor: 'asaas', p_ambiente: 'sandbox', p_ativo: false, p_chave: '$aact_teste_cofre_1234' });
    if (error) falha(error.message);
    const { data: cred } = await adm.rpc('credenciais_gateway', { p_provedor: 'asaas' });
    if (cred[0].chave !== '$aact_teste_cofre_1234' || !cred[0].webhook_token) falha('cofre não devolveu a chave');
    const { data: linha } = await adm.from('gateways_pagamento').select('chave_final').eq('provedor', 'asaas').single();
    log(`chave guardada no Vault; o painel só mostra o final “${linha.chave_final}”; token de webhook gerado`);
    ({ error } = await apiAdm.rpc('credenciais_gateway', { p_provedor: 'asaas' }));
    if (!error) falha('admin leu a chave pela API');
    const gest = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await gest.auth.signInWithPassword({ email: email('gestor-gw'), password: 'gestor-senha-123' });
    const { data: vistoGest } = await gest.from('gateways_pagamento').select('*');
    ({ error } = await gest.rpc('salvar_gateway', { p_provedor: 'asaas', p_ambiente: 'producao', p_ativo: true, p_chave: 'x' }));
    if (vistoGest?.length || !error) falha('Gestor acessou gateways');
    log('ninguém lê a chave pela API (nem o admin); Gestor não vê nem altera gateways');
    // volta ao estado inicial (sem chave)
    await adm.from('gateways_pagamento').update({ chave_secret_id: null, chave_final: null, ativo: false, teste_ok: null }).eq('provedor', 'asaas');

    // Nova fatura com escolha da Loja
    await p.goto(B + '/admin/cobranca');
    await p.click('button:has-text("Nova fatura")');
    log('“Cobrar pelo Asaas” desabilitado sem gateway:', await p.isDisabled('dialog input[type=checkbox]'));
    await p.fill('#nf-valor', '299,90');
    await p.click('dialog button:has-text("Registrar fatura manual")');
    await p.waitForSelector('dialog .erro-campo'); log('exige a Loja:', await p.textContent('dialog .erro-campo'));
    await p.selectOption('#nf-loja', { label: 'Loja E2E Gateways' });
    await p.click('dialog button:has-text("Registrar fatura manual")');
    await p.waitForSelector('dialog >> text=Fatura manual registrada'); await p.click('dialog button:has-text("Fechar")');
    await p.waitForSelector('td:has-text("Loja E2E Gateways")'); log('fatura criada para a Loja escolhida e listada na Cobrança');
    await p.click('button:has-text("Nova fatura")'); await p.screenshot({ path: S + '/admin-nova-fatura.png' });
  } finally {
    await b.close();
    await ADM.remover();
    if (!process.env.MANTER) await limparLoja(loja.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
