import { redirect } from 'next/navigation';
import { getSessao } from '@/lib/sessao';

export default async function Home() {
  const s = await getSessao();
  if (!s) redirect('/login');
  redirect(s.perfil.perfil === 'loja' ? '/loja' : '/app');
}
