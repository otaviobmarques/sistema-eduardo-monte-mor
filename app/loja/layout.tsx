import { Shell, type GrupoMenu, type ItemMenu } from '@/components/shell';
import { exigirPerfil } from '@/lib/sessao';
import { sair } from '../login/actions';

const GRUPOS: GrupoMenu[] = [
  { titulo: 'Operação', itens: [
    { href: '/loja', label: 'Fila de OS', icone: 'fila' },
    { href: '/loja/pendencias', label: 'Pendências', icone: 'pendencia' },
    { href: '/loja/agenda', label: 'Agenda', icone: 'agenda' },
  ] },
  { titulo: 'Gestão', itens: [
    { href: '/loja/relatorios', label: 'Relatórios', icone: 'relatorio' },
    { href: '/loja/financeiro', label: 'Financeiro', icone: 'financeiro' },
    { href: '/loja/clientes', label: 'Clientes', icone: 'clientes' },
  ] },
  { titulo: 'Sistema', itens: [
    { href: '/loja/cadastros', label: 'Cadastros', icone: 'cadastro' },
    { href: '/loja/configuracoes', label: 'Configurações', icone: 'config' },
    { href: '/loja/auditoria', label: 'Auditoria', icone: 'auditoria' },
  ] },
];

const BARRA: ItemMenu[] = [
  { href: '/loja', label: 'Fila', icone: 'fila' },
  { href: '/loja/pendencias', label: 'Pendências', icone: 'pendencia' },
  { href: '/loja/agenda', label: 'Agenda', icone: 'agenda' },
  { href: '/loja/financeiro', label: 'Financeiro', icone: 'financeiro' },
];

export default async function LojaLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirPerfil('loja');
  return (
    <Shell grupos={GRUPOS} raiz="/loja" usuario={s.perfil.nome_exibicao} subtitulo="Auto Visão · Loja" barraInferior={BARRA} sairAction={sair}>
      {children}
    </Shell>
  );
}
