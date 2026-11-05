import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Saúde do sistema para monitoramento externo (UptimeRobot, Better Stack…). Não expõe dados. */
export async function GET() {
  const t0 = Date.now();
  let banco = false;
  try {
    const { error } = await createAdminClient().from('categorias_veiculo').select('id', { head: true, count: 'exact' });
    banco = !error;
  } catch { banco = false; }
  return NextResponse.json(
    { ok: banco, banco: banco ? 'ok' : 'falhou', versao: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7), ms: Date.now() - t0, em: new Date().toISOString() },
    { status: banco ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
