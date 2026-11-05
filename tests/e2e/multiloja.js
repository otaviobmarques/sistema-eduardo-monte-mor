// Multi-Loja · Administrador cadastra Loja e Gestor; isolamento entre Lojas; cobrança e bloqueio por atraso.
// Uso: npm run build && npm start -- -p 3100; depois: E2E_ADMIN_SENHA=... S=pasta node tests/e2e/multiloja.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarLoja, criarUsuario, limparLoja, limparLojaPorNome, entrar } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const NOME_B = 'Loja E2E Campinas', NOME_A = 'Loja E2E Monte Mor';
const hoje = (d = 0) => new Date(Date.now() - 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);

(async () => {
  await limparLojaPorNome(NOME_B);
  const lojaA = await criarLoja(NOME_A);
  const b = await chromium.launch();
  let lojaB;
  try {
    const admin = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(admin, B, 'admin', process.env.E2E_ADMIN_SENHA ?? '', '/admin');
    log('admin entra direto em /admin');
    await admin.goto(B + '/loja'); await admin.waitForURL('**/admin'); log('admin não entra na área de Loja');

    // Cadastrar Loja B pelo painel
    await admin.goto(B + '/admin/lojas/nova');
    await admin.fill('#lj-nome', NOME_B); await admin.fill('#lj-cnpj', '11.444.777/0001-61');
    await admin.fill('#lj-responsavel', 'Franqueado Teste'); await admin.fill('#lj-email', 'franqueado@exemplo.com');
    await admin.fill('#lj-taxa_start', '1.500,00'); await admin.fill('#lj-plano_mensal', '299,90');
    await admin.fill('#lj-dias_tolerancia', '5');
    await admin.click('button:has-text("Cadastrar Loja")');
    await admin.waitForURL(/\/admin\/lojas\/[0-9a-f-]{36}\?nova=1/);
    const idB = admin.url().match(/lojas\/([0-9a-f-]{36})/)[1];
    lojaB = { id: idB };
    const { count: motivos } = await adm.from('motivos').select('id', { count: 'exact', head: true }).eq('loja_id', idB);
    const { data: cfg } = await adm.from('configuracoes').select('alerta1_horas').eq('loja_id', idB).single();
    log(`Loja B criada; nasce com ${motivos} motivos, serviço padrão e SLA (1º alerta ${cfg.alerta1_horas}h)`);
    // Gestor B
    await admin.fill('#acesso-login', 'gestor-e2e');
    await admin.click('button:has-text("Gerar acesso")');
    await admin.waitForSelector('dialog >> text=Acesso gerado');
    const senhaTemp = (await admin.textContent('dialog dd.font-mono')).trim();
    await admin.click('button:has-text("Já copiei")');
    log('acesso do Gestor gerado (senha temporária exibida uma vez)');
    await admin.screenshot({ path: S + '/admin-loja.png', fullPage: true });

    const gestor = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(gestor, B, 'gestor-e2e', senhaTemp, '/trocar-senha');
    await gestor.fill('#senha', 'gestor-nova-123'); await gestor.fill('#confirmacao', 'gestor-nova-123'); await gestor.click('button:has-text("Salvar e continuar")');
    await gestor.waitForURL('**/loja'); log('Gestor B trocou a senha e entrou na Loja');
    await gestor.goto(B + '/admin'); await gestor.waitForURL('**/loja'); log('Gestor não entra no /admin');

    // Isolamento: dados da Loja A invisíveis para a Loja B
    const { data: servA } = await adm.from('servicos').select('id').eq('loja_id', lojaA.id).eq('padrao', true).single();
    const { data: patioA } = await adm.from('patios').select('id').eq('loja_id', lojaA.id).limit(1).single();
    const { data: empA } = await adm.from('empresas_clientes').insert({ loja_id: lojaA.id, cnpj: '11222333000181', razao_social: 'Cliente da Loja A' }).select('id').single();
    const { data: osA, error: eA } = await adm.from('ordens_servico').insert({ loja_id: lojaA.id, numero: 1, empresa_cliente_id: empA.id, nome_solicitante: 'X', placa: 'AAA1A11', servico_id: servA.id, local_tipo: 'patio', patio_id: patioA.id, sla_horas: 48, prazo_em: new Date(Date.now() + 48 * 3600e3).toISOString() }).select('id').single();
    if (eA) falha(eA.message);
    const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await api.auth.signInWithPassword({ email: email('gestor-e2e'), password: 'gestor-nova-123' });
    const vistos = {};
    for (const t of ['ordens_servico', 'empresas_clientes', 'patios', 'servicos', 'motivos', 'lojas', 'configuracoes']) {
      const { data } = await api.from(t).select(t === 'lojas' ? 'id' : 'loja_id');
      vistos[t] = (data ?? []).filter((r) => (r.loja_id ?? r.id) !== idB).length;
    }
    if (Object.values(vistos).some((n) => n > 0)) falha('vazamento entre Lojas: ' + JSON.stringify(vistos));
    log('Gestor B não enxerga nenhum dado da Loja A (OS, clientes, pátios, serviços, motivos, Loja, configurações)');
    const { error: eRpc } = await api.rpc('alterar_etapa', { p_os: osA.id, p_etapa: 'em_execucao' });
    if (!eRpc?.message.includes('SEM_PERMISSAO')) falha('Gestor B alterou OS da Loja A');
    const { error: eSeed } = await api.rpc('semear_loja', { p_loja: lojaA.id });
    if (!eSeed?.message.includes('SEM_PERMISSAO')) falha('Gestor chamou semear_loja');
    log('Gestor B não consegue operar OS da Loja A nem semear Lojas');

    // Numeração por Loja: a 1ª OS da Loja B é a nº 1
    const { data: empB } = await api.from('empresas_clientes').insert({ cnpj: '11222333000181', razao_social: 'Mesmo CNPJ na Loja B' }).select('id, loja_id').single();
    if (empB?.loja_id !== idB) falha('cliente não herdou a Loja do Gestor');
    const { data: servB } = await api.from('servicos').select('id').eq('padrao', true).single();
    const { data: catB } = await api.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: patB, error: eP } = await api.from('patios').insert({ nome: 'Pátio Campinas', cidade: 'Campinas', uf: 'SP' }).select('id, loja_id').single();
    if (eP || patB.loja_id !== idB) falha('pátio do Gestor B: ' + (eP?.message ?? 'loja errada'));
    const { data: osB, error: eB } = await api.rpc('abrir_os', { p_empresa: empB.id, p_nome_solicitante: 'Teste', p_telefone: null, p_placa: 'BBB2B22', p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: catB.id, p_servico_id: servB.id, p_local_tipo: 'patio', p_patio_id: patB.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null });
    if (eB) falha(eB.message);
    log('mesmo CNPJ pode ser cliente de duas Lojas; 1ª OS da Loja B é a nº', osB[0].numero);
    const { error: eCruz } = await api.rpc('abrir_os', { p_empresa: empA.id, p_nome_solicitante: 'Teste', p_telefone: null, p_placa: 'CCC3C33', p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: catB.id, p_servico_id: servB.id, p_local_tipo: 'patio', p_patio_id: patB.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null });
    if (!eCruz?.message.includes('SEM_PERMISSAO')) falha('abriu OS para cliente de outra Loja');
    log('Gestor B não abre OS para cliente da Loja A');
    await criarUsuario({ login: 'cliente-e2e-b', senha: 'cliente-123456', perfil: 'cliente', lojaId: idB, empresaId: empB.id });

    // Cobrança manual → vencida dentro da tolerância (aviso) → além da tolerância (bloqueio) → baixa (desbloqueio)
    await admin.reload();
    await admin.click('button:has-text("Nova fatura manual")');
    await admin.selectOption('#fm-tipo', 'mensalidade'); await admin.fill('#fm-desc', 'Mensalidade teste'); await admin.fill('#fm-valor', '299,90'); await admin.fill('#fm-venc', hoje(-2));
    await admin.click('dialog button:has-text("Criar fatura")');
    await admin.waitForSelector('td:has-text("Mensalidade teste")'); log('fatura manual criada pelo admin');
    await adm.rpc('verificar_inadimplencia');
    await gestor.goto(B + '/loja'); await gestor.waitForSelector('text=será suspenso em');
    log('vencida dentro da tolerância: Gestor vê o aviso:', (await gestor.textContent('[role=alert] p')).trim());
    await gestor.screenshot({ path: S + '/loja-aviso-fatura.png' });
    await adm.from('faturas').update({ vencimento: hoje(-10) }).eq('loja_id', idB);
    const { data: bloqueadas } = await adm.rpc('verificar_inadimplencia');
    const { data: lb } = await adm.from('lojas').select('bloqueada, motivo_bloqueio').eq('id', idB).single();
    if (!lb.bloqueada) falha('não bloqueou');
    log(`job de inadimplência bloqueou ${bloqueadas} Loja: ${lb.motivo_bloqueio}`);
    await gestor.goto(B + '/loja'); await gestor.waitForURL(/\/login/); log('Gestor bloqueado sai do sistema');
    await gestor.fill('#login', 'gestor-e2e'); await gestor.fill('#senha', 'gestor-nova-123'); await gestor.click('button:has-text("Entrar")');
    await gestor.waitForSelector('form [role=alert]'); log('login do Gestor:', await gestor.textContent('form [role=alert]'));
    const cli = await (await b.newContext()).newPage();
    await cli.goto(B + '/login'); await cli.fill('#login', 'cliente-e2e-b'); await cli.fill('#senha', 'cliente-123456'); await cli.click('button:has-text("Entrar")');
    await cli.waitForSelector('form [role=alert]'); log('cliente da Loja bloqueada também é barrado:', await cli.textContent('form [role=alert]'));
    const apiCli = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await apiCli.auth.signInWithPassword({ email: email('cliente-e2e-b'), password: 'cliente-123456' });
    const { data: osCli } = await apiCli.from('ordens_servico').select('id');
    if (osCli?.length) falha('cliente de Loja bloqueada leu OS pela API');
    log('pela API, Loja bloqueada não lê nada (RLS)');

    await admin.reload(); await admin.waitForSelector('text=■ Bloqueada');
    admin.on('dialog', (d) => d.accept());
    await admin.click('button:has-text("Dar baixa")');
    await admin.waitForSelector('text=● Liberada'); log('admin deu baixa → Loja desbloqueada automaticamente');
    await gestor.fill('#senha', 'gestor-nova-123'); await gestor.click('button:has-text("Entrar")'); await gestor.waitForURL('**/loja'); log('Gestor volta a entrar');

    await admin.goto(B + '/admin'); await admin.screenshot({ path: S + '/admin-painel.png', fullPage: true });
    await admin.goto(B + '/admin/cobranca'); await admin.screenshot({ path: S + '/admin-cobranca.png', fullPage: true });
    await gestor.goto(B + '/loja/assinatura'); await gestor.screenshot({ path: S + '/loja-assinatura.png', fullPage: true });
  } finally {
    await b.close();
    if (!process.env.MANTER) { await limparLoja(lojaA.id); if (lojaB) await limparLoja(lojaB.id); }
  }
})().catch(async (e) => { console.error('✘', e.message); process.exit(1); });
