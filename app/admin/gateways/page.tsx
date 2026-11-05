import type { Metadata } from 'next';
import { Cabecalho, Selo } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { GatewayAsaas } from './form';

export const metadata: Metadata = { title: 'Gateways de pagamento' };

export default async function GatewaysPage() {
  const supabase = await createClient();
  const { data: gs } = await supabase.from('gateways_pagamento').select('provedor, ativo, ambiente, chave_final, testado_em, teste_ok, teste_mensagem, webhook_url');
  const a = gs?.find((g) => g.provedor === 'asaas');
  return (
    <>
      <Cabecalho kicker="Plataforma" titulo="Gateways de pagamento" descricao="Onde o sistema gera as cobranças das Lojas (Start do projeto e mensalidade). As chaves ficam criptografadas e só o servidor as lê." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px] xl:items-start">
        <GatewayAsaas e={{
          ativo: !!a?.ativo, ambiente: a?.ambiente === 'producao' ? 'producao' : 'sandbox', chaveFinal: a?.chave_final ?? null, testadoEm: a?.testado_em ?? null,
          testeOk: a?.teste_ok ?? null, testeMensagem: a?.teste_mensagem ?? null, webhookUrl: a?.webhook_url ?? null, viaAmbiente: !a?.chave_final && !!process.env.ASAAS_API_KEY,
        }} />
        <div className="space-y-4">
          {[['Mercado Pago', 'Pix, boleto e cartão com assinaturas.'], ['Stripe', 'Cartão recorrente; Pix e boleto com limitações no Brasil.']].map(([n, d]) => (
            <section key={n} className="card p-6 opacity-80" aria-label={n}>
              <div className="flex items-center justify-between gap-3"><h2 className="h3">{n}</h2><Selo tom="neutro">Em breve</Selo></div>
              <p className="mt-2 text-sm text-text-secondary">{d} A integração ainda não está disponível; peça quando quiser usar.</p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
