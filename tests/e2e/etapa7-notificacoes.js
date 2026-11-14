// Etapa 7 · Realtime, toast, som a cada 20 s, contador/título, vista_em/vista_por, isolamento e escalonamento.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/etapa7-notificacoes.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarLoja, criarUsuario, limparLoja, entrar } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Conta os bipes: substitui o AudioContext por um que registra cada som
const CONTA_SOM = `(() => { window.__bipes = 0; const O = window.AudioContext;
  window.AudioContext = class extends O { createOscillator() { const o = super.createOscillator(); const st = o.start.bind(o); o.start = (...a) => { window.__bipes++; return st(...a); }; return o; } }; })();`;

(async () => {
  const L1 = await criarLoja('Loja E2E Etapa 7'), L2 = await criarLoja('Loja E2E Etapa 7 Outra');
  await criarUsuario({ login: 'gestor-etapa7', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L1.id });
  await criarUsuario({ login: 'gestor-etapa7b', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L2.id });
  const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L1.id, cnpj: '11222333000181', razao_social: 'Cliente E7', nome_fantasia: 'Cliente E7' }).select('id').single();
  await criarUsuario({ login: 'cliente-etapa7', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L1.id, empresaId: emp.id });
  const b = await chromium.launch();
  try {
    const ctxLoja = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctxLoja.addInitScript(CONTA_SOM);
    const loja = await ctxLoja.newPage();
    await entrar(loja, B, 'gestor-etapa7', 'gestor-senha-123', '/loja');
    await loja.click('button:has-text("Ativar alertas sonoros")'); log('Gestor ativou os alertas sonoros (uma vez por sessão)');
    await loja.click('button:has-text("Agora não")').catch(() => {});
    const outra = await (await b.newContext()).newPage();
    await entrar(outra, B, 'gestor-etapa7b', 'gestor-senha-123', '/loja');
    const cli = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await entrar(cli, B, 'cliente-etapa7', 'cliente-senha-123', '/app');
    await cli.click('button:has-text("Agora não")').catch(() => {});
    await espera(2500); // canais Realtime conectando

    // Cliente abre OS (mesma função da tela) → Loja recebe sem recarregar
    const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await api.auth.signInWithPassword({ email: email('cliente-etapa7'), password: 'cliente-senha-123' });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L1.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L1.id).limit(1).single();
    const bipes0 = await loja.evaluate(() => window.__bipes);
    const t0 = Date.now();
    const { data: os, error } = await api.rpc('abrir_os', { p_empresa: null, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: 'NTF1A11', p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null });
    if (error) falha(error.message);
    await loja.waitForSelector('[role=alert]:has-text("Nova OS · Cliente E7 · NTF1A11")', { timeout: 15000 });
    log(`toast escuro na Loja em ${((Date.now() - t0) / 1000).toFixed(1)} s, sem recarregar a página`);
    await loja.waitForSelector('tbody >> text=NTF1A11', { timeout: 10000 }); log('fila atualizou sozinha com a nova OS');
    log('título da aba:', await loja.evaluate(() => document.title.slice(0, 30)), '| sino:', await loja.getAttribute('button[aria-haspopup=dialog]', 'aria-label'));
    log('contador no menu da Fila:', await loja.textContent('nav a[href="/loja"] span[aria-label]'));
    const bipes1 = await loja.evaluate(() => window.__bipes);
    if (bipes1 <= bipes0) falha('não tocou o som');
    await loja.screenshot({ path: S + '/notif-toast.png' });
    await espera(21000);
    const bipes2 = await loja.evaluate(() => window.__bipes);
    if (bipes2 <= bipes1) falha('som não repetiu após 20 s');
    log(`som tocou na chegada e repetiu após 20 s (${bipes2 - bipes0} tons)`);
    if (await outra.locator('[role=alert]:has-text("NTF1A11")').count()) falha('outra Loja recebeu o aviso');
    log('a outra Loja não recebeu nada');

    // Abrir → vista_em/vista_por, para o som e o título
    await loja.click('[role=alert] button:has-text("Ver OS")');
    await loja.waitForURL(`**/loja/os/${os[0].numero}`);
    await espera(1500);
    const { data: n } = await adm.from('notificacoes').select('vista_em, vista_por, criada_em').eq('os_id', os[0].id).eq('tipo', 'nova_os').single();
    if (!n.vista_em || !n.vista_por) falha('vista_em/vista_por não gravados');
    log(`notificação marcada como vista (tempo até o atendimento: ${((new Date(n.vista_em) - new Date(n.criada_em)) / 1000).toFixed(0)} s)`);
    // Abrir não basta: o som segue até alguém confirmar a leitura no pop-up (14/11/2026)
    const bipes3 = await loja.evaluate(() => window.__bipes);
    await espera(21000);
    if ((await loja.evaluate(() => window.__bipes)) <= bipes3) falha('som parou sem confirmar a leitura');
    await loja.check('[data-teste=popup-leitura] [data-teste=item-leitura]:has-text("NTF1A11") input[type=checkbox]');
    await loja.click('[data-teste=popup-leitura] button:has-text("Confirmar leitura")');
    await loja.waitForSelector('[data-teste=popup-leitura]', { state: 'detached', timeout: 15000 });
    const bipes4 = await loja.evaluate(() => window.__bipes);
    await espera(21000);
    if ((await loja.evaluate(() => window.__bipes)) !== bipes4) falha('som continuou após confirmar a leitura');
    log('som seguiu até a confirmação de leitura no pop-up; depois parou e o título voltou ao normal:', await loja.evaluate(() => document.title.slice(0, 40)));

    // Loja frustra → cliente recebe em tempo real
    const apiLoja = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await apiLoja.auth.signInWithPassword({ email: email('gestor-etapa7'), password: 'gestor-senha-123' });
    const { data: mot } = await adm.from('motivos').select('id').eq('loja_id', L1.id).eq('tipo', 'frustracao').limit(1).single();
    const { error: eF } = await apiLoja.rpc('frustrar_os', { p_os: os[0].id, p_motivo: mot.id, p_ocorrida_em: new Date().toISOString(), p_descricao: 'Pátio fechado', p_responsavel: 'cliente', p_previsao: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });
    if (eF) falha(eF.message);
    await cli.waitForSelector('[role=status]:has-text("Frustrada · NTF1A11")', { timeout: 15000 });
    log('cliente recebeu “Frustrada” em tempo real; sino:', await cli.getAttribute('button[aria-haspopup=dialog]', 'aria-label'));
    await cli.locator('button[aria-haspopup=dialog]:visible').first().click(); await cli.screenshot({ path: S + '/notif-sino-cliente.png' });
    await cli.click('button:has-text("Marcar todas como lidas")');
    await espera(1500);
    const { count: naoLidasCli } = await adm.from('notificacoes').select('id', { count: 'exact', head: true }).eq('empresa_cliente_id', emp.id).eq('destino', 'cliente').is('vista_em', null);
    log('“Marcar todas como lidas” zerou as do cliente:', naoLidasCli === 0);

    // Escalonamento
    const { data: velha } = await adm.from('notificacoes').insert({ loja_id: L1.id, destino: 'loja', empresa_cliente_id: emp.id, tipo: 'nova_os', titulo: 'Nova OS · teste antigo', criada_em: new Date(Date.now() - 45 * 60e3).toISOString() }).select('id').single();
    const cron = async () => (await fetch(B + '/api/cron/sla', { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })).json();
    const r1 = await cron(), r2 = await cron();
    const { data: flag } = await adm.from('notificacoes').select('push_reforco_enviado').eq('id', velha.id).single();
    if (!flag.push_reforco_enviado || r2.reforcos !== 0) falha('escalonamento');
    log(`OS sem ninguém abrir há 45 min → push reforçado (${r1.reforcos}), sem repetir na execução seguinte`);

    const semSegredo = await fetch(B + '/api/push/enviar', { method: 'POST', body: '{}' });
    const comSegredo = await (await fetch(B + '/api/push/enviar', { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: velha.id }) })).json();
    log(`/api/push/enviar: sem segredo ${semSegredo.status}; com segredo ok=${comSegredo.ok} (enviados ${comSegredo.enviados}, nenhum aparelho inscrito)`);
    await loja.setViewportSize({ width: 390, height: 844 }); await loja.goto(B + '/loja'); await loja.screenshot({ path: S + '/notif-mobile.png' });
  } finally {
    await b.close();
    if (!process.env.MANTER) { await limparLoja(L1.id); await limparLoja(L2.id); }
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
