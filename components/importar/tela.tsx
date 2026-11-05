import Link from 'next/link';
import { Placa } from '@/components/os/placa';
import { Aviso, Cabecalho } from '@/components/ui';
import { dataHora, hora } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';
import { EnvioForm } from './envio-form';
import { Passos } from './passos';
import { Previa, type LinhaPrevia } from './previa';

export async function TelaImportar({ modo, loteId, empresaFixa, nomeEmpresa }: { modo: 'loja' | 'cliente'; loteId?: string; empresaFixa?: string; nomeEmpresa?: string }) {
  const supabase = await createClient();
  const base = modo === 'loja' ? '/loja/importar' : '/app/importar';
  const cab = <Cabecalho kicker={modo === 'loja' ? 'Fila de OS' : 'Vistorias'} titulo={modo === 'loja' ? 'Importar lote' : 'Importar planilha'}
    descricao="Várias placas de uma vez: envie a planilha, confira a prévia e crie todas as OS com o mesmo horário de abertura." />;

  const lote = loteId && /^[0-9a-f-]{36}$/.test(loteId)
    ? (await supabase.from('lotes_importacao').select('id, status, arquivo_nome, nome_solicitante, criado_em, confirmado_em, validas, empresas_clientes(nome_fantasia, razao_social)').eq('id', loteId).maybeSingle()).data
    : null;

  if (!lote) {
    const [{ data: recentes }, empresas] = await Promise.all([
      supabase.from('lotes_importacao').select('id, status, arquivo_nome, nome_solicitante, criado_em, total, validas, empresas_clientes(nome_fantasia, razao_social)').order('criado_em', { ascending: false }).limit(8),
      modo === 'loja' ? supabase.from('empresas_clientes').select('id, razao_social, nome_fantasia').eq('ativo', true).order('razao_social') : Promise.resolve({ data: null }),
    ]);
    return (
      <>
        {cab}
        <Passos atual={2} />
        {loteId && <div className="mb-6"><Aviso tipo="erro" titulo="Lote não encontrado">Envie a planilha de novo.</Aviso></div>}
        <EnvioForm empresas={empresas.data?.map((e) => ({ id: e.id, nome: e.nome_fantasia || e.razao_social }))} empresaFixa={empresaFixa} nomeEmpresa={nomeEmpresa} />
        {!!recentes?.length && (
          <section className="mt-10">
            <h2 className="h3 mb-3">Envios recentes</h2>
            <div className="overflow-x-auto">
              <table className="tabela tabela-cartoes">
                <thead><tr><th scope="col">Enviado em</th>{modo === 'loja' && <th scope="col">Cliente</th>}<th scope="col">Arquivo</th><th scope="col">Solicitante</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Abrir</span></th></tr></thead>
                <tbody>
                  {recentes.map((l) => {
                    const e = l.empresas_clientes as unknown as { nome_fantasia: string | null; razao_social: string } | null;
                    return (
                      <tr key={l.id}>
                        <td data-rotulo="Enviado em" className="whitespace-nowrap">{dataHora(l.criado_em)}</td>
                        {modo === 'loja' && <td data-rotulo="Cliente">{e?.nome_fantasia || e?.razao_social}</td>}
                        <td data-rotulo="Arquivo" className="max-w-[220px] truncate">{l.arquivo_nome}</td>
                        <td data-rotulo="Solicitante">{l.nome_solicitante}</td>
                        <td data-rotulo="Situação">{l.status === 'confirmado' ? `${l.validas} OS criadas` : l.status === 'previa' ? `Prévia · ${l.total} linhas` : 'Descartado'}</td>
                        <td data-rotulo="" className="text-right">{l.status !== 'descartado' && <Link className="btn btn-texto btn-sm" href={`?lote=${l.id}`}>{l.status === 'previa' ? 'Continuar' : 'Ver'}</Link>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </>
    );
  }

  const emp = lote.empresas_clientes as unknown as { nome_fantasia: string | null; razao_social: string } | null;
  if (lote.status === 'confirmado') {
    const { data: criadas } = await supabase.from('lote_linhas').select('linha, os_id, ordens_servico(numero, placa, marca_modelo)').eq('lote_id', lote.id).not('os_id', 'is', null).order('linha');
    const osBase = modo === 'loja' ? '/loja/os' : '/app/os';
    return (
      <>
        {cab}
        <Passos atual={4} />
        <div className="mb-6"><Aviso tipo="ok" titulo={`${lote.validas} OS criadas · ${emp?.nome_fantasia || emp?.razao_social}`}>
          Todas com abertura às {hora(lote.confirmado_em)} de {dataHora(lote.confirmado_em).slice(0, 10)}. {modo === 'cliente' ? 'A Auto Visão já foi avisada.' : ''}
        </Aviso></div>
        <div className="mb-4 flex flex-wrap gap-3">
          <Link href={modo === 'loja' ? '/loja' : '/app'} className="btn btn-primario">{modo === 'loja' ? 'Ir para a fila' : 'Acompanhar no painel'}</Link>
          <Link href={base} className="btn btn-secundario">Importar outra planilha</Link>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(criadas ?? []).map((c) => {
            const o = c.ordens_servico as unknown as { numero: number; placa: string; marca_modelo: string | null } | null;
            return o && (
              <li key={c.linha}><Link href={`${osBase}/${o.numero}`} className="card flex items-center gap-3 p-3 hover:border-impact">
                <Placa placa={o.placa} tamanho="sm" /><span className="min-w-0"><span className="block text-xs text-text-secondary">OS {o.numero}</span><span className="block truncate text-sm font-medium">{o.marca_modelo}</span></span>
              </Link></li>
            );
          })}
        </ul>
      </>
    );
  }
  if (lote.status === 'descartado') {
    return (<>{cab}<Aviso tipo="info" titulo="Prévia descartada">Nenhuma OS foi criada. <Link className="font-semibold underline" href={base}>Enviar outra planilha</Link></Aviso></>);
  }

  const [{ data: linhas }, { data: patios }, { data: servicos }] = await Promise.all([
    supabase.from('lote_linhas').select('id, linha, dados_originais, placa_normalizada, placa_corrigida, renavam, modelo, patio_id, servico_id, observacao, resultado, mensagens').eq('lote_id', lote.id).order('linha'),
    supabase.from('patios').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('servicos').select('id, nome, padrao').eq('ativo', true).order('nome'),
  ]);
  return (
    <>
      {cab}
      <Passos atual={3} />
      {modo === 'loja' && <p className="mb-4 font-semibold">Cliente: {emp?.nome_fantasia || emp?.razao_social}</p>}
      <Previa loteId={lote.id} arquivo={lote.arquivo_nome ?? ''} solicitante={lote.nome_solicitante} base={base}
        linhas={(linhas ?? []) as LinhaPrevia[]} patios={patios ?? []} servicos={servicos ?? []} />
    </>
  );
}
