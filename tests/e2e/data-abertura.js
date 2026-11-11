// Data de abertura: o Gestor com conclusão livre (o “eduardo”) escolhe a abertura ao abrir a OS e corrige depois na ficha;
// o prazo conta a partir dela, sem rajada de alertas. A coluna “Abertura” aparece na fila. Gestor comum não altera.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/data-abertura.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, criarUsuario, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const local = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 16);
const fmt = (ms) => { const d = new Date(ms - 3 * 3600e3).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`; };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Abertura', 'gestor-abertura');
  const L = AMB.loja;
  try {
    await criarUsuario({ login: 'gestor-comum-a', senha: 'gestor-senha-123', perfil: 'loja', lojaId: L.id, nome: 'Gestor Comum' });
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Abertura', nome_fantasia: 'Cliente AB' }).select('id').single();
    const b = await chromium.launch();
    try {
      const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // 1. Abrir OS com abertura 3 dias atrás
      const tres = Math.floor((Date.now() - 3 * 86400e3) / 60e3) * 60e3;
      await p.goto(`${B}/loja/os/nova?cliente=${emp.id}`);
      await p.fill('#os-nome_solicitante', 'Carlos');
      await p.fill('#os-placa', 'ABR1A11'); await p.fill('#os-marca_modelo', 'VW Gol');
      await p.check('input[name=local] >> nth=1');
      await p.fill('#os-endereco', 'Rua das Flores, 100'); await p.fill('#os-cidade', 'Campinas');
      await p.fill('#os-aberta_em', local(tres));
      await p.screenshot({ path: S + '/nova-os-abertura.png', fullPage: true });
      await p.click('aside button:has-text("Abrir OS")');
      await p.waitForURL(/\/loja\/os\/\d+\?nova=1/);
      const numero = Number(p.url().match(/os\/(\d+)/)[1]);
      const { data: o } = await adm.from('ordens_servico').select('id, aberta_em, prazo_em, alerta1_enviado, alerta2_enviado, vencida_notificada').eq('loja_id', L.id).eq('numero', numero).single();
      if (new Date(o.aberta_em).getTime() !== tres || new Date(o.prazo_em).getTime() !== tres + 48 * 3600e3) falha('abertura: ' + JSON.stringify(o));
      if (!o.alerta1_enviado || !o.alerta2_enviado || !o.vencida_notificada) falha('flags de alerta: ' + JSON.stringify(o));
      await p.waitForSelector(`text=${fmt(tres)}`);
      log(`OS aberta com data de 3 dias atrás (${fmt(tres)}): prazo = abertura + 48h; avisos que já teriam passado ficam marcados (sem rajada)`);

      // 2. Coluna “Abertura” na fila
      await p.goto(`${B}/loja`);
      const cel = await p.locator('table tbody tr:has-text("ABR1A11") td[data-rotulo="Abertura"]').innerText();
      if (cel.replace(/\s+/g, ' ').trim() !== fmt(tres)) falha('coluna Abertura: ' + cel);
      log('a fila tem a coluna “Abertura” com a data e hora');
      await p.screenshot({ path: S + '/fila-abertura.png' });

      // 3. Corrigir na ficha para 1 dia atrás → deixa de estar vencida
      const um = Math.floor((Date.now() - 86400e3) / 60e3) * 60e3;
      await p.goto(`${B}/loja/os/${numero}`);
      await p.click('section[aria-label="Ações da OS"] button:has-text("Abertura")');
      await p.fill('#ab-quando', local(um));
      await p.click('dialog[open] button:has-text("Salvar abertura")');
      await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 15000 });
      const { data: o2 } = await adm.from('ordens_servico').select('aberta_em, prazo_em, alerta1_enviado, alerta2_enviado, vencida_notificada').eq('id', o.id).single();
      const { data: h } = await adm.from('historico_os').select('de, para').eq('os_id', o.id).eq('evento', 'Abertura alterada').order('em', { ascending: false }).limit(1).single();
      if (new Date(o2.aberta_em).getTime() !== um || o2.vencida_notificada || o2.alerta2_enviado || !o2.alerta1_enviado || h.para !== fmt(um)) falha('corrigir: ' + JSON.stringify({ o2, h }));
      await p.waitForSelector('text=Vence em');
      log(`abertura corrigida na ficha para ${fmt(um)}: o prazo volta a correr (“Vence em…”); linha do tempo “Abertura alterada” ${h.de} → ${h.para}`);

      // 4. Limites e permissão
      const livre = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      await livre.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
      const comum = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      await comum.auth.signInWithPassword({ email: email('gestor-comum-a'), password: 'gestor-senha-123' });
      const eF = (await livre.rpc('alterar_abertura', { p_os: o.id, p_aberta_em: new Date(Date.now() + 86400e3).toISOString() })).error?.message;
      await livre.rpc('concluir_sem_laudo', { p_os: o.id, p_motivo: null });
      const eC = (await livre.rpc('alterar_abertura', { p_os: o.id, p_aberta_em: new Date(Date.now() + 60e3).toISOString() })).error?.message;
      const eP = (await comum.rpc('alterar_abertura', { p_os: o.id, p_aberta_em: new Date(tres).toISOString() })).error?.message;
      if (!eF?.includes('DATA_ABERTURA_FUTURA') || !eC?.includes('DATA_ABERTURA_DEPOIS_CONCLUSAO') || !eP?.includes('SEM_PERMISSAO')) falha(`limites: ${eF} | ${eC} | ${eP}`);
      log('abertura no futuro ou depois da conclusão é recusada; Gestor comum não altera (banco recusa)');

      const q = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(q, B, 'gestor-comum-a', 'gestor-senha-123', '/loja');
      await q.goto(`${B}/loja/os/nova?cliente=${emp.id}`);
      if (await q.locator('#os-aberta_em').count() || !(await q.locator('text=Abertura automática').count())) falha('Gestor comum vê o campo de abertura');
      log('para o Gestor comum a abertura continua automática');
    } finally { await b.close(); }
  } finally { if (!process.env.MANTER) await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
