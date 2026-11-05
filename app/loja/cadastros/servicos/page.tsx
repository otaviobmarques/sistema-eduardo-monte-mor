import type { Metadata } from 'next';
import { CadastroTabela } from '@/components/cadastro-tabela';
import { PrecosMatriz } from '@/components/precos-matriz';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Serviços e preços' };

export default async function ServicosPage() {
  const supabase = await createClient();
  const [{ data: servicos }, { data: categorias }, { data: precos }] = await Promise.all([
    supabase.from('servicos').select('id, nome, sla_horas, padrao, ativo').order('nome'),
    supabase.from('categorias_veiculo').select('id, nome').order('ordem'),
    supabase.from('precos').select('servico_id, categoria_id, valor'),
  ]);
  const valores = Object.fromEntries((precos ?? []).map((p) => [`${p.servico_id}:${p.categoria_id}`, Number(p.valor)]));
  const ativos = (servicos ?? []).filter((s) => s.ativo);
  return (
    <div className="space-y-12">
      <CadastroTabela
        tabela="servicos" titulo="Serviços" rotuloNovo="Novo serviço" busca={false}
        descricao="O SLA vale a partir da abertura da OS e nunca passa de 48 horas. O serviço padrão é usado quando a planilha não informa."
        registros={(servicos ?? []).map((s) => ({ ...s, padrao_txt: s.padrao ? 'Padrão' : '' }))}
        campos={[
          { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { nome: 'sla_horas', rotulo: 'SLA (horas)', tipo: 'numero', obrigatorio: true, ajuda: 'Entre 1 e 48 horas.' },
          { nome: 'padrao', rotulo: 'Serviço padrão da importação', tipo: 'booleano' },
          { nome: 'ativo', rotulo: 'Serviço ativo', tipo: 'booleano' },
        ]}
        colunas={[
          { campo: 'nome', rotulo: 'Serviço', destaque: true },
          { campo: 'sla_horas', rotulo: 'SLA', formato: 'horas' },
          { campo: 'padrao_txt', rotulo: 'Importação' },
        ]}
        padrao={{ sla_horas: 48 }}
      />
      <section className="space-y-4">
        <div>
          <h2 className="h3">Tabela de preços padrão</h2>
          <p className="mt-1 text-sm text-text-secondary">Valor por serviço e categoria de veículo. Clientes com tabela própria usam os preços definidos no cadastro deles.</p>
        </div>
        <PrecosMatriz servicos={ativos} categorias={categorias ?? []} valores={valores} />
      </section>
    </div>
  );
}
