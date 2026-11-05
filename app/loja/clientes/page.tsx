import type { Metadata } from 'next';
import Link from 'next/link';
import { Icone } from '@/components/icone';
import { Cabecalho, Selo } from '@/components/ui';
import { situacaoAcesso } from '@/lib/acesso';
import { formatarCnpj } from '@/lib/regras/cnpj';
import { createClient } from '@/lib/supabase/server';
import { SeloAcesso } from './acesso';

export const metadata: Metadata = { title: 'Clientes' };

export default async function ClientesPage() {
  const supabase = await createClient();
  const [{ data: empresas }, { data: perfis }] = await Promise.all([
    supabase.from('empresas_clientes').select('id, cnpj, razao_social, nome_fantasia, cidade, uf, forma_cobranca, usa_tabela_propria, sla_horas, ativo').order('razao_social'),
    supabase.from('perfis_usuario').select('empresa_cliente_id, login, bloqueado, deve_trocar_senha, senha_expira_em').eq('perfil', 'cliente'),
  ]);
  const porEmpresa = new Map((perfis ?? []).map((p) => [p.empresa_cliente_id, p]));
  return (
    <>
      <Cabecalho kicker="Gestão" titulo="Clientes" descricao="Empresas atendidas, condições comerciais e acesso ao sistema. Só o gestor cria e desbloqueia acessos."
        acoes={<Link href="/loja/clientes/novo" className="btn btn-primario"><Icone nome="mais" />Novo cliente</Link>} />
      {!empresas?.length ? (
        <div className="card p-10 text-center">
          <p className="h3">Nenhum cliente cadastrado</p>
          <p className="mt-2 text-text-secondary">Cadastre a primeira empresa para gerar o acesso dela.</p>
          <Link href="/loja/clientes/novo" className="btn btn-primario mt-6">Cadastrar cliente</Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-cartoes">
            <thead><tr><th scope="col">Cliente</th><th scope="col">CNPJ</th><th scope="col">Cobrança</th><th scope="col">Preços</th><th scope="col">SLA</th><th scope="col">Acesso</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {empresas.map((e) => {
                const p = porEmpresa.get(e.id);
                return (
                  <tr key={e.id} className={e.ativo ? '' : 'text-text-secondary'}>
                    <td data-rotulo="Cliente">
                      <Link href={`/loja/clientes/${e.id}`} className="font-semibold hover:text-action hover:underline">{e.nome_fantasia || e.razao_social}</Link>
                      {e.nome_fantasia && <span className="block text-xs text-text-secondary">{e.razao_social}</span>}
                      {!e.ativo && <span className="mt-1 block"><Selo tom="neutro">Inativo</Selo></span>}
                    </td>
                    <td data-rotulo="CNPJ" className="whitespace-nowrap">{formatarCnpj(e.cnpj)}</td>
                    <td data-rotulo="Cobrança">{e.forma_cobranca === 'faturado' ? 'Faturado' : 'Avulso'}</td>
                    <td data-rotulo="Preços">{e.usa_tabela_propria ? 'Própria' : 'Padrão'}</td>
                    <td data-rotulo="SLA">{e.sla_horas}h</td>
                    <td data-rotulo="Acesso"><div className="flex flex-col items-end gap-1 md:items-start"><SeloAcesso s={situacaoAcesso(p)} />{p && <span className="text-xs text-text-secondary">{p.login}</span>}</div></td>
                    <td data-rotulo="" className="text-right"><Link href={`/loja/clientes/${e.id}`} className="btn btn-texto btn-sm">Abrir</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
