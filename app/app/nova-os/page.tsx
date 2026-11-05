import type { Metadata } from 'next';
import { NovaOsForm } from '@/components/os/nova-os-form';
import { Cabecalho } from '@/components/ui';
import { carregarDadosNovaOs } from '@/lib/nova-os-dados';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Nova OS' };

export default async function NovaOsCliente() {
  const s = await exigirPerfil('cliente');
  const supabase = await createClient();
  const dados = await carregarDadosNovaOs(supabase, 'cliente', s.perfil.empresa_cliente_id!);
  return (
    <>
      <Cabecalho kicker="Vistorias" titulo="Nova OS" descricao="Uma ordem de serviço por placa. Para várias placas, use Importar planilha." />
      <NovaOsForm {...dados} />
    </>
  );
}
