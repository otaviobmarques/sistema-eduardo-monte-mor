// Agendamento em lote na Fila de OS: filtrar por pátio, selecionar todas (ou uma), alocar um vistoriador num dia com
// hora inicial e intervalo; cada OS vira “Agendada”, aparece na Agenda e a já agendada pede motivo de reagendamento.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/agendar-lote.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const hm = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(11, 16);

(async () => {
  const AMB = await lojaComGestor('Loja E2E Lote Agenda', 'gestor-lote');
  const L = AMB.loja;
  try {
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Lote', nome_fantasia: 'Cliente LT' }).select('id').single();
    const { data: vists } = await adm.from('vistoriadores').insert([{ loja_id: L.id, nome: 'Carlos Vistoriador' }, { loja_id: L.id, nome: 'Paula Vistoriadora' }]).select('id, nome');
    const carlos = vists.find((v) => v.nome.startsWith('Carlos')), paula = vists.find((v) => v.nome.startsWith('Paula'));
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pats } = await adm.from('patios').select('id, nome').eq('loja_id', L.id).order('nome');
    const abrir = async (placa, patio) => (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: patio, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const PX = pats[0], PY = pats[1];
    const x = [await abrir('LTA1A11', PX.id), await abrir('LTA1A22', PX.id), await abrir('LTA1A33', PX.id)];
    const y = await abrir('LTA1A44', PY.id);
    // Uma do pátio X já estava agendada com a Paula
    await g.rpc('agendar_os', { p_os: x[2].id, p_data_hora: new Date(Date.now() + 2 * 86400e3).toISOString(), p_local: null, p_vistoriador: paula.id, p_motivo: null, p_motivo_texto: null });
    const dia = new Date(Date.now() - 3 * 3600e3 + 86400e3).toISOString().slice(0, 10);

    const b = await chromium.launch();
    try {
      const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // Filtra pelo pátio X e seleciona todas
      await p.goto(`${B}/loja?local=${encodeURIComponent('p:' + PX.nome)}`);
      if ((await p.locator('table tbody tr').count()) !== 3) falha('filtro do pátio');
      await p.check('thead input[data-todas]');
      await p.waitForSelector('[aria-label="OS selecionadas"]:has-text("3 OS selecionadas · 1 já agendada")');
      await p.screenshot({ path: S + '/lote-selecao.png', fullPage: true });
      log(`fila filtrada pelo pátio ${PX.nome}: “selecionar todas” marca as 3 (1 já agendada)`);

      await p.click('[aria-label="OS selecionadas"] button:has-text("Agendar vistoria")');
      await p.selectOption('#lote-vistoriador_id', carlos.id);
      await p.fill('#lote-data', dia); await p.fill('#lote-hora', '08:00');
      await p.selectOption('#lote-intervalo', '20');
      await p.click('dialog[open] button:has-text("Agendar 3 OS")');
      await p.waitForSelector('#lote-motivo_id-msg.erro-campo');
      log('com OS já agendada, pede o motivo do reagendamento');
      await p.selectOption('#lote-motivo_id', { index: 1 });
      await p.screenshot({ path: S + '/lote-modal.png' });
      await p.click('dialog[open] button:has-text("Agendar 3 OS")');
      await p.waitForSelector('text=3 OS agendadas', { timeout: 20000 });
      const { data: ags } = await adm.from('os_agendamentos').select('os_id, data_hora, vistoriador_id, versao').eq('atual', true).in('os_id', x.map((o) => o.id));
      const horas = x.map((o) => ags.find((a) => a.os_id === o.id)).map((a) => `${hm(a.data_hora)}${a.vistoriador_id === carlos.id ? '' : '!'}`);
      const { data: etapas } = await adm.from('ordens_servico').select('etapa').in('id', x.map((o) => o.id));
      if (horas.slice().sort().join(',') !== '08:00,08:20,08:40' || etapas.some((e) => e.etapa !== 'agendada') || ags.find((a) => a.os_id === x[2].id).versao !== 2) falha('agendamentos: ' + JSON.stringify({ horas, etapas, ags }));
      log(`3 OS do pátio ${PX.nome} com Carlos em ${dia.split('-').reverse().join('/')}: ${horas.slice().sort().join(', ')} (intervalo de 20 min); etapa “Agendada”; a que já tinha virou versão 2`);
      await p.waitForSelector(`table tbody tr:has-text("LTA1A11") td[data-rotulo=Status]:has-text("Carlos Vistoriador")`);
      log('a fila mostra o agendamento em cada linha (dia, hora e vistoriador)');

      // Agenda do Carlos no dia
      await p.goto(`${B}/loja/agenda?visao=dia&data=${dia}&vistoriador=${carlos.id}`);
      for (const pl of ['LTA1A11', 'LTA1A22', 'LTA1A33']) await p.waitForSelector(`text=${pl}`);
      await p.screenshot({ path: S + '/lote-agenda.png', fullPage: true });
      log('as 3 placas aparecem na Agenda do Carlos naquele dia');

      // Seleção de uma só (pátio Y)
      await p.goto(`${B}/loja`);
      await p.check(`table tbody tr:has-text("LTA1A44") input[name=os]`);
      await p.click('[aria-label="OS selecionadas"] button:has-text("Agendar vistoria")');
      await p.selectOption('#lote-vistoriador_id', paula.id);
      await p.fill('#lote-data', dia); await p.fill('#lote-hora', '14:30');
      await p.click('dialog[open] button:has-text("Agendar 1 OS")');
      await p.waitForSelector('text=1 OS agendada', { timeout: 20000 });
      const { data: ay } = await adm.from('os_agendamentos').select('data_hora, vistoriador_id, local_texto').eq('os_id', y.id).eq('atual', true).single();
      if (hm(ay.data_hora) !== '14:30' || ay.vistoriador_id !== paula.id || ay.local_texto !== PY.nome) falha('única: ' + JSON.stringify(ay));
      log(`seleção de uma OS: Paula às 14:30 no ${PY.nome} (local = pátio da OS)`);
    } finally { await b.close(); }
  } finally { if (!process.env.MANTER) await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
