import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { alertasDevidos, textoAlerta } from '@/lib/regras/alertas';
import { calcularSla, CONFIG_PADRAO, formatarDuracao, type SlaConfig } from '@/lib/regras/sla';
import { notificar } from '@/lib/notificar';
import { enviarPush, type Notif } from '@/lib/push';
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
  const [{ data: cs }, { data: fer }, { data: oss, error }] = await Promise.all([
    admin.from('configuracoes').select('loja_id, alerta1_horas, alerta2_horas_antes, contagem, horario_util, escalonar_minutos'),
    admin.from('feriados').select('loja_id, data'),
    admin.from('ordens_servico')
      .select('id, numero, placa, loja_id, empresa_cliente_id, aberta_em, sla_horas, status, prazo_em, alerta1_enviado, alerta2_enviado, vencida_notificada, sla_pausas(inicio, fim), lojas!inner(ativo, bloqueada)')
      .eq('status', 'a_vistoriar').eq('lojas.ativo', true).eq('lojas.bloqueada', false).limit(5000),
  ]);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  // Configuração de SLA de cada Loja
  const porLoja = new Map<string, SlaConfig>();
  for (const c of cs ?? []) {
    porLoja.set(c.loja_id, { ...c, horario_util: c.horario_util as SlaConfig['horario_util'], feriados: (fer ?? []).filter((f) => f.loja_id === c.loja_id).map((f) => f.data) });
  }

  let enviados = 0, prazosAjustados = 0;
  for (const os of oss ?? []) {
    const cfg = porLoja.get(os.loja_id) ?? CONFIG_PADRAO;
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
        await notificar({ destinos: ['loja', 'cliente'], lojaId: os.loja_id, empresaId: os.empresa_cliente_id, tipo: enviar, osId: os.id, osNumero: os.numero, ...t });
        enviados++;
      }
    }
  }
  // Escalonamento (seção 6): OS ou lote sem ninguém abrir em escalonar_minutos → push reforçado, uma vez
  let reforcos = 0;
  const minutos = new Map((cs ?? []).map((c) => [c.loja_id, c.escalonar_minutos ?? 30]));
  const menor = Math.min(...[...minutos.values(), 30]);
  const { data: pendentes } = await admin.from('notificacoes')
    .select('id, destino, loja_id, empresa_cliente_id, tipo, titulo, corpo, link, criada_em')
    .eq('destino', 'loja').in('tipo', ['nova_os', 'novo_lote']).is('vista_em', null).eq('push_reforco_enviado', false)
    .lt('criada_em', new Date(agora.getTime() - menor * 60_000).toISOString()).limit(200);
  for (const n of pendentes ?? []) {
    const limite = (minutos.get(n.loja_id) ?? 30) * 60_000;
    if (agora.getTime() - new Date(n.criada_em).getTime() < limite) continue;
    const { data: marcou } = await admin.from('notificacoes').update({ push_reforco_enviado: true }).eq('id', n.id).eq('push_reforco_enviado', false).select('id');
    if (marcou?.length) { await enviarPush(n as Notif, true); reforcos++; }
  }
  return NextResponse.json({ ok: true, verificadas: oss?.length ?? 0, alertas: enviados, prazosAjustados, reforcos, em: agora.toISOString() });
}

export const GET = executar;
export const POST = executar;
