import type { Metadata } from 'next';
import { CadastroTabela } from '@/components/cadastro-tabela';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Taxas de deslocamento' };

export default async function TaxasPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('taxas_deslocamento').select('id, cidade, uf, valor').order('uf').order('cidade');
  return (
    <CadastroTabela
      tabela="taxas_deslocamento" titulo="Taxas de deslocamento" rotuloNovo="Nova taxa" temAtivo={false} podeExcluir
      descricao="Cobradas quando a vistoria é em endereço fora de um pátio cadastrado."
      registros={data ?? []}
      campos={[
        { nome: 'cidade', rotulo: 'Cidade', tipo: 'texto', obrigatorio: true, meia: true },
        { nome: 'uf', rotulo: 'UF', tipo: 'uf', obrigatorio: true, meia: true },
        { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true },
      ]}
      colunas={[{ campo: 'cidade', rotulo: 'Cidade', destaque: true }, { campo: 'uf', rotulo: 'UF' }, { campo: 'valor', rotulo: 'Valor', formato: 'moeda' }]}
      padrao={{ uf: 'SP' }}
      vazio="Nenhuma taxa cadastrada. Sem taxa, o deslocamento fica em R$ 0,00."
    />
  );
}
