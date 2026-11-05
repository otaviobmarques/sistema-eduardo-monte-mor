import { Abas } from '@/components/abas';
import { Cabecalho } from '@/components/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Cabecalho kicker="Gestão" titulo="Financeiro" descricao="Pagamentos por placa e fechamento mensal por cliente. O pagamento é feito fora do sistema; aqui você registra a baixa." />
      <Abas rotulo="Financeiro" itens={[{ href: '/loja/financeiro/pagamentos', label: 'Pagamentos' }, { href: '/loja/financeiro/fechamento', label: 'Fechamento mensal' }]} />
      {children}
    </>
  );
}
