// Acesso do vistoriador (14/11/2026): o Gestor cria usuário e senha em Cadastros › Vistoriadores e envia o link pelo
// WhatsApp; o vistoriador entra e vê só as vistorias designadas/agendadas para ele (nada mais da Loja).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/acesso-vistoriador.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor, semPopupLeitura } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Vistoriador', 'gestor-vist');
  const L = AMB.loja;
  const LOGIN = 'vist-e2e-joao', SENHA = 'joao2026ok', SENHA2 = 'novaSenha99';
  try {
    // sobra de execução anterior
    const { data: velho } = await adm.from('perfis_usuario').select('user_id').eq('login', LOGIN).maybeSingle();
    if (velho) { await adm.from('perfis_usuario').delete().eq('user_id', velho.user_id); await adm.auth.admin.deleteUser(velho.user_id); }
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Vist', nome_fantasia: 'Cliente Vist' }).select('id').single();
    const { data: vs } = await adm.from('vistoriadores').insert([{ loja_id: L.id, nome: 'João Teste', telefone: '19999990000' }, { loja_id: L.id, nome: 'Maria Outra' }]).select('id, nome');
    const joao = vs.find((v) => v.nome === 'João Teste'), maria = vs.find((v) => v.nome === 'Maria Outra');
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id, nome').eq('loja_id', L.id).limit(1).single();
    const abrir = async (placa, modelo) => (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: modelo, p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: 'Chave na portaria' })).data[0];
    const a = await abrir('VST1A11', 'Fiat Uno'), b = await abrir('VST1A22', 'VW Gol');
    await abrir('VST1A33', 'Ford Ka');
    const amanha = new Date(Date.now() + 86400e3); amanha.setUTCHours(12, 0, 0, 0);
    for (const [os, v] of [[a, joao], [b, maria]]) {
      const { error } = await g.rpc('agendar_os', { p_os: os.id, p_data_hora: amanha.toISOString(), p_local: null, p_vistoriador: v.id, p_motivo: null, p_motivo_texto: null });
      if (error) falha('agendar: ' + error.message);
    }

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
      await semPopupLeitura(p);
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await p.goto(`${B}/loja/cadastros/vistoriadores`);
      const linha = p.locator('[data-teste="acesso-João Teste"]');
      await linha.locator('button:has-text("Criar acesso")').click();
      await p.fill('#vist-login', LOGIN);
      await p.fill('#vist-senha', 'curta');
      await p.click('dialog[open] button:has-text("Criar acesso")');
      await p.waitForSelector('dialog[open] >> text=pelo menos 8 caracteres');
      await p.fill('#vist-senha', SENHA);
      await p.click('dialog[open] button:has-text("Criar acesso")');
      const msg = await p.locator('[data-teste=mensagem-vistoriador]').innerText({ timeout: 15000 });
      if (!msg.includes(`${B}/login`) || !msg.includes(`Usuário: ${LOGIN}`) || !msg.includes(`Senha: ${SENHA}`)) falha('mensagem: ' + msg);
      const wa = await p.getAttribute('dialog[open] a:has-text("Enviar pelo WhatsApp")', 'href');
      if (!wa.startsWith('https://wa.me/5519999990000?text=')) falha('whatsapp: ' + wa);
      await p.screenshot({ path: `${S}/vistoriador-acesso.png` });
      log(`Gestor criou o acesso (senha curta recusada) e a mensagem traz link, usuário e senha, com WhatsApp direto no celular do vistoriador`);
      await p.keyboard.press('Escape');
      await p.waitForSelector('[data-teste="acesso-João Teste"] >> text=Aguardando 1º acesso');

      // Vistoriador entra pelo link
      const v = await (await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
      await entrar(v, B, LOGIN, SENHA, '/vistoriador');
      const cards = await v.locator('[data-teste=vistoria]').allInnerTexts();
      if (cards.length !== 1 || !cards[0].includes('VST1A11') || !cards[0].includes('Chave na portaria')) falha('vistorias: ' + JSON.stringify(cards));
      if (!(await v.locator('h2:has-text("Amanhã")').count())) falha('grupo Amanhã');
      await v.screenshot({ path: `${S}/vistoriador-minhas.png`, fullPage: true });
      log('vistoriador entra no celular e vê só a placa dele (VST1A11, amanhã, com a observação); as de outro vistoriador e sem designação não aparecem');
      await v.goto(`${B}/loja`); await v.waitForURL('**/vistoriador');
      await v.goto(`${B}/app`); await v.waitForURL('**/vistoriador');
      const sv = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      await sv.auth.signInWithPassword({ email: email(LOGIN), password: SENHA });
      for (const t of ['ordens_servico', 'empresas_clientes', 'notificacoes', 'vistoriadores', 'perfis_usuario', 'os_agendamentos', 'historico_os', 'patios']) {
        const { data } = await sv.from(t).select('*').limit(5);
        const proprio = t === 'perfis_usuario' ? (data ?? []).filter((x) => x.login !== LOGIN) : data ?? [];
        if (proprio.length) falha(`vazou ${t}: ${proprio.length}`);
      }
      const { error: eRpc } = await sv.rpc('confirmar_leitura', { p_ids: [] });
      if (!eRpc) falha('vistoriador chamou função da Loja');
      log('telas da Loja e do cliente mandam de volta para “Minhas vistorias”; direto no banco ele não lê OS, clientes, notificações nem chama funções da Loja');
      await p.reload();
      await p.waitForSelector('[data-teste="acesso-João Teste"] >> text=Ativo');

      // Alterar senha e bloquear
      await p.locator('[data-teste="acesso-João Teste"] button:has-text("Alterar senha")').click();
      await p.fill('#vist-senha', SENHA2);
      await p.click('dialog[open] button:has-text("Salvar nova senha")');
      await p.waitForSelector('[data-teste=mensagem-vistoriador] >> text=' + SENHA2);
      await p.keyboard.press('Escape');
      const t = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      if (!(await t.auth.signInWithPassword({ email: email(LOGIN), password: SENHA })).error) falha('senha antiga ainda vale');
      if ((await t.auth.signInWithPassword({ email: email(LOGIN), password: SENHA2 })).error) falha('senha nova não vale');
      log('“Alterar senha”: a antiga deixa de valer e a nova entra');
      await p.locator('[data-teste="acesso-João Teste"] button:has-text("Bloquear")').click();
      await p.waitForSelector('[data-teste="acesso-João Teste"] >> text=Bloqueado');
      const v2 = await (await br.newContext()).newPage();
      await entrar(v2, B, LOGIN, SENHA2);
      await v2.waitForSelector('text=bloqueado', { timeout: 15000 }).catch(() => {});
      if (v2.url().includes('/vistoriador')) falha('bloqueado entrou');
      log('“Bloquear”: o vistoriador não entra mais');
    } finally { await br.close(); }
  } finally {
    const { data: pf } = await adm.from('perfis_usuario').select('user_id').eq('login', LOGIN).maybeSingle();
    if (pf) { await adm.from('perfis_usuario').delete().eq('user_id', pf.user_id); await adm.auth.admin.deleteUser(pf.user_id); }
    await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
