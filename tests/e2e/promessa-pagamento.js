// Promessa de pagamento (16/11/2026): o Administrador libera a Loja bloqueada por 3 dias; o Gestor vê o aviso amarelo grande;
// a promessa segura o bloqueio diário; vencida sem pagamento, bloqueia de novo; pagar encerra a promessa.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/promessa-pagamento.js
const { chromium } = require('playwright');
const { adm, criarUsuario, limparLoja, entrar, lojaComGestor, adminTemporario, semPopupLeitura } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const dia = (n) => new Date(Date.now() - 3 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

(async () => {
  const AMB = await lojaComGestor('Loja E2E Promessa', 'gestor-promessa');
  const L = AMB.loja;
  const ADM = await adminTemporario();
  try {
    await adm.from('lojas').update({ dias_tolerancia: 5 }).eq('id', L.id);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Prom', nome_fantasia: 'Cliente Prom' }).select('id').single();
    await criarUsuario({ login: 'cliente-promessa', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: emp.id });
    const { data: f } = await adm.from('faturas').insert({ loja_id: L.id, tipo: 'mensalidade', descricao: 'Mensalidade 10/2026', valor: 350, vencimento: dia(-10), status: 'pendente', link_pagamento: 'https://www.asaas.com/i/e2e-prom' }).select('id').single();
    await adm.rpc('verificar_inadimplencia');
    if (!(await adm.from('lojas').select('bloqueada').eq('id', L.id).single()).data.bloqueada) falha('não bloqueou');
    log('Loja com fatura vencida há 10 dias (tolerância 5) bloqueada automaticamente; clientes dela sem acesso');

    const br = await chromium.launch();
    try {
      const a = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(a, B, ADM.login, ADM.senha, '/admin');
      await a.goto(`${B}/admin/lojas/${L.id}`);
      await a.click('[data-teste=promessa]');
      await a.waitForSelector('text=Liberada por promessa de pagamento até', { timeout: 15000 });
      const { data: l1 } = await adm.from('lojas').select('bloqueada, promessa_ate').eq('id', L.id).single();
      const horas = (new Date(l1.promessa_ate) - Date.now()) / 3600e3;
      if (l1.bloqueada || horas < 71 || horas > 72.1) falha('promessa: ' + JSON.stringify(l1));
      log('Administrador clica “Liberar por promessa de pagamento · 3 dias”: Loja liberada até daqui a 72h (selo amarelo no admin)');

      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await semPopupLeitura(p);
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      const aviso = p.locator('[data-teste=aviso-promessa]');
      await aviso.waitFor();
      const fundo = await aviso.evaluate((el) => getComputedStyle(el).backgroundColor);
      const tam = await aviso.locator('p.font-display').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      const t = (await aviso.innerText()).replace(/\s+/g, ' ');
      if (fundo !== 'rgb(250, 204, 21)' || tam < 28 || !/Pague até \d\d\/\d\d\/\d{4}/.test(t) || !t.includes('R$ 350,00')) falha(`aviso: ${fundo} ${tam} ${t}`);
      if ((await aviso.locator('a:has-text("Pagar agora")').getAttribute('href')) !== 'https://www.asaas.com/i/e2e-prom') falha('Pagar agora');
      if (await p.locator('[role=alert]:has-text("será suspenso em")').count() > 1) falha('aviso vermelho junto');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await p.screenshot({ path: `${S}/promessa-loja.png` });
      log(`Gestor volta à Fila e vê o aviso AMARELO grande (${tam}px): “${t.slice(0, 90)}…” com “Pagar agora”`);

      const c = await (await br.newContext()).newPage();
      await entrar(c, B, 'cliente-promessa', 'cliente-senha-123', '/app');
      log('os clientes da Loja voltam a entrar durante a promessa');

      await adm.rpc('verificar_inadimplencia');
      if ((await adm.from('lojas').select('bloqueada').eq('id', L.id).single()).data.bloqueada) falha('bloqueou dentro da promessa');
      log('a verificação diária não bloqueia enquanto a promessa vale');

      await adm.from('lojas').update({ promessa_ate: new Date(Date.now() - 60e3).toISOString() }).eq('id', L.id);
      await adm.rpc('vencer_promessas');
      const { data: l2 } = await adm.from('lojas').select('bloqueada, bloqueio_automatico, motivo_bloqueio, promessa_ate').eq('id', L.id).single();
      if (!l2.bloqueada || !l2.bloqueio_automatico || l2.promessa_ate || !l2.motivo_bloqueio.includes('Promessa de pagamento venceu')) falha('vencer: ' + JSON.stringify(l2));
      await p.goto(`${B}/loja`); await p.waitForURL('**/loja/assinatura');
      log(`promessa vencida sem pagamento: bloqueia de novo sozinha (“${l2.motivo_bloqueio}”) e o Gestor volta para a Assinatura`);

      await a.reload(); await a.click('[data-teste=promessa]');
      await a.waitForSelector('text=Liberada por promessa de pagamento até', { timeout: 15000 });
      await adm.from('faturas').update({ status: 'pago', pago_em: new Date().toISOString() }).eq('id', f.id);
      await adm.rpc('reavaliar_bloqueio', { p_loja: L.id });
      const { data: l3 } = await adm.from('lojas').select('bloqueada, promessa_ate').eq('id', L.id).single();
      if (l3.bloqueada || l3.promessa_ate) falha('pagar: ' + JSON.stringify(l3));
      await p.goto(`${B}/loja`);
      if (await p.locator('[data-teste=aviso-promessa]').count()) falha('aviso continuou após pagar');
      log('nova promessa e, com a fatura paga, a promessa se encerra e o aviso amarelo some');
    } finally { await br.close(); }
  } finally { await limparLoja(L.id); await ADM.remover(); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
