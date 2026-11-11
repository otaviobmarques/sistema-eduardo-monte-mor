'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { abrirOs, consultarPlaca, type InfoPlaca } from '@/app/os/actions';
import { Aviso } from '@/components/ui';
import { Icone } from '@/components/icone';
import { ArquivoInput } from '@/components/arquivo-input';
import { dataHora, moeda, telefone as fmtTel, UFS } from '@/lib/formato';
import { MAX_ANEXO, novaOsSchema, TIPOS_ANEXO_OK } from '@/lib/os';
import { normalizarPlaca, placaValida } from '@/lib/regras/placa';
import { normalizarRenavam, renavamValido } from '@/lib/regras/renavam';

type Item = { id: string; nome: string };
export interface DadosNovaOs {
  modo: 'cliente' | 'loja';
  empresas: (Item & { sla_horas: number; usa_tabela_propria: boolean })[];
  empresaFixa?: string;
  categorias: Item[];
  servicos: (Item & { sla_horas: number; padrao: boolean })[];
  patios: (Item & { cidade: string | null; uf: string | null })[];
  precosPadrao: Record<string, number>;
  precosProprios: Record<string, Record<string, number>>;
  taxas: { cidade: string; uf: string; valor: number }[];
  /** Gestor com conclusão livre: escolhe a data/hora de abertura (pode ser anterior a hoje). */
  podeEscolherAbertura?: boolean;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function NovaOsForm(p: DadosNovaOs) {
  const router = useRouter();
  const servPadrao = p.servicos.find((s) => s.padrao) ?? p.servicos[0];
  const [v, setV] = useState({
    empresa_id: p.empresaFixa ?? (p.empresas.length === 1 ? p.empresas[0].id : ''),
    nome_solicitante: '', telefone: '', placa: '', renavam: '', marca_modelo: '', ano: '', cor: '',
    categoria_id: p.categorias[0]?.id ?? '', servico_id: servPadrao?.id ?? '', local_tipo: 'patio' as 'patio' | 'endereco',
    patio_id: '', endereco: '', cidade: '', uf: 'SP', observacao: '',
  });
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<InfoPlaca | null>(null);
  const [preenchido, setPreenchido] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [agora, setAgora] = useState(() => new Date());
  // Abertura escolhida (datetime-local em Brasília); vazio = automática (agora)
  const [abertura, setAbertura] = useState('');
  const inicio = abertura ? new Date(`${abertura}:00-03:00`) : agora;
  const localDe = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 16);
  const tocados = useRef(new Set<string>());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 30_000); return () => clearInterval(t); }, []);

  const set = (k: keyof typeof v, x: string) => { setV((s) => ({ ...s, [k]: x })); setErros((e) => ({ ...e, [k]: '' })); };
  const empresa = p.empresas.find((e) => e.id === v.empresa_id);
  const servico = p.servicos.find((s) => s.id === v.servico_id);
  const patio = p.patios.find((x) => x.id === v.patio_id);

  // Placa: consulta histórico e duplicidade do mesmo cliente
  const placaNorm = normalizarPlaca(v.placa);
  useEffect(() => {
    setInfo(null); setPreenchido(false);
    if (!placaValida(placaNorm) || !v.empresa_id) return;
    const t = setTimeout(async () => {
      const r = await consultarPlaca(placaNorm, v.empresa_id);
      setInfo(r);
      if (!r.aberta && r.ultima) {
        const u = r.ultima;
        setV((s) => ({
          ...s,
          marca_modelo: s.marca_modelo || u.marca_modelo || '', ano: s.ano || u.ano || '', cor: s.cor || u.cor || '',
          categoria_id: u.categoria_id && !tocados.current.has('categoria_id') ? u.categoria_id : s.categoria_id,
          renavam: s.renavam || u.renavam || '',
        }));
        setPreenchido(true);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [placaNorm, v.empresa_id]);

  const renDig = v.renavam.replace(/\D/g, '');
  const renStatus = !renDig ? null : renDig.length < 9 ? 'curto' : renavamValido(renDig) ? 'ok' : 'erro';

  const sla = Math.min(servico?.sla_horas ?? 48, empresa?.sla_horas ?? 48, 48);
  const prazo = new Date(inicio.getTime() + sla * 3600_000);
  const chave = `${v.servico_id}:${v.categoria_id}`;
  const base = (empresa?.usa_tabela_propria ? p.precosProprios[v.empresa_id]?.[chave] : undefined) ?? p.precosPadrao[chave] ?? 0;
  const desl = v.local_tipo === 'endereco' ? p.taxas.find((t) => norm(t.cidade) === norm(v.cidade) && t.uf === v.uf)?.valor ?? 0 : 0;

  function adicionarArquivos(lista: FileList | null) {
    if (!lista) return;
    const novos: File[] = []; const problemas: string[] = [];
    for (const f of Array.from(lista)) {
      if (!TIPOS_ANEXO_OK.includes(f.type)) problemas.push(`“${f.name}”: use JPG, PNG ou PDF.`);
      else if (f.size > MAX_ANEXO) problemas.push(`“${f.name}”: o limite é 20 MB.`);
      else novos.push(f);
    }
    setArquivos((a) => [...a, ...novos].slice(0, 10));
    setErros((e) => ({ ...e, anexos: problemas.join(' ') }));
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault(); setErroGeral(null);
    const dados = { ...v, empresa_id: v.empresa_id || null };
    const r = novaOsSchema.safeParse(dados);
    const novos: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) novos[String(i.path[0])] ??= i.message;
    if (p.modo === 'loja' && !v.empresa_id) novos.empresa_id = 'Escolha o cliente.';
    if (info?.aberta) novos.placa = `Esta placa já tem a OS nº ${info.aberta} em aberto.`;
    if (Object.keys(novos).length) {
      setErros(novos);
      document.getElementById(`os-${Object.keys(novos)[0]}`)?.focus();
      return;
    }
    const fd = new FormData();
    fd.set('dados', JSON.stringify(dados));
    if (p.podeEscolherAbertura && abertura) fd.set('aberta_em', abertura);
    arquivos.forEach((f) => fd.append('anexos', f));
    iniciar(async () => {
      const res = await abrirOs(fd);
      if (!res.ok) { setErros(res.campos ?? {}); setErroGeral(res.erro); return; }
      router.push(`${p.modo === 'loja' ? '/loja' : '/app'}/os/${res.dados!.numero}?nova=1`);
    });
  }

  const ajudaOuErro = (k: string, ajuda?: string) =>
    erros[k] ? <p id={`os-${k}-msg`} className="erro-campo">{erros[k]}</p> : ajuda ? <p id={`os-${k}-msg`} className="ajuda">{ajuda}</p> : null;
  const aria = (k: string) => ({ id: `os-${k}`, 'aria-invalid': erros[k] ? true : undefined, 'aria-describedby': `os-${k}-msg` });

  return (
    <form onSubmit={enviar} noValidate className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
      <div className="space-y-6">
        {/* Solicitante */}
        <section className="card space-y-4 p-6" aria-labelledby="sec-solicitante">
          <h2 id="sec-solicitante" className="h3">Solicitante</h2>
          {p.modo === 'loja' ? (
            <div>
              <label className="rotulo" htmlFor="os-empresa_id">Cliente</label>
              <select className="campo" {...aria('empresa_id')} value={v.empresa_id} onChange={(e) => set('empresa_id', e.target.value)}>
                <option value="">Selecione o cliente</option>
                {p.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              {ajudaOuErro('empresa_id')}
            </div>
          ) : (
            <div>
              <p className="rotulo">Empresa</p>
              <p className="flex h-campo items-center rounded-campo border-[1.5px] border-divider bg-surface px-4 text-text-secondary">{empresa?.nome}</p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="os-nome_solicitante">Nome do solicitante</label>
              <input className="campo" {...aria('nome_solicitante')} autoComplete="name" value={v.nome_solicitante} onChange={(e) => set('nome_solicitante', e.target.value)} />
              {ajudaOuErro('nome_solicitante', 'Quem está pedindo a vistoria. Fica gravado na OS.')}
            </div>
            <div>
              <label className="rotulo" htmlFor="os-telefone">Telefone <span className="font-normal text-text-secondary">(opcional)</span></label>
              <input className="campo" {...aria('telefone')} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={v.telefone}
                onChange={(e) => set('telefone', e.target.value)} onBlur={() => set('telefone', fmtTel(v.telefone))} />
              {ajudaOuErro('telefone')}
            </div>
          </div>
          {p.podeEscolherAbertura ? (
            <div className="max-w-xs">
              <label className="rotulo" htmlFor="os-aberta_em">Data e hora da abertura</label>
              <input className="campo" type="datetime-local" {...aria('aberta_em')} value={abertura || localDe(agora)} max={localDe(new Date(Date.now() + 5 * 60_000))}
                onChange={(e) => setAbertura(e.target.value)} />
              {ajudaOuErro('aberta_em', abertura ? 'O prazo é contado a partir desta data.' : 'Agora, se não mudar. Pode ser uma data anterior a hoje.')}
            </div>
          ) : <p className="legenda">Abertura automática: {dataHora(agora)}</p>}
        </section>

        {/* Veículo */}
        <section className="card space-y-4 p-6" aria-labelledby="sec-veiculo">
          <h2 id="sec-veiculo" className="h3">Veículo</h2>
          <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
            <div>
              <label className="rotulo" htmlFor="os-placa">Placa</label>
              <input className="campo campo-placa" {...aria('placa')} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={8}
                placeholder="ABC1D23" value={v.placa} onChange={(e) => set('placa', e.target.value.toUpperCase())} />
              {ajudaOuErro('placa', placaValida(placaNorm) ? (/[A-Z]/.test(placaNorm[4]) ? 'Formato Mercosul.' : 'Formato antigo.') : 'Sem espaço ou hífen.')}
            </div>
            <div>
              <label className="rotulo" htmlFor="os-renavam">Renavam <span className="font-normal text-text-secondary">(opcional)</span></label>
              <input className="campo" {...aria('renavam')} inputMode="numeric" maxLength={11} value={v.renavam}
                onChange={(e) => set('renavam', e.target.value.replace(/\D/g, ''))} onBlur={() => renDig && set('renavam', normalizarRenavam(renDig))} />
              {erros.renavam ? <p id="os-renavam-msg" className="erro-campo">{erros.renavam}</p>
                : renStatus === 'ok' ? <p id="os-renavam-msg" className="mt-1.5 text-xs font-semibold text-ok">✓ Dígito verificador confere.</p>
                : renStatus === 'erro' ? <p id="os-renavam-msg" className="erro-campo">Dígito verificador não confere. Confira o número.</p>
                : <p id="os-renavam-msg" className="ajuda">11 dígitos; zeros à esquerda são completados.</p>}
            </div>
          </div>
          {info?.aberta && (
            <Aviso tipo="erro" titulo={`Esta placa já tem a OS nº ${info.aberta} em aberto`}>
              Não é possível abrir outra enquanto ela estiver a vistoriar ou frustrada.{' '}
              <Link className="font-semibold underline" href={`${p.modo === 'loja' ? '/loja' : '/app'}/os/${info.aberta}`}>Abrir a OS {info.aberta}</Link>
            </Aviso>
          )}
          {!info?.aberta && preenchido && (
            <Aviso tipo="atencao" titulo="Placa já vistoriada antes. Confira.">
              Preenchemos modelo, ano, categoria e cor com a OS nº {info?.ultima?.numero}.
            </Aviso>
          )}
          <div className="grid gap-4 md:grid-cols-[1fr_160px_200px]">
            <div>
              <label className="rotulo" htmlFor="os-marca_modelo">Marca e modelo</label>
              <input className="campo" {...aria('marca_modelo')} placeholder="Ex.: Fiat Argo Drive 1.0" value={v.marca_modelo} onChange={(e) => set('marca_modelo', e.target.value)} />
              {ajudaOuErro('marca_modelo')}
            </div>
            <div>
              <label className="rotulo" htmlFor="os-ano">Ano <span className="font-normal text-text-secondary">(opcional)</span></label>
              <input className="campo" {...aria('ano')} inputMode="numeric" placeholder="2020/2021" value={v.ano} onChange={(e) => set('ano', e.target.value)} />
              {ajudaOuErro('ano')}
            </div>
            <div>
              <label className="rotulo" htmlFor="os-cor">Cor <span className="font-normal text-text-secondary">(opcional)</span></label>
              <input className="campo" {...aria('cor')} value={v.cor} onChange={(e) => set('cor', e.target.value)} />
            </div>
          </div>
          <fieldset>
            <legend className="rotulo">Categoria</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {p.categorias.map((c) => (
                <label key={c.id} className={`flex min-h-toque cursor-pointer items-center rounded-campo border-[1.5px] px-4 text-sm font-semibold transition-colors duration-[120ms] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-impact ${v.categoria_id === c.id ? 'border-impact bg-impact text-white' : 'border-border bg-white hover:bg-surface'}`}>
                  <input type="radio" name="categoria" className="sr-only" checked={v.categoria_id === c.id} onChange={() => { tocados.current.add('categoria_id'); set('categoria_id', c.id); }} />
                  {c.nome}
                </label>
              ))}
            </div>
            {erros.categoria_id && <p className="erro-campo">{erros.categoria_id}</p>}
          </fieldset>
        </section>

        {/* Serviço e local */}
        <section className="card space-y-4 p-6" aria-labelledby="sec-servico">
          <h2 id="sec-servico" className="h3">Serviço e local</h2>
          <div>
            <label className="rotulo" htmlFor="os-servico_id">Serviço</label>
            <select className="campo" {...aria('servico_id')} value={v.servico_id} onChange={(e) => set('servico_id', e.target.value)}>
              {p.servicos.map((s) => {
                const pr = (empresa?.usa_tabela_propria ? p.precosProprios[v.empresa_id]?.[`${s.id}:${v.categoria_id}`] : undefined) ?? p.precosPadrao[`${s.id}:${v.categoria_id}`] ?? 0;
                return <option key={s.id} value={s.id}>{s.nome} · {moeda(pr)} · {Math.min(s.sla_horas, empresa?.sla_horas ?? 48)}h</option>;
              })}
            </select>
            {ajudaOuErro('servico_id')}
          </div>
          <fieldset>
            <legend className="rotulo">Local da vistoria</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([['patio', 'Em pátio', 'Pátio de leilão cadastrado'], ['endereco', 'Outro endereço', 'Pode ter taxa de deslocamento']] as const).map(([k, t, d]) => (
                <label key={k} className={`flex min-h-toque cursor-pointer gap-3 rounded-card border-[1.5px] p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-impact ${v.local_tipo === k ? 'border-impact bg-surface' : 'border-border'}`}>
                  <input type="radio" name="local" className="mt-1 accent-action" checked={v.local_tipo === k} onChange={() => set('local_tipo', k)} />
                  <span><span className="block font-semibold">{t}</span><span className="text-sm text-text-secondary">{d}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {v.local_tipo === 'patio' ? (
            <div className="grid gap-4 md:grid-cols-[1fr_240px]">
              <div>
                <label className="rotulo" htmlFor="os-patio_id">Pátio</label>
                <select className="campo" {...aria('patio_id')} value={v.patio_id} onChange={(e) => set('patio_id', e.target.value)}>
                  <option value="">Selecione o pátio</option>
                  {p.patios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
                {ajudaOuErro('patio_id')}
              </div>
              <div>
                <p className="rotulo">Cidade</p>
                <p className="flex h-campo items-center rounded-campo border-[1.5px] border-divider bg-surface px-4 text-text-secondary">
                  {patio ? `${patio.cidade ?? '—'}${patio.uf ? ` / ${patio.uf}` : ''}` : 'Vem do pátio'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="rotulo" htmlFor="os-endereco">Endereço</label>
                <input className="campo" {...aria('endereco')} autoComplete="street-address" value={v.endereco} onChange={(e) => set('endereco', e.target.value)} />
                {ajudaOuErro('endereco', 'Rua, número e bairro.')}
              </div>
              <div className="grid gap-4 grid-cols-[1fr_120px]">
                <div>
                  <label className="rotulo" htmlFor="os-cidade">Cidade</label>
                  <input className="campo" {...aria('cidade')} value={v.cidade} onChange={(e) => set('cidade', e.target.value)} />
                  {ajudaOuErro('cidade')}
                </div>
                <div>
                  <label className="rotulo" htmlFor="os-uf">UF</label>
                  <select className="campo" {...aria('uf')} value={v.uf} onChange={(e) => set('uf', e.target.value)}>
                    {UFS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                  {ajudaOuErro('uf')}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Observações e anexos */}
        <section className="card space-y-4 p-6" aria-labelledby="sec-obs">
          <h2 id="sec-obs" className="h3">Observações e anexos</h2>
          <div>
            <label className="rotulo" htmlFor="os-observacao">Observações para a vistoria <span className="font-normal text-text-secondary">(opcional)</span></label>
            <textarea className="campo" {...aria('observacao')} rows={4} value={v.observacao} onChange={(e) => set('observacao', e.target.value)}
              placeholder="Ex.: veículo na fileira B; contato do pátio com João." />
            {ajudaOuErro('observacao', 'Aparece em destaque para a equipe da Auto Visão.')}
          </div>
          <div>
            <p className="rotulo">Anexos <span className="font-normal text-text-secondary">(opcional)</span></p>
            <ArquivoInput id="os-anexos" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" rotuloBotao="Adicionar anexos" descritoPor="os-anexos-msg" onArquivos={adicionarArquivos} />
            {ajudaOuErro('anexos', 'JPG, PNG ou PDF, até 20 MB cada. Ex.: autorização de retirada, documento.')}
            {arquivos.length > 0 && (
              <ul className="mt-3 space-y-2">
                {arquivos.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 rounded-campo bg-surface px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><Icone nome="anexo" className="h-4 w-4 shrink-0" /><span className="truncate">{f.name}</span></span>
                    <button type="button" className="btn btn-texto btn-sm" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))} aria-label={`Remover ${f.name}`}>Remover</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Resumo lateral */}
      <aside className="painel space-y-4 p-6 lg:sticky lg:top-6" aria-label="Resumo">
        <p className="rotulo-card">Resumo</p>
        <div className="flex items-center gap-3">
          <span className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-campo border-2 border-impact font-display text-2xl font-black tracking-[0.1em]">
            {placaValida(placaNorm) ? placaNorm : '———'}
          </span>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-text-secondary">Serviço</dt><dd className="text-right font-medium">{servico?.nome ?? '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-text-secondary">Local</dt><dd className="text-right font-medium">{v.local_tipo === 'patio' ? patio?.nome ?? '—' : v.cidade || 'Outro endereço'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-text-secondary">SLA</dt><dd className="font-medium">{sla}h a partir da abertura</dd></div>
        </dl>
        <div className="rounded-card bg-surface p-4">
          <p className="legenda">Prazo do laudo</p>
          <p className="font-display text-2xl font-black">{dataHora(prazo)}</p>
        </div>
        <dl className="space-y-2 border-t border-divider pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-text-secondary">Vistoria</dt><dd>{moeda(base)}</dd></div>
          {v.local_tipo === 'endereco' && <div className="flex justify-between"><dt className="text-text-secondary">Deslocamento</dt><dd>{moeda(desl)}</dd></div>}
          <div className="flex justify-between text-base font-semibold"><dt>Valor</dt><dd>{moeda(base + desl)}</dd></div>
        </dl>
        {erroGeral && <Aviso tipo="erro" titulo="Não foi possível abrir a OS">{erroGeral}</Aviso>}
        <button className="btn btn-primario btn-lg w-full" disabled={pendente || !!info?.aberta}>{pendente ? 'Abrindo…' : 'Abrir OS'}</button>
        <p className="legenda text-center">O prazo começa a contar quando a OS é aberta.</p>
      </aside>
    </form>
  );
}
