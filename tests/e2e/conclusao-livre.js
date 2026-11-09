// Conclusão livre: o Gestor com a permissão (o “eduardo”) fecha a placa sem nenhuma trava — sem motivo, com pendência
// aberta (encerrada junto), com OS frustrada e com atraso sem justificativa. Um Gestor comum continua travado.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/conclusao-livre.js
const fs = require('fs');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarUsuario, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Conclusão Livre', 'gestor-livre');
  const L = AMB.loja;
  try {
    await criarUsuario({ login: 'gestor-comum', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L.id, nome: 'Gestor Comum' });
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Livre', nome_fantasia: 'Cliente Livre' }).select('id').single();
    const api = async (login) => { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); await c.auth.signInWithPassword({ email: email(login), password: 'gestor-senha-123' }); return c; };
    const livre = await api(AMB.gestor.login), comum = await api('gestor-comum');
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const { data: mot } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'frustracao').limit(1).single();
    const abrir = async (placa) => (await livre.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const atrasar = (id) => adm.from('ordens_servico').update({ aberta_em: new Date(Date.now() - 72 * 3600e3).toISOString(), prazo_em: new Date(Date.now() - 24 * 3600e3).toISOString() }).eq('id', id);
    const amanha = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const osA = await abrir('LVR1A11'), osB = await abrir('LVR1A22'), osC = await abrir('LVR1A33');
    // A: atrasada e com pendência aberta. B: frustrada (e atrasada). C: atrasada, para o Gestor comum.
    await atrasar(osA.id); await atrasar(osB.id); await atrasar(osC.id);
    await livre.rpc('abrir_pendencia', { p_os: osA.id, p_tipo: 'documental', p_descricao: 'Falta CRLV', p_responsavel: 'cliente', p_previsao: amanha });
    const { error: eF } = await livre.rpc('frustrar_os', { p_os: osB.id, p_motivo: mot.id, p_ocorrida_em: new Date().toISOString(), p_descricao: 'Pátio fechado', p_responsavel: 'cliente', p_previsao: amanha });
    if (eF) falha('frustrar: ' + eF.message);

    // Gestor comum continua travado
    await comum.rpc('abrir_pendencia', { p_os: osC.id, p_tipo: 'documental', p_descricao: 'Falta CRLV', p_responsavel: 'cliente', p_previsao: amanha });
    const e1 = (await comum.rpc('concluir_sem_laudo', { p_os: osC.id, p_motivo: '' })).error?.message;
    const e2 = (await comum.rpc('concluir_sem_laudo', { p_os: osC.id, p_motivo: 'Teste de trava' })).error?.message;
    const e3 = (await comum.rpc('concluir_sem_laudo', { p_os: osB.id, p_motivo: 'Teste de trava' })).error?.message;
    if (!e1?.includes('MOTIVO_OBRIGATORIO') || !e2?.includes('PENDENCIA_ABERTA') || !e3?.includes('OS_NAO_ABERTA')) falha(`comum: ${e1} | ${e2} | ${e3}`);
    log('Gestor comum continua com as travas (motivo, pendência aberta, OS frustrada)');

    const b = await chromium.launch();
    try {
      const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // A: atrasada + pendência, sem motivo e sem marcar nada
      await p.goto(`${B}/loja/os/${osA.numero}`);
      if (await p.isDisabled('button:has-text("Concluir sem laudo")')) falha('botão travado para o Gestor livre');
      if (await p.locator('text=Para concluir (com ou sem laudo)').count()) falha('aviso de trava aparece');
      await p.click('button:has-text("Concluir sem laudo")');
      await p.waitForSelector('dialog[open] [role=alert]:has-text("Atenção: você está concluindo esta OS sem laudo")');
      if (await p.locator('dialog[open] input[name=ciente]').count()) falha('caixa de confirmação aparece');
      await p.screenshot({ path: S + '/livre-alerta.png' });
      await p.click('dialog[open] button:has-text("Concluir sem laudo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      await p.waitForSelector('text=Concluída sem laudo');
      const { data: a } = await adm.from('ordens_servico').select('status, sem_laudo, sem_laudo_motivo, pausado_desde').eq('id', osA.id).single();
      const { data: pa } = await adm.from('pendencias').select('resolvida_em').eq('os_id', osA.id);
      const { data: pz } = await adm.from('sla_pausas').select('fim').eq('os_id', osA.id);
      if (a.status !== 'vistoriado' || !a.sem_laudo || a.sem_laudo_motivo !== null || a.pausado_desde || pa.some((x) => !x.resolvida_em) || pz.some((x) => !x.fim)) falha('A: ' + JSON.stringify({ a, pa, pz }));
      log('OS atrasada e com pendência concluída sem motivo, sem confirmação e sem justificar (pendência e pausa encerradas)');

      // B: frustrada, enviando o laudo direto
      fs.writeFileSync(S + '/laudo-livre.pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));
      await p.goto(`${B}/loja/os/${osB.numero}`);
      await p.click('button:has-text("Enviar laudo")');
      await p.setInputFiles('dialog[open] input[type=file]', S + '/laudo-livre.pdf');
      await p.click('dialog[open] button:has-text("Enviar laudo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 20000 });
      const { data: o } = await adm.from('ordens_servico').select('status, sem_laudo').eq('id', osB.id).single();
      const { data: pb } = await adm.from('pendencias').select('resolvida_em').eq('os_id', osB.id);
      if (o.status !== 'vistoriado' || o.sem_laudo || pb.some((x) => !x.resolvida_em)) falha('B: ' + JSON.stringify({ o, pb }));
      log('OS frustrada e atrasada concluída direto com o laudo (pendência da frustração encerrada)');
      await p.screenshot({ path: S + '/livre-ficha.png', fullPage: true });

      // Gestor comum: na tela, botões travados e aviso
      const q = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(q, B, 'gestor-comum', 'gestor-senha-123', '/loja');
      for (let i = 0; i < 2; i++) await q.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await q.goto(`${B}/loja/os/${osC.numero}`);
      if (!(await q.isDisabled('button:has-text("Concluir sem laudo")'))) falha('Gestor comum sem trava na tela');
      await q.waitForSelector('text=Para concluir (com ou sem laudo)');
      log('para o Gestor comum a tela segue travada, com o aviso do que falta');
    } finally {
      await b.close();
    }
  } finally {
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
