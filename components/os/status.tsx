import type { SlaResultado } from '@/lib/regras/sla';
import { ETAPA_LABEL, STATUS_LABEL } from '@/lib/formato';
import { CORES, CORES_PADRAO } from '@/lib/cores-status';

/** SLA: forma + cor + texto (verde círculo, âmbar losango, vermelho quadrado, cinza pausa). */
export function SlaPilula({ sla, compacta = false }: { sla: Pick<SlaResultado, 'cor' | 'texto' | 'noPrazo'>; compacta?: boolean }) {
  const estilo = {
    verde: 'bg-ok-bg text-ok', amarelo: 'bg-warn-bg text-warn', vermelho: 'bg-error-bg text-error', cinza: 'bg-surface text-text-secondary border border-divider',
    encerrada: sla.noPrazo === false ? 'bg-error-bg text-error' : 'bg-surface text-text-secondary border border-divider',
  }[sla.cor];
  const forma = {
    verde: <span className="h-2.5 w-2.5 rounded-full bg-current" />,
    amarelo: <span className="h-2.5 w-2.5 rotate-45 bg-current" />,
    vermelho: <span className="h-2.5 w-2.5 bg-current" />,
    cinza: <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden><rect x="1" y="0" width="3" height="10" fill="currentColor" /><rect x="6" y="0" width="3" height="10" fill="currentColor" /></svg>,
    encerrada: <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>,
  }[sla.cor];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${compacta ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${estilo}`}>
      <span aria-hidden className="flex items-center">{forma}</span>{sla.texto}
    </span>
  );
}

export function StatusSelo({ status, etapa }: { status: keyof typeof STATUS_LABEL; etapa?: keyof typeof ETAPA_LABEL | null }) {
  // Cor escolhida pela Loja em Configurações (variáveis CSS); o padrão vale se nada foi escolhido
  const padrao = CORES[CORES_PADRAO[status]];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: `var(--st-${status}-bg, ${padrao.bg})`, color: `var(--st-${status}-fg, ${padrao.fg})` }}>
      <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
      {STATUS_LABEL[status]}{status === 'a_vistoriar' && etapa ? <span className="font-medium opacity-80">· {ETAPA_LABEL[etapa]}</span> : null}
    </span>
  );
}

/** Barra lateral da linha da tabela conforme o SLA. */
export function corBarraSla(cor: SlaResultado['cor']) {
  return { vermelho: 'shadow-[inset_4px_0_0_#B42318]', amarelo: 'shadow-[inset_4px_0_0_#805500]', verde: 'shadow-[inset_4px_0_0_#18743B]', cinza: 'shadow-[inset_4px_0_0_#8C8288]', encerrada: '' }[cor];
}
