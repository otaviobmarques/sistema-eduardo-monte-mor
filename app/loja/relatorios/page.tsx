import type { Metadata } from 'next';
import { EmBreve } from '@/components/em-breve';

export const metadata: Metadata = { title: 'Relatórios' };

export default function Page() {
  return <EmBreve titulo="Relatórios" etapa={9} descricao="Relatórios por cidade, pátio, vistoriador e SLA, com exportação Excel e PDF." voltar="/loja" />;
}
