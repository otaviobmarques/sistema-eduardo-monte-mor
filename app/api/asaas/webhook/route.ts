import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { ambienteDoToken, statusFatura, type PagamentoAsaas } from '@/lib/asaas';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const iguais = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Eventos de cobrança do Asaas → faturas da plataforma (e desbloqueio automático ao pagar).
 * Cada conta (Teste e Produção) avisa com o próprio token; o aviso só mexe nas faturas daquele ambiente.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('asaas-access-token') ?? '';
  const ambiente = token ? await ambienteDoToken(token, iguais) : null;
  if (!ambiente) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  const corpo = (await req.json().catch(() => null)) as { event?: string; payment?: PagamentoAsaas } | null;
  const p = corpo?.payment;
  if (!corpo?.event?.startsWith('PAYMENT_') || !p?.id) return NextResponse.json({ ok: true, ignorado: true });

  const admin = createAdminClient();
  const { data: existente } = await admin.from('faturas').select('ambiente').eq('asaas_payment_id', p.id).maybeSingle();
  if (existente && existente.ambiente && existente.ambiente !== ambiente) return NextResponse.json({ ok: true, ignorado: 'fatura de outro ambiente' });

  const ref = p.externalReference ?? '';
  let lojaId = ref.includes(':') ? ref.split(':')[1] : null;
  if (!lojaId) lojaId = (await admin.from('lojas_gateway').select('loja_id').eq('provedor', 'asaas').eq('ambiente', ambiente).eq('customer_id', p.customer).maybeSingle()).data?.loja_id ?? null;
  if (!lojaId || !/^[0-9a-f-]{36}$/.test(lojaId)) return NextResponse.json({ ok: true, ignorado: 'loja não encontrada' });

  const status = statusFatura(p.status, corpo.event === 'PAYMENT_DELETED' || p.deleted);
  const tipo = ref.startsWith('start:') ? 'start' : p.subscription || ref.startsWith('mensal:') ? 'mensalidade' : 'avulsa';
  const descricao = tipo === 'start' ? 'Start do projeto' : tipo === 'mensalidade' ? `Mensalidade ${p.dueDate.slice(5, 7)}/${p.dueDate.slice(0, 4)}` : p.description ?? 'Cobrança avulsa';
  const pago = status === 'pago';
  const { error } = await admin.from('faturas').upsert({
    loja_id: lojaId, tipo, descricao, valor: p.value, vencimento: p.dueDate, status, asaas_payment_id: p.id, ambiente,
    link_pagamento: p.invoiceUrl ?? null, forma_pagamento: p.billingType && p.billingType !== 'UNDEFINED' ? p.billingType : null,
    pago_em: pago ? new Date(`${p.clientPaymentDate ?? p.paymentDate ?? new Date().toISOString().slice(0, 10)}T12:00:00-03:00`).toISOString() : null,
  }, { onConflict: 'asaas_payment_id' });
  if (error) return NextResponse.json({ erro: 'falha ao registrar' }, { status: 500 });
  if (pago) await admin.rpc('reavaliar_bloqueio', { p_loja: lojaId });
  return NextResponse.json({ ok: true, ambiente });
}
