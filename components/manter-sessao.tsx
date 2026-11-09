'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Mantém a sessão aberta enquanto o sistema estiver aberto: renova o acesso a cada poucos minutos e ao voltar
 * para a aba (navegadores congelam abas em segundo plano e o relógio de renovação para).
 */
export function ManterSessao() {
  useEffect(() => {
    const sb = createClient();
    const renovar = async () => {
      try {
        const { data } = await sb.auth.getSession();
        const expira = (data.session?.expires_at ?? 0) * 1000;
        if (data.session && expira - Date.now() < 10 * 60e3) await sb.auth.refreshSession();
      } catch { /* sem rede: tenta de novo na próxima volta */ }
    };
    const aoVoltar = () => { if (document.visibilityState === 'visible') void renovar(); };
    const t = setInterval(renovar, 4 * 60e3);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    window.addEventListener('online', aoVoltar);
    void renovar();
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); window.removeEventListener('focus', aoVoltar); window.removeEventListener('online', aoVoltar); };
  }, []);
  return null;
}
