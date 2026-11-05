import type { Metadata } from 'next';
import { EmBreve } from '@/components/em-breve';

export const metadata: Metadata = { title: 'Agenda' };

export default function Page() {
  return <EmBreve titulo="Agenda" etapa={5} descricao="Agenda por vistoriador, com visão de dia e semana." voltar="/loja" />;
}
