// Aviso de fatura vencida para o Gestor: notificação em tempo real (aviso na tela, sino e push), janela ao entrar no
// sistema com “Pagar agora”, “Lembrar depois” por sessão, nada para faturas de teste e tudo some quando a fatura é paga.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/fatura-vencida.js
const { chromium } = require('playwright');
const { adm, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const dia = (n) => new Date(Date.now() - 3 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const br = (d) => d.split('-').reverse().join('/');

(async () => {
  const AMB = await lojaComGestor('Loja E2E Fatura Vencida', 'gestor-fatura');
  const L = AMB.loja;
  await adm.from('lojas').update({ dias_tolerancia: 5 }).eq('id', L.id);
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
    for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 3000 }).catch(() => {});
    if (await p.locator('dialog[open]').count()) falha('janela aberta sem fatura vencida');
    await espera(2000);

    // Fatura de teste vencida: nada para o Gestor
    const venc = dia(-2);
    await adm.from('faturas').insert({ loja_id: L.id, tipo: 'avulsa', descricao: 'Cobrança de teste', valor: 99, vencimento: venc, status: 'pendente', ambiente: 'sandbox', asaas_payment_id: `pay_e2e_sb_${Date.now()}` });
    // Mensalidade real que vence agora (o job diário marca como vencida)
    const { data: f } = await adm.from('faturas').insert({ loja_id: L.id, tipo: 'mensalidade', descricao: 'Mensalidade 11/2026', valor: 350, vencimento: venc, status: 'pendente', link_pagamento: 'https://www.asaas.com/i/e2e-teste' }).select('id').single();
    await adm.rpc('verificar_inadimplencia');
    const { data: ns } = await adm.from('notificacoes').select('tipo, titulo, corpo, link, fatura_id').eq('loja_id', L.id);
    if (ns.length !== 1 || ns[0].tipo !== 'fatura_vencida' || ns[0].fatura_id !== f.id || ns[0].link !== '/loja/assinatura') falha('notificação: ' + JSON.stringify(ns));
    const suspende = br(dia(-2 + 5 + 1));
    if (!ns[0].corpo.includes(`Pague até ${br(dia(-2 + 5))}`)) falha('texto: ' + ns[0].corpo);
    log(`notificação criada quando a fatura venceu: “${ns[0].titulo} — ${ns[0].corpo}” (a de teste não avisou)`);

    // Em tempo real: aviso na tela + janela, sem recarregar
    await p.waitForSelector('[role=alert]:has-text("Fatura vencida · R$ 350,00")', { timeout: 15000 });
    await p.waitForSelector('dialog[open] >> text=Fatura vencida', { timeout: 15000 });
    const jan = (await p.textContent('dialog[open]')).replace(/ /g, ' ');
    if (!jan.includes('R$ 350,00') || !jan.includes(`suspenso em ${suspende}`)) falha('janela: ' + jan);
    if ((await p.getAttribute('dialog[open] a:has-text("Pagar agora")', 'href')) !== 'https://www.asaas.com/i/e2e-teste') falha('link de pagamento');
    log(`com o sistema aberto: aviso na tela e janela “Fatura vencida · R$ 350,00 · suspenso em ${suspende}” com “Pagar agora”`);
    log('sino:', await p.getAttribute('button[aria-haspopup=dialog]:visible', 'aria-label'));
    await p.screenshot({ path: S + '/fatura-vencida-janela.png' });

    // Lembrar depois: some até a próxima sessão; a faixa vermelha continua
    await p.click('dialog[open] button:has-text("Lembrar depois")');
    await p.waitForSelector('dialog[open]', { state: 'detached' });
    await p.reload(); await espera(1500);
    if (await p.locator('dialog[open]').count()) falha('janela voltou na mesma sessão');
    await p.waitForSelector('[role=alert]:has-text("Fatura de R$ 350,00 vencida")');
    log('“Lembrar depois” esconde a janela nesta sessão; a faixa vermelha com “Pagar agora” continua no topo');
    const p2 = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await entrar(p2, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
    await p2.waitForSelector('dialog[open] >> text=Fatura vencida');
    log('em uma nova entrada no sistema (outro navegador/celular), a janela aparece de novo');
    await p2.screenshot({ path: S + '/fatura-vencida-celular.png' });

    // Pagou: notificação encerrada, sem janela nem faixa
    await adm.from('faturas').update({ status: 'pago', pago_em: new Date().toISOString() }).eq('id', f.id);
    const { data: n2 } = await adm.from('notificacoes').select('vista_em').eq('fatura_id', f.id).single();
    if (!n2.vista_em) falha('notificação não encerrou ao pagar');
    await p2.reload(); await espera(1500);
    if (await p2.locator('dialog[open]').count() || await p2.locator('text=Fatura de R$ 350,00 vencida').count()) falha('aviso continuou depois de pago');
    log('ao pagar, a notificação sai do sino e a janela e a faixa somem');
  } finally {
    await b.close();
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
