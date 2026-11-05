import Link from 'next/link';
import { Chips } from '@/components/os/tabela-os';
import { GradeKpi, Kpi } from '@/components/kpi';
import { Icone } from '@/components/icone';
import { moeda } from '@/lib/formato';
import { buscarPagamentos, fechamentoMensal, kpisFinanceiros } from '@/lib/financeiro';
import { mesAnterior, mesReferencia, mesSeguinte, nomeDoMes } from '@/lib/regras/financeiro';
import type { createClient } from '@/lib/supabase/server';
import { FaturarPendentes } from './baixa';
import { SeloPagamento, TabelaPagamentos } from './tabela';

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
type Sb = Awaited<ReturnType<typeof createClient>>;
export interface FiltrosFin { q?: string; situacao?: string; cliente?: string; mes?: string }

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString();
  return p ? `?${p}` : '?';
};

function SeletorCliente({ clientes, atual, extra }: { clientes: { id: string; nome: string }[]; atual: string; extra: Record<string, string | undefined> }) {
  return (
    <form className="flex items-end gap-2" method="get">
      {Object.entries(extra).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div>
        <label htmlFor="fin-cliente" className="rotulo">Cliente</label>
        <select id="fin-cliente" name="cliente" defaultValue={atual} className="campo min-w-[220px]">
          <option value="">Todos os clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <button className="btn btn-secundario">Filtrar</button>
    </form>
  );
}

async function listaClientes(sb: Sb) {
  const { data } = await sb.from('empresas_clientes').select('id, nome_fantasia, razao_social').order('razao_social');
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome_fantasia || c.razao_social }));
}

/** Aba “Pagamentos”: KPIs recebido × pendente, filtros e tabela por placa. */
export async function PagamentosTela({ sb, modo, f }: { sb: Sb; modo: 'loja' | 'cliente'; f: FiltrosFin }) {
  const mesAtual = mesReferencia(null);
  const situacao = ['pendente', 'pago', 'faturado', 'todas'].includes(f.situacao ?? '') ? f.situacao! : 'pendente';
  const cliente = modo === 'loja' ? f.cliente ?? '' : '';
  const [{ todas, linhas }, k, clientes] = await Promise.all([
    buscarPagamentos(sb, { cliente, q: f.q, situacao: situacao === 'todas' ? '' : situacao }),
    kpisFinanceiros(sb, mesAtual, cliente),
    modo === 'loja' ? listaClientes(sb) : Promise.resolve([]),
  ]);
  // Pendentes: só as já concluídas (as em andamento ainda vão ter o valor congelado no laudo)
  const lista = situacao === 'pendente' ? linhas.filter((l) => l.status === 'vistoriado') : linhas;
  const conta = (s: string) => todas.filter((l) => l.pagamento_status === s && (s !== 'pendente' || l.status === 'vistoriado')).length;
  const extra = { q: f.q || undefined, cliente: cliente || undefined };

  return (
    <div className="space-y-6">
      <GradeKpi>
        <Kpi rotulo={modo === 'loja' ? 'A receber' : 'A pagar'} valor={moeda(k.pendente.total)} detalhe={`${k.pendente.qtd} placa${k.pendente.qtd === 1 ? '' : 's'} vistoriada${k.pendente.qtd === 1 ? '' : 's'}`} tom={k.pendente.total > 0 ? 'alerta' : undefined} />
        <Kpi rotulo={`Pago em ${nomeDoMes(mesAtual).split(' ')[0]}`} valor={moeda(k.baixados.pago)} detalhe={`${k.baixados.qtdPago} placa${k.baixados.qtdPago === 1 ? '' : 's'}`} tom="escuro" />
        <Kpi rotulo={`Faturado em ${nomeDoMes(mesAtual).split(' ')[0]}`} valor={moeda(k.baixados.faturado)} detalhe={`${k.baixados.qtdFaturado} placa${k.baixados.qtdFaturado === 1 ? '' : 's'}`} />
        <Kpi rotulo="Vistoriadas no mês" valor={k.concluidas.qtd} detalhe={moeda(k.concluidas.total)} />
      </GradeKpi>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <form className="relative w-full md:max-w-md" role="search" method="get">
          {Object.entries({ situacao: situacao === 'pendente' ? undefined : situacao, cliente: cliente || undefined }).filter(([, v]) => v).map(([kk, v]) => <input key={kk} type="hidden" name={kk} value={v} />)}
          <label htmlFor="busca-fin" className="rotulo">Buscar</label>
          <input id="busca-fin" name="q" defaultValue={f.q ?? ''} className="campo" placeholder="Placa ou nº da OS" />
        </form>
        {modo === 'loja' && <SeletorCliente clientes={clientes} atual={cliente} extra={{ q: f.q, situacao: situacao === 'pendente' ? undefined : situacao }} />}
      </div>
      <Chips param="situacao" atual={situacao === 'pendente' ? '' : situacao} extra={extra}
        opcoes={[
          { valor: '', rotulo: 'Pendentes', qtd: conta('pendente') }, { valor: 'pago', rotulo: 'Pagas', qtd: conta('pago') },
          { valor: 'faturado', rotulo: 'Faturadas', qtd: conta('faturado') }, { valor: 'todas', rotulo: 'Todas', qtd: todas.length },
        ]} />
      {situacao === 'pendente' && modo === 'loja' && <p className="text-sm text-text-secondary">Placas já vistoriadas que ainda não foram pagas nem faturadas. Selecione várias para dar baixa de uma vez.</p>}
      <TabelaPagamentos modo={modo} linhas={lista} />
    </div>
  );
}

