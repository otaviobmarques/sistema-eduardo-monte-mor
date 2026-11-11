import Link from 'next/link';
import { Chips } from './tabela-os';
import { Placa } from './placa';
import { ResolverPendencia, ResponderPendencia, RetomarPrazo } from './operacoes';
import { SlaPilula } from './status';
import { getSessao } from '@/lib/sessao';
import { buscarOs } from '@/lib/fila';
import { GradeKpi, Kpi } from '@/components/kpi';
import { data as fmtData, dataHora, ETAPA_LABEL } from '@/lib/formato';
import { TIPO_PENDENCIA_LABEL } from '@/lib/operacao';
import { formatarDuracao } from '@/lib/regras/sla';
import type { createClient } from '@/lib/supabase/server';

type Sb = Awaited<ReturnType<typeof createClient>>;
type OsResumo = { numero: number; placa: string; aberta_em: string; cliente?: string | null };

/** Uma linha da tabela: pendência, pausa manual ou OS a vistoriar (no prazo ou fora dele). */
interface Linha {
  chave: string;
  grupo: 'atrasada' | 'pendencia' | 'pausa' | 'a_vistoriar';
  tipo: string; // usado no filtro: 'atrasada' | 'a_vistoriar' | 'pausa' | tipo da pendência
  ordem: number;
  os: OsResumo;
  titulo: React.ReactNode;
  detalhe: React.ReactNode;
  responsavel: string;
  haMs: number | null;
  resolvidaEm?: string | null;
  previsao: React.ReactNode;
  alerta: boolean;
  acao: React.ReactNode;
}

const FILTROS_OS = { atrasada: 'Fora do prazo', a_vistoriar: 'A vistoriar', pausa: 'Pausa manual' } as const;
const duasLinhas = (d: string) => <>{dataHora(d).slice(0, 10)}<span className="block text-xs text-text-secondary">{dataHora(d).slice(11)}</span></>;

