import type { Metadata } from 'next';
import { CadastroTabela } from '@/components/cadastro-tabela';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Pátios' };

export default async function PatiosPage() {
  const supabase = await createClient();
  const [{ data: patios }, { data: apelidos }] = await Promise.all([
    supabase.from('patios').select('id, nome, endereco, cidade, uf, ativo').order('nome'),
    supabase.from('patio_apelidos').select('id, patio_id, apelido, patios(nome)').order('apelido'),
  ]);
  const opcoesPatio = (patios ?? []).map((p) => ({ valor: p.id, rotulo: p.nome }));
  return (
    <div className="space-y-12">
      <CadastroTabela
        tabela="patios" titulo="Pátios" rotuloNovo="Novo pátio"
        descricao="A cidade do pátio é usada automaticamente na abertura da OS."
        registros={patios ?? []}
        campos={[
          { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, placeholder: 'Ex.: Freitas Utinga' },
          { nome: 'endereco', rotulo: 'Endereço', tipo: 'texto' },
          { nome: 'cidade', rotulo: 'Cidade', tipo: 'texto', obrigatorio: true, meia: true },
          { nome: 'uf', rotulo: 'UF', tipo: 'uf', obrigatorio: true, meia: true },
          { nome: 'ativo', rotulo: 'Pátio ativo', tipo: 'booleano' },
        ]}
        colunas={[
          { campo: 'nome', rotulo: 'Pátio', destaque: true },
          { campo: 'endereco', rotulo: 'Endereço' },
          { campo: 'cidade', rotulo: 'Cidade' },
          { campo: 'uf', rotulo: 'UF' },
        ]}
        padrao={{ uf: 'SP' }}
      />
      <CadastroTabela
        tabela="patio_apelidos" titulo="Apelidos de pátio" rotuloNovo="Novo apelido" temAtivo={false} podeExcluir
        descricao="Outros nomes com que o pátio aparece nas planilhas. A importação ignora maiúsculas e acentos."
        registros={(apelidos ?? []).map((a) => ({ ...a, patio_nome: (a.patios as unknown as { nome: string } | null)?.nome }))}
        campos={[
          { nome: 'patio_id', rotulo: 'Pátio', tipo: 'select', opcoes: opcoesPatio, obrigatorio: true },
          { nome: 'apelido', rotulo: 'Apelido', tipo: 'texto', obrigatorio: true, placeholder: 'Ex.: Freitas S. Barbara' },
        ]}
        colunas={[{ campo: 'apelido', rotulo: 'Apelido', destaque: true }, { campo: 'patio_nome', rotulo: 'Pátio' }]}
      />
    </div>
  );
}
