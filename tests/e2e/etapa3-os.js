// Etapa 3 · Nova OS, duplicidade, ficha, linha do tempo e auditoria.
// Uso: npm run build && npm start -- -p 3100; depois: E2E_ADMIN_SENHA=... S=pasta-de-prints node tests/e2e/etapa3-os.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local', quiet: true });
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const adm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CNPJ = '11222333000181', LOGIN = 'e2e-os', SENHA = 'e2e-senha-123', PLACA = 'EUI6776';
const log = (...a) => console.log('✔', ...a);
const { lojaComGestor, limparLoja, proximoNumero, semPopupLeitura } = require('./apoio');
let AMB;

async function limpar() {
  const { data: e } = await adm.from('empresas_clientes').select('id').eq('cnpj', CNPJ).maybeSingle();
  const { data: p } = await adm.from('perfis_usuario').select('user_id').eq('login', LOGIN).maybeSingle();
  if (e) {
    const { data: oss } = await adm.from('ordens_servico').select('id').eq('empresa_cliente_id', e.id);
    const ids = (oss ?? []).map((o) => o.id);
    if (ids.length) {
      const { data: an } = await adm.from('anexos').select('storage_path').in('os_id', ids);
      if (an?.length) await adm.storage.from('anexos').remove(an.map((a) => a.storage_path));
      await adm.from('notificacoes').delete().in('os_id', ids);
      await adm.from('ordens_servico').delete().in('id', ids);
      await adm.from('auditoria').delete().in('registro_id', ids);
    }
  }
  if (p) { await adm.from('perfis_usuario').delete().eq('user_id', p.user_id); await adm.auth.admin.deleteUser(p.user_id); }
  if (e) { await adm.from('empresas_clientes').delete().eq('id', e.id); await adm.from('auditoria').delete().eq('registro_id', e.id); }
  await adm.from('acessos_log').delete().eq('login', LOGIN);
}

