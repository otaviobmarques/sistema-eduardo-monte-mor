import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { statusFatura, type PagamentoAsaas } from '@/lib/asaas';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function autorizado(req: NextRequest) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  const recebido = req.headers.get('asaas-access-token') ?? '';
  if (!esperado) return false;
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Eventos de cobrança do Asaas → faturas da plataforma (e desbloqueio automático ao pagar). */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  const corpo = (await req.json().catch(() => null)) as { event?: string; payment?: PagamentoAsaas } | null;
  const p = corpo?.payment;
  if (!corpo?.event?.startsWith('PAYMENT_') || !p?.id) return NextResponse.json({ ok: true, ignorado: true });

  const admin = createAdminClient();
  const ref = p.externalReference ?? '';
  let lojaId = ref.includes(':') ? ref.split(':')[1] : null;
  if (!lojaId) lojaId = (await admin.from('lojas').select('id').eq('asaas_customer_id', p.customer).maybeSingle()).data?.id ?? null;
  if (!lojaId) return NextResponse.json({ ok: true, ignorado: 'loja não encontrada' });

  const status = statusFatura(p.status, corpo.event === 'PAYMENT_DELETED' || p.deleted);
  const tipo = ref.startsWith('start:') ? 'start' : p.subscription || ref.startsWith('mensal:') ? 'mensalidade' : 'avulsa';
  const descricao = tipo === 'start' ? 'Start do projeto' : tipo === 'mensalidade' ? `Mensalidade ${p.dueDate.slice(5, 7)}/${p.dueDate.slice(0, 4)}` : p.description ?? 'Cobrança avulsa';
  const pago = status === 'pago';
  const { error } = await admin.from('faturas').upsert({
    loja_id: lojaId, tipo, descricao, valor: p.value, vencimento: p.dueDate, status, asaas_payment_id: p.id,
    link_pagamento: p.invoiceUrl ?? null, forma_pagamento: p.billingType && p.billingType !== 'UNDEFINED' ? p.billingType : null,
    pago_em: pago ? new Date(`${p.clientPaymentDate ?? p.paymentDate ?? new Date().toISOString().slice(0, 10)}T12:00:00-03:00`).toISOString() : null,
  }, { onConflict: 'asaas_payment_id' });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (pago) await admin.rpc('reavaliar_bloqueio', { p_loja: lojaId });
  return NextResponse.json({ ok: true });
}
