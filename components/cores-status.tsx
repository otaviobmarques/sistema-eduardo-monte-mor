import { coresValidas, cssCoresStatus } from '@/lib/cores-status';
import type { createClient } from '@/lib/supabase/server';

/** Aplica as cores de status escolhidas pela Loja (vale para a Loja e para os clientes dela). */
export async function CoresStatus({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const { data } = await supabase.from('configuracoes').select('cores_status').limit(1).maybeSingle();
  return <style>{cssCoresStatus(coresValidas(data?.cores_status))}</style>;
}
