// Data da conclusão escolhida: o Gestor com conclusão livre (o “eduardo”) fecha a OS com data anterior a hoje e o SLA
// passa a valer por essa data (no prazo / atrasada, mês do fechamento). Gestor comum: sempre “agora”.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/data-conclusao.js
const fs = require('fs');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarUsuario, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
// datetime-local em Brasília (UTC-3)
const local = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 16);

(async () => {
  const AMB = await lojaComGestor('Loja E2E Data Conclusão', 'gestor-data');
  const L = AMB.loja;
  try {
    await criarUsuario({ login: 'gestor-comum-d', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L.id, nome: 'Gestor Comum' });
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Data', nome_fantasia: 'Cliente D' }).select('id').single();
    const api = async (login) => { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); await c.auth.signInWithPassword({ email: email(login), password: 'gestor-senha-123' }); return c; };
    const livre = await api(AMB.gestor.login), comum = await api('gestor-comum-d');
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const abrir = async (placa) => (await livre.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    // Todas abertas há 5 dias (prazo de 48h já vencido hoje)
    const aberta = Date.now() - 5 * 86400e3;
    const velha = async (placa) => { const o = await abrir(placa); await adm.from('ordens_servico').update({ aberta_em: new Date(aberta).toISOString(), prazo_em: new Date(aberta + 48 * 3600e3).toISOString() }).eq('id', o.id); return o; };
    const osA = await velha('DTC1A11'), osB = await velha('DTC1A22'), osC = await velha('DTC1A33');

    // Banco: futuro e antes da abertura são recusados; Gestor comum não consegue escolher a data
    const eF = (await livre.rpc('concluir_sem_laudo', { p_os: osC.id, p_motivo: null, p_concluida_em: new Date(Date.now() + 86400e3).toISOString() })).error?.message;
    const eA = (await livre.rpc('concluir_sem_laudo', { p_os: osC.id, p_motivo: null, p_concluida_em: new Date(aberta - 86400e3).toISOString() })).error?.message;
    if (!eF?.includes('DATA_CONCLUSAO_FUTURA') || !eA?.includes('DATA_CONCLUSAO_ANTES_ABERTURA')) falha(`limites: ${eF} | ${eA}`);
    await adm.from('justificativas_atraso').insert({ os_id: osC.id, motivo_id: (await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'atraso').limit(1).single()).data.id, texto: 'teste' });
    const { error: eC } = await comum.rpc('concluir_sem_laudo', { p_os: osC.id, p_motivo: 'Teste comum', p_concluida_em: new Date(aberta + 3600e3).toISOString() });
    const { data: c } = await adm.from('ordens_servico').select('concluida_em').eq('id', osC.id).single();
    if (eC || Date.now() - new Date(c.concluida_em).getTime() > 120e3) falha('comum escolheu a data: ' + (eC?.message ?? c.concluida_em));
    log('data no futuro ou antes da abertura é recusada; para o Gestor comum a conclusão é sempre “agora”');

    const b = await chromium.launch();
    try {
      const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // A: sem laudo, concluída 1 dia depois da abertura → no prazo
      const quandoA = aberta + 24 * 3600e3;
      await p.goto(`${B}/loja/os/${osA.numero}`);
      await p.click('button:has-text("Concluir sem laudo")');
      await p.fill('#conclusao-quando', local(quandoA));
      await p.screenshot({ path: S + '/data-conclusao.png' });
      await p.click('dialog[open] button:has-text("Concluir sem laudo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      await p.waitForSelector('text=Concluída no prazo');
      const { data: a } = await adm.from('vw_os_sla').select('concluida_em, no_prazo').eq('id', osA.id).single();
      if (Math.abs(new Date(a.concluida_em).getTime() - Math.floor(quandoA / 60e3) * 60e3) > 60e3 || a.no_prazo !== true) falha('A: ' + JSON.stringify(a));
      const { data: h } = await adm.from('historico_os').select('para').eq('os_id', osA.id).eq('evento', 'OS concluída sem laudo').single();
      if (!h.para.includes('concluída em')) falha('linha do tempo: ' + h.para);
      log(`OS aberta há 5 dias concluída sem laudo com data de 1 dia após a abertura: “Concluída no prazo” (relatórios: no prazo); linha do tempo: “${h.para}”`);

      // B: com laudo, concluída 3 dias depois da abertura → atrasada 1 dia
      fs.writeFileSync(S + '/laudo-data.pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));
      await p.goto(`${B}/loja/os/${osB.numero}`);
      await p.click('button:has-text("Enviar laudo")');
      await p.fill('#conclusao-quando', local(aberta + 72 * 3600e3));
      await p.setInputFiles('dialog[open] input[type=file]', S + '/laudo-data.pdf');
      await p.click('dialog[open] button:has-text("Enviar laudo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 20000 });
      await p.waitForSelector('text=Concluída com 1d de atraso').catch(() => p.waitForSelector('text=/Concluída com 2[34]h/'));
      const { data: bb } = await adm.from('vw_os_sla').select('no_prazo, horas_conclusao').eq('id', osB.id).single();
      if (bb.no_prazo !== false || Math.round(bb.horas_conclusao) !== 72) falha('B: ' + JSON.stringify(bb));
      log(`com laudo e data de 3 dias após a abertura: atrasada; tempo de conclusão nos relatórios = ${bb.horas_conclusao} h`);

      // OS já concluída: sem campo de data
      await p.goto(`${B}/loja/os/${osC.numero}`);
      if (await p.locator('#conclusao-quando').count()) falha('campo de data em OS já concluída');
      log('OS já concluída não mostra o campo (nova versão do laudo não muda a data)');
    } finally {
      await b.close();
    }
  } finally {
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
