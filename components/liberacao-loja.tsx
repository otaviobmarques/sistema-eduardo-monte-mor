'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Loja bloqueada na tela de Assinatura: quando uma fatura muda (pagamento confirmado pelo webhook), recarrega a tela.
 * Se a Loja foi liberada, os menus voltam na hora. Também confere a cada 30 s, caso o tempo real caia.
 */
export function RecarregarAoPagar({ lojaId }: { lojaId: string }) {
  const router = useRouter();
  useEffect(() => {
    const sb = createClient();
    let canal: ReturnType<typeof sb.channel> | null = null;
    let vivo = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) await sb.realtime.setAuth(data.session.access_token);
      if (!vivo) return;
      canal = sb.channel(`faturas-${lojaId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'faturas', filter: `loja_id=eq.${lojaId}` }, () => router.refresh())
        .subscribe();
    })();
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 30_000);
    return () => { vivo = false; clearInterval(t); if (canal) void sb.removeChannel(canal); };
  }, [lojaId, router]);
  return null;
}
