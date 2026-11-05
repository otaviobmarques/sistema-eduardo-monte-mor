'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Abas({ itens, rotulo }: { itens: { href: string; label: string }[]; rotulo: string }) {
  const path = usePathname();
  return (
    <nav className="abas mb-8" aria-label={rotulo}>
      {itens.map((i) => (
        <Link key={i.href} href={i.href} className="aba" aria-current={path.startsWith(i.href) ? 'page' : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
