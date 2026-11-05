import { NextResponse, type NextRequest } from 'next/server';
import { fechamentoMensal } from '@/lib/financeiro';
import { data as fmtData, PAGAMENTO_LABEL } from '@/lib/formato';
import { gerarXlsx } from '@/lib/planilha';
import { mesReferencia, nomeDoMes, rotuloForma } from '@/lib/regras/financeiro';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

const REAIS = '"R$" #,##0.00';

/** Fechamento mensal em Excel: aba de placas e aba de resumo. A RLS limita à Loja ou à empresa do usuário. */
export async function GET(req: NextRequest) {
  const s = await getSessao();
  if (!s || s.perfil.deve_trocar_senha || (s.perfil.perfil !== 'loja' && s.perfil.perfil !== 'cliente')) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  const mes = mesReferencia(req.nextUrl.searchParams.get('mes'));
  const cliente = s.perfil.perfil === 'loja' ? req.nextUrl.searchParams.get('cliente') ?? undefined : undefined;
  const sb = await createClient();
  const { linhas, grupos, totais } = await fechamentoMensal(sb, mes, cliente);
  const loja = s.perfil.perfil === 'loja';

  const buf = await gerarXlsx([
    {
      nome: 'Placas',
      colunas: [
        { titulo: 'OS', largura: 8 }, { titulo: 'PLACA', largura: 11 }, { titulo: 'MODELO', largura: 34 }, ...(loja ? [{ titulo: 'CLIENTE', largura: 26 }] : []),
        { titulo: 'CONCLUÍDA EM', largura: 14 }, { titulo: 'VALOR', largura: 14, formato: REAIS }, { titulo: 'PAGAMENTO', largura: 12 },
        { titulo: 'FORMA', largura: 18 }, { titulo: 'DATA DO PAGAMENTO', largura: 18 }, { titulo: 'OBSERVAÇÃO', largura: 36 },
      ],
      linhas: linhas.map((l) => [
        l.numero, l.placa, l.marca_modelo ?? '', ...(loja ? [l.cliente] : []), fmtData(l.concluida_em), l.valor, PAGAMENTO_LABEL[l.pagamento_status],
        l.pagamento_status === 'pendente' ? '' : rotuloForma(l.pagamento_forma), l.pagamento_data ? fmtData(l.pagamento_data) : '', l.pagamento_obs ?? '',
      ]),
    },
    {
      nome: 'Resumo',
      colunas: [{ titulo: 'CLIENTE', largura: 30 }, { titulo: 'OS VISTORIADAS', largura: 16 }, { titulo: 'TOTAL', largura: 15, formato: REAIS }, { titulo: 'PAGO', largura: 15, formato: REAIS }, { titulo: 'FATURADO', largura: 15, formato: REAIS }, { titulo: 'PENDENTE', largura: 15, formato: REAIS }],
      linhas: [
        ...grupos.map((g) => [g.cliente, g.totais.qtd, g.totais.total, g.totais.pago, g.totais.faturado, g.totais.pendente]),
        ['TOTAL', totais.qtd, totais.total, totais.pago, totais.faturado, totais.pendente],
        [], [`Fechamento de ${nomeDoMes(mes)} · OS vistoriadas no mês (data do laudo) · gerado em ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())} · Sistema de OS – Auto Visão`],
      ],
    },
  ]);
  const sufixo = cliente && grupos[0] ? `-${grupos[0].cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}` : '';
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="fechamento-${mes}${sufixo}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