(async () => {
  AMB = await lojaComGestor('Loja E2E Etapa 3', 'gestor-etapa3');
  await limpar();
  const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: AMB.loja.id, cnpj: CNPJ, razao_social: 'E2E Veículos Ltda', nome_fantasia: 'E2E Veículos', sla_horas: 48 }).select('id').single();
  const { data: u } = await adm.auth.admin.createUser({ email: `${LOGIN}@${process.env.LOGIN_EMAIL_DOMAIN}`, password: SENHA, email_confirm: true });
  await adm.from('perfis_usuario').insert({ user_id: u.user.id, perfil: 'cliente', loja_id: AMB.loja.id, empresa_cliente_id: emp.id, login: LOGIN, nome_exibicao: 'E2E Veículos', deve_trocar_senha: false });

  const b = await chromium.launch();
  try {
    const cli = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await cli.goto(B + '/login'); await cli.fill('#login', LOGIN); await cli.fill('#senha', SENHA); await cli.click('button:has-text("Entrar")');
    await cli.waitForURL('**/app');
    await cli.goto(B + '/app/nova-os');
    await cli.click('button:has-text("Abrir OS")');
    await cli.waitForSelector('#os-nome_solicitante-msg.erro-campo');
    log('validação sem dados:', await cli.textContent('#os-nome_solicitante-msg'), '|', await cli.textContent('#os-placa-msg'));
    await cli.fill('#os-renavam', '639018806');
    await cli.waitForSelector('#os-renavam-msg.erro-campo'); log('Renavam ao vivo:', await cli.textContent('#os-renavam-msg'));
    await cli.fill('#os-renavam', '639018807');
    await cli.waitForSelector('#os-renavam-msg.text-ok'); log('Renavam ao vivo:', await cli.textContent('#os-renavam-msg'));
    await cli.fill('#os-nome_solicitante', 'Ana Souza');
    await cli.fill('#os-telefone', '11988887777');
    await cli.fill('#os-placa', 'eui-6776');
    await cli.fill('#os-marca_modelo', 'Fiat Uno Way 1.0');
    await cli.fill('#os-ano', '2015/2016');
    await cli.selectOption('#os-patio_id', { label: 'Freitas Utinga' });
    await cli.fill('#os-observacao', 'Veículo na fileira B.');
    await cli.setInputFiles('input#os-anexos', { name: 'autorizacao.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await cli.screenshot({ path: S + '/nova-os.png', fullPage: true });
    await cli.click('button:has-text("Abrir OS")');
    await cli.waitForURL(/\/app\/os\/\d+\?nova=1/);
    const numero = cli.url().match(/os\/(\d+)/)[1];
    log('OS aberta nº', numero, '|', await cli.textContent('[role=status]'));
    await cli.waitForSelector('text=OS aberta'); log('linha do tempo: OS aberta');
    await cli.waitForSelector('text=autorizacao.pdf'); log('anexo enviado');
    await cli.screenshot({ path: S + '/ficha-cliente.png', fullPage: true });

    await cli.goto(B + '/app/nova-os');
    await cli.fill('#os-placa', PLACA);
    await cli.waitForSelector(`text=Esta placa já tem a OS nº ${numero} em aberto`); log('duplicidade bloqueada com nº', numero);
    log('botão Abrir OS desabilitado:', await cli.isDisabled('aside button:has-text("Abrir OS")'));
    await cli.goto(B + '/app/os/999999999'); log('OS inexistente/alheia:', await cli.textContent('h1, h2'));

    const loja = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await semPopupLeitura(loja);
    await loja.goto(B + '/login'); await loja.fill('#login', AMB.gestor.login); await loja.fill('#senha', AMB.gestor.senha); await loja.click('button:has-text("Entrar")');
    await loja.waitForURL('**/loja');
    await loja.waitForSelector(`text=OS ${numero}`); log('OS na fila da Loja');
    await loja.screenshot({ path: S + '/fila.png', fullPage: true });
    await loja.goto(B + `/loja/os/${numero}`);
    await loja.waitForSelector('text=Solicitante: Ana Souza'); log('auditoria grava o solicitante');
    await loja.click('button:has-text("Completar dados")');
    await loja.fill('#ve-cor', 'Prata'); await loja.click('dialog button:has-text("Salvar")');
    await loja.waitForSelector('td:has-text("Prata")'); log('cor completada pela Loja e auditada');
    await loja.waitForSelector('text=Dados do veículo atualizados'); log('linha do tempo registra a edição');
    await loja.screenshot({ path: S + '/ficha-loja.png', fullPage: true });

    await loja.goto(B + `/loja/os/nova?cliente=${emp.id}`);
    await loja.fill('#os-nome_solicitante', 'Carlos (telefone)');
    await loja.fill('#os-placa', 'ABC1D23'); await loja.fill('#os-marca_modelo', 'VW Gol');
    await loja.check('input[name=local] >> nth=1');
    await loja.fill('#os-endereco', 'Rua das Flores, 100'); await loja.fill('#os-cidade', 'Campinas');
    await loja.click('aside button:has-text("Abrir OS")');
    await loja.waitForURL(/\/loja\/os\/\d+\?nova=1/); log('Loja abriu OS para cliente em endereço:', loja.url().match(/os\/(\d+)/)[1]);

    await loja.goto(B + `/loja/auditoria?q=${PLACA}`);
    await loja.waitForSelector('td:has-text("Prata")'); log('busca na auditoria por placa');
    await cli.goto(B + '/app'); await cli.waitForSelector('text=ABC1D23'); log('cliente vê as 2 OS no painel');
    await cli.screenshot({ path: S + '/painel-cliente.png', fullPage: true });
    await cli.setViewportSize({ width: 390, height: 844 }); await cli.goto(B + '/app/nova-os'); await cli.screenshot({ path: S + '/nova-os-mobile.png', fullPage: true });
    await cli.goto(B + `/app/os/${numero}`); await cli.screenshot({ path: S + '/ficha-mobile.png', fullPage: true });
  } finally {
    await b.close();
    if (!process.env.MANTER) await limpar();
  }
})().then(async () => { if (!process.env.MANTER) await limparLoja(AMB.loja.id); }).catch(async (e) => { console.error('✘', e.message); if (AMB && !process.env.MANTER) await limparLoja(AMB.loja.id); process.exit(1); });
