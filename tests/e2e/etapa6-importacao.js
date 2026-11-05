// Etapa 6 · Importação em lote com a planilha real da Creditas (37 placas de 03/11/2026).
// Uso: npm run build && npm start -- -p 3100; depois:
//   PLANILHA=caminho/creditas.xlsx E2E_ADMIN_SENHA=... S=pasta node tests/e2e/etapa6-importacao.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const path = require('node:path');
require('dotenv').config({ path: '.env.local', quiet: true });
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const adm = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CNPJ = '11222333000181', LOGIN = 'e2e-lote', SENHA = 'e2e-senha-123';
const log = (...a) => console.log('✔', ...a);
const { lojaComGestor, limparLoja, proximoNumero } = require('./apoio');
let AMB;
const falha = (m) => { throw new Error(m); };

async function limpar() {
  const { data: e } = await adm.from('empresas_clientes').select('id').eq('cnpj', CNPJ).maybeSingle();
  if (e) {
    const { data: oss } = await adm.from('ordens_servico').select('id').eq('empresa_cliente_id', e.id);
    const ids = (oss ?? []).map((o) => o.id);
    if (ids.length) { await adm.from('notificacoes').delete().in('os_id', ids); await adm.from('ordens_servico').delete().in('id', ids); await adm.from('auditoria').delete().in('registro_id', ids); }
    const { data: lotes } = await adm.from('lotes_importacao').select('id, arquivo_path').eq('empresa_cliente_id', e.id);
    if (lotes?.length) {
      const arqs = lotes.map((l) => l.arquivo_path).filter(Boolean); if (arqs.length) await adm.storage.from('importacoes').remove(arqs);
      await adm.from('notificacoes').delete().in('lote_id', lotes.map((l) => l.id));
      await adm.from('lotes_importacao').delete().in('id', lotes.map((l) => l.id));
    }
  }
  const { data: p } = await adm.from('perfis_usuario').select('user_id').eq('login', LOGIN).maybeSingle();
  if (p) { await adm.from('perfis_usuario').delete().eq('user_id', p.user_id); await adm.auth.admin.deleteUser(p.user_id); }
  if (e) { await adm.from('empresas_clientes').delete().eq('id', e.id); await adm.from('auditoria').delete().eq('registro_id', e.id); }
  await adm.from('acessos_log').delete().eq('login', LOGIN);
}

