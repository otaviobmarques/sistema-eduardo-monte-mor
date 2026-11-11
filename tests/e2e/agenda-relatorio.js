// Relatório da agenda: quantas vistorias cada vistoriador tem agendadas no período, quantas já foram feitas, quantas
// estão por vir e quantas passaram do horário sem ser feitas; agrupa por vistoriador/dia/pátio; exporta Excel e PDF.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/agenda-relatorio.js
const ExcelJS = require('exceljs');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const diaBR = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);

(async () => {
  const AMB = await lojaComGestor('Loja E2E Relatório Agenda', 'gestor-ragenda');
  const L = AMB.loja;
  try {
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente RA', nome_fantasia: 'Cliente RA' }).select('id').single();
    const { data: vists } = await adm.from('vistoriadores').insert([{ loja_id: L.id, nome: 'Carlos Vistoriador' }, { loja_id: L.id, nome: 'Paula Vistoriadora' }]).select('id, nome');
    const carlos = vists.find((v) => v.nome.startsWith('Carlos')), paula = vists.find((v) => v.nome.startsWith('Paula'));
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id, nome').eq('loja_id', L.id).limit(1).single();
    const abrir = async (placa) => (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const os = []; for (let i = 1; i <= 6; i++) os.push(await abrir(`RAG1A${String(i).padStart(2, '0')}`));
    const amanha = Date.now() + 86400e3, ontem = Date.now() - 86400e3;
    // Carlos: 3 amanhã em lote, 1 ontem que ficou para trás, 1 ontem que foi feita; Paula: 1 amanhã que foi cancelada
    await g.rpc('alterar_abertura', { p_os: os[3].id, p_aberta_em: new Date(ontem - 3600e3).toISOString() });
    await g.rpc('alterar_abertura', { p_os: os[4].id, p_aberta_em: new Date(ontem - 3600e3).toISOString() });
    await g.rpc('agendar_lote', { p_os: os.slice(0, 3).map((o) => o.id), p_inicio: new Date(amanha).toISOString(), p_intervalo_min: 30, p_vistoriador: carlos.id, p_local: null, p_motivo: null });
    await g.rpc('agendar_os', { p_os: os[3].id, p_data_hora: new Date(ontem).toISOString(), p_local: null, p_vistoriador: carlos.id, p_motivo: null, p_motivo_texto: null });
    await g.rpc('agendar_os', { p_os: os[4].id, p_data_hora: new Date(ontem).toISOString(), p_local: null, p_vistoriador: carlos.id, p_motivo: null, p_motivo_texto: null });
    await g.rpc('concluir_sem_laudo', { p_os: os[4].id, p_motivo: null, p_concluida_em: new Date(ontem + 3600e3).toISOString() });
    await g.rpc('agendar_os', { p_os: os[5].id, p_data_hora: new Date(amanha).toISOString(), p_local: null, p_vistoriador: paula.id, p_motivo: null, p_motivo_texto: null });
    const { data: mc } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'cancelamento').limit(1).single();
    await g.rpc('cancelar_os', { p_os: os[5].id, p_nome: 'Ana', p_motivo: mc.id, p_descricao: 'teste' });
    const de = diaBR(ontem), ate = diaBR(amanha);

    const b = await chromium.launch();
    try {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
      const p = await ctx.newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // Acesso pela lista de relatórios
      await p.goto(`${B}/loja/relatorios`);
      await p.click('a:has-text("Agenda dos vistoriadores")');
      await p.waitForURL('**/loja/relatorios/agenda');
      await p.goto(`${B}/loja/relatorios/agenda?de=${de}&ate=${ate}`);
      const linha = async (r) => (await p.locator(`section[aria-labelledby=ag-tab] tbody tr:has(th:text-is("${r}"))`).innerText()).replace(/\s+/g, ' ');
      const lc = await linha('Carlos Vistoriador'), lp = await linha('Paula Vistoriadora');
      // Agendadas, Realizadas, A realizar, Não realizadas, Frustradas, Canceladas, %
      if (!lc.includes('Carlos Vistoriador 5 1 3 1 0 0 50%') || !lp.includes('Paula Vistoriadora 1 0 0 0 0 1')) falha(`resumo: ${lc} | ${lp}`);
      log('por vistoriador: Carlos 5 agendadas (1 realizada, 3 a realizar, 1 não realizada · 50% das que passaram); Paula 1 (cancelada)');
      await p.screenshot({ path: S + '/relatorio-agenda.png', fullPage: true });

      // Só o Carlos → por dia
      await p.selectOption('#ag-vist', carlos.id); await p.click('button:has-text("Aplicar filtros")');
      await p.waitForURL(/vistoriador=/);
      const dias = await p.$$eval('section[aria-labelledby=ag-tab] tbody tr th', (ts) => ts.map((t) => t.innerText));
      const d = (x) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`;
      if (dias.length !== 3 || !dias[0].startsWith(d(de)) || !dias[1].startsWith(d(ate)) || dias[2] !== 'Total') falha('por dia: ' + dias);
      log(`filtrando o Carlos, agrupa por dia: ${dias.slice(0, 2).join(' e ')}`);

      // Exportar Excel
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('a:has-text("Excel")')]);
      const arq = S + '/relatorio-agenda.xlsx'; await dl.saveAs(arq);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arq);
      const ag = wb.getWorksheet('Agendamentos'), rs = wb.getWorksheet('Resumo');
      if (ag.rowCount !== 6 || rs.getRow(rs.rowCount).getCell(1).value === null) falha(`excel: ${ag.rowCount} linhas`);
      const [dp] = await Promise.all([p.waitForEvent('download'), p.click('a:has-text("PDF")')]);
      const pdf = S + '/relatorio-agenda.pdf'; await dp.saveAs(pdf);
      if (require('fs').readFileSync(pdf).subarray(0, 4).toString() !== '%PDF') falha('pdf');
      log('exporta Excel (aba Agendamentos com as 5 do Carlos + Resumo) e PDF');

      // Atalho a partir da Agenda
      await p.goto(`${B}/loja/agenda`);
      await p.click('a:has-text("Relatório da agenda")');
      await p.waitForURL('**/loja/relatorios/agenda?de=*');
      log('a Agenda tem o atalho “Relatório da agenda” (com a semana que está aberta)');
    } finally { await b.close(); }
  } finally { if (!process.env.MANTER) await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
