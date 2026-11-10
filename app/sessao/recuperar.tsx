'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const CHAVE = 'av-reconexao';

export function Recuperar({ destino }: { destino: string }) {
  useEffect(() => {
    (async () => {
      const sb = createClient();
      // Evita voltas sem fim: se já tentou há menos de 30 s e o servidor ainda não reconheceu, vai para o login
      let ultima = 0;
      try { ultima = Number(sessionStorage.getItem(CHAVE) ?? 0); sessionStorage.setItem(CHAVE, String(Date.now())); } catch { /* sem storage */ }
      if (Date.now() - ultima < 30_000) {
        try { sessionStorage.removeItem(CHAVE); } catch { /* sem storage */ }
        await sb.auth.signOut({ scope: 'local' }).catch(() => {});
        window.location.replace('/login?erro=sessao');
        return;
      }
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) {
        try {
          const { data } = await sb.auth.getSession();
          if (!data.session) break;
          const r = await sb.auth.refreshSession();
          ok = !r.error && !!r.data.session;
          if (r.error && r.error.status && r.error.status < 500) break; // sessão inválida de fato
        } catch { /* rede: tenta de novo */ }
        if (!ok) await new Promise((res) => setTimeout(res, 1500));
      }
      window.location.replace(ok ? destino : '/login?erro=sessao');
    })();
  }, [destino]);
  return null;
}
