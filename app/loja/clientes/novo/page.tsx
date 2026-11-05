import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho } from '@/components/ui';
import { ClienteForm } from '../cliente-form';

export const metadata: Metadata = { title: 'Novo cliente' };

export default function NovoClientePage() {
  return (
    <>
      <Link href="/loja/clientes" className="btn btn-texto btn-sm -ml-3 mb-2">← Clientes</Link>
      <Cabecalho titulo="Novo cliente" descricao="Depois de salvar, gere o acesso da empresa." />
      <ClienteForm />
    </>
  );
}
