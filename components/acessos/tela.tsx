import Link from 'next/link';
import { Kpi } from '@/components/kpi';
import { Selo } from '@/components/ui';
import { dataHora } from '@/lib/formato';
import type { createClient } from '@/lib/supabase/server';

type Sb = Awaited<ReturnType<typeof createClient>>;
export interface FiltrosAcesso { q?: string; resultado?: string; de?: string; ate?: string }

/** Resume o navegador/sistema do user-agent (sem guardar nada além do que já está no registro). */
export function navegador(ua: string | null): string {
  if (!ua) return '—';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /node|undici|curl|python/i.test(ua) ? 'Script' : 'Outro';
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return so ? `${nav} · ${so}` : nav;
}

/** Registro de acessos (logins com sucesso e falhas). A RLS limita: Gestor vê a própria Loja; Administrador vê tudo. */
export async function TelaAcessos({ sb, f, admin }: { sb: Sb; f: FiltrosAcesso; admin?: boolean }) {
  const termo = (f.q ?? '').trim().toLowerCase().replace(/[%,()]/g, '');
  let q = sb.from('acessos_log').select('id, login, ip, user_agent, em, sucesso, motivo, lojas(nome)').order('em', { ascending: false }).limit(300);
  if (termo) q = q.or(`login.ilike.%${termo}%,ip.ilike.%${termo}%`);
  if (f.resultado === 'falha') q = q.eq('sucesso', false);
  if (f.resultado === 'sucesso') q = q.eq('sucesso', true);
  if (f.de && /^\d{4}-\d{2}-\d{2}$/.test(f.de)) q = q.gte('em', `${f.de}T00:00:00-03:00`);
  if (f.ate && /^\d{4}-\d{2}-\d{2}$/.test(f.ate)) q = q.lte('em', `${f.ate}T23:59:59-03:00`);
  const desde24 = new Date(Date.now() - 86_400_000).toISOString();
  const desde15 = new Date(Date.now() - 15 * 60_000).toISOString();
  const [{ data: linhas }, { count: ok24 }, { count: falhas24 }, { data: recentes }] = await Promise.all([
    q,
    sb.from('acessos_log').select('id', { count: 'exact', head: true }).eq('sucesso', true).gte('em', desde24),
    sb.from('acessos_log').select('id', { count: 'exact', head: true }).eq('sucesso', false).gte('em', desde24),
    sb.from('acessos_log').select('login').eq('sucesso', false).gte('em', desde15).limit(1000),
  ]);
  const porLogin = new Map<string, number>();
  for (const r of recentes ?? []) if (r.login) porLogin.set(r.login, (porLogin.get(r.login) ?? 0) + 1);
  const travados = [...porLogin.entries()].filter(([, n]) => n >= 5).map(([l]) => l);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi rotulo="Entradas nas últimas 24h" valor={ok24 ?? 0} tom="escuro" />
        <Kpi rotulo="Falhas nas últimas 24h" valor={falhas24 ?? 0} tom={(falhas24 ?? 0) >= 10 ? 'alerta' : undefined} />
        <Kpi rotulo="Usuários travados agora" valor={travados.length} detalhe={travados.length ? travados.join(', ') : '5 falhas em 15 min travam o login'} tom={travados.length ? 'alerta' : undefined} />
      </div>
      <form method="get" className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_170px_170px_auto] lg:items-end" aria-label="Filtros">
        <div><label htmlFor="ac-q" className="rotulo">Usuário ou IP</label><input id="ac-q" name="q" defaultValue={f.q ?? ''} className="campo" placeholder="Ex.: creditas" /></div>
        <div>
          <label htmlFor="ac-res" className="rotulo">Resultado</label>
          <select id="ac-res" name="resultado" defaultValue={f.resultado ?? ''} className="campo"><option value="">Todos</option><option value="sucesso">Entrou</option><option value="falha">Falhou</option></select>
        </div>
        <div><label htmlFor="ac-de" className="rotulo">De</label><input id="ac-de" name="de" type="date" defaultValue={f.de ?? ''} className="campo" /></div>
        <div><label htmlFor="ac-ate" className="rotulo">Até</label><input id="ac-ate" name="ate" type="date" defaultValue={f.ate ?? ''} className="campo" /></div>
        <button className="btn btn-primario">Filtrar</button>
      </form>
      {!linhas?.length ? <div className="card p-10 text-center text-text-secondary">Nenhum acesso com esses filtros.</div> : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-cartoes">
            <thead><tr><th scope="col">Quando</th><th scope="col">Usuário</th>{admin && <th scope="col">Loja</th>}<th scope="col">Resultado</th><th scope="col">IP</th><th scope="col">Navegador</th></tr></thead>
            <tbody>
              {linhas.map((a) => (
                <tr key={a.id}>
                  <td data-rotulo="Quando" className="whitespace-nowrap">{dataHora(a.em)}</td>
                  <td data-rotulo="Usuário" className="font-semibold">{a.login ?? '—'}</td>
                  {admin && <td data-rotulo="Loja">{(a.lojas as unknown as { nome: string } | null)?.nome ?? '—'}</td>}
                  <td data-rotulo="Resultado">
                    {a.sucesso ? <Selo tom="ok"><span aria-hidden>●</span>Entrou</Selo> : <span className="inline-flex flex-col items-end gap-1 md:items-start"><Selo tom="erro"><span aria-hidden>■</span>Falhou</Selo>{a.motivo && <span className="text-xs text-text-secondary">{a.motivo}</span>}</span>}
                  </td>
                  <td data-rotulo="IP" className="font-mono text-xs">{a.ip ?? '—'}</td>
                  <td data-rotulo="Navegador" className="text-sm">{navegador(a.user_agent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-text-secondary">Mostra os 300 mais recentes do filtro. O registro é guardado por 180 dias.{admin ? '' : ' Inclui tentativas com usuários da sua Loja.'} <Link href="?" className="underline">Limpar filtros</Link></p>
    </div>
  );
}
