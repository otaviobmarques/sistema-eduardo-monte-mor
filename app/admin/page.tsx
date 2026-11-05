import type { Metadata } from 'next';
import Link from 'next/link';
import { Icone } from '@/components/icone';
import { GradeKpi, Kpi } from '@/components/kpi';
import { Cabecalho, Selo } from '@/components/ui';
import { moeda } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Lojas' };

export default async function AdminPage() {
  const supabase = await createClient();
  const inicioMes = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 8) + '01';
  const [{ data: lojas }, { data: faturas }, { data: gestores }, { data: empresas }, { data: osMes }] = await Promise.all([
    supabase.from('lojas').select('id, nome, cidade, uf, plano_mensal, ativo, bloqueada, responsavel').order('nome'),
    supabase.from('faturas').select('loja_id, valor, status, pago_em'),
    supabase.from('perfis_usuario').select('loja_id, login, deve_trocar_senha').eq('perfil', 'loja'),
    supabase.from('empresas_clientes').select('loja_id'),
    supabase.from('ordens_servico').select('loja_id').gte('aberta_em', `${inicioMes}T00:00:00-03:00`),
  ]);
  const conta = (l: { loja_id: string }[] | null, id: string) => (l ?? []).filter((x) => x.loja_id === id).length;
  const fat = faturas ?? [];
  const aReceber = fat.filter((f) => f.status === 'pendente' || f.status === 'vencido').reduce((a, f) => a + Number(f.valor), 0);
  const recebidoMes = fat.filter((f) => f.status === 'pago' && f.pago_em && f.pago_em >= inicioMes).reduce((a, f) => a + Number(f.valor), 0);
  return (
    <>
      <Cabecalho kicker="Plataforma" titulo="Lojas franqueadas" descricao="Cada Loja tem seus clientes, OS e cadastros separados. Aqui você cadastra as Lojas, gera o acesso do Gestor e controla a cobrança."
        acoes={<Link href="/admin/lojas/nova" className="btn btn-primario"><Icone nome="mais" />Nova Loja</Link>} />
      <div className="mb-8">
        <GradeKpi>
          <Kpi rotulo="Lojas ativas" valor={(lojas ?? []).filter((l) => l.ativo && !l.bloqueada).length} tom="escuro" />
          <Kpi rotulo="Bloqueadas" valor={(lojas ?? []).filter((l) => l.bloqueada).length} tom={(lojas ?? []).some((l) => l.bloqueada) ? 'alerta' : undefined} />
          <Kpi rotulo="A receber" valor={moeda(aReceber)} detalhe={`${fat.filter((f) => f.status === 'vencido').length} vencida(s)`} />
          <Kpi rotulo="Recebido no mês" valor={moeda(recebidoMes)} />
        </GradeKpi>
      </div>
      <div className="overflow-x-auto">
        <table className="tabela tabela-cartoes">
          <thead><tr><th scope="col">Loja</th><th scope="col">Gestor</th><th scope="col">Clientes</th><th scope="col">OS no mês</th><th scope="col">Mensalidade</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Abrir</span></th></tr></thead>
          <tbody>
            {(lojas ?? []).map((l) => {
              const g = (gestores ?? []).find((x) => x.loja_id === l.id);
              const vencidas = fat.filter((f) => f.loja_id === l.id && f.status === 'vencido').length;
              return (
                <tr key={l.id} className={l.bloqueada ? 'shadow-[inset_4px_0_0_#B42318]' : ''}>
                  <td data-rotulo="Loja"><Link href={`/admin/lojas/${l.id}`} className="font-semibold hover:text-action hover:underline">{l.nome}</Link><span className="block text-xs text-text-secondary">{[l.cidade, l.uf].filter(Boolean).join(' / ')}{l.responsavel ? ` · ${l.responsavel}` : ''}</span></td>
                  <td data-rotulo="Gestor">{g ? <>{g.login}{g.deve_trocar_senha && <span className="block text-xs text-warn">aguardando 1º acesso</span>}</> : <span className="text-text-secondary">sem acesso</span>}</td>
                  <td data-rotulo="Clientes">{conta(empresas, l.id)}</td>
                  <td data-rotulo="OS no mês">{conta(osMes, l.id)}</td>
                  <td data-rotulo="Mensalidade">{moeda(l.plano_mensal)}</td>
                  <td data-rotulo="Situação">{!l.ativo ? <Selo tom="neutro">Inativa</Selo> : l.bloqueada ? <Selo tom="erro">■ Bloqueada</Selo> : vencidas ? <Selo tom="atencao">◆ {vencidas} vencida(s)</Selo> : <Selo tom="ok">● Em dia</Selo>}</td>
                  <td data-rotulo="" className="text-right"><Link href={`/admin/lojas/${l.id}`} className="btn btn-texto btn-sm">Abrir</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