(async () => {
  AMB = await lojaComGestor('Loja E2E Etapa 6', 'gestor-etapa6');
  if (!process.env.PLANILHA) falha('defina PLANILHA');
  await limpar();
  // Cópia da planilha real com 2 erros de propósito
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(process.env.PLANILHA);
  const ws = wb.worksheets[0];
  ws.getRow(10).getCell(6).value = 'Pátio Inexistente';  // linha 10 (Eks5201)
  ws.getRow(11).getCell(5).value = 489114009;            // linha 11 (FAZ0c72): DV errado
  const testeXlsx = path.join(S, 'creditas-com-erros.xlsx'); await wb.xlsx.writeFile(testeXlsx);

  const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: AMB.loja.id, cnpj: CNPJ, razao_social: 'Creditas E2E Ltda', nome_fantasia: 'Creditas E2E' }).select('id').single();
  const { data: u } = await adm.auth.admin.createUser({ email: `${LOGIN}@${process.env.LOGIN_EMAIL_DOMAIN}`, password: SENHA, email_confirm: true });
  await adm.from('perfis_usuario').insert({ user_id: u.user.id, perfil: 'cliente', loja_id: AMB.loja.id, empresa_cliente_id: emp.id, login: LOGIN, nome_exibicao: 'Creditas E2E', deve_trocar_senha: false });
  // OS já aberta para EUI6776 → deve aparecer como "Já com OS"
  const { data: serv } = await adm.from('servicos').select('id').eq('padrao', true).eq('loja_id', AMB.loja.id).single();
  const { data: patio } = await adm.from('patios').select('id').eq('nome', 'Freitas Utinga').eq('loja_id', AMB.loja.id).single();
  const { data: existente } = await adm.from('ordens_servico').insert({ loja_id: AMB.loja.id, numero: await proximoNumero(AMB.loja.id), empresa_cliente_id: emp.id, nome_solicitante: 'Antes', placa: 'EUI6776', servico_id: serv.id, local_tipo: 'patio', patio_id: patio.id, sla_horas: 48, prazo_em: new Date(Date.now() + 48 * 3600e3).toISOString() }).select('numero').single();

  const b = await chromium.launch();
  try {
    const cli = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
    await cli.goto(B + '/login'); await cli.fill('#login', LOGIN); await cli.fill('#senha', SENHA); await cli.click('button:has-text("Entrar")');
    await cli.waitForURL('**/app');
    await cli.goto(B + '/app/importar');
    const [modelo] = await Promise.all([cli.waitForEvent('download'), cli.click('text=Baixar modelo .xlsx')]);
    const mwb = new ExcelJS.Workbook(); await mwb.xlsx.readFile(await modelo.path());
    log('modelo baixado:', modelo.suggestedFilename(), '| colunas:', mwb.worksheets[0].getRow(1).values.slice(1).join(', '), '| abas:', mwb.worksheets.map((w) => w.name).join(', '));
    await cli.click('button:has-text("Ver prévia")');
    await cli.waitForSelector('#imp-nome-msg.erro-campo'); log('exige solicitante e arquivo');
    await cli.fill('#imp-nome', 'Mariana (Creditas)');
    await cli.setInputFiles('input[name=arquivo]', testeXlsx);
    await cli.screenshot({ path: S + '/importar-envio.png', fullPage: true });
    await cli.click('button:has-text("Ver prévia")');
    await cli.waitForURL(/\?lote=/);
    await cli.waitForSelector('text=serão criadas com abertura às');
    const cont = await cli.$$eval('[aria-label="Filtrar linhas"] button', (bs) => bs.map((x) => x.textContent));
    log('prévia:', cont.join(' | '));
    if (!cont[0].includes('34') || !cont[1].includes('2') || !cont[2].includes('1') || !cont[3].includes('11')) falha('contadores inesperados');
    await cli.screenshot({ path: S + '/importar-previa-erros.png', fullPage: true });

    const [erros] = await Promise.all([cli.waitForEvent('download'), cli.click('text=Baixar linhas com erro')]);
    const ewb = new ExcelJS.Workbook(); await ewb.xlsx.readFile(await erros.path());
    log('linhas com erro baixadas:', ewb.worksheets[0].rowCount - 1, 'linhas');

    // Corrige o pátio da linha 10 na própria prévia
    await cli.click('tr:has-text("Pátio Inexistente") button:has-text("Corrigir")');
    await cli.selectOption('tr.bg-info-bg select >> nth=0', { label: 'Leilo São Carlos' });
    await cli.click('tr.bg-info-bg button:has-text("Salvar")');
    await cli.waitForSelector('text=Linha 10 pronta.'); log('linha 10 corrigida na prévia');
    // Exclui a linha com Renavam errado
    await cli.click('[aria-label="Filtrar linhas"] button:has-text("Com erro")'); // mostra só erros
    await cli.click('button[aria-label="Excluir linha 11"]');
    await cli.waitForFunction(() => document.querySelector('[aria-live=polite] strong')?.textContent?.startsWith('35'));
    log('linha 11 excluída;', await cli.textContent('[aria-live=polite]'));

    await cli.click('button:has-text("Criar 35 OS")');
    await cli.waitForSelector('text=35 OS criadas'); log('lote confirmado:', await cli.textContent('[role=status] p'));
    await cli.screenshot({ path: S + '/importar-concluido.png', fullPage: true });

    const { data: oss } = await adm.from('ordens_servico').select('aberta_em, lote_id, placa').eq('empresa_cliente_id', emp.id).not('lote_id', 'is', null);
    const horarios = new Set(oss.map((o) => o.aberta_em));
    log(`${oss.length} OS no banco, ${horarios.size} horário de abertura único`);
    if (oss.length !== 35 || horarios.size !== 1) falha('transação/aberta_em');
    const { data: ns } = await adm.from('notificacoes').select('tipo, titulo').eq('empresa_cliente_id', emp.id);
    log('notificações da Loja:', ns.map((n) => `${n.tipo}: ${n.titulo}`).join(' | '));
    if (ns.filter((n) => n.tipo === 'novo_lote').length !== 1 || ns.some((n) => n.tipo === 'nova_os')) falha('esperava 1 notificação de lote e nenhuma por OS');

    // Reenviar a mesma planilha: tudo vira "Já com OS"
    await cli.goto(B + '/app/importar');
    await cli.fill('#imp-nome', 'Mariana'); await cli.setInputFiles('input[name=arquivo]', process.env.PLANILHA);
    await cli.click('button:has-text("Ver prévia")'); await cli.waitForURL(/\?lote=/); await cli.waitForSelector('text=serão criadas');
    log('reenvio da planilha original:', (await cli.$$eval('[aria-label="Filtrar linhas"] button', (bs) => bs.map((x) => x.textContent))).join(' | '));
    log('botão Criar desabilitado:', await cli.isDisabled('button:has-text("Criar 1 OS"), button:has-text("Criar 0 OS"), button:has-text("Criar 2 OS")'));

    const loja = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await loja.goto(B + '/login'); await loja.fill('#login', AMB.gestor.login); await loja.fill('#senha', AMB.gestor.senha); await loja.click('button:has-text("Entrar")');
    await loja.waitForURL('**/loja');
    await loja.waitForSelector('text=36 em andamento'); log('fila da Loja com as 35 do lote + 1 anterior');
    await loja.goto(B + '/loja/importar'); await loja.waitForSelector('text=35 OS criadas'); log('Loja vê o lote nos envios recentes');
    await cli.setViewportSize({ width: 390, height: 844 }); await cli.screenshot({ path: S + '/importar-mobile.png', fullPage: true });
  } finally {
    await b.close();
    if (!process.env.MANTER) await limpar();
  }
})().then(async () => { if (!process.env.MANTER) await limparLoja(AMB.loja.id); }).catch(async (e) => { console.error('✘', e.message); if (AMB && !process.env.MANTER) await limparLoja(AMB.loja.id); if (!process.env.MANTER) await limpar(); process.exit(1); });
