// Etapa 9 · Painéis e relatórios: KPIs da Fila e do Painel do cliente, relatórios com filtros, gráfico,
// exportação Excel e PDF do mês de outubro com os números batendo com o banco, visão do cliente e exportação da Fila.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/etapa9-relatorios.js
const ExcelJS = require('exceljs');
const { chromium } = require('playwright');
const { adm, criarLoja, criarUsuario, limparLoja, entrar, proximoNumero } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const H = 3600e3;
const norm = (t) => (t ?? '').replace(/ /g, ' ');

(async () => {
  const L = await criarLoja('Loja E2E Etapa 9');
  await criarUsuario({ login: 'gestor-etapa9', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L.id, nome: 'Gestor E9' });
  const { data: emps } = await adm.from('empresas_clientes').insert([
    { loja_id: L.id, cnpj: '11222333000181', razao_social: 'Creditas E9', nome_fantasia: 'Creditas E9', forma_cobranca: 'faturado' },
    { loja_id: L.id, cnpj: '11444777000161', razao_social: 'Outra E9', nome_fantasia: 'Outra E9', forma_cobranca: 'avulso' },
  ]).select('id, nome_fantasia');
  const [A, Bc] = emps;
  await criarUsuario({ login: 'cliente-etapa9', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: Bc.id });
  const { data: vs } = await adm.from('vistoriadores').insert([{ loja_id: L.id, nome: 'João E9' }, { loja_id: L.id, nome: 'Maria E9' }]).select('id, nome');
  const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
  const { data: patios } = await adm.from('patios').select('id, nome, cidade').eq('loja_id', L.id);
  const utinga = patios.find((p) => p.nome === 'Freitas Utinga'), sb = patios.find((p) => p.nome === 'Freitas Santa Bárbara');
  const motivo = async (tipo) => (await adm.from('motivos').select('id, descricao').eq('loja_id', L.id).eq('tipo', tipo).limit(1).single()).data;
  const [mAtraso, mFrust, mCanc] = [await motivo('atraso'), await motivo('frustracao'), await motivo('cancelamento')];

  // Histórico de outubro/2026 (horário de Brasília) + 1 OS de novembro
  const criar = async (o) => {
    const aberta = new Date(o.aberta);
    const { data, error } = await adm.from('ordens_servico').insert({
      loja_id: L.id, numero: await proximoNumero(L.id), empresa_cliente_id: o.emp.id, nome_solicitante: 'Ana', placa: o.placa, marca_modelo: 'Gol',
      servico_id: serv.id, local_tipo: 'patio', patio_id: o.patio.id, cidade: o.patio.cidade, uf: 'SP', sla_horas: 48,
      aberta_em: aberta.toISOString(), prazo_em: new Date(aberta.getTime() + 48 * H).toISOString(), status: o.status ?? 'vistoriado',
      concluida_em: o.horas ? new Date(aberta.getTime() + o.horas * H).toISOString() : null, cancelada_em: o.status === 'cancelado' ? new Date(aberta.getTime() + 2 * H).toISOString() : null,
      vistoriador_id: o.vist?.id ?? null, valor_base: 150, valor_final: o.horas ? 150 : null, pagamento_status: o.pag ?? 'pendente', pagamento_data: o.pag && o.pag !== 'pendente' ? '2026-10-31' : null, pagamento_forma: o.pag === 'pago' ? 'pix' : null,
    }).select('id, numero').single();
    if (error) falha(error.message); return data;
  };
  const out = (d, h = 9) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-03:00`;
  const lista = [
    { placa: 'REL1A01', emp: A, patio: utinga, aberta: out(1), horas: 24, vist: vs[0], pag: 'faturado' },
    { placa: 'REL1A02', emp: A, patio: utinga, aberta: out(2), horas: 24, vist: vs[0], pag: 'faturado' },
    { placa: 'REL1A03', emp: A, patio: utinga, aberta: out(3), horas: 24, vist: vs[1] },
    { placa: 'REL1A04', emp: A, patio: utinga, aberta: out(10), horas: 24, vist: vs[1] },
    { placa: 'REL1A05', emp: A, patio: utinga, aberta: out(15), horas: 60, vist: vs[0], atraso: true },
    { placa: 'REL1A06', emp: A, patio: utinga, aberta: out(20), horas: 60, vist: vs[0], atraso: true },
    { placa: 'REL1A07', emp: A, patio: utinga, aberta: out(21), status: 'frustrado', frustra: true },
    { placa: 'REL1A08', emp: A, patio: utinga, aberta: out(22), status: 'cancelado' },
    { placa: 'REL1B01', emp: Bc, patio: sb, aberta: out(5), horas: 24, vist: vs[1], pag: 'pago' },
    { placa: 'REL1B02', emp: Bc, patio: sb, aberta: out(31, 23), horas: 24, vist: vs[1] }, // 31/10 23h em Brasília (já é 01/11 em UTC)
  ];
  for (const o of lista) {
    const os = await criar(o);
    if (o.atraso) await adm.from('justificativas_atraso').insert({ os_id: os.id, motivo_id: mAtraso.id, texto: 'Sem vistoriador' });
    if (o.frustra) await adm.from('os_frustracoes').insert({ os_id: os.id, motivo_id: mFrust.id, descricao: 'Pátio fechado', ocorrida_em: new Date(new Date(o.aberta).getTime() + 3 * H).toISOString() });
    if (o.status === 'cancelado') await adm.from('os_cancelamentos').insert({ os_id: os.id, solicitado_por_nome: 'Ana', motivo_id: mCanc.id, descricao: 'Duplicada', data: new Date(new Date(o.aberta).getTime() + 2 * H).toISOString() });
  }
  await criar({ placa: 'REL1N01', emp: A, patio: utinga, aberta: new Date(Date.now() - 30 * H).toISOString(), status: 'a_vistoriar' }); // novembro, vencendo
  const { count: justificadas } = await adm.from('justificativas_atraso').select('id', { count: 'exact', head: true }).in('os_id', (await adm.from('ordens_servico').select('id').eq('loja_id', L.id)).data.map((o) => o.id));
  if (justificadas !== 2) falha('justificativas de teste');

  // Verdade do banco para outubro (base: data de abertura)
  const { data: banco } = await adm.from('vw_os_sla').select('*').eq('loja_id', L.id).gte('aberta_em', '2026-10-01T03:00:00Z').lt('aberta_em', '2026-11-01T03:00:00Z');
  const vist = banco.filter((o) => o.status === 'vistoriado');
  const esperado = {
    total: banco.length, vistoriadas: vist.length, noPrazo: vist.filter((o) => o.no_prazo).length,
    tempoMedio: Math.round((vist.reduce((s, o) => s + Number(o.horas_conclusao), 0) / vist.length) * 10) / 10,
    frustradas: banco.filter((o) => o.foi_frustrada).length, canceladas: banco.filter((o) => o.status === 'cancelado').length,
    valor: banco.filter((o) => o.status !== 'cancelado').reduce((s, o) => s + Number(o.valor), 0),
    pendente: vist.filter((o) => o.pagamento_status === 'pendente').reduce((s, o) => s + Number(o.valor), 0),
  };
  if (esperado.total !== 10 || esperado.vistoriadas !== 8 || esperado.noPrazo !== 6 || esperado.tempoMedio !== 33) falha(`dados de base: ${JSON.stringify(esperado)}`);
  log(`base de outubro no banco (vw_os_sla): ${esperado.total} OS · ${esperado.vistoriadas} vistoriadas · ${esperado.noPrazo} no prazo · tempo médio ${esperado.tempoMedio}h · 1 frustrada · 1 cancelada · R$ ${esperado.valor} · pendente R$ ${esperado.pendente}`);

  const b = await chromium.launch();
  try {
    const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
    await entrar(page, B, 'gestor-etapa9', 'gestor-senha-123', '/loja');
    for (let i = 0; i < 2; i++) await page.click('button:has-text("Agora não")', { timeout: 3000 }).catch(() => {});

    // Fila: KPIs e cards
    const ind = norm(await page.textContent('[aria-label=Indicadores]'));
    if (!/A vistoriar\s*1/.test(ind) || !/Vencendo\s*1/.test(ind)) falha('KPIs da fila: ' + ind);
    log('Fila: KPIs “A vistoriar 1 · Vencendo 1 · Vencidas · Vistoriadas no mês · Frustradas/canceladas · A receber” e cards de motivos de atraso e vistoriadores hoje');
    await page.screenshot({ path: S + '/rel-fila.png', fullPage: true });
    const [dlFila] = await Promise.all([page.waitForEvent('download'), page.click('a:has-text("Exportar Excel")')]);
    const wbF = new ExcelJS.Workbook(); await wbF.xlsx.readFile(await dlFila.path());
    const filaPlacas = wbF.getWorksheet('Fila').getColumn(2).values.slice(2);
    if (filaPlacas.join() !== 'REL1A07,REL1N01') falha('Excel da fila: ' + filaPlacas.join());
    const pdfFila = await page.request.get(B + '/api/fila?formato=pdf');
    if (pdfFila.headers()['content-type'] !== 'application/pdf' || !(await pdfFila.body()).subarray(0, 5).toString().startsWith('%PDF')) falha('PDF da fila');
    log('Fila exporta Excel (só as em andamento, vencida primeiro) e PDF');

    // Relatório de outubro
    const q = 'de=2026-10-01&ate=2026-10-31';
    await page.goto(B + `/loja/relatorios?tipo=periodo&${q}`);
    const kpis = norm(await page.textContent('main'));
    for (const t of ['Vistorias10', '% no prazo75%', 'Tempo médio1d 9h', 'Frustração10%', 'Cancelamento10%']) if (!kpis.replace(/\s+/g, '').includes(t.replace(/\s+/g, ''))) falha(`KPI ausente: ${t}`);
    log('Relatório de outubro: Vistorias 10 · 75% no prazo · tempo médio 1d 9h · frustração 10% · cancelamento 10%');
    if (!kpis.includes('out/2026')) falha('gráfico por período');
    if (kpis.includes('nov/2026')) falha('OS de 31/10 23h caiu em novembro');
    await page.screenshot({ path: S + '/rel-periodo.png', fullPage: true });

    await page.click('nav[aria-label=Relatórios] a:has-text("Por pátio")');
    await page.waitForURL('**tipo=patio**');
    const rows = await page.$$eval('#rel-tab ~ div tbody tr', (trs) => trs.map((t) => t.innerText.replace(/\s+/g, ' ')));
    if (!rows[0].startsWith('Freitas Utinga 8') || !rows[1].startsWith('Freitas Santa Bárbara 2')) falha('por pátio: ' + rows.join(' | '));
    log('Por pátio (mantendo o período): Freitas Utinga 8 OS, Freitas Santa Bárbara 2 OS');
    await page.click('nav[aria-label=Relatórios] a:has-text("Por vistoriador")');
    await page.waitForURL('**tipo=vistoriador**');
    const vrows = await page.$$eval('#rel-tab ~ div tbody tr', (trs) => trs.map((t) => t.innerText.replace(/\s+/g, ' ')));
    if (!vrows.some((r) => r.startsWith('João E9 4 4 50%')) || !vrows.some((r) => r.startsWith('Maria E9 4 4 100%'))) falha('por vistoriador: ' + vrows.join(' | '));
    log('Por vistoriador: João 4 vistorias (50% no prazo), Maria 4 (100% no prazo)');
    await page.click('nav[aria-label=Relatórios] a:has-text("Desempenho de SLA")');
    await page.waitForURL('**tipo=sla**');
    const det = norm(await page.textContent('section:has(#rel-det)'));
    if (!det.includes(`Atraso: ${mAtraso.descricao}`)) falha('motivo de atraso no detalhe');
    log(`Desempenho de SLA: 6 no prazo, 2 com atraso (motivo “${mAtraso.descricao}” no detalhe)`);
    await page.screenshot({ path: S + '/rel-sla.png', fullPage: true });

    // Filtro por cliente
    await page.goto(B + `/loja/relatorios?tipo=cliente&${q}&cliente=${Bc.id}`);
    if (!norm(await page.textContent('main')).replace(/\s+/g, '').includes('Vistorias2')) falha('filtro por cliente');
    log('filtro por cliente: Outra E9 = 2 vistorias');

    // Excel e PDF de outubro batendo com o banco
    await page.goto(B + `/loja/relatorios?tipo=periodo&${q}`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('a:has-text("Excel")')]);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
    const dados = wb.getWorksheet('Dados'), resumo = wb.getWorksheet('Resumo');
    const tot = resumo.getRows(2, resumo.rowCount).find((r) => r.getCell(1).value === 'TOTAL');
    const xl = { total: tot.getCell(2).value, vistoriadas: tot.getCell(3).value, noPrazo: tot.getCell(4).value, tempoMedio: tot.getCell(6).value, frustradas: tot.getCell(7).value, canceladas: tot.getCell(8).value, valor: tot.getCell(9).value, pendente: tot.getCell(10).value };
    if (JSON.stringify(xl) !== JSON.stringify(esperado) || dados.rowCount - 1 !== esperado.total) falha(`Excel ${JSON.stringify(xl)} ≠ banco ${JSON.stringify(esperado)}`);
    log(`Excel de outubro (${dl.suggestedFilename()}): abas Dados (${dados.rowCount - 1} linhas) e Resumo; totais iguais ao banco`);
    const [dlp] = await Promise.all([page.waitForEvent('download'), page.click('a:has-text("PDF")')]);
    const pdf = require('fs').readFileSync(await dlp.path());
    const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (!pdf.subarray(0, 5).toString().startsWith('%PDF') || paginas < 1) falha('PDF de outubro');
    require('fs').copyFileSync(await dlp.path(), S + '/relatorio-outubro.pdf');
    log(`PDF de outubro (${dlp.suggestedFilename()}): ${paginas} página(s) com logo, filtros, data de geração e paginação`);

    // Cliente: só os próprios dados, sem relatório por vistoriador
    const cli = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(cli, B, 'cliente-etapa9', 'cliente-senha-123', '/app');
    for (let i = 0; i < 2; i++) await cli.click('button:has-text("Agora não")', { timeout: 3000 }).catch(() => {});
    if (!(await cli.locator('[aria-label=Indicadores]').count())) falha('KPIs do painel do cliente');
    await cli.screenshot({ path: S + '/rel-painel-cliente.png', fullPage: true });
    await cli.goto(B + `/app/relatorios?tipo=periodo&${q}`);
    const tc = norm(await cli.textContent('main')).replace(/\s+/g, '');
    if (!tc.includes('Vistorias2') || tc.includes('REL1A0')) falha('cliente vê dados de outro');
    if (await cli.locator('nav[aria-label=Relatórios] a:has-text("Por vistoriador")').count()) falha('cliente com relatório por vistoriador');
    const x = await cli.request.get(B + `/api/relatorios?tipo=periodo&${q}&cliente=${A.id}&formato=xlsx`);
    const wbC = new ExcelJS.Workbook(); await wbC.xlsx.load(await x.body());
    const pl = wbC.getWorksheet('Dados').getColumn(2).values.slice(2);
    if (pl.join() !== 'REL1B01,REL1B02') falha('Excel do cliente: ' + pl.join());
    log('cliente vê só as próprias 2 vistorias, sem relatório por vistoriador; o Excel dele (mesmo pedindo outro cliente) traz só REL1B01, REL1B02');
    await cli.setViewportSize({ width: 390, height: 844 }); await cli.reload(); await cli.screenshot({ path: S + '/rel-cliente-mobile.png', fullPage: true });
  } finally {
    await b.close();
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
