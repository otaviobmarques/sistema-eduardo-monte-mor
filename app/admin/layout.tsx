import { Shell, type GrupoMenu, type ItemMenu } from '@/components/shell';
import { exigirPerfil } from '@/lib/sessao';
import { sair } from '../login/actions';

const GRUPOS: GrupoMenu[] = [
  { titulo: 'Plataforma', itens: [
    { href: '/admin', label: 'Lojas', icone: 'clientes' },
    { href: '/admin/cobranca', label: 'Cobrança', icone: 'financeiro' },
  ] },
];
const BARRA: ItemMenu[] = [
  { href: '/admin', label: 'Lojas', icone: 'clientes' },
  { href: '/admin/cobranca', label: 'Cobrança', icone: 'financeiro' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirPerfil('admin');
  return (
    <Shell grupos={GRUPOS} raiz="/admin" usuario={s.perfil.nome_exibicao} subtitulo="Administrador da plataforma" barraInferior={BARRA} sairAction={sair}>
      {children}
    </Shell>
  );
}
