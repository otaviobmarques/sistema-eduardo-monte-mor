import type { Metadata } from 'next';
import { CadastroTabela } from '@/components/cadastro-tabela';
import { AcessoVistoriadores, type VistoriadorAcesso } from '@/components/cadastros/acesso-vistoriadores';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { telefone } from '@/lib/formato';

export const metadata: Metadata = { title: 'Vistoriadores' };

export default async function VistoriadoresPage() {
  const s = await exigirPerfil('loja');
  const supabase = await createClient();
  const [{ data }, { data: perfis }] = await Promise.all([
    supabase.from('vistoriadores').select('id, nome, ativo, telefone').order('nome'),
    // Logins dos vistoriadores desta Loja (perfis só são lidos pelo servidor, depois de exigirPerfil)
    createAdminClient().from('perfis_usuario').select('vistoriador_id, login, bloqueado, primeiro_acesso_em').eq('loja_id', s.perfil.loja_id!).eq('perfil', 'vistoriador'),
  ]);
  const porVist = new Map((perfis ?? []).map((p) => [p.vistoriador_id as string, p]));
  const lista: VistoriadorAcesso[] = (data ?? []).map((v) => {
    const p = porVist.get(v.id);
    return { ...v, acesso: p ? { login: p.login, bloqueado: p.bloqueado, primeiro_acesso_em: p.primeiro_acesso_em } : null };
  });
  return (
    <>
      <CadastroTabela
        tabela="vistoriadores" titulo="Vistoriadores" rotuloNovo="Novo vistoriador"
        descricao="Usados na designação, na agenda e nos relatórios. Com acesso, o vistoriador vê no celular as vistorias dele."
        registros={(data ?? []).map((v) => ({ ...v, telefone_fmt: v.telefone ? telefone(v.telefone) : '—' }))}
        campos={[
          { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { nome: 'telefone', rotulo: 'Celular (WhatsApp)', tipo: 'texto' },
          { nome: 'ativo', rotulo: 'Vistoriador ativo', tipo: 'booleano' },
        ]}
        colunas={[{ campo: 'nome', rotulo: 'Nome', destaque: true }, { campo: 'telefone_fmt', rotulo: 'Celular' }]}
        vazio="Nenhum vistoriador cadastrado."
      />
      <AcessoVistoriadores lista={lista} />
    </>
  );
}
