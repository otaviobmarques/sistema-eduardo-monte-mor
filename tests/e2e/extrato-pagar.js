// Extrato em PDF das placas a pagar (16/11/2026): cliente baixa no Financeiro; a Loja baixa por cliente. Mesmo total do KPI.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/extrato-pagar.js  (precisa de pdftotext)
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor, criarUsuario, semPopupLeitura } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Extrato', 'gestor-extrato');
  const L = AMB.loja;
  try {
    const { data: emps } = await adm.from('empresas_clientes').insert([
      { loja_id: L.id, cnpj: '11222333000181', razao_social: 'Creditas Financeira SA', nome_fantasia: 'Creditas' },
      { loja_id: L.id, cnpj: '11444777000161', razao_social: 'Outro SA', nome_fantasia: 'Outro' },
    ]).select('id, nome_fantasia');
    const A = emps.find((e) => e.nome_fantasia === 'Creditas').id, O = emps.find((e) => e.nome_fantasia === 'Outro').id;
    await criarUsuario({ login: 'cliente-extrato', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: A });
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    await adm.from('precos').update({ valor: 90 }).eq('servico_id', serv.id);
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const { data: mot } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'cancelamento').limit(1).single();
    const abrir = async (emp, placa, modelo) => { const { data, error } = await g.rpc('abrir_os', { p_empresa: emp, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: modelo, p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null }); if (error) falha(error.message); return data[0]; };
    const a1 = await abrir(A, 'EXT1A11', 'Fiat Uno'); await abrir(A, 'EXT1A22', 'VW Gol'); const a3 = await abrir(A, 'EXT1A33', 'Ford Ka');
    const a4 = await abrir(A, 'EXT1A44', 'Honda Fit'); await abrir(O, 'EXT1O55', 'Outro carro');
    await g.rpc('cancelar_os', { p_os: a3.id, p_nome: 'Ana', p_motivo: mot.id, p_descricao: 'teste' });
    await adm.from('ordens_servico').update({ pagamento_status: 'pago', pagamento_forma: 'pix', pagamento_data: new Date().toISOString().slice(0, 10) }).eq('id', a4.id);
    void a1;

    const br = await chromium.launch();
    try {
      const baixar = async (pg, sel, nome) => {
        const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click(sel)]);
        const arq = `${S}/${nome}.pdf`; await dl.saveAs(arq);
        return { nome: dl.suggestedFilename(), txt: execFileSync('pdftotext', ['-layout', arq, '-']).toString() };
      };
      const c = await (await br.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
      await entrar(c, B, 'cliente-extrato', 'cliente-senha-123', '/app');
      await c.goto(`${B}/app/financeiro/pagamentos`);
      const kpi = (await c.locator('div:has(> p:text-is("Total a pagar"))').first().innerText()).replace(/\s+/g, ' ');
      const { nome, txt } = await baixar(c, '[data-teste=baixar-extrato]', 'extrato-cliente');
      const t = txt.replace(/\s+/g, ' ');
      for (const k of ['Extrato de placas a pagar', 'Creditas', '11.222.333/0001-81', 'EXT1A11', 'EXT1A22', 'R$ 180,00', '2 placas em aberto', 'Página 1 de 1']) if (!t.includes(k)) falha(`PDF sem “${k}”: ${t.slice(0, 400)}`);
      for (const k of ['EXT1A33', 'EXT1A44', 'EXT1O55']) if (t.includes(k)) falha(`PDF com ${k}`);
      if (!kpi.includes('R$ 180,00')) falha('KPI: ' + kpi);
      execFileSync('pdftoppm', ['-png', '-r', '70', '-f', '1', '-l', '1', `${S}/extrato-cliente.pdf`, `${S}/extrato-pagina`]);
      log(`cliente baixa “${nome}”: placas EXT1A11 e EXT1A22, total R$ 180,00 = KPI “Total a pagar”; sem a cancelada, a paga e as de outro cliente`);
      const [dx] = await Promise.all([c.waitForEvent('download'), c.click('[data-teste=baixar-extrato-xlsx]')]);
      await dx.saveAs(`${S}/extrato-cliente.xlsx`);
      const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(`${S}/extrato-cliente.xlsx`);
      const ws = wb.getWorksheet('Placas a pagar');
      const placasX = []; let totalX = null;
      ws.eachRow((r, n) => { if (n === 1) return; const v = r.values; if (/^EXT1/.test(v[2] ?? '')) placasX.push(v[2]); if (v[1] === 'TOTAL A PAGAR') totalX = v[7]; });
      if (placasX.sort().join() !== 'EXT1A11,EXT1A22' || totalX !== 180 || !dx.suggestedFilename().endsWith('.xlsx')) falha(`Excel: ${placasX} ${totalX}`);
      log(`“Baixar Excel”: ${dx.suggestedFilename()} com as mesmas 2 placas e TOTAL A PAGAR = 180 (número, formatado em R$) + aba Resumo`);

      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
      await semPopupLeitura(p);
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      await p.goto(`${B}/loja/financeiro/pagamentos`);
      if (await p.locator('[data-teste=baixar-extrato]').count()) falha('botão sem cliente escolhido');
      await p.goto(`${B}/loja/financeiro/pagamentos?cliente=${A}`);
      const l = await baixar(p, '[data-teste=baixar-extrato]', 'extrato-loja');
      if (!l.txt.includes('EXT1A22') || !l.txt.replace(/\s+/g, ' ').includes('R$ 180,00')) falha('PDF da Loja');
      log('a Loja escolhe o cliente no Financeiro e baixa o mesmo extrato (R$ 180,00)');

      const st = await c.evaluate(async (u) => (await fetch(u)).status, `/api/financeiro/extrato?cliente=${O}`);
      const t2 = await c.evaluate(async (u) => (await fetch(u)).headers.get('content-disposition'), `/api/financeiro/extrato?cliente=${O}`);
      if (st !== 200 || !t2.includes('creditas')) falha('cliente pedindo outro: ' + st + ' ' + t2);
      log('cliente que pede o extrato de outra empresa recebe só o próprio');
    } finally { await br.close(); }
  } finally { await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
