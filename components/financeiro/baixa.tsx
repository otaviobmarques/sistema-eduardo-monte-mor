'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { registrarPagamento } from '@/app/financeiro/actions';
import { ArquivoInput } from '@/components/arquivo-input';
import { Aviso, Modal } from '@/components/ui';
import { moeda } from '@/lib/formato';
import { FORMAS_PAGAMENTO, type StatusPagamento } from '@/lib/regras/financeiro';

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export interface OsBaixa { id: string; numero: number; placa: string; valor: number }

/** Modal de baixa: Pago (forma + data obrigatórias), Faturado ou voltar para Pendente. Comprovante opcional. */
export function ModalBaixa({ aberto, onFechar, os, inicial, onConcluir }: {
  aberto: boolean; onFechar: () => void; os: OsBaixa[];
  inicial?: { status?: StatusPagamento; forma?: string | null; data?: string | null; obs?: string | null };
  onConcluir?: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusPagamento>(inicial?.status === 'pendente' || !inicial?.status ? 'pago' : inicial.status);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const total = os.reduce((s, o) => s + Math.round(o.valor * 100), 0) / 100;
  const titulo = os.length === 1 ? `Pagamento · ${os[0].placa}` : `Dar baixa em ${os.length} OS`;
  const inv = (k: string) => ({ 'aria-invalid': erros[k] ? true : undefined, 'aria-describedby': erros[k] ? `pg-${k}-msg` : undefined });

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={titulo} descricao={`${os.length === 1 ? `OS ${os[0].numero}` : `${os.length} placas`} · ${moeda(total)}`}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('os', JSON.stringify(os.map((o) => o.id)));
        iniciar(async () => {
          const r = await registrarPagamento(fd);
          if (r.ok) { onFechar(); onConcluir?.(); router.refresh(); } else { setErros(r.campos ?? {}); setErro(r.erro); }
        });
      }}>
        <fieldset>
          <legend className="rotulo">Situação</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {([['pago', 'Pago'], ['faturado', 'Faturado'], ['pendente', 'Pendente']] as const).map(([v, t]) => (
              <label key={v} className="flex min-h-toque cursor-pointer items-center gap-3 rounded-campo border-[1.5px] border-border px-4 has-[:checked]:border-impact has-[:checked]:bg-surface has-[:checked]:font-semibold">
                <input type="radio" name="status" value={v} checked={status === v} onChange={() => setStatus(v)} className="accent-action" />{t}
              </label>
            ))}
          </div>
          <p className="ajuda">{status === 'pago' ? 'O cliente já pagou estas placas.' : status === 'faturado' ? 'Entram na fatura do mês do cliente.' : 'Desfaz a baixa: forma e data são apagadas.'}</p>
        </fieldset>
        {status !== 'pendente' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pg-forma" className="rotulo">Forma{status === 'faturado' && <span className="font-normal text-text-secondary"> (opcional)</span>}</label>
              <select key={status} id="pg-forma" name="forma" className="campo" defaultValue={status === 'faturado' ? (inicial?.status === 'faturado' && inicial.forma ? inicial.forma : 'faturamento') : (inicial?.status === 'pago' && inicial.forma ? inicial.forma : '')} {...inv('forma')}>
                {status === 'pago' && <option value="">Escolha…</option>}
                {Object.entries(FORMAS_PAGAMENTO).filter(([k]) => status === 'faturado' || k !== 'faturamento').map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
              {erros.forma && <p id="pg-forma-msg" className="erro-campo">{erros.forma}</p>}
            </div>
            <div>
              <label htmlFor="pg-data" className="rotulo">{status === 'pago' ? 'Data do pagamento' : 'Data do faturamento'}</label>
              <input id="pg-data" name="data" type="date" className="campo" max={hoje()} defaultValue={inicial?.data ?? hoje()} {...inv('data')} />
              {erros.data && <p id="pg-data-msg" className="erro-campo">{erros.data}</p>}
            </div>
          </div>
        )}
        {status !== 'pendente' && <div>
          <label htmlFor="pg-obs" className="rotulo">Observação <span className="font-normal text-text-secondary">(opcional)</span></label>
          <input id="pg-obs" name="obs" className="campo" maxLength={500} defaultValue={inicial?.obs ?? ''} placeholder="Ex.: nº do boleto, fatura de outubro" {...inv('obs')} />
          {erros.obs && <p id="pg-obs-msg" className="erro-campo">{erros.obs}</p>}
        </div>}
        {status !== 'pendente' && (
          <div>
            <p className="rotulo">Comprovante <span className="font-normal text-text-secondary">(opcional)</span></p>
            <ArquivoInput id="pg-comprovante" name="comprovante" accept=".pdf,.jpg,.jpeg,.png" descritoPor="pg-comprovante-msg" />
            {erros.comprovante ? <p id="pg-comprovante-msg" className="erro-campo">{erros.comprovante}</p> : <p id="pg-comprovante-msg" className="ajuda">JPG, PNG ou PDF, até 20 MB.{os.length > 1 ? ' O mesmo arquivo fica anexado em todas as OS.' : ''}</p>}
          </div>
        )}
        {erro && <Aviso tipo="erro" titulo="Não foi possível registrar">{erro}</Aviso>}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Voltar</button>
          <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Salvando…' : status === 'pendente' ? 'Voltar para pendente' : status === 'pago' ? 'Confirmar pagamento' : 'Marcar como faturado'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Botão da ficha da OS (Loja). */
export function BotaoPagamento({ os, inicial }: { os: OsBaixa; inicial: { status: StatusPagamento; forma: string | null; data: string | null; obs: string | null } }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secundario btn-sm" onClick={() => setAberto(true)}>{inicial.status === 'pendente' ? 'Registrar pagamento' : 'Alterar pagamento'}</button>
      {aberto && <ModalBaixa aberto onFechar={() => setAberto(false)} os={[os]} inicial={inicial} />}
    </>
  );
}

/** Botão “Faturar pendentes” do fechamento mensal. */
export function FaturarPendentes({ os, cliente }: { os: OsBaixa[]; cliente: string }) {
  const [aberto, setAberto] = useState(false);
  if (!os.length) return null;
  return (
    <>
      <button type="button" className="btn btn-secundario btn-sm" onClick={() => setAberto(true)} aria-label={`Dar baixa nas ${os.length} OS pendentes de ${cliente}`}>Dar baixa ({os.length})</button>
      {aberto && <ModalBaixa aberto onFechar={() => setAberto(false)} os={os} inicial={{ status: 'faturado' }} />}
    </>
  );
}
