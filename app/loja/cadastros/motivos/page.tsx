import type { Metadata } from 'next';
import { CadastroTabela } from '@/components/cadastro-tabela';
import { MOTIVO_TIPO_LABEL } from '@/lib/cadastros';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Motivos' };

export default async function MotivosPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('motivos').select('id, tipo, descricao, ordem, ativo').order('tipo').order('ordem');
  const opcoes = Object.entries(MOTIVO_TIPO_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }));
  return (
    <CadastroTabela
      tabela="motivos" titulo="Motivos" rotuloNovo="Novo motivo"
      descricao="Listas padronizadas usadas ao frustrar, cancelar, justificar atraso, abrir pendência e reagendar."
      registros={data ?? []}
      campos={[
        { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes, obrigatorio: true },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true },
        { nome: 'ordem', rotulo: 'Ordem na lista', tipo: 'numero', ajuda: 'Menor aparece primeiro. Use 99 para “Outro”.' },
        { nome: 'ativo', rotulo: 'Motivo ativo', tipo: 'booleano' },
      ]}
      colunas={[{ campo: 'tipo', rotulo: 'Tipo', formato: 'opcao' }, { campo: 'descricao', rotulo: 'Descrição', destaque: true }, { campo: 'ordem', rotulo: 'Ordem' }]}
      padrao={{ ordem: 10 }}
    />
  );
}
