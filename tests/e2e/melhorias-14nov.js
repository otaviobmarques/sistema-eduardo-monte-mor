// Melhorias de 14/11/2026: Pendências (mais novas primeiro, filtro por dia, marca/modelo após a placa), SLA em dias úteis
// (sem sábado, domingo e feriados), modo noturno e pausar/justificar em lote na Fila (ex.: todas de um pátio).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/melhorias-14nov.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };
const TZ = 3 * 3600e3;
const diaBR = (ms) => new Date(ms - TZ).toISOString().slice(0, 10);
// Última sexta-feira 08:00 (Brasília) antes de hoje
function ultimaSexta() { const d = new Date(Date.now() - TZ); let k = (d.getUTCDay() - 5 + 7) % 7 || 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - k, 8) + TZ; }

(async () => {
  const AMB = await lojaComGestor('Loja E2E 14nov', 'gestor-14nov');
  const L = AMB.loja;
  try {
    await adm.from('perfis_usuario').update({ conclusao_livre: true }).eq('login', AMB.gestor.login);
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente 14', nome_fantasia: 'Cliente 14' }).select('id').single();
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pats } = await adm.from('patios').select('id, nome').eq('loja_id', L.id).order('nome');
    const abrir = async (placa, modelo, patio = pats[0].id) => (await g.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: modelo, p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: patio, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null })).data[0];
    const a = await abrir('NOV1A11', 'Fiat Uno'), b2 = await abrir('NOV1A22', 'VW Gol'), c = await abrir('NOV1A33', 'Honda Civic'), d = await abrir('NOV1A44', 'Ford Ka', pats[1].id);
    const tresDias = Date.now() - 3 * 86400e3, umDia = Date.now() - 86400e3;
    await g.rpc('alterar_abertura', { p_os: a.id, p_aberta_em: new Date(tresDias).toISOString() });
    await g.rpc('alterar_abertura', { p_os: b2.id, p_aberta_em: new Date(umDia).toISOString() });
    const sexta = ultimaSexta();
    await g.rpc('alterar_abertura', { p_os: d.id, p_aberta_em: new Date(sexta).toISOString() });

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});

      // 1–3. Pendências: mais novas primeiro, marca/modelo após a placa, filtro por dia
      await p.goto(`${B}/loja/pendencias?tipo=a_vistoriar`);
      let placas = await p.$$eval('table tbody tr', (rs) => rs.map((r) => r.innerText.match(/NOV1A\d\d/)[0]));
      const atrasada = await p.$$eval('table tbody tr', (rs) => rs.length);
      await p.goto(`${B}/loja/pendencias`);
      placas = await p.$$eval('table tbody tr', (rs) => rs.map((r) => r.innerText.match(/NOV1A\d\d/)[0]));
      if (placas.join(',') !== 'NOV1A33,NOV1A22,NOV1A11,NOV1A44'.split(',').sort((x, y) => ({ NOV1A33: 0, NOV1A22: 1, NOV1A11: tresDias > sexta ? 2 : 3, NOV1A44: tresDias > sexta ? 3 : 2 }[x] - { NOV1A33: 0, NOV1A22: 1, NOV1A11: tresDias > sexta ? 2 : 3, NOV1A44: tresDias > sexta ? 3 : 2 }[y])).join(',')) falha('ordem: ' + placas);
      const cel = await p.locator('table tbody tr:has-text("NOV1A33") td[data-rotulo=Placa]').innerText();
      if (!cel.includes('Honda Civic')) falha('modelo: ' + cel);
      log(`Pendências: mais novas primeiro (${placas.join(', ')}) e marca/modelo embaixo da placa (${cel.replace(/\s+/g, ' ')})`);
      await p.fill('#pend-dia', diaBR(umDia)); await p.click('button:has-text("Filtrar dia")');
      await p.waitForURL(/dia=/);
      placas = await p.$$eval('table tbody tr', (rs) => rs.map((r) => r.innerText.match(/NOV1A\d\d/)[0]));
      const esperadas = [['NOV1A22', umDia], ['NOV1A11', tresDias], ['NOV1A44', sexta], ['NOV1A33', Date.now()]].filter(([, t]) => diaBR(t) === diaBR(umDia)).map(([pl]) => pl).sort();
      if (placas.slice().sort().join() !== esperadas.join()) falha(`filtro dia: ${placas} esperado ${esperadas}`);
      log(`filtro “Dia da abertura da OS” = ${diaBR(umDia).split('-').reverse().join('/')}: só as abertas nesse dia (${placas.join(', ')})`);
      await p.click('a:has-text("Mais urgentes primeiro")'); await p.waitForURL(/ordem=urgencia/);
      if (!p.url().includes('dia=')) falha('ordem perdeu o dia');
      log('opção “Mais urgentes primeiro” (fora do prazo no topo) mantém o filtro de dia');
      void atrasada;

      // 6. Fila: pausar e justificar em lote (todas do pátio)
      await p.goto(`${B}/loja?local=${encodeURIComponent('p:' + pats[0].nome)}`);
      await p.check('thead input[data-todas]');
      await p.waitForSelector('[aria-label="OS selecionadas"]:has-text("3 OS selecionadas")');
      await p.click('[aria-label="OS selecionadas"] button:has-text("Justificar atraso")');
      await p.selectOption('#lote-motivo-atraso', { index: 1 });
      await p.click('dialog[open] button:has-text("Justificar 3 OS")');
      await p.waitForSelector('text=3 OS justificadas', { timeout: 20000 });
      const { count: nj } = await adm.from('justificativas_atraso').select('id', { count: 'exact', head: true }).in('os_id', [a.id, b2.id, c.id]);
      if (nj !== 3) falha('justificativas: ' + nj);
      log(`pátio ${pats[0].nome}: “Justificar atraso” em lote nas 3 OS`);
      await p.check('thead input[data-todas]');
      await p.click('[aria-label="OS selecionadas"] button:has-text("Pausar prazo")');
      await p.fill('#lote-pausa', 'Pátio fechado para vistorias');
      await p.click('dialog[open] button:has-text("Pausar 3 OS")');
      await p.waitForSelector('text=3 OS pausadas', { timeout: 20000 });
      const { data: pz } = await adm.from('sla_pausas').select('os_id, motivo').eq('origem', 'manual').is('fim', null).in('os_id', [a.id, b2.id, c.id]);
      if (pz.length !== 3 || pz.some((x) => x.motivo !== 'Pátio fechado para vistorias')) falha('pausas: ' + JSON.stringify(pz));
      log('“Pausar prazo” em lote: as 3 OS do pátio pausadas com o motivo');

      // 4. SLA em dias úteis
      await p.goto(`${B}/loja/configuracoes`);
      await p.click('label:has-text("Dias úteis")');
      await p.click('button:has-text("Salvar configurações")');
      await p.waitForSelector('text=Configurações salvas');
      const { data: cfg } = await adm.from('configuracoes').select('contagem, horario_util').eq('loja_id', L.id).single();
      if (cfg.contagem !== 'uteis' || cfg.horario_util.inicio !== '00:00' || cfg.horario_util.fim !== '24:00') falha('config: ' + JSON.stringify(cfg));
      const { data: od } = await adm.from('ordens_servico').select('prazo_em').eq('id', d.id).single();
      const esperado = sexta + 4 * 86400e3; // sexta 08:00 + 16h (sex) + 24h (seg) + 8h (ter) = terça 08:00
      if (Math.abs(new Date(od.prazo_em).getTime() - esperado) > 60e3) falha(`prazo dias úteis: ${od.prazo_em} esperado ${new Date(esperado).toISOString()}`);
      log(`Configurações › “Dias úteis”: OS aberta na sexta 08:00 vence na terça 08:00 (sábado e domingo não contam)`);
      const { count: nf } = await adm.from('feriados').select('id', { count: 'exact', head: true }).eq('loja_id', L.id);
      log(`feriados cadastrados nesta Loja: ${nf} (os nacionais vêm prontos nas Lojas existentes; a Loja inclui os municipais)`);

      // 5. Modo noturno
      await p.click('button[aria-label="Mudar para o modo noturno"] >> visible=true');
      await p.reload();
      if (!(await p.evaluate(() => document.documentElement.classList.contains('dark')))) falha('modo noturno não ficou salvo');
      const fundo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await p.screenshot({ path: S + '/modo-noturno.png' });
      await p.click('button[aria-label="Mudar para o modo claro"] >> visible=true');
      if (await p.evaluate(() => document.documentElement.classList.contains('dark'))) falha('não voltou ao claro');
      log(`modo noturno: botão no topo, fica salvo ao recarregar (fundo ${fundo}) e volta ao claro`);
    } finally { await br.close(); }
  } finally { if (!process.env.MANTER) await limparLoja(L.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
