import { Abas } from '@/components/abas';
import { Cabecalho } from '@/components/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Cabecalho kicker="Financeiro" titulo="Pagamentos" descricao="Situação de pagamento de cada placa e o fechamento do mês. O pagamento é feito diretamente com a Auto Visão." />
      <Abas rotulo="Financeiro" itens={[{ href: '/app/financeiro/pagamentos', label: 'Pagamentos' }, { href: '/app/financeiro/fechamento', label: 'Fechamento mensal' }]} />
      {children}
    </>
  );
}
