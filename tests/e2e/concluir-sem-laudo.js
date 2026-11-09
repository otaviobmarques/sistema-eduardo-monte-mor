// Concluir OS sem laudo: alerta na tela, motivo e confirmação obrigatórios, mesmas travas do laudo (pendência e atraso),
// cliente avisado e laudo anexado depois. Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/concluir-sem-laudo.js
const fs = require('fs');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarUsuario, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const AMB = await lojaComGestor('Loja E2E Sem Laudo', 'gestor-sem-laudo');
  const L = AMB.loja;
  try {
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Sem Laudo', nome_fantasia: 'Cliente SL' }).select('id').single();
    await criarUsuario({ login: 'cliente-sem-laudo', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: emp.id });
    const gestor = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await gestor.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const abrir = async (placa) => (await gestor.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const os = await abrir('SLD1A11'), osPend = await abrir('SLD1A22'), osAtraso = await abrir('SLD1A33');

    const b = await chromium.launch();
    try {
      const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await p.goto(`${B}/loja/os/${os.numero}`);
      await p.click('button:has-text("Concluir sem laudo")');
      await p.waitForSelector('dialog[open] [role=alert]:has-text("Atenção: você está concluindo esta OS sem laudo")');
      await p.screenshot({ path: S + '/sem-laudo-alerta.png' });
      await p.click('dialog[open] button:has-text("Concluir sem laudo")');
      await p.waitForSelector('dialog[open] >> text=Explique por que a OS está sendo concluída sem laudo');
      await p.waitForSelector('dialog[open] >> text=Marque a confirmação para concluir sem laudo.');
      log('janela com ALERTA em vermelho; sem motivo e sem a confirmação marcada, não conclui');
      await p.fill('#sl-motivo', 'Laudo entregue em papel ao cliente');
      await p.check('dialog[open] input[name=ciente]');
      await p.click('dialog[open] button:has-text("Concluir sem laudo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      await p.waitForSelector('text=Concluída sem laudo');
      const { data: o } = await adm.from('ordens_servico').select('status, sem_laudo, sem_laudo_motivo, concluida_em, valor_final').eq('id', os.id).single();
      if (o.status !== 'vistoriado' || !o.sem_laudo || o.sem_laudo_motivo !== 'Laudo entregue em papel ao cliente' || !o.concluida_em || o.valor_final === null) falha('OS: ' + JSON.stringify(o));
      const { data: h } = await adm.from('historico_os').select('evento, para').eq('os_id', os.id).eq('evento', 'OS concluída sem laudo');
      const { data: n } = await adm.from('notificacoes').select('titulo, corpo').eq('os_id', os.id).eq('destino', 'cliente').eq('tipo', 'vistoriado');
      if (!h.length || !n.length || !n[0].corpo.includes('ainda não foi anexado')) falha('histórico/aviso');
      log(`OS concluída sem laudo: Vistoriado, valor congelado, motivo na linha do tempo; cliente avisado (“${n[0].titulo}”)`);
      if (!(await p.locator('button:has-text("Anexar laudo")').count())) falha('botão Anexar laudo');
      log('a ficha mostra “Concluída sem laudo” com o motivo e o botão “Anexar laudo”');
      await p.screenshot({ path: S + '/sem-laudo-ficha.png', fullPage: true });

      // Mesmas travas do laudo: pendência aberta e atraso sem justificativa
      const { data: mot } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'frustracao').limit(1).single();
      await gestor.rpc('abrir_pendencia', { p_os: osPend.id, p_tipo: 'documental', p_descricao: 'Falta CRLV', p_responsavel: 'cliente', p_previsao: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });
      await p.goto(`${B}/loja/os/${osPend.numero}`);
      if (!(await p.isDisabled('button:has-text("Concluir sem laudo")'))) falha('botão liberado com pendência');
      const e1 = (await gestor.rpc('concluir_sem_laudo', { p_os: osPend.id, p_motivo: 'Teste de trava' })).error?.message;
      await adm.from('ordens_servico').update({ aberta_em: new Date(Date.now() - 72 * 3600e3).toISOString(), prazo_em: new Date(Date.now() - 24 * 3600e3).toISOString() }).eq('id', osAtraso.id);
      const e2 = (await gestor.rpc('concluir_sem_laudo', { p_os: osAtraso.id, p_motivo: 'Teste de trava' })).error?.message;
      if (!e1?.includes('PENDENCIA_ABERTA') || !e2?.includes('JUSTIFICATIVA_OBRIGATORIA')) falha(`travas: ${e1} | ${e2}`);
      void mot;
      log('com pendência aberta o botão fica bloqueado; OS atrasada exige justificar o atraso antes (banco recusa)');

      // Cliente vê o aviso na ficha
      const c = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(c, B, 'cliente-sem-laudo', 'cliente-senha-123', '/app');
      for (let i = 0; i < 2; i++) await c.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await c.goto(`${B}/app/os/${os.numero}`);
      await c.waitForSelector('text=o laudo em PDF ainda não foi anexado');
      log('cliente vê na ficha: concluída, laudo ainda não anexado');

      // Anexar o laudo depois
      fs.writeFileSync(S + '/laudo-tardio.pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));
      await p.goto(`${B}/loja/os/${os.numero}`);
      await p.click('button:has-text("Anexar laudo")');
      await p.setInputFiles('dialog[open] input[type=file]', S + '/laudo-tardio.pdf');
      await p.click('dialog[open] button:has-text("Anexar laudo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 20000 });
      await espera(800);
      const { data: o2 } = await adm.from('ordens_servico').select('sem_laudo, status').eq('id', os.id).single();
      const { data: n2 } = await adm.from('notificacoes').select('titulo').eq('os_id', os.id).eq('tipo', 'laudo_atualizado');
      if (o2.sem_laudo || o2.status !== 'vistoriado' || !n2.some((x) => x.titulo.startsWith('Laudo disponível'))) falha('anexar depois: ' + JSON.stringify({ o2, n2 }));
      await c.reload(); await c.waitForSelector('text=laudo-tardio.pdf');
      log('laudo anexado depois: a marca “sem laudo” sai, o cliente é avisado (“Laudo disponível”) e já pode baixar o PDF');
    } finally {
      await b.close();
    }
  } finally {
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
