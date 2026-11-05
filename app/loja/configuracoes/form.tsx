'use client';
import { useState, useTransition } from 'react';
import { Aviso } from '@/components/ui';
import { salvarConfiguracoes } from './actions';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Config {
  alerta1_horas: number; alerta2_horas_antes: number; contagem: 'corridas' | 'uteis';
  horario_util: { dias: number[]; inicio: string; fim: string }; escalonar_minutos: number; ajuste_preco_habilitado: boolean;
}

export function ConfigForm({ inicial }: { inicial: Config }) {
  const [c, setC] = useState(inicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const set = <K extends keyof Config>(k: K, v: Config[K]) => { setC((s) => ({ ...s, [k]: v })); setMsg(null); };

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await salvarConfiguracoes(c);
      setErros(r.ok ? {} : r.campos ?? {});
      setMsg(r.ok ? { ok: true, texto: 'Configurações salvas. Valem para os próximos cálculos de SLA e alertas.' } : { ok: false, texto: r.erro });
    });
  }

  const num = (k: 'alerta1_horas' | 'alerta2_horas_antes' | 'escalonar_minutos', rotulo: string, ajuda: string, sufixo: string) => (
    <div>
      <label htmlFor={`cfg-${k}`} className="rotulo">{rotulo}</label>
      <div className="relative">
        <input id={`cfg-${k}`} type="number" className="campo pr-20" value={c[k]} onChange={(e) => set(k, Number(e.target.value))}
          aria-invalid={erros[k] ? true : undefined} aria-describedby={`cfg-${k}-msg`} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-text-secondary">{sufixo}</span>
      </div>
      <p id={`cfg-${k}-msg`} className={erros[k] ? 'erro-campo' : 'ajuda'}>{erros[k] || ajuda}</p>
    </div>
  );

  return (
    <form onSubmit={salvar} className="space-y-6" noValidate>
      <section className="card space-y-4 p-6">
        <h2 className="h3">Alertas de SLA</h2>
        <p className="text-sm text-text-secondary">O prazo padrão é de 48 horas a partir da abertura. Os alertas avisam a Loja e o cliente.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {num('alerta1_horas', '1º alerta (amarelo)', 'Horas de SLA consumidas para a OS ficar amarela e avisar.', 'horas')}
          {num('alerta2_horas_antes', '2º alerta', 'Horas antes do vencimento para avisar de novo.', 'h antes')}
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="h3">Contagem do prazo</h2>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">Contagem</legend>
          {([['corridas', 'Horas corridas', '24 horas por dia, todos os dias.'], ['uteis', 'Horas úteis', 'Só nos dias e horários abaixo, sem feriados.']] as const).map(([v, t, d]) => (
            <label key={v} className={`flex min-h-toque flex-1 cursor-pointer gap-3 rounded-card border-[1.5px] p-4 ${c.contagem === v ? 'border-impact bg-surface' : 'border-border'}`}>
              <input type="radio" name="contagem" className="mt-1 accent-action" checked={c.contagem === v} onChange={() => set('contagem', v)} />
              <span><span className="block font-semibold">{t}</span><span className="text-sm text-text-secondary">{d}</span></span>
            </label>
          ))}
        </fieldset>
        <fieldset disabled={c.contagem !== 'uteis'} className="space-y-4 disabled:opacity-60">
          <legend className="rotulo">Horário útil</legend>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d, i) => {
              const on = c.horario_util.dias.includes(i);
              return (
                <label key={d} className={`flex min-h-toque min-w-[56px] cursor-pointer items-center justify-center rounded-campo border-[1.5px] px-3 text-sm font-semibold ${on ? 'border-impact bg-impact text-white' : 'border-border'}`}>
                  <input type="checkbox" className="sr-only" checked={on}
                    onChange={(e) => set('horario_util', { ...c.horario_util, dias: e.target.checked ? [...c.horario_util.dias, i].sort() : c.horario_util.dias.filter((x) => x !== i) })} />
                  {d}
                </label>
              );
            })}
          </div>
          {erros['horario_util.dias'] && <p className="erro-campo">{erros['horario_util.dias']}</p>}
          <div className="grid max-w-md grid-cols-2 gap-4">
            <div>
              <label htmlFor="cfg-inicio" className="rotulo">Início</label>
              <input id="cfg-inicio" type="time" className="campo" value={c.horario_util.inicio} onChange={(e) => set('horario_util', { ...c.horario_util, inicio: e.target.value })} />
            </div>
            <div>
              <label htmlFor="cfg-fim" className="rotulo">Fim</label>
              <input id="cfg-fim" type="time" className="campo" value={c.horario_util.fim} onChange={(e) => set('horario_util', { ...c.horario_util, fim: e.target.value })} aria-invalid={erros['horario_util.fim'] ? true : undefined} />
              {erros['horario_util.fim'] && <p className="erro-campo">{erros['horario_util.fim']}</p>}
            </div>
          </div>
        </fieldset>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="h3">Notificações e preços</h2>
        <div className="max-w-md">{num('escalonar_minutos', 'Escalonamento', 'OS ou lote sem ninguém abrir nesse tempo gera um push reforçado.', 'min')}</div>
        <label className="flex min-h-toque items-start gap-3 text-sm">
          <input type="checkbox" className="check mt-0.5" checked={c.ajuste_preco_habilitado} onChange={(e) => set('ajuste_preco_habilitado', e.target.checked)} />
          <span><span className="block font-semibold">Ajuste de preço com aprovação do cliente</span>
            <span className="text-text-secondary">A Loja propõe novo valor; o SLA fica pausado até o cliente aprovar ou recusar.</span></span>
        </label>
      </section>

      {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Não foi possível salvar'}>{msg.texto}</Aviso>}
      <div className="flex justify-end"><button className="btn btn-primario" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar configurações'}</button></div>
    </form>
  );
}