/** Aba “Fechamento mensal”: OS vistoriadas no mês por cliente, com totais e exportação. */
export async function FechamentoTela({ sb, modo, f }: { sb: Sb; modo: 'loja' | 'cliente'; f: FiltrosFin }) {
  const mes = mesReferencia(f.mes);
  const cliente = modo === 'loja' ? f.cliente ?? '' : '';
  const [{ linhas, grupos, totais }, clientes] = await Promise.all([fechamentoMensal(sb, mes, cliente), modo === 'loja' ? listaClientes(sb) : Promise.resolve([])]);
  const base = modo === 'loja' ? '/loja/financeiro/fechamento' : '/app/financeiro/fechamento';
  const exportar = `/api/financeiro/fechamento${qs({ mes, cliente: cliente || undefined })}`;
  const atual = mesReferencia(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <nav className="flex items-center gap-2" aria-label="Mês do fechamento">
          <Link className="btn btn-secundario btn-sm px-3" href={`${base}${qs({ mes: mesAnterior(mes), cliente: cliente || undefined })}`} aria-label={`Mês anterior: ${nomeDoMes(mesAnterior(mes))}`}><Icone nome="voltar" /></Link>
          <h2 className="h3 min-w-[220px] text-center">{maiuscula(nomeDoMes(mes))}</h2>
          {mes < atual
            ? <Link className="btn btn-secundario btn-sm px-3" href={`${base}${qs({ mes: mesSeguinte(mes), cliente: cliente || undefined })}`} aria-label={`Próximo mês: ${nomeDoMes(mesSeguinte(mes))}`}><Icone nome="voltar" className="h-5 w-5 rotate-180" /></Link>
            : <span className="btn btn-sm px-3 opacity-0" aria-hidden><Icone nome="voltar" /></span>}
        </nav>
        <div className="flex flex-wrap items-end gap-3">
          {modo === 'loja' && <SeletorCliente clientes={clientes} atual={cliente} extra={{ mes }} />}
          <a href={exportar} className="btn btn-primario" download><Icone nome="download" />Exportar Excel</a>
        </div>
      </div>

      <GradeKpi>
        <Kpi rotulo="Vistoriadas" valor={totais.qtd} tom="escuro" />
        <Kpi rotulo="Total do mês" valor={moeda(totais.total)} />
        <Kpi rotulo="Pago + faturado" valor={moeda(totais.pago + totais.faturado)} detalhe={`${totais.qtdPago + totais.qtdFaturado} placas`} />
        <Kpi rotulo="Pendente" valor={moeda(totais.pendente)} detalhe={`${totais.qtdPendente} placa${totais.qtdPendente === 1 ? '' : 's'}`} tom={totais.pendente > 0 ? 'alerta' : undefined} />
      </GradeKpi>

      {grupos.length === 0 ? <div className="card p-10 text-center text-text-secondary">Nenhuma OS vistoriada em {nomeDoMes(mes)}.</div> : (
        <>
          {modo === 'loja' && (
            <section className="card p-6" aria-labelledby="fech-clientes">
              <h2 id="fech-clientes" className="h3 mb-4">Por cliente</h2>
              <div className="overflow-x-auto">
                <table className="tabela tabela-cartoes">
                  <thead><tr><th scope="col">Cliente</th><th scope="col">Cobrança</th><th scope="col" className="!text-right">OS</th><th scope="col" className="!text-right">Total</th><th scope="col" className="!text-right">Pago</th><th scope="col" className="!text-right">Faturado</th><th scope="col" className="!text-right">Pendente</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.empresa_id}>
                        <td data-rotulo="Cliente" className="font-semibold">{g.cliente}</td>
                        <td data-rotulo="Cobrança">{g.forma_cobranca === 'faturado' ? 'Faturado' : 'Avulso'}</td>
                        <td data-rotulo="OS" className="text-right tabular-nums">{g.totais.qtd}</td>
                        <td data-rotulo="Total" className="text-right font-semibold tabular-nums">{moeda(g.totais.total)}</td>
                        <td data-rotulo="Pago" className="text-right tabular-nums">{moeda(g.totais.pago)}</td>
                        <td data-rotulo="Faturado" className="text-right tabular-nums">{moeda(g.totais.faturado)}</td>
                        <td data-rotulo="Pendente" className={`text-right tabular-nums ${g.totais.pendente > 0 ? 'font-semibold text-error' : ''}`}>{moeda(g.totais.pendente)}</td>
                        <td data-rotulo="" className="!text-right">
                          <FaturarPendentes cliente={g.cliente} os={g.linhas.filter((l) => l.pagamento_status === 'pendente').map((l) => ({ id: l.id, numero: l.numero, placa: l.placa, valor: l.valor }))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section aria-labelledby="fech-placas" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="fech-placas" className="h3">Placas vistoriadas</h2>
              <span className="flex flex-wrap gap-2 text-sm text-text-secondary">
                <SeloPagamento s="pago" /> {totais.qtdPago} <SeloPagamento s="faturado" /> {totais.qtdFaturado} <SeloPagamento s="pendente" /> {totais.qtdPendente}
              </span>
            </div>
            <TabelaPagamentos modo={modo} linhas={linhas} />
          </section>
        </>
      )}
    </div>
  );
}
