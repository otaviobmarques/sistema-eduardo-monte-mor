// Melhorias de 09/11/2026: o Gestor com conclusão livre (o “eduardo”) reabre e pausa OS; cores dos status escolhidas
// em Configurações; filtro por várias Unidades/Pátios; sessão que não cai sozinha (Sair num aparelho não derruba o outro).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/melhorias-eduardo.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarUsuario, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const AMB = await lojaComGestor('Loja E2E Melhorias', 'gestor-melhorias');
  const L = AMB.loja;
  try {
    await criarUsuario({ login: 'gestor-comum-m', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L.id, nome: 'Gestor Comum' });
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Melhorias', nome_fantasia: 'Cliente M' }).select('id').single();
    await criarUsuario({ login: 'cliente-melhorias', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: emp.id });
    const api = async (login) => { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); await c.auth.signInWithPassword({ email: email(login), password: 'gestor-senha-123' }); return c; };
    const livre = await api(AMB.gestor.login), comum = await api('gestor-comum-m');
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pats } = await adm.from('patios').select('id, nome').eq('loja_id', L.id).order('nome');
    const abrir = async (placa, patio) => (await livre.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: patio, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const osV = await abrir('MLH1A11', pats[0].id), osP = await abrir('MLH1A22', pats[1].id), osX = await abrir('MLH1A33', pats[2].id);
    await adm.from('ordens_servico').update({ unidade: 'Dukar Vila Guilherme' }).eq('id', osX.id);

    // Travas no banco: Gestor comum não reabre nem pausa
    await livre.rpc('concluir_sem_laudo', { p_os: osV.id, p_motivo: null });
    const e1 = (await comum.rpc('reabrir_os', { p_os: osV.id, p_motivo: null })).error?.message;
    const e2 = (await comum.rpc('pausar_os', { p_os: osP.id, p_motivo: null })).error?.message;
    if (!e1?.includes('SEM_PERMISSAO') || !e2?.includes('SEM_PERMISSAO')) falha(`comum: ${e1} | ${e2}`);
    log('Gestor comum não consegue reabrir nem pausar (banco recusa)');

    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // 1. Reabrir OS vistoriada
      await adm.from('ordens_servico').update({ concluida_em: new Date(Date.now() - 5 * 3600e3).toISOString() }).eq('id', osV.id);
      const { data: antes } = await adm.from('ordens_servico').select('total_pausado').eq('id', osV.id).single();
      await p.goto(`${B}/loja/os/${osV.numero}`);
      await p.click('button:has-text("Reabrir OS")');
      await p.fill('#ra-motivo', 'Refazer a vistoria');
      await p.click('dialog[open] button:has-text("Reabrir OS")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      const { data: v } = await adm.from('ordens_servico').select('status, etapa, concluida_em, sem_laudo, total_pausado').eq('id', osV.id).single();
      const { data: nv } = await adm.from('notificacoes').select('titulo').eq('os_id', osV.id).eq('tipo', 'reaberta');
      if (v.status !== 'a_vistoriar' || v.etapa !== 'aberta' || v.concluida_em || v.sem_laudo || v.total_pausado === antes.total_pausado || !nv.length) falha('reabrir: ' + JSON.stringify({ v, antes, nv }));
      log(`OS vistoriada reaberta: A vistoriar · Aberta; tempo encerrada fora do prazo (pausado ${v.total_pausado}); cliente avisado`);
      await livre.rpc('cancelar_os', { p_os: osV.id, p_nome: 'Ana', p_motivo: (await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'cancelamento').limit(1).single()).data.id, p_descricao: 'teste' }).then(async (r) => {
        if (r.error) { await adm.from('ordens_servico').update({ status: 'cancelado', cancelada_em: new Date().toISOString() }).eq('id', osV.id); }
      });
      await p.goto(`${B}/loja/os/${osV.numero}`);
      await p.click('button:has-text("Reabrir OS")');
      await p.click('dialog[open] button:has-text("Reabrir OS")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      if ((await adm.from('ordens_servico').select('status').eq('id', osV.id).single()).data.status !== 'a_vistoriar') falha('reabrir cancelada');
      log('OS cancelada também reabre (motivo opcional)');

      // 2. Pausar e retomar
      await p.goto(`${B}/loja/os/${osP.numero}`);
      await p.click('section[aria-label="Ações da OS"] button:has-text("Pausar")');
      await p.click('dialog[open] button:has-text("Pausar")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      await p.waitForSelector('button:has-text("Retomar prazo")');
      await p.waitForSelector('text=Pausa manual');
      const { data: pz } = await adm.from('ordens_servico').select('pausado_desde').eq('id', osP.id).single();
      if (!pz.pausado_desde) falha('pausa não registrada');
      await p.goto(`${B}/loja?sla=pausadas`);
      await p.waitForSelector(`a:has-text("${osP.placa ?? 'MLH1A22'}")`).catch(() => p.waitForSelector('text=MLH1A22'));
      log('Pausar: o prazo para (OS aparece em “Pausadas”, barra mostra “Pausa manual”)');
      await espera(1500);
      await p.goto(`${B}/loja/os/${osP.numero}`);
      await p.click('button:has-text("Retomar prazo")');
      await p.waitForSelector('section[aria-label="Ações da OS"] button:has-text("Pausar")', { timeout: 15000 });
      const { data: rt } = await adm.from('ordens_servico').select('pausado_desde, total_pausado').eq('id', osP.id).single();
      if (rt.pausado_desde || rt.total_pausado === '00:00:00') falha('retomar: ' + JSON.stringify(rt));
      log(`Retomar: o relógio volta a correr e o tempo parado (${rt.total_pausado}) não conta no prazo`);

      // 3. Cores dos status
      await p.goto(`${B}/loja/configuracoes`);
      await p.click('fieldset:has(legend:has-text("Cor de A vistoriar")) label:has-text("Roxo")');
      await p.click('button:has-text("Salvar configurações")');
      await p.waitForSelector('text=Configurações salvas');
      await p.goto(`${B}/loja`);
      const cor = await p.$eval('td span[style*="--st-a_vistoriar"]', (el) => getComputedStyle(el).color);
      if (cor !== 'rgb(91, 45, 168)') falha('cor do status: ' + cor);
      log('Configurações › Cores dos status: “A vistoriar” em Roxo aparece na fila');

      // 4. Filtro por várias unidades/pátios
      await p.click('button:has-text("Unidade / Pátio")');
      await p.click(`#filtro-local label:has-text("${pats[1].nome}")`);
      await p.click('#filtro-local label:has-text("Dukar Vila Guilherme")');
      await p.click('#filtro-local button:has-text("Mostrar 2 locais")');
      await p.waitForURL(/local=/);
      await p.waitForSelector('text=MLH1A33');
      const placas = await p.$$eval('table tbody tr', (rs) => rs.map((r) => r.textContent));
      if (placas.length !== 2 || !placas.some((t) => t.includes('MLH1A22')) || placas.some((t) => t.includes('MLH1A11'))) falha('filtro: ' + placas.length);
      const href = await p.getAttribute('a:has-text("Exportar Excel")', 'href');
      if ((href.match(/local=/g) || []).length !== 2) falha('exportar sem filtro: ' + href);
      log(`filtro “Unidade / Pátio” com 2 escolhas (pátio ${pats[1].nome} + unidade Dukar Vila Guilherme): 2 OS; exportar leva o filtro`);
      await p.screenshot({ path: S + '/filtro-local.png', fullPage: true });

      // Cliente vê a mesma cor e tem o filtro
      const c = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(c, B, 'cliente-melhorias', 'cliente-senha-123', '/app');
      for (let i = 0; i < 2; i++) await c.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      const corC = await c.$eval('td span[style*="--st-a_vistoriar"]', (el) => getComputedStyle(el).color);
      if (corC !== 'rgb(91, 45, 168)' || !(await c.locator('button:has-text("Unidade / Pátio")').count())) falha('cliente: ' + corC);
      log('cliente vê a mesma cor escolhida pela Loja e também tem o filtro por unidade/pátio');

      // 5. Sair num aparelho não derruba a sessão no outro
      const outro = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(outro, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await outro.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await outro.locator('button:has-text("Sair"):visible').first().click();
      await outro.waitForURL('**/login');
      await p.goto(`${B}/loja/pendencias`);
      if (!p.url().endsWith('/loja/pendencias')) falha('sessão do 1º aparelho caiu: ' + p.url());
      log('“Sair” em outro aparelho não derruba a sessão aberta neste');
    } finally {
      await b.close();
    }
  } finally {
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
