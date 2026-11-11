// Motivos das concluídas com atraso: relatório filtrado por “Situação do prazo”, “sem justificativa registrada” à vista e
// motivo registrado depois da conclusão (OS fechada sem travas pelo Gestor com conclusão livre).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/atraso-motivo.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Motivo Atraso', 'gestor-atraso');
  const L = AMB.loja;
  try {
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente MA', nome_fantasia: 'Cliente MA' }).select('id').single();
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const abrir = async (placa) => (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const a = await abrir('MAT1A11'), b2 = await abrir('MAT1A22'), noPrazo = await abrir('MAT1A33');
    const tres = new Date(Date.now() - 3 * 86400e3).toISOString();
    for (const o of [a, b2]) { await g.rpc('alterar_abertura', { p_os: o.id, p_aberta_em: tres }); await g.rpc('concluir_sem_laudo', { p_os: o.id, p_motivo: null }); }
    await g.rpc('concluir_sem_laudo', { p_os: noPrazo.id, p_motivo: null });

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // Relatório: só as concluídas com atraso, com “sem justificativa”
      await p.goto(`${B}/loja/relatorios?tipo=sla`);
      await p.selectOption('#rel-prazo', 'Concluída com atraso');
      await p.click('button:has-text("Aplicar filtros")');
      await p.waitForURL(/prazo=/);
      const placas = await p.$$eval('section[aria-labelledby=rel-det] tbody tr', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
      if (placas.length !== 2 || placas.some((t) => t.includes('MAT1A33')) || !placas.every((t) => t.includes('sem justificativa registrada'))) falha('relatório: ' + JSON.stringify(placas));
      log('Relatórios › Desempenho de SLA › Situação do prazo = “Concluída com atraso”: só as 2 atrasadas, com “Atraso: sem justificativa registrada”');

      // Registrar o motivo depois, na ficha
      await p.goto(`${B}/loja/os/${a.numero}`);
      await p.waitForSelector('text=Concluída com atraso, sem motivo registrado');
      await p.click('button:has-text("Justificar atraso")');
      await p.selectOption('#ja-motivo', { index: 1 });
      const motivo = await p.$eval('#ja-motivo', (s) => s.options[s.selectedIndex].text);
      await p.click('dialog[open] button[type=submit], dialog[open] button:has-text("Salvar")');
      await p.waitForSelector('#just-titulo', { timeout: 15000 });
      log(`na ficha da OS concluída com atraso: “Justificar atraso” depois da conclusão (motivo “${motivo}”, explicação opcional)`);

      await p.goto(`${B}/loja/relatorios?tipo=sla&prazo=${encodeURIComponent('Concluída com atraso')}`);
      const linhaA = (await p.locator('section[aria-labelledby=rel-det] tbody tr:has-text("MAT1A11")').innerText()).replace(/\s+/g, ' ');
      const linhaB = (await p.locator('section[aria-labelledby=rel-det] tbody tr:has-text("MAT1A22")').innerText()).replace(/\s+/g, ' ');
      if (!linhaA.includes(`Atraso: ${motivo}`) || !linhaB.includes('sem justificativa registrada')) falha(`depois: ${linhaA} | ${linhaB}`);
      await p.screenshot({ path: S + '/atrasadas-motivo.png', fullPage: true });
      log('o relatório passa a mostrar o motivo registrado; a outra segue como “sem justificativa”');

      await p.goto(`${B}/loja`);
      await p.click('a:has-text("Ver atrasadas")');
      await p.waitForURL(/tipo=sla&prazo=/);
      log('o card “Motivos de atraso” da Fila leva direto às concluídas com atraso');
    } finally { await br.close(); }
  } finally { if (!process.env.MANTER) await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
