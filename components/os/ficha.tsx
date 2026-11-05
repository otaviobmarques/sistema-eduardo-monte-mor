import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Aviso } from '@/components/ui';
import { CAMPOS_TECNICOS, ROTULO_CAMPO, valorLegivel } from '@/lib/auditoria';
import { data as fmtDataCurta, dataHora, ETAPA_LABEL, moeda, PAGAMENTO_LABEL, STATUS_LABEL, telefone } from '@/lib/formato';
import { carregarConfigSla, slaDaOs } from '@/lib/os-leitura';
import { formatarDuracao } from '@/lib/regras/sla';
import { createClient } from '@/lib/supabase/server';
import { BaixarAnexo, EditarVeiculo, EnviarAnexo, JustificarAtraso } from './ficha-acoes';
import { BarraSla, SlaAoVivo } from './sla-ao-vivo';
import { AcoesLoja, CancelarOs, Pendencias, type PendenciaVista } from './operacoes';
import { MarcarVistas } from '@/components/notificacoes';
import { BotaoPagamento } from '@/components/financeiro/baixa';
import { SeloPagamento } from '@/components/financeiro/tabela';
import { rotuloForma, valorDaOs } from '@/lib/regras/financeiro';
import { Placa } from './placa';
import { StatusSelo } from './status';

const TIPO_ANEXO = { laudo: 'Laudo', foto: 'Foto', documento: 'Documento', comprovante: 'Comprovante', justificativa: 'Justificativa' } as const;

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div><dt className="legenda">{rotulo}</dt><dd className="mt-1 break-words font-medium">{children || <span className="text-text-secondary">—</span>}</dd></div>;
}

