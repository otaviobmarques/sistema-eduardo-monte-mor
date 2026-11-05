'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Aviso } from '@/components/ui';
import { consultarCnpj } from '@/app/loja/clientes/actions';
import { formatarCnpj } from '@/lib/regras/cnpj';
import { telefone as fmtTel, UFS, valorParaCampo, parseMoeda } from '@/lib/formato';
import { salvarLoja } from './actions';

type V = Record<'nome' | 'razao_social' | 'cnpj' | 'endereco' | 'cidade' | 'uf' | 'cep' | 'telefone' | 'email' | 'responsavel' | 'plano_mensal' | 'taxa_start' | 'dia_vencimento' | 'dias_tolerancia', string> & { ativo: boolean };

export function LojaForm({ id, inicial }: { id?: string; inicial?: Record<string, unknown> }) {
  const router = useRouter();
  const t = (k: string) => (inicial?.[k] === null || inicial?.[k] === undefined ? '' : String(inicial[k]));
  const [v, setV] = useState<V>({
    nome: t('nome'), razao_social: t('razao_social'), cnpj: formatarCnpj(t('cnpj')), endereco: t('endereco'), cidade: t('cidade'), uf: t('uf') || 'SP',
    cep: t('cep'), telefone: fmtTel(t('telefone')), email: t('email'), responsavel: t('responsavel'),
    plano_mensal: valorParaCampo(inicial?.plano_mensal as number ?? 0), taxa_start: valorParaCampo(inicial?.taxa_start as number ?? 0),
    dia_vencimento: t('dia_vencimento') || '10', dias_tolerancia: t('dias_tolerancia') || '10', ativo: inicial?.ativo === undefined ? true : Boolean(inicial.ativo),
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro' | 'info'; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const set = (k: keyof V, x: string | boolean) => { setV((s) => ({ ...s, [k]: x })); setErros((e) => ({ ...e, [k]: '' })); };

  const campo = (k: keyof V, rot: string, extra: React.InputHTMLAttributes<HTMLInputElement> & { prefixo?: string; ajuda?: string; opcional?: boolean } = {}) => {
    const { prefixo, ajuda, opcional, ...rest } = extra;
    return (
      <div>
        <label className="rotulo" htmlFor={`lj-${k}`}>{rot}{opcional && <span className="font-normal text-text-secondary"> (opcional)</span>}</label>
        <div className="relative">
          {prefixo && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">{prefixo}</span>}
          <input id={`lj-${k}`} className={`campo ${prefixo ? 'pl-11' : ''}`} value={String(v[k])} onChange={(e) => set(k, e.target.value)} aria-invalid={erros[k] ? true : undefined} {...rest} />
        </div>
        {erros[k] ? <p className="erro-campo">{erros[k]}</p> : ajuda && <p className="ajuda">{ajuda}</p>}
      </div>
    );
  };

  return (
    <form className="space-y-6" noValidate onSubmit={(e) => {
      e.preventDefault(); setMsg(null);
      iniciar(async () => {
        const r = await salvarLoja(id ?? null, { ...v, plano_mensal: parseMoeda(v.plano_mensal) ?? -1, taxa_start: parseMoeda(v.taxa_start) ?? -1, dia_vencimento: Number(v.dia_vencimento), dias_tolerancia: Number(v.dias_tolerancia) });
        if (!r.ok) { setErros(r.campos ?? {}); setMsg({ tipo: 'erro', t: r.erro }); return; }
        if (!id) router.push(`/admin/lojas/${r.dados!.id}?nova=1`); else setMsg({ tipo: 'ok', t: 'Loja salva.' });
      });
    }}>
      <section className="card space-y-4 p-6">
        <h2 className="h3">Dados da Loja franqueada</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
          {campo('cnpj', 'CNPJ', { inputMode: 'numeric', opcional: true, onBlur: () => set('cnpj', formatarCnpj(v.cnpj)), ajuda: 'Obrigatório para cobrar pelo Asaas.' })}
          <button type="button" className="btn btn-secundario md:mt-[26px]" disabled={pendente} onClick={() => iniciar(async () => {
            const r = await consultarCnpj(v.cnpj);
            if (!r.ok) { setErros((e) => ({ ...e, cnpj: r.erro })); return; }
            const d = r.dados!;
            setV((s) => ({ ...s, razao_social: d.razao_social || s.razao_social, nome: s.nome || (d.nome_fantasia ? d.nome_fantasia : s.nome), endereco: d.endereco || s.endereco, cidade: d.cidade || s.cidade, uf: d.uf || s.uf, cep: d.cep || s.cep, telefone: d.telefone ? fmtTel(d.telefone) : s.telefone, email: d.email || s.email }));
            setMsg({ tipo: 'info', t: 'Dados preenchidos pela Receita. Confira antes de salvar.' });
          })}>Buscar CNPJ</button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {campo('nome', 'Nome da Loja', { placeholder: 'Ex.: Auto Visão Campinas' })}
          {campo('razao_social', 'Razão social', { opcional: true })}
          {campo('responsavel', 'Responsável (franqueado)', { opcional: true })}
          {campo('telefone', 'Telefone', { opcional: true, inputMode: 'tel', onBlur: () => set('telefone', fmtTel(v.telefone)) })}
          {campo('email', 'E-mail', { opcional: true, type: 'email', ajuda: 'Recebe as cobranças do Asaas.' })}
          {campo('cep', 'CEP', { opcional: true, inputMode: 'numeric' })}
        </div>
        {campo('endereco', 'Endereço', { opcional: true })}
        <div className="grid gap-4 grid-cols-[1fr_120px]">
          {campo('cidade', 'Cidade', { opcional: true })}
          <div>
            <label className="rotulo" htmlFor="lj-uf">UF</label>
            <select id="lj-uf" className="campo" value={v.uf} onChange={(e) => set('uf', e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
        </div>
      </section>
      <section className="card space-y-4 p-6">
        <h2 className="h3">Plano e cobrança</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {campo('taxa_start', 'Start do projeto', { prefixo: 'R$', inputMode: 'decimal', ajuda: 'Cobrança única de implantação.' })}
          {campo('plano_mensal', 'Mensalidade', { prefixo: 'R$', inputMode: 'decimal', ajuda: 'Assinatura mensal recorrente.' })}
          {campo('dia_vencimento', 'Dia do vencimento', { type: 'number', min: 1, max: 28, ajuda: 'Entre 1 e 28.' })}
          {campo('dias_tolerancia', 'Tolerância de atraso (dias)', { type: 'number', min: 0, max: 60, ajuda: 'Depois disso o acesso da Loja e dos clientes dela é suspenso.' })}
        </div>
        <label className="flex min-h-toque items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="check" checked={v.ativo} onChange={(e) => set('ativo', e.target.checked)} />Loja ativa
        </label>
      </section>
      {msg && <Aviso tipo={msg.tipo} titulo={msg.tipo === 'ok' ? 'Tudo certo' : msg.tipo === 'erro' ? 'Não foi possível salvar' : 'Confira'}>{msg.t}</Aviso>}
      <div className="flex justify-end"><button className="btn btn-primario" disabled={pendente}>{pendente ? 'Salvando…' : id ? 'Salvar alterações' : 'Cadastrar Loja'}</button></div>
    </form>
  );
}
