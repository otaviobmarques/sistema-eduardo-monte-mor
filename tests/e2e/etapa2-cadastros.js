const { chromium } = require('playwright');
// Uso: npm run build && npm start -- -p 3100; depois: E2E_ADMIN_SENHA=... S=pasta-de-prints node tests/e2e/etapa2-cadastros.js
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
(async () => {
  const b = await chromium.launch();
  const loja = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  loja.on('dialog', (d) => d.accept());
  const log = (...a) => console.log('✔', ...a);
  await loja.goto(B + '/login');
  await loja.fill('#login', 'admin'); await loja.fill('#senha', process.env.E2E_ADMIN_SENHA ?? ''); await loja.click('button:has-text("Entrar")');
  await loja.waitForURL('**/loja');

  // Pátios
  await loja.goto(B + '/loja/cadastros/patios');
  await loja.waitForSelector('text=Freitas Utinga');
  await loja.screenshot({ path: S + '/cad-patios.png', fullPage: true });
  log('pátios listados');
  // Vistoriador (limpa execução anterior)
  { const { createClient } = require('@supabase/supabase-js'); require('dotenv').config({ path: '.env.local', quiet: true });
    await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY).from('vistoriadores').delete().eq('nome', 'Vistoriador Teste E2E'); }
  await loja.goto(B + '/loja/cadastros/vistoriadores');
  await loja.click('button:has-text("Novo vistoriador")');
  await loja.click('dialog button:has-text("Salvar")');
  await loja.waitForSelector('dialog .erro-campo'); log('validação:', await loja.textContent('dialog .erro-campo'));
  await loja.fill('#vistoriadores-nome', 'Vistoriador Teste E2E');
  await loja.click('dialog button:has-text("Salvar")');
  await loja.waitForSelector('td:has-text("Vistoriador Teste E2E")'); log('vistoriador criado');
  // Serviço SLA > 48
  await loja.goto(B + '/loja/cadastros/servicos');
  await loja.click('button:has-text("Editar")');
  await loja.fill('#servicos-sla_horas', '60'); await loja.click('dialog button:has-text("Salvar")');
  await loja.waitForSelector('dialog .erro-campo'); log('SLA > 48 bloqueado:', await loja.textContent('dialog .erro-campo'));
  await loja.click('dialog button:has-text("Cancelar")');
  await loja.screenshot({ path: S + '/cad-servicos.png', fullPage: true });

  // Cliente novo com busca de CNPJ
  const { createClient } = require('@supabase/supabase-js');
  require('dotenv').config({ path: '.env.local', quiet: true });
  const adm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: velhos } = await adm.from('perfis_usuario').select('user_id, empresa_cliente_id').eq('login', 'teste-e2e');
  for (const v of velhos ?? []) { await adm.from('perfis_usuario').delete().eq('user_id', v.user_id); await adm.auth.admin.deleteUser(v.user_id); }
  await adm.from('acessos_log').delete().eq('login', 'teste-e2e');
  await adm.from('empresas_clientes').delete().eq('cnpj', '19131243000197');
  await adm.from('vistoriadores').delete().eq('nome', 'Vistoriador Teste E2E').neq('id', '00000000-0000-0000-0000-000000000000');
  await loja.goto(B + '/loja/clientes/novo');
  await loja.fill('#cli-cnpj', '11222333000182');
  await loja.click('button:has-text("Buscar CNPJ")');
  await loja.waitForSelector('#cli-cnpj-erro'); log('CNPJ inválido:', await loja.textContent('#cli-cnpj-erro'));
  await loja.fill('#cli-cnpj', '19.131.243/0001-97');
  await loja.click('button:has-text("Buscar CNPJ")');
  await loja.waitForFunction(() => document.querySelector('#cli-razao_social').value.length > 2, null, { timeout: 20000 });
  log('BrasilAPI preencheu:', await loja.inputValue('#cli-razao_social'), '|', await loja.inputValue('#cli-cidade'));
  await loja.fill('#cli-nome_fantasia', 'Teste E2E');
  await loja.fill('#cli-responsavel_acesso', 'Fulano Teste');
  await loja.click('button:has-text("Cadastrar cliente")');
  await loja.waitForURL(/\/loja\/clientes\/[0-9a-f-]{36}/);
  const clienteUrl = loja.url(); log('cliente criado', clienteUrl);
  await loja.fill('#acesso-login', 'teste-e2e');
  await loja.click('button:has-text("Gerar acesso")');
  await loja.waitForSelector('dialog >> text=Acesso gerado');
  const senha = (await loja.textContent('dialog dd.font-mono')).trim();
  log('senha temporária mostrada uma vez:', senha.length, 'caracteres');
  await loja.screenshot({ path: S + '/acesso-gerado.png' });
  await loja.click('button:has-text("Já copiei")');
  await loja.waitForSelector('text=Aguardando 1º acesso'); log('situação: Aguardando 1º acesso');
  await loja.screenshot({ path: S + '/cliente.png', fullPage: true });

  // Primeiro acesso do cliente
  const cli = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await cli.goto(B + '/login');
  await cli.fill('#login', 'teste-e2e'); await cli.fill('#senha', senha); await cli.click('button:has-text("Entrar")');
  await cli.waitForURL('**/trocar-senha'); log('cliente obrigado a trocar senha');
  await cli.goto(B + '/app'); await cli.waitForURL('**/trocar-senha'); log('não acessa /app sem trocar');
  await cli.fill('#senha', 'nova-senha-123'); await cli.fill('#confirmacao', 'nova-senha-123'); await cli.click('button:has-text("Salvar e continuar")');
  await cli.waitForURL('**/app'); log('cliente entrou no painel');
  await cli.screenshot({ path: S + '/cliente-painel.png' });
  await cli.goto(B + '/loja'); await cli.waitForURL('**/app'); log('cliente não acessa /loja');

  // Bloquear
  await loja.reload();
  await loja.waitForSelector('text=● Ativo'); log('situação: Ativo');
  await loja.click('button:has-text("Bloquear acesso")');
  await loja.waitForSelector('text=■ Bloqueado'); log('bloqueado');
  await cli.goto(B + '/app'); await cli.waitForURL(/\/login/); log('cliente bloqueado foi expulso ->', cli.url());
  await cli.fill('#login', 'teste-e2e'); await cli.fill('#senha', 'nova-senha-123'); await cli.click('button:has-text("Entrar")');
  await cli.waitForSelector('form [role=alert]'); log('login bloqueado:', await cli.textContent('form [role=alert]'));
  await loja.click('button:has-text("Desbloquear acesso")');
  await loja.waitForSelector('text=● Ativo'); log('desbloqueado');
  await cli.fill('#senha', 'nova-senha-123'); await cli.click('button:has-text("Entrar")'); await cli.waitForURL('**/app'); log('cliente entra de novo');
  // Lista
  await loja.goto(B + '/loja/clientes'); await loja.screenshot({ path: S + '/clientes.png' });
  await loja.goto(B + '/loja/configuracoes'); await loja.screenshot({ path: S + '/config.png', fullPage: true });
  await loja.setViewportSize({ width: 390, height: 844 }); await loja.goto(B + '/loja/clientes'); await loja.screenshot({ path: S + '/clientes-mobile.png' });
  await b.close();
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