export async function FichaOs({ numero, modo, nova }: { numero: string; modo: 'loja' | 'cliente'; nova?: boolean }) {
  if (!/^\d{1,12}$/.test(numero)) notFound();
  const supabase = await createClient();
  const { data: os } = await supabase.from('ordens_servico')
    .select('*, categorias_veiculo(nome), servicos(nome), patios(nome), empresas_clientes(razao_social, nome_fantasia), vistoriadores(nome), lotes_importacao(id, criado_em)')
    .eq('numero', Number(numero)).maybeSingle();
  if (!os) notFound();

  const [cfg, { data: pausas }, { data: historico }, { data: anexos }, { data: categorias }, { data: justificativas }, { data: motivosAtraso }] = await Promise.all([
    carregarConfigSla(supabase),
    supabase.from('sla_pausas').select('inicio, fim, origem').eq('os_id', os.id).order('inicio'),
    supabase.from('historico_os').select('id, evento, de, para, nome_exibicao, em').eq('os_id', os.id).order('em', { ascending: false }),
    supabase.from('anexos').select('id, tipo, nome_arquivo, versao, atual, enviado_em, tamanho_bytes').eq('os_id', os.id).order('enviado_em', { ascending: false }),
    modo === 'loja' ? supabase.from('categorias_veiculo').select('id, nome').order('ordem') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    supabase.from('justificativas_atraso').select('id, texto, criado_em, motivos(descricao)').eq('os_id', os.id).order('criado_em'),
    modo === 'loja' ? supabase.from('motivos').select('id, descricao').eq('tipo', 'atraso').eq('ativo', true).order('ordem') : Promise.resolve({ data: [] as { id: string; descricao: string }[] }),
  ]);
  const [{ data: agendamentos }, { data: pendencias }, { data: motivos }, { data: vistoriadores }, { data: cancelamento }] = await Promise.all([
    supabase.from('os_agendamentos').select('id, versao, data_hora, local_texto, vistoriador_id, atual, motivo_texto, created_at, vistoriadores(nome), motivos(descricao)').eq('os_id', os.id).order('versao', { ascending: false }),
    supabase.from('pendencias').select('id, tipo, descricao, responsavel, previsao, created_at, resolvida_em, resolucao_texto, resposta_cliente, respondida_em').eq('os_id', os.id).order('created_at', { ascending: false }),
    supabase.from('motivos').select('id, tipo, descricao').in('tipo', ['frustracao', 'cancelamento', 'reagendamento']).eq('ativo', true).order('ordem'),
    modo === 'loja' ? supabase.from('vistoriadores').select('id, nome').eq('ativo', true).order('nome') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    supabase.from('os_cancelamentos').select('solicitado_por_nome, descricao, data, motivos(descricao)').eq('os_id', os.id).maybeSingle(),
  ]);
  const porTipo = (t: string) => (motivos ?? []).filter((m) => m.tipo === t).map((m) => ({ id: m.id, descricao: m.descricao }));
  const agAtual = (agendamentos ?? []).find((a) => a.atual);
  const pendAbertas = (pendencias ?? []).filter((p) => !p.resolvida_em).length;
  const entradaSla = { aberta_em: os.aberta_em, sla_horas: os.sla_horas, status: os.status, concluida_em: os.concluida_em, cancelada_em: os.cancelada_em, pausas: pausas ?? [] };
  const sla = slaDaOs(os, cfg, pausas ?? []);
  const empresa = os.empresas_clientes as { razao_social: string; nome_fantasia: string | null } | null;
  const nomeEmpresa = empresa?.nome_fantasia || empresa?.razao_social;
  const base = modo === 'loja' ? '/loja' : '/app';

  // Auditoria campo a campo (só Loja)
  let auditoria: React.ReactNode = null;
  if (modo === 'loja') {
    const { data: aud } = await supabase.from('auditoria').select('id, tabela, campo, valor_anterior, valor_novo, usuario_id, em')
      .eq('registro_id', os.id).order('em', { ascending: false }).limit(300);
    const linhas = (aud ?? []).filter((a) => !CAMPOS_TECNICOS.has(a.campo));
    const ids = [...new Set(linhas.map((a) => a.usuario_id).filter(Boolean))] as string[];
    const [{ data: pessoas }, { data: vist }] = await Promise.all([
      ids.length ? supabase.from('perfis_usuario').select('user_id, nome_exibicao').in('user_id', ids) : Promise.resolve({ data: [] as { user_id: string; nome_exibicao: string }[] }),
      supabase.from('vistoriadores').select('id, nome'),
    ]);
    const nome = new Map((pessoas ?? []).map((p) => [p.user_id, p.nome_exibicao]));
    const ref = new Map<string, string>([...(categorias ?? []).map((c) => [c.id, c.nome] as [string, string]), ...(vist ?? []).map((x) => [x.id, x.nome] as [string, string])]);
    const legivel = (campo: string, v: string | null) => {
      if (v && campo === 'status') return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
      if (v && campo === 'etapa') return ETAPA_LABEL[v as keyof typeof ETAPA_LABEL] ?? v;
      if (v && campo === 'pagamento_status') return PAGAMENTO_LABEL[v as keyof typeof PAGAMENTO_LABEL] ?? v;
      if (v && ref.has(v)) return ref.get(v)!;
      return valorLegivel(campo, v);
    };
    auditoria = (
      <section className="card p-6" aria-labelledby="aud-titulo">
        <h2 id="aud-titulo" className="h3 mb-4">Auditoria</h2>
        {linhas.length === 0 ? <p className="text-text-secondary">Sem alterações registradas.</p> : (
          <div className="overflow-x-auto">
            <table className="tabela tabela-cartoes">
              <thead><tr><th scope="col">Quando</th><th scope="col">Campo</th><th scope="col">Antes</th><th scope="col">Depois</th><th scope="col">Quem</th></tr></thead>
              <tbody>
                {linhas.map((a) => (
                  <tr key={a.id}>
                    <td data-rotulo="Quando" className="whitespace-nowrap">{dataHora(a.em)}</td>
                    <td data-rotulo="Campo" className="font-semibold">{ROTULO_CAMPO[a.campo] ?? a.campo}</td>
                    <td data-rotulo="Antes" className="text-text-secondary">{legivel(a.campo, a.valor_anterior)}</td>
                    <td data-rotulo="Depois">{legivel(a.campo, a.valor_novo)}</td>
                    <td data-rotulo="Quem">{a.usuario_id ? nome.get(a.usuario_id) ?? 'Usuário' : 'Sistema'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  const laudoAtual = (anexos ?? []).find((a) => a.tipo === 'laudo' && a.atual);
  const comprovantes = (anexos ?? []).filter((a) => a.tipo === 'comprovante');
  const outrosAnexos = (anexos ?? []).filter((a) => a.tipo !== 'comprovante' && (modo === 'loja' ? true : a.tipo !== 'laudo' || a.atual));
  const tempoCancelada = os.status === 'cancelado' && os.cancelada_em ? formatarDuracao(Date.now() - new Date(os.cancelada_em).getTime()) : null;

  return (
    <div className="space-y-6">
      <MarcarVistas osId={os.id} />
      <Link href={base} className="btn btn-texto btn-sm -ml-3">← {modo === 'loja' ? 'Fila de OS' : 'Painel'}</Link>
      {nova && <Aviso tipo="ok" titulo={`OS nº ${os.numero} aberta`}>{modo === 'cliente' ? 'A Auto Visão já foi avisada. Acompanhe o prazo e o laudo por aqui.' : 'A OS entrou na fila.'}</Aviso>}

      <header className="card flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Placa placa={os.placa} tamanho="lg" />
          <div>
            <p className="rotulo-card">OS nº {os.numero}{modo === 'loja' && nomeEmpresa ? ` · ${nomeEmpresa}` : ''}</p>
            <h1 className="h2 mt-1">{os.marca_modelo ?? 'Modelo não informado'}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusSelo status={os.status} etapa={modo === 'loja' ? os.etapa : null} />
              <SlaAoVivo entrada={entradaSla} cfg={cfg} />
              {tempoCancelada && <span className="text-sm text-text-secondary">Cancelada há {tempoCancelada}</span>}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm md:text-right">
          <Dado rotulo="Abertura">{dataHora(os.aberta_em)}</Dado>
          <Dado rotulo={os.status === 'vistoriado' ? 'Concluída' : 'Prazo do laudo'}>{os.status === 'vistoriado' ? dataHora(os.concluida_em) : sla.prazo ? dataHora(sla.prazo) : 'Pausado'}</Dado>
        </dl>
      </header>

      {modo === 'loja' && (
        <AcoesLoja d={{
          os: { id: os.id, numero: os.numero, status: os.status, etapa: os.etapa, local: os.local_tipo === 'patio' ? (os.patios as { nome: string } | null)?.nome ?? '' : os.endereco ?? '' },
          vistoriadores: vistoriadores ?? [], motivos: { frustracao: porTipo('frustracao'), cancelamento: porTipo('cancelamento'), reagendamento: porTipo('reagendamento') },
          agendamento: agAtual ? { data_hora: agAtual.data_hora, vistoriador_id: agAtual.vistoriador_id, local_texto: agAtual.local_texto } : null,
          pendenciasAbertas: pendAbertas, precisaJustificar: sla.restanteMs < 0 && !justificativas?.length,
        }} />
      )}
      {modo === 'cliente' && (os.status === 'a_vistoriar' || os.status === 'frustrado') && (
        <div className="flex justify-end"><CancelarOs osId={os.id} numero={os.numero} motivos={porTipo('cancelamento')} cliente /></div>
      )}
      {cancelamento && (
        <Aviso tipo="info" titulo={`Cancelada · ${(cancelamento.motivos as unknown as { descricao: string } | null)?.descricao ?? ''}`}>
          Pedido por {cancelamento.solicitado_por_nome} em {dataHora(cancelamento.data)}. {cancelamento.descricao}
        </Aviso>
      )}

      <Pendencias pendencias={(pendencias ?? []) as PendenciaVista[]} modo={modo} numero={os.numero} />

      {os.observacao && (
        <Aviso tipo="info" titulo="Observação do cliente"><p className="whitespace-pre-line">{os.observacao}</p></Aviso>
      )}

      <BarraSla entrada={entradaSla} cfg={cfg} pausas={(pausas ?? []) as { inicio: string; fim: string | null; origem: 'frustracao' | 'pendencia' | 'aprovacao_preco' }[]} />

      {(os.status === 'a_vistoriar' || os.status === 'frustrado') && sla.restanteMs < 0 && !justificativas?.length && (
        <div className="aviso aviso-erro flex-col sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div>
            <p className="font-display text-base font-extrabold">OS atrasada</p>
            <p>{modo === 'loja' ? 'Para concluir esta OS é preciso justificar o atraso (motivo e explicação).' : 'O prazo do laudo passou. A Auto Visão vai registrar o motivo.'}</p>
          </div>
          {modo === 'loja' && <JustificarAtraso osId={os.id} numero={os.numero} motivos={motivosAtraso ?? []} />}
        </div>
      )}
      {!!justificativas?.length && (
        <section className="card p-6" aria-labelledby="just-titulo">
          <h2 id="just-titulo" className="h3 mb-3">Justificativa de atraso</h2>
          <ul className="space-y-3">
            {justificativas.map((j) => (
              <li key={j.id} className="text-sm">
                <p className="font-semibold">{(j.motivos as unknown as { descricao: string } | null)?.descricao}</p>
                <p className="whitespace-pre-line">{j.texto}</p>
                <p className="legenda">{dataHora(j.criado_em)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {laudoAtual && (
        <section className="card flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="rotulo-card">Laudo</p>
            <p className="mt-1 font-semibold">{laudoAtual.nome_arquivo} · versão {laudoAtual.versao}</p>
            <p className="legenda">Enviado em {dataHora(laudoAtual.enviado_em)}</p>
          </div>
          <BaixarAnexo id={laudoAtual.id} nome={laudoAtual.nome_arquivo} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="veic-titulo">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="veic-titulo" className="h3">Veículo</h2>
            {modo === 'loja' && os.status !== 'cancelado' && (
              <EditarVeiculo osId={os.id} numero={os.numero} categorias={categorias ?? []}
                inicial={{ marca_modelo: os.marca_modelo, ano: os.ano, cor: os.cor, categoria_id: os.categoria_id, renavam: os.renavam }} />
            )}
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Dado rotulo="Placa">{os.placa}</Dado>
            <Dado rotulo="Renavam">{os.renavam}</Dado>
            <Dado rotulo="Marca e modelo">{os.marca_modelo}</Dado>
            <Dado rotulo="Ano">{os.ano}</Dado>
            <Dado rotulo="Cor">{os.cor}</Dado>
            <Dado rotulo="Categoria">{(os.categorias_veiculo as { nome: string } | null)?.nome}</Dado>
          </dl>
        </section>

        <section className="card p-6" aria-labelledby="sol-titulo">
          <h2 id="sol-titulo" className="h3 mb-4">Solicitação</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Dado rotulo="Solicitante">{os.nome_solicitante}</Dado>
            <Dado rotulo="Telefone">{os.telefone_contato ? <a className="text-action hover:underline" href={`tel:${os.telefone_contato}`}>{telefone(os.telefone_contato)}</a> : null}</Dado>
            <Dado rotulo="Serviço">{(os.servicos as { nome: string } | null)?.nome} · SLA {os.sla_horas}h</Dado>
            <Dado rotulo="Local">{os.local_tipo === 'patio' ? (os.patios as { nome: string } | null)?.nome : os.endereco}</Dado>
            <Dado rotulo="Cidade">{os.cidade}{os.uf ? ` / ${os.uf}` : ''}</Dado>
            <Dado rotulo="Origem">{os.lote_id ? `Importação em lote · ${dataHora((os.lotes_importacao as { criado_em: string } | null)?.criado_em)}` : 'Abertura individual'}</Dado>
            {modo === 'loja' && <Dado rotulo="Vistoriador">{(os.vistoriadores as { nome: string } | null)?.nome}</Dado>}
          </dl>
        </section>

        <section className="card p-6" aria-labelledby="ag-titulo">
          <h2 id="ag-titulo" className="h3 mb-4">Agendamento</h2>
          {!agendamentos?.length ? <p className="text-sm text-text-secondary">{modo === 'loja' ? 'Ainda não agendada. Use “Agendar”.' : 'A Auto Visão ainda vai agendar a vistoria.'}</p> : (
            <ol className="space-y-3">
              {agendamentos.map((a) => (
                <li key={a.id} className={`rounded-card p-3 text-sm ${a.atual ? 'bg-surface' : 'text-text-secondary line-through decoration-divider'}`}>
                  <p className={a.atual ? 'font-display text-lg font-black no-underline' : ''}>{dataHora(a.data_hora)}</p>
                  <p>{(a.vistoriadores as unknown as { nome: string } | null)?.nome}{a.local_texto ? ` · ${a.local_texto}` : ''}</p>
                  <p className="legenda no-underline">Versão {a.versao}{a.atual ? ' (atual)' : ''}{(a.motivos as unknown as { descricao: string } | null)?.descricao ? ` · reagendada: ${(a.motivos as unknown as { descricao: string }).descricao}` : ''}{a.motivo_texto ? ` – ${a.motivo_texto}` : ''}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-6" aria-labelledby="val-titulo">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="val-titulo" className="h3">Valores e pagamento</h2>
            {modo === 'loja' && os.status !== 'cancelado' && (
              <BotaoPagamento os={{ id: os.id, numero: os.numero, placa: os.placa, valor: valorDaOs(os) }}
                inicial={{ status: os.pagamento_status, forma: os.pagamento_forma, data: os.pagamento_data, obs: os.pagamento_obs }} />
            )}
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Dado rotulo="Vistoria">{moeda(os.valor_base)}</Dado>
            <Dado rotulo="Deslocamento">{moeda(os.valor_deslocamento)}</Dado>
            {Number(os.valor_ajuste) !== 0 && <Dado rotulo="Ajuste">{moeda(os.valor_ajuste)}</Dado>}
            <Dado rotulo={os.valor_final !== null ? 'Valor final' : 'Valor previsto'}>
              <span className="font-display text-xl font-black">{moeda(valorDaOs(os))}</span>
            </Dado>
            <Dado rotulo="Pagamento"><SeloPagamento s={os.pagamento_status} /></Dado>
            {os.pagamento_status !== 'pendente' && <Dado rotulo={os.pagamento_status === 'pago' ? 'Pago em' : 'Faturado em'}>{fmtDataCurta(os.pagamento_data)} · {rotuloForma(os.pagamento_forma)}</Dado>}
            {os.pagamento_obs && <div className="col-span-2"><Dado rotulo="Observação do pagamento">{os.pagamento_obs}</Dado></div>}
          </dl>
          {comprovantes.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-divider pt-4">
              {comprovantes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate"><span className="legenda block">Comprovante · {dataHora(c.enviado_em)}</span>{c.nome_arquivo}</span>
                  <BaixarAnexo id={c.id} nome={c.nome_arquivo} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6" aria-labelledby="anx-titulo">
          <h2 id="anx-titulo" className="h3 mb-4">Anexos</h2>
          {outrosAnexos.length === 0 ? <p className="mb-4 text-sm text-text-secondary">Nenhum anexo.</p> : (
            <ul className="mb-4 divide-y divide-divider">
              {outrosAnexos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.nome_arquivo}</p>
                    <p className="legenda">{TIPO_ANEXO[a.tipo as keyof typeof TIPO_ANEXO]}{a.tipo === 'laudo' ? ` v${a.versao}${a.atual ? ' (atual)' : ''}` : ''} · {dataHora(a.enviado_em)}</p>
                  </div>
                  <BaixarAnexo id={a.id} nome={a.nome_arquivo} />
                </li>
              ))}
            </ul>
          )}
          {modo === 'loja' && os.status !== 'cancelado' && <EnviarAnexo osId={os.id} />}
        </section>
      </div>

      <section className="card p-6" aria-labelledby="hist-titulo">
        <h2 id="hist-titulo" className="h3 mb-4">Linha do tempo</h2>
        <ol className="relative space-y-5 border-l-2 border-divider pl-6">
          {(historico ?? []).map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-action ring-2 ring-divider" aria-hidden />
              <p className="font-semibold">{h.evento}
                {h.de || h.para ? <span className="font-normal text-text-secondary"> · {[h.de && traduz(h.evento, h.de), h.para && traduz(h.evento, h.para)].filter(Boolean).join(' → ')}</span> : null}
              </p>
              <p className="legenda">{dataHora(h.em)} · {h.nome_exibicao ?? 'Sistema'}</p>
            </li>
          ))}
        </ol>
      </section>

      {auditoria}
    </div>
  );
}

function traduz(evento: string, v: string) {
  if (evento === 'Status') return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
  if (evento === 'Etapa') return ETAPA_LABEL[v as keyof typeof ETAPA_LABEL] ?? v;
  if (evento === 'Pagamento') return PAGAMENTO_LABEL[v as keyof typeof PAGAMENTO_LABEL] ?? v;
  return v;
}
