import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { enviarPush, type Notif } from '@/lib/push';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function autorizado(req: NextRequest) {
  const s = process.env.CRON_SECRET; if (!s) return false;
  const a = Buffer.from(req.headers.get('authorization') ?? ''), b = Buffer.from(`Bearer ${s}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Chamado pelo gatilho do banco a cada notificação inserida. */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ erro: 'id' }, { status: 400 });
  const { data: n } = await createAdminClient().from('notificacoes').select('id, destino, loja_id, empresa_cliente_id, tipo, titulo, corpo, link').eq('id', id).maybeSingle();
  if (!n) return NextResponse.json({ ok: true, ignorado: true });
  return NextResponse.json({ ok: true, ...(await enviarPush(n as Notif)) });
}
