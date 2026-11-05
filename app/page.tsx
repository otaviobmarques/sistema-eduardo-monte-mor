import { redirect } from 'next/navigation';
import { getSessao, ROTA_INICIAL } from '@/lib/sessao';

export default async function Home() {
  const s = await getSessao();
  if (!s) redirect('/login');
  redirect(ROTA_INICIAL[s.perfil.perfil]);
}
