// Pendências (Loja) com tudo o que falta resolver: OS fora do prazo (no topo), a vistoriar no prazo, pausas manuais e
// pendências, com a data de abertura da OS e filtro por tipo. O cliente continua vendo só as pendências dele.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/pendencias-completa.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarUsuario, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Pendências', 'gestor-pend');
  const L = AMB.loja;
  try {
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Pend', nome_fantasia: 'Cliente PD' }).select('id').single();
    await criarUsuario({ login: 'cliente-pend', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: emp.id });
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const abrir = async (placa) => (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const atr1 = await abrir('PDC1A11'), atr2 = await abrir('PDC1A22'), noPrazo = await abrir('PDC1A33'), pausada = await abrir('PDC1A44'), comPend = await abrir('PDC1A55');
    await g.rpc('alterar_abertura', { p_os: atr1.id, p_aberta_em: new Date(Date.now() - 3 * 86400e3).toISOString() });
    await g.rpc('alterar_abertura', { p_os: atr2.id, p_aberta_em: new Date(Date.now() - 5 * 86400e3).toISOString() });
    await g.rpc('pausar_os', { p_os: pausada.id, p_motivo: 'Aguardando chave' });
    await g.rpc('abrir_pendencia', { p_os: comPend.id, p_tipo: 'documental', p_descricao: 'Falta CRLV', p_responsavel: 'cliente', p_previsao: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });

    const b = await chromium.launch();
    try {
      const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await p.goto(`${B}/loja/pendencias?ordem=urgencia`);
      const linhas = await p.$$eval('table tbody tr', (rs) => rs.map((r) => ({ tipo: r.dataset.tipo, txt: r.innerText.replace(/\s+/g, ' ') })));
      const ordem = linhas.map((l) => `${l.tipo}:${l.txt.match(/PDC1A\d\d/)[0]}`);
      if (ordem.join(',') !== 'atrasada:PDC1A22,atrasada:PDC1A11,documental:PDC1A55,pausa:PDC1A44,a_vistoriar:PDC1A33') falha('ordem: ' + ordem);
      if (!linhas[0].txt.includes('Fora do prazo') || !/atrasada/i.test(linhas[0].txt)) falha('linha atrasada: ' + linhas[0].txt);
      log('Pendências traz as 5; em “Mais urgentes primeiro”: fora do prazo no topo (a mais atrasada primeiro), pendência, pausa manual e a vistoriar no prazo');
      const kv = async (r) => (await p.locator(`div:has(> p:text-is("${r}"))`).first().innerText()).replace(/\s+/g, ' ');
      const k = [await kv('Fora do prazo'), await kv('A vistoriar'), await kv('Pausa manual'), await kv('Pendências')];
      if (!/ 2 /.test(k[0]) || !/ 1 /.test(k[1]) || !/ 1 /.test(k[2]) || !/ 1 /.test(k[3])) falha('cards: ' + k);
      log(`cards: ${k.map((x) => x.split(' ').slice(0, 4).join(' ')).join(' | ')}`);
      await p.screenshot({ path: S + '/pendencias-completa.png', fullPage: true });

      for (const [chip, valor, esperado] of [['Fora do prazo', 'atrasada', 2], ['A vistoriar', 'a_vistoriar', 1], ['Pausa manual', 'pausa', 1], ['Pendências', 'pendencias', 1], ['Todas', '', 5]]) {
        await p.click(`nav[aria-label=Filtro] a:has-text("${chip}")`);
        await p.waitForURL((u) => (new URL(u).searchParams.get('tipo') ?? '') === valor);
        await p.waitForSelector(`nav[aria-label=Filtro] a[aria-current=true]:has-text("${chip}")`);
        const n = await p.locator('table tbody tr').count();
        if (n !== esperado) falha(`filtro ${chip}: ${n}`);
      }
      log('filtro por tipo: Fora do prazo (2), A vistoriar (1), Pausa manual (1), Pendências (1), Todas (5)');

      // Cliente: só as pendências dele (não vê a fila da Loja)
      const c = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(c, B, 'cliente-pend', 'cliente-senha-123', '/app');
      for (let i = 0; i < 2; i++) await c.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await c.goto(`${B}/app/pendencias`);
      const nc = await c.locator('table tbody tr').count();
      if (nc !== 1 || !(await c.locator('table tbody tr:has-text("PDC1A55")').count())) falha('cliente vê ' + nc);
      log('o cliente continua vendo só a pendência que é dele');
    } finally { await b.close(); }
  } finally { if (!process.env.MANTER) await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
