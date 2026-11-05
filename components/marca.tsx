import Image from 'next/image';

/**
 * Assinatura oficial Auto Visão (Design System 1.1, p. 5–6 e 31).
 * Proporção fixa 4,3207. Fundo claro → colorido; fundo escuro ou vermelho → integralmente branco.
 * Não recriar o lettering: sempre os arquivos de /public/brand.
 */
const PROPORCAO = 2048 / 474;

export function Logo({
  variante = 'colorido', altura = 36, className = '', prioridade = false,
}: { variante?: 'colorido' | 'branco'; altura?: number; className?: string; prioridade?: boolean }) {
  return (
    <Image
      src={variante === 'branco' ? '/brand/logo-branco.png' : '/brand/logo-colorido.png'}
      alt="Auto Visão Vistorias Automotivas"
      width={Math.round(altura * PROPORCAO)}
      height={altura}
      priority={prioridade}
      className={`h-auto select-none ${className}`}
      style={{ width: Math.round(altura * PROPORCAO), height: altura }}
    />
  );
}

/** Mosaico oficial (faixa quadriculada com símbolo). Módulos escalados juntos. */
export function Mosaico({ modulo = 12, linhas = 3, className = '' }: { modulo?: number; linhas?: 1 | 3; className?: string }) {
  const src = linhas === 1 ? '/brand/mosaico-1linha.png' : '/brand/mosaico.png';
  return (
    <div
      aria-hidden
      className={`w-full shrink-0 bg-repeat-x ${className}`}
      style={{ height: modulo * linhas, backgroundImage: `url(${src})`, backgroundSize: `auto ${modulo * linhas}px` }}
    />
  );
}

/** @deprecated use Mosaico */
export const FaixaQuadriculada = Mosaico;

/** Recorte do símbolo como elemento de reconhecimento (papelaria/envelope, p. 35). */
export function RecorteSimbolo({ className = '', opacidade = 0.12, tom = 'escuro' }: { className?: string; opacidade?: number; tom?: 'escuro' | 'claro' }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/simbolo-mono.png" alt="" aria-hidden className={`pointer-events-none select-none ${className}`} style={{ opacity: opacidade, filter: tom === 'escuro' ? 'brightness(0)' : undefined }} />
  );
}

export function Simbolo({ tamanho = 32, className = '' }: { tamanho?: number; className?: string }) {
  return <Image src="/brand/simbolo.png" alt="" aria-hidden width={tamanho} height={tamanho} className={className} />;
}
