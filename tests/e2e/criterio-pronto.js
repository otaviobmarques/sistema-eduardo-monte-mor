// Critério de pronto da V1 (CLAUDE.md, seção 13): a Creditas importa a planilha de 37 placas, a Loja recebe o alerta
// sonoro, agenda, frustra uma, resolve a pendência, envia o laudo das demais e marca os pagamentos, e os dois lados
// veem tudo em tempo real. O relatório do mês exporta em Excel e PDF com os números batendo com o banco.
// Uso: npm run build && npm start -- -p 3100; depois:
//   PLANILHA=caminho/creditas.xlsx S=pasta node tests/e2e/criterio-pronto.js
const fs = require('fs');
const ExcelJS = require('exceljs');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarUsuario, limparLoja, entrar, lojaComGestor, semPopupLeitura } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (t) => (t ?? '').replace(/ /g, ' ');
const temTexto = (page, sel, t, timeout = 20000) => page.waitForFunction(([s, t]) => (document.querySelector(s)?.textContent ?? '').replace(/ /g, ' ').includes(t), [sel, t], { timeout });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const CONTA_SOM = `(() => { window.__bipes = 0; const O = window.AudioContext;
  window.AudioContext = class extends O { createOscillator() { const o = super.createOscillator(); const st = o.start.bind(o); o.start = (...a) => { window.__bipes++; return st(...a); }; return o; } }; })();`;

