import { NextResponse } from 'next/server';
import { gerarXlsx } from '@/lib/planilha';
import { createClient } from '@/lib/supabase/server';

export async function GET(_: Request, { params }: { params: Promise<{ lote: string }> }) {
  const { lote } = await params;
  const supabase = await createClient(); // RLS limita ao lote do próprio cliente
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  const { data: l } = await supabase.from('lotes_importacao').select('id, arquivo_nome').eq('id', lote).maybeSingle();
  if (!l) return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });
  const { data: linhas } = await supabase.from('lote_linhas').select('linha, dados_originais, resultado, mensagens').eq('lote_id', lote).neq('resultado', 'ok').order('linha');
  const buf = await gerarXlsx([{
    nome: 'Linhas com erro',
    colunas: [{ titulo: 'LINHA', largura: 8 }, { titulo: 'PLACA', largura: 12 }, { titulo: 'MODELO', largura: 36 }, { titulo: 'RENAVAM', largura: 14 }, { titulo: 'PÁTIO', largura: 24 }, { titulo: 'SERVIÇO', largura: 20 }, { titulo: 'OBS', largura: 30 }, { titulo: 'SITUAÇÃO', largura: 14 }, { titulo: 'O QUE CORRIGIR', largura: 70 }],
    linhas: (linhas ?? []).map((x) => {
      const d = x.dados_originais as Record<string, string>;
      return [x.linha, d.placa ?? '', d.modelo ?? '', d.renavam ?? '', d.patio ?? '', d.servico ?? '', d.obs ?? '', x.resultado === 'erro' ? 'Com erro' : 'Já com OS', (x.mensagens ?? []).join(' ')];
    }),
  }]);
  const nome = (l.arquivo_nome ?? 'lote').replace(/\.(xlsx|csv)$/i, '');
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(nome)}-linhas-com-erro.xlsx"`,
    },
  });
}
