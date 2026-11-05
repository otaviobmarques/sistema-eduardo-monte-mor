import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { alertasDevidos, textoAlerta } from '@/lib/regras/alertas';
import { calcularSla, CONFIG_PADRAO, formatarDuracao, type SlaConfig } from '@/lib/regras/sla';
import { notificar } from '@/lib/notificar';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function autorizado(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const h = req.headers.get('authorization') ?? '';
  if (!segredo) return false;
  const a = Buffer.from(h); const b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Job de alertas de SLA (chamado a cada 5 min pelo pg_cron via pg_net, ou pela Vercel Cron). */
async function executar(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  const admin = createAdminClient();
  const agora = new Date();
  const [{ data: c }, { data: fer }, { data: oss, error }] = await Promise.all([
    admin.from('configuracoes').select('alerta1_horas, alerta2_horas_antes, contagem, horario_util').eq('id', 1).single(),
    admin.from('feriados').select('data'),
    admin.from('ordens_servico')
      .select('id, numero, placa, empresa_cliente_id, aberta_em, sla_horas, status, prazo_em, alerta1_enviado, alerta2_enviado, vencida_notificada, sla_pausas(inicio, fim)')
      .eq('status', 'a_vistoriar').limit(5000),
  ]);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const cfg: SlaConfig = c ? { ...c, horario_util: c.horario_util as SlaConfig['horario_util'], feriados: (fer ?? []).map((f) => f.data) } : CONFIG_PADRAO;

  let enviados = 0, prazosAjustados = 0;
  for (const os of oss ?? []) {
    const sla = calcularSla({ aberta_em: os.aberta_em, sla_horas: os.sla_horas, status: os.status, pausas: os.sla_pausas ?? [] }, cfg, agora);
    const atualizacao: Record<string, unknown> = {};
    // Mantém prazo_em coerente (horas úteis ou pausas), útil para ordenação e para a trava de atraso
    if (sla.prazo && Math.abs(sla.prazo.getTime() - new Date(os.prazo_em).getTime()) > 60_000) {
      atualizacao.prazo_em = sla.prazo.toISOString(); prazosAjustados++;
    }
    const { enviar, marcar } = alertasDevidos(sla, os, cfg);
    Object.assign(atualizacao, marcar);
    if (Object.keys(atualizacao).length) {
      // Condição nas flags evita envio duplicado se duas execuções se sobrepuserem
      let q = admin.from('ordens_servico').update(atualizacao).eq('id', os.id);
      for (const k of Object.keys(marcar)) q = q.eq(k, false);
      const { data: alterou } = await q.select('id');
      if (enviar && alterou?.length) {
        const t = textoAlerta(enviar, os.placa, os.numero, cfg, formatarDuracao(Math.max(0, sla.restanteMs)));
        await notificar({ destinos: ['loja', 'cliente'], empresaId: os.empresa_cliente_id, tipo: enviar, osId: os.id, osNumero: os.numero, ...t });
        enviados++;
      }
    }
  }
  return NextResponse.json({ ok: true, verificadas: oss?.length ?? 0, alertas: enviados, prazosAjustados, em: agora.toISOString() });
}

export const GET = executar;
export const POST = executar;
