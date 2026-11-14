import type { Metadata } from 'next';
import { Cabecalho } from '@/components/ui';
import { Placa } from '@/components/os/placa';
import { StatusSelo } from '@/components/os/status';
import { Kpi } from '@/components/kpi';
import { dataHora, hora } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Minhas vistorias' };
export const dynamic = 'force-dynamic';

interface Vistoria {
  os_id: string; numero: number; placa: string; marca_modelo: string | null; ano: string | null; cor: string | null;
  status: 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado'; etapa: 'aberta' | 'agendada' | 'em_execucao' | 'laudo_em_elaboracao' | null;
  agendada_para: string | null; local_agendado: string | null; patio: string | null; endereco: string | null; cidade: string | null; uf: string | null;
  cliente: string | null; unidade: string | null; observacao: string | null; prazo_em: string | null; concluida_em: string | null;
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const diaBR = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
const somar = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
function rotuloDia(d: string, hoje: string) {
  const base = `${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (d === hoje) return `Hoje · ${base}`;
  if (d === somar(hoje, 1)) return `Amanhã · ${base}`;
  if (d < hoje) return `${base} · passou`;
  return base;
}

export default async function MinhasVistoriasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('minhas_vistorias');
  const lista = (data ?? []) as Vistoria[];
  const hoje = diaBR(new Date().toISOString());
  const abertas = lista.filter((v) => v.status !== 'vistoriado');
  const feitas = lista.filter((v) => v.status === 'vistoriado');
  const grupos = new Map<string, Vistoria[]>();
  for (const v of abertas) {
    const k = v.agendada_para ? diaBR(v.agendada_para) : 'sem-data';
    grupos.set(k, [...(grupos.get(k) ?? []), v]);
  }
  const chaves = [...grupos.keys()].sort((a, b) => (a === 'sem-data' ? 1 : b === 'sem-data' ? -1 : a.localeCompare(b)));
  const deHoje = grupos.get(hoje)?.length ?? 0;

  return (
    <>
      <Cabecalho kicker="Vistoriador" titulo="Minhas vistorias" descricao="As placas designadas ou agendadas para você. Em caso de dúvida, fale com a Loja." />
      {error && <p role="alert" className="mb-4 rounded-campo border-l-4 border-error bg-error-bg px-4 py-3 text-error">Não foi possível carregar suas vistorias. Recarregue a página; se continuar, fale com a Loja.</p>}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Kpi rotulo="Hoje" valor={deHoje} detalhe="agendadas para hoje" tom="escuro" />
        <Kpi rotulo="A fazer" valor={abertas.length} detalhe="em andamento" />
        <Kpi rotulo="Feitas" valor={feitas.length} detalhe="nos últimos 7 dias" />
      </div>
      {!abertas.length && <p className="rounded-card border border-divider bg-white p-6 text-text-secondary">Nenhuma vistoria designada para você no momento.</p>}
      {chaves.map((k) => (
        <section key={k} className="mb-6" aria-labelledby={`dia-${k}`}>
          <h2 id={`dia-${k}`} className="mb-3 font-display text-xl font-extrabold text-text">{k === 'sem-data' ? 'Sem data marcada' : rotuloDia(k, hoje)} <span className="text-base font-semibold text-text-secondary">· {grupos.get(k)!.length}</span></h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {grupos.get(k)!.map((v) => <Cartao key={v.os_id} v={v} />)}
          </ul>
        </section>
      ))}
      {feitas.length > 0 && (
        <section className="mt-8" aria-labelledby="feitas">
          <h2 id="feitas" className="mb-3 font-display text-xl font-extrabold text-text">Feitas nos últimos 7 dias <span className="text-base font-semibold text-text-secondary">· {feitas.length}</span></h2>
          <ul className="grid gap-3 md:grid-cols-2">{feitas.map((v) => <Cartao key={v.os_id} v={v} />)}</ul>
        </section>
      )}
    </>
  );
}

function Cartao({ v }: { v: Vistoria }) {
  const local = v.local_agendado || [v.patio, v.endereco].filter(Boolean).join(' · ') || null;
  const busca = [v.local_agendado || v.endereco || v.patio, v.cidade, v.uf].filter(Boolean).join(', ');
  return (
    <li className="rounded-card border border-divider bg-white p-4" data-teste="vistoria">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Placa placa={v.placa} tamanho="sm" />
          <p className="mt-2 font-semibold text-text">{[v.marca_modelo, v.ano, v.cor].filter(Boolean).join(' · ') || 'Modelo não informado'}</p>
        </div>
        <StatusSelo status={v.status} etapa={v.etapa} />
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {v.agendada_para && <><dt className="text-text-secondary">Horário</dt><dd className="font-semibold text-text">{v.status === 'vistoriado' ? dataHora(v.agendada_para) : hora(v.agendada_para)}</dd></>}
        {local && <><dt className="text-text-secondary">Local</dt><dd className="text-text">{local}{v.cidade ? ` — ${v.cidade}${v.uf ? `/${v.uf}` : ''}` : ''}</dd></>}
        {v.cliente && <><dt className="text-text-secondary">Cliente</dt><dd className="text-text">{v.cliente}{v.unidade ? ` · ${v.unidade}` : ''}</dd></>}
        <dt className="text-text-secondary">OS</dt><dd className="text-text">nº {v.numero}</dd>
        {v.concluida_em && <><dt className="text-text-secondary">Concluída</dt><dd className="text-text">{dataHora(v.concluida_em)}</dd></>}
      </dl>
      {v.observacao && <p className="mt-3 rounded-campo border-l-4 border-warn bg-warn-bg px-3 py-2 text-sm text-text"><strong>Observação:</strong> {v.observacao}</p>}
      {busca && v.status !== 'vistoriado' && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`} target="_blank" rel="noopener noreferrer"
          className="btn btn-secundario btn-sm mt-3 w-full sm:w-auto">Abrir no mapa</a>
      )}
    </li>
  );
}
