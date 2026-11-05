import type { Metadata } from 'next';
import { EmBreve } from '@/components/em-breve';

export const metadata: Metadata = { title: 'Financeiro' };

export default function Page() {
  return <EmBreve titulo="Financeiro" etapa={8} descricao="Pagamentos por placa e fechamento mensal." voltar="/app" />;
}
