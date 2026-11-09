'use client';
import { useRef, useState, useTransition } from 'react';
import { abrirPendencia, agendar, cancelar, concluirSemLaudo, enviarLaudo, frustrar, mudarEtapa, resolverPendencia, responderPendencia } from '@/app/os/operacao';
import { ArquivoInput } from '@/components/arquivo-input';
import { Icone } from '@/components/icone';
import { Aviso, Modal } from '@/components/ui';
import { data as fmtData, dataHora } from '@/lib/formato';
import { TIPO_PENDENCIA_LABEL } from '@/lib/operacao';
import type { Resultado } from '@/lib/cadastros';

type Opcao = { id: string; descricao: string };

/** "agora" em Brasília no formato do input datetime-local */
function agoraLocal(deslocMin = 0) {
  const d = new Date(Date.now() + deslocMin * 60_000 - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}
function hojeMais(dias: number) {
  return new Date(Date.now() - 3 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10);
}

/** Modal com formulário, erros por campo e estado de envio. */
function ModalForm({ titulo, descricao, rotulo, perigo, abrir, children, enviar, largura }: {
  titulo: string; descricao?: string; rotulo: string; perigo?: boolean; largura?: string;
  abrir: (abrirFn: () => void) => React.ReactNode;
  children: (erros: Record<string, string>) => React.ReactNode;
  enviar: (form: FormData) => Promise<Resultado<unknown>>;
}) {
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      {abrir(() => { setErros({}); setErro(null); setAberto(true); })}
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo={titulo} descricao={descricao} largura={largura}>
        <form className="space-y-4" noValidate onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          iniciar(async () => {
            const r = await enviar(fd);
            if (r.ok) setAberto(false); else { setErros(r.campos ?? {}); setErro(r.erro); }
          });
        }}>
          {children(erros)}
          {erro && <Aviso tipo="erro" titulo="Não foi possível concluir">{erro}</Aviso>}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secundario" onClick={() => setAberto(false)}>Voltar</button>
            <button className={`btn ${perigo ? 'btn-primario' : 'btn-primario'}`} disabled={pendente}>{pendente ? 'Salvando…' : rotulo}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Campo({ id, rotulo, erro, ajuda, opcional, children }: { id: string; rotulo: string; erro?: string; ajuda?: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="rotulo">{rotulo}{opcional && <span className="font-normal text-text-secondary"> (opcional)</span>}</label>
      {children}
      {erro ? <p id={`${id}-msg`} className="erro-campo">{erro}</p> : ajuda ? <p id={`${id}-msg`} className="ajuda">{ajuda}</p> : null}
    </div>
  );
}
const inv = (e?: string) => ({ 'aria-invalid': e ? true : undefined });

function Responsavel({ erro, padrao = 'cliente' }: { erro?: string; padrao?: string }) {
  return (
    <fieldset>
      <legend className="rotulo">Quem resolve</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {[['cliente', 'Cliente'], ['loja', 'Auto Visão']].map(([v, t]) => (
          <label key={v} className="flex min-h-toque cursor-pointer items-center gap-3 rounded-campo border-[1.5px] border-border px-4 has-[:checked]:border-impact has-[:checked]:bg-surface has-[:checked]:font-semibold">
            <input type="radio" name="responsavel" value={v} defaultChecked={v === padrao} className="accent-action" />{t}
          </label>
        ))}
      </div>
      {erro && <p className="erro-campo">{erro}</p>}
    </fieldset>
  );
}

export interface DadosAcoes {
  os: { id: string; numero: number; status: string; etapa: string | null; local: string };
  vistoriadores: { id: string; nome: string }[];
  motivos: { frustracao: Opcao[]; cancelamento: Opcao[]; reagendamento: Opcao[] };
  agendamento: { data_hora: string; vistoriador_id: string | null; local_texto: string | null } | null;
  pendenciasAbertas: number;
  precisaJustificar: boolean;
  /** OS concluída sem laudo e ainda sem PDF: o botão vira “Anexar laudo”. */
  semLaudo?: boolean;
  /** Gestor sem travas: conclui com pendência aberta, OS frustrada ou atraso sem justificativa, sem motivo. */
  conclusaoLivre?: boolean;
}