export async function ListaPendencias({ supabase, modo, tipo, ver }: { supabase: Sb; modo: 'loja' | 'cliente'; tipo: string; ver: string }) {
  const resolvidas = ver === 'resolvidas';
  // Na Loja (abertas) a lista traz tudo o que falta resolver: OS fora do prazo, a vistoriar, pausas manuais e pendências
  const completa = modo === 'loja' && !resolvidas;
  let q = supabase.from('pendencias')
    .select('id, tipo, descricao, responsavel, previsao, created_at, resolvida_em, resolucao_texto, resposta_cliente, ordens_servico!inner(numero, placa, marca_modelo, status, aberta_em, empresas_clientes(nome_fantasia, razao_social))')
    .order('created_at', { ascending: resolvidas ? false : true }).limit(500);
  q = resolvidas ? q.not('resolvida_em', 'is', null) : q.is('resolvida_em', null);
  const [{ data }, { data: pausasManuais }, sessao, aVistoriar] = await Promise.all([
    q,
    completa
      ? supabase.from('sla_pausas').select('id, os_id, inicio, motivo, ordens_servico!inner(id, numero, placa, marca_modelo, status, aberta_em, empresas_clientes(nome_fantasia, razao_social))')
          .eq('origem', 'manual').is('fim', null).in('ordens_servico.status', ['a_vistoriar', 'frustrado']).order('inicio').limit(500)
      : Promise.resolve({ data: [] as never[] }),
    completa ? getSessao() : Promise.resolve(null),
    completa ? buscarOs(supabase, { status: ['a_vistoriar'], limite: 1000 }).then((r) => r.linhas) : Promise.resolve([]),
  ]);
  const pendencias = data ?? [];
  const podeRetomar = !!sessao?.perfil.conclusao_livre;
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const vencida = (p: (typeof pendencias)[number]) => !p.resolvida_em && !!p.previsao && p.previsao < hoje;
  const base = modo === 'loja' ? '/loja' : '/app';
  const agora = Date.now();
  const nomeCliente = (e: { nome_fantasia: string | null; razao_social: string } | null) => e?.nome_fantasia || e?.razao_social;
  type OsBanco = { id: string; aberta_em: string; numero: number; placa: string; empresas_clientes: { nome_fantasia: string | null; razao_social: string } | null };

  const linhas: Linha[] = [];
  for (const p of pendencias) {
    const os = p.ordens_servico as unknown as OsBanco;
    const v = vencida(p);
    linhas.push({
      chave: p.id, grupo: 'pendencia', tipo: p.tipo, ordem: v ? 1 : 2,
      os: { numero: os.numero, placa: os.placa, aberta_em: os.aberta_em, cliente: nomeCliente(os.empresas_clientes) },
      titulo: TIPO_PENDENCIA_LABEL[p.tipo as keyof typeof TIPO_PENDENCIA_LABEL],
      detalhe: <>
        <span className="block text-sm">{p.descricao}</span>
        {p.resposta_cliente && <span className="mt-1 block text-xs text-info">Resposta do cliente: {p.resposta_cliente}</span>}
        {p.resolucao_texto && <span className="mt-1 block text-xs text-ok">Resolução: {p.resolucao_texto}</span>}
      </>,
      responsavel: p.responsavel === 'cliente' ? 'Cliente' : 'Auto Visão',
      haMs: agora - new Date(p.created_at).getTime(), resolvidaEm: p.resolvida_em,
      previsao: p.previsao ? <span className={v ? 'font-semibold text-error' : ''}>{v && <span aria-hidden>■ </span>}{fmtData(p.previsao)}{v && <span className="sr-only"> (vencida)</span>}</span> : '—',
      alerta: v,
      acao: <>
        {!resolvidas && modo === 'loja' && <ResolverPendencia id={p.id} numero={os.numero} compacto />}
        {!resolvidas && modo === 'cliente' && p.responsavel === 'cliente' && <div className="min-w-[240px] text-left"><ResponderPendencia id={p.id} numero={os.numero} /></div>}
      </>,
    });
  }
  for (const pz of pausasManuais ?? []) {
    const os = pz.ordens_servico as unknown as OsBanco;
    linhas.push({
      chave: `pausa-${pz.id}`, grupo: 'pausa', tipo: 'pausa', ordem: 3,
      os: { numero: os.numero, placa: os.placa, aberta_em: os.aberta_em, cliente: nomeCliente(os.empresas_clientes) },
      titulo: 'Pausa manual',
      detalhe: <>
        <span className="block text-sm">{pz.motivo || 'Sem motivo informado'}</span>
        <span className="mt-1 block text-xs text-text-secondary">Prazo parado; a OS continua “A vistoriar”.</span>
      </>,
      responsavel: 'Auto Visão', haMs: agora - new Date(pz.inicio).getTime(), previsao: '—', alerta: false,
      acao: podeRetomar ? <RetomarPrazo osId={os.id} numero={os.numero} /> : <Link href={`${base}/os/${os.numero}`} className="btn btn-texto btn-sm">Abrir OS</Link>,
    });
  }
  // OS “A vistoriar” com o prazo correndo (as pausadas já aparecem como pendência ou pausa manual)
  for (const o of aVistoriar.filter((x) => !x.sla.pausada)) {
    const atrasada = o.sla.cor === 'vermelho';
    linhas.push({
      chave: `os-${o.id}`, grupo: atrasada ? 'atrasada' : 'a_vistoriar', tipo: atrasada ? 'atrasada' : 'a_vistoriar',
      // Fora do prazo no topo (a mais atrasada primeiro); as do prazo por último, a mais perto de vencer primeiro
      ordem: (atrasada ? 0 : 4) + Math.max(-0.999, Math.min(0.999, o.sla.restanteMs / 1e12)),
      os: { numero: o.numero, placa: o.placa, aberta_em: o.aberta_em, cliente: o.cliente },
      titulo: atrasada ? 'Fora do prazo' : 'A vistoriar',
      detalhe: <>
        <span className="mt-1 block"><SlaPilula sla={o.sla} compacta /></span>
        <span className="mt-1 block text-xs text-text-secondary">{[o.etapa ? `Etapa: ${ETAPA_LABEL[o.etapa]}` : null, o.local].filter(Boolean).join(' · ')}</span>
      </>,
      responsavel: 'Auto Visão', haMs: agora - new Date(o.aberta_em).getTime(),
      previsao: o.sla.prazo ? <span className={atrasada ? 'font-semibold text-error' : ''}>{atrasada && <span aria-hidden>■ </span>}{dataHora(o.sla.prazo)}{atrasada && <span className="sr-only"> (prazo vencido)</span>}</span> : '—',
      alerta: atrasada,
      acao: <Link href={`${base}/os/${o.numero}`} className="btn btn-texto btn-sm">Abrir OS</Link>,
    });
  }
  linhas.sort((a, b) => a.ordem - b.ordem);

  const qtd = (t: string) => linhas.filter((l) => l.tipo === t).length;
  const qtdPendencias = linhas.filter((l) => l.grupo === 'pendencia').length;
  const filtroValido = tipo in TIPO_PENDENCIA_LABEL || (completa && (tipo in FILTROS_OS || tipo === 'pendencias'));
  const atual = filtroValido ? tipo : '';
  const lista = !atual ? linhas : atual === 'pendencias' ? linhas.filter((l) => l.grupo === 'pendencia') : linhas.filter((l) => l.tipo === atual);

  const opcoes = [
    { valor: '', rotulo: 'Todas', qtd: linhas.length },
    ...(completa ? [
      { valor: 'atrasada', rotulo: FILTROS_OS.atrasada, qtd: qtd('atrasada') },
      { valor: 'a_vistoriar', rotulo: FILTROS_OS.a_vistoriar, qtd: qtd('a_vistoriar') },
      { valor: 'pausa', rotulo: FILTROS_OS.pausa, qtd: qtd('pausa') },
      { valor: 'pendencias', rotulo: 'Pendências', qtd: qtdPendencias },
    ] : []),
    ...Object.entries(TIPO_PENDENCIA_LABEL).map(([k, v]) => ({ valor: k, rotulo: v, qtd: qtd(k) })),
  ];

  return (
    <div className="space-y-6">
      {!resolvidas && (completa ? (
        <GradeKpi>
          <Kpi rotulo="Fora do prazo" valor={qtd('atrasada')} tom={qtd('atrasada') ? 'alerta' : undefined} detalhe={qtd('atrasada') ? 'a vistoriar com o prazo vencido' : 'nenhuma atrasada'} />
          <Kpi rotulo="A vistoriar" valor={qtd('a_vistoriar')} tom="escuro" detalhe="dentro do prazo" />
          <Kpi rotulo="Pausa manual" valor={qtd('pausa')} detalhe="prazo parado" />
          <Kpi rotulo="Pendências" valor={qtdPendencias}
            detalhe={`${pendencias.filter(vencida).length} com previsão vencida · ${pendencias.filter((p) => p.responsavel === 'cliente').length} com o cliente`} />
        </GradeKpi>
      ) : (
        <GradeKpi>
          <Kpi rotulo="Abertas" valor={pendencias.length} tom="escuro" />
          <Kpi rotulo="Previsão vencida" valor={pendencias.filter(vencida).length} tom={pendencias.some(vencida) ? 'alerta' : undefined} />
          <Kpi rotulo={modo === 'loja' ? 'Com o cliente' : 'Aguardam você'} valor={pendencias.filter((p) => p.responsavel === 'cliente').length} />
          <Kpi rotulo={modo === 'loja' ? 'Com a Loja' : 'Com a Auto Visão'} valor={pendencias.filter((p) => p.responsavel === 'loja').length} />
        </GradeKpi>
      ))}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Chips param="tipo" atual={atual} extra={{ ver: ver || undefined }}
          opcoes={opcoes.filter((o) => o.valor === '' || o.qtd > 0 || o.valor === atual || (completa && (o.valor in FILTROS_OS || o.valor === 'pendencias')))} />
        <nav className="abas" aria-label="Situação">
          <Link className="aba" href="?" aria-current={!resolvidas ? 'page' : undefined}>Abertas</Link>
          <Link className="aba" href="?ver=resolvidas" aria-current={resolvidas ? 'page' : undefined}>Resolvidas</Link>
        </nav>
      </div>
      {lista.length === 0 ? (
        <div className="card p-10 text-center text-text-secondary">{resolvidas ? 'Nenhuma pendência resolvida.' : completa ? 'Nada pendente neste filtro.' : 'Nenhuma pendência aberta. 🎉'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-cartoes">
            <thead><tr>
              <th scope="col">Placa</th>{modo === 'loja' && <th scope="col">Cliente</th>}<th scope="col">Abertura da OS</th><th scope="col">Pendência</th>
              <th scope="col">Responsável</th><th scope="col">{resolvidas ? 'Resolvida' : 'Aberta há'}</th><th scope="col">{completa ? 'Previsão / prazo' : 'Previsão'}</th><th scope="col"><span className="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.chave} className={l.alerta ? 'shadow-[inset_4px_0_0_#B42318]' : ''} data-tipo={l.tipo}>
                  <td data-rotulo="Placa"><Link href={`${base}/os/${l.os.numero}`} className="inline-flex flex-col items-end gap-1 md:items-start"><Placa placa={l.os.placa} tamanho="sm" /><span className="text-xs text-text-secondary">OS {l.os.numero}</span></Link></td>
                  {modo === 'loja' && <td data-rotulo="Cliente">{l.os.cliente}</td>}
                  <td data-rotulo="Abertura da OS" className="whitespace-nowrap text-sm">{duasLinhas(l.os.aberta_em)}</td>
                  <td data-rotulo="Pendência" className="max-w-md"><span className={`font-semibold ${l.grupo === 'atrasada' ? 'text-error' : ''}`}>{l.titulo}</span>{l.detalhe}</td>
                  <td data-rotulo="Responsável">{l.responsavel}</td>
                  <td data-rotulo={resolvidas ? 'Resolvida' : 'Aberta há'} className="whitespace-nowrap">{resolvidas ? fmtData(l.resolvidaEm) : l.haMs !== null ? formatarDuracao(l.haMs) : '—'}</td>
                  <td data-rotulo={completa ? 'Previsão / prazo' : 'Previsão'} className="whitespace-nowrap">{l.previsao}</td>
                  <td data-rotulo="" className="text-right">{l.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
