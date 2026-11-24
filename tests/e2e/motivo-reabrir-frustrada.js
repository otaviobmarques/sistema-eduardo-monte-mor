// Placa FZZ3F95 (24/11/2026): na ficha, “Alterar motivo” corrige o motivo de uma frustração/pendência e o Gestor com
// conclusão livre reabre OS frustrada (pendência encerrada, volta para A vistoriar, prazo volta a correr).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/motivo-reabrir-frustrada.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor, semPopupLeitura } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Motivo', 'gestor-motivo');
  const L = AMB.loja;
  try {
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Mot', nome_fantasia: 'Cliente Mot' }).select('id').single();
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const { data: mots } = await adm.from('motivos').select('id, descricao').eq('loja_id', L.id).eq('tipo', 'frustracao').order('ordem');
    const [m1, m2] = [mots[0], mots.find((m) => /autoriza/i.test(m.descricao)) ?? mots[1]];
    const { data: os } = await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: 'FZZ3F95', p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null });
    const o = os[0];
    const amanha = new Date(Date.now() - 3 * 3600e3 + 86400e3).toISOString().slice(0, 10);
    const { error: eF } = await g.rpc('frustrar_os', { p_os: o.id, p_motivo: m1.id, p_ocorrida_em: new Date().toISOString(), p_descricao: 'VEICULO NAO ESTA NO PATIO', p_responsavel: 'cliente', p_previsao: amanha });
    if (eF) falha(eF.message);

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await semPopupLeitura(p);
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await p.goto(`${B}/loja/os/${o.numero}`);
      await p.click('[data-teste=alterar-motivo]');
      await p.selectOption('dialog[open] select[name=motivo_id]', m2.id);
      await p.fill('dialog[open] textarea[name=descricao]', 'Pátio pediu autorização do banco');
      await p.click('dialog[open] button:has-text("Salvar motivo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      const { data: f } = await adm.from('os_frustracoes').select('motivo_id, descricao').eq('os_id', o.id).single();
      const { data: pe } = await adm.from('pendencias').select('descricao, tipo, resolvida_em').eq('os_id', o.id).single();
      if (f.motivo_id !== m2.id || f.descricao !== 'Pátio pediu autorização do banco' || pe.descricao !== `${m2.descricao}: Pátio pediu autorização do banco` || pe.resolvida_em) falha('motivo: ' + JSON.stringify({ f, pe }));
      await p.waitForSelector(`text=${m2.descricao}: Pátio pediu autorização do banco`);
      const { data: h } = await adm.from('historico_os').select('evento, de, para').eq('os_id', o.id).eq('evento', 'Motivo da pendência alterado');
      if (h.length !== 1 || !h[0].de.includes('VEICULO NAO ESTA NO PATIO')) falha('histórico: ' + JSON.stringify(h));
      const { data: rel } = await adm.from('vw_os_sla').select('motivo_frustracao').eq('numero', o.numero).eq('loja_id', L.id).single();
      if (rel.motivo_frustracao !== m2.descricao) falha('relatório: ' + rel.motivo_frustracao);
      log(`“Alterar motivo”: frustração de “${m1.descricao}” para “${m2.descricao}” (pendência, relatório e linha do tempo com o anterior)`);

      await p.click('button:has-text("Reabrir OS")');
      await p.fill('dialog[open] #ra-motivo', 'Autorização chegou');
      await p.click('dialog[open] button:has-text("Reabrir OS")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      const { data: o2 } = await adm.from('ordens_servico').select('status, pausado_desde').eq('id', o.id).single();
      const { data: pe2 } = await adm.from('pendencias').select('resolvida_em, resolucao_texto').eq('os_id', o.id).single();
      if (o2.status !== 'a_vistoriar' || o2.pausado_desde || !pe2.resolvida_em || !pe2.resolucao_texto.includes('Autorização chegou')) falha('reabrir: ' + JSON.stringify({ o2, pe2 }));
      await p.screenshot({ path: `${S}/motivo-reabrir.png`, fullPage: true });
      log('“Reabrir OS” na frustrada: volta para A vistoriar, pendência encerrada (“OS reaberta: Autorização chegou”) e prazo correndo de novo');

      await p.click('[data-teste=alterar-motivo]');
      await p.fill('dialog[open] textarea[name=descricao]', 'Pátio pediu autorização do banco (confirmado)');
      await p.click('dialog[open] button:has-text("Salvar motivo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      const { data: f3 } = await adm.from('os_frustracoes').select('descricao').eq('os_id', o.id).single();
      if (!f3.descricao.includes('(confirmado)')) falha('alterar depois de resolvida');
      log('o motivo também pode ser corrigido depois da pendência resolvida');
    } finally { await br.close(); }
  } finally { await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
