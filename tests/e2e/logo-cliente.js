// Logotipo do cliente (14/11/2026): a Loja envia no cadastro do cliente e ele aparece no portal do cliente (menu e painel).
// Uso: npm run build && npm start -- -p 3100; depois: S=pasta node tests/e2e/logo-cliente.js
const { chromium } = require('playwright');
const fs = require('fs');
const { adm, limparLoja, entrar, lojaComGestor, criarUsuario, semPopupLeitura } = require('./apoio');
const S = process.env.S ?? '/tmp', B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const AMB = await lojaComGestor('Loja E2E Logo', 'gestor-logo');
  const OUTRA = await lojaComGestor('Loja E2E Logo 2', 'gestor-logo2');
  const L = AMB.loja;
  try {
    const { data: emps } = await adm.from('empresas_clientes').insert([
      { loja_id: L.id, cnpj: '11222333000181', razao_social: 'Cliente Logo SA', nome_fantasia: 'Cliente Logo' },
      { loja_id: L.id, cnpj: '11444777000161', razao_social: 'Vizinho SA', nome_fantasia: 'Vizinho' },
    ]).select('id, nome_fantasia');
    const emp = emps.find((e) => e.nome_fantasia === 'Cliente Logo'), viz = emps.find((e) => e.nome_fantasia === 'Vizinho');
    await criarUsuario({ login: 'cliente-logo', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: emp.id });
    await criarUsuario({ login: 'cliente-vizinho', senha: 'cliente-senha-123', perfil: 'cliente', lojaId: L.id, empresaId: viz.id });

    const br = await chromium.launch();
    try {
      // Imagem PNG de teste (gerada pelo próprio navegador) e um arquivo que não é imagem
      const aux = await (await br.newContext()).newPage();
      await aux.setContent('<div id="l" style="width:300px;height:100px;background:linear-gradient(90deg,#0a7,#06c);color:#fff;font:bold 40px sans-serif;display:flex;align-items:center;justify-content:center">LOGO</div>');
      const png = `${S}/logo-teste.png`, txt = `${S}/logo-falso.png`;
      fs.writeFileSync(png, await aux.locator('#l').screenshot());
      fs.writeFileSync(txt, 'isto não é uma imagem');

      const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await semPopupLeitura(p);
      await entrar(p, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
      for (let i = 0; i < 2; i++) await p.click('button:has-text("Agora não")', { timeout: 2500 }).catch(() => {});
      await p.goto(`${B}/loja/clientes/${emp.id}`);
      const sec = p.locator('[data-teste=logo-cliente]');
      await sec.locator('input[type=file]').setInputFiles(txt);
      await sec.locator('text=Use uma imagem PNG, JPG ou WEBP').waitFor({ timeout: 15000 });
      log('arquivo que não é imagem é recusado (“Use uma imagem PNG, JPG ou WEBP.”)');
      await sec.locator('input[type=file]').setInputFiles(png);
      await sec.locator('text=Logotipo salvo').waitFor({ timeout: 20000 });
      await sec.locator('img[alt="Logotipo de Cliente Logo"]').waitFor();
      const { data: e1 } = await adm.from('empresas_clientes').select('logo_path').eq('id', emp.id).single();
      if (!e1.logo_path?.startsWith(`${emp.id}/logo-`)) falha('logo_path: ' + e1.logo_path);
      await sec.screenshot({ path: `${S}/logo-cadastro.png` });
      log(`Loja enviou o logotipo no cadastro do cliente (prévia na tela; arquivo privado em ${e1.logo_path})`);

      const c = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
      await entrar(c, B, 'cliente-logo', 'cliente-senha-123', '/app');
      for (const sel of ['[data-teste=logo-cliente-hero] img', '[data-teste=logo-cliente-menu] img']) {
        await c.waitForSelector(sel);
        const w = await c.$eval(sel, (i) => i.complete && i.naturalWidth);
        if (!w) falha('imagem não carregou: ' + sel);
      }
      await c.screenshot({ path: `${S}/logo-portal.png` });
      log('no portal do cliente o logotipo aparece no painel (“Olá, Cliente Logo”) e no menu');

      const status = async (pg) => pg.evaluate(async (u) => (await fetch(u)).status, `/api/logo/${emp.id}`);
      const v = await (await br.newContext()).newPage();
      await entrar(v, B, 'cliente-vizinho', 'cliente-senha-123', '/app');
      const o = await (await br.newContext()).newPage();
      await entrar(o, B, OUTRA.gestor.login, OUTRA.gestor.senha);
      await o.waitForURL(/\/loja/);
      if ((await status(v)) !== 404 || (await status(o)) !== 404 || (await status(c)) !== 200) falha('acesso ao logo');
      if (await v.locator('[data-teste=logo-cliente-hero]').count()) falha('vizinho com logo');
      log('outro cliente da mesma Loja e a Gestão de outra Loja não acessam o logotipo (404); quem não tem logo segue sem');

      await p.locator('[data-teste=logo-cliente] button:has-text("Remover")').click();
      await p.locator('[data-teste=logo-cliente] >> text=Sem logotipo').waitFor({ timeout: 15000 });
      const { data: arqs } = await adm.storage.from('logos').list(emp.id);
      if (arqs?.length) falha('arquivo ficou no storage');
      await c.reload();
      if (await c.locator('[data-teste=logo-cliente-hero]').count()) falha('logo continuou no portal');
      log('“Remover” apaga o arquivo e o portal volta ao padrão');
    } finally { await br.close(); }
  } finally {
    await limparLoja(L.id); await limparLoja(OUTRA.loja.id);
  }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
