import type { Metadata } from 'next';
import { Cabecalho, Selo } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { ConfigAmbiente, SeletorAmbiente, type Ambiente, type EstadoAmbiente } from './form';

export const metadata: Metadata = { title: 'Gateways de pagamento' };

export default async function GatewaysPage() {
  const supabase = await createClient();
  const [{ data: g }, { data: ambs }] = await Promise.all([
    supabase.from('gateways_pagamento').select('ativo, ambiente').eq('provedor', 'asaas').maybeSingle(),
    supabase.from('gateways_ambientes').select('ambiente, chave_final, testado_em, teste_ok, teste_mensagem, webhook_url').eq('provedor', 'asaas'),
  ]);
  const emUso: Ambiente = g?.ambiente === 'producao' ? 'producao' : 'sandbox';
  const envAmb: Ambiente = process.env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox';
  const estado = (a: Ambiente): EstadoAmbiente => {
    const x = ambs?.find((r) => r.ambiente === a);
    return { ambiente: a, chaveFinal: x?.chave_final ?? null, testadoEm: x?.testado_em ?? null, testeOk: x?.teste_ok ?? null, testeMensagem: x?.teste_mensagem ?? null, webhookUrl: x?.webhook_url ?? null, viaAmbiente: !x?.chave_final && !!process.env.ASAAS_API_KEY && envAmb === a };
  };
  const ambientes = [estado('sandbox'), estado('producao')];
  return (
    <>
      <Cabecalho kicker="Plataforma" titulo="Gateways de pagamento" descricao="Onde o sistema gera as cobranças das Lojas (Start do projeto e mensalidade). As chaves ficam criptografadas e só o servidor as lê." />
      <div className="space-y-6">
        <SeletorAmbiente emUso={emUso} ativo={!!g?.ativo} ambientes={ambientes} />
        <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
          {ambientes.map((e) => <ConfigAmbiente key={e.ambiente} e={e} emUso={!!g?.ativo && emUso === e.ambiente} />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
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
