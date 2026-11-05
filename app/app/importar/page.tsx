import type { Metadata } from 'next';
import { EmBreve } from '@/components/em-breve';

export const metadata: Metadata = { title: 'Importar planilha' };

export default function Page() {
  return <EmBreve titulo="Importar planilha" etapa={6} descricao="Envie a planilha de placas, confira a prévia e crie todas as OS de uma vez." voltar="/app" />;
}
