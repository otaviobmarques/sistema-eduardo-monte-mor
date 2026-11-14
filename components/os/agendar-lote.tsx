'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { agendarLote, justificarLote, pausarLote, type ResultadoLote } from '@/app/os/operacao';
import { Aviso, Modal } from '@/components/ui';
import { Icone } from '@/components/icone';
import { FORM_LOTE } from '@/lib/lote';

type Opcao = { id: string; descricao?: string; nome?: string };

const amanha = () => new Date(Date.now() - 3 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
const caixas = () => [...document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_LOTE}"][name="os"]`)];

/**
 * Seleção na Fila de OS: marque uma ou várias OS (ou todas da lista filtrada) e aloque um vistoriador num dia.
 * As caixas ficam nas linhas da tabela (atributo form) e este componente controla a barra e a janela.
 */
export function AgendarLote({ vistoriadores, motivos, motivosAtraso = [], podePausar }: { vistoriadores: Opcao[]; motivos: Opcao[]; motivosAtraso?: Opcao[]; podePausar?: boolean }) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [jaAgendadas, setJaAgendadas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const [verbo, setVerbo] = useState<'agendada' | 'pausada' | 'justificada'>('agendada');
  // Pausar o prazo / justificar atraso das selecionadas (ex.: todas de um pátio)
  const [outra, setOutra] = useState<null | 'pausar' | 'justificar'>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    const contar = () => {
      const marcadas = caixas().filter((c) => c.checked);
      setIds(marcadas.map((c) => c.value));
      setJaAgendadas(marcadas.filter((c) => c.dataset.agendada).length);
      const todas = document.querySelector<HTMLInputElement>(`input[form="${FORM_LOTE}"][data-todas]`);
      if (todas) { const n = caixas().length; todas.checked = n > 0 && marcadas.length === n; todas.indeterminate = marcadas.length > 0 && marcadas.length < n; }
    };
    const aoMudar = (e: Event) => {
      const alvo = e.target as HTMLInputElement;
      if (alvo?.getAttribute?.('form') !== FORM_LOTE) return;
      if (alvo.dataset.todas !== undefined) caixas().forEach((c) => { c.checked = alvo.checked; });
      contar();
    };
    document.addEventListener('change', aoMudar);
    contar();
    return () => document.removeEventListener('change', aoMudar);
  }, []);

  const limpar = () => { caixas().forEach((c) => { c.checked = false; }); setIds([]); setJaAgendadas(0); const t = document.querySelector<HTMLInputElement>(`input[form="${FORM_LOTE}"][data-todas]`); if (t) { t.checked = false; t.indeterminate = false; } };

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const novos: Record<string, string> = {};
    if (jaAgendadas > 0 && !fd.get('motivo_id')) novos.motivo_id = 'Escolha o motivo do reagendamento.';
    if (Object.keys(novos).length) { setErros(novos); return; }
    iniciar(async () => {
      const r = await agendarLote(ids, {
        data: String(fd.get('data') ?? ''), hora: String(fd.get('hora') ?? ''), intervalo: String(fd.get('intervalo') ?? '0'),
        vistoriador_id: String(fd.get('vistoriador_id') ?? ''), local: String(fd.get('local') ?? ''), motivo_id: String(fd.get('motivo_id') ?? ''),
      });
      if (!r.ok) { setErros(r.campos ?? {}); setErro(r.erro); return; }
      setVerbo('agendada');
      setResultado(r.dados!);
      setAberto(false);
      limpar();
      router.refresh();
    });
  }
  const inv = (k: string) => ({ 'aria-invalid': erros[k] ? true : undefined, 'aria-describedby': `lote-${k}-msg` });
  const msg = (k: string, ajuda?: string) => erros[k] ? <p id={`lote-${k}-msg`} className="erro-campo">{erros[k]}</p> : ajuda ? <p id={`lote-${k}-msg`} className="ajuda">{ajuda}</p> : null;

  return (
    <>
      <form id={FORM_LOTE} onSubmit={(e) => e.preventDefault()} hidden />
      {resultado && (
        <Aviso tipo={resultado.falhas.length ? 'atencao' : 'ok'} titulo={`${resultado.agendadas} OS ${verbo}${resultado.agendadas === 1 ? '' : 's'}`}>
          {resultado.falhas.length > 0
            ? <>Não {verbo}s: {resultado.falhas.map((f) => `OS ${f.numero ?? '?'} (${f.erro})`).join('; ')}.</>
            : verbo === 'agendada' ? 'Já aparecem na Agenda do vistoriador.' : verbo === 'pausada' ? 'O prazo delas está parado até “Retomar prazo”.' : 'O motivo já aparece nos relatórios.'}
          <button type="button" className="ml-2 underline" onClick={() => setResultado(null)}>Fechar</button>
        </Aviso>
      )}
      {ids.length > 0 && (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-card bg-impact p-3 text-white shadow-xl min-[900px]:bottom-4" role="region" aria-label="OS selecionadas">
          <p className="px-2 font-semibold">{ids.length} OS selecionada{ids.length === 1 ? '' : 's'}{jaAgendadas ? ` · ${jaAgendadas} já agendada${jaAgendadas === 1 ? '' : 's'}` : ''}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm border-white/40 bg-transparent text-white hover:bg-white/10" onClick={limpar}>Limpar seleção</button>
            {podePausar && (
              <button type="button" className="btn btn-sm border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => { setErros({}); setErro(null); setOutra('pausar'); }}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><rect x="6" y="4" width="4" height="16" fill="currentColor" /><rect x="14" y="4" width="4" height="16" fill="currentColor" /></svg>Pausar prazo
              </button>
            )}
            <button type="button" className="btn btn-sm border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => { setErros({}); setErro(null); setOutra('justificar'); }}>
              Justificar atraso
            </button>
            <button type="button" className="btn btn-primario btn-sm" onClick={() => { setErros({}); setErro(null); setAberto(true); }}>
              <Icone nome="agenda" className="h-4 w-4" />Agendar vistoria
            </button>
          </div>
        </div>
      )}
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo={`Agendar ${ids.length} OS`}
        descricao="Aloca um vistoriador para as placas selecionadas no dia escolhido. Cada OS aparece na Agenda e passa para a etapa “Agendada”.">
        <form className="space-y-4" noValidate onSubmit={enviar}>
          <div>
            <label htmlFor="lote-vistoriador_id" className="rotulo">Vistoriador</label>
            <select id="lote-vistoriador_id" name="vistoriador_id" className="campo" defaultValue="" {...inv('vistoriador_id')}>
              <option value="">Selecione</option>{vistoriadores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
            {msg('vistoriador_id')}
            {vistoriadores.length === 0 && <p className="ajuda">Cadastre vistoriadores em Cadastros › Vistoriadores.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="lote-data" className="rotulo">Dia</label>
              <input id="lote-data" name="data" type="date" className="campo" defaultValue={amanha()} {...inv('data')} />
              {msg('data')}
            </div>
            <div>
              <label htmlFor="lote-hora" className="rotulo">Hora</label>
              <input id="lote-hora" name="hora" type="time" className="campo" defaultValue="08:00" {...inv('hora')} />
              {msg('hora')}
            </div>
            <div>
              <label htmlFor="lote-intervalo" className="rotulo">Entre placas</label>
              <select id="lote-intervalo" name="intervalo" className="campo" defaultValue="0">
                <option value="0">Mesmo horário</option>
                {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="lote-local" className="rotulo">Local <span className="font-normal text-text-secondary">(opcional)</span></label>
            <input id="lote-local" name="local" className="campo" placeholder="Em branco: o pátio ou endereço de cada OS" />
          </div>
          {jaAgendadas > 0 && (
            <div>
              <label htmlFor="lote-motivo_id" className="rotulo">Motivo do reagendamento</label>
              <select id="lote-motivo_id" name="motivo_id" className="campo" defaultValue="" {...inv('motivo_id')}>
                <option value="">Selecione</option>{motivos.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
              </select>
              {msg('motivo_id', `${jaAgendadas} das OS já tinha${jaAgendadas === 1 ? '' : 'm'} agendamento: viram uma nova versão, com o histórico mantido.`)}
            </div>
          )}
          {erro && <Aviso tipo="erro" titulo="Não foi possível agendar">{erro}</Aviso>}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secundario" onClick={() => setAberto(false)}>Voltar</button>
            <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Agendando…' : `Agendar ${ids.length} OS`}</button>
          </div>
        </form>
      </Modal>
      <Modal aberto={outra !== null} onFechar={() => setOutra(null)} titulo={outra === 'pausar' ? `Pausar o prazo de ${ids.length} OS` : `Justificar o atraso de ${ids.length} OS`}
        descricao={outra === 'pausar' ? 'O prazo das selecionadas para de contar até você clicar em “Retomar prazo” (na ficha ou em Pendências).' : 'Registra o mesmo motivo de atraso nas selecionadas que estão fora do prazo. As que estão no prazo são ignoradas.'}>
        <form className="space-y-4" noValidate onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          iniciar(async () => {
            const r = outra === 'pausar'
              ? await pausarLote(ids, String(fd.get('motivo') ?? ''))
              : await justificarLote(ids, String(fd.get('motivo_id') ?? ''), String(fd.get('texto') ?? ''));
            if (!r.ok) { setErros(r.campos ?? {}); setErro(r.erro); return; }
            setVerbo(outra === 'pausar' ? 'pausada' : 'justificada');
            setResultado(r.dados!); setOutra(null); limpar(); router.refresh();
          });
        }}>
          {outra === 'pausar' ? (
            <div>
              <label htmlFor="lote-pausa" className="rotulo">Motivo <span className="font-normal text-text-secondary">(opcional)</span></label>
              <input id="lote-pausa" name="motivo" className="campo" placeholder="Ex.: pátio fechado para vistorias" />
              <p className="ajuda">Aparece na Fila e em Pendências ao lado de “Pausado”.</p>
            </div>
          ) : (<>
            <div>
              <label htmlFor="lote-motivo-atraso" className="rotulo">Motivo do atraso</label>
              <select id="lote-motivo-atraso" name="motivo_id" className="campo" defaultValue="" aria-invalid={erros.motivo_id ? true : undefined}>
                <option value="">Selecione</option>{motivosAtraso.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
              </select>
              {erros.motivo_id && <p className="erro-campo">{erros.motivo_id}</p>}
            </div>
            <div>
              <label htmlFor="lote-texto" className="rotulo">Explicação <span className="font-normal text-text-secondary">(opcional)</span></label>
              <textarea id="lote-texto" name="texto" className="campo" rows={3} placeholder="Ex.: pátio sem acesso de segunda a quarta." />
            </div>
          </>)}
          {erro && <Aviso tipo="erro" titulo="Não foi possível concluir">{erro}</Aviso>}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secundario" onClick={() => setOutra(null)}>Voltar</button>
            <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Salvando…' : outra === 'pausar' ? `Pausar ${ids.length} OS` : `Justificar ${ids.length} OS`}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
