// Pop-up de confirmação de leitura (14/11/2026): cada OS/lote que chega no dia aparece num pop-up na Loja com caixa
// “Li e estou ciente”; a confirmação grava quem/quando e entra na linha do tempo. Quem abriu a própria OS não é chamado.
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/popup-leitura.js
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { adm, email, limparLoja, entrar, lojaComGestor, criarUsuario } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Popup', 'gestor-popup');
  const L = AMB.loja;
  try {
    const { data: emp } = await adm.from('empresas_clientes').insert({ loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Popup', nome_fantasia: 'Cliente Popup' }).select('id').single();
    await criarUsuario({ login: 'cliente-popup', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: emp.id });
    const cli = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await cli.auth.signInWithPassword({ email: email('cliente-popup'), password: 'cliente-senha-123' });
    const g = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data: sg } = await g.auth.signInWithPassword({ email: email(AMB.gestor.login), password: AMB.gestor.senha });
    const { data: serv } = await adm.from('servicos').select('id').eq('loja_id', L.id).eq('padrao', true).single();
    const { data: cat } = await adm.from('categorias_veiculo').select('id').order('ordem').limit(1).single();
    const { data: pat } = await adm.from('patios').select('id').eq('loja_id', L.id).limit(1).single();
    const abrir = async (sb, placa) => {
      const { data, error } = await sb.rpc('abrir_os', { p_empresa: emp.id, p_nome_solicitante: 'Ana', p_telefone: null, p_placa: placa, p_renavam: null, p_marca_modelo: 'Gol', p_ano: null, p_cor: null, p_categoria_id: cat.id, p_servico_id: serv.id, p_local_tipo: 'patio', p_patio_id: pat.id, p_endereco: null, p_cidade: null, p_uf: null, p_observacao: null });
      if (error) falha(error.message); return data[0];
    };
    const a = await abrir(cli, 'POP1A11');

    const br = await chromium.launch();
    try {
      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      const popup = p.locator('[data-teste=popup-leitura]');
      await popup.waitFor({ timeout: 15000 });
      if ((await popup.locator('[data-teste=item-leitura]').count()) !== 1) falha('itens iniciais');
      log('ao entrar, o pop-up mostra a OS que chegou hoje (POP1A11) com “Li e estou ciente”');
      await p.screenshot({ path: `${S}/popup-leitura.png` });

      await p.waitForTimeout(2500); // Realtime conectado
      const b = await abrir(cli, 'POP1A22');
      await popup.locator('[data-teste=item-leitura]:has-text("POP1A22")').waitFor({ timeout: 20000 });
      await abrir(g, 'POP1A33'); // aberta pelo próprio Gestor: não entra
      await p.waitForTimeout(4000);
      if (await popup.locator('[data-teste=item-leitura]:has-text("POP1A33")').count()) falha('OS do próprio gestor no pop-up');
      log('nova OS do cliente entra no pop-up na hora (Realtime); a aberta pelo próprio Gestor não');

      await popup.locator('button:has-text("Lembrar depois")').click();
      await p.locator('[data-teste=leitura-pendente]:has-text("2 vistorias sem confirmação")').click();
      if (!(await popup.locator('button:has-text("Confirmar leitura")').isDisabled())) falha('botão deveria estar desabilitado');
      log('“Lembrar depois” minimiza num aviso “2 vistorias sem confirmação de leitura”; Confirmar fica bloqueado sem marcar');

      await popup.locator('[data-teste=item-leitura]:has-text("POP1A11") input[type=checkbox]').check();
      await popup.locator('button:has-text("Confirmar leitura")').click();
      await popup.locator('[data-teste=item-leitura]:has-text("POP1A11")').waitFor({ state: 'detached', timeout: 15000 });
      const { data: na } = await adm.from('notificacoes').select('leitura_confirmada_em, leitura_confirmada_por, vista_em').eq('os_id', a.id).single();
      if (!na.leitura_confirmada_em || na.leitura_confirmada_por !== sg.user.id || !na.vista_em) falha('confirmação: ' + JSON.stringify(na));
      const { data: h } = await adm.from('historico_os').select('evento, nome_exibicao').eq('os_id', a.id).eq('evento', 'Leitura confirmada');
      if (h.length !== 1) falha('histórico');
      log(`POP1A11 confirmada: grava quem e quando (${h[0].nome_exibicao}) e “Leitura confirmada” na linha do tempo`);

      await popup.locator('label:has-text("Marcar todas") input').check();
      await popup.locator('button:has-text("Confirmar leitura")').click();
      await popup.waitFor({ state: 'detached', timeout: 15000 });
      await p.reload();
      await p.waitForTimeout(2500);
      if (await popup.count()) falha('pop-up voltou depois de confirmar');
      const { data: nb } = await adm.from('notificacoes').select('leitura_confirmada_em').eq('os_id', b.id).single();
      if (!nb.leitura_confirmada_em) falha('B não confirmada');
      log('“Marcar todas” + Confirmar fecha o pop-up; ao recarregar ele não volta');
    } finally { await br.close(); }
  } finally {
    await limparLoja(L.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
