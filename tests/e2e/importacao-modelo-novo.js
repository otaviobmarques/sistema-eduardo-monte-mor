// Importação em lote · modelo novo (planilha de controle, ex.: Dukar): Loja importa o histórico (vale Data, Status,
// Pagamento e Valor; unidade como campo; pátio pela unidade), cliente importa pedidos novos, planilha modelo e
// relatório por unidade. Uso: PLANILHA_DUKAR=caminho.xlsx S=pasta node tests/e2e/importacao-modelo-novo.js
const fs = require('fs');
const ExcelJS = require('exceljs');
const { chromium } = require('playwright');
const { adm, criarUsuario, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const contaPor = (l, k) => l.reduce((o, x) => ({ ...o, [x[k]]: (o[x[k]] ?? 0) + 1 }), {});

(async () => {
  const ARQ = process.env.PLANILHA_DUKAR;
  if (!ARQ || !fs.existsSync(ARQ)) { console.log('— pulado: defina PLANILHA_DUKAR com a planilha de controle da Dukar'); return; }
  const AMB = await lojaComGestor('Loja E2E Modelo Novo', 'gestor-modelo-novo');
  const L = AMB.loja;
  try {
    await adm.from('servicos').insert([{ loja_id: L.id, nome: 'Laudo Mera', sla_horas: 48, ativo: true }, { loja_id: L.id, nome: 'Laudo Baixa Permanente', sla_horas: 48, ativo: true }]);
    const { data: emps } = await adm.from('empresas_clientes').insert([
      { loja_id: L.id, cnpj: '11222333000181', razao_social: 'Despachante Dukar Ltda', nome_fantasia: 'Despachante Dukar', forma_cobranca: 'avulso' },
      { loja_id: L.id, cnpj: '11444777000161', razao_social: 'Dukar Cliente E2E', nome_fantasia: 'Dukar Cliente', forma_cobranca: 'avulso' },
    ]).select('id, nome_fantasia');
    const [dukar, dukarCli] = emps;
    await criarUsuario({ login: 'cliente-modelo-novo', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: dukarCli.id });

    const b = await chromium.launch();
    try {
      // Planilha modelo para baixar
      const g = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
      await entrar(g, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await g.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await g.goto(B + '/loja/importar');
      const [dl] = await Promise.all([g.waitForEvent('download'), g.click('text=Baixar planilha modelo')]);
      const mwb = new ExcelJS.Workbook(); await mwb.xlsx.readFile(await dl.path());
      const cab = mwb.getWorksheet('Planilha').getRow(1).values.slice(1);
      const servLista = mwb.getWorksheet('Listas').getColumn(1).values.slice(2);
      if (cab.join('|') !== 'Data|Qtd|Tipo de Cliente|Cliente|Solicitação|Telefone|CPF|CEP|Placa|Veículo|Renavam|Ano / Modelo|Cor|Serviço|Valor|Deslocamento|Forma de Pagamento|Pagamento Efetuado|Coluna12|Status|Fotos|CRLV|Obs.') falha('colunas do modelo: ' + cab.join('|'));
      if (!servLista.includes('Laudo Mera') || !mwb.getWorksheet('Instruções')) falha('listas/instruções do modelo');
      log(`planilha modelo (${dl.suggestedFilename()}): mesmas colunas da planilha de controle, abas ${mwb.worksheets.map((w) => w.name).join(', ')}; lista de serviços do cadastro (${servLista.join(', ')})`);

      // Loja importa a planilha real como histórico
      await g.selectOption('#imp-empresa', dukar.id);
      await g.fill('#imp-nome', 'Gestor (planilha de novembro)');
      await g.setInputFiles('input[name=arquivo]', ARQ);
      await g.click('button:has-text("Ver prévia")');
      await g.waitForURL(/\?lote=/); await g.waitForSelector('text=Importação do histórico');
      const cont = (await g.$$eval('[aria-label="Filtrar linhas"] button', (bs) => bs.map((x) => x.textContent))).join(' | ');
      if (!cont.includes('Prontas79') || !cont.includes('Com erro9')) falha('prévia: ' + cont);
      const aviso = await g.textContent('text=Importação do histórico >> xpath=..');
      log(`prévia da planilha real (88 linhas): ${cont}`);
      log('aviso:', aviso.replace(/\s+/g, ' ').trim().slice(0, 230));
      await g.screenshot({ path: S + '/novo-previa-loja.png', fullPage: true });

      // Corrige uma linha da Vila Guilherme escolhendo o pátio; as demais com erro ficam de fora
      const linhaVG = g.locator('tr:has-text("Vila Guilherme"):has(button:has-text("Corrigir"))').filter({ hasNotText: 'Renavam' }).first();
      await linhaVG.locator('button:has-text("Corrigir")').click();
      await g.selectOption('tr.bg-info-bg select >> nth=0', { label: 'Leilomaster SP' });
      await g.click('tr.bg-info-bg button:has-text("Salvar")');
      await g.waitForSelector('text=pronta.');
      await g.waitForSelector('button:has-text("Criar 80 OS")');
      log('linha da Vila Guilherme corrigida escolhendo o pátio na prévia (dados da planilha mantidos)');
      await g.click('button:has-text("Criar 80 OS")');
      await g.waitForSelector('text=80 OS criadas', { timeout: 60000 });
      await g.screenshot({ path: S + '/novo-confirmado.png', fullPage: true });

      const { data: oss } = await adm.from('ordens_servico').select('id, numero, placa, status, unidade, aberta_em, concluida_em, valor_base, valor_final, pagamento_status, pagamento_forma, origem_historico, sla_indisponivel, alerta1_enviado, vencida_notificada, patio_id').eq('empresa_cliente_id', dukar.id);
      const { data: linhas } = await adm.from('lote_linhas').select('status_os, pagamento_status, data_planilha, os_id').not('os_id', 'is', null);
      const esperadoSt = contaPor(linhas.filter((l) => oss.some((o) => o.id === l.os_id)).map((l) => ({ s: l.status_os ?? 'a_vistoriar' })), 's');
      const st = contaPor(oss, 'status');
      if (oss.length !== 80 || JSON.stringify(Object.entries(st).sort()) !== JSON.stringify(Object.entries(esperadoSt).sort())) falha(`status: ${JSON.stringify(st)} ≠ ${JSON.stringify(esperadoSt)}`);
      log(`80 OS criadas com o status da planilha: ${Object.entries(st).map(([k, v]) => `${v} ${k}`).join(', ')}`);
      const br = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
      const datasOk = oss.every((o) => { const l = linhas.find((x) => x.os_id === o.id); return br(o.aberta_em) === l.data_planilha && new Date(o.aberta_em).toISOString().slice(11, 16) === '11:00'; });
      if (!datasOk) falha('abertura ≠ data da planilha');
      if (!oss.every((o) => Number(o.valor_base) === 90 && o.unidade?.startsWith('Despachante Dukar SP') && o.origem_historico && o.alerta1_enviado && o.vencida_notificada)) falha('valor/unidade/origem');
      const vist = oss.filter((o) => o.status === 'vistoriado');
      if (!vist.every((o) => o.sla_indisponivel && o.concluida_em === o.aberta_em && Number(o.valor_final) === 90)) falha('vistoriadas');
      const pagos = oss.filter((o) => o.pagamento_status === 'pago');
      if (pagos.length !== linhas.filter((l) => oss.some((o) => o.id === l.os_id) && l.pagamento_status === 'pago').length || pagos.some((o) => !o.pagamento_forma)) falha('pagamentos');
      log(`abertura = data de cada linha (08:00 em Brasília); valor R$ 90 da planilha; unidade gravada; ${pagos.length} pagas; vistoriadas concluídas na data e fora das métricas de prazo`);
      const { data: notifs } = await adm.from('notificacoes').select('tipo').eq('loja_id', L.id);
      const porTipo = contaPor(notifs, 'tipo');
      if (porTipo.pagamento_pendente || porTipo.novo_lote || porTipo.alerta_24h || porTipo.vencida) falha('rajada de notificações: ' + JSON.stringify(porTipo));
      const { count: pend } = await adm.from('pendencias').select('id', { count: 'exact', head: true }).in('os_id', oss.filter((o) => o.status === 'frustrado').map((o) => o.id)).is('resolvida_em', null);
      if (pend !== st.frustrado) falha('frustradas sem pendência');
      log(`sem rajada de alertas (nenhum “pagamento pendente”, “novo lote” ou prazo); ${pend} frustradas com pendência aberta, como no fluxo normal`);
      const { data: sla } = await adm.from('vw_os_sla').select('no_prazo, horas_conclusao').in('id', vist.map((o) => o.id));
      if (sla.some((x) => x.no_prazo !== null || x.horas_conclusao !== null)) falha('SLA do histórico entrou nas métricas');

      // Ficha mostra a unidade e a origem
      await g.goto(`${B}/loja/os/${vist[0].numero}`);
      const ficha = await g.textContent('main');
      if (!ficha.includes('Unidade') || !ficha.includes('Despachante Dukar SP') || !ficha.includes('Histórico importado da planilha')) falha('ficha');
      log('ficha da OS mostra a Unidade e a origem “Histórico importado da planilha”');

      // Relatório por unidade
      await g.goto(`${B}/loja/relatorios?tipo=unidade&de=2026-11-01&ate=2026-11-30`);
      const rel = await g.$$eval('#rel-tab ~ div tbody tr', (trs) => trs.map((t) => t.innerText.replace(/\s+/g, ' ')));
      if (!rel.some((r) => r.startsWith('Despachante Dukar SP Utinga'))) falha('relatório por unidade: ' + rel.join(' | '));
      log('relatório “Por unidade”:', rel.slice(0, 4).map((r) => r.split(' ').slice(0, 6).join(' ')).join(' | '));
      await g.screenshot({ path: S + '/novo-relatorio-unidade.png', fullPage: true });

      // Cliente envia a mesma planilha: pedidos novos
      const c = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(c, B, 'cliente-modelo-novo', 'cliente-senha-123', '/app');
      for (let i = 0; i < 2; i++) await c.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await c.goto(B + '/app/importar');
      await c.fill('#imp-nome', 'Pedro'); await c.setInputFiles('input[name=arquivo]', ARQ);
      await c.click('button:has-text("Ver prévia")'); await c.waitForURL(/\?lote=/); await c.waitForSelector('text=Pedidos novos');
      await c.click('button:has-text("Criar 79 OS")'); await c.waitForSelector('text=79 OS criadas', { timeout: 60000 });
      const { data: ossCli } = await adm.from('ordens_servico').select('status, valor_base, origem_historico, unidade, aberta_em').eq('empresa_cliente_id', dukarCli.id);
      if (ossCli.length !== 79 || ossCli.some((o) => o.status !== 'a_vistoriar' || o.origem_historico || Number(o.valor_base) !== 0 || !o.unidade || Date.now() - new Date(o.aberta_em).getTime() > 600e3)) falha('cliente: ' + JSON.stringify(contaPor(ossCli, 'status')));
      await espera(1500);
      const { count: lote } = await adm.from('notificacoes').select('id', { count: 'exact', head: true }).eq('empresa_cliente_id', dukarCli.id).eq('tipo', 'novo_lote');
      if (lote !== 1) falha('aviso de novo lote');
      log('cliente enviando a mesma planilha: 79 OS novas “A vistoriar”, abertas agora, valor pela tabela (status, data, pagamento e valor ignorados), unidade gravada; Loja avisada do lote');
    } finally {
      await b.close();
    }
  } finally {
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
