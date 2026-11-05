import { NextResponse } from 'next/server';
import { gerarXlsx } from '@/lib/planilha';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  const [{ data: patios }, { data: apelidos }, { data: servicos }] = await Promise.all([
    supabase.from('patios').select('id, nome, cidade, uf').eq('ativo', true).order('nome'),
    supabase.from('patio_apelidos').select('patio_id, apelido'),
    supabase.from('servicos').select('nome, padrao, sla_horas').eq('ativo', true).order('nome'),
  ]);
  const padrao = servicos?.find((s) => s.padrao)?.nome ?? 'Vistoria cautelar';
  const buf = await gerarXlsx([
    {
      nome: 'Placas',
      colunas: [{ titulo: 'PLACA', largura: 12 }, { titulo: 'MODELO', largura: 40 }, { titulo: 'RENAVAM', largura: 14 }, { titulo: 'PÁTIO', largura: 26 }, { titulo: 'SERVIÇO', largura: 22 }, { titulo: 'OBS', largura: 40 }],
      linhas: [['ABC1D23', 'FIAT ARGO DRIVE 1.0', '00639018807', patios?.[0]?.nome ?? 'Freitas Utinga', '', 'Apague esta linha de exemplo']],
    },
    {
      nome: 'Pátios aceitos',
      colunas: [{ titulo: 'PÁTIO', largura: 28 }, { titulo: 'CIDADE', largura: 22 }, { titulo: 'TAMBÉM ACEITO COMO', largura: 50 }],
      linhas: (patios ?? []).map((p) => [p.nome, [p.cidade, p.uf].filter(Boolean).join(' / '), (apelidos ?? []).filter((a) => a.patio_id === p.id).map((a) => a.apelido).join(', ')]),
    },
    {
      nome: 'Instruções',
      colunas: [{ titulo: 'COMO PREENCHER', largura: 100 }],
      linhas: [
        ['PLACA, MODELO, RENAVAM e PÁTIO em cada linha. SERVIÇO e OBS são opcionais.'],
        [`SERVIÇO em branco usa “${padrao}”. Serviços aceitos: ${(servicos ?? []).map((s) => s.nome).join(', ')}.`],
        ['A placa pode vir com hífen ou minúscula; o sistema corrige e mostra na prévia.'],
        ['Até 500 linhas por arquivo. Colunas extras e linhas vazias são ignoradas.'],
      ],
    },
  ]);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo-importacao-auto-visao.xlsx"',
    },
  });
}
