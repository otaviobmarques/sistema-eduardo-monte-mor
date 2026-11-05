'use client';
import { useRef, useState, useTransition } from 'react';
import { anexarNaOs, atualizarVeiculo, urlAnexo } from '@/app/os/actions';
import { Icone } from '@/components/icone';
import { ArquivoInput } from '@/components/arquivo-input';
import { Aviso, Modal } from '@/components/ui';
import { renavamValido } from '@/lib/regras/renavam';

export function BaixarAnexo({ id, nome }: { id: string; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" className="btn btn-secundario btn-sm" disabled={pendente} aria-label={`Baixar ${nome}`}
        onClick={() => iniciar(async () => {
          setErro(null);
          const r = await urlAnexo(id);
          if (r.ok) window.location.assign(r.dados!.url); else setErro(r.erro);
        })}>
        <Icone nome="download" className="h-4 w-4" />{pendente ? 'Gerando…' : 'Baixar'}
      </button>
      {erro && <span className="erro-campo" role="alert">{erro}</span>}
    </span>
  );
}

export function EnviarAnexo({ osId }: { osId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form ref={ref} className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      iniciar(async () => {
        const r = await anexarNaOs(fd);
        setMsg(r.ok ? { ok: true, t: 'Anexo enviado.' } : { ok: false, t: r.erro });
        if (r.ok) ref.current?.reset();
      });
    }}>
      <input type="hidden" name="os_id" value={osId} />
      <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <div>
          <label className="rotulo" htmlFor="anexo-tipo">Tipo</label>
          <select id="anexo-tipo" name="tipo" className="campo" defaultValue="foto">
            <option value="foto">Foto</option><option value="documento">Documento</option>
            <option value="comprovante">Comprovante</option><option value="justificativa">Justificativa</option>
          </select>
        </div>
        <div>
          <p className="rotulo">Arquivo</p>
          <ArquivoInput id="anexo-arquivo" name="arquivo" obrigatorio accept=".pdf,.jpg,.jpeg,.png" />
        </div>
        <button className="btn btn-secundario" disabled={pendente}>{pendente ? 'Enviando…' : 'Enviar anexo'}</button>
      </div>
      <p className="ajuda">JPG, PNG ou PDF, até 20 MB. O laudo é enviado pela ação “Enviar laudo”.</p>
      {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Não foi possível enviar'}>{msg.t}</Aviso>}
    </form>
  );
}

interface Veiculo { marca_modelo: string | null; ano: string | null; cor: string | null; categoria_id: string | null; renavam: string | null }

export function EditarVeiculo({ osId, numero, inicial, categorias }: { osId: string; numero: number; inicial: Veiculo; categorias: { id: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const [v, setV] = useState({ marca_modelo: inicial.marca_modelo ?? '', ano: inicial.ano ?? '', cor: inicial.cor ?? '', categoria_id: inicial.categoria_id ?? '', renavam: inicial.renavam ?? '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const campo = (k: keyof typeof v, rot: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="rotulo" htmlFor={`ve-${k}`}>{rot}</label>
      <input id={`ve-${k}`} className="campo" value={v[k]} aria-invalid={erros[k] ? true : undefined} onChange={(e) => { setV((s) => ({ ...s, [k]: e.target.value })); setErros((x) => ({ ...x, [k]: '' })); }} {...extra} />
      {erros[k] && <p className="erro-campo">{erros[k]}</p>}
    </div>
  );
  return (
    <>
      <button type="button" className="btn btn-texto btn-sm" onClick={() => setAberto(true)}><Icone nome="editar" className="h-4 w-4" />Completar dados</button>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo="Dados do veículo" descricao="A Loja completa ou corrige os dados informados na abertura.">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (v.renavam && !renavamValido(v.renavam)) { setErros({ renavam: 'Renavam inválido. Confira os 11 dígitos.' }); return; }
          iniciar(async () => {
            const r = await atualizarVeiculo(osId, numero, v);
            if (r.ok) setAberto(false); else setErros(r.campos ?? { marca_modelo: r.erro });
          });
        }}>
          {campo('marca_modelo', 'Marca e modelo')}
          <div className="grid grid-cols-2 gap-4">{campo('ano', 'Ano')}{campo('cor', 'Cor')}</div>
          {campo('renavam', 'Renavam', { inputMode: 'numeric', maxLength: 11 })}
          <div>
            <label className="rotulo" htmlFor="ve-categoria">Categoria</label>
            <select id="ve-categoria" className="campo" value={v.categoria_id} onChange={(e) => setV((s) => ({ ...s, categoria_id: e.target.value }))}>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secundario" onClick={() => setAberto(false)}>Cancelar</button>
            <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
