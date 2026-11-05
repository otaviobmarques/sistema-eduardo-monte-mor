'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { preverLote } from '@/app/importar/actions';
import { ArquivoInput } from '@/components/arquivo-input';
import { Icone } from '@/components/icone';
import { Aviso } from '@/components/ui';
import { telefone as fmtTel } from '@/lib/formato';

export function EnvioForm({ empresas, empresaFixa, nomeEmpresa }: { empresas?: { id: string; nome: string }[]; empresaFixa?: string; nomeEmpresa?: string }) {
  const router = useRouter();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [tel, setTel] = useState('');
  const [pendente, iniciar] = useTransition();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <form className="card space-y-5 p-6" noValidate onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErro(null);
        iniciar(async () => {
          const r = await preverLote(fd);
          if (r.ok) router.push(`?lote=${r.dados!.loteId}`); else { setErros(r.campos ?? {}); setErro(r.erro); }
        });
      }}>
        <h2 className="h3">Enviar planilha</h2>
        {empresas ? (
          <div>
            <label className="rotulo" htmlFor="imp-empresa">Cliente</label>
            <select id="imp-empresa" name="empresa_id" className="campo" defaultValue={empresaFixa ?? ''} aria-invalid={erros.empresa_id ? true : undefined}>
              <option value="">Selecione o cliente</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            {erros.empresa_id && <p className="erro-campo">{erros.empresa_id}</p>}
          </div>
        ) : (
          <div><p className="rotulo">Empresa</p><p className="flex h-campo items-center rounded-campo border-[1.5px] border-divider bg-surface px-4 text-text-secondary">{nomeEmpresa}</p></div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="imp-nome">Nome do solicitante</label>
            <input id="imp-nome" name="nome_solicitante" className="campo" autoComplete="name" aria-invalid={erros.nome_solicitante ? true : undefined} aria-describedby="imp-nome-msg" />
            <p id="imp-nome-msg" className={erros.nome_solicitante ? 'erro-campo' : 'ajuda'}>{erros.nome_solicitante ?? 'Vale para todas as OS do lote.'}</p>
          </div>
          <div>
            <label className="rotulo" htmlFor="imp-tel">Telefone <span className="font-normal text-text-secondary">(opcional)</span></label>
            <input id="imp-tel" name="telefone" className="campo" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} onBlur={() => setTel(fmtTel(tel))} placeholder="(00) 00000-0000" aria-invalid={erros.telefone ? true : undefined} />
            {erros.telefone && <p className="erro-campo">{erros.telefone}</p>}
          </div>
        </div>
        <div>
          <p className="rotulo">Planilha (.xlsx ou .csv)</p>
          <ArquivoInput name="arquivo" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" rotuloBotao="Escolher planilha" obrigatorio descritoPor="imp-arq-msg" />
          <p id="imp-arq-msg" className={erros.arquivo ? 'erro-campo' : 'ajuda'}>{erros.arquivo ?? 'Até 500 linhas. Colunas extras e linhas vazias são ignoradas.'}</p>
        </div>
        {erro && <Aviso tipo="erro" titulo="Não foi possível ler a planilha">{erro}</Aviso>}
        <button className="btn btn-primario w-full sm:w-auto" disabled={pendente}>{pendente ? 'Lendo a planilha…' : 'Ver prévia'}</button>
        <p className="legenda">Nenhuma OS é criada nesta etapa. Você confere tudo na prévia antes.</p>
      </form>
      <aside className="painel space-y-3 p-6">
        <p className="rotulo-card">Passo 1 · Modelo</p>
        <h2 className="h3">Use o modelo</h2>
        <p className="text-sm text-text-secondary">Colunas: <strong>PLACA, MODELO, RENAVAM, PÁTIO</strong>, e opcionalmente SERVIÇO e OBS. A planilha que vocês já usam também funciona, desde que tenha essas colunas.</p>
        <a href="/api/importacao/modelo" className="btn btn-secundario w-full"><Icone nome="download" className="h-4 w-4" />Baixar modelo .xlsx</a>
      </aside>
    </div>
  );
}
