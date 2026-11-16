// “Ver painel do cliente” (16/11/2026): no cadastro do cliente a Loja abre o painel como o cliente vê (somente leitura).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/visao-cliente.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor, criarUsuario, semPopupLeitura } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Visao', 'gestor-visao');
  const OUTRA = await lojaComGestor('Loja E2E Visao 2', 'gestor-visao2');
  const L = AMB.loja;
  try {
    const { data: emps } = await adm.from('empresas_clientes').insert([
      { loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente A SA', nome_fantasia: 'Cliente A' },
      { loja_id: L.id, cnpj: '11444777000161', razao_social: 'Cliente B SA', nome_fantasia: 'Cliente B' },
    ]).select('id, nome_fantasia');
    const A = emps.find((e) => e.nome_fantasia === 'Cliente A').id, Bc = emps.find((e) => e.nome_fantasia === 'Cliente B').id;
    await criarUsuario({ login: 'cliente-visao-a', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: A });
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const abrir = async (emp, placa) => { const { data, error } = await g.rpc('abrir_os', { p_empresa: emp, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null }); if (error) falha(error.message); return data[0]; };
    const a1 = await abrir(A, 'VIS1A11'); await abrir(A, 'VIS1A22'); await abrir(Bc, 'VIS1B33');

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await semPopupLeitura(p);
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      await p.goto(`${B}/loja/clientes/${A}`);
      await p.click('a:has-text("Ver painel do cliente")');
      await p.waitForURL(`**/loja/clientes/${A}/painel`);
      await p.waitForSelector('[data-teste=aviso-visao-cliente]');
      await p.waitForSelector('h1:has-text("Olá, Cliente A")');
      const placas = await p.$$eval('table tbody tr', (rs) => rs.map((r) => (r.innerText.match(/VIS1\w\d\d/) || [''])[0]).sort());
      if (placas.join() !== 'VIS1A11,VIS1A22') falha('placas: ' + placas);
      const kpi = (await p.locator('[aria-label="Indicadores"] div:has(> p:text-is("A vistoriar"))').first().innerText()).replace(/\s+/g, ' ');
      if (!/A vistoriar 2/i.test(kpi)) falha('kpi: ' + kpi);
      if (await p.locator('a:has-text("Nova OS"), a:has-text("Importar planilha")').count()) falha('ações do cliente apareceram');
      await p.screenshot({ path: `${S}/visao-cliente.png` });
      log('“Ver painel do cliente” no cadastro abre o painel do Cliente A como ele vê: só as 2 placas dele, KPIs dele, sem Nova OS/Importar');
      await p.click(`a[aria-label="OS ${a1.numero}, placa VIS1A11"]`);
      await p.waitForURL(`**/loja/os/${a1.numero}`);
      log('clicar na placa abre a ficha da OS na Loja');

      const c = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(c, B, 'cliente-visao-a', 'cliente-senha-123', '/app');
      const pc = await c.$$eval('table tbody tr', (rs) => rs.map((r) => (r.innerText.match(/VIS1\w\d\d/) || [''])[0]).sort());
      if (pc.join() !== 'VIS1A11,VIS1A22' || !(await c.locator('a:has-text("Nova OS")').count())) falha('painel do cliente: ' + pc);
      log('o painel do próprio cliente continua igual (mesmas placas, com Nova OS e Importar)');

      const o = await (await br.newContext()).newPage();
      await entrar(o, B, OUTRA.gestor.login, OUTRA.gestor.senha);
      await o.waitForURL(/\/loja/);
      const r = await o.goto(`${B}/loja/clientes/${A}/painel`);
      if (r.status() !== 404) falha('outra Loja viu: ' + r.status());
      log('a Gestão de outra Loja não abre a visão desse cliente (404)');
    } finally { await br.close(); }
  } finally { await limparLoja(L.id); await limparLoja(OUTRA.loja.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
