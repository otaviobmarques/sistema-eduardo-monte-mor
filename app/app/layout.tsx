import { Shell, type GrupoMenu, type ItemMenu } from '@/components/shell';
import { exigirPerfil } from '@/lib/sessao';
import { sair } from '../login/actions';

const GRUPOS: GrupoMenu[] = [
  { titulo: 'Vistorias', itens: [
    { href: '/app', label: 'Painel', icone: 'painel' },
    { href: '/app/nova-os', label: 'Nova OS', icone: 'mais' },
    { href: '/app/importar', label: 'Importar planilha', icone: 'importar' },
    { href: '/app/pendencias', label: 'Pendências', icone: 'pendencia' },
  ] },
  { titulo: 'Acompanhamento', itens: [
    { href: '/app/relatorios', label: 'Relatórios', icone: 'relatorio' },
    { href: '/app/financeiro', label: 'Financeiro', icone: 'financeiro' },
  ] },
];

const BARRA: ItemMenu[] = [
  { href: '/app', label: 'Painel', icone: 'painel' },
  { href: '/app/nova-os', label: 'Nova OS', icone: 'mais' },
  { href: '/app/importar', label: 'Importar', icone: 'importar' },
  { href: '/app/pendencias', label: 'Pendências', icone: 'pendencia' },
];

export default async function ClienteLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirPerfil('cliente');
  const empresa = s.empresa?.nome_fantasia || s.empresa?.razao_social || '';
  return (
    <Shell grupos={GRUPOS} raiz="/app" usuario={empresa} subtitulo={`Usuário: ${s.perfil.login}`} barraInferior={BARRA} sairAction={sair}>
      {children}
    </Shell>
  );
}
