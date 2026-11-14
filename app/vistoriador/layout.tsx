import { Shell, type GrupoMenu, type ItemMenu } from '@/components/shell';
import { exigirPerfil } from '@/lib/sessao';
import { sair } from '../login/actions';

const GRUPOS: GrupoMenu[] = [{ titulo: 'Vistorias', itens: [{ href: '/vistoriador', label: 'Minhas vistorias', icone: 'agenda' }] }];
const BARRA: ItemMenu[] = [{ href: '/vistoriador', label: 'Minhas vistorias', icone: 'agenda' }];

export default async function VistoriadorLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirPerfil('vistoriador');
  return (
    <Shell grupos={GRUPOS} raiz="/vistoriador" usuario={s.perfil.nome_exibicao} subtitulo={s.loja?.nome || 'Vistoriador'} barraInferior={BARRA} sairAction={sair}>
      {children}
    </Shell>
  );
}
