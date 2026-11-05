'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Aviso } from '@/components/ui';
import { formatarCnpj } from '@/lib/regras/cnpj';
import { telefone as fmtTel, UFS } from '@/lib/formato';
import { consultarCep, consultarCnpj, salvarCliente, type ClienteDados } from './actions';

type Valores = {
  cnpj: string; razao_social: string; nome_fantasia: string; cep: string; endereco: string; cidade: string; uf: string;
  telefone: string; email: string; responsavel_financeiro: string; responsavel_acesso: string;
  forma_cobranca: 'faturado' | 'avulso'; usa_tabela_propria: boolean; sla_horas: string; ativo: boolean;
};

export function ClienteForm({ id, inicial }: { id?: string; inicial?: Partial<Record<keyof Valores, unknown>> }) {
  const router = useRouter();
  const [v, setV] = useState<Valores>({
    cnpj: formatarCnpj(String(inicial?.cnpj ?? '')), razao_social: String(inicial?.razao_social ?? ''), nome_fantasia: String(inicial?.nome_fantasia ?? ''),
    cep: String(inicial?.cep ?? ''), endereco: String(inicial?.endereco ?? ''), cidade: String(inicial?.cidade ?? ''), uf: String(inicial?.uf ?? ''),
    telefone: fmtTel(String(inicial?.telefone ?? '')), email: String(inicial?.email ?? ''),
    responsavel_financeiro: String(inicial?.responsavel_financeiro ?? ''), responsavel_acesso: String(inicial?.responsavel_acesso ?? ''),
    forma_cobranca: (inicial?.forma_cobranca as Valores['forma_cobranca']) ?? 'faturado', usa_tabela_propria: Boolean(inicial?.usa_tabela_propria),
    sla_horas: String(inicial?.sla_horas ?? 48), ativo: inicial?.ativo === undefined ? true : Boolean(inicial.ativo),
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro' | 'info' | 'atencao'; titulo: string; texto: string } | null>(null);
  const [buscando, setBuscando] = useState<'cnpj' | 'cep' | null>(null);
  const [pendente, iniciar] = useTransition();
  const set = <K extends keyof Valores>(k: K, x: Valores[K]) => { setV((s) => ({ ...s, [k]: x })); setErros((e) => ({ ...e, [k]: '' })); };

  async function buscarCnpj() {
    setBuscando('cnpj'); setMsg(null);
    const r = await consultarCnpj(v.cnpj);
    setBuscando(null);
    if (!r.ok) { setErros((e) => ({ ...e, cnpj: r.erro })); return; }
    const d = r.dados!;
    setV((s) => ({
      ...s, razao_social: d.razao_social || s.razao_social, nome_fantasia: d.nome_fantasia || s.nome_fantasia, cep: d.cep || s.cep,
      endereco: d.endereco || s.endereco, cidade: d.cidade || s.cidade, uf: d.uf || s.uf, telefone: d.telefone ? fmtTel(d.telefone) : s.telefone,
      email: d.email || s.email,
    }));
    setMsg({ tipo: 'info', titulo: 'Dados preenchidos pela Receita', texto: 'Confira e complete antes de salvar.' });
    if (!d.endereco && d.cep) buscarCep(d.cep);
  }

  async function buscarCep(cep = v.cep) {
    setBuscando('cep');
    const r = await consultarCep(cep);
    setBuscando(null);
    if (!r.ok) { setErros((e) => ({ ...e, cep: r.erro })); return; }
    setV((s) => ({ ...s, endereco: s.endereco || r.dados!.endereco, cidade: r.dados!.cidade || s.cidade, uf: r.dados!.uf || s.uf }));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    iniciar(async () => {
      const r = await salvarCliente(id ?? null, v as unknown as ClienteDados);
      if (!r.ok) { setErros(r.campos ?? {}); setMsg({ tipo: 'erro', titulo: 'Não foi possível salvar', texto: r.erro }); return; }
      if (!id) router.push(`/loja/clientes/${r.dados!.id}?novo=1`);
      else setMsg({ tipo: 'ok', titulo: 'Cliente salvo', texto: 'As alterações foram gravadas.' });
    });
  }

  const campo = (k: keyof Valores, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement> & { opcional?: boolean; ajuda?: string } = {}) => {
    const { opcional, ajuda, ...rest } = props;
    const idc = `cli-${k}`;
    return (
      <div>
        <label htmlFor={idc} className="rotulo">{rotulo}{opcional && <span className="font-normal text-text-secondary"> (opcional)</span>}</label>
        <input id={idc} className="campo" value={String(v[k])} onChange={(e) => set(k, e.target.value as never)}
          aria-invalid={erros[k] ? true : undefined} aria-describedby={erros[k] ? `${idc}-erro` : ajuda ? `${idc}-ajuda` : undefined} {...rest} />
        {erros[k] ? <p id={`${idc}-erro`} className="erro-campo">{erros[k]}</p> : ajuda && <p id={`${idc}-ajuda`} className="ajuda">{ajuda}</p>}
      </div>
    );
  };

  return (
    <form onSubmit={salvar} className="space-y-6" noValidate>
      <section className="card space-y-4 p-6">
        <h2 className="h3">Dados da empresa</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
          {campo('cnpj', 'CNPJ', { inputMode: 'numeric', placeholder: '00.000.000/0000-00', onBlur: () => set('cnpj', formatarCnpj(v.cnpj)), ajuda: 'Busque para preencher razão social, endereço e telefone.' })}
          <button type="button" className="btn btn-secundario md:mt-[26px]" onClick={buscarCnpj} disabled={buscando !== null}>
            {buscando === 'cnpj' ? 'Buscando…' : 'Buscar CNPJ'}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {campo('razao_social', 'Razão social')}
          {campo('nome_fantasia', 'Nome fantasia', { opcional: true })}
        </div>
        <div className="grid gap-4 sm:grid-cols-[220px_auto] sm:items-start">
          {campo('cep', 'CEP', { inputMode: 'numeric', opcional: true, placeholder: '00000-000' })}
          <button type="button" className="btn btn-secundario sm:mt-[26px] sm:justify-self-start" onClick={() => buscarCep()} disabled={buscando !== null}>
            {buscando === 'cep' ? 'Buscando…' : 'Buscar CEP'}
          </button>
        </div>
        {campo('endereco', 'Endereço', { opcional: true })}
        <div className="grid gap-4 md:grid-cols-[1fr_140px]">
          {campo('cidade', 'Cidade', { opcional: true })}
          <div>
            <label htmlFor="cli-uf" className="rotulo">UF <span className="font-normal text-text-secondary">(opcional)</span></label>
            <select id="cli-uf" className="campo" value={v.uf} onChange={(e) => set('uf', e.target.value)} aria-invalid={erros.uf ? true : undefined}>
              <option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}
            </select>
            {erros.uf && <p className="erro-campo">{erros.uf}</p>}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {campo('telefone', 'Telefone', { inputMode: 'tel', opcional: true, placeholder: '(00) 00000-0000', onBlur: () => set('telefone', fmtTel(v.telefone)) })}
          {campo('email', 'E-mail', { type: 'email', opcional: true })}
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="h3">Condições comerciais</h2>
        <fieldset>
          <legend className="rotulo">Forma de cobrança</legend>
          <div className="flex flex-wrap gap-3">
            {(['faturado', 'avulso'] as const).map((f) => (
              <label key={f} className={`flex min-h-toque cursor-pointer items-center gap-2 rounded-campo border-[1.5px] px-4 ${v.forma_cobranca === f ? 'border-impact bg-surface font-semibold' : 'border-border'}`}>
                <input type="radio" name="forma_cobranca" className="accent-action" checked={v.forma_cobranca === f} onChange={() => set('forma_cobranca', f)} />
                {f === 'faturado' ? 'Faturado' : 'Avulso'}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 md:grid-cols-2">
          {campo('sla_horas', 'SLA (horas)', { type: 'number', min: 1, max: 48, ajuda: 'Vale o menor entre o SLA do cliente e o do serviço. Máximo de 48h.' })}
          {campo('responsavel_financeiro', 'Responsável financeiro', { opcional: true })}
        </div>
        <label className="flex min-h-toque items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="check" checked={v.usa_tabela_propria} onChange={(e) => set('usa_tabela_propria', e.target.checked)} />
          Tabela de preços própria (senão usa a tabela padrão)
        </label>
        <label className="flex min-h-toque items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="check" checked={v.ativo} onChange={(e) => set('ativo', e.target.checked)} />
          Cliente ativo
        </label>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="h3">Responsável pelo acesso</h2>
        {campo('responsavel_acesso', 'Nome do responsável', { opcional: true, ajuda: 'Pessoa da empresa que recebe o usuário e a senha.' })}
      </section>

      {msg && <Aviso tipo={msg.tipo} titulo={msg.titulo}>{msg.texto}</Aviso>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secundario" onClick={() => router.push('/loja/clientes')}>Voltar</button>
        <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Salvando…' : id ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
      </div>
    </form>
  );
}
