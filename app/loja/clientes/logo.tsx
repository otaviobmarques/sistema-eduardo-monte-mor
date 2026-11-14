'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Aviso } from '@/components/ui';
import { enviarLogoCliente, removerLogoCliente } from './actions';

export function LogoCliente({ empresaId, nome, src }: { empresaId: string; nome: string; src: string | null }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const enviar = (f: File | undefined) => {
    if (!f) return;
    setErro(null); setOk(null);
    if (f.size > 2 * 1024 * 1024) { setErro('A imagem passa de 2 MB. Reduza o tamanho e envie de novo.'); return; }
    const fd = new FormData(); fd.append('logo', f);
    iniciar(async () => {
      const r = await enviarLogoCliente(empresaId, fd);
      if (input.current) input.current.value = '';
      if (!r.ok) { setErro(r.erro); return; }
      setOk('Logotipo salvo. Ele já aparece no portal do cliente.');
      router.refresh();
    });
  };
  const remover = () => iniciar(async () => {
    setErro(null); setOk(null);
    const r = await removerLogoCliente(empresaId);
    if (!r.ok) { setErro(r.erro); return; }
    setOk('Logotipo removido.');
    router.refresh();
  });

  return (
    <section className="card space-y-4 p-6" aria-labelledby="logo-titulo" data-teste="logo-cliente">
      <div>
        <h2 id="logo-titulo" className="h3">Logotipo do cliente</h2>
        <p className="mt-1 text-sm text-text-secondary">Aparece no portal do cliente (menu e painel). PNG, JPG ou WEBP de até 2 MB; de preferência com fundo transparente ou branco.</p>
      </div>
      <div className="flex min-h-[96px] items-center justify-center rounded-card border border-dashed border-border bg-[#fff] p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={`Logotipo de ${nome}`} className="max-h-20 max-w-full object-contain" /> : <span className="text-sm text-[#696267]">Sem logotipo</span>}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className={`btn btn-secundario btn-sm ${pendente ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
          {pendente ? 'Enviando…' : src ? 'Trocar logotipo' : 'Enviar logotipo'}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={pendente}
            onChange={(e) => enviar(e.target.files?.[0])} aria-label="Escolher imagem do logotipo" />
        </label>
        {src && <button type="button" className="btn btn-fantasma btn-sm" disabled={pendente} onClick={remover}>Remover</button>}
      </div>
      {erro && <Aviso tipo="erro" titulo="Logotipo não enviado">{erro}</Aviso>}
      {ok && <Aviso tipo="ok" titulo={ok} />}
    </section>
  );
}
