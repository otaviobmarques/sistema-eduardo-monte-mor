import { Abas } from '@/components/abas';
import { Cabecalho } from '@/components/ui';

const ABAS = [
  { href: '/loja/cadastros/patios', label: 'Pátios' },
  { href: '/loja/cadastros/servicos', label: 'Serviços e preços' },
  { href: '/loja/cadastros/precos-cliente', label: 'Preços por cliente' },
  { href: '/loja/cadastros/taxas', label: 'Taxas de deslocamento' },
  { href: '/loja/cadastros/vistoriadores', label: 'Vistoriadores' },
  { href: '/loja/cadastros/motivos', label: 'Motivos' },
];

export default function CadastrosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Cabecalho kicker="Sistema" titulo="Cadastros" descricao="Dados de referência usados na abertura e na operação das OS." />
      <Abas itens={ABAS} rotulo="Cadastros" />
      {children}
    </>
  );
}
