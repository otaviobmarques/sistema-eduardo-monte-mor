import 'server-only';
import webpush from 'web-push';
import { createAdminClient } from './supabase/admin';

let configurado = false;
function configurar() {
  if (configurado) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contato@autovisao.com.br', pub, priv);
  configurado = true;
  return true;
}

export interface Notif {
  id: string; destino: 'loja' | 'cliente'; loja_id: string; empresa_cliente_id: string | null;
  tipo: string; titulo: string; corpo: string | null; link: string | null;
}

/** Envia Web Push para todos os aparelhos inscritos dos destinatários da notificação. */
export async function enviarPush(n: Notif, reforco = false): Promise<{ enviados: number; removidos: number }> {
  if (!configurar()) return { enviados: 0, removidos: 0 };
  const admin = createAdminClient();
  let q = admin.from('perfis_usuario').select('user_id').eq('bloqueado', false).eq('loja_id', n.loja_id).eq('perfil', n.destino);
  if (n.destino === 'cliente') q = q.eq('empresa_cliente_id', n.empresa_cliente_id ?? '00000000-0000-0000-0000-000000000000');
  const { data: pessoas } = await q;
  const ids = (pessoas ?? []).map((p) => p.user_id);
  if (!ids.length) return { enviados: 0, removidos: 0 };
  const { data: subs } = await admin.from('push_inscricoes').select('id, endpoint, p256dh, auth').in('user_id', ids);
  const payload = JSON.stringify({
    titulo: reforco ? `⚠ Ainda sem atendimento · ${n.titulo}` : n.titulo,
    corpo: reforco ? `Ninguém abriu este aviso ainda. ${n.corpo ?? ''}`.trim() : n.corpo ?? '',
    link: n.link ?? (n.destino === 'loja' ? '/loja' : '/app'),
    tag: `${n.tipo}-${n.id}`, urgente: reforco || n.tipo === 'nova_os' || n.tipo === 'novo_lote' || n.tipo === 'vencida',
  });
  let enviados = 0; const mortos: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' });
      enviados++;
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode;
      if (st === 404 || st === 410) mortos.push(s.id); // inscrição expirada: remove
    }
  }));
  if (mortos.length) await admin.from('push_inscricoes').delete().in('id', mortos);
  return { enviados, removidos: mortos.length };
}
