import type { Metadata } from 'next';
import { EmBreve } from '@/components/em-breve';

export const metadata: Metadata = { title: 'Pendências' };

export default function Page() {
  return <EmBreve titulo="Pendências" etapa={5} descricao="Pendências abertas, previsão e responsável, com o botão Resolver." voltar="/loja" />;
}
