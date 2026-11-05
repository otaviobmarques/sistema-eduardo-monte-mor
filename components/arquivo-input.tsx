'use client';
import { useId, useState } from 'react';
import { Icone } from './icone';

/** Campo de arquivo com rótulo em português (o texto nativo do navegador varia de idioma). */
export function ArquivoInput({
  id, name, multiple, accept, rotuloBotao = 'Escolher arquivo', onArquivos, descritoPor, obrigatorio,
}: {
  id?: string; name?: string; multiple?: boolean; accept: string; rotuloBotao?: string;
  onArquivos?: (f: FileList | null) => void; descritoPor?: string; obrigatorio?: boolean;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const [nome, setNome] = useState<string | null>(null);
  return (
    <div className="flex min-h-campo flex-wrap items-center gap-3">
      <label htmlFor={inputId} className="btn btn-secundario btn-sm cursor-pointer has-[+input:focus-visible]:outline has-[+input:focus-visible]:outline-2 has-[+input:focus-visible]:outline-offset-2">
        <Icone nome="anexo" className="h-4 w-4" />{rotuloBotao}
      </label>
      <input
        id={inputId} name={name} type="file" multiple={multiple} accept={accept} required={obrigatorio} aria-describedby={descritoPor}
        className="peer sr-only"
        onChange={(e) => {
          const f = e.target.files;
          setNome(!f?.length ? null : f.length === 1 ? f[0].name : `${f.length} arquivos`);
          onArquivos?.(f);
          if (onArquivos) { e.target.value = ''; setNome(null); }
        }}
      />
      {!onArquivos && <span className="min-w-0 truncate text-sm text-text-secondary">{nome ?? 'Nenhum arquivo escolhido'}</span>}
    </div>
  );
}
