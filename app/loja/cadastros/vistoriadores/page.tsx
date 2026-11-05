import type { Metadata } from 'next';
import { CadastroTabela } from '@/components/cadastro-tabela';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Vistoriadores' };

export default async function VistoriadoresPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('vistoriadores').select('id, nome, ativo').order('nome');
  return (
    <CadastroTabela
      tabela="vistoriadores" titulo="Vistoriadores" rotuloNovo="Novo vistoriador"
      descricao="Vistoriadores não têm login. O cadastro é usado na designação, na agenda e nos relatórios."
      registros={data ?? []}
      campos={[{ nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true }, { nome: 'ativo', rotulo: 'Vistoriador ativo', tipo: 'booleano' }]}
      colunas={[{ campo: 'nome', rotulo: 'Nome', destaque: true }]}
      vazio="Nenhum vistoriador cadastrado."
    />
  );
}
