import { Abas } from '@/components/abas';

export function AbasAuditoria() {
  return <Abas exato rotulo="Auditoria" itens={[{ href: '/loja/auditoria', label: 'Alterações' }, { href: '/loja/auditoria/acessos', label: 'Acessos' }]} />;
}
