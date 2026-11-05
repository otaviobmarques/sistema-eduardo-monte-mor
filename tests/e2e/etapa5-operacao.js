// Etapa 5 · agendamento, frustração, pendências, cancelamento e laudo (Loja e cliente).
// Uso: npm run build && npm start -- -p 3100; depois: E2E_ADMIN_SENHA=... S=pasta node tests/e2e/etapa5-operacao.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local', quiet: true });
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const adm = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CNPJ = '11222333000181', LOGIN = 'e2e-op', SENHA = 'e2e-senha-123', VIST = 'Vistoriador E2E';
const log = (...a) => console.log('✔', ...a);
const { lojaComGestor, limparLoja, proximoNumero } = require('./apoio');
let AMB;
const falha = (m) => { throw new Error(m); };
const pdf = (t) => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n% ${t}\n%%EOF`);

async function limpar() {
  const { data: e } = await adm.from('empresas_clientes').select('id').eq('cnpj', CNPJ).maybeSingle();
  if (e) {
    const { data: oss } = await adm.from('ordens_servico').select('id').eq('empresa_cliente_id', e.id);
    const ids = (oss ?? []).map((o) => o.id);
    if (ids.length) {
      const { data: an } = await adm.from('anexos').select('bucket, storage_path').in('os_id', ids);
      for (const b of ['laudos', 'anexos']) { const l = (an ?? []).filter((a) => a.bucket === b).map((a) => a.storage_path); if (l.length) await adm.storage.from(b).remove(l); }
      await adm.from('notificacoes').delete().in('os_id', ids);
      await adm.from('ordens_servico').delete().in('id', ids);
      await adm.from('auditoria').delete().in('registro_id', ids);
    }
  }
  const { data: p } = await adm.from('perfis_usuario').select('user_id').eq('login', LOGIN).maybeSingle();
  if (p) { await adm.from('perfis_usuario').delete().eq('user_id', p.user_id); await adm.auth.admin.deleteUser(p.user_id); }
  if (e) { await adm.from('empresas_clientes').delete().eq('id', e.id); await adm.from('auditoria').delete().eq('registro_id', e.id); }
  await adm.from('vistoriadores').delete().eq('nome', VIST);
  await adm.from('acessos_log').delete().eq('login', LOGIN);
}

(async () => {
  AMB = await lojaComGestor('Loja E2E Etapa 5', 'gestor-etapa5');
  await limpar();
  const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: AMB.loja.id, cnpj: CNPJ, razao_social: 'E2E Operação Ltda', nome_fantasia: 'E2E Operação' }).select('id').single();
  const { data: u } = await adm.auth.admin.createUser({ email: `${LOGIN}@${process.env.LOGIN_EMAIL_DOMAIN}`, password: SENHA, email_confirm: true });
  await adm.from('perfis_usuario').insert({ user_id: u.user.id, perfil: 'cliente', loja_id: AMB.loja.id, empresa_cliente_id: emp.id, login: LOGIN, nome_exibicao: 'E2E Operação', deve_trocar_senha: false });
  await adm.from('vistoriadores').insert({ loja_id: AMB.loja.id, nome: VIST });

  // Cliente abre 3 OS pela API (mesma função da tela)
  const cliApi = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  await cliApi.auth.signInWithPassword({ email: `${LOGIN}@${process.env.LOGIN_EMAIL_DOMAIN}`, password: SENHA });
  const { data: serv } = await adm.from('servicos').select('id').eq('padrao', true).eq('loja_id', AMB.loja.id).single();
  const { data: cat } = await adm.from('categorias_veiculo').select('id').eq('nome', 'Carro').single();
  const { data: patio } = await adm.from('patios').select('id').eq('nome', 'Freitas Utinga').eq('loja_id', AMB.loja.id).single();
  const abrir = async (placa) => {
    const { data, error } = await cliApi.rpc('abrir_os', { p_empresa: null, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null,
      p_marca_modelo: 'Carro ' + placa, p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: patio.id,
      p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null });
    if (error) falha(error.message); return data[0];
  };
  const A = await abrir('OPA1A11'), Bos = await abrir('OPB2B22'), C = await abrir('OPC3C33');
  log('cliente abriu 3 OS:', A.numero, Bos.numero, C.numero);

  const b = await chromium.launch();
  try {
    const loja = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await loja.goto(B + '/login'); await loja.fill('#login', AMB.gestor.login); await loja.fill('#senha', AMB.gestor.senha); await loja.click('button:has-text("Entrar")');
    await loja.waitForURL('**/loja');
    const cli = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await cli.goto(B + '/login'); await cli.fill('#login', LOGIN); await cli.fill('#senha', SENHA); await cli.click('button:has-text("Entrar")');
    await cli.waitForURL('**/app');

    // Agendar
    await loja.goto(B + `/loja/os/${A.numero}`);
    await loja.click('section[aria-label="Ações da OS"] button:has-text("Agendar")');
    await loja.selectOption('#ag-vist', { label: VIST });
    await loja.click('dialog button:has-text("Agendar")');
    await loja.waitForSelector('text=Versão 1 (atual)'); log('agendada; etapa →', await loja.inputValue('#etapa'));
    await loja.click('section[aria-label="Ações da OS"] button:has-text("Reagendar")');
    await loja.click('dialog button:has-text("Reagendar")');
    await loja.waitForSelector('dialog .erro-campo'); log('reagendar exige motivo:', await loja.textContent('dialog .erro-campo'));
    await loja.selectOption('#ag-motivo', { index: 1 });
    await loja.click('dialog button:has-text("Reagendar")');
    await loja.waitForSelector('text=Versão 2 (atual)'); log('reagendada: versão 2 atual, versão 1 no histórico');
    await loja.goto(B + '/loja/agenda'); await loja.waitForSelector(`text=OPA1A11`); log('aparece na agenda da semana');
    await loja.screenshot({ path: S + '/agenda.png', fullPage: true });

    // Frustrar
    await loja.goto(B + `/loja/os/${A.numero}`);
    await loja.click('button:has-text("Registrar frustração")');
    await loja.click('dialog button:has-text("Registrar frustração")');
    await loja.waitForSelector('dialog .erro-campo'); log('frustração exige motivo e descrição');
    await loja.selectOption('#fr-motivo', { label: 'Falta de autorização do pátio' });
    await loja.fill('#fr-desc', 'Pátio não liberou sem autorização da Creditas.');
    await loja.click('dialog button:has-text("Registrar frustração")');
    await loja.waitForSelector('text=Pausado ·'); log('frustrada: SLA pausado e pendência aberta');
    await loja.screenshot({ path: S + '/ficha-frustrada.png', fullPage: true });

    // Cliente responde
    await cli.goto(B + '/app'); await cli.waitForSelector('text=1 pendência aguarda você'); log('painel do cliente avisa a pendência');
    await cli.goto(B + '/app/pendencias');
    await cli.fill('textarea', 'Autorização enviada ao pátio às 10h.'); await cli.click('button:has-text("Enviar resposta")');
    await cli.waitForSelector('text=Resposta enviada à Auto Visão.'); log('cliente respondeu a pendência');

    // Loja resolve
    await loja.goto(B + '/loja/pendencias'); await loja.waitForSelector('text=Autorização enviada ao pátio');
    await loja.screenshot({ path: S + '/pendencias.png', fullPage: true });
    await loja.click('tbody button:has-text("Resolver")'); await loja.fill('dialog textarea', 'Pátio liberou.'); await loja.click('dialog button:has-text("Resolver")');
    await loja.waitForSelector('text=Nenhuma pendência aberta'); log('Loja resolveu');
    await loja.goto(B + `/loja/os/${A.numero}`);
    await loja.waitForSelector('text=Vence em'); log('OS voltou para A vistoriar; relógio retomado; etapa:', await loja.inputValue('#etapa'));

    // Laudo
    await loja.click('section[aria-label="Ações da OS"] button:has-text("Enviar laudo")');
    await loja.setInputFiles('dialog input[type=file]', { name: 'laudo-opa.pdf', mimeType: 'application/pdf', buffer: pdf('v1') });
    await loja.click('dialog button:has-text("Enviar laudo")');
    await loja.waitForSelector('text=laudo-opa.pdf · versão 1'); log('laudo enviado: OS vistoriada');
    await loja.click('button:has-text("Nova versão do laudo")');
    await loja.setInputFiles('dialog input[type=file]', { name: 'laudo-opa-v2.pdf', mimeType: 'application/pdf', buffer: pdf('v2') });
    await loja.click('dialog button:has-text("Enviar laudo")');
    await loja.waitForSelector('text=laudo-opa-v2.pdf · versão 2'); log('nova versão do laudo');
    await loja.screenshot({ path: S + '/ficha-vistoriada.png', fullPage: true });

    // Pendência sem frustrar bloqueia laudo
    await loja.goto(B + `/loja/os/${Bos.numero}`);
    await loja.click('section[aria-label="Ações da OS"] button:has-text("Pendência")');
    await loja.fill('#pe-desc', 'Falta CRLV.'); await loja.click('dialog button:has-text("Abrir pendência")');
    await loja.waitForSelector('text=Falta CRLV.');
    log('laudo bloqueado com pendência aberta:', await loja.isDisabled('section[aria-label="Ações da OS"] button:has-text("Enviar laudo")'));

    // Cliente: laudo atual e cancelamento
    await cli.goto(B + `/app/os/${A.numero}`);
    await cli.waitForSelector('text=laudo-opa-v2.pdf · versão 2');
    const anexosCli = await cli.$$eval('#anx-titulo + ul li', (l) => l.map((x) => x.textContent));
    if (anexosCli.some((t) => t.includes('laudo-opa.pdf'))) falha('cliente não deveria ver a versão antiga');
    log('cliente vê só a versão atual do laudo');
    const [dl] = await Promise.all([cli.waitForEvent('download'), cli.click('section:has-text("Laudo") button:has-text("Baixar") >> nth=0')]);
    log('download por URL assinada:', dl.suggestedFilename());
    await cli.goto(B + `/app/os/${C.numero}`);
    await cli.click('button:has-text("Cancelar OS")'); await cli.click('dialog button:has-text("Cancelar OS")');
    await cli.waitForSelector('dialog .erro-campo'); log('cancelamento exige nome:', await cli.textContent('dialog .erro-campo'));
    await cli.fill('#ca-nome', 'Bruno Lima'); await cli.selectOption('#ca-motivo', { index: 1 }); await cli.fill('#ca-desc', 'Veículo vendido.');
    await cli.click('dialog button:has-text("Cancelar OS")');
    await cli.waitForSelector('text=Cancelada há'); log('cliente cancelou; mostra há quanto tempo');
    await cli.screenshot({ path: S + '/cliente-cancelada.png', fullPage: true });

    const { data: ns } = await adm.from('notificacoes').select('tipo, destino').in('os_id', [A.id, Bos.id, C.id]);
    const cont = {}; for (const n of ns) cont[`${n.tipo}/${n.destino}`] = (cont[`${n.tipo}/${n.destino}`] ?? 0) + 1;
    log('notificações geradas:', JSON.stringify(cont));
    await loja.setViewportSize({ width: 390, height: 844 }); await loja.goto(B + '/loja/agenda?visao=dia'); await loja.screenshot({ path: S + '/agenda-mobile.png', fullPage: true });
  } finally {
    await b.close();
    if (!process.env.MANTER) await limpar();
  }
})().then(async () => { if (!process.env.MANTER) await limparLoja(AMB.loja.id); }).catch(async (e) => { console.error('✘', e.message); if (AMB && !process.env.MANTER) await limparLoja(AMB.loja.id); if (!process.env.MANTER) await limpar(); process.exit(1); });
