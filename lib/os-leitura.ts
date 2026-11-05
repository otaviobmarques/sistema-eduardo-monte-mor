import 'server-only';
import { calcularSla, CONFIG_PADRAO, type SlaConfig, type SlaResultado } from './regras/sla';
import type { createClient } from './supabase/server';

type Sb = Awaited<ReturnType<typeof createClient>>;

export async function carregarConfigSla(supabase: Sb): Promise<SlaConfig> {
  const [{ data: c }, { data: f }] = await Promise.all([
    supabase.from('configuracoes').select('alerta1_horas, alerta2_horas_antes, contagem, horario_util').limit(1).maybeSingle(),
    supabase.from('feriados').select('data'),
  ]);
  if (!c) return CONFIG_PADRAO;
  return { ...c, horario_util: c.horario_util as SlaConfig['horario_util'], feriados: (f ?? []).map((x) => x.data) };
}

export function intervaloMs(iv: string | null | undefined): number {
  if (!iv) return 0;
  // Postgres interval: "HH:MM:SS(.ms)" ou "N days HH:MM:SS"
  const dias = Number(iv.match(/(-?\d+) days?/)?.[1] ?? 0);
  const t = iv.match(/(-?\d+):(\d+):(\d+(?:\.\d+)?)/);
  const h = t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : 0;
  return (dias * 86400 + h) * 1000;
}

export interface OsSlaCampos {
  aberta_em: string; sla_horas: number; status: 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado';
  pausado_desde: string | null; total_pausado: string | null; concluida_em: string | null; cancelada_em: string | null;
}

export function slaDaOs(os: OsSlaCampos, cfg: SlaConfig, pausas?: { inicio: string; fim: string | null }[], agora = new Date()): SlaResultado {
  return calcularSla({
    aberta_em: os.aberta_em, sla_horas: os.sla_horas, status: os.status,
    ...(pausas ? { pausas } : { total_pausado_ms: intervaloMs(os.total_pausado), pausado_desde: os.pausado_desde }),
    concluida_em: os.concluida_em, cancelada_em: os.cancelada_em,
  }, cfg, agora);
}
