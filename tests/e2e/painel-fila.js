// Painel de OS: motivo da pausa na fila, “A receber” do mês com todas as placas (menos canceladas) e ranking por pátio.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/painel-fila.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Painel', 'gestor-painel');
  const L = AMB.loja;
  try {
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Painel', nome_fantasia: 'Cliente P' }).select('id').single();
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pats } = await adm.from('patios').select('id, nome').eq('loja_id', L.id).order('nome');
    const abrir = async (placa, patio, valor) => {
      const o = (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: patio, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
      await adm.from('ordens_servico').update({ valor_base: valor, valor_deslocamento: 0, valor_ajuste: 0 }).eq('id', o.id);
      return o;
    };
    const P1 = pats[0], P2 = pats[1];
    const a = await abrir('PNL1A11', P1.id, 100), b = await abrir('PNL1A22', P1.id, 200), c = await abrir('PNL1A33', P1.id, 300);
    const d = await abrir('PNL1A44', P2.id, 400), e = await abrir('PNL1A55', P2.id, 1000);
    const amanha = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    await g.rpc('pausar_os', { p_os: a.id, p_motivo: 'Aguardando cliente liberar o carro' });
    await g.rpc('abrir_pendencia', { p_os: b.id, p_tipo: 'documental', p_descricao: 'Falta CRLV', p_responsavel: 'cliente', p_previsao: amanha });
    const { data: mot } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'frustracao').limit(1).single();
    await g.rpc('frustrar_os', { p_os: c.id, p_motivo: mot.id, p_ocorrida_em: new Date().toISOString(), p_descricao: 'Pátio fechado', p_responsavel: 'cliente', p_previsao: amanha });
    await g.rpc('concluir_sem_laudo', { p_os: d.id, p_motivo: null });
    const { data: mc } = await adm.from('motivos').select('id').eq('loja_id', L.id).eq('tipo', 'cancelamento').limit(1).single();
    await g.rpc('cancelar_os', { p_os: e.id, p_nome: 'Ana', p_motivo: mc.id, p_descricao: 'duplicada' });

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await p.goto(`${B}/loja?sla=pausadas`);
      const linha = (placa) => p.locator(`table tbody tr:has-text("${placa}") td[data-rotulo="Prazo"]`).innerText();
      const [ta, tb, tc] = await Promise.all([linha('PNL1A11'), linha('PNL1A22'), linha('PNL1A33')]);
      if (!ta.includes('Pausa manual: Aguardando cliente liberar o carro') || !tb.includes('Pendência: Falta CRLV') || !tc.includes('Frustração:') || !tc.includes('Pátio fechado')) falha(`motivos: ${ta} | ${tb} | ${tc}`);
      log('pausadas mostram o motivo na fila: pausa manual, pendência e frustração');
      await p.screenshot({ path: S + '/fila-pausadas.png', fullPage: true });

      await p.goto(`${B}/loja`);
      const kpi = await p.locator('div:has(> p:has-text("A receber em"))').first().innerText();
      if (!kpi.includes('1.000,00') || !kpi.includes('4 placas')) falha('A receber: ' + kpi);
      log('“A receber” do mês soma as 4 placas não canceladas (pausada, com pendência, frustrada e vistoriada): R$ 1.000,00; a cancelada (R$ 1.000) fica de fora');

      const itens = await p.$$eval('section[aria-labelledby="card-patios"] li', (ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ')));
      if (itens.length !== 2 || !itens[0].includes(P1.nome) || !itens[0].includes('3 OS') || !itens[1].includes(P2.nome) || !itens[1].includes('1 OS') || !itens[1].includes('1 vistoriada')) falha('ranking: ' + JSON.stringify(itens));
      log(`ranking por pátio: 1º ${P1.nome} (3 OS), 2º ${P2.nome} (1 OS, 1 vistoriada); canceladas não contam`);
      await p.locator('section[aria-labelledby="card-patios"]').screenshot({ path: S + '/ranking-patios.png' });
    } finally {
      await br.close();
    }
  } finally {
    if (!process.env.MANTER) await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
