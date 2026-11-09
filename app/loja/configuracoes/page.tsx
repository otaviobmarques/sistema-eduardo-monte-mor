import type { Metadata } from 'next';
import { CadastroTabela } from '@/components/cadastro-tabela';
import { Cabecalho } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { ConfigForm } from './form';
import { coresValidas } from '@/lib/cores-status';

export const metadata: Metadata = { title: 'Configurações' };

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const [{ data: cfg }, { data: feriados }] = await Promise.all([
    supabase.from('configuracoes').select('alerta1_horas, alerta2_horas_antes, contagem, horario_util, escalonar_minutos, ajuste_preco_habilitado, cores_status').limit(1).maybeSingle(),
    supabase.from('feriados').select('id, data, descricao').order('data'),
  ]);
  return (
    <>
      <Cabecalho kicker="Sistema" titulo="Configurações" descricao="SLA, alertas, contagem de horas e escalonamento." />
      <div className="grid gap-10 xl:grid-cols-[1fr_420px] xl:items-start">
        {cfg && <ConfigForm inicial={{ ...cfg, cores_status: coresValidas(cfg.cores_status) }} />}
        <CadastroTabela tabela="feriados" titulo="Feriados" rotuloNovo="Novo feriado" temAtivo={false} podeExcluir busca={false}
          descricao="Usados só na contagem em horas úteis."
          registros={feriados ?? []}
          campos={[{ nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true }, { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true }]}
          colunas={[{ campo: 'data', rotulo: 'Data', formato: 'data' }, { campo: 'descricao', rotulo: 'Feriado', destaque: true }]}
          vazio="Nenhum feriado cadastrado." />
      </div>
    </>
  );
}
