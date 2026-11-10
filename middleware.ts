import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLICAS = ['/login', '/sessao', '/api/cron', '/api/push/enviar', '/api/asaas/webhook', '/api/saude', '/manifest.webmanifest', '/sw.js'];

export async function middleware(request: NextRequest) {
  // Caminho pedido, para os layouts do servidor (ex.: Loja bloqueada só acessa /loja/assinatura)
  request.headers.set('x-caminho', request.nextUrl.pathname);
  request.headers.set('x-url', request.nextUrl.pathname + request.nextUrl.search);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // Falha passageira (rede/servidor do Auth) não derruba a sessão: só manda para o login quando não há sessão válida
  const passageira = !!error && error.name !== 'AuthSessionMissingError' && (!('status' in error) || !error.status || (error.status as number) >= 500);
  if (!user && !passageira && !PUBLICAS.some((p) => path.startsWith(p))) {
    // O navegador ainda guarda a sessão (cookie do Supabase)? Então não desloga: a página /sessao renova pelo navegador
    // e volta para onde a pessoa estava. Só vai para o login quando não há sessão nenhuma.
    const nomes = request.cookies.getAll().filter((c) => c.name.includes('-auth-token') && c.value).map((c) => c.name);
    const recuperar = nomes.length > 0 && !path.startsWith('/api/');
    console.log(JSON.stringify({ diag: 'sem-sessao', onde: 'middleware', path, recuperar, cookies: nomes, erro: error?.code ?? error?.name ?? null, ua: request.headers.get('user-agent')?.slice(0, 120) }));
    const url = request.nextUrl.clone();
    if (recuperar) {
      url.pathname = '/sessao';
      url.search = `?volta=${encodeURIComponent(path + request.nextUrl.search)}`;
    } else {
      url.pathname = '/login';
      url.search = '';
    }
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|brand/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
