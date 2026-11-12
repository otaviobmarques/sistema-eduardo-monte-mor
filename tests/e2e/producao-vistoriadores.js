// Painel: vistorias FEITAS por vistoriador hoje, na semana, na quinzena e no mês (OS vistoriadas pela data da conclusão).
// O vistoriador que fez é informado na conclusão ou corrigido na ficha (também em OS já concluída).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/producao-vistoriadores.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const TZ = 3 * 3600e3;

// Mesmas regras do sistema (Brasília): hoje, semana (segunda), quinzena (1–15 / 16–fim) e mês
function periodos(agora = Date.now()) {
  const br = new Date(agora - TZ); const a = br.getUTCFullYear(), m = br.getUTCMonth(), d = br.getUTCDate(), s = br.getUTCDay();
  const ini = (dd) => Date.UTC(a, m, dd) + TZ;
  return { dia: ini(d), semana: ini(d - ((s + 6) % 7)), quinzena: ini(d <= 15 ? 1 : 16), mes: ini(1) };
}

(async () => {
  const AMB = await lojaComGestor('Loja E2E Produção', 'gestor-prod');
  const L = AMB.loja;
  try {
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente PR', nome_fantasia: 'Cliente PR' }).select('id').single();
    const { data: vists } = await adm.from('vistoriadores').insert([{ loja_id: L.id, nome: 'Carlos Vistoriador' }, { loja_id: L.id, nome: 'Paula Vistoriadora' }]).select('id, nome');
    const carlos = vists.find((v) => v.nome.startsWith('Carlos')), paula = vists.find((v) => v.nome.startsWith('Paula'));
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const abrir = async (placa) => (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const P = periodos();
    // Datas de conclusão: agora; início do mês + 1h (mês); e, se a semana começou neste mês, início da semana + 1h
    const conc = { hoje: Date.now() - 60e3, mes: P.mes + 3600e3, semana: Math.max(P.semana, P.mes) + 2 * 3600e3 };
    const os1 = await abrir('PRD1A11'), os2 = await abrir('PRD1A22'), os3 = await abrir('PRD1A33'), os4 = await abrir('PRD1A44');
    for (const [o, t] of [[os2, conc.semana], [os3, conc.mes]]) {
      await g.rpc('alterar_abertura', { p_os: o.id, p_aberta_em: new Date(Math.min(t, Date.now()) - 600e3).toISOString() });
      await g.rpc('concluir_sem_laudo', { p_os: o.id, p_motivo: null, p_concluida_em: new Date(Math.min(t, Date.now() - 60e3)).toISOString() });
    }
    await g.rpc('concluir_sem_laudo', { p_os: os4.id, p_motivo: null });

    const b = await chromium.launch();
    try {
      const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // 1. Na conclusão: “Vistoriador que fez”
      await p.goto(`${B}/loja/os/${os1.numero}`);
      await p.click('button:has-text("Concluir sem laudo")');
      await p.selectOption('#conc-vist', carlos.id);
      await p.click('dialog[open] button:has-text("Concluir sem laudo")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 30000 }).catch(async () => { await p.screenshot({ path: process.env.S + '/prod-erro.png' }); throw new Error('janela: ' + (await p.locator('dialog[open]').innerText()).slice(-500)); });
      if ((await adm.from('ordens_servico').select('vistoriador_id').eq('id', os1.id).single()).data.vistoriador_id !== carlos.id) falha('vistoriador na conclusão');
      log('na janela de conclusão: “Vistoriador que fez” = Carlos');

      // 2. Na ficha de OS já concluída: definir o vistoriador
      await p.goto(`${B}/loja/os/${os2.numero}`);
      await p.click('button:has-text("Definir vistoriador")');
      await p.selectOption('#ev-vist', carlos.id);
      await p.click('dialog[open] button:has-text("Salvar vistoriador")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      await g.rpc('definir_vistoriador', { p_os: os3.id, p_vistoriador: paula.id });
      const { data: h } = await adm.from('historico_os').select('para').eq('os_id', os2.id).eq('evento', 'Vistoriador definido').single();
      if (h.para !== 'Carlos Vistoriador') falha('histórico vistoriador');
      log('na ficha de OS já concluída: “Definir vistoriador” (fica na linha do tempo)');

      // 3. Card no painel
      const conta = (t) => ({ dia: +(t >= P.dia), semana: +(t >= P.semana), quinzena: +(t >= P.quinzena), mes: +(t >= P.mes) });
      const soma = (...xs) => xs.reduce((a, x) => ({ dia: a.dia + x.dia, semana: a.semana + x.semana, quinzena: a.quinzena + x.quinzena, mes: a.mes + x.mes }), { dia: 0, semana: 0, quinzena: 0, mes: 0 });
      const esperado = { 'Carlos Vistoriador': soma(conta(conc.hoje), conta(Math.min(conc.semana, Date.now() - 60e3))), 'Paula Vistoriadora': conta(Math.min(conc.mes, Date.now() - 60e3)), 'Sem vistoriador': conta(Date.now()) };
      await p.goto(`${B}/loja`);
      const linhas = await p.$$eval('section[aria-labelledby=card-producao] tbody tr', (rs) => rs.map((r) => [...r.children].map((c) => c.innerText.trim())));
      for (const [nome, e] of Object.entries(esperado)) {
        const l = linhas.find((x) => x[0] === nome);
        if (!l || l.slice(1).join(',') !== [e.dia, e.semana, e.quinzena, e.mes].join(',')) falha(`${nome}: ${JSON.stringify(l)} esperado ${JSON.stringify(e)}`);
      }
      await p.locator('section[aria-labelledby=card-producao]').screenshot({ path: S + '/producao-vistoriadores.png' });
      log(`card “Vistorias feitas por vistoriador”: ${linhas.map((l) => `${l[0]} ${l.slice(1).join('/')}`).join(' · ')} (hoje/semana/quinzena/mês)`);
    } finally { await b.close(); }
  } finally { if (!process.env.MANTER) await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
