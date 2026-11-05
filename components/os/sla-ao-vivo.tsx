'use client';
import { useEffect, useState } from 'react';
import { calcularSla, formatarDuracao, type SlaConfig, type SlaEntrada } from '@/lib/regras/sla';
import { dataHora } from '@/lib/formato';
import { SlaPilula } from './status';

function useAgora(intervalo = 30_000) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), intervalo); return () => clearInterval(t); }, [intervalo]);
  return agora;
}

/** Pílula de SLA que se atualiza sozinha (a cor é sempre calculada na leitura). */
export function SlaAoVivo({ entrada, cfg, compacta, comPrazo }: { entrada: SlaEntrada; cfg: SlaConfig; compacta?: boolean; comPrazo?: boolean }) {
  const agora = useAgora();
  const sla = calcularSla(entrada, cfg, agora);
  return (
    <span className="inline-flex flex-col items-end gap-1 md:items-start">
      <SlaPilula sla={sla} compacta={compacta} />
      {comPrazo && sla.prazo && sla.cor !== 'encerrada' && <span className="text-xs text-text-secondary">{dataHora(sla.prazo)}</span>}
    </span>
  );
}

const ORIGEM = { frustracao: 'Frustração', pendencia: 'Pendência', aprovacao_preco: 'Aprovação de preço' } as const;

/** Barra de SLA com marcos: abertura, 1º alerta, 2º alerta e prazo (seção 7, ficha). */
export function BarraSla({ entrada, cfg, pausas }: {
  entrada: SlaEntrada; cfg: SlaConfig; pausas: { inicio: string; fim: string | null; origem: keyof typeof ORIGEM }[];
}) {
  const agora = useAgora();
  const sla = calcularSla({ ...entrada, pausas }, cfg, agora);
  const total = entrada.sla_horas * 3_600_000;
  const pct = (ms: number) => Math.max(0, Math.min(100, (ms / total) * 100));
  const consumido = pct(sla.consumidoMs);
  const m1 = pct(cfg.alerta1_horas * 3_600_000);
  const m2 = pct(total - cfg.alerta2_horas_antes * 3_600_000);
  const atrasada = sla.restanteMs < 0;
  const cor = { verde: 'bg-ok', amarelo: 'bg-warn', vermelho: 'bg-error', cinza: 'bg-border', encerrada: sla.noPrazo === false ? 'bg-error' : 'bg-ok' }[sla.cor];
  const marcos = [
    { pos: 0, rot: 'Abertura', quando: dataHora(entrada.aberta_em) },
    { pos: m1, rot: `${cfg.alerta1_horas}h`, quando: sla.marcoAlerta1 ? dataHora(sla.marcoAlerta1) : 'passou' },
    { pos: m2, rot: '2º alerta', quando: sla.marcoAlerta2 ? dataHora(sla.marcoAlerta2) : 'passou' },
    { pos: 100, rot: 'Prazo', quando: sla.prazo ? dataHora(sla.prazo) : 'pausado' },
  ];
  return (
    <section className="card p-6" aria-labelledby="sla-titulo">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="sla-titulo" className="h3">Prazo (SLA {entrada.sla_horas}h)</h2>
        <SlaPilula sla={sla} />
      </div>
      <div className="relative pb-14 pt-2">
        <div className="relative h-4 overflow-hidden rounded-full bg-surface ring-1 ring-divider" role="progressbar" aria-label="Tempo de SLA consumido"
          aria-valuemin={0} aria-valuemax={entrada.sla_horas} aria-valuenow={Math.round(sla.consumidoMs / 3_600_000)} aria-valuetext={sla.texto}>
          <div className={`h-full ${cor} transition-[width] duration-[240ms]`} style={{ width: `${consumido}%` }} />
          {sla.pausada && <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(105,98,103,.25)_6px,rgba(105,98,103,.25)_12px)]" />}
        </div>
        {marcos.map((m, i) => (
          <div key={m.rot} className="absolute top-0 flex flex-col" style={{ left: `${m.pos}%`, transform: i === 0 ? 'none' : i === marcos.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)', alignItems: i === 0 ? 'flex-start' : i === marcos.length - 1 ? 'flex-end' : 'center' }}>
            <span className="h-8 w-0.5 bg-impact" aria-hidden />
            <span className="mt-1 whitespace-nowrap text-xs font-semibold">{m.rot}</span>
            <span className="hidden whitespace-nowrap text-xs text-text-secondary sm:block">{m.quando}</span>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-4 border-t border-divider pt-4 text-sm">
        <div><dt className="legenda">Tempo corrido</dt><dd className="mt-1 font-display text-xl font-black">{formatarDuracao(sla.consumidoMs)}</dd></div>
        <div><dt className="legenda">Pausado</dt><dd className="mt-1 font-display text-xl font-black">{formatarDuracao(sla.pausadoMs)}</dd></div>
        <div>
          <dt className="legenda">{atrasada ? 'Atraso' : 'Restante'}</dt>
          <dd className={`mt-1 font-display text-xl font-black ${atrasada ? 'text-error' : ''}`}>{atrasada ? '+' : ''}{formatarDuracao(Math.abs(sla.restanteMs))}</dd>
        </div>
      </dl>
      {pausas.length > 0 && (
        <div className="mt-4 border-t border-divider pt-4">
          <p className="rotulo">Pausas</p>
          <ul className="space-y-1 text-sm">
            {pausas.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span>{ORIGEM[p.origem]} · {dataHora(p.inicio)} → {p.fim ? dataHora(p.fim) : <strong>em andamento</strong>}</span>
                <span className="text-text-secondary">{formatarDuracao((p.fim ? new Date(p.fim) : agora).getTime() - new Date(p.inicio).getTime())}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {cfg.contagem === 'uteis' && <p className="ajuda mt-3">Contagem em horas úteis ({cfg.horario_util.inicio}–{cfg.horario_util.fim}, sem feriados).</p>}
    </section>
  );
}
