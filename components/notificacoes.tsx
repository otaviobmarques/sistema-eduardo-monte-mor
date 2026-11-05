'use client';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { marcarVistas, removerInscricaoPush, salvarInscricaoPush } from '@/app/notificacoes/actions';
import { createClient } from '@/lib/supabase/client';
import { dataHora } from '@/lib/formato';
import { Icone } from './icone';

export interface Notificacao { id: string; tipo: string; titulo: string; corpo: string | null; link: string | null; criada_em: string; os_id: string | null; lote_id: string | null; vista_em?: string | null }

/** Tipos que chamam a Loja com som até alguém abrir (seção 6). */
const ALERTA_LOJA = new Set(['nova_os', 'novo_lote']);
const URGENTE = new Set(['nova_os', 'novo_lote', 'vencida', 'frustrado', 'cancelado', 'pendencia_respondida', 'faltam_8h']);

interface Ctx { naoLidas: Notificacao[]; alertas: number; abrir: (n: Notificacao) => void; marcarTodas: () => void; push: EstadoPush; ativarPush: () => void; desativarPush: () => void }
type EstadoPush = 'indisponivel' | 'negado' | 'desligado' | 'ligado' | 'carregando';
const NotifCtx = createContext<Ctx | null>(null);
export const useNotificacoes = () => useContext(NotifCtx);

/* ───────── Som de alerta (Web Audio, sem arquivo) ───────── */
let audioCtx: AudioContext | null = null;
function tocar() {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t = audioCtx.currentTime;
    [[880, 0], [1175, 0.18], [880, 0.36]].forEach(([f, d]) => {
      const o = audioCtx!.createOscillator(), g = audioCtx!.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.connect(g).connect(audioCtx!.destination); o.start(t + d); o.stop(t + d + 0.17);
    });
  } catch { /* sem áudio */ }
}

