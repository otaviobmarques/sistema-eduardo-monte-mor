import { Shell, type GrupoMenu, type ItemMenu } from '@/components/shell';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { data as fmtData, moeda } from '@/lib/formato';
import Link from 'next/link';
import { sair } from '../login/actions';
import { NotificacoesProvider, Sino, type Notificacao } from '@/components/notificacoes';

const GRUPOS: GrupoMenu[] = [
  { titulo: 'Operação', itens: [
    { href: '/loja', label: 'Fila de OS', icone: 'fila', contador: 'alertas' },
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
    { href: '/loja/assinatura', label: 'Assinatura', icone: 'financeiro' },
  ] },
];

const BARRA: ItemMenu[] = [
  { href: '/loja', label: 'Fila', icone: 'fila', contador: 'alertas' },
  { href: '/loja/pendencias', label: 'Pendências', icone: 'pendencia' },
  { href: '/loja/agenda', label: 'Agenda', icone: 'agenda' },
  { href: '/loja/financeiro', label: 'Financeiro', icone: 'financeiro' },
];

export default async function LojaLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirPerfil('loja');
  const supabase = await createClient();
  const [{ data: loja }, { data: abertas }, { data: naoLidas }] = await Promise.all([
    supabase.from('lojas').select('nome, dias_tolerancia').eq('id', s.perfil.loja_id!).single(),
    supabase.from('faturas').select('valor, vencimento, status, link_pagamento').in('status', ['vencido']).order('vencimento').limit(1),
    supabase.from('notificacoes').select('id, tipo, titulo, corpo, link, criada_em, os_id, lote_id').eq('destino', 'loja').is('vista_em', null).order('criada_em', { ascending: false }).limit(50),
  ]);
  const vencida = abertas?.[0];
  const suspensao = vencida && loja ? new Date(Date.parse(`${vencida.vencimento}T12:00:00-03:00`) + (loja.dias_tolerancia + 1) * 86400_000) : null;
  return (
    <NotificacoesProvider modo="loja" iniciais={(naoLidas ?? []) as Notificacao[]}>
    <Shell grupos={GRUPOS} raiz="/loja" usuario={s.perfil.nome_exibicao} subtitulo={loja?.nome ?? 'Loja'} barraInferior={BARRA} sairAction={sair} topo={<Sino />}>
      {vencida && (
        <div className="aviso aviso-erro mb-6 flex-col sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div>
            <p className="font-display text-base font-extrabold">Fatura de {moeda(vencida.valor)} vencida em {fmtData(vencida.vencimento)}</p>
            <p>Sem pagamento, o acesso da Loja e dos seus clientes será suspenso em {fmtData(suspensao)}.</p>
          </div>
          {vencida.link_pagamento ? <a href={vencida.link_pagamento} target="_blank" rel="noreferrer" className="btn btn-primario">Pagar agora</a> : <Link href="/loja/assinatura" className="btn btn-primario">Ver assinatura</Link>}
        </div>
      )}
      {children}
    </Shell>
    </NotificacoesProvider>
  );
}
