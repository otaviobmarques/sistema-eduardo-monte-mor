import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Logotipo do cliente. A RLS de empresas_clientes decide quem vê: a Loja dele, o próprio cliente e o administrador. */
export async function GET(_req: Request, { params }: { params: Promise<{ empresa: string }> }) {
  const { empresa } = await params;
  if (!/^[0-9a-f-]{36}$/.test(empresa)) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data: e } = await supabase.from('empresas_clientes').select('logo_path').eq('id', empresa).maybeSingle();
  if (!e?.logo_path) return new NextResponse(null, { status: 404 });
  const { data: arq } = await createAdminClient().storage.from('logos').download(e.logo_path);
  if (!arq) return new NextResponse(null, { status: 404 });
  return new NextResponse(arq, {
    headers: {
      'Content-Type': arq.type || 'image/png',
      'Cache-Control': 'private, max-age=86400', // a URL leva ?v=<atualização>, então trocar o logo muda o endereço
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