export function AcoesLoja({ d }: { d: DadosAcoes }) {
  const { os } = d;
  const aberta = os.status === 'a_vistoriar';
  const ativa = aberta || os.status === 'frustrado';
  const [etapaMsg, setEtapaMsg] = useState<string | null>(null);
  const [pendEtapa, iniciarEtapa] = useTransition();
  if (!ativa && os.status !== 'vistoriado') return null;

  return (
    <section className="card p-4" aria-label="Ações da OS">
      <div className="flex flex-wrap items-center gap-2">
        {aberta && (
          <ModalForm titulo={d.agendamento ? 'Reagendar vistoria' : 'Agendar vistoria'} rotulo={d.agendamento ? 'Reagendar' : 'Agendar'}
            descricao={d.agendamento ? 'Cria uma nova versão do agendamento e mantém o histórico.' : undefined}
            abrir={(f) => <button type="button" className="btn btn-secundario" onClick={f}><Icone nome="agenda" className="h-4 w-4" />{d.agendamento ? 'Reagendar' : 'Agendar'}</button>}
            enviar={(fd) => agendar(os.id, os.numero, {
              data_hora: String(fd.get('data_hora')), local: String(fd.get('local') ?? ''), vistoriador_id: String(fd.get('vistoriador_id') ?? ''),
              motivo_id: String(fd.get('motivo_id') ?? ''), motivo_texto: String(fd.get('motivo_texto') ?? ''),
            })}>
            {(e) => (<>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="ag-data" rotulo="Data e hora" erro={e.data_hora}>
                  <input id="ag-data" name="data_hora" type="datetime-local" className="campo" defaultValue={agoraLocal(60)} {...inv(e.data_hora)} />
                </Campo>
                <Campo id="ag-vist" rotulo="Vistoriador" erro={e.vistoriador_id}>
                  <select id="ag-vist" name="vistoriador_id" className="campo" defaultValue={d.agendamento?.vistoriador_id ?? ''} {...inv(e.vistoriador_id)}>
                    <option value="">Selecione</option>{d.vistoriadores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </Campo>
              </div>
              {d.vistoriadores.length === 0 && <Aviso tipo="atencao" titulo="Nenhum vistoriador ativo">Cadastre em Cadastros › Vistoriadores.</Aviso>}
              <Campo id="ag-local" rotulo="Local" opcional ajuda="Ex.: portão 2, procurar Sr. João.">
                <input id="ag-local" name="local" className="campo" defaultValue={d.agendamento?.local_texto ?? os.local} />
              </Campo>
              {d.agendamento && (<>
                <Campo id="ag-motivo" rotulo="Motivo do reagendamento" erro={e.motivo_id}>
                  <select id="ag-motivo" name="motivo_id" className="campo" defaultValue="" {...inv(e.motivo_id)}>
                    <option value="">Selecione</option>{d.motivos.reagendamento.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
                  </select>
                </Campo>
                <Campo id="ag-motivo-txt" rotulo="Detalhe" opcional><input id="ag-motivo-txt" name="motivo_texto" className="campo" /></Campo>
              </>)}
            </>)}
          </ModalForm>
        )}

        {aberta && (
          <div className="flex items-center gap-2">
            <label htmlFor="etapa" className="sr-only">Etapa</label>
            <select id="etapa" className="campo h-btn w-auto" value={os.etapa ?? 'aberta'} disabled={pendEtapa}
              onChange={(e) => { const v = e.target.value; setEtapaMsg(null); iniciarEtapa(async () => { const r = await mudarEtapa(os.id, os.numero, v); if (!r.ok) setEtapaMsg(r.erro); }); }}>
              <option value="aberta">Etapa: Aberta</option><option value="agendada">Etapa: Agendada</option>
              <option value="em_execucao">Etapa: Em execução</option><option value="laudo_em_elaboracao">Etapa: Laudo em elaboração</option>
            </select>
          </div>
        )}

        {aberta && (
          <ModalForm titulo="Registrar frustração" rotulo="Registrar frustração" largura="max-w-xl"
            descricao="A OS fica frustrada, o prazo pausa e o cliente é avisado. Uma pendência é aberta automaticamente."
            abrir={(f) => <button type="button" className="btn btn-secundario" onClick={f}><Icone nome="pendencia" className="h-4 w-4" />Registrar frustração</button>}
            enviar={(fd) => { fd.set('os_id', os.id); fd.set('numero', String(os.numero)); return frustrar(fd); }}>
            {(e) => (<>
              <Campo id="fr-motivo" rotulo="Motivo" erro={e.motivo_id}>
                <select id="fr-motivo" name="motivo_id" className="campo" defaultValue="" {...inv(e.motivo_id)}>
                  <option value="">Selecione</option>{d.motivos.frustracao.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
                </select>
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="fr-quando" rotulo="Data e hora" erro={e.ocorrida_em}>
                  <input id="fr-quando" name="ocorrida_em" type="datetime-local" className="campo" defaultValue={agoraLocal()} max={agoraLocal(5)} {...inv(e.ocorrida_em)} />
                </Campo>
                <Campo id="fr-prev" rotulo="Previsão de resolução" erro={e.previsao}>
                  <input id="fr-prev" name="previsao" type="date" className="campo" defaultValue={hojeMais(1)} {...inv(e.previsao)} />
                </Campo>
              </div>
              <Campo id="fr-desc" rotulo="Descrição" erro={e.descricao}>
                <textarea id="fr-desc" name="descricao" className="campo" rows={3} placeholder="O que aconteceu no local?" {...inv(e.descricao)} />
              </Campo>
              <Responsavel erro={e.responsavel} />
              <div><p className="rotulo">Anexo <span className="font-normal text-text-secondary">(opcional)</span></p><ArquivoInput name="arquivo" accept=".pdf,.jpg,.jpeg,.png" /></div>
            </>)}
          </ModalForm>
        )}

        {(aberta || os.status === 'frustrado') && (
          <ModalForm titulo="Abrir pendência" rotulo="Abrir pendência" descricao="Pausa o prazo até ser resolvida. Ex.: falta de documento."
            abrir={(f) => <button type="button" className="btn btn-secundario" onClick={f}><Icone nome="mais" className="h-4 w-4" />Pendência</button>}
            enviar={(fd) => abrirPendencia(os.id, os.numero, { tipo: String(fd.get('tipo')), descricao: String(fd.get('descricao') ?? ''), responsavel: String(fd.get('responsavel') ?? ''), previsao: String(fd.get('previsao') ?? '') })}>
            {(e) => (<>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="pe-tipo" rotulo="Tipo" erro={e.tipo}>
                  <select id="pe-tipo" name="tipo" className="campo" defaultValue="documental">
                    {Object.entries(TIPO_PENDENCIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Campo>
                <Campo id="pe-prev" rotulo="Previsão" opcional erro={e.previsao}><input id="pe-prev" name="previsao" type="date" className="campo" defaultValue={hojeMais(1)} /></Campo>
              </div>
              <Campo id="pe-desc" rotulo="Descrição" erro={e.descricao}><textarea id="pe-desc" name="descricao" className="campo" rows={3} {...inv(e.descricao)} /></Campo>
              <Responsavel erro={e.responsavel} />
            </>)}
          </ModalForm>
        )}

        {ativa && <CancelarOs osId={os.id} numero={os.numero} motivos={d.motivos.cancelamento} />}

        {(aberta || (d.conclusaoLivre && os.status === 'frustrado')) && (
          <ModalForm titulo="Concluir OS sem laudo" rotulo="Concluir sem laudo" perigo
            descricao={`OS ${os.numero}: a vistoria será dada como concluída sem o PDF do laudo.`}
            abrir={(f) => (
              <button type="button" className="btn btn-secundario sm:ml-auto" onClick={f} disabled={aberto(d)}>
                <Icone nome="check" className="h-4 w-4" />Concluir sem laudo
              </button>
            )}
            enviar={(fd) => { fd.set('os_id', os.id); fd.set('numero', String(os.numero)); return concluirSemLaudo(fd); }}>
            {(e) => (<>
              <div className="flex gap-3 rounded-card border-l-4 border-error bg-error-bg p-4 text-sm" role="alert">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-error font-bold text-white">!</span>
                <div className="space-y-1">
                  <p className="font-display text-base font-extrabold text-error">Atenção: você está concluindo esta OS sem laudo</p>
                  <p>A OS passa para <strong>Vistoriado</strong>, o prazo para de contar e o valor é congelado. O cliente é avisado de que a vistoria foi concluída, mas <strong>não terá o PDF para baixar</strong>.</p>
                  <p>A ficha fica marcada como “Concluída sem laudo” até você anexar o laudo (botão “Anexar laudo”, depois).</p>
                  {d.conclusaoLivre && (d.pendenciasAbertas > 0 || os.status === 'frustrado') && <p>As pendências abertas serão <strong>encerradas</strong> junto com a OS.</p>}
                </div>
              </div>
              <Campo id="sl-motivo" rotulo="Por que concluir sem laudo?" opcional={d.conclusaoLivre} erro={e.motivo} ajuda="Fica na linha do tempo e na auditoria.">
                <textarea id="sl-motivo" name="motivo" className="campo" rows={3} placeholder="Ex.: laudo entregue em papel ao cliente; vistoria feita por outro sistema" {...inv(e.motivo)} />
              </Campo>
              {!d.conclusaoLivre && <div>
                <label className="flex min-h-toque cursor-pointer items-start gap-3 text-sm">
                  <input type="checkbox" name="ciente" className="check mt-0.5" aria-invalid={e.ciente ? true : undefined} />
                  <span>Entendo que esta OS será concluída <strong>sem laudo anexado</strong>.</span>
                </label>
                {e.ciente && <p className="erro-campo">{e.ciente}</p>}
              </div>}
            </>)}
          </ModalForm>
        )}

        {(aberta || os.status === 'vistoriado' || (d.conclusaoLivre && os.status === 'frustrado')) && (
          <ModalForm titulo={d.semLaudo ? 'Anexar laudo' : os.status === 'vistoriado' ? 'Enviar nova versão do laudo' : 'Enviar laudo'} rotulo={d.semLaudo ? 'Anexar laudo' : 'Enviar laudo'}
            descricao={d.semLaudo ? 'A OS foi concluída sem laudo. Ao anexar, o cliente é avisado de que o laudo está disponível.' : os.status === 'vistoriado' ? 'O cliente passa a ver a versão nova; as anteriores ficam no histórico.' : 'O envio conclui a OS, encerra o prazo, congela o valor e avisa o cliente.'}
            abrir={(f) => (
              <button type="button" className={`btn btn-primario ${os.status === 'vistoriado' ? 'sm:ml-auto' : ''}`} onClick={f} disabled={aberto(d)}>
                <Icone nome="download" className="h-4 w-4 rotate-180" />{d.semLaudo ? 'Anexar laudo' : os.status === 'vistoriado' ? 'Nova versão do laudo' : 'Enviar laudo'}
              </button>
            )}
            enviar={(fd) => { fd.set('os_id', os.id); fd.set('numero', String(os.numero)); return enviarLaudo(fd); }}>
            {() => (<>
              <div><p className="rotulo">Laudo em PDF</p><ArquivoInput name="arquivo" accept=".pdf,application/pdf" obrigatorio rotuloBotao="Escolher PDF" /></div>
              <p className="ajuda">Até 20 MB.</p>
            </>)}
          </ModalForm>
        )}
      </div>
      {aberta && !d.conclusaoLivre && (d.pendenciasAbertas > 0 || d.precisaJustificar) && (
        <p className="mt-3 text-sm text-text-secondary">
          Para concluir (com ou sem laudo): {[d.pendenciasAbertas > 0 && 'resolva as pendências abertas', d.precisaJustificar && 'justifique o atraso'].filter(Boolean).join(' e ')}.
        </p>
      )}
      {etapaMsg && <p className="erro-campo" role="alert">{etapaMsg}</p>}
    </section>
  );
}
const aberto = (d: DadosAcoes) => !d.conclusaoLivre && d.os.status === 'a_vistoriar' && (d.pendenciasAbertas > 0 || d.precisaJustificar);

export function CancelarOs({ osId, numero, motivos, cliente }: { osId: string; numero: number; motivos: Opcao[]; cliente?: boolean }) {
  return (
    <ModalForm titulo="Cancelar OS" rotulo="Cancelar OS" perigo descricao="Encerra o prazo. A OS continua no histórico como cancelada."
      abrir={(f) => <button type="button" className="btn btn-texto" onClick={f}>Cancelar OS</button>}
      enviar={(fd) => cancelar(osId, numero, { nome: String(fd.get('nome') ?? ''), motivo_id: String(fd.get('motivo_id') ?? ''), descricao: String(fd.get('descricao') ?? '') })}>
      {(e) => (<>
        <Campo id="ca-nome" rotulo="Nome de quem pediu o cancelamento" erro={e.nome} ajuda={cliente ? 'Fica gravado na OS e na auditoria.' : undefined}>
          <input id="ca-nome" name="nome" className="campo" autoComplete="name" {...inv(e.nome)} />
        </Campo>
        <Campo id="ca-motivo" rotulo="Motivo" erro={e.motivo_id}>
          <select id="ca-motivo" name="motivo_id" className="campo" defaultValue="" {...inv(e.motivo_id)}>
            <option value="">Selecione</option>{motivos.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
          </select>
        </Campo>
        <Campo id="ca-desc" rotulo="Descrição" erro={e.descricao}><textarea id="ca-desc" name="descricao" className="campo" rows={3} {...inv(e.descricao)} /></Campo>
      </>)}
    </ModalForm>
  );
}

export interface PendenciaVista {
  id: string; tipo: keyof typeof TIPO_PENDENCIA_LABEL; descricao: string; responsavel: 'cliente' | 'loja'; previsao: string | null;
  created_at: string; resolvida_em: string | null; resolucao_texto: string | null; resposta_cliente: string | null; respondida_em: string | null;
}

export function Pendencias({ pendencias, modo, numero }: { pendencias: PendenciaVista[]; modo: 'loja' | 'cliente'; numero: number }) {
  if (!pendencias.length) return null;
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  return (
    <section className="card p-6" aria-labelledby="pend-titulo">
      <h2 id="pend-titulo" className="h3 mb-4">Pendências</h2>
      <ul className="space-y-4">
        {pendencias.map((p) => {
          const vencida = !p.resolvida_em && p.previsao && p.previsao < hoje;
          return (
            <li key={p.id} className={`rounded-card border p-4 ${p.resolvida_em ? 'border-divider' : vencida ? 'border-error' : 'border-warn'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{TIPO_PENDENCIA_LABEL[p.tipo]} · {p.responsavel === 'cliente' ? 'com o cliente' : 'com a Auto Visão'}</p>
                  <p className="mt-1 whitespace-pre-line text-sm">{p.descricao}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.resolvida_em ? 'bg-ok-bg text-ok' : vencida ? 'bg-error-bg text-error' : 'bg-warn-bg text-warn'}`}>
                  {p.resolvida_em ? '✓ Resolvida' : vencida ? '■ Previsão vencida' : '◆ Aberta'}
                </span>
              </div>
              <p className="legenda mt-2">Aberta em {dataHora(p.created_at)}{p.previsao ? ` · previsão ${fmtData(p.previsao)}` : ''}{p.resolvida_em ? ` · resolvida em ${dataHora(p.resolvida_em)}` : ''}</p>
              {p.resposta_cliente && <p className="mt-2 rounded-campo bg-info-bg p-3 text-sm text-info"><strong>Resposta do cliente</strong> ({dataHora(p.respondida_em)}): {p.resposta_cliente}</p>}
              {p.resolucao_texto && <p className="mt-2 rounded-campo bg-ok-bg p-3 text-sm text-ok"><strong>Resolução:</strong> {p.resolucao_texto}</p>}
              {!p.resolvida_em && modo === 'loja' && <ResolverPendencia id={p.id} numero={numero} />}
              {!p.resolvida_em && modo === 'cliente' && p.responsavel === 'cliente' && <ResponderPendencia id={p.id} numero={numero} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ResolverPendencia({ id, numero, compacto }: { id: string; numero: number; compacto?: boolean }) {
  return (
    <ModalForm titulo="Resolver pendência" rotulo="Resolver" descricao="O prazo volta a correr. Se a OS estava frustrada, volta para A vistoriar."
      abrir={(f) => <button type="button" className={`btn btn-primario btn-sm ${compacto ? '' : 'mt-3'}`} onClick={f}>Resolver</button>}
      enviar={(fd) => resolverPendencia(id, numero, String(fd.get('texto') ?? ''))}>
      {(e) => <Campo id={`rp-${id}`} rotulo="Como foi resolvida" erro={e.texto}><textarea id={`rp-${id}`} name="texto" className="campo" rows={3} {...inv(e.texto)} /></Campo>}
    </ModalForm>
  );
}

export function ResponderPendencia({ id, numero }: { id: string; numero: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form className="mt-3 space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const texto = ref.current?.value ?? '';
      iniciar(async () => { const r = await responderPendencia(id, numero, texto); setMsg(r.ok ? { ok: true, t: 'Resposta enviada à Auto Visão.' } : { ok: false, t: r.erro }); });
    }}>
      <label htmlFor={`resp-${id}`} className="rotulo">Sua resposta</label>
      <textarea ref={ref} id={`resp-${id}`} className="campo" rows={3} placeholder="Ex.: autorização enviada ao pátio hoje às 10h." />
      <button className="btn btn-primario btn-sm" disabled={pendente}>{pendente ? 'Enviando…' : 'Enviar resposta'}</button>
      {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Não foi possível enviar'}>{msg.t}</Aviso>}
    </form>
  );
}
