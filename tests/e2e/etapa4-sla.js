// Etapa 4 · alertas de SLA, pausas, trava de atraso e justificativa.
// Uso: npm run build && npm start -- -p 3100; depois: E2E_ADMIN_SENHA=... S=pasta node tests/e2e/etapa4-sla.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local', quiet: true });
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const adm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CNPJ = '11222333000181';
const H = 3600_000;
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

async function limpar() {
  const { data: e } = await adm.from('empresas_clientes').select('id').eq('cnpj', CNPJ).maybeSingle();
  if (!e) return;
  const { data: oss } = await adm.from('ordens_servico').select('id').eq('empresa_cliente_id', e.id);
  const ids = (oss ?? []).map((o) => o.id);
  if (ids.length) {
    await adm.from('notificacoes').delete().in('os_id', ids);
    await adm.from('ordens_servico').delete().in('id', ids);
    await adm.from('auditoria').delete().in('registro_id', ids);
  }
  await adm.from('empresas_clientes').delete().eq('id', e.id);
  await adm.from('auditoria').delete().eq('registro_id', e.id);
}

const cron = async () => {
  const r = await fetch(B + '/api/cron/sla', { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  if (!r.ok) falha('cron ' + r.status);
  return r.json();
};
const notifs = async (osId) => (await adm.from('notificacoes').select('destino, tipo, titulo').eq('os_id', osId).order('criada_em')).data;

(async () => {
  await limpar();
  const sem = await fetch(B + '/api/cron/sla', { method: 'POST' });
  if (sem.status !== 401) falha('cron sem segredo deveria ser 401');
  log('endpoint protegido: sem segredo → 401');

  const { data: emp } = await adm.from('empresas_clientes').insert({ cnpj: CNPJ, razao_social: 'E2E SLA Ltda', nome_fantasia: 'E2E SLA' }).select('id').single();
  const { data: serv } = await adm.from('servicos').select('id').eq('padrao', true).single();
  const { data: patio } = await adm.from('patios').select('id').limit(1).single();
  const nova = async (placa, horasAtras) => {
    const aberta = new Date(Date.now() - horasAtras * H);
    const { data, error } = await adm.from('ordens_servico').insert({
      empresa_cliente_id: emp.id, nome_solicitante: 'Teste SLA', placa, servico_id: serv.id, patio_id: patio.id, local_tipo: 'patio',
      sla_horas: 48, aberta_em: aberta.toISOString(), prazo_em: new Date(aberta.getTime() + 48 * H).toISOString(), marca_modelo: 'Teste',
    }).select('id, numero').single();
    if (error) falha(error.message);
    return data;
  };

  const os = await nova('SLA1A11', 25);
  let r = await cron();
  let n = await notifs(os.id);
  if (n.length !== 2 || n[0].tipo !== 'alerta_24h') falha('esperava alerta de 24h para loja e cliente: ' + JSON.stringify(n));
  log('24h → alerta para Loja e cliente:', n[0].titulo, '| verificadas', r.verificadas);
  await cron();
  if ((await notifs(os.id)).length !== 2) falha('alerta duplicado');
  log('segunda execução não duplica');

  await adm.from('ordens_servico').update({ aberta_em: new Date(Date.now() - 41 * H).toISOString() }).eq('id', os.id);
  await cron(); n = await notifs(os.id);
  if (n.at(-1).tipo !== 'faltam_8h') falha('esperava faltam_8h');
  log('faltando 8h →', n.at(-1).titulo);

  await adm.from('ordens_servico').update({ aberta_em: new Date(Date.now() - 49 * H).toISOString(), prazo_em: new Date(Date.now() - 1 * H).toISOString() }).eq('id', os.id);
  await cron(); n = await notifs(os.id);
  if (n.at(-1).tipo !== 'vencida') falha('esperava vencida');
  log('vencida →', n.at(-1).titulo, '| total de avisos:', n.length);

  const os2 = await nova('SLA2B22', 60);
  await cron(); n = await notifs(os2.id);
  if (n.length !== 2 || n[0].tipo !== 'vencida') falha('vários marcos: esperava só vencida ' + JSON.stringify(n));
  log('OS que cruzou todos os marcos de uma vez recebe só "vencida"');

  // Pausa: o tempo parado estende o prazo
  const os3 = await nova('SLA3C33', 10);
  const ref = '00000000-0000-4000-8000-0000000000aa';
  let e = (await adm.rpc('sla_abrir_pausa', { p_os: os3.id, p_origem: 'pendencia', p_ref: ref })).error; if (e) falha(e.message);
  await adm.from('sla_pausas').update({ inicio: new Date(Date.now() - 5 * H).toISOString() }).eq('os_id', os3.id);
  await adm.from('ordens_servico').update({ pausado_desde: new Date(Date.now() - 5 * H).toISOString() }).eq('id', os3.id);
  e = (await adm.rpc('sla_fechar_pausa', { p_os: os3.id, p_ref: ref })).error; if (e) falha(e.message);
  const { data: p3 } = await adm.from('ordens_servico').select('aberta_em, prazo_em, total_pausado, pausado_desde').eq('id', os3.id).single();
  const extra = (new Date(p3.prazo_em) - new Date(p3.aberta_em)) / H;
  if (Math.abs(extra - 53) > 0.05 || p3.pausado_desde) falha('prazo após pausa: ' + extra);
  log(`pausa de 5h → prazo = abertura + ${extra.toFixed(1)}h, tempo pausado ${p3.total_pausado}`);

  // Trava: vencida não conclui sem justificativa
  e = (await adm.from('ordens_servico').update({ status: 'vistoriado', concluida_em: new Date().toISOString() }).eq('id', os2.id)).error;
  if (!e?.message.includes('JUSTIFICATIVA_OBRIGATORIA')) falha('trava não funcionou');
  log('concluir OS atrasada sem justificativa → bloqueado pelo banco');

  const b = await chromium.launch();
  try {
    const loja = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await loja.goto(B + '/login'); await loja.fill('#login', 'admin'); await loja.fill('#senha', process.env.E2E_ADMIN_SENHA ?? ''); await loja.click('button:has-text("Entrar")');
    await loja.waitForURL('**/loja');
    await loja.waitForSelector('text=Vencidas');
    const ordem = await loja.$$eval('tbody tr', (trs) => trs.map((t) => t.textContent));
    log('fila por urgência, 1ª linha:', ordem[0].match(/OS \d+/)?.[0], '(vencida há mais tempo)');
    await loja.screenshot({ path: S + '/fila-sla.png', fullPage: true });
    await loja.goto(B + `/loja/os/${os2.numero}`);
    await loja.waitForSelector('text=OS atrasada');
    await loja.screenshot({ path: S + '/ficha-atrasada.png', fullPage: true });
    await loja.click('button:has-text("Justificar atraso")');
    await loja.click('dialog button:has-text("Salvar justificativa")');
    await loja.waitForSelector('dialog .erro-campo'); log('justificativa exige motivo:', await loja.textContent('dialog .erro-campo'));
    await loja.selectOption('#ja-motivo', { index: 1 });
    await loja.fill('#ja-texto', 'Pátio fechado por dois dias.');
    await loja.click('dialog button:has-text("Salvar justificativa")');
    await loja.waitForSelector('h2:has-text("Justificativa de atraso")'); log('justificativa registrada na ficha');
    await loja.waitForSelector('text=Atraso justificado'); log('linha do tempo: Atraso justificado');
    await loja.goto(B + `/loja/os/${os3.numero}`);
    await loja.waitForSelector('text=Pausas'); await loja.screenshot({ path: S + '/ficha-pausa.png' , fullPage: true });
  } finally { await b.close(); }

  e = (await adm.from('ordens_servico').update({ status: 'vistoriado', concluida_em: new Date().toISOString() }).eq('id', os2.id)).error;
  if (e) falha('com justificativa deveria concluir: ' + e.message);
  log('com justificativa a OS atrasada pode ser concluída');
  if (!process.env.MANTER) await limpar();
})().catch(async (e) => { console.error('✘', e.message); if (!process.env.MANTER) await limpar(); process.exit(1); });
