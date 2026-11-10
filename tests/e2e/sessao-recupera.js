// Sessão que não cai sozinha: quando o servidor não reconhece o acesso mas o navegador ainda guarda a sessão,
// /sessao renova pelo navegador e volta à página; sessão morta vai ao login (sem ficar em volta). Duas sessões do
// mesmo usuário (dois aparelhos) funcionam ao mesmo tempo e “Sair” num não derruba o outro.
// Uso: npm run build && npm start -- -p 3100; depois: node tests/e2e/sessao-recupera.js
const { chromium } = require('playwright');
const { lojaComGestor, limparLoja, entrar, adm } = require('./apoio');
const B = process.env.BASE_URL ?? 'http://localhost:3100';
const log = (...a) => console.log('✔', ...a);
const falha = (m) => { throw new Error(m); };

async function lerSessao(ctx) {
  const cs = (await ctx.cookies()).filter((c) => c.name.includes('auth-token')).sort((a, b) => a.name.localeCompare(b.name));
  const json = JSON.parse(Buffer.from(cs.map((c) => c.value).join('').replace(/^base64-/, ''), 'base64url').toString());
  return { cs, json };
}
async function gravarSessao(ctx, cs, json) {
  const novo = 'base64-' + Buffer.from(JSON.stringify(json)).toString('base64url');
  await ctx.clearCookies({ name: /auth-token/ });
  const base = cs[0].name.replace(/\.\d+$/, '');
  const partes = novo.match(/.{1,3180}/g);
  await ctx.addCookies(partes.map((v, i) => ({ ...cs[0], name: partes.length > 1 ? `${base}.${i}` : base, value: v })));
}

(async () => {
  const AMB = await lojaComGestor('Loja E2E Sessão', 'gestor-sessao');
  const b = await chromium.launch();
  try {
    // Dois “aparelhos” com o mesmo usuário
    const c1 = await b.newContext({ viewport: { width: 1280, height: 900 } }), c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p1 = await c1.newPage(), p2 = await c2.newPage();
    await entrar(p1, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
    await entrar(p2, B, AMB.gestor.login, AMB.gestor.senha, '/loja');
    await p1.goto(B + '/loja/pendencias'); await p2.goto(B + '/loja/agenda');
    if (!p1.url().endsWith('/loja/pendencias') || !p2.url().endsWith('/loja/agenda')) falha('duas sessões');
    log('mesmo usuário em dois aparelhos ao mesmo tempo: os dois navegam');

    // Acesso que o servidor não aceita, mas sessão ainda válida no navegador → reconecta e volta à página
    const { cs, json } = await lerSessao(c1);
    json.access_token = json.access_token.slice(0, -8) + 'xxxxxxxx';
    await gravarSessao(c1, cs, json);
    await p1.goto(B + '/loja/relatorios?tipo=patio');
    await p1.waitForURL('**/loja/relatorios?tipo=patio', { timeout: 20000 });
    log('acesso recusado pelo servidor: “Reconectando…” renova pelo navegador e volta para /loja/relatorios?tipo=patio');
    await p1.goto(B + '/loja/clientes');
    if (!p1.url().endsWith('/loja/clientes')) falha('depois de reconectar: ' + p1.url());
    log('depois de reconectar segue navegando normalmente');

    // O outro aparelho continua ativo
    await p2.goto(B + '/loja/pendencias');
    if (!p2.url().endsWith('/loja/pendencias')) falha('2º aparelho caiu: ' + p2.url());
    log('o 2º aparelho não foi afetado');

    // Sessão morta de verdade (encerrada no servidor) → login, sem ficar em volta
    const { cs: cs2, json: j2 } = await lerSessao(c2);
    await adm.auth.admin.signOut(j2.access_token, 'local').catch(() => {});
    j2.access_token = j2.access_token.slice(0, -8) + 'xxxxxxxx';
    await gravarSessao(c2, cs2, j2);
    await p2.goto(B + '/loja');
    await p2.waitForURL('**/login**', { timeout: 20000 });
    await p2.waitForSelector('text=Sua sessão terminou neste aparelho');
    log('sessão encerrada de fato: vai para o login com aviso (sem voltas infinitas)');
    await p1.goto(B + '/loja');
    if (!p1.url().endsWith('/loja')) falha('1º aparelho caiu junto: ' + p1.url());
    log('e o 1º aparelho continua conectado');
  } finally { await b.close(); if (!process.env.MANTER) await limparLoja(AMB.loja.id); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });
