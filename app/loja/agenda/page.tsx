import type { Metadata } from 'next';
import Link from 'next/link';
import { StatusSelo } from '@/components/os/status';
import { Cabecalho } from '@/components/ui';
import { Icone } from '@/components/icone';
import { hora } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Agenda' };

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somar = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const diaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const rotuloDia = (d: string) => `${DIAS[diaSemana(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const diaBR = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ data?: string; visao?: string; vistoriador?: string }> }) {
  const f = await searchParams;
  const visao = f.visao === 'dia' ? 'dia' : 'semana';
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(f.data ?? '') ? f.data! : hojeBR();
  const inicio = visao === 'dia' ? ref : somar(ref, -((diaSemana(ref) + 6) % 7)); // semana começa na segunda
  const dias = visao === 'dia' ? [inicio] : Array.from({ length: 7 }, (_, i) => somar(inicio, i));
  const fim = somar(dias.at(-1)!, 1);

  const supabase = await createClient();
  const [{ data: vist }, { data: ags }] = await Promise.all([
    supabase.from('vistoriadores').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('os_agendamentos')
      .select('id, data_hora, local_texto, vistoriador_id, ordens_servico!inner(numero, placa, marca_modelo, status, etapa, cidade, empresas_clientes(nome_fantasia, razao_social))')
      .eq('atual', true).neq('ordens_servico.status', 'cancelado')
      .gte('data_hora', `${inicio}T00:00:00-03:00`).lt('data_hora', `${fim}T00:00:00-03:00`).order('data_hora'),
  ]);
  const vistoriadores = (vist ?? []).filter((v) => !f.vistoriador || v.id === f.vistoriador);
  type Ag = NonNullable<typeof ags>[number];
  const porCelula = new Map<string, Ag[]>();
  for (const a of ags ?? []) {
    const k = `${a.vistoriador_id}|${diaBR(a.data_hora)}`;
    porCelula.set(k, [...(porCelula.get(k) ?? []), a]);
  }
  const qs = (o: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ visao, data: ref, vistoriador: f.vistoriador, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const passo = visao === 'dia' ? 1 : 7;
  const hoje = hojeBR();

  const Cartao = ({ a }: { a: Ag }) => {
    const os = a.ordens_servico as unknown as { numero: number; placa: string; marca_modelo: string | null; status: 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado'; etapa: 'aberta' | 'agendada' | 'em_execucao' | 'laudo_em_elaboracao' | null; cidade: string | null; empresas_clientes: { nome_fantasia: string | null; razao_social: string } | null };
    return (
      <Link href={`/loja/os/${os.numero}`} className={`block rounded-campo border border-divider bg-white p-2 text-xs transition-colors duration-[120ms] hover:border-impact ${os.status === 'vistoriado' ? 'opacity-60' : ''}`}>
        <span className="flex items-center justify-between gap-2"><span className="font-display text-sm font-black">{hora(a.data_hora)}</span><span className="font-semibold">{os.placa}</span></span>
        <span className="mt-0.5 block truncate">{os.marca_modelo ?? '—'}</span>
        <span className="block truncate text-text-secondary">{a.local_texto ?? os.cidade} · {os.empresas_clientes?.nome_fantasia || os.empresas_clientes?.razao_social}</span>
        {visao === 'dia' && <span className="mt-1 block"><StatusSelo status={os.status} etapa={os.etapa} /></span>}
      </Link>
    );
  };

  return (
    <>
      <Cabecalho kicker="Operação" titulo="Agenda" descricao="Vistorias agendadas por vistoriador. Clique para abrir a OS."
        acoes={<Link href={`/loja/relatorios/agenda?de=${dias[0]}&ate=${dias.at(-1)}${f.vistoriador ? `&vistoriador=${f.vistoriador}` : ''}`} className="btn btn-secundario"><Icone nome="relatorio" className="h-4 w-4" />Relatório da agenda</Link>} />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs({ data: somar(ref, -passo) })} className="btn btn-secundario btn-sm" aria-label={visao === 'dia' ? 'Dia anterior' : 'Semana anterior'}>←</Link>
          <Link href={qs({ data: hoje })} className="btn btn-secundario btn-sm">Hoje</Link>
          <Link href={qs({ data: somar(ref, passo) })} className="btn btn-secundario btn-sm" aria-label={visao === 'dia' ? 'Próximo dia' : 'Próxima semana'}>→</Link>
          <p className="ml-2 font-display text-xl font-extrabold">{visao === 'dia' ? rotuloDia(ref) : `${rotuloDia(dias[0])} – ${rotuloDia(dias[6])}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form className="flex items-center gap-2">
            <input type="hidden" name="visao" value={visao} /><input type="hidden" name="data" value={ref} />
            <label htmlFor="ag-vist" className="sr-only">Vistoriador</label>
            <select id="ag-vist" name="vistoriador" className="campo h-btn-sm w-auto" defaultValue={f.vistoriador ?? ''}>
              <option value="">Todos os vistoriadores</option>{(vist ?? []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
            <button className="btn btn-secundario btn-sm">Filtrar</button>
          </form>
          <nav className="abas" aria-label="Visão">
            <Link className="aba" href={qs({ visao: 'dia' })} aria-current={visao === 'dia' ? 'page' : undefined}>Dia</Link>
            <Link className="aba" href={qs({ visao: 'semana' })} aria-current={visao === 'semana' ? 'page' : undefined}>Semana</Link>
          </nav>
        </div>
      </div>

      {vistoriadores.length === 0 ? (
        <div className="card p-10 text-center text-text-secondary">Nenhum vistoriador ativo. <Link className="font-semibold text-action underline" href="/loja/cadastros/vistoriadores">Cadastre um vistoriador</Link>.</div>
      ) : visao === 'semana' ? (
        <div className="overflow-x-auto rounded-card border border-divider bg-white">
          <table className="w-full min-w-[960px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="w-44 bg-brand-graphite px-3 py-3 text-left text-xs font-semibold uppercase text-white">Vistoriador</th>
                {dias.map((d) => <th key={d} scope="col" className={`px-2 py-3 text-left text-xs font-semibold uppercase ${d === hoje ? 'bg-action text-white' : 'bg-brand-graphite text-white'}`}>{rotuloDia(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {vistoriadores.map((v) => (
                <tr key={v.id} className="border-t border-divider align-top">
                  <th scope="row" className="px-3 py-3 text-left font-semibold">{v.nome}</th>
                  {dias.map((d) => (
                    <td key={d} className={`space-y-2 p-2 ${d === hoje ? 'bg-error-bg/40' : ''}`}>
                      {(porCelula.get(`${v.id}|${d}`) ?? []).map((a) => <Cartao key={a.id} a={a} />)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vistoriadores.map((v) => {
            const lista = porCelula.get(`${v.id}|${ref}`) ?? [];
            return (
              <section key={v.id} className="card p-4" aria-label={v.nome}>
                <h2 className="mb-3 flex items-center justify-between font-display text-lg font-extrabold">{v.nome}<span className="text-sm font-semibold text-text-secondary">{lista.length} vistoria{lista.length === 1 ? '' : 's'}</span></h2>
                {lista.length ? <div className="space-y-2">{lista.map((a) => <Cartao key={a.id} a={a} />)}</div> : <p className="text-sm text-text-secondary">Livre.</p>}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
