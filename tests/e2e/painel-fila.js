// Painel de OS: motivo da pausa na fila, “A receber” do mês com todas as placas (menos canceladas) e ranking por pátio.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/painel-fila.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Painel', 'gestor-painel');
  const L = AMB.loja;
  try {
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Painel', nome_fantasia: 'Cliente P' }).select('id').single();
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pats } = await adm.from('patios').select('id, nome').eq('loja_id', L.id).order('nome');
    const abrir = async (placa, patio, valor) => {
      const o = (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: patio, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
      await adm.from('ordens_servico').update({ valor_base: valor, valor_deslocamento: 0, valor_ajuste: 0 }).eq('id', o.id);
      return o;
    };
    const P1 = pats[0], P2 = pats[1];
    const a = await abrir('PNL1A11', P1.id, 100), b = await abrir('PNL1A22', P1.id, 200), c = await abrir('PNL1A33', P1.id, 300);
    const d = await abrir('PNL1A44', P2.id, 400), e = await abrir('PNL1A55', P2.id, 1000);
    const amanha = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    await g.rpc('pausar_os', { p_os: a.id, p_motivo: 'Aguardando cliente liberar o carro' });
    await g.rpc('abrir_pendencia', { p_os: b.id, p_tipo: 'documental', p_descricao: 'Falta CRLV', p_responsavel: 'cliente', p_previsao: amanha });
    const { data: mot } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'frustracao').limit(1).single();
    await g.rpc('frustrar_os', { p_os: c.id, p_motivo: mot.id, p_ocorrida_em: new Date().toISOString(), p_descricao: 'Pátio fechado', p_responsavel: 'cliente', p_previsao: amanha });
    await g.rpc('concluir_sem_laudo', { p_os: d.id, p_motivo: null });
    const { data: mc } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'cancelamento').limit(1).single();
    await g.rpc('cancelar_os', { p_os: e.id, p_nome: 'Ana', p_motivo: mc.id, p_descricao: 'duplicada' });

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await p.goto(`${B}/loja?sla=pausadas`);
      const linha = (placa) => p.locator(`table tbody tr:has-text("${placa}") td[data-rotulo="Prazo"]`).innerText();
      const [ta, tb, tc] = await Promise.all([linha('PNL1A11'), linha('PNL1A22'), linha('PNL1A33')]);
      if (!ta.includes('Pausa manual: Aguardando cliente liberar o carro') || !tb.includes('Pendência: Falta CRLV') || !tc.includes('Frustração:') || !tc.includes('Pátio fechado')) falha(`motivos: ${ta} | ${tb} | ${tc}`);
      log('pausadas mostram o motivo na fila: pausa manual, pendência e frustração');
      await p.screenshot({ path: S + '/fila-pausadas.png', fullPage: true });

      await p.goto(`${B}/loja`);
      const kpi = await p.locator('div:has(> p:text-is("Valor a receber"))').first().innerText();
      if (!kpi.includes('1.000,00') || !kpi.includes('4 placas')) falha('A receber: ' + kpi);
      const kv = async (r) => (await p.locator(`[aria-label="Indicadores"] div:has(> p:text-is("${r}"))`).first().innerText()).replace(/\s+/g, ' ');
      const [kA, kP] = [await kv('A vistoriar'), await kv('Pausadas')];
      if (!/A vistoriar 0 /i.test(kA) || !/Pausadas 2 /i.test(kP) || !kP.includes('1 pausa manual') || !kP.includes('1 com pendência')) falha(`cards: ${kA} | ${kP}`);
      const kF = await kv('Frustradas');
      if (!/Frustradas 3 /i.test(kF) || !kF.includes('1 frustrada + 2 pausadas')) falha('card Frustradas: ' + kF);
      const rotulos = await p.$$eval('[aria-label="Indicadores"] p:first-child', (ps) => ps.map((x) => x.textContent.trim()));
      const esperado = ['A vistoriar', 'Pausadas', 'Frustradas', 'Vencendo', 'Vencidas', 'Vistorias em', 'Canceladas', 'Valor a receber'];
      if (rotulos.length !== 8 || esperado.some((r, i) => !rotulos[i].startsWith(r))) falha('ordem dos cards: ' + rotulos);
      log(`cards na ordem: ${rotulos.join(' · ')}; Pausadas = 2 e saem de “A vistoriar” (= 0); Frustradas = 1 frustrada + 2 pausadas = 3`);
      // Pendências também traz as OS pausadas à mão
      await p.goto(`${B}/loja/pendencias`);
      const linhaP = (await p.locator('table tbody tr:has-text("PNL1A11")').innerText()).replace(/\s+/g, ' ');
      const kv2 = async (r) => (await p.locator(`div:has(> p:text-is("${r}"))`).first().innerText()).replace(/\s+/g, ' ');
      const [kPz, kPd] = [await kv2('Pausa manual'), await kv2('Pendências')];
      if (!linhaP.includes('Pausa manual') || !linhaP.includes('Aguardando cliente liberar o carro') || !/Pausa manual 1 /i.test(kPz) || !/Pendências 2 /i.test(kPd)) falha(`pendências: ${linhaP} | ${kPz} | ${kPd}`);
      const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('/');
      const abs = await p.$$eval('table tbody td[data-rotulo="Abertura da OS"]', (tds) => tds.map((t) => t.innerText));
      if (abs.length !== 3 || abs.some((t) => !t.includes(hoje))) falha('coluna Abertura da OS: ' + JSON.stringify(abs));
      await p.click('nav[aria-label=Filtro] a:has-text("Pausa manual")'); await p.waitForURL(/tipo=pausa/);
      if ((await p.locator('table tbody tr').count()) !== 1) falha('chip Pausa manual');
      log('Pendências mostra a OS pausada à mão (motivo, há quanto tempo) junto das pendências, com a data de abertura da OS em cada linha; chip “Pausa manual” filtra');
      await p.goto(`${B}/loja/pendencias`);
      await p.click('table tbody tr:has-text("PNL1A11") button:has-text("Retomar prazo")');
      await p.waitForSelector('table tbody tr[data-tipo=a_vistoriar]:has-text("PNL1A11")', { timeout: 15000 });
      await p.goto(`${B}/loja`);
      if (!/A vistoriar 1 /i.test(await kv('A vistoriar')) || !/Pausadas 1 /i.test(await kv('Pausadas'))) falha('retomar não voltou para A vistoriar');
      log('“Retomar prazo” na tela de Pendências: a OS sai de “Pausa manual” e volta como “A vistoriar” (lista e painel)');
      await p.click('a[aria-label^="Pausadas"]'); await p.waitForURL(/sla=pausadas/);
      log('clicar no card “Pausadas” abre a fila filtrada');
      await p.goto(`${B}/loja`);
      log('“Valor a receber” do mês soma as 4 placas não canceladas (pausada, com pendência, frustrada e vistoriada): R$ 1.000,00; a cancelada (R$ 1.000) fica de fora');

      const itens = await p.$$eval('section[aria-labelledby="card-patios"] li', (ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ')));
      if (itens.length !== 2 || !itens[0].includes(P1.nome) || !itens[0].includes('3 OS') || !itens[1].includes(P2.nome) || !itens[1].includes('1 OS') || !itens[1].includes('1 vistoriada')) falha('ranking: ' + JSON.stringify(itens));
      log(`ranking por pátio: 1º ${P1.nome} (3 OS), 2º ${P2.nome} (1 OS, 1 vistoriada); canceladas não contam`);
      await p.locator('section[aria-labelledby="card-patios"]').screenshot({ path: S + '/ranking-patios.png' });
    } finally {
      await br.close();
    }
  } finally {
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
