// Painel da Loja: aviso “Chegaram N OS novas hoje” (14/11/2026), por cliente, com as mais recentes e atualização ao vivo.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/chegadas-hoje.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor, semPopupLeitura } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Chegadas', 'gestor-chegadas');
  const L = AMB.loja;
  try {
    const { data: emps } = await adm.from('empresas_clientes').insert([
      { loja_id: L.id, cnpj: '11222333000181', razao_social: 'Creditas SA', nome_fantasia: 'Creditas' },
      { loja_id: L.id, cnpj: '11444777000161', razao_social: 'Dukar SA', nome_fantasia: 'Dukar' },
    ]).select('id, nome_fantasia');
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const abrir = async (emp, placa, modelo) => { const { data, error } = await g.rpc('abrir_os', { p_empresa: emp, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: modelo, p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null }); if (error) falha(error.message); return data[0]; };
    const [cred, duk] = [emps.find((e) => e.nome_fantasia === 'Creditas').id, emps.find((e) => e.nome_fantasia === 'Dukar').id];
    const ontem = await abrir(cred, 'CHG1A00', 'Antiga');
    await adm.from('ordens_servico').update({ created_at: new Date(Date.now() - 2 * 86400e3).toISOString() }).eq('id', ontem.id);
    await abrir(cred, 'CHG1A11', 'Fiat Uno'); await abrir(cred, 'CHG1A22', 'VW Gol'); await abrir(duk, 'CHG1A33', 'Ford Ka');

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await semPopupLeitura(p);
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      const box = p.locator('[data-teste=chegadas-hoje]');
      let t = (await box.innerText()).replace(/\s+/g, ' ');
      if (!t.includes('Chegaram 3 OS novas hoje') || !t.includes('Creditas 2') || !t.includes('Dukar 1') || !t.includes('CHG1A33') || t.includes('CHG1A00')) falha('aviso: ' + t);
      await box.screenshot({ path: `${S}/chegadas-hoje.png` });
      const fundo = await box.evaluate((el) => getComputedStyle(el).backgroundColor);
      if (fundo !== 'rgb(109, 40, 217)') falha('cor da barra: ' + fundo);
      log('com OS novas a barra fica roxa (#6D28D9)');
      log(`logo abaixo do topo: “${t.slice(0, 80)}…” (por cliente e as mais recentes; a de 2 dias atrás não conta)`);
      await p.waitForTimeout(2500);
      await abrir(duk, 'CHG1A44', 'Honda Fit');
      await p.waitForFunction(() => document.querySelector('[data-teste=chegadas-hoje]')?.textContent?.includes('Chegaram 4 OS novas hoje'), null, { timeout: 20000 });
      t = (await box.innerText()).replace(/\s+/g, ' ');
      if (!t.includes('Dukar 2') || !t.includes('CHG1A44')) falha('ao vivo: ' + t);
      log('nova OS entra no aviso sozinha, sem recarregar (Chegaram 4 · Dukar 2)');
      await box.locator('a:has-text("Ver as de hoje")').click();
      await p.waitForURL(/\/loja\/pendencias\?dia=\d{4}-\d{2}-\d{2}/);
      log('“Ver as de hoje” abre Pendências filtrada pelo dia de hoje');
    } finally { await br.close(); }
  } finally { await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