function base64ParaUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificacoesProvider({ modo, iniciais, children }: { modo: 'loja' | 'cliente'; iniciais: Notificacao[]; children: React.ReactNode }) {
  const router = useRouter();
  const [lista, setLista] = useState<Notificacao[]>(iniciais);
  const [toasts, setToasts] = useState<Notificacao[]>([]);
  const [somAtivo, setSomAtivo] = useState(false);
  const [pedirSom, setPedirSom] = useState(false);
  const [push, setPush] = useState<EstadoPush>('carregando');
  const [pedirPush, setPedirPush] = useState(false);
  const refresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destino = modo === 'loja' ? 'loja' : 'cliente';

  const atualizarTela = useCallback(() => {
    if (refresh.current) clearTimeout(refresh.current);
    refresh.current = setTimeout(() => { if (document.visibilityState === 'visible') router.refresh(); }, 800);
  }, [router]);

  // Realtime: notificações e OS (RLS limita à própria Loja/empresa)
  useEffect(() => {
    const sb = createClient();
    let canal: ReturnType<typeof sb.channel> | null = null;
    let ativo = true;
    (async () => {
      // O Realtime precisa do JWT do usuário para a RLS liberar os eventos
      const { data } = await sb.auth.getSession();
      if (data.session) await sb.realtime.setAuth(data.session.access_token);
      if (!ativo) return;
      canal = sb.channel(`notif-${destino}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `destino=eq.${destino}` }, (p: { new: Record<string, unknown> }) => {
        const n = p.new as unknown as Notificacao;
        setLista((l) => (l.some((x) => x.id === n.id) ? l : [n, ...l]));
        setToasts((t) => [n, ...t].slice(0, 4));
        if (modo === 'loja' && ALERTA_LOJA.has(n.tipo)) tocarSeAtivo();
        atualizarTela();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificacoes', filter: `destino=eq.${destino}` }, (p: { new: Record<string, unknown> }) => {
        const n = p.new as unknown as Notificacao;
        if (n.vista_em) { setLista((l) => l.filter((x) => x.id !== n.id)); setToasts((t) => t.filter((x) => x.id !== n.id)); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, () => atualizarTela())
      .subscribe();
    })();
    return () => { ativo = false; if (canal) void sb.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino, modo]);

  // Som: preferência por sessão; o navegador exige um clique para liberar o áudio
  const somRef = useRef(false);
  const tocarSeAtivo = () => { if (somRef.current) tocar(); };
  useEffect(() => {
    if (modo !== 'loja') return;
    let pref: string | null = null;
    try { pref = sessionStorage.getItem('av-som'); } catch { /* */ }
    if (pref === '1') {
      const liberar = () => { somRef.current = true; setSomAtivo(true); tocar(); document.removeEventListener('pointerdown', liberar); };
      document.addEventListener('pointerdown', liberar, { once: true });
    } else if (pref !== '0') setPedirSom(true);
  }, [modo]);
  const alertas = useMemo(() => lista.filter((n) => modo === 'loja' && ALERTA_LOJA.has(n.tipo)).length, [lista, modo]);
  useEffect(() => {
    if (!somAtivo || alertas === 0) return;
    const t = setInterval(tocar, 20_000); // repete até alguém abrir
    return () => clearInterval(t);
  }, [somAtivo, alertas]);

  // Título da aba: “(2) Nova OS” piscando enquanto houver alerta
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\)\s.*?·\s/, '');
    if (!lista.length) { document.title = original; return; }
    const prefixo = `(${lista.length}) ${alertas ? (alertas === 1 ? 'Nova OS' : 'Novas OS') : 'Avisos'} · `;
    if (!alertas) { document.title = prefixo + original; return () => { document.title = original; }; }
    let liga = true;
    const t = setInterval(() => { document.title = liga ? prefixo + original : original; liga = !liga; }, 1200);
    return () => { clearInterval(t); document.title = original; };
  }, [lista.length, alertas]);

  // Web Push: registra o service worker e sincroniza a inscrição
  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) { setPush('indisponivel'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      if (Notification.permission === 'denied') { setPush('negado'); return; }
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') { await salvarInscricaoPush(sub.toJSON()); setPush('ligado'); return; }
      setPush('desligado');
      let perguntado: string | null = null;
      try { perguntado = localStorage.getItem('av-push-perguntado'); } catch { /* */ }
      if (!perguntado) setPedirPush(true);
    })().catch(() => setPush('indisponivel'));
  }, []);

  const ativarPush = useCallback(async () => {
    setPedirPush(false); try { localStorage.setItem('av-push-perguntado', '1'); } catch { /* */ }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPush(perm === 'denied' ? 'negado' : 'desligado'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaUint8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
      const r = await salvarInscricaoPush(sub.toJSON());
      setPush(r.ok ? 'ligado' : 'desligado');
    } catch { setPush('desligado'); }
  }, []);
  const desativarPush = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
    if (sub) { await removerInscricaoPush(sub.endpoint); await sub.unsubscribe(); }
    setPush('desligado');
  }, []);

  const abrir = useCallback((n: Notificacao) => {
    setLista((l) => l.filter((x) => x.id !== n.id)); setToasts((t) => t.filter((x) => x.id !== n.id));
    void marcarVistas({ ids: [n.id] });
    if (n.link) router.push(n.link);
  }, [router]);
  const marcarTodas = useCallback(() => { setLista([]); setToasts([]); void marcarVistas({ todas: true }); }, []);

  const ctx = useMemo(() => ({ naoLidas: lista, alertas, abrir, marcarTodas, push, ativarPush, desativarPush }), [lista, alertas, abrir, marcarTodas, push, ativarPush, desativarPush]);

  return (
    <NotifCtx.Provider value={ctx}>
      {children}
      {/* Avisos no canto */}
      <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 min-[900px]:bottom-6" aria-live="polite" aria-label="Avisos">
        {pedirSom && (
          <div className="pointer-events-auto rounded-card bg-impact p-4 text-white shadow-2xl">
            <p className="font-display text-base font-extrabold">Ativar alertas sonoros?</p>
            <p className="mt-1 text-sm text-white/80">Toca um som quando chegar OS ou lote, e repete a cada 20 s até alguém abrir.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primario btn-sm" onClick={() => { somRef.current = true; setSomAtivo(true); setPedirSom(false); tocar(); try { sessionStorage.setItem('av-som', '1'); } catch { /* */ } }}>
                <Icone nome="som" className="h-4 w-4" />Ativar alertas sonoros
              </button>
              <button type="button" className="btn btn-sm text-white hover:bg-white/10" onClick={() => { setPedirSom(false); try { sessionStorage.setItem('av-som', '0'); } catch { /* */ } }}>Agora não</button>
            </div>
          </div>
        )}
        {pedirPush && !pedirSom && push === 'desligado' && (
          <div className="pointer-events-auto rounded-card bg-impact p-4 text-white shadow-2xl">
            <p className="font-display text-base font-extrabold">Receber avisos neste aparelho?</p>
            <p className="mt-1 text-sm text-white/80">Notificações no navegador e no celular (com o app instalado), mesmo com o sistema fechado.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primario btn-sm" onClick={ativarPush}>Ativar notificações</button>
              <button type="button" className="btn btn-sm text-white hover:bg-white/10" onClick={() => { setPedirPush(false); try { localStorage.setItem('av-push-perguntado', '1'); } catch { /* */ } }}>Agora não</button>
            </div>
          </div>
        )}
        {toasts.map((n) => <Toast key={n.id} n={n} alerta={modo === 'loja' && ALERTA_LOJA.has(n.tipo)} onAbrir={() => abrir(n)} onFechar={() => setToasts((t) => t.filter((x) => x.id !== n.id))} />)}
      </div>
    </NotifCtx.Provider>
  );
}

function Toast({ n, alerta, onAbrir, onFechar }: { n: Notificacao; alerta: boolean; onAbrir: () => void; onFechar: () => void }) {
  useEffect(() => { if (alerta) return; const t = setTimeout(onFechar, 12_000); return () => clearTimeout(t); }, [alerta, onFechar]);
  return (
    <div role={alerta ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-card border-l-4 border-brand-red bg-impact p-4 text-white shadow-2xl motion-safe:animate-[entrar_240ms_ease-out]">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${URGENTE.has(n.tipo) ? 'bg-brand-red' : 'bg-white/60'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{n.titulo}</p>
        {n.corpo && <p className="mt-0.5 text-sm text-white/80">{n.corpo}</p>}
        {n.link && <button type="button" onClick={onAbrir} className="mt-2 text-sm font-semibold text-white underline underline-offset-2 hover:no-underline">{n.tipo === 'novo_lote' ? 'Ver lote' : 'Ver OS'}</button>}
      </div>
      <button type="button" onClick={onFechar} className="-m-1 rounded p-1 text-white/70 hover:text-white" aria-label="Fechar aviso"><Icone nome="x" className="h-4 w-4" /></button>
    </div>
  );
}

/** Sino com as não lidas (no topo da tela). */
export function Sino() {
  const c = useNotificacoes();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  if (!c) return null;
  const n = c.naoLidas.length;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-haspopup="dialog"
        aria-label={n ? `Notificações: ${n} não lida${n === 1 ? '' : 's'}` : 'Notificações'}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-divider bg-white text-impact hover:bg-surface ${c.alertas ? 'motion-safe:animate-pulse' : ''}`}>
        <Icone nome="sino" className="h-5 w-5" />
        {n > 0 && <span className="absolute -right-1 -top-1 min-w-[22px] rounded-full bg-brand-red px-1.5 text-center text-xs font-bold leading-[22px] text-white">{n > 99 ? '99+' : n}</span>}
      </button>
      {aberto && (
        <div role="dialog" aria-label="Notificações" className="absolute right-0 top-12 z-40 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-card border border-divider bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <p className="font-display text-lg font-extrabold">Notificações</p>
            {n > 0 && <button type="button" className="btn btn-texto btn-sm -mr-2" onClick={c.marcarTodas}>Marcar todas como lidas</button>}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {n === 0 && <li className="px-4 py-8 text-center text-sm text-text-secondary">Nenhuma notificação nova.</li>}
            {c.naoLidas.slice(0, 30).map((x) => (
              <li key={x.id} className="border-b border-divider last:border-0">
                <button type="button" className="block w-full px-4 py-3 text-left hover:bg-surface" onClick={() => { setAberto(false); c.abrir(x); }}>
                  <span className="block text-sm font-semibold">{x.titulo}</span>
                  {x.corpo && <span className="mt-0.5 block text-sm text-text-secondary">{x.corpo}</span>}
                  <span className="legenda mt-1 block">{dataHora(x.criada_em)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-divider bg-surface px-4 py-3 text-sm">
            {c.push === 'ligado' && <p className="flex items-center justify-between gap-2"><span>● Avisos neste aparelho ativados</span><button type="button" className="btn btn-texto btn-sm" onClick={c.desativarPush}>Desativar</button></p>}
            {c.push === 'desligado' && <button type="button" className="btn btn-secundario btn-sm w-full" onClick={c.ativarPush}>Receber avisos neste aparelho</button>}
            {c.push === 'negado' && <p className="text-text-secondary">Notificações bloqueadas no navegador. Libere nas configurações do site para receber avisos.</p>}
            {c.push === 'indisponivel' && <p className="text-text-secondary">Este navegador não recebe notificações. No iPhone, instale o app na tela de início.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Marca como vistas as notificações de uma OS ou lote ao abrir a tela. */
export function MarcarVistas({ osId, loteId }: { osId?: string; loteId?: string }) {
  useEffect(() => { void marcarVistas(osId ? { osId } : { loteId }); }, [osId, loteId]);
  return null;
}

export function ContadorMenu({ tipo }: { tipo: 'alertas' | 'todas' }) {
  const c = useNotificacoes();
  const n = c ? (tipo === 'alertas' ? c.alertas : c.naoLidas.length) : 0;
  return n ? <span className="rounded-full bg-brand-red px-2 py-0.5 text-xs font-bold text-white" aria-label={`${n} nova${n === 1 ? '' : 's'}`}>{n}</span> : null;
}

