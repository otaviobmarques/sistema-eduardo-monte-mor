import type { Metadata } from 'next';
import { EmBreve } from '@/components/em-breve';

export const metadata: Metadata = { title: 'Importar lote' };

export default function Page() {
  return <EmBreve titulo="Importar lote" etapa={6} descricao="Importação de planilha com prévia, correção e confirmação." voltar="/loja" />;
}
