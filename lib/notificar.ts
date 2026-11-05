import 'server-only';
import { createAdminClient } from './supabase/admin';

export type Destino = 'loja' | 'cliente';

export interface Notificacao {
  destinos: Destino[];
  empresaId: string;
  lojaId: string;
  tipo: string;
  titulo: string;
  corpo?: string;
  osId?: string;
  osNumero?: number;
  loteId?: string;
}

/**
 * Ponto único de envio de notificações (seção 6). Hoje grava em `notificacoes`
 * (o Realtime entrega na tela); canais novos (Web Push, WhatsApp, e-mail) entram aqui.
 */
export async function notificar(n: Notificacao) {
  const admin = createAdminClient();
  const linhas = n.destinos.map((d) => ({
    destino: d,
    loja_id: n.lojaId,
    empresa_cliente_id: n.empresaId,
    tipo: n.tipo,
    os_id: n.osId ?? null,
    lote_id: n.loteId ?? null,
    titulo: n.titulo,
    corpo: n.corpo ?? null,
    link: n.osNumero ? `${d === 'loja' ? '/loja' : '/app'}/os/${n.osNumero}` : null,
  }));
  const { error } = await admin.from('notificacoes').insert(linhas);
  if (error) console.error('notificar', error.message);
  return !error;
}
