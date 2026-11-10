import { redirect } from 'next/navigation';
import { getSessao, ROTA_INICIAL, semSessao } from '@/lib/sessao';

export default async function Home() {
  const s = await getSessao();
  if (!s) return semSessao();
  redirect(ROTA_INICIAL[s.perfil.perfil]);
}
