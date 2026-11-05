import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLICAS = ['/login', '/api/cron', '/api/push/enviar', '/api/asaas/webhook', '/api/saude', '/manifest.webmanifest', '/sw.js'];

export async function middleware(request: NextRequest) {
  // Caminho pedido, para os layouts do servidor (ex.: Loja bloqueada só acessa /loja/assinatura)
  request.headers.set('x-caminho', request.nextUrl.pathname);
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
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && !PUBLICAS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|brand/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