(async () => {
  if (!process.env.PLANILHA || !fs.existsSync(process.env.PLANILHA)) falha('defina PLANILHA com a planilha da Creditas (37 placas)');
  const AMB = await lojaComGestor('Loja E2E Critério de Pronto', 'gestor-criterio');
  const L = AMB.loja;
  try {
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '33444555000190', razao_social: 'Creditas Soluções Financeiras E2E', nome_fantasia: 'Creditas E2E', forma_cobranca: 'faturado' }).select('id').single();
    await criarUsuario({ login: 'creditas-criterio', senha: 'creditas-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: emp.id, nome: 'Creditas' });
    await adm.from('precos').update({ valor: 180 }).eq('loja_id', L.id);
    const { data: vist } = await adm.from('vistoriadores').insert([{ loja_id: L.id, nome: 'Carlos Vistoriador' }, { loja_id: L.id, nome: 'Paula Vistoriadora' }]).select('id, nome');
    const gestor = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await gestor.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });

    const b = await chromium.launch();
    try {
      // Loja com alertas sonoros ligados
      const ctxLoja = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
      await ctxLoja.addInitScript(CONTA_SOM);
      const loja = await ctxLoja.newPage();
      await semPopupLeitura(loja);
      await entrar(loja, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      await loja.click('button:has-text("Ativar alertas sonoros")');
      await loja.click('button:has-text("Agora não")', { timeout: 3000 }).catch(() => {});
      // Cliente (Creditas)
      const cli = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(cli, B, 'creditas-criterio', 'creditas-senha-123', '/app');
      for (let i = 0; i < 2; i++) await cli.click('button:has-text("Agora não")', { timeout: 3000 }).catch(() => {});
      await espera(2500);

      // 1. Creditas importa a planilha de 37 placas
      await cli.goto(B + '/app/importar');
      await cli.fill('#imp-nome', 'Mariana (Creditas)');
      await cli.setInputFiles('input[name=arquivo]', process.env.PLANILHA);
      await cli.click('button:has-text("Ver prévia")');
      await cli.waitForURL(/\?lote=/); await cli.waitForSelector('text=serão criadas com abertura às');
      const cont = (await cli.$$eval('[aria-label="Filtrar linhas"] button', (bs) => bs.map((x) => x.textContent))).join(' | ');
      await cli.waitForSelector('button:has-text("Criar 37 OS")');
      log(`prévia da planilha real: ${cont}`);
      const bipes0 = await loja.evaluate(() => window.__bipes);
      await cli.click('button:has-text("Criar 37 OS")');
      await cli.waitForSelector('text=37 OS criadas');
      const { data: oss } = await adm.from('ordens_servico').select('id, numero, placa, aberta_em').eq('empresa_cliente_id', emp.id).order('numero');
      if (oss.length !== 37 || new Set(oss.map((o) => o.aberta_em)).size !== 1) falha('lote: esperava 37 OS com a mesma abertura');
      log('Creditas criou 37 OS numa única transação, com o mesmo horário de abertura');

      // 2. Loja recebe o alerta sonoro em tempo real
      await loja.waitForSelector('[role=alert]:has-text("Novo lote · Creditas E2E · 37 OS")', { timeout: 15000 });
      await temTexto(loja, 'main', '37 em andamento');
      if ((await loja.evaluate(() => window.__bipes)) <= bipes0) falha('Loja não tocou o alerta sonoro');
      log('Loja: toast “Novo lote · Creditas E2E · 37 OS”, alerta sonoro e fila com 37 em andamento, sem recarregar');
      await loja.screenshot({ path: S + '/pronto-1-lote-na-loja.png' });
      await loja.click('[role=alert] a, [role=alert] button:has-text("Ver lote")').catch(() => {});

      // 3. Agenda as 37 (amanhã, a cada 15 min, alternando vistoriadores)
      const amanha = new Date(Date.now() - 3 * 3600e3 + 86400e3).toISOString().slice(0, 10);
      for (const [i, o] of oss.entries()) {
        const quando = new Date(new Date(`${amanha}T08:00:00-03:00`).getTime() + i * 15 * 60e3).toISOString();
        const { error } = await gestor.rpc('agendar_os', { p_os: o.id, p_data_hora: quando, p_local: 'Pátio', p_vistoriador: vist[i % 2].id, p_motivo: null, p_motivo_texto: null });
        if (error) falha(`agendar ${o.placa}: ${error.message}`);
      }
      await loja.goto(B + `/loja/agenda?visao=dia&data=${amanha}`);
      const agenda = norm(await loja.textContent('main'));
      if (!oss.every((o) => agenda.includes(o.placa))) falha('agenda do dia não mostra as 37 placas');
      log('Loja agendou as 37 para amanhã (Carlos e Paula); a agenda do dia mostra todas');
      await loja.screenshot({ path: S + '/pronto-2-agenda.png', fullPage: true });

      // 4. Frustra uma → cliente vê na hora
      const frustrada = oss[0];
      await cli.goto(B + '/app');
      await espera(2000);
      const { data: mot } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'frustracao').limit(1).single();
      const { error: eF } = await gestor.rpc('frustrar_os', { p_os: frustrada.id, p_motivo: mot.id, p_ocorrida_em: new Date().toISOString(), p_descricao: 'Pátio sem autorização de entrada', p_responsavel: 'cliente', p_previsao: amanha });
      if (eF) falha(eF.message);
      await cli.waitForSelector(`[role=status]:has-text("Frustrada · ${frustrada.placa}")`, { timeout: 15000 });
      await cli.waitForSelector('text=1 pendência aguarda você', { timeout: 15000 });
      log(`Loja frustrou ${frustrada.placa}; a Creditas recebeu o aviso e o alerta de pendência em tempo real`);
      await cli.screenshot({ path: S + '/pronto-3-frustrada-no-cliente.png' });

      // 5. Resolve a pendência → volta para A vistoriar, relógio retoma
      const { data: pend } = await adm.from('pendencias').select('id').eq('os_id', frustrada.id).is('resolvida_em', null).single();
      const { error: eR } = await gestor.rpc('resolver_pendencia', { p_pendencia: pend.id, p_texto: 'Autorização recebida do pátio' });
      if (eR) falha(eR.message);
      const { data: depois } = await adm.from('ordens_servico').select('status, pausado_desde').eq('id', frustrada.id).single();
      const { data: pausa } = await adm.from('sla_pausas').select('fim').eq('os_id', frustrada.id).single();
      if (depois.status !== 'a_vistoriar' || depois.pausado_desde || !pausa.fim) falha('resolver pendência');
      await cli.waitForFunction(() => !document.body.innerText.includes('pendência aguarda você'), null, { timeout: 15000 });
      log('pendência resolvida: OS voltou para A vistoriar, pausa do SLA fechada; o alerta sumiu do painel da Creditas sozinho');

      // 6. Laudo das outras 36 → cliente vê as vistoriadas em tempo real
      const demais = oss.slice(1);
      for (const o of demais) {
        const path = `${emp.id}/${o.id}/v1.pdf`;
        const { error: up } = await gestor.storage.from('laudos').upload(path, PDF, { contentType: 'application/pdf' }); if (up) falha(up.message);
        const { error } = await gestor.rpc('registrar_laudo', { p_os: o.id, p_versao: 1, p_path: path, p_nome: `laudo-${o.placa}.pdf`, p_tamanho: PDF.length });
        if (error) falha(`laudo ${o.placa}: ${error.message}`);
      }
      await cli.waitForFunction(() => /Vistoriadas\s*36/.test(document.querySelector('[role=navigation][aria-label=Filtro], nav[aria-label=Filtro]')?.textContent ?? ''), null, { timeout: 20000 });
      log('Loja enviou os 36 laudos; o painel da Creditas passou a mostrar 36 vistoriadas sem recarregar');
      const { data: cl } = await adm.from('notificacoes').select('id').eq('empresa_cliente_id', emp.id).eq('destino', 'cliente').eq('tipo', 'vistoriado');
      if (cl.length !== 36) falha(`notificações de laudo: ${cl.length}`);
      await cli.screenshot({ path: S + '/pronto-4-painel-cliente.png', fullPage: true });
      // Creditas baixa um laudo (URL assinada)
      await cli.goto(B + `/app/os/${demais[0].numero}`);
      await cli.waitForSelector('text=laudo-');
      log('Creditas vê a ficha com o laudo disponível para baixar');

      // 7. Loja marca os pagamentos (faturamento mensal da Creditas)
      await loja.goto(B + '/loja/financeiro/pagamentos');
      await loja.waitForSelector('tbody tr');
      if ((await loja.locator('tbody tr').count()) !== 36) falha('pendentes de pagamento ≠ 36');
      await temTexto(loja, 'main', 'R$ 6.480,00');
      await loja.check('input[aria-label="Selecionar todas"]');
      await loja.click('button:has-text("Dar baixa nas selecionadas")');
      await loja.check('dialog input[value=faturado]');
      await loja.fill('#pg-obs', 'Fatura mensal Creditas');
      await loja.click('dialog button:has-text("Marcar como faturado")');
      await loja.waitForSelector('dialog[open]', { state: 'detached', timeout: 20000 });
      const { count: faturadas } = await adm.from('ordens_servico').select('id', { count: 'exact', head: true }).eq('empresa_cliente_id', emp.id).eq('pagamento_status', 'faturado');
      if (faturadas !== 36) falha(`faturadas: ${faturadas}`);
      const { data: formas } = await adm.from('ordens_servico').select('pagamento_forma').eq('empresa_cliente_id', emp.id).eq('pagamento_status', 'faturado');
      if (formas.some((f) => f.pagamento_forma !== 'faturamento')) falha('forma de pagamento do faturado: ' + [...new Set(formas.map((f) => f.pagamento_forma))]);
      log('Loja deu baixa nas 36 placas de uma vez (Faturado · R$ 6.480,00)');
      await cli.goto(B + '/app/financeiro/pagamentos?situacao=faturado');
      const cliTxt = norm(await cli.textContent('main')).replace(/-/g, '');
      const faltando = demais.filter((o) => !cliTxt.includes(o.placa)).map((o) => o.placa);
      if (faltando.length) falha('Creditas não vê como faturadas: ' + faltando.join(', '));
      log('Creditas vê as 36 placas como Faturadas no financeiro dela');

      // 8. Relatório do mês: Excel e PDF batendo com o banco
      const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      const q = `tipo=cliente&de=${hoje.slice(0, 7)}-01&ate=${hoje}`;
      await loja.goto(B + `/loja/relatorios?${q}`);
      const [dl] = await Promise.all([loja.waitForEvent('download'), loja.click('a:has-text("Excel")')]);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
      const tot = wb.getWorksheet('Resumo').getRows(2, 40).find((r) => r.getCell(1).value === 'TOTAL');
      const { data: banco } = await adm.from('vw_os_sla').select('status, no_prazo, foi_frustrada, valor, pagamento_status').eq('loja_id', L.id);
      const esperado = [banco.length, banco.filter((o) => o.status === 'vistoriado').length, banco.filter((o) => o.no_prazo).length, banco.filter((o) => o.foi_frustrada).length,
        banco.filter((o) => o.status !== 'cancelado').reduce((s, o) => s + Number(o.valor), 0)];
      const xl = [tot.getCell(2).value, tot.getCell(3).value, tot.getCell(4).value, tot.getCell(7).value, tot.getCell(9).value];
      if (JSON.stringify(xl) !== JSON.stringify(esperado)) falha(`Excel ${xl} ≠ banco ${esperado}`);
      const pdf = await loja.request.get(B + `/api/relatorios?${q}&formato=pdf`);
      const corpo = await pdf.body();
      if (pdf.headers()['content-type'] !== 'application/pdf' || !corpo.subarray(0, 5).toString().startsWith('%PDF')) falha('PDF do relatório');
      fs.writeFileSync(S + '/pronto-relatorio.pdf', corpo);
      log(`relatório do mês: Excel com ${xl[0]} OS · ${xl[1]} vistoriadas · ${xl[2]} no prazo · ${xl[3]} frustrada · R$ ${xl[4]} (igual ao banco) e PDF gerado`);
      await loja.screenshot({ path: S + '/pronto-5-relatorio.png', fullPage: true });
    } finally {
      await b.close();
    }
  } finally {
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
