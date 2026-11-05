import Link from 'next/link';
import type { SlaConfig, SlaEntrada, SlaResultado } from '@/lib/regras/sla';
import { PAGAMENTO_LABEL } from '@/lib/formato';
import { BaixarAnexo } from './ficha-acoes';
import { Placa } from './placa';
import { corBarraSla, StatusSelo } from './status';
import { SlaAoVivo } from './sla-ao-vivo';

export interface LinhaOs {
  id: string; numero: number; placa: string; marca_modelo: string | null; status: 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado';
  etapa: 'aberta' | 'agendada' | 'em_execucao' | 'laudo_em_elaboracao' | null; aberta_em: string; nome_solicitante: string;
  cidade: string | null; local: string | null; cliente?: string | null; pagamento_status: 'pendente' | 'pago' | 'faturado';
  sla: SlaResultado; entrada: SlaEntrada; laudo?: { id: string; nome: string } | null;
}

export function TabelaOs({ linhas, modo, vazio, cfg }: { linhas: LinhaOs[]; modo: 'loja' | 'cliente'; vazio: React.ReactNode; cfg: SlaConfig }) {
  const base = modo === 'loja' ? '/loja' : '/app';
  if (!linhas.length) return <div className="card p-10 text-center text-text-secondary">{vazio}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="tabela tabela-cartoes">
        <thead>
          <tr>
            <th scope="col">Placa</th><th scope="col">Veículo</th>
            {modo === 'loja' && <th scope="col">Cliente</th>}
            <th scope="col">Local</th><th scope="col">Status</th><th scope="col">Prazo</th>
            {modo === 'cliente' && <th scope="col">Pagamento</th>}
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((o) => (
            <tr key={o.id} className={corBarraSla(o.sla.cor)}>
              <td data-rotulo="Placa">
                <Link href={`${base}/os/${o.numero}`} className="inline-flex flex-col items-end gap-1 md:items-start" aria-label={`OS ${o.numero}, placa ${o.placa}`}>
                  <Placa placa={o.placa} tamanho="sm" />
                  <span className="text-xs text-text-secondary">OS {o.numero}</span>
                </Link>
              </td>
              <td data-rotulo="Veículo"><span className="font-medium">{o.marca_modelo ?? '—'}</span><span className="block text-xs text-text-secondary">{o.nome_solicitante}</span></td>
              {modo === 'loja' && <td data-rotulo="Cliente">{o.cliente}</td>}
              <td data-rotulo="Local">{o.local ?? '—'}<span className="block text-xs text-text-secondary">{o.cidade}</span></td>
              <td data-rotulo="Status"><StatusSelo status={o.status} etapa={modo === 'loja' ? o.etapa : null} /></td>
              <td data-rotulo="Prazo">
                <SlaAoVivo entrada={o.entrada} cfg={cfg} compacta comPrazo />
              </td>
              {modo === 'cliente' && <td data-rotulo="Pagamento">{PAGAMENTO_LABEL[o.pagamento_status]}</td>}
              <td data-rotulo="" className="whitespace-nowrap text-right">
                <div className="flex justify-end gap-2">
                  {o.laudo && <BaixarAnexo id={o.laudo.id} nome={o.laudo.nome} />}
                  <Link href={`${base}/os/${o.numero}`} className="btn btn-texto btn-sm">Abrir</Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Chips({ opcoes, atual, param, extra = {} }: { opcoes: { valor: string; rotulo: string; qtd?: number }[]; atual: string; param: string; extra?: Record<string, string | undefined> }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filtro">
      {opcoes.map((o) => {
        const qs = new URLSearchParams(Object.entries({ ...extra, [param]: o.valor || undefined }).filter(([, v]) => v) as [string, string][]);
        const ativo = atual === o.valor;
        return (
          <Link key={o.valor} href={`?${qs}`} aria-current={ativo ? 'true' : undefined}
            className={`inline-flex min-h-toque items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-semibold transition-colors duration-[120ms] ${ativo ? 'border-impact bg-impact text-white' : 'border-border bg-white hover:bg-surface'}`}>
            {o.rotulo}{o.qtd !== undefined && <span className={`rounded-full px-2 text-xs ${ativo ? 'bg-white/20' : 'bg-surface'}`}>{o.qtd}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Busca({ valor, placeholder, extra = {} }: { valor: string; placeholder: string; extra?: Record<string, string | undefined> }) {
  return (
    <form className="relative w-full md:max-w-md" role="search">
      {Object.entries(extra).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="busca-os" className="sr-only">Buscar</label>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3" /></svg>
      <input id="busca-os" name="q" defaultValue={valor} className="campo pl-10" placeholder={placeholder} />
    </form>
  );
}
