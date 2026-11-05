// Etapa 8 · Financeiro: alerta de pagamento pendente, baixa individual e em lote com comprovante,
// fechamento mensal (faturar pendentes + Excel batendo com o banco), visão do cliente e isolamento.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/etapa8-financeiro.js
const fs = require('fs');
const ExcelJS = require('exceljs');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarLoja, criarUsuario, limparLoja, entrar } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const temTexto = (page, sel, t) => page.waitForFunction(([s, t]) => (document.querySelector(s)?.textContent ?? '').replace(/\u00a0/g, ' ').includes(t), [sel, t], { timeout: 10000 });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const mes = hoje.slice(0, 7);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

async function sessao(login, senha) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { error } = await c.auth.signInWithPassword({ email: email(login), password: senha }); if (error) throw error;
  return c;
}

(async () => {
  const L = await criarLoja('Loja E2E Etapa 8'), L2 = await criarLoja('Loja E2E Etapa 8 Outra');
  await criarUsuario({ login: 'gestor-etapa8', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L.id, nome: 'Gestor E8' });
  await criarUsuario({ login: 'gestor-etapa8b', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L2.id });
  const { data: emps } = await adm.from('empresas_clientes').insert([
    { loja_id: L.id, cnpj: '11222333000181', razao_social: 'Avulso E8 Ltda', nome_fantasia: 'Avulso E8', forma_cobranca: 'avulso' },
    { loja_id: L.id, cnpj: '11444777000161', razao_social: 'Faturado E8 SA', nome_fantasia: 'Faturado E8', forma_cobranca: 'faturado' },
  ]).select('id, nome_fantasia');
  const [A, F] = emps;
  await criarUsuario({ login: 'cliente-etapa8', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: A.id });
  await criarUsuario({ login: 'cliente-etapa8f', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: F.id });
  await adm.from('precos').update({ valor: 150 }).eq('loja_id', L.id);
  const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
  const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
  const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
  const gestor = await sessao('gestor-etapa8', 'gestor-senha-123');

  // 4 OS do avulso (3 concluídas, 1 cancelada) e 2 do faturado, abertas pela Loja e concluídas com laudo
  const abrir = async (emp, placa) => {
    const { data, error } = await gestor.rpc('abrir_os', { p_empresa: emp, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null });
    if (error) falha(error.message); return data[0];
  };
  const concluir = async (os, emp) => {
    const path = `${emp}/${os.id}/v1.pdf`;
    const { error: up } = await gestor.storage.from('laudos').upload(path, PDF, { contentType: 'application/pdf' }); if (up) falha(up.message);
    const { error } = await gestor.rpc('registrar_laudo', { p_os: os.id, p_versao: 1, p_path: path, p_nome: 'laudo.pdf', p_tamanho: PDF.length }); if (error) falha(error.message);
  };
  const osA = [];
  for (const p of ['FIN1A01', 'FIN1A02', 'FIN1A03']) { const o = await abrir(A.id, p); await concluir(o, A.id); osA.push(o); }
  const canc = await abrir(A.id, 'FIN1A04');
  await gestor.rpc('cancelar_os', { p_os: canc.id, p_nome: 'Ana', p_motivo: (await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'cancelamento').limit(1).single()).data.id, p_descricao: 'duplicada' });
  const osF = [];
  for (const p of ['FIN1F01', 'FIN1F02']) { const o = await abrir(F.id, p); await concluir(o, F.id); osF.push(o); }
  const andamento = await abrir(A.id, 'FIN1A05'); // em andamento: não entra em "pendentes"

  const { data: alertas } = await adm.from('notificacoes').select('os_id, titulo, corpo').eq('loja_id', L.id).eq('tipo', 'pagamento_pendente');
  if (alertas.length !== 3 || alertas.some((n) => !osA.find((o) => o.id === n.os_id))) falha(`alertas de pagamento: ${alertas.length}`);
  log(`alerta “pagamento pendente” para a Loja nas 3 OS concluídas do cliente avulso (ex.: “${alertas[0].titulo} – ${alertas[0].corpo}”); nenhum para o faturado`);

  const b = await chromium.launch();
  try {
    const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
    await entrar(page, B, 'gestor-etapa8', 'gestor-senha-123', '/loja');
    await page.goto(B + '/loja/financeiro'); await page.waitForURL('**/loja/financeiro/pagamentos');
    for (let i = 0; i < 2; i++) await page.click('button:has-text("Agora não")', { timeout: 3000 }).catch(() => {});
    await temTexto(page, 'main', 'R$ 750,00').catch(() => falha('KPI a receber deveria ser R$ 750,00'));
    const linhas = await page.locator('tbody tr').count();
    if (linhas !== 5) falha(`pendentes: esperava 5 linhas, veio ${linhas}`);
    log('Financeiro: “A receber R$ 750,00” e 5 placas pendentes (sem a cancelada e sem a em andamento)');
    await page.screenshot({ path: S + '/fin-pagamentos.png', fullPage: true });

    // Validação: pago sem forma
    await page.click('tr:has-text("FIN1A03") >> button:has-text("Dar baixa")');
    await page.click('dialog button:has-text("Confirmar pagamento")');
    await page.waitForSelector('dialog >> text=Escolha a forma de pagamento.');
    log('pago sem forma de pagamento é recusado com a mensagem do campo');
    await page.click('dialog button:has-text("Voltar")');

    // Baixa em lote de 2 placas com comprovante
    fs.writeFileSync(S + '/comprovante.pdf', PDF);
    await page.check('input[aria-label="Selecionar FIN1A01"]'); await page.check('input[aria-label="Selecionar FIN1A02"]');
    await temTexto(page, '[aria-label=Seleção]', 'R$ 300,00');
    await page.click('button:has-text("Dar baixa nas selecionadas")');
    await page.selectOption('#pg-forma', 'pix');
    await page.setInputFiles('#pg-comprovante', S + '/comprovante.pdf');
    await page.fill('#pg-obs', 'Pix recebido');
    await page.click('dialog button:has-text("Confirmar pagamento")');
    await page.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
    await espera(800);
    const { data: pagas } = await adm.from('ordens_servico').select('placa, pagamento_status, pagamento_forma, pagamento_data, pagamento_obs').in('id', [osA[0].id, osA[1].id]);
    if (!pagas.every((o) => o.pagamento_status === 'pago' && o.pagamento_forma === 'pix' && o.pagamento_data === hoje && o.pagamento_obs === 'Pix recebido')) falha('baixa em lote');
    const { data: comps } = await adm.from('anexos').select('os_id, storage_path').eq('tipo', 'comprovante').in('os_id', [osA[0].id, osA[1].id]);
    if (comps.length !== 2 || comps[0].storage_path !== comps[1].storage_path) falha('comprovante');
    const { data: vistas } = await adm.from('notificacoes').select('vista_em').eq('tipo', 'pagamento_pendente').in('os_id', [osA[0].id, osA[1].id]);
    if (vistas.some((n) => !n.vista_em)) falha('alerta não foi baixado');
    log('baixa em lote: 2 placas pagas via Pix com data de hoje, um comprovante anexado nas duas e os alertas saíram da lista');
    await temTexto(page, 'main', 'R$ 450,00');
    log('KPI “A receber” caiu para R$ 450,00 sem recarregar a página');

    // Fechamento mensal: faturar as pendentes do cliente faturado
    await page.click('a:has-text("Fechamento mensal")'); await page.waitForURL('**/loja/financeiro/fechamento');
    await page.waitForSelector('#fech-clientes');
    await page.screenshot({ path: S + '/fin-fechamento.png', fullPage: true });
    await page.click('tr:has-text("Faturado E8") >> button:has-text("Dar baixa (2)")');
    await page.fill('#pg-obs', `Fatura ${mes}`);
    await page.click('dialog button:has-text("Marcar como faturado")');
    await page.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 }); await espera(800);
    const { data: fat } = await adm.from('ordens_servico').select('pagamento_status, pagamento_forma').in('id', osF.map((o) => o.id));
    if (!fat.every((o) => o.pagamento_status === 'faturado' && o.pagamento_forma === 'faturamento')) falha('faturar');
    log('fechamento: “Dar baixa (2)” marcou as 2 placas do cliente faturado como Faturado (faturamento mensal)');

    // Excel do fechamento bate com o banco
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('a:has-text("Exportar Excel")')]);
    const arq = S + '/fechamento.xlsx'; await dl.saveAs(arq);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arq);
    const placas = wb.getWorksheet('Placas'), resumo = wb.getWorksheet('Resumo');
    const { data: banco } = await adm.from('ordens_servico').select('valor_final, pagamento_status').eq('loja_id', L.id).eq('status', 'vistoriado');
    const soma = (f) => banco.filter(f).reduce((s, o) => s + Number(o.valor_final), 0);
    const tot = resumo.getRows(2, resumo.rowCount).find((r) => r.getCell(1).value === 'TOTAL');
    const xl = { qtd: tot.getCell(2).value, total: tot.getCell(3).value, pago: tot.getCell(4).value, fat: tot.getCell(5).value, pend: tot.getCell(6).value };
    const db = { qtd: banco.length, total: soma(() => true), pago: soma((o) => o.pagamento_status === 'pago'), fat: soma((o) => o.pagamento_status === 'faturado'), pend: soma((o) => o.pagamento_status === 'pendente') };
    if (JSON.stringify(xl) !== JSON.stringify(db) || placas.rowCount - 1 !== banco.length) falha(`Excel ${JSON.stringify(xl)} ≠ banco ${JSON.stringify(db)}`);
    log(`Excel do fechamento (${dl.suggestedFilename()}) bate com o banco: ${db.qtd} OS · total ${db.total} · pago ${db.pago} · faturado ${db.fat} · pendente ${db.pend}`);

    // Ficha da OS: alterar pagamento e voltar para pendente
    await page.goto(B + `/loja/os/${osA[0].numero}`);
    await page.waitForSelector('#val-titulo');
    if (!(await page.textContent('section:has(#val-titulo)')).includes('comprovante.pdf')) falha('comprovante na ficha');
    await page.click('button:has-text("Alterar pagamento")');
    await page.check('dialog input[value=pendente]');
    await page.click('dialog button:has-text("Voltar para pendente")');
    await page.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 }); await espera(800);
    const { data: volta } = await adm.from('ordens_servico').select('pagamento_status, pagamento_forma, pagamento_data, pagamento_obs').eq('id', osA[0].id).single();
    if (volta.pagamento_status !== 'pendente' || volta.pagamento_forma || volta.pagamento_data || volta.pagamento_obs) { await page.screenshot({ path: S + '/fin-erro.png' }); falha('voltar para pendente ' + JSON.stringify(volta)); }
    await page.waitForSelector('ol >> text=Pagamento');
    log('ficha: comprovante listado em “Valores e pagamento”; “Voltar para pendente” limpou forma, data e observação e entrou na linha do tempo');
    await page.screenshot({ path: S + '/fin-ficha.png', fullPage: true });

    // Cliente avulso: só os próprios, sem ações
    const cli = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(cli, B, 'cliente-etapa8', 'cliente-senha-123', '/app');
    await cli.click('button:has-text("Agora não")').catch(() => {});
    await cli.goto(B + '/app/financeiro/pagamentos?situacao=todas');
    const txt = await cli.textContent('main');
    if (txt.includes('FIN1F01') || !txt.includes('FIN1A02')) falha('cliente vê placas de outra empresa');
    if (await cli.locator('button:has-text("Dar baixa")').count()) falha('cliente com botão de baixa');
    const resp = await cli.request.get(B + `/api/financeiro/fechamento?mes=${mes}&cliente=${F.id}`);
    const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(await resp.body());
    const placasCli = wb2.getWorksheet('Placas').getColumn(2).values.slice(2);
    if (placasCli.some((p) => String(p).startsWith('FIN1F'))) falha('Excel do cliente com outra empresa');
    log(`cliente avulso vê só as próprias placas, sem baixa; o Excel dele (mesmo pedindo outro cliente) traz só as suas: ${placasCli.join(', ')}`);
    await cli.screenshot({ path: S + '/fin-cliente.png', fullPage: true });
    await cli.setViewportSize({ width: 390, height: 844 }); await cli.reload(); await cli.screenshot({ path: S + '/fin-cliente-mobile.png', fullPage: true });

    // Regras no banco: cliente não dá baixa; outra Loja não alcança; cancelada não recebe; data futura
    const rpc = (c, os, st = 'pago', data = hoje) => c.rpc('registrar_pagamento', { p_os: os, p_status: st, p_forma: 'pix', p_data: data, p_obs: null });
    const cliApi = await sessao('cliente-etapa8', 'cliente-senha-123');
    const outra = await sessao('gestor-etapa8b', 'gestor-senha-123');
    const e1 = (await rpc(cliApi, [osA[2].id])).error?.message, e2 = (await rpc(outra, [osA[2].id])).error?.message;
    const e3 = (await rpc(gestor, [canc.id])).error?.message, e4 = (await rpc(gestor, [osA[2].id], 'pago', '2099-01-01')).error?.message;
    if (!e1?.includes('SEM_PERMISSAO') || !e2?.includes('SEM_PERMISSAO') || !e3?.includes('OS_CANCELADA') || !e4?.includes('DATA_FUTURA')) falha(`regras: ${e1} | ${e2} | ${e3} | ${e4}`);
    log('banco recusa: cliente dando baixa, Gestor de outra Loja, OS cancelada e data no futuro');
    const { count: aud } = await adm.from('auditoria').select('id', { count: 'exact', head: true }).eq('registro_id', osA[1].id).eq('campo', 'pagamento_status');
    if (!aud) falha('auditoria');
    log('auditoria campo a campo registra a mudança de pagamento');
    if (andamento.id && !(await adm.from('ordens_servico').select('status').eq('id', andamento.id).single()).data) falha('');
  } finally {
    await b.close();
    if (!process.env.MANTER) { await limparLoja(L.id); await limparLoja(L2.id); }
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
